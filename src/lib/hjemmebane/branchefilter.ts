/**
 * src/lib/hjemmebane/branchefilter.ts
 *
 * Branchefiltret og sorteringen på /virksomheder — rene funktioner, ingen
 * React, ingen Supabase. Testet i __tests__/branchefilter.test.ts.
 *
 * FLYTTET FRA /members (Jonas 10/9): «det er listens funktionalitet, og
 * /virksomheder er listen nu». /members' eget filter (Members.tsx:893-896,
 * 1039-1041, 1202-1240) rører vi ikke — siden lever indtil den pensioneres.
 *
 * VÆRDIERNE bygges af de virksomheder der faktisk er på listen
 * (companies.industry_label), som /members gør det — IKKE af taksonomien i
 * lib/brancher.ts (17 grupper, 48 underkategorier) og ikke af DB25-registret
 * (lib/branchekode.ts). Taksonomien er kilden når branchen SÆTTES (Settings'
 * select skriver label + industry_code), men listen skal kun vise brancher
 * nogen har: en tom branche er et filter der giver nul, og industry_label
 * kan også være fritekst fra ansøgningen (import/Monday). Tælles med, så
 * rådgiveren ser «Detailhandel (4)» før valget.
 *
 * I URL'EN (?branche=), som ?grund= (#743) og ?puls= (#755) — afgjort 10/9,
 * selvom ingen linker dertil: (1) de tre filtre skal kunne kombineres —
 * «tavse virksomheder inden for detailhandel» er /virksomheder?grund=
 * tavshed&branche=Detailhandel, og det kan kun være ét sted; (2) et filter
 * i URL'en kan deles i Slack og overleve tilbage-knappen, et i lokal state
 * kan ikke; (3) ét mønster for alle tre, ikke to. Skrives med replace, så
 * hvert klik ikke bliver en historik-post. Værdien er selve labelen — den
 * har ingen anden nøgle på listen.
 *
 * SORTERINGEN: /members kan sortere på navn, seneste rapport (period_key
 * leksikalt) og antal rapporter («Status»). Den nye liste har andre
 * kolonner: Virksomhed, Kontaktperson, Medlemsstatus, Sidste kontakt,
 * Sidste rapportering. Sortering på KONTAKTPERSON og MEDLEMSSTATUS giver
 * ikke mening (navne på fremmede, fire badges); antal rapporter findes
 * ikke som kolonne. Bygget: navn, sidste kontakt (dage) og sidste
 * rapportering (period_key). Tomme værdier (ingen dialog, ingen
 * rapportering) står ALTID sidst, uanset retning — «ingen» er ikke «ældst».
 * Sorteringen er lokal state, ikke URL: den er et spørgsmål til skærmen,
 * ikke et udsnit man deler.
 */

export const BRANCHE_PARAM = "branche";
export const VIRKSOMHEDER_STI = "/virksomheder";

/** Branchen i URL'en; tom eller manglende → null (ingen filtrering). */
export function laesBrancheParam(vaerdi: string | null | undefined): string | null {
  const v = (vaerdi ?? "").trim();
  return v === "" ? null : v;
}

export interface BrancheTal {
  branche: string;
  antal: number;
}

/** De brancher der findes på rækkerne, med antal — alfabetisk (da). Tomme udelades. */
export function brancherAf(raekker: readonly { branche: string }[]): BrancheTal[] {
  const tal = new Map<string, number>();
  for (const r of raekker) {
    const b = (r.branche ?? "").trim();
    if (b === "") continue;
    tal.set(b, (tal.get(b) ?? 0) + 1);
  }
  return [...tal.entries()]
    .map(([branche, antal]) => ({ branche, antal }))
    .sort((a, b) => a.branche.localeCompare(b.branche, "da"));
}

/** Præcis match på labelen (trimmet). null → alle. */
export function filtrerPaaBranche<T extends { branche: string }>(raekker: readonly T[], branche: string | null): T[] {
  if (!branche) return [...raekker];
  const b = branche.trim();
  return raekker.filter((r) => (r.branche ?? "").trim() === b);
}

