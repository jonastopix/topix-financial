/**
 * ansoegningRykkerMails — de seksten mails rykkerkøen kan sende, rene
 * byggere (ingen Deno, ingen afsendelse). Nøglerne er KOE_SKABELONER fra
 * rykkerkoe.ts; guard-testen låser at hver nøgle har en bygger her, og at
 * ingen bygger findes uden nøgle.
 *
 * JONAS TAGER ALLE AFKLARINGSSAMTALER (Jonas D4, 18/9). Det er Jonas der
 * inviterer og taler med dem — ikke Morten. Indkaldelsen følger den
 * godkendte procestekst ordret: «Morten og Jonas læser og vurderer, om The
 * Boardroom er det rigtige for dig. Jonas inviterer dig til en
 * uforpligtende snak, hvor I begge tager stilling til, om der er et match.»
 * Afsenderen er derfor Jonas («Venlig hilsen Jonas Herlev», HILSEN_JONAS),
 * ikke husets HILSEN (Morten). TEKSTERNE ER ET UDKAST — de står samlet i
 * README §7 til Jonas' godkendelse.
 *
 * Hver rykker til en ansøger bærer «ikke nu»-linket (regel 4: tre måneders
 * pause), så et nej altid er ét klik. Samtale-påmindelserne og
 * kladde-påmindelsen gør ikke (der er intet at sætte på pause).
 *
 * RAMMEN ER HUSETS (18/9, anden runde): indgangsMailHtml fra indgangsMail.ts
 * — samme kort, farver, typografi, knap og footer som dag 0/14/25/31,
 * invitationen og fornyelsen (målt 18/9: ansøgningsmailene bar før en kopi af
 * send-notification-emails ramme med systemskrift og uden den grønne linje).
 * Afsenderlinjen er «The Boardroom» — en maskine sender på Jonas' vegne.
 *
 * JONAS' RETTELSER 18/9, ANDEN RUNDE (teksterne er GODKENDT med disse):
 *   1. Pausen er en KNAP, ikke en sætning (PAUSE nedenfor). Alt der kan
 *      klikkes, ligner en knap; knapperne ender på «→».
 *   2. Ingen mail beder om svar på tider: «Alle mine ledige tider kan ses i
 *      kalenderen … Det foregår KUN på linket.» (rykker dag 2 og dag 7).
 *   3. Indkaldelsen uden procesteksten (den står i kvitteringen), «på vegne
 *      af», og «vi tager begge stilling til …» ved tidspunktet.
 *   4. Dagen før samtalen: intet regnskab.
 *   5. Genitiv «ApS'» (genitiv nedenfor); ventelisten i første person.
 *   6. Sidste mail i indkaldt- og aftalegrundlags-trappen bærer IKKE pausen.
 *   7. Ventelisten: to knapper (ja tak / nej tak); «helt uden hårde
 *      følelser» er slettet.
 *   8. Kvitteringsmailen med Jonas' ordlyd; kvitteringsskærmen lover mailen.
 * «Svar på denne mail» står stadig i aftalegrundlagets to rykkere — det
 * virker, fordi cronen sætter replyTo (nedenfor); tider-mailen beder ikke
 * længere om svar (2).
 *
 * JONAS' GENNEMLÆSNING 18/9 (udkast-mailtekster-gennemlaesning): (1) tre
 * mails siger «svar på denne mail» — afsenderen er noreply@, så cronen
 * sætter nu replyTo = KONTAKT_ADRESSE (managedEmail.ts, valgfrit felt;
 * kontakt@theboardroom.dk viderestilles til Jonas — bekræftet af Jonas
 * 18/9). Ordlyden bliver stående. (2) Sidste rykker om samtalen siger
 * «inden tre dage» — rykkeren går dag 11, køen lukker dag 14. (3) Rykkeren
 * dag 4 udgik (sagde det samme som dag 2); trappen er dag 2, 7, 11, og
 * navnene er rykker-1..3.
 */
import { indgangsMailHtml, KONTAKT_ADRESSE } from "./indgangsMail.ts";
import { ANSOEG_STI, TOKEN_PARAM } from "./ansoegningSkema.ts";
import { TZ } from "./hverdage.ts";
import { koeSaetningTilAnsoeger, type AfslagsIndhold } from "./afslagsTilbud.ts";

