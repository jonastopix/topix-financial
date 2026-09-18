/**
 * rykkerkoe — den GENERELLE mekanisme bag alle trapper: hvilke rækker en
 * trappe består af, hvornår de står, og om en forfalden række må gå NU.
 * Spejl: supabase/functions/_shared/rykkerkoe.ts (kroppen efter filhovedet er ordret ens;
 * pariteten låses af src/lib/__tests__/ansoegningMotor.paritet.test.ts).
 *
 * ÉN KØ, IKKE ÉN CRON PR. TRAPPE (Jonas 18/9): tabellen
 * planlagte_haendelser bærer hvad (handling), hvornår (planlagt_til), til
 * hvem (modtager), hvilken skabelon og hvilken ansøgning. Ét cron-job
 * (ansoegning-rykker-cron) sender de forfaldne. Idempotensnøglen er som
 * stripe-webhookens: databasen er dommeren (UNIQUE på idempotensnoegle;
 * email_send_log har UNIQUE (message_id) WHERE status = 'sent', og nøglen
 * gives videre som sendManagedEmail.idempotencyKey = message_id) — en mail
 * kan aldrig sendes to gange, heller ikke ved to samtidige kørsler.
 *
 * REGLERNE, SAGT HØJT (Jonas 18/9; hver har en test i rykkerkoe.test.ts):
 *   1. Enhver reaktion fra ansøgeren annullerer resten af trappen.
 *      (Udført af afgoerOvergang i ansoegningTrin.ts: hver overgang siger
 *      hvilke trapper der annulleres. Køen tjekker desuden FØR hver
 *      sending at ansøgningen stadig står på trappens trin og ikke er på
 *      pause — ellers annulleres rækken i stedet for at sendes.)
 *   2. Hverdage, aldrig efter 16 eller i weekenden. (planlagtTidspunkt
 *      lægger rækken på en hverdag; afgoerSending udskyder en forfalden
 *      mail der rammer uden for vinduet til næste sendevindue.)
 *   3. Højst én mail pr. person pr. dag på tværs af trapper. (afgoerSending
 *      udskyder til næste hverdag kl. 10 når modtageren allerede har fået
 *      en mail i dag — målt i køen selv på sendt_til + udfoert_at, dansk
 *      dato.)
 *   4. «Ikke nu»-linket sætter på pause i tre måneder. (Overgangen
 *      ikke_nu annullerer alle trapper, sætter paa_pause_til = i dag + 3
 *      måneder og planlægger ÉN række: pause_slut til rådgiveren. Systemet
 *      skriver ikke til ansøgeren igen af sig selv — et menneske afgør.
 *      Rådgiveren kan selv sætte eller flytte pausen til en dato
 *      (saet_pause) — samme trappe, ankeret er pausens slutdato.)
 *
 * TRAPPERNE (dag N regnes fra ankeret på den danske kalender, kl. 10):
 *   indkaldt      anker = trinskiftet. Dag 0 selve indkaldelsen, rykker
 *                 dag 2, 7, 11 → lukkes «svarer ikke» dag 14 (tre dage
 *                 efter sidste rykker — husets valg, Jonas satte kun
 *                 rykkerdagene). Jonas 18/9 (gennemlæsning): rykkeren
 *                 dag 4 udgik — den sagde det samme som dag 2.
 *   booket        anker = samtalens starttid. Dagen før kl. 10 og samme
 *                 morgen kl. 07; når samtalen er slut markeres «afholdt»
 *                 (rådgiveren får en klokke: tilbud eller afslag). En række
 *                 hvis tidspunkt allerede er passeret når der bookes, og en
 *                 samme-dags-mail til en samtale på en ikke-hverdag,
 *                 udelades.
 *   aftalegrundlag anker = trinskiftet. Dag 0 selve aftalegrundlaget,
 *                 rykker dag 2, 5, 9, 14 → udløber dag 21.
 *   pause         anker = PAUSENS SLUTDATO (ikke_nu: i dag + 3 md.;
 *                 saet_pause: rådgiverens dato). Én række dag 0 kl. 10 på
 *                 en hverdag → klokke til jer; dommen regner ansøgningen
 *                 som ventende igen fra den dag.
 *   kladde        anker = sidste gem i formularen (B kalder planlaegKladde
 *                 ved hvert gem med e-mail; forrige række annulleres). Dag 2
 *                 kl. 10 én påmindelse «din ansøgning venter» — B's
 *                 påmindelse som trappe i den fælles kø (Jonas D6, 18/9),
 *                 ikke en cron for sig. Køen sender kun hvis ansøgningen
 *                 stadig er en kladde (indsendt_at null) med e-mail.
 *   afslag        anker = afvisningen/afslaget (grund niche/for_tidligt;
 *                 «andet» giver ingen mail). Dag 0: afslagsmailen — ved
 *                 niche med pladsen i køen (C's venteliste). Lever på en
 *                 LUKKET ansøgning (TRAPPER_PAA_LUKKET) — køen annullerer
 *                 den ikke for det.
 *   Efter underskrift: INGEN trappe her — platformens eksisterende
 *   betalingsforløb (company_betalingslink, indgangs-paamindelser-cron:
 *   30 dage, faktura dag 31) overtager.
 *
 * DAG 0-MAILEN FØLGER OGSÅ VINDUET: klikker rådgiveren «tal med dem» kl.
 * 17, går indkaldelsen næste hverdag kl. 07 — det er reglen, ikke en fejl.
 */
