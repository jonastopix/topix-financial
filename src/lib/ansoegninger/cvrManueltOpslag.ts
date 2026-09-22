/**
 * cvrManueltOpslag — dommen bag rådgiverens knap «Slå op i CVR» (22/9-2026).
 *
 * SPEJL af supabase/functions/_shared/cvrManueltOpslag.ts. Kroppen efter dette
 * filhoved er ORDRET ens (paritetsprøven src/lib/__tests__/cvrManueltOpslag.paritet.test.ts
 * sammenligner tegn for tegn OG svarene på samme input). Nul imports i begge,
 * så der er ingen stier at oversætte.
 *
 * Hvorfor et spejl: fladen afgør, om knappen vises (kanSlaaOp), og functionen
 * afgør, om den skriver (maaSkrives) — to steder, én regel. Uden spejlet ville
 * en knap kunne stå og love et opslag, functionen ville afvise.
 */

/** Udfaldene, functionen svarer med. De fire første er DataCVR's; de to sidste er vores egne. */
export type ManueltUdfald =
  | "fundet"
  | "findes_ikke"
  | "utilgaengelig"
  | "dagsloft"
  | "intet_cvr"
  | "ukendt_ansoegning";

/**
 * Må der slås op på dette CVR? Otte cifre, og kun det.
 *
 * MÅLT 22/9: Lev Positiv kom fra Monday med TI cifre i CVR-feltet. Sådan en
 * ansøgning får ingen knap — der er intet at slå op, og et opslag på de første
 * otte ville være et gæt. Fladen skriver i stedet linjen fra
 * `opslagsBesked("intet_cvr")`.
 *
 * Normaliseringen er husets egen (`normaliserCvr`: «DK 12 34 56 78» →
 * «12345678») og sker FØR denne dom — her er der kun ét spørgsmål tilbage.
 */
export function kanSlaaOp(cvr: string | null | undefined): boolean {
  return typeof cvr === "string" && /^\d{8}$/.test(cvr.trim());
}

/**
 * Må svaret skrive oven i det, der allerede står på ansøgningen?
 *
 * REGLEN, OG HELE GRUNDEN TIL AT DEN ER EN FUNKTION: et tomt eller fejlet svar
 * må ALDRIG erstatte et opslag, vi allerede har. En nedetid hos DataCVR, en
 * opbrugt kvote eller en virksomhed, der lige er skiftet CVR-nummer, ville
 * ellers slette navnet fra en ansøgning, hvor det stod rigtigt — og rådgiveren
 * ville se felterne blive TOMME af at trykke på en knap, der skulle fylde dem.
 *
 * Derfor: KUN «fundet» med en visning skriver. Alt andet lader rækken stå og
 * siger det i linjen.
 */
export function maaSkrives(udfald: ManueltUdfald, harVisning: boolean): boolean {
  return udfald === "fundet" && harVisning;
}

/**
 * Den rolige linje. Én sætning, ingen kode, ingen stacktrace, intet om kvoter
 * eller nøgler ud over det, rådgiveren kan gøre noget ved.
 *
 * `navn` gives med ved «fundet», så linjen kan bekræfte, hvad der blev hentet
 * — rådgiveren skal kunne se, at det er den rigtige virksomhed, uden at scrolle.
 */
export function opslagsBesked(udfald: ManueltUdfald, navn?: string | null): string {
  switch (udfald) {
    case "fundet":
      return navn && navn.trim() ? `Hentet fra CVR: ${navn.trim()}.` : "Hentet fra CVR.";
    case "findes_ikke":
      return "CVR-registret kender ikke det nummer. Tjek nummeret på ansøgningen.";
    case "dagsloft":
      return "Dagens CVR-opslag er brugt op. Prøv igen i morgen — eller hæv loftet i app_config.";
    case "utilgaengelig":
      return "CVR-registret svarede ikke lige nu. Prøv igen om lidt — det, der stod, er urørt.";
    case "intet_cvr":
      return "Ansøgningen har ikke et CVR-nummer på otte cifre, så der er intet at slå op.";
    case "ukendt_ansoegning":
      return "Ansøgningen findes ikke.";
  }
}

/** Knappens ord: første gang «Slå op i CVR», bagefter «Opdatér fra CVR». */
export function knapTekst(harOpslag: boolean): string {
  return harOpslag ? "Opdatér fra CVR" : "Slå op i CVR";
}
