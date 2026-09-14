/**
 * Skalaen for en kreativ i en container — ren funktion, adskilt fra
 * SkaleretKreativ.tsx så komponentfilen kun eksporterer komponenter
 * (react-refresh) og testen kan låse tallene uden at rendere.
 *
 * "bredde": bredden alene. "boks": den mindste af bredde og højde — og er
 * en af dem 0 (ikke lagt ud endnu), er svaret 0. ALDRIG et tilbagefald på
 * bredden: det var 15:29-fejlen (14/9), hvor en container uden højde gav
 * skala 1 og en kreativ på 1080 px i fuldskærmen.
 */
export type SkalaTilpasning = "bredde" | "boks";

export function beregnSkala(tilpas: SkalaTilpasning, bredde: number, hoejde: number, cw: number, ch: number, maksSkala = 1): number {
  const sb = cw / bredde;
  const s = tilpas === "boks" ? Math.min(sb, ch / hoejde) : sb;
  if (!Number.isFinite(s) || s <= 0) return 0;
  return Math.min(maksSkala, s);
}