export const HILSEN_JONAS = "Venlig hilsen\nJonas Herlev";
export const PROCESTEKST = "Morten og Jonas læser og vurderer, om The Boardroom er det rigtige for dig. Jonas inviterer dig til en uforpligtende snak, hvor I begge tager stilling til, om der er et match.";

export interface MailKontekst {
  fornavn: string | null;
  virksomhedsnavn: string;
  /** Jonas' Calendly-link med ansøgningens id (bygBookingUrl). */
  bookingUrl: string;
  /** Ansøgerens egen side efter indsendelse. */
  statusUrl: string;
  ikkeNuUrl: string;
  samtaleStart: Date | null;
  aftaleUrl: string | null;
  /** Kladden: linket tilbage til formularen (/ansoeg?t=…) og hvor mange svar der mangler. */
  token: string;
  manglerSvar: number | null;
  /** Ventelisten (udkast 18/9): kun sat for trappen «venteplads». */
  venteplads?: VentepladsKontekst | null;
  /** Afslagsmailen (18/9): grunden i ansøgerens ord, køpladserne (kun numre — aldrig medlemmets navn) og om der var en samtale. Kun sat for trappen «afslag». */
  afslag?: AfslagsIndhold | null;
  /** Kvitteringen (18/9): de tre svar ansøgeren skrev — så de kan se, vi har dem. */
  svar?: { udfordring: string | null; proevet: string | null; omTolvMaaneder: string | null } | null;
}

