/**
 * cvrLoftBesked — klokken til rådgiverne, når CVR-opslaget i ansøgningsformularen
 * stopper (generalprøvens brist 6, 18/9). Før opdagede ingen det, før anbefalingerne
 * blev tynde: ansøgeren fik fallback-feltet og fortsatte, og rådgiveren så bare
 * «CVR ikke slået op» i grundlaget uden at vide, at loftet var årsagen.
 *
 * Ren tekstbygger (ingen Deno, ingen Supabase) — testet i src/lib/__tests__/cvrLoft.guard.test.ts.
 * Titlen bærer den danske dato, og skrivRaadgiverBesked dedup'er på titel (ingen
 * reference_id — kolonnen er uuid), så der kommer ÉN klokke pr. dag pr. grund.
 *
 * ADVARSLEN FØR LOFTET (19/9, recon-boelgen-2 §3): de to oprindelige grunde kom
 * begge EFTER at opslagene var brugt op — det er ikke en advarsel, det er en
 * obduktion. «naermer_sig» er den tredje: den går ved 80 % af dagens loft, mens
 * der stadig er plads, så loftet kan hæves midt i en bølge. Den har sin egen
 * titel og dermed sin egen dedup — advarslen om morgenen spærrer ikke for
 * beskeden om at loftet faktisk blev ramt om aftenen.
 */
export type CvrLoftGrund = "dagsloft" | "datacvr" | "naermer_sig";

export const TYPE_CVR_LOFT = "ansoegning_cvr_loft";

export interface CvrLoftBesked {
  type: typeof TYPE_CVR_LOFT;
  title: string;
  body: string;
  reference_type: "cvr_loft";
}

/** Sådan hæves loftet — står ét sted, så advarslen og stop-beskeden siger det samme. */
export const HAEV_LOFTET =
  "Hæv det med én linje i Lovable → SQL editor: " +
  "update public.app_config set config_value = to_jsonb(40) where config_key = 'ansoegning_cvr_dagsloft'; " +
  "— den virker med det samme, uden en udrulning. Nøglen deles med berigelsen (20 pr. kørsel), importen og Monday, " +
  "så tjek forbruget i DataCVR's dashboard først.";

/**
 * dato = dansk dato «YYYY-MM-DD»; loft = dagens gældende loft (app_config,
 * secret eller standard); brugt = antal rigtige opslag indtil nu i dag, som
 * kun «naermer_sig» bruger.
 */
export function cvrLoftBesked(grund: CvrLoftGrund, dato: string, loft: number, brugt = 0): CvrLoftBesked {
  if (grund === "naermer_sig") {
    const tilbage = Math.max(0, loft - brugt);
    return {
      type: TYPE_CVR_LOFT,
      title: `CVR-opslag ${dato}: ${brugt} af ${loft} brugt — ${tilbage} tilbage`,
      body: [
        `Der er ${tilbage} CVR-opslag tilbage i dag. Når de er væk, får ansøgere feltet «Hvad hedder virksomheden?» og fortsætter uden opslag — og anbefalingerne regnes UDEN branche, stiftelsesår og status resten af dagen.`,
        "Det kan ikke ses på ansøgningen bagefter, hvornår det skete, så det er nu, der kan gøres noget.",
        HAEV_LOFTET,
      ].join(" "),
      reference_type: "cvr_loft",
    };
  }
  const hvad = grund === "dagsloft"
    ? `vores eget dagsloft (${loft} opslag) er nået`
    : "DataCVR har lukket for flere opslag i dag (grænsen på nøglen)";
  return {
    type: TYPE_CVR_LOFT,
    title: `CVR-opslag stoppet ${dato}: ${hvad}`,
    body: [
      "Ansøgere får feltet «Hvad hedder virksomheden?» og fortsætter uden opslag — anbefalingerne mangler branche, stiftelsesår og status resten af dagen.",
      grund === "dagsloft"
        ? HAEV_LOFTET
        : "Tjek forbruget og planen i DataCVR's dashboard (25 pr. dag på gratisplanen). Er grænsen pr. måned, er resten af måneden også lukket — overvej at opgradere.",
    ].join(" "),
    reference_type: "cvr_loft",
  };
}
