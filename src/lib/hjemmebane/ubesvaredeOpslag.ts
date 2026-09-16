/**
 * src/lib/hjemmebane/ubesvaredeOpslag.ts
 *
 * «Ubesvarede opslag» — forsidekortet til rådgiverne (Jonas 16/9, valg B):
 * medlemmers opslag i Community fra de sidste 14 dage som ingen rådgiver
 * har svaret på, med et link til hvert. Kortet forsvinder af sig selv når
 * en af rådgiverne har svaret. Ren dom, ingen React, ingen Supabase —
 * testet i __tests__/ubesvaredeOpslag.test.ts; hentningen bor i
 * src/hooks/ubesvaredeOpslag.ts og fladen i RaadgiverForsideView.
 *
 * HVORFOR (recon-community-raadgiverne.md §4): «Siden sidst» samler fem
 * slags hændelser på company_id — community-tråde bærer forfatter_id og er
 * ikke med, og ingen RPC har «rådgiver har svaret». Ingen SQL-ændring:
 * rådgivere må læse alle tråde og svar direkte (RLS «Advisors can view all
 * threads/replies», 20260811140000:223-227, :272-276) og alle profiler
 * («Advisors can view all profiles», 20260223152943:45-47).
 *
 * DOMMEN — en tråd er med når ALLE fire holder:
 *   (a) status = 'aktiv' ('skjult'/'slettet' er moderation og soft-delete,
 *       20260811140000:75 — de vises ikke i feedet og skal ikke besvares);
 *   (b) oprettet inden for UBESVARET_VINDUE_MS (14 × 24 timer) før `nu`,
 *       inklusive præcis 14 døgn — «de sidste 14 dage»;
 *   (c) forfatteren er IKKE rådgiver (get_all_advisor_profiles; admin
 *       arver advisor) — vores egne opslag venter ikke på os;
 *   (d) intet AKTIVT svar fra en rådgiver. Et medlems svar gør den ikke
 *       besvaret; et skjult/slettet rådgiversvar tæller ikke.
 * Præsentationer (kilde_type 'praesentation') er med som alle andre —
 * kortet mærker dem «Præsentation», så en rådgiver kan byde velkommen.
 * Nyeste først. `ialt` er hele antallet; kortet viser højst KORT_LOFT.
 */

export const UBESVARET_DAGE = 14;
export const UBESVARET_VINDUE_MS = UBESVARET_DAGE * 24 * 60 * 60 * 1000;
export const KORT_LOFT = 5;
export const KORT_OVERSKRIFT = "Ubesvarede opslag";
export const ALLE_BESVARET_TEKST = "Alle opslag fra de sidste 14 dage har fået svar fra en af jer.";
/** Samme fallback som klokken og opslagsmailen (opslagsMail.ts NAVN_FALLBACK). */
export const FORFATTER_FALLBACK = "Et medlem";

/** Det dommen læser af community_traade (+ forfatter_navn fra profiles, joinet af hentningen). */
export interface UbesvaretTraad {
  id: string;
  titel: string;
  forfatter_id: string;
  forfatter_navn: string | null;
  created_at: string;
  status: string;
  kilde_type: string | null;
}

/** Det dommen læser af community_svar. */
export interface UbesvaretSvar {
  traad_id: string;
  forfatter_id: string;
  status: string;
}

export interface UbesvaredeOpslagInput {
  traade: readonly UbesvaretTraad[];
  svar: readonly UbesvaretSvar[];
  raadgiverIds: Iterable<string>;
  nu: Date;
}

export interface UbesvaredeOpslag {
  /** Nyeste først. */
  liste: UbesvaretTraad[];
  ialt: number;
}

/** (b): inden for vinduet, inklusive præcis 14 døgn. Ulæselig dato → ikke med. */
export function erIVinduet(createdAt: string, nu: Date, vindueMs = UBESVARET_VINDUE_MS): boolean {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  const alder = nu.getTime() - t;
  return alder >= 0 ? alder <= vindueMs : true; // et stempel i fremtiden (urskævhed) er «nu»
}

export function ubesvaredeOpslag(input: UbesvaredeOpslagInput): UbesvaredeOpslag {
  const raadgivere = new Set(input.raadgiverIds);
  const besvaretAfRaadgiver = new Set<string>();
  for (const s of input.svar) {
    if (s.status === "aktiv" && raadgivere.has(s.forfatter_id)) besvaretAfRaadgiver.add(s.traad_id);
  }
  const liste = input.traade
    .filter((t) => t.status === "aktiv")
    .filter((t) => erIVinduet(t.created_at, input.nu))
    .filter((t) => !raadgivere.has(t.forfatter_id))
    .filter((t) => !besvaretAfRaadgiver.has(t.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { liste, ialt: liste.length };
}

/** Kortets udsnit: højst `loft` linjer og hvor mange der er ud over dem. */
export function kortUdsnit<T>(liste: readonly T[], loft = KORT_LOFT): { viste: T[]; flere: number } {
  return { viste: liste.slice(0, loft), flere: Math.max(0, liste.length - loft) };
}

/** «og 3 mere i fællesskabet» — linket til /community når der er flere end loftet. */
export function flereTekst(flere: number): string {
  return `og ${flere} mere i fællesskabet`;
}

export function forfatterVisning(navn: string | null | undefined): string {
  const n = (navn ?? "").trim();
  return n === "" ? FORFATTER_FALLBACK : n;
}

/** Hele kalenderdage på læserens dag — samme regel som sidenSidst.kalenderdageSiden. */
function kalenderdageSiden(iso: string, nu: Date): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** «i dag», «i går», «for N dage siden» — husets relative tid (CommunityView.relativTid), her med lille begyndelsesbogstav som kortets linje kræver. */
export function alderTekst(iso: string, nu: Date): string {
  const dage = kalenderdageSiden(iso, nu);
  if (dage === null || dage <= 0) return "i dag";
  if (dage === 1) return "i går";
  return `for ${dage} dage siden`;
}

/** «{forfatter} · {titel}» */
export function linjeTekst(t: Pick<UbesvaretTraad, "forfatter_navn" | "titel">): string {
  return `${forfatterVisning(t.forfatter_navn)} · ${t.titel.trim()}`;
}

export const traadSti = (id: string): string => `/community/${id}`;
