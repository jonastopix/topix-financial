/**
 * cvrLoftBesked — klokken til rådgiverne, når CVR-opslaget i ansøgningsformularen
 * stopper (generalprøvens brist 6, 18/9). Før opdagede ingen det, før anbefalingerne
 * blev tynde: ansøgeren fik fallback-feltet og fortsatte, og rådgiveren så bare
 * «CVR ikke slået op» i grundlaget uden at vide, at loftet var årsagen.
 *
 * Ren tekstbygger (ingen Deno, ingen Supabase) — testet i src/lib/__tests__/cvrLoft.guard.test.ts.
 * Titlen bærer den danske dato, og skrivRaadgiverBesked dedup'er på titel (ingen
 * reference_id — kolonnen er uuid), så der kommer ÉN klokke pr. dag pr. grund.
 */
export type CvrLoftGrund = "dagsloft" | "datacvr";

export const TYPE_CVR_LOFT = "ansoegning_cvr_loft";

export interface CvrLoftBesked {
  type: typeof TYPE_CVR_LOFT;
  title: string;
  body: string;
  reference_type: "cvr_loft";
}

/** dato = dansk dato «YYYY-MM-DD»; loft = kodens/secret'ens dagsloft. */
export function cvrLoftBesked(grund: CvrLoftGrund, dato: string, loft: number): CvrLoftBesked {
  const hvad = grund === "dagsloft"
    ? `vores eget dagsloft (${loft} opslag) er nået`
    : "DataCVR har lukket for flere opslag i dag (grænsen på nøglen)";
  return {
    type: TYPE_CVR_LOFT,
    title: `CVR-opslag stoppet ${dato}: ${hvad}`,
    body: [
      "Ansøgere får feltet «Hvad hedder virksomheden?» og fortsætter uden opslag — anbefalingerne mangler branche, stiftelsesår og status resten af dagen.",
      grund === "dagsloft"
        ? `Tjek forbruget i DataCVR's dashboard. Passer planen, hæv secret'en ANSOEGNING_CVR_DAGSLOFT (i dag ${loft}); nøglen deles med berigelsen (20 pr. kørsel), importen og Monday.`
        : "Tjek forbruget og planen i DataCVR's dashboard (25 pr. dag på gratisplanen). Er grænsen pr. måned, er resten af måneden også lukket — overvej at opgradere.",
    ].join(" "),
    reference_type: "cvr_loft",
  };
}
