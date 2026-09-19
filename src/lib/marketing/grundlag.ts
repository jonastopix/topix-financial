/**
 * src/lib/marketing/grundlag.ts
 *
 * LAG 1: DE FAKTA, DER MÅ SKRIVES UD FRA.
 *
 * ── HVORFOR DEN FINDES (19/9-2026) ──────────────────────────────────────────
 * Jonas skrev seks mails til webinarholdet og ramte fagligt forkert i dem alle.
 * Han skrev, at webinaret handler om regnskab og nøgletal. Det handler om to
 * områder, der afgør vækst, og om fem spørgsmål, Morten stiller sine
 * investeringer. Han havde ikke læst tilmeldingssiden og byggede hver mail oven
 * på den forrige antagelse.
 *
 * En agent begår nøjagtig samme fejl — hver gang, og hurtigere — hvis den ikke
 * har fakta at stå på. **Derfor er dette lag vigtigere end selve skrivningen.**
 *
 * ── HVORFOR I REPOET OG IKKE I DATABASEN ────────────────────────────────────
 * Målt mod tre krav:
 *
 *   1. VÆRNET SKAL KUNNE LÆSE DET. `udkastVaern.ts` kører i vitest, og vitest
 *      kan ikke nå prod. Lå fakta i databasen, kunne intet værn kontrollere et
 *      udkast, før det var sendt. Det alene afgør sagen.
 *   2. EN ÆNDRING SKAL KUNNE SES. Prisen, Mortens historik og et citat går ud
 *      til mennesker med vores navn på. «Hvem ændrede prisen, hvornår, og hvem
 *      så det?» er et spørgsmål, git svarer på, og en tabel ikke gør.
 *   3. DER MÅ KUN VÆRE ÉN KILDE. En kopi i databasen ville drive fra denne, og
 *      værnet ville kontrollere den forkerte.
 *
 * PRISEN for valget: en rettelse kræver en PR og en udrulning. Det er accepteret,
 * fordi disse fakta ændrer sig månedligt, ikke dagligt — og fordi en pris, der
 * kan ændres uden review, er en pris, der bliver ændret forkert.
 *
 * HVAD DER VILLE ÆNDRE SVARET: skal ikke-udviklere rette teksten dagligt, er
 * formen database + en natlig eksport til repoet, hvor værnet læser eksporten.
 * Så bevares begge egenskaber. Det er ikke nødvendigt i dag.
 *
 * ── MANGLER ER EN VÆRDI, IKKE EN TOM STRENG ─────────────────────────────────
 * Et faktum, vi ikke har, skal stå som `MANGLER` — ikke som "" og ikke udeladt.
 * Så kan værnet nægte at bruge det, og et menneske kan se, hvad der skal hentes.
 * **Det er den direkte modgift mod fejlen ovenfor:** en agent, der ikke kan se
 * forskel på «ved ikke» og «ikke relevant», opfinder resten.
 */

/** Et faktum, vi endnu ikke har. Aldrig "" — så kan værnet skelne. */
export const MANGLER = "MANGLER" as const;
export type Maaske<T> = T | typeof MANGLER;

export function harVi<T>(v: Maaske<T>): v is T {
  return v !== MANGLER;
}

// ── 1. PRODUKTET ────────────────────────────────────────────────────────────

export const PRODUKT = {
  navn: "The Boardroom",
  hvad: "Tolv måneders sparring for ejerledere med Morten Larsen og Jonas Herlev: et månedligt møde og direkte adgang mellem møderne.",
  /**
   * TO PRISER, OG DE ER IKKE DET SAMME TAL (målt i koden 19/9:
   * `_shared/indgangspris.ts`, `RATE12_TILLAEG_PCT = 5`).
   * 4.375 × 12 = 52.500, altså 50.000 + 5 %. Ratetillægget er finansiering,
   * ikke pris. En agent, der ganger selv, når frem til 52.500 og tror, den har
   * fundet årsprisen — det har den ikke.
   */
  pris: {
    aar_kr: 50000,
    aar_tekst: "50.000 kr. ex moms for et år",
    maaned_kr: 4375,
    maaned_tekst: "4.375 kr. om måneden",
    tillaeg_pct: 5,
    advarsel: "4.375 × 12 = 52.500, ikke 50.000. Månedsprisen bærer et ratetillæg på 5 %. Skriv aldrig 52.500 som årspris, og skriv aldrig at de to beløb er det samme.",
  },
  bindingsperiode_maaneder: 12,
  eksklusivitet: "Ét medlem pr. niche.",
  moedet: {
    hyppighed: "månedligt",
    varighed_timer: 2,
    mellem_moederne: "Direkte adgang i hverdagen — to numre, man kan ringe til, når noget ikke kan vente en måned. Ikke en supportkanal med svartid.",
  },
  maalgruppe: {
    hvem: "ejerledere",
    omsaetning: "to millioner i omsætning eller mere",
  },
  /** Vejen ind. Rækkefølgen er en del af faktummet — samtalen kommer FØR aftalen. */
  vejen_ind: [
    "Du sender en ansøgning (ti minutter).",
    "Morten og Jonas læser den — ikke en maskine. Passer det ikke, siger vi det og skriver hvorfor.",
    "Du taler med Jonas. En halv time, uforpligtende, om hvorvidt det giver mening.",
    "Først derefter er der en aftale at tage stilling til.",
  ],
  ansoegningslink: "https://app.theboardroom.dk/ansoeg?kilde=webinar",
} as const;

