/**
 * src/lib/ikkeIGang.ts
 *
 * «NY OG IKKE KOMMET I GANG» — dommen som ren funktion, testet
 * (src/lib/__tests__/ikkeIGang.test.ts). Forsidens dom (forsidensDom.
 * grundFraIkkeIGang) kalder den og laver en linje af den.
 *
 * BAGGRUND (9/9): seks virksomheder havde medlemmer og havde ALDRIG
 * uploadet — Bastant nåede 165 dage før nogen så det. Motoren og dommen
 * kendte ingen alder (recon-i-gang §3-4): tavsheden er 21 dage siden
 * sidste besked, uanset om der er tal. Jonas 9/9: «Rådgiverforsiden skal
 * sige det på dag 21, ikke på dag 165.»
 *
 * TÆRSKLEN 21 DAGE — målt i prod 9/9 kl. 12:44: af dem der kom til i 2026
 * og NÅEDE en målt rapport, gjorde de det inden for cirka tre uger (Livja
 * 0, YKRG 4, Floren 15, Brick Works 16, Booking Innovation 21,
 * Fjeldgaardshop 27). De langsomme (198–332 dage) er alle fra 2025, før
 * platformen var klar — historik, ikke onboarding.
 *
 * BEVISET er ÉT: den første MÅLTE committede facts-række (data_basis =
 * 'measured'). En upload der ikke er godkendt er ikke tal i drift (73 lå
 * sådan 7/9) — den ændrer ordene, ikke dommen. Svar på forslag er det
 * andet bevis huset kender, men en ny uden tal får ingen forslag
 * (generate-weekly-focus: no_data), så det tæller ikke her.
 *
 * MEDLEMSKABET BEGYNDER ved første company_members-række (signup —
 * «de fik adgang»). Ikke companies.created_at (kan være en importeret
 * ansøgning måneder før), ikke contract_start_date (betalingsdagen for
 * nye, men rådgiverens håndskrevne tal for de gamle, og den kan ligge
 * FØR adgangen: man kan ikke uploade før man er inde). Uden medlem: intet
 * signal — det er invitationens problem (åbne invitationer på
 * /virksomheder), ikke onboardingens.
 *
 * INGEN VENTEN PÅ FØRSTE MÅNEDSSKIFTE (Jonas 9/9): «De kan jo godt
 * rapportere fra FØR medlemsstart. Det vil vi faktisk gerne opfordre dem
 * til, så vi kan få et grundigt grundlag at komme i gang med.» Et nyt
 * medlem har altid noget at uploade fra dag ét — historikken. Tallene
 * bekræfter det: BR Roset og Warburg uploadede FØR kontrakten formelt
 * startede (−49 og −106 dage), Livja nåede en målt rapport på dag 0, YKRG
 * på dag 4. De 21 dage tæller derfor fra medlemskabets start, uden
 * undtagelse for «de har ikke haft en afsluttet måned endnu». RET DET
 * IKKE til at vente på første månedsskifte — det ville gøre signalet
 * blindt i præcis de tre uger det skal virke i. Linjen siger det selv:
 * «har ikke uploadet — heller ikke historik».
 *
 * ØVRE GRÆNSE: NY_TIL_DAGE = 90. Efter tre måneder uden målt rapport er
 * man ikke «ny» længere — man er faldet ud (mangellistens kriterium er
 * netop tre måneder uden målt rapport), og det er et andet spor. Signalet
 * forsvinder, så Bastants 165 dage ikke står for evigt; «faldet ud» har
 * ikke sin egen linje i dommen i dag (åbent). Grænserne er hele
 * kalenderdage på læserens dag: dag 20 er for tidligt, dag 21 er signalet,
 * dag 90 er sidste dag med, dag 91 er faldet ud.
 */

export const NY_FRA_DAGE = 21;
export const NY_TIL_DAGE = 90;

export interface IkkeIGangInput {
  /** Første company_members.created_at (ISO); null = ingen medlemmer. */
  medlemSiden: string | Date | null | undefined;
  /** Findes mindst én facts-række med data_basis = 'measured'? */
  harMaaltRapport: boolean;
  /** Antal uploadede (ikke slettede) rapporter — ændrer ordene, ikke dommen. */
  antalUploads: number;
}

export type IkkeIGangTilstand =
  | "ingen_start"
  | "i_gang"
  | "for_tidligt"
  | "ikke_i_gang"
  | "faldet_ud";

export interface IkkeIGangDom {
  tilstand: IkkeIGangTilstand;
  /** Hele kalenderdage siden medlemskabet begyndte; null uden start. */
  dage: number | null;
  /** Sandt kun for «ikke_i_gang» — det der giver en linje. */
  signal: boolean;
  /** Uploadet men ikke godkendt — findes, men er ikke bevis. */
  harUploadetUdenGodkendelse: boolean;
}

const MS_PER_DOEGN = 86_400_000;

/** Hele kalenderdage siden — læserens dag, som husets øvrige domme. */
export function dageSidenStart(start: string | Date | null | undefined, nu: Date): number | null {
  if (start == null) return null;
  const d = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()).getTime();
  return Math.round((b - a) / MS_PER_DOEGN);
}

export function afgoerIkkeIGang(input: IkkeIGangInput, nu: Date): IkkeIGangDom {
  const dage = dageSidenStart(input.medlemSiden, nu);
  const harUploadetUdenGodkendelse = !input.harMaaltRapport && input.antalUploads > 0;
  const bas = { dage, harUploadetUdenGodkendelse };
  if (dage == null) return { ...bas, tilstand: "ingen_start", signal: false };
  if (input.harMaaltRapport) return { ...bas, tilstand: "i_gang", signal: false };
  if (dage < NY_FRA_DAGE) return { ...bas, tilstand: "for_tidligt", signal: false };
  if (dage > NY_TIL_DAGE) return { ...bas, tilstand: "faldet_ud", signal: false };
  return { ...bas, tilstand: "ikke_i_gang", signal: true };
}

/** Linjens tekst: «Medlem i 21 dage, har ikke uploadet — heller ikke
    historik» / «Medlem i 30 dage, har uploadet — tallene er ikke godkendt».
    «Heller ikke historik» siger rådgiveren at der ikke er noget at vente
    på: en ny kan sende tidligere måneder fra dag ét (Jonas 9/9). */
export function ikkeIGangTekst(dom: IkkeIGangDom): string {
  const dage = dom.dage ?? 0;
  const medlem = `Medlem i ${dage} ${dage === 1 ? "dag" : "dage"}`;
  return dom.harUploadetUdenGodkendelse
    ? `${medlem}, har uploadet — tallene er ikke godkendt`
    : `${medlem}, har ikke uploadet — heller ikke historik`;
}

/** Grundlaget for lukningen (lib/opgaveLukning): startdagen og antallet af
    uploads. En ny upload er noget nyt — så kommer linjen igen, også efter
    «Færdiggjort». Dagene tæller ikke med: at tiden går er ikke nyt. */
export function ikkeIGangGrundlag(input: IkkeIGangInput): string {
  const start = input.medlemSiden instanceof Date ? input.medlemSiden.toISOString() : (input.medlemSiden ?? "");
  return `${start.slice(0, 10)}|${input.antalUploads}`;
}
