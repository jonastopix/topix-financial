/**
 * ansoegningTrin — de syv trin, lukkeårsagerne, kilderne og overgangsdommen
 * for en ansøgning. Spejl: src/lib/ansoegningTrin.ts (kroppen efter
 * filhovedet er ordret ens; pariteten låses af
 * src/lib/__tests__/ansoegningMotor.paritet.test.ts).
 *
 * JONAS 18/9 (ordret): «Vi bygger ikke en kopi af Monday. Vi bygger et
 * meget smartere og mere moderne flow.» Mondays statusfelt bar fire ting
 * på én gang (trin, årsag, forsøgsnummer, udløser) — 40 etiketter og 122
 * opskrifter. Her er de fire adskilt: TRIN er ét af syv ord her,
 * LUKKEÅRSAG en egen kolonne, FORSØGSNUMMER et tal (rykkere_sendt på
 * rækken, trin_nr på køens række), NÆSTE HANDLING en række i køen
 * (planlagte_haendelser) med en dato. En ny rykker er en RÆKKE, ikke en
 * ny etiket.
 *
 * FEM TRIN + LUKKET (chatten 17/9 nat): ny → indkaldt til afklaringssamtale
 * → samtale booket → samtale afholdt → aftalegrundlag sendt → underskrevet;
 * plus lukket med en årsag. «Samtale booket/afholdt» er to trin, fordi
 * de har hver sin trappe (påmindelser før mødet; menneskets beslutning
 * efter). DIREKTE TILBUD FINDES IKKE: fra «ny» kan man kun indkalde eller
 * afvise — dommen afviser ny → aftalegrundlag_sendt og ny → underskrevet.
 *
 * TO BESLUTNINGER KRÆVER ET MENNESKE: (1) efter ansøgningen — tal_med_dem
 * eller afvis (systemet giver en anbefaling, _shared/ansoegningAnbefaling.ts);
 * (2) efter samtalen — tilbud eller afslag. Alt andet er systemhandlinger:
 * book/aflys_booking (Calendly), afholdt (køen når samtalen er slut),
 * svarer_ikke (køen dag 14), udloeb (køen dag 21), ikke_nu (ansøgerens
 * link). underskrevet er et menneske i dag (rådgiveren stempler), og bliver
 * en systemhandling den dag e-signaturen melder tilbage.
 *
 * EFTER UNDERSKRIFT overtager platformens EKSISTERENDE betalingsforløb
 * (company_betalingslink + indgangs-paamindelser-cron: 30 dage, faktura dag
 * 31) — dommen tillader ingen handling fra «underskrevet»; motoren har
 * afleveret.
 *
 * PAUSE SAT AF ET MENNESKE (Jonas 18/9, «den varige vej»): saet_pause bærer
 * en dato og er tilladt fra ethvert åbent trin — ny, indkaldt, booket,
 * afholdt, aftalegrundlag_sendt — både uden pause og med en (flyt datoen),
 * som ikke_nu netop ikke kunne. Ikke fra lukket (genåbn først) og ikke fra
 * underskrevet (motoren har afleveret). Trinnet står, alle trapper
 * annulleres, én pause_slut-række planlægges PÅ datoen (klokke til jer),
 * og dommen regner ansøgningen som ventende igen fra den dag.
 *
 * PAUSEN OPHÆVES — ÉN DOM, TRE VEJE (18/9 aften, hul fundet i Jonas' prøve:
 * en pause kunne hverken tages af rådgiveren eller ansøgeren før datoen —
 * «ikke nu» var bygget som en venlig udvej, ikke som en spærring). genoptag
 * er tilladt fra ethvert åbent trin, når paa_pause_til er sat (harPause —
 * også på selve slutdatoen, hvor erPaaPause allerede er falsk): trinnet
 * står, paa_pause_til ryddes, trappen «pause» annulleres, sporet får sin
 * linje. INGEN trappe startes: køen skriver ikke til ansøgeren af sig selv
 * efter en pause — rådgiveren tager næste skridt (samme regel som køens
 * pause_slut altid har haft: «Det er dit valg — køen gør intet af sig
 * selv»). Rådgiveren («Genoptag nu»), ansøgeren (statussidens «Tag den op
 * igen» — giver rådgiverne en klokke) og køen (pause_slut på datoen) går
 * alle gennem denne ene dom, så de tre veje ikke kan gøre forskellige ting.
 *
 * AFSLAGET BLIVER TIL NOGET (Jonas 17/9 nat, 18/9): et nej bærer en grund —
 * NICHEN ER OPTAGET (de venter på en konkret virksomheds plads: C's
 * venteliste), FOR TIDLIGT eller ANDET. «Svarer ikke» giver intet. Er
 * grunden niche eller for_tidligt, planlægges afslagsmailen (trappen
 * «afslag», dag 0) — ved niche med pladsen i køen («I står nummer N i
 * køen»). «andet» giver ingen mail: Jonas skriver selv. Abonnementet
 * «Dine tal» er taget helt ud (Jonas 18/9: «Det skal slet ikke nævnes»)
 * — README'en siger hvad der skal til, hvis det kobles på senere.
 *
 * REAKTIONER ANNULLERER TRAPPEN: hver overgang siger hvilke trapper der
 * annulleres og hvilken der startes. «alle» ved lukning, pause og
 * underskrift; ellers den trappe trinnet forlader. Det er reglen «enhver
 * reaktion fra ansøgeren annullerer resten af trappen» — udført ét sted.
 *
 * GENÅBNING: lukket → det trin lukningen skete fra, dog aldrig tilbage til
 * «booket» (tiden er gået) eller «aftalegrundlag_sendt» (tilbuddet skal
 * sendes igen af et menneske): booket → indkaldt, aftalegrundlag_sendt →
 * afholdt. Trappen for det genåbnede trin startes forfra med nyt anker.
 */

