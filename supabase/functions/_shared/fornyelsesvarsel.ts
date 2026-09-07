/**
 * supabase/functions/_shared/fornyelsesvarsel.ts
 *
 * Spejlet fra src/lib/fornyelsesvarsel.ts — enhver ændring her SKAL også
 * laves der. Pariteten håndhæves af testen i
 * src/lib/__tests__/fornyelsesvarselParitet.test.ts.
 *
 * Kopien er IKKE ordret: importstien ("./fornyelse.ts" med filendelse,
 * som Deno kræver) er den ENESTE tilladte forskel mellem de to filer ud
 * over filhovederne.
 *
 * Ren, testbar afgørelse af HVILKET VARSEL der er forfaldent for én
 * virksomhed på én dag — fornyelsens afsender-motor. Samme mønster som
 * afgoerBetalingsfrist i src/lib/betalingsfrist.ts (skabelonen) og
 * afgoerFornyelsestilstand i src/lib/fornyelse.ts: ingen I/O, ingen
 * Supabase, ingen React — samme input giver altid samme output, og «nu»
 * er en eksplicit parameter.
 *
 * HVAD DEN AFGØR: om varsel 1 eller varsel 2 skal sendes NU, eller intet.
 * Den sender ikke selv; kalderen (cron → Bucket B-funktion, tørkørsel som
 * standard — fornyelsesordningen §7) bygger mailen, sender, og STEMPLER
 * kun når afsendelsen lykkedes. Idempotensen bæres af stemplerne
 * varsel_1_sendt_at / varsel_2_sendt_at på company_fornyelse (#674): to
 * navngivne kolonner, ikke et dag-nummer, fordi de to varsler kan sendes
 * uafhængigt af hinanden (se reglen om den sene beslutning nedenfor).
 *
 * Datagrundlag: companies.contract_end_date plus company_fornyelse
 * (beslutning, varsel_1_sendt_at, varsel_2_sendt_at). Beslutningerne bag
 * står i docs/fornyelsesordningen.md — §1 (kun «tilbyd» udløser noget),
 * §3 (tilbudsvinduet efter udløb), §7 (tallene 30 og 7, besluttet 7/9).
 *
 * DAGENE er hele kalenderdage på UTC-komponenter af begge datoer — samme
 * tal uanset maskinens tidszone. Beregningen er IKKE kopieret hertil:
 * den bor i fornyelse.ts (beregnDageTilUdloeb), som ikke eksporterer den,
 * men afgoerFornyelsestilstand returnerer altid dage_til_udloeb fra
 * netop den beregning, uanset hvilken status den ender i. Motoren her
 * kalder derfor DEN og læser dagene af svaret. De to abonnementsfelter
 * påvirker kun tier/status, aldrig dagene, og sendes som null. Skulle
 * hjælperen en dag blive eksporteret (i begge kopier), er det ét kald at
 * bytte — reglen «én dagberegning i huset» holder allerede nu.
 */
import { afgoerFornyelsestilstand, FORNYELSE_IKRAFT_DATO, type Fornyelsesbeslutning, type FornyelseStatus } from "./fornyelse.ts";

/**
 * Varsel 1 sendes når der er så mange dage ELLER FÆRRE til slutdatoen
 * (besluttet af Jonas 7/9). Tallet er også fristen for rådgiverens
 * beslutning: foreligger «tilbyd» ikke senest dag 30, sendes intet — en
 * glemt beslutning forsinker ikke mailen, den aflyser den (ordningens §7).
 * Ændres tallet, ændres mailenes tekst — de nævner slutdatoen som dato.
 */
export const VARSEL_1_DAGE_FOER = 30;

/**
 * Varsel 2 sendes når der er så mange dage eller færre til slutdatoen
 * (besluttet 7/9). Tilbuddet lever derefter 14 dage efter slutdatoen
 * (FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE i fornyelse.ts), men det er
 * tilstandsmotorens sag — varsler sendes kun FØR slutdatoen.
 */
export const VARSEL_2_DAGE_FOER = 7;

export type Varselsnummer = 1 | 2;

