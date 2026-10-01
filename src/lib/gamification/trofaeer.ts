/**
 * src/lib/gamification/trofaeer.ts — trofæerne (1/10-2026). REN: ingen React,
 * ingen Supabase. Designet: docs/boardroom-score.md «Trofæer».
 *
 * HVAD ET TROFÆ ER: en MILEPÆL — opnået én gang, for altid. Det er ikke et
 * tal og ikke Boardroom Score (helbredstallet lige nu). Et trofæ kan ikke
 * tabes igen: dommen er «det tidligste tidspunkt, betingelsen var opfyldt».
 *
 * JONAS' REGLER (1/10):
 *   - Intet trofæ må give fordel til størrelse. Motoren læser ALDRIG et
 *     regnskabstal, et kronetal eller et antal medarbejdere — kun TIDSPUNKTER
 *     (godkendelser, oprettelser) og hvem der skrev hvad. Kildeværnet i
 *     __tests__/trofaeer.guard.test.ts fælder ordene for de tal i denne fil.
 *   - Ingen rangliste mellem virksomheder (docs/boardroom-score.md).
 *   - «Hjalp et andet medlem» tæller KUN et svar i en tråd, som et ANDET
 *     MEDLEM har startet — ikke en rådgivers (eller en tjenestekontos) tråd
 *     og ikke en tråd fra virksomhedens egne brugere.
 *
 * GENBRUG: «til tiden» er streak-motorens dom (erGodkendtTilTiden,
 * foersteTaellendeMaaned, naesteMaaned i lib/boardroomScore/streak.ts) —
 * trofæet regner ikke selv en frist.
 *
 * IKKE MED: «deltog i en live session» — platformen har tilmeldinger
 * (event_registrations), men intet fremmøde for medlemmernes events.
 * En tilmelding er ikke en deltagelse; trofæet bygges, når fremmøde findes.
 */
import { erGodkendtTilTiden, erMaalt, foersteTaellendeMaaned, naesteMaaned } from "@/lib/boardroomScore/streak";
import type { ScoreMaaned } from "@/lib/boardroomScore/typer";

export type TrofaeId =
  | "foerste_maaned"
  | "tre_til_tiden"
  | "seks_til_tiden"
  | "foerste_maal"
  | "foerste_budget"
  | "foerste_refleksion"
  | "foerste_opslag"
  | "hjalp_et_medlem";

export interface TrofaeDefinition {
  id: TrofaeId;
  titel: string;
  /** «Sådan får du den» — vises dæmpet, til trofæet er opnået. */
  saadan: string;
}

/** Rækkefølgen er visningens. */
export const TROFAEER: readonly TrofaeDefinition[] = [
  { id: "foerste_maaned", titel: "Første måned på plads", saadan: "Godkend dine tal for en måned." },
  { id: "tre_til_tiden", titel: "Tre måneder i træk", saadan: "Godkend tre måneder i træk inden fristen." },
  { id: "seks_til_tiden", titel: "Et halvt år i træk", saadan: "Godkend seks måneder i træk inden fristen." },
  { id: "foerste_maal", titel: "Første mål nået", saadan: "Markér et af dine mål som nået." },
  { id: "foerste_budget", titel: "Budgettet er lagt", saadan: "Læg dit første budget." },
  { id: "foerste_refleksion", titel: "Første refleksion", saadan: "Skriv din månedlige refleksion." },
  { id: "foerste_opslag", titel: "Første opslag", saadan: "Start en tråd i community." },
  { id: "hjalp_et_medlem", titel: "Hjalp et andet medlem", saadan: "Svar på en tråd, et andet medlem har startet i community." },
];

export interface TrofaeGrundlag {
  /** Samme måneder som Boardroom Score (financial_report_facts + hukommelsen). */
  maaneder: readonly ScoreMaaned[];
  kontraktStart: string | null;
  /** milestones: status + completed_at. Kun status 'completed' med tidspunkt tæller. */
  maal: readonly { status: string | null; completed_at: string | null }[];
  /** created_at for budget_targets-rækker i et base-scenarie («YYYY-base-idx»). */
  budgetOprettet: readonly string[];
  /** created_at for pulse_checkins. */
  refleksioner: readonly string[];
  /** Virksomhedens egne community-tråde (forfatter ∈ virksomhedens brugere). */
  opslag: readonly { created_at: string }[];
  /** Virksomhedens brugeres svar, med forfatteren til den tråd, der blev svaret i. */
  svar: readonly { created_at: string; traadForfatterId: string | null }[];
  /** Virksomhedens egne brugere (company_members.user_id). */
  egneBrugere: ReadonlySet<string>;
  /** Rådgivere OG tjenestekonti — deres tråde er ikke et medlems. */
  raadgivere: ReadonlySet<string>;
}