export const TRIN = [
  "ny",
  "indkaldt",
  "booket",
  "afholdt",
  "aftalegrundlag_sendt",
  "underskrevet",
  "lukket",
] as const;
export type Trin = (typeof TRIN)[number];

export const LUKKEAARSAGER = [
  "afslag_efter_ansoegning",
  "afslag_efter_samtale",
  "svarer_ikke",
  "udloebet",
  "trak_sig",
  "dublet",
  "andet",
] as const;
export type Lukkeaarsag = (typeof LUKKEAARSAGER)[number];

// B's fem (ansoegningSkema.ts KILDER) — byte-ens liste; ansoegningMotor.guard låser den.
export const KILDER = ["webinar", "anbefaling", "linkedin", "direkte", "andet"] as const;
export type Kilde = (typeof KILDER)[number];

/**
 * Trapperne i rykkerkøen. Definitionen (dage, skabeloner) bor i rykkerkoe.ts.
 * «kladde» er formularens påmindelse (Jonas D6, 18/9): B's egen cron er
 * lagt ind i den fælles kø — anker = sidste gem, én række, og den lever
 * FØR trinnene (indsendt_at er null). trappensTrin svarer null for den,
 * og køen tjekker i stedet at ansøgningen stadig er en kladde med e-mail.
 */
// «venteplads» (udkast 18/9): ventelistens tilbud — 7 dage til den første i
// køen; lever på en LUKKET ansøgning, så trappensTrin svarer null, og køen
// tjekker ventepladsen selv (ventepladsErTilbudt i cronen).
// «afslag» (18/9): afslagsmailen dag 0 — lever også på en LUKKET ansøgning
// (TRAPPER_PAA_LUKKET i rykkerkoe.ts: køen kræver trin = lukket).
export const TRAPPER_NAVNE = ["kladde", "indsendt", "indkaldt", "booket", "aftalegrundlag", "pause", "venteplads", "afslag"] as const;
export type Trappe = (typeof TRAPPER_NAVNE)[number];

