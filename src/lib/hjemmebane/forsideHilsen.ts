/**
 * src/lib/hjemmebane/forsideHilsen.ts — linjen under hilsenen på medlemmets
 * forside (forside PR 2, 17/9-2026 — analyse §5.1: «hilsen + én linje der er
 * sand i dag»). REN dom, ingen React.
 *
 *   - Dag 1 (tjeklisten ikke færdig): «Du er inde. Her er de tre ting der
 *     giver mest den første uge.»
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