// ── 2. AFSENDERNE ───────────────────────────────────────────────────────────

export const MORTEN = {
  navn: "Morten Larsen",
  rolle_i_produktet: "Den ene af de to, man sidder over for. Skriver mailene i første person.",
  /** Hvert punkt er et faktum for sig, så et udkast kan bruge ét uden at tage resten med. */
  historik: [
    "dba.dk",
    "Direktør i Just Eat Danmark 2005-2011",
    "CEO i Miinto med ni markeder",
    "Grundlagde og solgte Hungry.dk til Delivery Hero for 250 mio.",
    "Investor i mere end 15 virksomheder",
    "Kendt fra Løvens Hule",
  ],
  loefte: "Jeg har lavet fejlene – så du slipper for dem.",
} as const;

export const JONAS = {
  navn: "Jonas Herlev",
  rolle_i_produktet: "Den anden af de to. Tager den uforpligtende samtale med ansøgeren.",
  /**
   * MANGLER MED VILJE. Der er ikke oplyst en historik for Jonas, og en agent må
   * ikke digte en. Skal han præsenteres, skal teksten hentes et sted fra først.
   */
  historik: MANGLER as Maaske<readonly string[]>,
  loefte: MANGLER as Maaske<string>,
} as const;

// ── 3. WEBINARET ────────────────────────────────────────────────────────────

export const WEBINAR = {
  /** MANGLER: titlen står på tilmeldingssiden og er ikke oplyst. Hent den. */
  titel: MANGLER as Maaske<string>,
  varighed_minutter: 60,
  set_af: "Mere end 2.000 har set det",
  /**
   * DET, WEBINARET HANDLER OM. Det er her, de seks mails gik galt.
   * Rammen er IKKE «regnskab og nøgletal». Den er disse to punkter.
   */
  emner: [
    "De to områder, der er afgørende for din succes — dem, der afgør, om en virksomhed vokser eller står stille.",
    "De fem faste spørgsmål, Morten forventer sine investeringer kan svare på.",
  ],
  afslutning: "Til sidst nævnes muligheden for et samarbejde.",
  /** MANGLER: de fire målgruppebeskrivelser står ordret på tilmeldingssiden. */
  maalgruppebeskrivelser: MANGLER as Maaske<readonly string[]>,
  optagelseslink: "https://www.topix.dk/webinar/optagelse",
} as const;

// ── 4. TESTIMONIALS — TO KATEGORIER, DER ALDRIG MÅ BLANDES ─────────────────

/**
 * Der findes to slags udtalelser, og forskellen er en EGENSKAB på hvert citat,
 * ikke en note nogen skal huske at læse:
 *
 *   · `medlem`     — er medlem af The Boardroom. Udtaler sig om medlemskabet.
 *                    MÅ bruges som bevis for, at The Boardroom virker.
 *   · `om_morten`  — udtaler sig om Morten som person og bestyrelsesformand,
 *                    fra topix.dk/webinar. Er IKKE medlem. MÅ ALDRIG bruges som
 *                    bevis for, at The Boardroom virker.
 *
 * `maa_bruges_som_medlemsbevis` er skrevet ud på hver enkelt og ikke udledt.
 * En tilladelse skal stå der, ikke regnes ud — så kan den hverken læses forkert
 * eller falde ud, hvis nogen tilføjer en kategori.
 */
export type Kategori = "medlem" | "om_morten";

export interface Testimonial {
  navn: string;
  titel: string;
  virksomhed: string;
  kategori: Kategori;
  /** Tilladelsen, skrevet ud. Værnet håndhæver den. */
  maa_bruges_som_medlemsbevis: boolean;
  citat: Maaske<string>;
  kilde: Maaske<string>;
  /** Kontekst, der gør citatet forståeligt — ikke en del af ordlyden. */
  om: Maaske<string>;
}