/** Grunden bag et nej: nichen er optaget (ventelisten), for tidligt, andet. Værd at kende også uden tilbud (Jonas 18/9). */
export const AFSLAGSGRUNDE = ["niche", "for_tidligt", "andet"] as const;
export type Afslagsgrund = (typeof AFSLAGSGRUNDE)[number];

/** Hvad en grund fører med sig — niche: ventelisten og afslagsmailen; for_tidligt: afslagsmailen; andet/ingen: intet (Jonas skriver selv). */
export function afslagsFoelger(grund: Afslagsgrund | null | undefined): { venteliste: boolean; afslagsmail: boolean } {
  if (grund === "niche") return { venteliste: true, afslagsmail: true };
  if (grund === "for_tidligt") return { venteliste: false, afslagsmail: true };
  return { venteliste: false, afslagsmail: false };
}

export type Handling =
  | { art: "tal_med_dem" }
  | { art: "afvis"; grund?: Afslagsgrund }
  | { art: "book" }
  | { art: "aflys_booking" }
  | { art: "afholdt" }
  | { art: "tilbud" }
  | { art: "afslag"; grund?: Afslagsgrund }
  | { art: "underskrevet" }
  | { art: "svarer_ikke" }
  | { art: "udloeb" }
  | { art: "ikke_nu" }
  /** Rådgiveren sætter eller flytter pausen til en dato («YYYY-MM-DD», dansk kalender). */
  | { art: "saet_pause"; til: string }
  /** Pausen ophæves nu — rådgiveren, ansøgeren eller køen på datoen; kræver harPause. */
  | { art: "genoptag" }
  | { art: "luk"; aarsag: Lukkeaarsag }
  | { art: "genaabn" };
export type HandlingsArt = Handling["art"];

/** Handlinger et menneske må udføre fra fladen (Bucket A, rådgiver). */
export const MENNESKE_HANDLINGER: readonly HandlingsArt[] = [
  "tal_med_dem",
  "afvis",
  "afholdt",
  "tilbud",
  "afslag",
  "underskrevet",
  "luk",
  "genaabn",
  "saet_pause",
  "genoptag",
];

/** Handlinger systemet udfører (webhook, kø, ansøgerens link). */
export const SYSTEM_HANDLINGER: readonly HandlingsArt[] = [
  "book",
  "aflys_booking",
  "afholdt",
  "svarer_ikke",
  "udloeb",
  "ikke_nu",
  "genoptag",
];

export interface Overgang {
  til: Trin;
  lukkeaarsag: Lukkeaarsag | null;
  /** Hvilke trapper der annulleres (alle planlagte rækker sættes annulleret). */
  annuller: "alle" | readonly Trappe[];
  /** Hvilken trappe der startes, og om ankeret er «nu», samtalens starttid eller pausens slutdato. */
  /** fraTrinNr: spring trappens første trin over (aflysning: ingen ny dag 0-indkaldelse — aflysningsmailen bærer «vælg en ny tid»). */
  start: { trappe: Trappe; anker: "nu" | "samtale" | "pause"; fraTrinNr?: number } | null;
  /** Sætter pausen: paa_pause_til = pauseTil («YYYY-MM-DD»), eller i dag + 3 måneder når pauseTil er null. */
  saetPause: boolean;
  pauseTil: string | null;
  /** Ophæver en pause (paa_pause_til = null) — enhver anden reaktion end ikke_nu. */
  ophaevPause: boolean;
  /** Skal der skrives en række i ansoegning_beslutninger? (menneskets to beslutninger + lukning/genåbning) */
  beslutning: boolean;
  /** afvis/afslag: grunden bag nej'et (skrives på rækken). */
  afslagsgrund: Afslagsgrund | null;
}

