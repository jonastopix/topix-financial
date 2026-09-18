/**
 * ansoegningsliste — dommene bag oversigten på /ansoegninger (Jonas 18/9,
 * tillæg 1–3): pipeline-striben med tal, «venter på os / vi venter på dem»
 * som den vigtigste sortering, første linje af udfordringen, søgning og
 * filter. Ren: rækker + nu ind, tal/rækkefølge/tekster ud. Folden (kun én
 * åben, ingen husket tilstand) er fladens — den bærer ingen dom.
 *
 * «VENTER PÅ OS» = ny eller afholdt (de to beslutninger), ikke på pause.
 * «VI VENTER PÅ DEM» = indkaldt, booket, aftalegrundlag_sendt (køen kører,
 * de skylder et svar), samt underskrevet (betalingen). På pause og lukket
 * venter ingen. Tiden regnes fra trin_sat_at — det er det øjeblik bolden
 * skiftede side.
 */
import type { Lukkeaarsag, Trin } from "@/lib/ansoegningTrin";
import { blevMedlem, danskDatoOrd, erPaaPause, gruppeFor, LISTEGRUPPER, type Listegruppe } from "./ansoegningVisning";

export interface RaekkeTilOversigt {
  trin: Trin;
  trin_sat_at: string;
  paa_pause_til: string | null;
  lukkeaarsag: Lukkeaarsag | null;
  lukket_at?: string | null;
  /** companies.contract_end_date gennem company_id — «blev medlem» (18/9 aften). */
  virksomhed_slutdato?: string | null;
}

export type VenterPaa = "os" | "dem" | "ingen";

export function venterPaa(a: RaekkeTilOversigt, nu: Date): VenterPaa {
  if (a.trin === "lukket" || blevMedlem(a) || erPaaPause(a.paa_pause_til, nu)) return "ingen";
  if (a.trin === "ny" || a.trin === "afholdt") return "os";
  return "dem";
}

/** Hele døgn siden et tidspunkt (aldrig negativt). */
export function dageSiden(iso: string, nu: Date): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((nu.getTime() - t) / 86_400_000));
}

const dageOrd = (d: number): string => (d === 0 ? "i dag" : d === 1 ? "1 dag" : `${d} dage`);

/** «venter på os · 5 dage» · «vi venter på dem · 3 dage» · «på pause til 10. december» · «lukket · 12 dage siden». */
export function tidTekst(a: RaekkeTilOversigt, nu: Date): string {
  const d = dageSiden(a.trin_sat_at, nu);
  if (a.trin === "lukket") return `lukket · ${dageOrd(dageSiden(a.lukket_at ?? a.trin_sat_at, nu))}${d === 0 ? "" : " siden"}`;
  // Betalt = færdig (18/9 aften): ikke «vi venter på dem» for evigt, men hvad de blev.
  if (blevMedlem(a)) return `blev medlem · medlemskab til ${danskDatoOrd(a.virksomhed_slutdato!.slice(0, 10))}`;
  if (erPaaPause(a.paa_pause_til, nu)) return `på pause til ${danskDatoOrd(a.paa_pause_til!)}`;
  if (a.trin === "underskrevet") return `venter på betaling · ${dageOrd(d)}`;
  const side = venterPaa(a, nu);
  return side === "os" ? `venter på os · ${dageOrd(d)}` : `vi venter på dem · ${dageOrd(d)}`;
}

/**
 * Rækkefølgen i en gruppe: den der har ventet længst på OS øverst (ældste
 * trin_sat_at først) — det er den vigtigste sortering. Hvor vi venter på
 * dem: også ældste først (den der har fået flest rykkere står øverst). På
 * pause: tidligste slutdato først. Lukkede: nyeste først.
 */
export function sorterGruppe<T extends RaekkeTilOversigt>(gruppe: Listegruppe, raekker: readonly T[]): T[] {
  const r = raekker.slice();
  if (gruppe === "lukket") return r.sort((a, b) => (b.lukket_at ?? b.trin_sat_at).localeCompare(a.lukket_at ?? a.trin_sat_at));
  if (gruppe === "blev_medlem") return r.sort((a, b) => b.trin_sat_at.localeCompare(a.trin_sat_at)); // nyeste medlem øverst
  if (gruppe === "paa_pause") return r.sort((a, b) => (a.paa_pause_til ?? "").localeCompare(b.paa_pause_til ?? ""));
  return r.sort((a, b) => a.trin_sat_at.localeCompare(b.trin_sat_at));
}

/** Striben: ét tal pr. gruppe i flowets rækkefølge — også 0, så hele pipelinen er synlig. */
export function stribeTal(raekker: readonly RaekkeTilOversigt[], nu: Date): Array<{ gruppe: Listegruppe; antal: number }> {
  return LISTEGRUPPER.map((gruppe) => ({ gruppe, antal: raekker.filter((r) => gruppeFor(r, nu) === gruppe).length }));
}

/** Stribens korte ord (flowets rækkefølge: ny · indkaldt · booket · afholdt · aftale sendt · underskrevet · på pause · lukket). */
export const STRIBE_ORD: Record<Listegruppe, string> = {
  ny: "ny",
  indkaldt: "indkaldt",
  booket: "booket",
  afholdt: "afholdt",
  aftalegrundlag_sendt: "aftale sendt",
  underskrevet: "underskrevet",
  paa_pause: "på pause",
  blev_medlem: "blev medlem",
  lukket: "lukket",
};
export const STRIBE_RAEKKEFOELGE: readonly Listegruppe[] = ["ny", "indkaldt", "booket", "afholdt", "aftalegrundlag_sendt", "underskrevet", "blev_medlem", "paa_pause", "lukket"];

/** Første linje af en fritekst, klippet — nok til at genkende dem, aldrig hele smøren. */
export function foersteLinje(tekst: string | null | undefined, maks = 90): string {
  const linje = (tekst ?? "").split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return linje.length <= maks ? linje : `${linje.slice(0, maks - 1).trimEnd()}…`;
}

export interface RaekkeTilSoegning {
  navn: string | null;
  email: string | null;
  cvr: string | null;
  cvr_opslag: Record<string, unknown> | null;
}

/** Som virksomhedslistens matcher: virksomhed (registret), person, mail, CVR. */
export function matcherSoegning(a: RaekkeTilSoegning, query: string): boolean {
  const q = query.trim().toLocaleLowerCase("da");
  if (!q) return true;
  const virksomhed = typeof a.cvr_opslag?.navn === "string" ? a.cvr_opslag.navn : "";
  return [virksomhed, a.navn ?? "", a.email ?? "", a.cvr ?? ""].some((f) => f.toLocaleLowerCase("da").includes(q));
}

/** Filter fra striben: null = alle. */
export function filtrer<T extends RaekkeTilOversigt & RaekkeTilSoegning>(raekker: readonly T[], nu: Date, gruppe: Listegruppe | null, query: string): T[] {
  return raekker.filter((r) => (gruppe === null || gruppeFor(r, nu) === gruppe) && matcherSoegning(r, query));
}