export const TESTIMONIALS: readonly Testimonial[] = [
  {
    navn: "Daniel Sand",
    titel: "founder & ejer",
    virksomhed: "remm.dk",
    kategori: "medlem",
    maa_bruges_som_medlemsbevis: true,
    om: "Soloiværksætter. Tre måneder i forløbet. Havde tidligere altid en økonomiansvarlig med.",
    kilde: "medlem af The Boardroom",
    citat:
      "The Boardroom har givet mig ro i maven, når jeg skal træffe større økonomiske beslutninger for remm. I mine tidligere virksomheder har jeg altid haft en økonomiansvarlig med, så da jeg for første gang selv skulle stå for administration og økonomi, følte jeg mig virkelig på dybt vand. Allerede efter tre måneder i forløbet har jeg fået en struktur på plads, der gør, at jeg forstår virksomhedens økonomi, budgetter og likviditet bedre, end jeg nogensinde har gjort før. Jeg kan varmt anbefale The Boardroom til andre soloiværksættere, som står samme sted som mig.",
  },
  {
    navn: "Peter Holst Jacobsen",
    titel: "ejer",
    virksomhed: "Rallysupport",
    kategori: "medlem",
    maa_bruges_som_medlemsbevis: true,
    om: MANGLER,
    kilde: "medlem af The Boardroom",
    citat:
      "God og brugbar undervisning. Jeg har fået masser af god inspiration til at drive min virksomhed, samt god og nærværende feedback på mine udfordringer.",
  },
  // De tre nedenfor er IKKE medlemmer. De udtaler sig om Morten.
  { navn: "Carsten Guldhammer", titel: "Ejer", virksomhed: "Mileage Book", kategori: "om_morten", maa_bruges_som_medlemsbevis: false, om: MANGLER, kilde: "topix.dk/webinar", citat: MANGLER },
  { navn: "Christoffer Hübertz", titel: "Partner & kommerciel direktør", virksomhed: "HeyMate", kategori: "om_morten", maa_bruges_som_medlemsbevis: false, om: MANGLER, kilde: "topix.dk/webinar", citat: MANGLER },
  { navn: "Søren Guldager", titel: "CEO", virksomhed: "inMobile", kategori: "om_morten", maa_bruges_som_medlemsbevis: false, om: MANGLER, kilde: "topix.dk/webinar", citat: MANGLER },
] as const;

export const MEDLEMSUDTALELSER = TESTIMONIALS.filter((t) => t.maa_bruges_som_medlemsbevis);
export const HAR_MEDLEMSUDTALELSER = MEDLEMSUDTALELSER.length > 0;

// ── 4b. BROEN FRA WEBINAR TIL MEDLEMSKAB ───────────────────────────────────

/**
 * DE TO TING ER IKKE DET SAMME, OG DE ER HELLER IKKE UBESLÆGTEDE.
 *
 * Webinaret handler om VÆKSTSTRATEGI — de to områder og de fem spørgsmål.
 * Medlemskabet leverer også ØKONOMISK KONTROL: Daniel Sand fik «en struktur på
 * plads», så han forstår «økonomi, budgetter og likviditet» bedre end før.
 *
 * Broen mellem dem går gennem BESLUTNINGERNE, ikke gennem regnskabet. Daniels
 * egne ord er «ro i maven, når jeg skal træffe større økonomiske beslutninger»
 * — ikke «styr på bogføringen». Tallene er det, man beslutter ud fra; de er
 * ikke emnet.
 *
 * DERFOR: at medlemskabet giver økonomisk kontrol gør IKKE webinaret til et
 * regnskabskursus. Det var præcis den kortslutning, der skete 19/9. Et udkast
 * må gerne love struktur, budgetter og likviditet om MEDLEMSKABET — og må
 * aldrig sige, at det er dét, WEBINARET handler om.
 */
export const BROEN = {
  webinaret_handler_om: "vækststrategi — de to områder og de fem spørgsmål",
  medlemskabet_leverer_ogsaa: "økonomisk kontrol: struktur, budgetter, likviditet",
  broen_gaar_gennem: "beslutningerne",
  formulering: "Tallene er det, du beslutter ud fra. De er ikke emnet.",
  advarsel: "At medlemskabet giver økonomisk kontrol gør ikke webinaret til et regnskabskursus.",
} as const;

// ── 5. SPROGET ──────────────────────────────────────────────────────────────

