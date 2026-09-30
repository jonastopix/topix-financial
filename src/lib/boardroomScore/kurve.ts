/**
 * src/lib/boardroomScore/kurve.ts — stykkevis lineær kurve gennem knæk,
 * mættet i begge ender (docs/boardroom-score.md §2).
 *
 * Hvorfor knæk og ikke en formel: hvert knæk er en påstand, man kan læse
 * («3 måneders runway er 150 point») og flytte. En sigmoid ville gemme
 * påstanden i en parameter. Mætning betyder, at et ekstremt tal (1.000 %
 * vækst, 200 måneders runway) aldrig giver mere end sidste knæk — én
 * outlier kan ikke vælte scoren.
 */

/** [x, point] i stigende x. */
export type Knaek = readonly (readonly [number, number])[];

/** Lineær interpolation mellem knækkene; under første/over sidste knæk = det knæks værdi. NaN/±∞ → første knæk (0). */
export function interpoler(knaek: Knaek, x: number): number {
  if (knaek.length === 0) return 0;
  if (!Number.isFinite(x)) return knaek[0][1];
  if (x <= knaek[0][0]) return knaek[0][1];
  const sidste = knaek[knaek.length - 1];
  if (x >= sidste[0]) return sidste[1];
  for (let i = 1; i < knaek.length; i++) {
    const [x0, y0] = knaek[i - 1];
    const [x1, y1] = knaek[i];
    if (x <= x1) {
      // y = y0 + (x − x0) / (x1 − x0) × (y1 − y0)
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return sidste[1];
}