import type { Trappe } from "./ansoegningTrin";
import {
  erHverdagDato,
  kbhDato,
  kbhTilUtc,
  laegMaanederTilDato,
  naesteHverdagFra,
  naesteSendevindue,
  planlagtTidspunkt,
  RYKKER_KLOKKE,
  startAfNaesteDag,
  erISendevindue,
} from "./hverdage";

export type KoeHandling = "send_mail" | "luk_svarer_ikke" | "udloeb" | "marker_afholdt" | "pause_slut" | "venteplads_udloeb";
export type Modtager = "ansoeger" | "raadgiver";

export interface TrappeTrin {
  trinNr: number;
  /** Dage fra ankeret (dansk kalender). Negativ = før ankeret. */
  dag: number;
  /** Måneder i stedet for dage (pausen). */
  maaneder?: number;
  /** Klokken (dansk). Standard RYKKER_KLOKKE. */
  klokke?: number;
  /** Rækken står ved samtalens SLUTTID i stedet for dag/klokke. */
  vedSamtaleSlut?: boolean;
  /** Rækken udelades når dagen ikke er en hverdag (samme-dags-mail før en weekendsamtale). */
  kraeverHverdagSammeDag?: boolean;
  handling: KoeHandling;
  skabelon: string | null;
  modtager: Modtager;
}

export const KLADDE_PAAMINDELSE_DAG = 2;
/** Ventelistens svarfrist (udkast 18/9): samme tal som ventelisteDom.SVARFRIST_DAGE. */
export const VENTEPLADS_SVARFRIST_DAGE = 7;

