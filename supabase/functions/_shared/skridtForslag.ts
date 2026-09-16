/**
 * supabase/functions/_shared/skridtForslag.ts — «Én plan pr. virksomhed»,
 * fase 0a. Deno-spejl af src/lib/hjemmebane/skridtForslag.ts (sandheden bor
 * dér; edge functions kan ikke importere fra src/). Samme krop efter
 * filhovedet — enhver ændring her SKAL også laves i src-kopien; pariteten
 * låses af src/lib/__tests__/skridtForslagParitet.test.ts.
 *
 * Kaldes af generate-weekly-focus, run-company-agent (write_company_action)
 * og foreslaa-opgave — en ændret delt fil udrulles EKSPLICIT for alle tre
 * (CLAUDE.md/OVERLEVERING DEL 4: en ændret _shared-fil ruller ikke med merge).
 *
 * Nul imports, så filen kan læses af både Deno og Vitest.
 */
/** Vinduet for «samme forslag igen» — kortets regel (mangellisten, EPIC 4/9):
    «samme normaliserede titel inden for 30 dage = samme forslag». Gælder
    ALLE statusser — også dismissed og expired (Jonas 16/9: et afvist forslag
    kommer ikke igen). Fase 1 skærper det for dismissed inden for samme mål. */
export const GENTAGELSES_VINDUE_DAGE = 30;

/** Et forslag der venter på medlemmets svar — uanset expires_at. Et forslag
    der er udløbet men endnu ikke lukket af cronen kl. 04 (opgave-udloeb)
    står stadig som 'proposed' og tæller: «højst ét åbent forslag pr.
    virksomhed» (plan-en-plan §2a punkt 1). */
export const AABNE_STATUSSER: readonly string[] = ["proposed"];

/** Kolonnerne skriveren skal hente fra company_actions for virksomheden —
    ét sted, så de tre skrivere henter det samme. */
export const SKRIVE_SELECT_KOLONNER = "id, title, status, created_at";

export interface ForslagsRaekke {
  title: string;
  status: string;
  /** ISO-tidsstempel (company_actions.created_at). */
  created_at: string;
}

/** Titlens nøgle: små bogstaver, ét mellemrum mellem ord, ingen kanter,
    ingen afsluttende tegnsætning. Unicode-normaliseret (NFC), så «é» skrevet
    på to måder er den samme titel. */
export function normaliserTitel(titel: string): string {
  return titel
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s.!?…:;,]+$/u, "")
    .trim();
}

/** Grænsen for gentagelsesvinduet — det created_at en række mindst skal have
    for at tælle. Skriveren bruger den i sin SELECT. */
export function gentagelsesGraense(nu: Date): Date {
  return new Date(nu.getTime() - GENTAGELSES_VINDUE_DAGE * 24 * 60 * 60 * 1000);
}

export type GentagelsesDom =
  | { gentagelse: false }
  | { gentagelse: true; status: string; created_at: string };

/** Findes der en række med samme normaliserede titel oprettet inden for de
    seneste 30 døgn (uanset status)? Fail-closed: et ulæseligt eller
    fremtidigt created_at tæller som «inden for vinduet» — hellere ét forslag
    for lidt end en dublet. Den nyeste ramte række returneres. */
export function erGentagelse(nyTitel: string, eksisterende: readonly ForslagsRaekke[], nu: Date): GentagelsesDom {
  const noegle = normaliserTitel(nyTitel);
  if (noegle === "") return { gentagelse: false };
  const graense = gentagelsesGraense(nu).getTime();
  let ramt: ForslagsRaekke | null = null;
  let ramtTid = -Infinity;
  for (const r of eksisterende) {
    if (normaliserTitel(r.title) !== noegle) continue;
    const t = Date.parse(r.created_at);
    const iVinduet = Number.isNaN(t) || t >= graense;
    if (!iVinduet) continue;
    const tid = Number.isNaN(t) ? Infinity : t;
    if (tid >= ramtTid) { ramt = r; ramtTid = tid; }
  }
  return ramt ? { gentagelse: true, status: ramt.status, created_at: ramt.created_at } : { gentagelse: false };
}

/** Antal åbne forslag (proposed) i rækkerne — uanset expires_at. */
export function taelAabne(eksisterende: readonly ForslagsRaekke[]): number {
  return eksisterende.filter((r) => AABNE_STATUSSER.includes(r.status)).length;
}

/** Må der skrives et NYT forslag når `antalAabne` allerede venter? Kun ved
    nul — «seks ubesvarede plus seks nye er ikke et nudge» (Jonas 8/9), og
    fra 16/9: højst ét skridt ad gangen (Jonas' beslutning 3). Flyttet hertil
    fra ugensFokusGate.ts (fase 0a), så alle tre skrivere deler den. */
export function maaSkriveForslag(antalAabne: number): boolean {
  return antalAabne <= 0;
}

export type SkriveDom =
  | { ok: true }
  | { ok: false; grund: "forslag_venter"; antal: number }
  | { ok: false; grund: "gentagelse"; status: string; created_at: string };

/** Hvem skriver? JONAS 16/9, VALG A: rådgiverens egne forslag (foreslaa-
    opgave) spærres ALDRIG af et ventende forslag — kun af dubletkontrollen.
    AI'en (generate-weekly-focus, run-company-agent) stopper når der venter
    noget (Jonas' beslutning 3: højst ét skridt ad gangen). */
export type Skriver = "raadgiver" | "ai";

/** ÉN dom for alle tre skrivere, i denne rækkefølge: (1) for AI'en: venter
    der allerede et forslag hos virksomheden → skriv ikke (rådgiveren
    springer dette led over — valg A); (2) er titlen en gentagelse inden for
    30 døgn → skriv ikke, uanset skriver; ellers ok. `eksisterende` er
    virksomhedens company_actions hentet med SKRIVE_SELECT_KOLONNER og
    filteret «status = proposed ELLER created_at ≥ gentagelsesGraense(nu)». */
export function doemSkrivning(nyTitel: string, eksisterende: readonly ForslagsRaekke[], nu: Date, valg: { skriver: Skriver }): SkriveDom {
  if (valg.skriver === "ai") {
    const aabne = taelAabne(eksisterende);
    if (!maaSkriveForslag(aabne)) return { ok: false, grund: "forslag_venter", antal: aabne };
  }
  const g = erGentagelse(nyTitel, eksisterende, nu);
  if (g.gentagelse) return { ok: false, grund: "gentagelse", status: g.status, created_at: g.created_at };
  return { ok: true };
}

/** Filteret til skriverens SELECT (PostgREST .or-syntaks): åbne forslag
    uanset alder + alt oprettet inden for vinduet. */
export function skriveFilter(nu: Date): string {
  return `status.eq.proposed,created_at.gte.${gentagelsesGraense(nu).toISOString()}`;
}
