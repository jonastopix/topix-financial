/** Trend-M/M-dommen (kpi-design §b): måned-over-måned-ændring for en
    serie (seneste sidst) som REN funktion — porteret fra Reports' inline-
    beregning (1116-blokken), så dommen er testet frem for gen-inlinet.
    flat = |ændring| < 1 % (arvet grænse). */

export interface MoMChange {
  direction: "up" | "down" | "flat";
  pct: number | null;
}

export function deriveMoMChange(series: (number | null | undefined)[]): MoMChange {
  if (series.length < 2) return { direction: "flat", pct: null };
  const curr = series[series.length - 1];
  const prev = series[series.length - 2];
  if (curr == null || prev == null || prev === 0) return { direction: "flat", pct: null };
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 1) return { direction: "flat", pct };
  return { direction: pct > 0 ? "up" : "down", pct };
}