export interface FornyelsesvarselInput {
  /** companies.contract_end_date — date-kolonne («YYYY-MM-DD»). NULL = ingen slutdato, intet at varsle om. */
  contract_end_date: string | null;
  /** company_fornyelse.beslutning — NULL = ingen række / «endnu ikke besluttet». Kun «tilbyd» udløser varsler (§1). */
  beslutning: Fornyelsesbeslutning | null;
  /** company_fornyelse.varsel_1_sendt_at — stemplet af kalderen når varsel 1 ER sendt. NULL = ikke sendt. */
  varsel_1_sendt_at: string | null;
  /** company_fornyelse.varsel_2_sendt_at — som ovenfor for varsel 2. */
  varsel_2_sendt_at: string | null;
}

export interface Fornyelsesvarsel {
  /** Det varsel der er forfaldent NU — højst ét — eller null. */
  varsel: Varselsnummer | null;
  /**
   * Kort dansk begrundelse, også når varsel er null — skrevet til at blive
   * læst af et menneske i en tørkørsels-log: «varsel 1 forfaldent: 30 dage
   * til slutdato», «intet: varsel 2 allerede sendt 2026-09-01».
   */
  grund: string;
  /**
   * Hele kalenderdage til slutdatoen (fornyelse.ts' tal): 0 på selve
   * slutdagen, negativ efter, null uden slutdato eller når den ikke kan
   * læses. Bæres med af samme grund som betalingsfrist bærer
   * dage_siden_underskrift: loggen og rådgiveren skal kunne se uret.
   */
  dage_til_udloeb: number | null;
  /**
   * Sat KUN når varslet springes over fordi medlemmet ikke kan handle på
   * det (gren 5): tilstandsmotorens status — i praksis uden_for_ordningen.
   * Kalderen tæller den for sig i tørkørslen, så «uden for ordningen» ikke
   * drukner i «intet forfaldent». Udeladt i alle andre svar.
   */
  blokeret_af?: FornyelseStatus;
}

/**
 * De tilstande hvor et varsel giver mening: klar_til_tilbud er den ENESTE
 * tilstand FØR slutdatoen hvor hent-fornyelsestilbud og
 * opret-fornyelse-checkout siger ja (begge gater på klar_til_tilbud eller
 * udloebet_tilbyd; den sidste ligger efter slutdatoen og fanges af gren 4).
 * i_god_tid er «kan endnu ikke, men bliver klar_til_tilbud på dag 60» —
 * den når aldrig gren 5-6 (dag 30/7), men må ikke få en falsk grund i
 * tørkørslen. Alt andet — uden_for_ordningen, selvbetjener, ingen_slutdato
 * — kan ikke betale, og et varsel med en knap der ikke virker er værre end
 * tavshed (CARMA STUDIO, 7/9 kl. 11:57).
 */
const KAN_HANDLE: ReadonlySet<FornyelseStatus> = new Set<FornyelseStatus>(["klar_til_tilbud", "i_god_tid"]);

/** Stemplets UTC-kalenderdag til loggen; «ukendt dato» hvis stemplet ikke kan læses. */
function stempeldato(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "ukendt dato" : d.toISOString().slice(0, 10);
}

function dageTekst(n: number): string {
  return `${n} ${n === 1 ? "dag" : "dage"}`;
}