/** Listens sti med de filtre der er sat — grund, puls, branche i den rækkefølge. Ingen → "/virksomheder". */
export function listeSti(filtre: { grund?: string | null; puls?: string | null; branche?: string | null }): string {
  const p = new URLSearchParams();
  if (filtre.grund) p.set("grund", filtre.grund);
  if (filtre.puls) p.set("puls", filtre.puls);
  if (filtre.branche) p.set(BRANCHE_PARAM, filtre.branche);
  const q = p.toString();
  return q ? `${VIRKSOMHEDER_STI}?${q}` : VIRKSOMHEDER_STI;
}

/** «Detailhandel · 4 virksomheder» — headerens linje, som forsidens udsnit. */
export function brancheOverskrift(branche: string, vist: number): string {
  return `${branche} · ${vist} ${vist === 1 ? "virksomhed" : "virksomheder"}`;
}

/** Den tomme tilstand når branchen er valgt og intet matcher. */
export function tomBrancheTekst(branche: string, opts: { iUdsnit: boolean; soegning: string }): string {
  const q = opts.soegning.trim();
  if (q) return `Ingen virksomheder inden for ${branche} matcher "${q}"`;
  if (opts.iUdsnit) return `Ingen af forsidens virksomheder er inden for ${branche}`;
  return `Ingen virksomheder inden for ${branche}`;
}

// ── Sorteringen ───────────────────────────────────────────────────────────

export type SortNoegle = "navn" | "sidste_kontakt" | "sidste_rapportering";
export type SortRetning = "asc" | "desc";

export interface Sortering {
  id: string;
  label: string;
  noegle: SortNoegle;
  retning: SortRetning;
}

/** Valgene i rækkefølge; den første er standard (som listen altid har været). */
export const SORTERINGER: readonly Sortering[] = [
  { id: "navn", label: "Navn (A–Å)", noegle: "navn", retning: "asc" },
  { id: "kontakt_nyeste", label: "Sidste kontakt — nyeste først", noegle: "sidste_kontakt", retning: "asc" },
  { id: "kontakt_aeldste", label: "Sidste kontakt — længst siden først", noegle: "sidste_kontakt", retning: "desc" },
  { id: "rapport_nyeste", label: "Sidste rapportering — nyeste først", noegle: "sidste_rapportering", retning: "desc" },
  { id: "rapport_aeldste", label: "Sidste rapportering — ældste først", noegle: "sidste_rapportering", retning: "asc" },
];

export const STANDARD_SORTERING = SORTERINGER[0];

export function findSortering(id: string | null | undefined): Sortering {
  return SORTERINGER.find((s) => s.id === id) ?? STANDARD_SORTERING;
}

export interface SorterbarRaekke {
  navn: string;
  /** Hele dage siden sidste besked; null = ingen dialog. */
  sidsteKontaktDage: number | null;
  /** Seneste committede period_key ("YYYY-MM", sorterer leksikalt); null = ingen. */
  sidsteRapporteringKey: string | null;
}

/** Stabil sortering; tomme værdier altid sidst, og navn som sekundær nøgle. */
export function sorterRaekker<T extends SorterbarRaekke>(raekker: readonly T[], sortering: Sortering): T[] {
  const navn = (a: T, b: T) => a.navn.localeCompare(b.navn, "da");
  const tal = (a: number | string | null, b: number | string | null, retning: SortRetning): number => {
    if (a === null && b === null) return 0;
    if (a === null) return 1; // tom sidst, uanset retning
    if (b === null) return -1;
    const cmp = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
    return retning === "asc" ? cmp : -cmp;
  };
  return [...raekker].sort((a, b) => {
    let cmp = 0;
    if (sortering.noegle === "navn") cmp = sortering.retning === "asc" ? navn(a, b) : -navn(a, b);
    else if (sortering.noegle === "sidste_kontakt") cmp = tal(a.sidsteKontaktDage, b.sidsteKontaktDage, sortering.retning);
    else cmp = tal(a.sidsteRapporteringKey, b.sidsteRapporteringKey, sortering.retning);
    return cmp !== 0 ? cmp : navn(a, b);
  });
}