export interface TrofaeDom extends TrofaeDefinition {
  /** ISO-tidspunkt for, hvornår trofæet blev opnået; null = ikke endnu. */
  opnaaetAt: string | null;
}

function tidligste(vaerdier: readonly (string | null | undefined)[]): string | null {
  let bedst: string | null = null;
  let bedstMs = Infinity;
  for (const v of vaerdier) {
    if (!v) continue;
    const ms = Date.parse(v);
    if (!Number.isFinite(ms)) continue;
    if (ms < bedstMs) {
      bedstMs = ms;
      bedst = v;
    }
  }
  return bedst;
}

/**
 * Første gang en ubrudt kæde af rettidige måneder nåede `laengde`.
 * Kæden: målte, tællende måneder (≥ foersteTaellendeMaaned) i kalenderrækkefølge,
 * hver godkendt til tiden (streak-motorens dom). Tidspunktet = den første
 * godkendelse af den måned, der fuldendte kæden — øjeblikket, milepælen blev nået.
 */
export function kaedeNaaet(maaneder: readonly ScoreMaaned[], kontraktStart: string | null, laengde: number): string | null {
  const foerste = foersteTaellendeMaaned(kontraktStart, maaneder);
  const maalte = maaneder.filter(erMaalt).filter((m) => foerste === null || m.key >= foerste);
  const sorteret = [...new Map(maalte.map((m) => [m.key, m])).values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  let loeb = 0;
  let forrige: string | null = null;
  for (const m of sorteret) {
    const sammenhaengende = forrige !== null && naesteMaaned(forrige) === m.key;
    loeb = erGodkendtTilTiden(m) ? (sammenhaengende ? loeb + 1 : 1) : 0;
    forrige = m.key;
    if (loeb >= laengde) return m.foersteGodkendtAt;
  }
  return null;
}

/** «Hjalp et andet medlem»: tråden er startet af en kendt bruger, som hverken er virksomhedens egen eller en rådgiver/tjenestekonto. */
export function erHjaelpTilEtAndetMedlem(traadForfatterId: string | null, egneBrugere: ReadonlySet<string>, raadgivere: ReadonlySet<string>): boolean {
  if (!traadForfatterId) return false;
  if (egneBrugere.has(traadForfatterId)) return false;
  if (raadgivere.has(traadForfatterId)) return false;
  return true;
}

export function trofaeDom(g: TrofaeGrundlag): TrofaeDom[] {
  const opnaaet: Record<TrofaeId, string | null> = {
    foerste_maaned: tidligste(g.maaneder.filter(erMaalt).map((m) => m.foersteGodkendtAt)),
    tre_til_tiden: kaedeNaaet(g.maaneder, g.kontraktStart, 3),
    seks_til_tiden: kaedeNaaet(g.maaneder, g.kontraktStart, 6),
    foerste_maal: tidligste(g.maal.filter((m) => m.status === "completed").map((m) => m.completed_at)),
    foerste_budget: tidligste(g.budgetOprettet),
    foerste_refleksion: tidligste(g.refleksioner),
    foerste_opslag: tidligste(g.opslag.map((o) => o.created_at)),
    hjalp_et_medlem: tidligste(
      g.svar.filter((s) => erHjaelpTilEtAndetMedlem(s.traadForfatterId, g.egneBrugere, g.raadgivere)).map((s) => s.created_at),
    ),
  };
  return TROFAEER.map((t) => ({ ...t, opnaaetAt: opnaaet[t.id] }));
}

export function antalOpnaaet(dom: readonly TrofaeDom[]): number {
  return dom.filter((t) => t.opnaaetAt !== null).length;
}

/** Linjen, der skiller trofæerne fra scoren — står på kortet. */
export const TROFAE_FORKLARING =
  "Milepæle, du har nået — de bliver ved med at stå her. Din Boardroom Score ovenfor er dit helbredstal lige nu.";

/** «12. sep. 2026» i dansk tid. */
export function trofaeDato(iso: string): string {
  return new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Copenhagen" }).format(new Date(iso));
}