/**
 * Afgør det forfaldne varsel for en virksomhed.
 *
 * Grenene i PRIORITERET rækkefølge — den første der matcher, vinder:
 *   1. ikke «tilbyd»        intet. Vi sender KUN til dem vi HAR besluttet
 *                           at tilbyde (§1): ingen beslutning og tilbyd_ikke
 *                           giver samme svar. En målgruppe der filtrerer på
 *                           fravær af tilbyd_ikke ville ramme dem uden
 *                           beslutning — derfor filtreres der på tilbyd.
 *   2. ingen slutdato       intet, og det er ikke en fejl: uden slutdato er
 *                           der ingen fornyelse at varsle om (ingen_slutdato
 *                           i tilstandsmotoren).
 *   3. slutdato ulæselig    intet — fail-closed som betalingsfrist: kendes
 *                           uret ikke, sendes der ikke.
 *   4. slutdato passeret    intet. Tilbuddet lever stadig 14 dage
 *                           (udloebet_tilbyd → udloebet_vindue_lukket), men
 *                           et VARSEL om noget der allerede er sket, er
 *                           forkert: mailene siger «din aftale udløber om N
 *                           dage», og det er ikke sandt længere. Hvad
 *                           medlemmet får EFTER slutdatoen, er gatens og
 *                           tilbudsvinduets sag, ikke varslernes.
 *   5. kan ikke handle      intet, med tilstanden som grund (blokeret_af).
 *                           Tilstandsmotoren (afgoerFornyelsestilstand) er
 *                           den samme dom som hent-fornyelsestilbud og
 *                           opret-fornyelse-checkout gater på; siger den
 *                           andet end klar_til_tilbud/i_god_tid, virker
 *                           hverken tilbud, checkout eller bånd — og så
 *                           sendes der ikke. Rettet 7/9: CARMA STUDIO
 *                           (slutdato 7/9, ordningen i kraft 10/9 → uden_
 *                           for_ordningen) fik varsel 2 kl. 11:57 med en
 *                           knap der ikke virkede, fordi motoren her kun
 *                           læste dagene af tilstanden, aldrig status.
 *   6. varsel 2 forfaldent  dage_til_udloeb <= 7 og varsel_2_sendt_at null.
 *   7. varsel 1 forfaldent  dage_til_udloeb <= 30 og varsel_1_sendt_at null
 *                           — men KUN når varsel 2 ikke er forfaldent (6 vandt
 *                           ellers), og KUN når varsel 2 ikke allerede er
 *                           sendt (se reglen om den sene beslutning).
 *   8. ellers               intet — for tidligt, eller allerede sendt.
 *
 * Regnestykket, i hele UTC-kalenderdage (dage_til_udloeb fra fornyelse.ts;
 * slutdatoen selv er dag 0, dagen før er 1):
 *   varsel 1 forfaldent  ⇔  dage_til_udloeb <= 30  og  varsel_1_sendt_at = null
 *   varsel 2 forfaldent  ⇔  dage_til_udloeb <= 7   og  varsel_2_sendt_at = null
 *   Slutdato 1/10: dag 31 (31/8) → intet; dag 30 (1/9) → varsel 1.
 *                  Dag 8 (23/9) → varsel 1 hvis ikke sendt; dag 7 (24/9) → varsel 2.
 *                  Dag 0 (1/10) er stadig «7 dage eller færre»: varsel 2 kan
 *                  sendes på selve slutdagen, hvis det ikke er sket før.
 *                  Dag −1 (2/10) → intet (gren 4).
 *
 * DEN SENE BESLUTNING — begge forfaldne samtidig: træffes «tilbyd» først
 * fx 5 dage før slutdato, er både varsel 1 (5 <= 30) og varsel 2 (5 <= 7)
 * forfaldne, og ingen af dem sendt. Så sendes varsel 2 — det er den
 * rigtige besked på det tidspunkt — og varsel 1 sendes IKKE bagefter:
 * gren 7 kræver at varsel_2_sendt_at er null. Ellers ville den sene
 * beslutning udløse to mails på to dage («om 5 dage» i dag, «om 4 dage» i
 * morgen), og den anden ville være forældet i samme øjeblik den blev
 * sendt. Det er også derfor stemplerne er to kolonner: varsel_2_sendt_at
 * kan være sat mens varsel_1_sendt_at er null, og det er en gyldig
 * historik, ikke en fejl. Samme spring som betalingsfristens påmindelser:
 * det højeste forfaldne trin vinder, og et oversprunget trin sendes aldrig.
 */
