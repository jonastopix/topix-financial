/**
 * supabase/functions/_shared/maal.ts — «Én plan pr. virksomhed», fase 1 (16/9-2026).
 *
 * REN motor for MÅL (milestones) og SKRIDT (company_actions): ingen imports,
 * ingen Deno. SPEJL af src/lib/hjemmebane/maal.ts — enhver ændring her SKAL
 * også laves der; pariteten låses af src/lib/__tests__/maalParitet.test.ts
 * (funktionerne OG kildeteksten efter filhovedet — maanedsnoegle-mønstret).
 *
 * Kaldes af opgave-luk (fremdriften når et skridt lukkes) og — i fase 5 —
 * af generate-weekly-focus og run-company-agent (vaelgMaalForForslag).
 * Reglerne bor HER og gentages ikke i functions.
 */

/** company_actions.status som motoren ser den — en streng fra rækken. */
export interface SkridtTilFremdrift {
  status: string;
}

/** Skridt der TÆLLER i fremdriften: dem medlemmet tog ejerskab af (accept →
    active) og deres slutninger. Forslag (proposed) og forslag der aldrig
    blev til skridt (dismissed, expired) tæller ikke — de var aldrig skridt. */
export const TAELLENDE_SKRIDT: readonly string[] = ["active", "done", "not_done", "dropped"];

/** Højst tre aktive mål pr. virksomhed (Jonas 16/9, beslutning 1). */
export const MAX_AKTIVE_MAAL = 3;

/**
 * Målets fremdrift som andel GJORTE skridt af de tællende:
 *   round(100 × done / (done + not_done + dropped + active)).
 * 100 kan kun nås når ingen aktive skridt er tilbage (de står i nævneren).
 * INGEN tællende skridt → fremdriften er UÆNDRET (nuvaerende): et mål uden
 * skridt beholder den fremdrift et menneske har sat (plan §1a). Resultatet
 * klippes til 0–100; et ulæseligt nuvaerende læses som 0.
 * Målets STATUS røres ikke her — «nået» er et menneskes eksplicitte valg
 * (fase 2), aldrig en beregning.
 * JONAS 16/9 (ordret) til 100 %-spørgsmålet: «A» — 100 % betyder at alle
 * skridt er gjort, og målet vises som færdigt; i fase 3 får fladen «Marker
 * som nået».
 * Motoren klipper altså IKKE til 99: alle skridt gjort = 100 = færdigt på
 * skærmen (afgoerMilepael dømmer faerdig ved progress >= 100).
 */
export function maalFremdrift(skridt: readonly SkridtTilFremdrift[], nuvaerende: number | null | undefined): number {
  const taellende = skridt.filter((s) => TAELLENDE_SKRIDT.includes(s.status));
  if (taellende.length === 0) {
    const n = typeof nuvaerende === "number" && Number.isFinite(nuvaerende) ? nuvaerende : 0;
    return Math.min(100, Math.max(0, Math.round(n)));
  }
  const gjort = taellende.filter((s) => s.status === "done").length;
  return Math.min(100, Math.max(0, Math.round((100 * gjort) / taellende.length)));
}

/** Må der oprettes et mål mere, når `antalAktive` allerede er aktive? Kun
    under tre. Ulæselige eller negative tal dømmes fail-closed (nej). */
export function kanOpretteMaal(antalAktive: number): boolean {
  if (typeof antalAktive !== "number" || !Number.isFinite(antalAktive) || antalAktive < 0) return false;
  return antalAktive < MAX_AKTIVE_MAAL;
}

/** Venter virksomheden på en GENNEMGANG — flere aktive mål end de tre?
    (Prod 16/9: 8 virksomheder, 5–17 mål.) ÉN regel for Planen på
    virksomhedssiden, forsidens linje og AI-skriverne (Jonas 16/9, «Ja det
    er i orden»: ingen AI-forslag mens gennemgangen venter — rådgiveren
    skal først vælge de højst tre). Ulæseligt tal → nej (intet at gennemgå). */
export function gennemgangVenter(antalAktive: number): boolean {
  if (typeof antalAktive !== "number" || !Number.isFinite(antalAktive)) return false;
  return antalAktive > MAX_AKTIVE_MAAL;
}

/** Må AI'en foreslå et skridt mod virksomhedens mål? Kun når der ER aktive
    mål OG gennemgangen ikke venter. Dommen står her; hvilket mål vælges af
    vaelgMaalForForslag bagefter. */
export type ForslagsAdgang = { ok: true } | { ok: false; grund: "ingen_aktive_maal" } | { ok: false; grund: "gennemgang_foerst"; antal: number };
export function maaForeslaaMod(antalAktive: number): ForslagsAdgang {
  if (typeof antalAktive !== "number" || !Number.isFinite(antalAktive) || antalAktive <= 0) return { ok: false, grund: "ingen_aktive_maal" };
  if (gennemgangVenter(antalAktive)) return { ok: false, grund: "gennemgang_foerst", antal: antalAktive };
  return { ok: true };
}

/** Det af milestones-rækken forslagsvælgeren læser. */
export interface MaalTilValg {
  id: string;
  status: string;
  category: string | null;
  created_at: string;
}

/** Hvad skriveren ved om forslaget: et ønsket mål (fx fra en milepæls-
    trigger) og/eller en kategori (fx økonomi). Begge valgfri. */
export interface ForslagsOenske {
  maalId?: string | null;
  kategori?: string | null;
}

/**
 * Hvilket aktivt mål et forslag skal høre til (plan §2a punkt 2; kaldes
 * først i fase 5 — her kun formen og dommen):
 *   1. det ønskede mål, hvis det er aktivt;
 *   2. ellers det ÆLDSTE aktive mål med den ønskede kategori;
 *   3. ellers det ældste aktive mål;
 *   4. ingen aktive mål → null (ingen mål → intet forslag).
 * Kun status = active tæller; parkerede og nåede mål får aldrig skridt.
 * Ældst = laveste created_at (strengsammenligning på ISO-stempler).
 */
export function vaelgMaalForForslag(maal: readonly MaalTilValg[], oenske: ForslagsOenske = {}): string | null {
  const aktive = maal.filter((m) => m.status === "active").slice().sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  if (aktive.length === 0) return null;
  const oensket = (oenske.maalId ?? "").trim();
  if (oensket) {
    const ramt = aktive.find((m) => m.id === oensket);
    if (ramt) return ramt.id;
  }
  const kategori = (oenske.kategori ?? "").trim().toLowerCase();
  if (kategori) {
    const ramt = aktive.find((m) => (m.category ?? "").trim().toLowerCase() === kategori);
    if (ramt) return ramt.id;
  }
  return aktive[0].id;
}