/**
 * Er ansøgningen på pause NU? paa_pause_til er en dansk dato (YYYY-MM-DD) og
 * pausen slutter den dag — en dato i fortiden er ingen pause (rettelse 19/9:
 * fire steder testede rå null — motor, samtale, link, rådgiverside — og
 * cronen som det sidste (19/9), så en pause slap aldrig; cronens pause_slut
 * rydder nu også kolonnen, men dommen må ikke afhænge af det).
 */
export function erPaaPause(paaPauseTil: string | null | undefined, nu: Date): boolean {
  if (!paaPauseTil) return false;
  const iDag = nu.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
  return paaPauseTil > iDag;
}

export interface OvergangsKontekst {
  paaPause: boolean;
  /** Trinnet lukningen skete fra — kun brugt ved genaabn. */
  lukketFraTrin: Trin | null;
  /**
   * Er paa_pause_til sat overhovedet (også på selve slutdatoen, hvor paaPause er falsk)?
   * Kun genoptag bruger den — køens pause_slut kører den dag. Udeladt = paaPause (fladen).
   */
  harPause?: boolean;
}

/** Det afvis/afslag lægger oven på lukningen: grunden, og afslagsmailen (trappen «afslag») når grunden giver en. */
function afslagetsFoelger(h: { grund?: Afslagsgrund }): Partial<Overgang> {
  const grund = h.grund ?? null;
  return { afslagsgrund: grund, start: afslagsFoelger(grund).afslagsmail ? { trappe: "afslag", anker: "nu" } : null };
}

export type OvergangsDom = { ok: true; overgang: Overgang } | { ok: false; grund: string };

const AFVIST = (grund: string): OvergangsDom => ({ ok: false, grund });
const OK = (o: Partial<Overgang> & { til: Trin }): OvergangsDom => ({
  ok: true,
  overgang: {
    lukkeaarsag: null,
    annuller: [],
    start: null,
    saetPause: false,
    pauseTil: null,
    afslagsgrund: null,
    ophaevPause: true,
    beslutning: false,
    ...o,
  },
});

/** Hvor en genåbning lander, regnet fra det trin lukningen skete fra. */
export function genaabningsTrin(lukketFra: Trin | null): Trin {
  switch (lukketFra) {
    case "indkaldt":
    case "booket":
      return "indkaldt";
    case "afholdt":
    case "aftalegrundlag_sendt":
      return "afholdt";
    default:
      return "ny";
  }
}