/** Et svar klippet til mailen — hele afsnit, højst KVITTERING_SVAR_MAKS tegn, ellers «…». */
export const KVITTERING_SVAR_MAKS = 600;
export function klipSvar(tekst: string | null | undefined): string | null {
  const t = (tekst ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length <= KVITTERING_SVAR_MAKS ? t : `${t.slice(0, KVITTERING_SVAR_MAKS - 1).trimEnd()}…`;
}

export interface VentepladsKontekst {
  /** Afvist for mere end 12 måneder siden → den bløde udgave. */
  bloed: boolean;
  /** Svarfristen (dansk tid i teksten). */
  svarfrist: Date;
  /** Linket der tager pladsen (ansoegning-link, handling tag_pladsen). */
  tagPladsenUrl: string;
  /** Linket der siger nej tak (handling afslaa_pladsen). */
  afslaaPladsenUrl: string;
}

/** «fredag den 25. september» — dansk tid, uden klokkeslæt. */
export function formaterFristdag(d: Date): string {
  return new Intl.DateTimeFormat("da-DK", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
}

export interface Mail {
  emne: string;
  html: string;
  tekst: string;
}

interface Udkast {
  emne: string;
  eyebrow: string;
  afsnit: string[];
  knap: { tekst: string; href: string } | null;
  /** Knap nr. to (ventelisten: «Nej tak — giv den videre →»). */
  knapSekundaer?: { tekst: string; href: string } | null;
  /** Vis pause-knappen (rykkere om samtale/aftale — men ALDRIG den sidste i trappen, Jonas 6). */
  ikkeNu: boolean;
}

const APP_URL = "https://app.theboardroom.dk";

/** B's genoptagelseslink: samme sti og parameter som formularen læser. */
export function genoptagLink(token: string, appUrl: string = APP_URL): string {
  return `${appUrl}${ANSOEG_STI}?${TOKEN_PARAM}=${encodeURIComponent(token)}`;
}

/** «mandag den 21. september kl. 09.00» — dansk tid. */
export function formaterSamtaletid(d: Date): string {
  return new Intl.DateTimeFormat("da-DK", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);
}

function hej(k: MailKontekst): string {
  return k.fornavn ? `Hej ${k.fornavn}` : "Hej";
}

/** Pausen som knap (Jonas 1): spørgsmål, knaptekst, note. Én kilde til HTML og tekst. */
export const PAUSE = {
  spoergsmaal: "Passer det ikke lige nu?",
  knap: "Sæt det på pause i tre måneder →",
  note: "(ét klik — vi skriver ikke imens)",
} as const;

/** «Nordic Byg ApS'» / «Homies» — dansk genitiv: navne på s, x eller z får apostrof (Jonas 5: aldrig «ApSs»). */
export function genitiv(navn: string): string {
  return /[sxzSXZ]$/.test(navn) ? `${navn}'` : `${navn}s`;
}

const BYGGERE: Record<string, (k: MailKontekst) => Udkast> = {
  // Jonas 8 (ordlyden godkendt 18/9). A's blok «her er det, du skrev» er bevaret
  // efter Jonas' tekst — ansøgeren skal kunne se, at vi har svarene.
  "ansoegning-kvittering": (k) => {
    const s = k.svar ?? { udfordring: null, proevet: null, omTolvMaaneder: null };
    const dine = [
      s.udfordring ? `Din største udfordring lige nu: ${klipSvar(s.udfordring)}` : null,
      s.proevet ? `Det du selv har prøvet: ${klipSvar(s.proevet)}` : null,
      s.omTolvMaaneder ? `Om tolv måneder: ${klipSvar(s.omTolvMaaneder)}` : null,
    ].filter((x): x is string => x !== null);
    return {
      emne: "Vi har din ansøgning",
      eyebrow: "Din ansøgning til The Boardroom",
      afsnit: [
        `${hej(k)},`,
        `Tak fordi du søgte om en plads i The Boardroom. Vi har din ansøgning for ${k.virksomhedsnavn}.`,
        "Morten og jeg læser den og vurderer, om vi er det rigtige for dig. Passer det, inviterer jeg dig til en uforpligtende snak, hvor vi begge tager stilling til, om der er et match.",
        "Du hører fra os inden for et par hverdage.",
        ...(dine.length > 0 ? ["Her er det, du skrev, så du kan se, at vi har det:", ...dine] : []),
      ],
      knap: { tekst: "Se din ansøgning →", href: k.statusUrl },
      ikkeNu: false,
    };
  },
  "ansoegning-kladde-paamindelse": (k) => {
    const rest = k.manglerSvar ?? 0;
    const status = rest === 0
      ? "Du har svaret på det hele — der mangler kun at trykke send."
      : rest === 1
        ? "Du mangler ét spørgsmål."
        : `Du mangler ${rest} spørgsmål — det tager et par minutter.`;
    return {
      emne: "Din ansøgning til The Boardroom venter på dig",
      eyebrow: "Din ansøgning",
      afsnit: [
        `${hej(k)},`,
        "Du begyndte på en ansøgning til The Boardroom, men blev ikke færdig. Dine svar er gemt.",
        status,
        "Linket er dit — det åbner ansøgningen præcis hvor du slap. Er det ikke aktuelt længere, kan du bare lade det ligge; vi skriver ikke igen.",
      ],
      knap: { tekst: "Fortsæt ansøgningen →", href: genoptagLink(k.token) },
      ikkeNu: false,
    };
  },
  // Jonas 3: uden procesteksten (den står i kvitteringen), «på vegne af»,
  // og «vi tager begge stilling til» ved tidspunktet.
  "ansoegning-indkaldelse": (k) => ({
    emne: "Lad os tage en uforpligtende snak",
    eyebrow: "Din ansøgning til The Boardroom",
    afsnit: [
      `${hej(k)},`,
      `Tak for din ansøgning på vegne af ${k.virksomhedsnavn}. Jeg har læst den og vil gerne tale med dig.`,
      "Vælg et tidspunkt, der passer dig — samtalen tager 30 minutter, og vi holder den online. Vi tager begge stilling til, om der er et match.",
    ],
    knap: { tekst: "Book samtalen med Jonas →", href: k.bookingUrl },
    ikkeNu: true,
  }),
  // Jonas 2: tiderne ligger i kalenderen — der bedes aldrig om svar på tider. Dag 2:
  "ansoegning-indkaldt-rykker-1": (k) => ({
    emne: "Har du fundet et tidspunkt til vores snak?",
    eyebrow: "Afklaringssamtalen",
    afsnit: [`${hej(k)},`, "Jeg skrev forleden, at jeg gerne vil tale med dig om din ansøgning. Mine ledige tider ligger i kalenderen — det tager to minutter at vælge en."],
    knap: { tekst: "Book samtalen med Jonas →", href: k.bookingUrl },
    ikkeNu: true,
  }),
  // Jonas 2, dag 7: erstatter «svar på denne mail med et par forslag».
  "ansoegning-indkaldt-rykker-2": (k) => ({
    emne: "Der er stadig ledige tider",
    eyebrow: "Afklaringssamtalen",
    afsnit: [`${hej(k)},`, "Der er stadig ledige tider hos mig. Vælg den, der passer dig bedst — også hvis det først er om et par uger."],
    knap: { tekst: "Book samtalen med Jonas →", href: k.bookingUrl },
    ikkeNu: true,
  }),
  // Jonas 6: den sidste i trappen (dag 11) — ingen pause; «inden tre dage» (køen lukker dag 14).
  "ansoegning-indkaldt-rykker-3": (k) => ({
    emne: "Sidste hilsen fra mig om samtalen",
    eyebrow: "Afklaringssamtalen",
    afsnit: [
      `${hej(k)},`,
      "Jeg har skrevet et par gange uden at høre fra dig, så dette er den sidste mail om samtalen. Hører jeg ikke fra dig inden tre dage, lukker vi ansøgningen — og du er velkommen til at søge igen, når det passer bedre.",
    ],
    knap: { tekst: "Book samtalen med Jonas →", href: k.bookingUrl },
    ikkeNu: false,
  }),
  // Jonas 4: intet regnskab dagen før.
  "ansoegning-samtale-i-morgen": (k) => ({
    emne: "I morgen: vores snak",
    eyebrow: "Afklaringssamtalen",
    afsnit: [
      `${hej(k)},`,
      `Vi ses i morgen${k.samtaleStart ? `, ${formaterSamtaletid(k.samtaleStart)}` : ""}. Du skal ikke forberede noget særligt. Jeg vil gerne høre om jeres forretning, og hvad du håber at få ud af The Boardroom.`,
      "Skal tiden flyttes, så brug linket i bekræftelsen fra Calendly.",
    ],
    knap: null,
    ikkeNu: false,
  }),
  "ansoegning-samtale-i-dag": (k) => ({
    emne: "I dag: vores snak",
    eyebrow: "Afklaringssamtalen",
    afsnit: [`${hej(k)},`, `Det er i dag${k.samtaleStart ? ` ${formaterSamtaletid(k.samtaleStart)}` : ""}. Linket til mødet står i bekræftelsen fra Calendly. Jeg glæder mig.`],
    knap: null,
    ikkeNu: false,
  }),
  "ansoegning-aftalegrundlag": (k) => ({
    emne: "Aftalegrundlaget for jeres medlemskab",
    eyebrow: "Efter vores snak",
    afsnit: [
      `${hej(k)},`,
      `Tak for snakken. Som aftalt sender jeg aftalegrundlaget for ${genitiv(k.virksomhedsnavn)} medlemskab af The Boardroom. Læs det igennem i ro og mag — og underskriv, når du er klar.`,
    ],
    knap: k.aftaleUrl ? { tekst: "Læs og underskriv →", href: k.aftaleUrl } : { tekst: "Se din ansøgning →", href: k.statusUrl },
    ikkeNu: true,
  }),
  // «svar på denne mail» virker: cronen sætter replyTo = kontakt@ (A, 18/9).
  "ansoegning-aftalegrundlag-rykker-1": (k) => ({
    emne: "Har du set aftalegrundlaget?",
    eyebrow: "Aftalegrundlaget",
    afsnit: [`${hej(k)},`, "Jeg sendte aftalegrundlaget forleden. Har du spørgsmål til det, så svar på denne mail — ellers ligger det klar her:"],
    knap: k.aftaleUrl ? { tekst: "Læs og underskriv →", href: k.aftaleUrl } : { tekst: "Se din ansøgning →", href: k.statusUrl },
    ikkeNu: true,
  }),
  "ansoegning-aftalegrundlag-rykker-2": (k) => ({
    emne: "Aftalegrundlaget venter",
    eyebrow: "Aftalegrundlaget",
    afsnit: [`${hej(k)},`, `Pladsen til ${k.virksomhedsnavn} står klar. Det eneste der mangler, er din underskrift.`],
    knap: k.aftaleUrl ? { tekst: "Læs og underskriv →", href: k.aftaleUrl } : { tekst: "Se din ansøgning →", href: k.statusUrl },
    ikkeNu: true,
  }),
  "ansoegning-aftalegrundlag-rykker-3": (k) => ({
    emne: "Er der noget vi skal tale om?",
    eyebrow: "Aftalegrundlaget",
    afsnit: [`${hej(k)},`, "Er der noget i aftalegrundlaget, der holder dig tilbage, vil jeg hellere høre det end lade det ligge. Svar på mailen, eller underskriv her:"],
    knap: k.aftaleUrl ? { tekst: "Læs og underskriv →", href: k.aftaleUrl } : { tekst: "Se din ansøgning →", href: k.statusUrl },
    ikkeNu: true,
  }),
  // Jonas 6: den sidste i trappen — ingen pause.
  "ansoegning-aftalegrundlag-rykker-4": (k) => ({
    emne: "Sidste hilsen om aftalegrundlaget",
    eyebrow: "Aftalegrundlaget",
    afsnit: [
      `${hej(k)},`,
      "Dette er den sidste mail om aftalegrundlaget. Hører jeg ikke fra dig inden for en uge, lader vi det udløbe — og du er velkommen til at vende tilbage, når det passer bedre.",
    ],
    knap: k.aftaleUrl ? { tekst: "Læs og underskriv →", href: k.aftaleUrl } : { tekst: "Se din ansøgning →", href: k.statusUrl },
    ikkeNu: false,
  }),
  // ── Ventelisten — ingen pause: ansøgningen er lukket, svaret er ja eller
  //    nej til pladsen. Jonas 7: TO knapper, ingen sætning at misforstå.
  //    Jonas 5: første person. Uden venteplads-kontekst (kun i test) bygges
  //    den almindelige udgave med en tom frist og uden nej-knappen.
  "ansoegning-venteplads-tilbud": (k) => {
    const v = k.venteplads ?? null;
    const frist = v ? ` Svar senest ${formaterFristdag(v.svarfrist)} — ellers går pladsen videre til den næste i køen.` : "";
    const knap = { tekst: "Ja tak, jeg vil have pladsen →", href: v?.tagPladsenUrl ?? k.statusUrl };
    const knapSekundaer = v ? { tekst: "Nej tak — giv den videre →", href: v.afslaaPladsenUrl } : null;
    if (v?.bloed) {
      return {
        emne: "Vi har en plads nu — er det stadig aktuelt?",
        eyebrow: "Ventelisten",
        afsnit: [
          `${hej(k)},`,
          `Da du søgte om medlemskab af The Boardroom, måtte vi sige nej, fordi pladsen i din niche var optaget. Nu er den ledig.`,
          `Der er gået et stykke tid, så jeg spørger helt uforpligtende: er det stadig aktuelt for ${k.virksomhedsnavn}? Sig ja, så inviterer jeg dig til en snak, som da du søgte.${frist}`,
        ],
        knap,
        knapSekundaer,
        ikkeNu: false,
      };
    }
    return {
      emne: "Der er blevet en plads til dig i The Boardroom",
      eyebrow: "Ventelisten",
      afsnit: [
        `${hej(k)},`,
        `Da du søgte om medlemskab, måtte vi sige nej, fordi pladsen i din niche var optaget. Nu er den ledig — og du står først i køen.`,
        `Vil du have den? Sig ja, så inviterer jeg dig til en snak, som da du søgte.${frist}`,
      ],
      knap,
      knapSekundaer,
      ikkeNu: false,
    };
  },
  "ansoegning-venteplads-rykker": (k) => {
    const v = k.venteplads ?? null;
    return {
      emne: "Pladsen er stadig din — indtil fristen",
      eyebrow: "Ventelisten",
      afsnit: [
        `${hej(k)},`,
        `Jeg skrev for et par dage siden: der er en ledig plads i The Boardroom til ${k.virksomhedsnavn}.`,
        v ? `Du har den til og med ${formaterFristdag(v.svarfrist)}. Hører jeg ikke fra dig, går den videre til den næste i køen.` : "Hører jeg ikke fra dig, går den videre til den næste i køen.",
        "Siger du ja, inviterer jeg dig til en snak.",
      ],
      knap: { tekst: "Ja tak, jeg vil have pladsen →", href: v?.tagPladsenUrl ?? k.statusUrl },
      knapSekundaer: v ? { tekst: "Nej tak — giv den videre →", href: v.afslaaPladsenUrl } : null,
      ikkeNu: false,
    };
  },
};

// Afslagsmailen (18/9): én skabelon, to åbninger — «tak for snakken» står KUN
// når der var en samtale (efterSamtale = lukkeaarsag afslag_efter_samtale).
// Det siddende medlem nævnes ALDRIG ved navn (Jonas 18/9): køen er «pladsen i
// jeres niche», og teksten kommer fra koeSaetningTilAnsoeger, som ikke kender navnet.
BYGGERE["ansoegning-afslag"] = (k) => {
  const a = k.afslag ?? { grundTekst: "", ventepladser: [], efterSamtale: false };
  const tak = a.efterSamtale
    ? `Tak for din ansøgning for ${k.virksomhedsnavn} — og tak for snakken.`
    : `Tak for din ansøgning for ${k.virksomhedsnavn}.`;
  const afsnit = [`${hej(k)},`, `${tak} Vi må sige nej denne gang. ${a.grundTekst}`.trim()];
  if (a.ventepladser.length > 0) {
    afsnit.push(`Men vi vil gerne have jer med, når der bliver plads: ${koeSaetningTilAnsoeger(a.ventepladser)}. Bliver pladsen ledig, skriver vi til dig — så har du syv dage til at sige ja, før den går videre til den næste.`);
  }
  afsnit.push("Har du spørgsmål, så svar bare på denne mail.");
  return {
    emne: a.ventepladser.length > 0 ? "Vores svar på din ansøgning — og din plads i køen" : "Vores svar på din ansøgning",
    eyebrow: "Din ansøgning til The Boardroom",
    afsnit,
    knap: null,
    ikkeNu: false,
  };
};

export const RYKKER_SKABELONER: readonly string[] = Object.keys(BYGGERE);

function ramme(u: Udkast, k: MailKontekst): string {
  return indgangsMailHtml({
    maerke: true,
    eyebrow: u.eyebrow,
    overskrift: u.emne,
    afsnit: u.afsnit,
    knap: u.knap ? { tekst: u.knap.tekst, url: u.knap.href } : undefined,
    knapSekundaer: u.knapSekundaer ? { tekst: u.knapSekundaer.tekst, url: u.knapSekundaer.href } : undefined,
    knapBredde: 260,
    hilsen: HILSEN_JONAS,
    pause: u.ikkeNu ? { spoergsmaal: PAUSE.spoergsmaal, tekst: PAUSE.knap, url: k.ikkeNuUrl, note: PAUSE.note } : undefined,
    kontaktIFooter: true,
  });
}

/** text/plain — samme ord som HTML'en; knapperne som «tekst link», så den giver mening uden HTML. */
function tekst(u: Udkast, k: MailKontekst): string {
  const linjer = [...u.afsnit];
  if (u.knap) linjer.push("", `${u.knap.tekst} ${u.knap.href}`);
  if (u.knapSekundaer) linjer.push(`${u.knapSekundaer.tekst} ${u.knapSekundaer.href}`);
  linjer.push("", HILSEN_JONAS);
  if (u.ikkeNu) linjer.push("", `${PAUSE.spoergsmaal} ${PAUSE.knap} ${k.ikkeNuUrl} ${PAUSE.note}`);
  linjer.push("", `Spørgsmål? Skriv til ${KONTAKT_ADRESSE}.`);
  return linjer.join("\n");
}

/** null = ukendt skabelon (køen lader rækken fejle højt i stedet for at gætte). */
export function bygRykkerMail(skabelon: string, k: MailKontekst): Mail | null {
  const bygger = BYGGERE[skabelon];
  if (!bygger) return null;
  const u = bygger(k);
  return { emne: u.emne, html: ramme(u, k), tekst: tekst(u, k) };
}

/** Til README/godkendelse: alle mails som ren tekst med en fast kontekst. */
export function alleMailsSomTekst(k: MailKontekst): Array<{ skabelon: string; emne: string; tekst: string }> {
  return RYKKER_SKABELONER.map((s) => {
    const m = bygRykkerMail(s, k)!;
    return { skabelon: s, emne: m.emne, tekst: m.tekst };
  });
}
