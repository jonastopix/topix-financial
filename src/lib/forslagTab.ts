/**
 * src/lib/forslagTab.ts
 *
 * Teksten for forslag der udløb uden svar — det rådgiveren ikke kunne se
 * (målt 8/9: 63 forslag var gået tabt, og ingen flade læste `expired`;
 * opgaveEngine.opgoerTilstand havde tallet, men ingen kaldte den). Vises
 * som en data-linje i virksomhedssidens blok 1, ved siden af «N opgaver
 * venter på svar» — samme form, samme sted, billigste flade: én tælling i
 * useVirksomhed og én linje i VirksomhedView, ingen ny dom, intet nyt
 * input til forsidens motor.
 */
export function udloebneForslagTekst(antal: number): string | null {
  if (antal <= 0) return null;
  return antal === 1 ? "1 forslag udløb uden svar" : `${antal} forslag udløb uden svar`;
}
