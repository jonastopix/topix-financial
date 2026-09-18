/**
 * fokusUdenScroll — sæt fokus på et felt UDEN at rulle siden.
 *
 * Jonas 18/9 (prøven, pkt. 1): ansøgningslinket åbnede midt på siden. Årsagen
 * var `autoFocus` på skærmens første felt: browseren ruller det fokuserede
 * element ind i syne i samme øjeblik det monteres — FØR React-routerens
 * ScrollToTop når at rulle op — og på en telefon står feltet et stykke nede.
 * Brug som ref-callback: `ref={fokusUdenScroll}` — kaldes én gang ved
 * montering (stabil identitet: modulniveau), aldrig ved gen-render.
 * Fokus bevares (tastaturet åbner som før); kun rulningen udgår.
 */
export function fokusUdenScroll(el: HTMLElement | null): void {
  el?.focus({ preventScroll: true });
}