export const TRAPPER: Record<Trappe, readonly TrappeTrin[]> = {
  kladde: [{ trinNr: 0, dag: KLADDE_PAAMINDELSE_DAG, handling: "send_mail", skabelon: "ansoegning-kladde-paamindelse", modtager: "ansoeger" }],
  // Kvitteringen (Jonas 18/9, flow-gennemgangen §3): én mail dag 0 fra indsendelsen — «vi har din
  // ansøgning» med det ansøgeren skrev. Følger vinduet (aften → næste hverdag kl. 07) og dagsreglen.
  // Ingen «ikke nu»-linje (der er intet at sætte på pause endnu); tal_med_dem annullerer den ikke.
  indsendt: [{ trinNr: 0, dag: 0, handling: "send_mail", skabelon: "ansoegning-kvittering", modtager: "ansoeger" }],
  indkaldt: [
    { trinNr: 0, dag: 0, handling: "send_mail", skabelon: "ansoegning-indkaldelse", modtager: "ansoeger" },
    { trinNr: 1, dag: 2, handling: "send_mail", skabelon: "ansoegning-indkaldt-rykker-1", modtager: "ansoeger" },
    { trinNr: 2, dag: 7, handling: "send_mail", skabelon: "ansoegning-indkaldt-rykker-2", modtager: "ansoeger" },
    { trinNr: 3, dag: 11, handling: "send_mail", skabelon: "ansoegning-indkaldt-rykker-3", modtager: "ansoeger" },
    { trinNr: 4, dag: 14, handling: "luk_svarer_ikke", skabelon: null, modtager: "raadgiver" },
  ],
  booket: [
    { trinNr: 0, dag: -1, klokke: 10, handling: "send_mail", skabelon: "ansoegning-samtale-i-morgen", modtager: "ansoeger" },
    { trinNr: 1, dag: 0, klokke: 7, kraeverHverdagSammeDag: true, handling: "send_mail", skabelon: "ansoegning-samtale-i-dag", modtager: "ansoeger" },
    { trinNr: 2, dag: 0, vedSamtaleSlut: true, handling: "marker_afholdt", skabelon: null, modtager: "raadgiver" },
  ],
  aftalegrundlag: [
    { trinNr: 0, dag: 0, handling: "send_mail", skabelon: "ansoegning-aftalegrundlag", modtager: "ansoeger" },
    { trinNr: 1, dag: 2, handling: "send_mail", skabelon: "ansoegning-aftalegrundlag-rykker-1", modtager: "ansoeger" },
    { trinNr: 2, dag: 5, handling: "send_mail", skabelon: "ansoegning-aftalegrundlag-rykker-2", modtager: "ansoeger" },
    { trinNr: 3, dag: 9, handling: "send_mail", skabelon: "ansoegning-aftalegrundlag-rykker-3", modtager: "ansoeger" },
    { trinNr: 4, dag: 14, handling: "send_mail", skabelon: "ansoegning-aftalegrundlag-rykker-4", modtager: "ansoeger" },
    { trinNr: 5, dag: 21, handling: "udloeb", skabelon: null, modtager: "raadgiver" },
  ],
  pause: [{ trinNr: 0, dag: 0, handling: "pause_slut", skabelon: null, modtager: "raadgiver" }],
  // Ventelisten (udkast 18/9): tilbuddet dag 0, én rykker dag 3, udløb dag 7 →
  // køen går selv videre til den næste (venteplads_udloeb). Ingen «ikke nu»
  // i disse mails: ansøgningen er lukket, svaret er ja/nej på pladsen.
  venteplads: [
    { trinNr: 0, dag: 0, handling: "send_mail", skabelon: "ansoegning-venteplads-tilbud", modtager: "ansoeger" },
    { trinNr: 1, dag: 3, handling: "send_mail", skabelon: "ansoegning-venteplads-rykker", modtager: "ansoeger" },
    { trinNr: 2, dag: VENTEPLADS_SVARFRIST_DAGE, handling: "venteplads_udloeb", skabelon: null, modtager: "raadgiver" },
  ],
  afslag: [{ trinNr: 0, dag: 0, handling: "send_mail", skabelon: "ansoegning-afslag", modtager: "ansoeger" }],
};

/**
 * Trapper der lever på en LUKKET ansøgning — køen annullerer dem ikke for «ikke
 * åben». Cronen tjekker «venteplads» først og strengere (et tilbud skal være
 * ude, C's ventepladsErTilbudt); «afslag» kræver blot trin = lukket.
 */
export const TRAPPER_PAA_LUKKET: readonly Trappe[] = ["afslag", "venteplads"];

export const PAUSE_MAANEDER = 3;

/** Alle skabelonnavne køen kan bede om — mailbyggeren skal kende hver af dem. */
export const KOE_SKABELONER: readonly string[] = Object.values(TRAPPER)
  .flat()
  .map((t) => t.skabelon)
  .filter((s): s is string => s !== null);

export interface PlanInput {
  ansoegningId: string;
  trappe: Trappe;
  /** Trinskiftet (indkaldt/aftalegrundlag), samtalens starttid (booket) eller pausens slutdato kl. 00 dansk (pause). */
  anker: Date;
  /** Samtalens sluttid — kun booket. Mangler den: start + 60 min. */
  samtaleSlut?: Date | null;
  nu: Date;
}

export interface PlanlagtRaekke {
  ansoegning_id: string;
  trappe: Trappe;
  trin_nr: number;
  handling: KoeHandling;
  skabelon: string | null;
  modtager: Modtager;
  planlagt_til: string;
  idempotensnoegle: string;
}

/**
 * Nøglen bærer ankeret: samme ansøgning, samme trappe, samme anker, samme
 * trin → samme nøgle → UNIQUE afviser en gentagen planlægning. Et NYT anker
 * (genåbning, flytning af samtalen) giver nye nøgler, og den gamle trappe
 * er annulleret af overgangen.
 */
export function idempotensnoegle(ansoegningId: string, trappe: Trappe, anker: Date, trinNr: number): string {
  return `ansoegning:${ansoegningId}:${trappe}:${anker.toISOString()}:${trinNr}`;
}

const SAMTALE_STANDARD_MIN = 60;