export function afgoerForfaldentVarsel(
  input: FornyelsesvarselInput,
  now: Date = new Date(),
): Fornyelsesvarsel {
  // 1. KUN «tilbyd» — §1. Ingen beslutning og tilbyd_ikke er samme svar
  //    udadtil (intet), men loggen må gerne skelne; det er en rådgiver
  //    der læser den, ikke medlemmet.
  if (input.beslutning !== "tilbyd") {
    const grund =
      input.beslutning === "tilbyd_ikke" ? "intet: beslutningen er tilbyd_ikke" : "intet: ingen beslutning truffet";
    return { varsel: null, grund, dage_til_udloeb: null };
  }

  // 2. INGEN SLUTDATO — intet at varsle om, og ikke en fejl.
  if (!input.contract_end_date) {
    return { varsel: null, grund: "intet: ingen slutdato", dage_til_udloeb: null };
  }

  // Dagene OG TILSTANDEN fra fornyelse.ts (se filhovedet). Abonnements-
  // felterne sendes som null: et varsel kan kun være forfaldent på eller
  // før slutdagen (gren 4), og til og med slutdagen er tier «full» uanset
  // abonnement (computeMembershipTier) — så status kan ikke afhænge af dem
  // på nogen dag hvor der sendes. Derfor kan motoren her svare rigtigt
  // uden at kalderen bærer flere felter.
  const { dage_til_udloeb, status } = afgoerFornyelsestilstand(
    {
      contract_end_date: input.contract_end_date,
      subscription_status: null,
      subscription_current_period_end: null,
      beslutning: input.beslutning,
    },
    now,
  );

  // 3. SLUTDATO ULÆSELIG — fail-closed.
  if (dage_til_udloeb === null) {
    return { varsel: null, grund: "intet: slutdatoen kan ikke læses", dage_til_udloeb: null };
  }

  // 4. SLUTDATO PASSERET — et varsel om noget der allerede er sket, er forkert.
  if (dage_til_udloeb < 0) {
    return {
      varsel: null,
      grund: `intet: slutdatoen er passeret for ${dageTekst(-dage_til_udloeb)} siden`,
      dage_til_udloeb,
    };
  }

  // 5. KAN MEDLEMMET HANDLE? Samme dom som tilbud, checkout og bånd.
  if (!KAN_HANDLE.has(status)) {
    const grund =
      status === "uden_for_ordningen"
        ? `intet: uden for ordningen — slutdatoen ${input.contract_end_date} er på eller før ${FORNYELSE_IKRAFT_DATO}, og medlemmet kan ikke forny`
        : `intet: tilstanden er ${status}, og medlemmet kan ikke forny`;
    return { varsel: null, grund, dage_til_udloeb, blokeret_af: status };
  }

  const dage = dageTekst(dage_til_udloeb);

  // 6. VARSEL 2 — det højeste forfaldne trin vinder.
  if (dage_til_udloeb <= VARSEL_2_DAGE_FOER) {
    if (input.varsel_2_sendt_at === null) {
      const spring = input.varsel_1_sendt_at === null ? " (varsel 1 springes over: sen beslutning)" : "";
      return { varsel: 2, grund: `varsel 2 forfaldent: ${dage} til slutdato${spring}`, dage_til_udloeb };
    }
    return {
      varsel: null,
      grund: `intet: varsel 2 allerede sendt ${stempeldato(input.varsel_2_sendt_at)}`,
      dage_til_udloeb,
    };
  }

  // 7. VARSEL 1 — kun når varsel 2 hverken er forfaldent (6) eller sendt.
  if (dage_til_udloeb <= VARSEL_1_DAGE_FOER) {
    if (input.varsel_1_sendt_at === null && input.varsel_2_sendt_at === null) {
      return { varsel: 1, grund: `varsel 1 forfaldent: ${dage} til slutdato`, dage_til_udloeb };
    }
    const sendt =
      input.varsel_1_sendt_at !== null
        ? `varsel 1 allerede sendt ${stempeldato(input.varsel_1_sendt_at)}`
        : `varsel 2 allerede sendt ${stempeldato(input.varsel_2_sendt_at as string)}, varsel 1 springes over`;
    return {
      varsel: null,
      grund: `intet: ${sendt}; varsel 2 forfalder om ${dageTekst(dage_til_udloeb - VARSEL_2_DAGE_FOER)}`,
      dage_til_udloeb,
    };
  }

  // 8. FOR TIDLIGT.
  return {
    varsel: null,
    grund: `intet: ${dage} til slutdato; varsel 1 forfalder om ${dageTekst(dage_til_udloeb - VARSEL_1_DAGE_FOER)}`,
    dage_til_udloeb,
  };
}
