/**
 * varselTrin — hvor langt er systemet kommet med varslerne? ÉN regel.
 *
 * Set på skærm 7/9 kl. 18:29 på CARMA STUDIO: badget sagde «Klar til tilbud»,
 * linjen nedenunder «Påmindelse sendt · 7. sep.». Reglen læste kun
 * varsel_1_sendt_at — og CARMA har KUN varsel_2_sendt_at, fordi den sene
 * beslutning sprang varsel 1 over (fornyelsesvarsel.ts). Rådgiveren skulle
 * tro at der stadig manglede et tilbud at sende.
 *
 * Det var TO steder med samme regel (fornyelsesBadge i lib/fornyelsesOrd og
 * grundFraFornyelse i lib/forsidensDom) — rettes kun det ene, driver de fra
 * hinanden (DEL 4). Derfor bor reglen her, og begge kalder den.
 *
 * Rækkefølgen betyder noget: varsel 2 er det seneste og VINDER, uanset om
 * varsel 1 gik forud. Stemplerne ligger VED SIDEN AF motoren
 * (afgoerFornyelsestilstand), som ikke kender dem og ikke røres.
 */
export type VarselTrin = "ingen" | "varsel_1" | "varsel_2";

export function afgoerVarselTrin(
  varsel1SendtAt: string | null | undefined,
  varsel2SendtAt: string | null | undefined,
): VarselTrin {
  if (varsel2SendtAt != null) return "varsel_2";
  if (varsel1SendtAt != null) return "varsel_1";
  return "ingen";
}