export function planlaegTrappe(i: PlanInput): PlanlagtRaekke[] {
  const ud: PlanlagtRaekke[] = [];
  for (const t of TRAPPER[i.trappe]) {
    let tidspunkt: Date;
    if (t.vedSamtaleSlut) {
      tidspunkt = i.samtaleSlut ?? new Date(i.anker.getTime() + SAMTALE_STANDARD_MIN * 60_000);
    } else if (t.maaneder !== undefined) {
      const dato = naesteHverdagFra(laegMaanederTilDato(kbhDato(i.anker), t.maaneder), true);
      tidspunkt = kbhTilUtc(dato, t.klokke ?? RYKKER_KLOKKE, 0);
    } else {
      tidspunkt = planlagtTidspunkt(i.anker, t.dag, t.klokke ?? RYKKER_KLOKKE);
    }

    if (i.trappe === "booket") {
      // Samtalens trappe: en række der allerede er passeret, udelades —
      // ansøgeren bookede lige nu og ved det. Samme-dags-mailen kræver at
      // samtalens dag er en hverdag (ellers landede den fredag).
      if (t.kraeverHverdagSammeDag && !erHverdagDato(kbhDato(i.anker))) continue;
      if (tidspunkt.getTime() < i.nu.getTime() && t.handling === "send_mail") continue;
    } else if (tidspunkt.getTime() < i.nu.getTime()) {
      // Dag 0 senere på dagen end kl. 10: gå nu hvis vi er i vinduet,
      // ellers næste sendevindue. Gælder alle rækker, så rækkefølgen holder.
      tidspunkt = naesteSendevindue(i.nu);
    }

    ud.push({
      ansoegning_id: i.ansoegningId,
      trappe: i.trappe,
      trin_nr: t.trinNr,
      handling: t.handling,
      skabelon: t.skabelon,
      modtager: t.modtager,
      planlagt_til: tidspunkt.toISOString(),
      idempotensnoegle: idempotensnoegle(i.ansoegningId, i.trappe, i.anker, t.trinNr),
    });
  }
  return ud;
}

export interface SendeInput {
  nu: Date;
  planlagtTil: Date;
  handling: KoeHandling;
  /** Har modtageren (mailadressen) allerede fået en mail fra køen i dag (dansk dato)? */
  modtagerHarFaaetMailIDag: boolean;
  /** Rækkens trappe — «indsendt» (kvitteringen) er undtaget fra dagsreglen (18/9). Udeladt = reglen gælder. */
  trappe?: Trappe;
}

/**
 * Trapper uden for «højst én mail pr. person pr. dag» (18/9): kvitteringen er ansøgerens
 * eget ekko af det de lige sendte — den må hverken vente på en anden mail, eller skubbe
 * indkaldelsen et døgn (cronen tæller den heller ikke som «har fået mail i dag»).
 */
export const TRAPPER_UDEN_DAGSREGEL: readonly Trappe[] = ["indsendt"];
export function erUndtagetFraDagsreglen(trappe: Trappe | undefined): boolean {
  return trappe !== undefined && TRAPPER_UDEN_DAGSREGEL.includes(trappe);
}

export type SendeDom =
  | { ok: true }
  | { ok: false; grund: "ikke_forfalden" }
  | { ok: false; grund: "uden_for_vinduet" | "allerede_mail_i_dag"; udskydTil: Date };

/**
 * Må den forfaldne række udføres NU? Vinduet og én-pr.-dag-reglen gælder
 * kun mails; luk/udløb/afholdt/pause_slut er interne og går når de er
 * forfaldne.
 */
export function afgoerSending(i: SendeInput): SendeDom {
  if (i.planlagtTil.getTime() > i.nu.getTime()) return { ok: false, grund: "ikke_forfalden" };
  if (i.handling !== "send_mail") return { ok: true };
  if (!erISendevindue(i.nu)) return { ok: false, grund: "uden_for_vinduet", udskydTil: naesteSendevindue(i.nu) };
  if (i.modtagerHarFaaetMailIDag && !erUndtagetFraDagsreglen(i.trappe)) {
    const naesteDag = kbhDato(startAfNaesteDag(i.nu));
    return { ok: false, grund: "allerede_mail_i_dag", udskydTil: kbhTilUtc(naesteHverdagFra(naesteDag, true), RYKKER_KLOKKE, 0) };
  }
  return { ok: true };
}

/** Datoen (dansk) for pausens udløb: i dag + tre måneder. */
export function pauseTil(nu: Date): string {
  return laegMaanederTilDato(kbhDato(nu), PAUSE_MAANEDER);
}
