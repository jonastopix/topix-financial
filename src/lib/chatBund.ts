// «Hold bunden» for en chatliste (30/9-2026, rådets gennemsyn af #1188).
//
// Problemet: på virksomhedssiden vokser skrivefeltet ved fokus (lavIHvile:
// 40 → 76 px), og billeder i beskederne indlæses efter første tegning. Begge
// dele ændrer listens mål, uden at `messages` ændrer sig — så rulningen i
// CompanyChatPane løb ikke, og de nederste pixels af den nyeste besked
// forsvandt under skrivefeltet.
//
// Reglen: en størrelsesændring ruller til bunden, HVIS listen stod ved bunden
// (højst BUND_TAERSKEL_PX fra den) FØR ændringen. Den, der har rullet op for
// at læse, rives ikke ned. Målingen FØR er den seneste, vi kender (fra
// scroll-hændelsen eller forrige ændring) — ResizeObserver melder først,
// når layoutet allerede er ændret.
//
// Regnestykket: afstand til bunden = scrollHeight − scrollTop − clientHeight.
//   Eksempel: listen 600 px høj, indhold 1400 px, rullet til 800 → 0 (ved bunden).
//   Skrivefeltet vokser 36 px → listen 564 px: afstand 1400 − 800 − 564 = 36 > 0,
//   de sidste 36 px er skjult; FØR var afstanden 0 ≤ 40 → rul til bunden.
//   Rullet op til 500 FØR: afstand 1400 − 500 − 600 = 300 > 40 → stå stille.
//
// `null` som FØR betyder «ingen måling endnu» = listen åbnes (eller samtalen
// skiftes): da skal den nyeste besked stå synligt, så det tæller som bunden.

export const BUND_TAERSKEL_PX = 40;

export type ListeMaal = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export const afstandTilBund = (m: ListeMaal): number =>
  m.scrollHeight - m.scrollTop - m.clientHeight;

/** Skal listen rulles til bunden efter en størrelsesændring?
    Ja, når den stod ved bunden FØR (eller intet er målt endnu), og den ikke
    allerede står der EFTER (så vi ikke skriver scrollTop uden grund). */
export const skalHoldeBunden = (foer: ListeMaal | null, efter: ListeMaal): boolean => {
  const stodVedBunden = foer === null || afstandTilBund(foer) <= BUND_TAERSKEL_PX;
  return stodVedBunden && afstandTilBund(efter) > 0.5;
};

export const maalListe = (el: HTMLElement): ListeMaal => ({
  scrollTop: el.scrollTop,
  scrollHeight: el.scrollHeight,
  clientHeight: el.clientHeight,
});