/**
 * MÅLT, IKKE MENT. Tallene stammer fra to korpora, læst 19/9:
 *   · husets 21 mails i repoet (ansøgningsflow, indgang, fornyelse):
 *     197 brødtekst-strenge, 1 udråbstegn, 0 «vi er glade», 0 superlativer,
 *     102 du/dig/din mod 25 «vi».
 *   · de ti godkendte Klaviyo-skabeloner «Webinar — …»: 597 ord,
 *     0 udråbstegn, 0 superlativer, 35 du/dig/din mod 7 «vi», 15 «jeg».
 */
export const SPROG = {
  maalt: {
    korpus: "21 mails i repoet + 10 godkendte Klaviyo-skabeloner (19/9-2026)",
    udraabstegn_i_klaviyo: 0,
    superlativer: 0,
    du_pr_vi: "5 til 1 — læseren tiltales fem gange så ofte, som afsenderen omtaler sig selv",
    emnelinje_tegn: { korteste: 5, median: 29, laengste: 50 },
  },
  regler: [
    "Dansk. Direkte. Korte sætninger.",
    "Ingen udråbstegn.",
    "Ingen «vi er glade for at kunne tilbyde», ingen «fantastisk», «enestående», «unik».",
    "Skriv til læseren («du»), ikke om afsenderen («vi»).",
    "Morten skriver i første person («jeg»), og signerer med fornavn.",
    "Et spørgsmål er husets vending — brug det frem for et udråb.",
    "Sig prisen og vilkåret ligeud. Skriv aldrig udenom et tal.",
    "Et nej er et acceptabelt svar og skal have plads i teksten.",
  ],
} as const;

// ── 6. DET, DER IKKE MÅ ─────────────────────────────────────────────────────

export const FORBUD = [
  "Opfind aldrig et tal. Står det ikke i dette grundlag, skriv det ikke.",
  "Opfind aldrig et citat. Et citat uden ordlyd i grundlaget findes ikke.",
  "Lov aldrig en frist, der ikke findes — ingen «svar inden 24 timer», ingen «kun i denne uge», medmindre det står her.",
  "Brug aldrig en testimonial om noget, den ikke handler om. De tre er om Morten, ikke om The Boardroom.",
  "Skriv aldrig, at webinaret handler om regnskab eller nøgletal. Det handler om de to områder og de fem spørgsmål.",
  "Skriv aldrig 52.500 kr. som årspris.",
  "Præsentér aldrig Jonas med en historik — vi har ikke skrevet en.",
  "Brug aldrig Carsten, Christoffer eller Søren som bevis for, at The Boardroom virker. De udtaler sig om Morten og er ikke medlemmer. Medlemsbeviset er Daniel Sand og Peter Holst Jacobsen.",
  "Gør aldrig webinaret til et regnskabskursus, fordi medlemskabet giver økonomisk kontrol. Broen går gennem beslutningerne.",
] as const;

// ── Registret, værnet læser ─────────────────────────────────────────────────

/** Alle tal, der må stå i et udkast, som de skrives. */
export const KENDTE_TAL: readonly string[] = [
  "50.000", "4.375", "12", "tolv", "2", "to", "60", "en time", "15", "femten", "250", "2.000", "5", "fem", "ni", "2005", "2011", "ét", "en halv time", "ti minutter",
];

/** Alle links, der må stå i et udkast. */
export const KENDTE_LINKS: readonly string[] = [PRODUKT.ansoegningslink, WEBINAR.optagelseslink];

/** Alle navne, grundlaget kender. Et navn udenfor er en opfindelse. */
export const KENDTE_NAVNE: readonly string[] = [
  MORTEN.navn, JONAS.navn, PRODUKT.navn,
  ...TESTIMONIALS.map((t) => t.navn),
  ...TESTIMONIALS.map((t) => t.virksomhed),
  "Just Eat", "Miinto", "Hungry.dk", "Delivery Hero", "dba.dk", "Løvens Hule",
];

/** Alle citater, der findes. Står et citat ikke her, er det opdigtet. */
export const KENDTE_CITATER: readonly string[] = [
  MORTEN.loefte,
  ...TESTIMONIALS.map((t) => t.citat).filter(harVi),
];

export const GRUNDLAG = {
  produkt: PRODUKT, morten: MORTEN, jonas: JONAS, webinar: WEBINAR,
  testimonials: TESTIMONIALS, medlemsudtalelser: MEDLEMSUDTALELSER, broen: BROEN, sprog: SPROG, forbud: FORBUD,
  kendteTal: KENDTE_TAL, kendteLinks: KENDTE_LINKS, kendteNavne: KENDTE_NAVNE, kendteCitater: KENDTE_CITATER,
} as const;

export type Grundlag = typeof GRUNDLAG;