export function afgoerOvergang(fra: Trin, h: Handling, ctx: OvergangsKontekst): OvergangsDom {
  if (fra === "underskrevet") return AFVIST("underskrevet: motoren har afleveret til betalingsforløbet — ingen handling herfra");

  if (h.art === "genaabn") {
    if (fra !== "lukket") return AFVIST(`genaabn: kun en lukket ansøgning kan genåbnes (er ${fra})`);
    const til = genaabningsTrin(ctx.lukketFraTrin);
    return OK({
      til,
      start: til === "indkaldt" ? { trappe: "indkaldt", anker: "nu" } : null,
      beslutning: true,
    });
  }
  if (fra === "lukket") return AFVIST("lukket: kun genaabn er tilladt");

  if (h.art === "genoptag") {
    // Én dom for rådgiveren, ansøgeren og køen (filhovedet): trinnet står, pausen ryddes, ingen trappe startes.
    if (!(ctx.harPause ?? ctx.paaPause)) return AFVIST("genoptag: ansøgningen er ikke på pause");
    return OK({ til: fra, annuller: ["pause"], ophaevPause: true, beslutning: true });
  }

  if (h.art === "luk") {
    return OK({ til: "lukket", lukkeaarsag: h.aarsag, annuller: "alle", beslutning: true });
  }

  if (h.art === "ikke_nu") {
    if (ctx.paaPause) return AFVIST("ikke_nu: ansøgningen er allerede på pause");
    // En booket samtale står i Jonas' kalender — pausen må ikke gemme den væk uden aflysning (recon 19/9, §4).
    if (fra === "booket") return AFVIST("ikke_nu: aflys samtalen først");
    return OK({ til: fra, annuller: "alle", start: { trappe: "pause", anker: "pause" }, saetPause: true, ophaevPause: false });
  }

  if (h.art === "saet_pause") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(h.til)) return AFVIST("saet_pause: datoen skal være «YYYY-MM-DD»");
    return OK({ til: fra, annuller: "alle", start: { trappe: "pause", anker: "pause" }, saetPause: true, pauseTil: h.til, ophaevPause: false, beslutning: true });
  }

  switch (fra) {
    case "ny":
      if (h.art === "tal_med_dem") return OK({ til: "indkaldt", start: { trappe: "indkaldt", anker: "nu" }, beslutning: true });
      if (h.art === "afvis") return OK({ til: "lukket", lukkeaarsag: "afslag_efter_ansoegning", annuller: "alle", beslutning: true, ...afslagetsFoelger(h) });
      if (h.art === "tilbud" || h.art === "underskrevet") return AFVIST("direkte tilbud findes ikke: fra «ny» kan man kun indkalde eller afvise");
      break;
    case "indkaldt":
      if (h.art === "book") return OK({ til: "booket", annuller: ["indkaldt"], start: { trappe: "booket", anker: "samtale" } });
      if (h.art === "svarer_ikke") return OK({ til: "lukket", lukkeaarsag: "svarer_ikke", annuller: "alle" });
      break;
    case "booket":
      if (h.art === "afholdt") return OK({ til: "afholdt", annuller: ["booket"] });
      if (h.art === "aflys_booking") return OK({ til: "indkaldt", annuller: ["booket"], start: { trappe: "indkaldt", anker: "nu", fraTrinNr: 1 } }); // ingen ny dag 0-indkaldelse: aflysningsmailen bærer «vælg en ny tid»; rykkerne dag 2/7/11 og dag 14 kører
      if (h.art === "book") return OK({ til: "booket", annuller: ["booket"], start: { trappe: "booket", anker: "samtale" } }); // flytning: ny tid, ny trappe
      break;
    case "afholdt":
      if (h.art === "tilbud") return OK({ til: "aftalegrundlag_sendt", start: { trappe: "aftalegrundlag", anker: "nu" }, beslutning: true });
      if (h.art === "afslag") return OK({ til: "lukket", lukkeaarsag: "afslag_efter_samtale", annuller: "alle", beslutning: true, ...afslagetsFoelger(h) });
      break;
    case "aftalegrundlag_sendt":
      if (h.art === "underskrevet") return OK({ til: "underskrevet", annuller: "alle", beslutning: true });
      if (h.art === "udloeb") return OK({ til: "lukket", lukkeaarsag: "udloebet", annuller: "alle" });
      break;
  }
  return AFVIST(`${h.art} er ikke tilladt fra «${fra}»`);
}

/** Er trinnet et hvor køen må arbejde? (Ikke lukket, ikke afleveret.) */
export function erAabentTrin(trin: Trin): boolean {
  return trin !== "lukket" && trin !== "underskrevet";
}

/** Hvilket trin en trappe hører til — køen tjekker at ansøgningen stadig står dér før den sender. */
export function trappensTrin(trappe: Trappe): Trin | null {
  switch (trappe) {
    case "indkaldt":
      return "indkaldt";
    case "booket":
      return "booket";
    case "aftalegrundlag":
      return "aftalegrundlag_sendt";
    case "pause":
      return null; // pausen gælder uanset trin
    case "kladde":
      return null; // kladden er før trinnene (indsendt_at is null) — køen tjekker det selv
    case "indsendt":
      return null; // kvitteringen (18/9): gælder uanset hvilket åbent trin ansøgningen står på, når den sendes
    case "venteplads":
      return null; // ventelisten lever på en LUKKET ansøgning — køen tjekker ventepladsen selv
    case "afslag":
      return null; // lever på en LUKKET ansøgning — køen tjekker trin = lukket (TRAPPER_PAA_LUKKET)
  }
}
