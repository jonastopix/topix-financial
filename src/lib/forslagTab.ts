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

/** Fase 0b («Én plan», plan §4 0b): rådgiveren skal kunne SE hvad der gik
    tabt — de seneste fem titler i en foldet liste under tallet. Resten
    siges som «og N mere»; null når alle er vist. */
export const UDLOEBNE_VISTE = 5;

export function udloebneRestTekst(antal: number, viste: number): string | null {
  const rest = antal - viste;
  if (rest <= 0) return null;
  return rest === 1 ? "og 1 mere" : `og ${rest} mere`;
}

/** Datoen som «udløb 12. sep.»; null uden stempel. Dansk, kort. */
export function udloebetDenTekst(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return null;
  return `udløb ${new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", timeZone: "Europe/Copenhagen" }).format(d)}`;
}
