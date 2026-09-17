/**
 * src/lib/hjemmebane/forsideHilsen.ts — linjen under hilsenen på medlemmets
 * forside (forside PR 2, 17/9-2026 — analyse §5.1: «hilsen + én linje der er
 * sand i dag»). REN dom, ingen React.
 *
 *   - Dag 1: «Du er inde. Her er de tre ting der giver mest den første uge.»
 *     DAG 1 = medlemskabets start inden for de seneste 14 døgn (dansk tid) —
 *     companies.contract_start_date, som forsiden allerede henter
 *     (contractStartQuery; stripe-webhook sætter den på betalingsdagen; null
 *     for legacy = ikke dag 1). FØR (PR 2, til 17/9 11:28) afledtes dag 1 af
 *     «tjeklisten ikke færdig» — forkert kriterium: Jonas (tal fra 2025,
 *     profilen mangler) fik dag 1-sætningen. Rettet i forside PR 3.
 *   - Ellers: «Torsdag 17. september» + « · 3 nye ting siden sidst» når
 *     der er nyt siden sidste besøg (countNewSince i pushSelection — flyttet
 *     OP fra båndet «Fra os til dig», hvor linjen stod 2–3 skærme nede).
 *     0 nye → kun dagen (tavshed, ikke «0 nye ting»).
 * Ugedag og dato i dansk tid (Europe/Copenhagen). Testet i
 * __tests__/forsideHilsen.test.ts.
 */

export const DAG1_LINJE = "Du er inde. Her er de tre ting der giver mest den første uge.";
export const TIDSZONE = "Europe/Copenhagen";

/** «Torsdag 17. september» — ugedag med stort, dato uden år. */
export function dagensTekst(nu: Date): string {
  const ugedag = new Intl.DateTimeFormat("da-DK", { weekday: "long", timeZone: TIDSZONE }).format(nu);
  const dag = new Intl.DateTimeFormat("da-DK", { day: "numeric", timeZone: TIDSZONE }).format(nu).replace(/\.$/, "");
  const maaned = new Intl.DateTimeFormat("da-DK", { month: "long", timeZone: TIDSZONE }).format(nu);
  return `${ugedag.charAt(0).toUpperCase()}${ugedag.slice(1)} ${dag}. ${maaned}`;
}

/** «3 nye ting siden sidst» / «1 ny ting siden sidst»; 0 → null. */
export function nyeTingTekst(antal: number): string | null {
  if (!Number.isFinite(antal) || antal <= 0) return null;
  return antal === 1 ? "1 ny ting siden sidst" : `${antal} nye ting siden sidst`;
}

export function hilsenLinje({ nu, nyeTing, dag1 }: { nu: Date; nyeTing: number; dag1: boolean }): string {
  if (dag1) return DAG1_LINJE;
  const nyt = nyeTingTekst(nyeTing);
  return nyt ? `${dagensTekst(nu)} · ${nyt}` : dagensTekst(nu);
}

/** Dag 1-vinduet i døgn: starten i dag til og med dag 14 er «den første uge»-tonen. */
export const DAG1_DOEGN = 14;

/** Kalenderdag i dansk tid som «YYYY-MM-DD» (samme greb som skridtForslag.dagsdatoDansk). */
function dagDansk(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIDSZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Hele kalenderdage mellem to «YYYY-MM-DD» (b − a). */
function dageMellem(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/** Dag 1: medlemskabets start (ISO-dato eller -tidsstempel) ligger 0–14 danske
    kalenderdage tilbage. Ingen start (legacy), ulæselig, eller i fremtiden → ikke dag 1. */
export function erDag1(startDato: string | null | undefined, nu: Date): boolean {
  if (!startDato) return false;
  const start = new Date(startDato);
  if (Number.isNaN(start.getTime())) return false;
  const dage = dageMellem(dagDansk(start), dagDansk(nu));
  return dage >= 0 && dage <= DAG1_DOEGN;
}
