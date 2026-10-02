/**
 * webinarMailDom — HVEM får HVILKEN før-webinar-mail HVORNÅR (22/9-2026).
 *
 * Jonas 22/9: platformen sender selv mailene før en session. Klaviyo beholder
 * efter-webinaret, og eWebinars danske bekræftelse (med sin rigtige invite.ics)
 * bliver. Grunden er målt: 159 af 384 tilmeldte så webinaret 22/9 — ca. 40 %.
 *
 * REN OG DENO-FRI, og SPEJLET ORDRET i src/lib/webinar/mailDom.ts
 * (paritetsprøve). Nul imports i begge, så der er ingen stier at oversætte —
 * tidszonen regnes med Intl, som klaviyoDato.ts gør det.
 *
 * DEN HER FIL AFGØR INTET OM TEKSTEN. Emne, HTML og tekstudgave bor i
 * _shared/webinarMailTekster.ts; tidsteksten («tirsdag 13. oktober kl. 11.00»)
 * bor i _shared/klaviyoDato.ts og har ét hjem der. Her er kun: hvem, hvad, hvornår.
 */

// ── Arterne ────────────────────────────────────────────────────────────────

export type MailArt = "bekraeftelse" | "fjorten_dage" | "syv_dage" | "tre_dage" | "en_dag" | "dagen" | "en_time" | "ti_minutter";

/**
 * ALLE arter, databasen kender — ordret webinar_mails_art_check (webinarMail.guard
 * dom 10), i den rækkefølge de blev planlagt. Det er ORDFORRÅDET, ikke det, der
 * sendes: «tre_dage» og «dagen» står her, fordi sporet har rækker med dem
 * (historik), og CHECK'en beholder dem. Det, der SENDES, er AKTIVE_ARTER (læst af
 * PLANEN) — se UDGAAEDE_ARTER.
 *
 * «ti_minutter» (3/10-2026) står SIDST: den er ny og gælder KUN webinarmotorens
 * rækker (Plan.kunMotor). Migrationen 20261003040000 lægger ordet i CHECK'en og
 * SKAL være kørt, før functionen udrulles (23514-fælden, webinarMail.guard dom 10).
 */
export const ARTER: readonly MailArt[] = ["bekraeftelse", "fjorten_dage", "syv_dage", "tre_dage", "en_dag", "dagen", "en_time", "ti_minutter"];

/**
 * DE ARTER, DER BÆRER EWEBINARS invite.ics — inline og vedhæftet, gennem
 * mimeInvitation.ts og Mailguns `/messages.mime`. De andre går ad den
 * almindelige vej uden vedhæftning.
 *
 *   bekraeftelse  — invitationen er hele grunden til, at platformen overtog den.
 *   fjorten_dage  — tilføjet 28/9-2026 (Jonas): de ~217, der tilmeldte sig
 *                   13/10 FØR 22/9 kl. 19:03, har ALDRIG fået en invitation —
 *                   eWebinars bekræftelse var slukket til 15:50, og Klaviyos
 *                   lovede en, der ikke fandtes. Bekræftelsen går aldrig bagud
 *                   (BEKRAEFTELSE_FRA), så det er DENNE mail, der lukker hullet:
 *                   påmindelse og invitation i én, to uger før, til ALLE.
 *
 * Listen står OGSÅ i databasen som CHECK på webinar_mails.invitation
 * (migration 20260928120000). Kildeværnet webinarMail.guard dom 10 holder de to
 * i takt — en art, der vedhæfter uden at stå i CHECK'en, ville sende mailen og
 * derefter tabe sin række i sporet, og sende IGEN fem minutter senere.
 */
export const MED_INVITATION: readonly MailArt[] = ["bekraeftelse", "fjorten_dage"];

export function baererInvitation(art: MailArt): boolean {
  return MED_INVITATION.includes(art);
}

/**
 * Planen, som Jonas satte den 22/9. To slags:
 *   dageFoer + klokke  — en KALENDERDAG før sessionen, på et dansk klokkeslæt.
 *                        Sommertid gør ikke en forskel: «kl. 08:00 dansk» er
 *                        kl. 08:00, uanset om det er juli eller januar.
 *   minutterFoer       — et stykke tid før selve sessionen, absolut.
 */
export interface Plan {
  art: MailArt;
  /** Kalenderdage før sessionens danske dato. */
  dageFoer?: number;
  /** Dansk klokkeslæt på den dag. */
  time?: number;
  minut?: number;
  /** Eller: minutter før sessionens tidspunkt, absolut. */
  minutterFoer?: number;
  /**
   * Eller: FORFALDEN STRAKS, så længe sessionen ligger i fremtiden.
   *
   * Bekræftelsen har intet tidspunkt at regne fra — den skal gå, så snart vi
   * ved, at personen er tilmeldt.
   *
   * En «straks»-mail har derfor INGEN nåde-regel: den kan ikke være for sent
   * på den, for den har aldrig haft et tidspunkt at komme for sent til.
   * Dørene, der lukker den, er sporet (én ok-række pr. person og session),
   * at sessionen er begyndt — og BEKRAEFTELSE_FRA, som holder den fremad:
   * «straks» betyder fra nu af, ikke bagud over alle gamle tilmeldinger.
   */
  straks?: boolean;
  /**
   * INDHENTNINGENS LOFT (30/9-2026): den SIDSTE danske kalenderdag — talt som
   * kalenderdage før sessionens danske dato — hvor en FEJLET mail af arten må
   * indhentes. Teksten afgør loftet, ikke PLANENs næste art: «om en uge» sendt to
   * dage før er forkert, også selv om ingen anden art er planlagt imellem.
   * Udeladt på en tidssat art = INGEN indhentning (fail-closed: for_sent_efter_fejl).
   * Regnestykket pr. art står ved PLANEN; se indhentningSlut.
   */
  indhentesSenestDageFoer?: number;
  /**
   * TIDLIGST (3/10-2026, kun «ti_minutter»): mailen må gå op til så mange ms FØR
   * sit planlagte tidspunkt. Udeladt = 0 — som alle arter før: endnu_ikke indtil
   * tidspunktet. Regnestykket står ved «ti_minutter» i PLANEN.
   */
  tidligstFoerMs?: number;
  /**
   * NÅDEN for netop denne art (3/10-2026, kun «ti_minutter»). Udeladt =
   * SEN_TILMELDING_NAADE_MS (2 timer) — som alle arter før. Se naadeFor.
   */
  naadeMs?: number;
  /**
   * KUN WEBINARMOTORENS RÆKKER (3/10-2026, kun «ti_minutter»): ewebinar_id
   * «P-<uuid>» (erMotorRaekke). eWebinar sender selv sin 10-minutters-mail til
   * sine tilmeldte, så en eWebinar-række må ALDRIG få vores — doemMail svarer
   * «ikke_motor» FØRST, før alt andet. Udeladt = alle rækker, som før.
   */
  kunMotor?: true;
  /** Må mailen først sendes, når sessionen IKKE er begyndt? */
  kraeverIkkeBegyndt: boolean;
}

export const PLANEN: readonly Plan[] = [
  // Bekræftelsen FØRST — både i listen og i tid.
  { art: "bekraeftelse", straks: true, kraeverIkkeBegyndt: true },
  // «Om to uger» kl. 08:00 — påmindelsen MED invitationen (MED_INVITATION).
  // Samme form og samme nåde som de to næste: er tidspunktet passeret med mere
  // end SEN_TILMELDING_NAADE_MS, sendes den aldrig — også for et helt hold.
  //
  // INDHENTNINGENS LOFT pr. art (indhentesSenestDageFoer, 30/9-2026). Regnestykket
  // for en session tirsdag 13/10-2026 kl. 11:00 dansk (09:00Z):
  //   fjorten_dage «om to uger» — planlagt 14 dage før (29/9 08:00). Loft 8 dage før
  //     = 13/10 − 8 = 5/10, til og med 5/10 23:59 dansk (5/10 22:00Z er slut).
  //     8 = 14 − 6: dagen før syv_dage (7 dage før) — senere ville «om to uger» og
  //     «om en uge» komme på samme dag. Uændret fra 29/9. En indhentet
  //     «om to uger» kan altså lande 8 dage før; den bærer invitationen (MED_INVITATION),
  //     og hullet, den lukker, er vigtigere end ordet.
  //   syv_dage «om en uge» — planlagt 7 dage før (6/10 08:00). Loft 4 dage før
  //     = 13/10 − 4 = 9/10, til og med 9/10 23:59 dansk (9/10 22:00Z er slut).
  //     4 = 3 + 1: dagen før det gamle tre_dage-tidspunkt (10/10 08:00, 3 dage før)
  //     — præcis den grænse, Jonas sagde ja til 29/9, da tre_dage stod i PLANEN.
  //     Uden loftet ville næste art (en_dag, 12/10) give 11/10 23:59 — to dage før,
  //     hvor «om en uge» er forkert med fem dage.
  //   en_dag «i morgen» — planlagt 1 dag før (12/10 08:00). Loft 1 dag før
  //     = 12/10, til og med 12/10 23:59 dansk (12/10 22:00Z er slut). «I morgen»
  //     er kun sandt på den dato. Uændret (en_time 13/10 gav det samme).
  //   en_time: intet loft — ingen næste art; sessionen_begyndt afgør, som før.
  { art: "fjorten_dage", dageFoer: 14, time: 8, minut: 0, indhentesSenestDageFoer: 8, kraeverIkkeBegyndt: false },
  { art: "syv_dage", dageFoer: 7, time: 8, minut: 0, indhentesSenestDageFoer: 4, kraeverIkkeBegyndt: false },
  { art: "en_dag", dageFoer: 1, time: 8, minut: 0, indhentesSenestDageFoer: 1, kraeverIkkeBegyndt: false },
  // «Om en time» — det er DEN, der bærer join-linket til en, der er på vej.
  { art: "en_time", minutterFoer: 60, kraeverIkkeBegyndt: true },
  // 10-minutters-påmindelsen (3/10-2026, docs/webinarmotor.md §8.4 punkt 3) —
  // KUN motorens rækker (kunMotor): eWebinar sender selv sin 10-minutters-mail.
  //
  // VINDUET OG NÅDEN — regnestykket. Cronen kører i minutterne
  //   9, 14, 24, 27, 29, 37, 39, 44, 47, 57, 59 (job 573, migration 20260922172000)
  // — hullerne er 5, 10, 3, 2, 8, 2, 5, 3, 10, 2, 10 min; det STØRSTE er 10 min.
  // Med det almindelige vindue [T−10, T−10 + 2 t] ville mailen gå på det første
  // slot EFTER T−10, dvs. op til 10 min senere — for en session kl. hh:10 kl. hh:09,
  // ét minut før start. «Om 10 minutter» ville være forkert, og mailen kunne nå
  // frem EFTER starten. Derfor et eget vindue omkring T−10:
  //   tidligst  T − 10 − 5 = T − 15 min  (tidligstFoerMs 5 min; = lobbyens
  //             standard, lobby_min 15 — rummet er åbent, når linket kommer)
  //   senest    T − 10 + 5 = T − 5 min   (naadeMs 5 min; derefter for_sent)
  // Vinduet er 10 min LANGT og LUKKET i begge ender, og intet hul er længere end
  // 10 min — så ét slot falder altid i det for en session på et helt minut (slottet
  // fyrer et par sekunder efter sit minut; i et 10-min-hul ligger det forrige slot
  // på T−15 eller senere, eller det næste på T−5 eller før — prøvet for alle 60
  // minutter i webinarMailDom.test.ts). For en session kl. hh:00: vinduet
  // hh−1:45 … hh−1:55 → slot :47, altså 13 min før. DERFOR siger teksten
  // klokkeslættet («Vi begynder kl. 11.00 — venteværelset er åbent»), aldrig
  // «om 10 minutter» (webinarMailTekster.ts; prøvet i webinarMail.test.ts).
  // ALDRIG EFTER STARTEN: dommens `nu` er kørslens start. Seneste ja = T − 5 min.
  // Budgettet (webinarMailBudget.ts) starter et forsøg uden invitation senest
  // 40 s inde i kørslen, og Mailgun-kaldet har en timeout på 10 s:
  //   T − 5 min + 40 s + 10 s = T − 4 min 10 s — Mailgun har mailen senest dér.
  // Leveringen fra Mailgun til indbakken er UMÅLT (normalt sekunder). Og uanset
  // vinduet svarer kraeverIkkeBegyndt «sessionen_begyndt» fra T. En mail, der
  // ikke nås i vinduet (pause, loft, budget), går ALDRIG — hellere ingen end en
  // sen; der er ingen indhentning (ingen næste art). Sorteringen i planlaegKoersel
  // lægger den lige efter bekræftelserne (kort nåde først).
  { art: "ti_minutter", minutterFoer: 10, tidligstFoerMs: 5 * 60_000, naadeMs: 5 * 60_000, kunMotor: true, kraeverIkkeBegyndt: true },
];

/**
 * ER RÆKKEN WEBINARMOTORENS? ewebinar_id = «P-» + en uuid. ORDRET samme form som
 * webinarMotor/mail.ts' MOTOR_ID_FORM (webinarMail.guard dom 20 sammenligner
 * dem) — gentaget her, fordi dommen har nul imports. Det er kun FILTERET:
 * mailVejDom kræver bagefter, at opslaget siger kilde_system = 'platform', og
 * uden det forsøges mailen ikke.
 */
export const MOTOR_ID_FORM_DOM = /^P-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function erMotorRaekke(ewebinarId: string | null | undefined): boolean {
  return typeof ewebinarId === "string" && MOTOR_ID_FORM_DOM.test(ewebinarId);
}

/** Gælder arten KUN motorens rækker? Læst af PLANEN, aldrig af artens navn. */
export function kunMotor(art: MailArt): boolean {
  return PLANEN.find((p) => p.art === art)?.kunMotor === true;
}

/**
 * FÆRRE PÅMINDELSER (besluttet af Jonas 30/9 kl. 06:06 (morgenlistens D1: "Ja det skal de. Drop de to"),
 * mail-worstcase §4 P1-8). «tre_dage» (kl. 08:00 tre kalenderdage før) og «dagen» (kl. 07:30 på
 * dagen) er taget ud af PLANEN. En deltager får nu: bekræftelse · 14 dage ·
 * 7 dage · 1 dag · 1 time — plus eWebinars egen 10-minutters-mail. −2 pr. session.
 *
 * Ingen migration: CHECK'en beholder ordene (sporet har rækker med dem), og en
 * art, der ikke sendes, kan ikke tabe en række. ARTER er derfor stadig syv
 * (ordforrådet), og AKTIVE_ARTER + UDGAAEDE_ARTER = ARTER (webinarMail.guard dom 10).
 * Teksterne bliver stående i webinarMailTekster.ts: EMNER er et Record<MailArt>,
 * og en udgået art skal kunne tages ind igen ved at lægge dens linje i PLANEN.
 */
export const UDGAAEDE_ARTER: readonly MailArt[] = ["tre_dage", "dagen"];

/**
 * DE ARTER, DER SENDES — læst af PLANEN, i PLANENs rækkefølge, aldrig en
 * håndskrevet liste. planlaegKoersel løber over den, og cronens prøve (`art` i
 * bodyen) afviser alt uden for den.
 */
export const AKTIVE_ARTER: readonly MailArt[] = PLANEN.map((p) => p.art);

/**
 * NÅDEN FOR EN SEN TILMELDING. Melder nogen sig til fire dage før, er
 * «syv_dage»-tidspunktet passeret for længst — og «om en uge ses vi» er
 * forkert. Er tidspunktet passeret med MERE end det her, sendes mailen aldrig.
 *
 * To timer, ikke nul: cronen kører hvert femte minut, men en kørsel kan være
 * afbrudt, en udrulning kan have taget en time, og en mail, der er en time
 * forsinket, er stadig rigtig. En mail, der er en dag forsinket, er ikke.
 */
export const SEN_TILMELDING_NAADE_MS = 2 * 3_600_000;

/** Nåden for en art: dens egen (Plan.naadeMs) eller SEN_TILMELDING_NAADE_MS. Alarmens fristFor læser den. */
export function naadeFor(art: MailArt): number {
  return PLANEN.find((p) => p.art === art)?.naadeMs ?? SEN_TILMELDING_NAADE_MS;
}

/**
 * BEKRÆFTELSEN SENDES ALDRIG BAGUD (Jonas 22/9-2026 ca. kl. 19:05).
 *
 * «Straks»-reglen ovenfor gør bekræftelsen forfalden for ENHVER tilmelding
 * uden en ok-række i sporet — også dem, der meldte sig for måneder siden og
 * for længst HAR fået en bekræftelse et andet sted fra. Det er ikke en
 * teoretisk risiko: målt samme aften har Klaviyos flowmail WFzxH9 sendt
 * bekræftelsen til 556 modtagere de sidste 90 dage, og eWebinars egen danske
 * bekræftelse gik fra kl. 15:50 til 19:03. Tørkørslen kl. 18:54 viste 216
 * forfaldne mails — alle af arten «bekraeftelse», alle til 13/10-holdet.
 *
 * DE FLESTE af dem har fået en bekræftelse ANDETSTEDS — men hvem, er IKKE MÅLT
 * PR. PERSON (rettet 22/9 aften; her stod før «alle til folk, der allerede
 * havde fået én», og det var en slutning, ikke en måling). Det målte er to
 * SUMMER: Klaviyos WFzxH9 har sendt 556 bekræftelser de sidste 90 dage, og
 * eWebinars egen gik 15:50–19:03. Ingen af dem er holdt op mod de 216 navne.
 * Beslutningen står alligevel (Jonas 22/9 ~19:05), fordi den fejler i den rigtige
 * retning: en manglende bekræftelse til en gammel tilmelding er en mangel, en
 * DUBLET til 216 mennesker er en fejl, de kan se.
 *
 * Skillelinjen er det øjeblik, eWebinars bekræftelse blev slukket, og
 * platformens tog over: 22/9-2026 kl. 19:03 dansk = 17:03 UTC. Er tilmeldingen
 * ÆLDRE end det, har et andet system bekræftet den, og vi sender ikke igen.
 *
 * Konstanten har ÉT hjem — her, i dommen, i begge spejle. Cronen kender den
 * ikke, og der er ingen parameter at sætte forkert.
 *
 * KUN bekræftelsen. Påmindelserne er urørte og går til alle: ingen anden
 * har sendt dem, og en påmindelse til en gammel tilmelding er stadig rigtig.
 * «fjorten_dage» (28/9) går netop TIL de gamle: den bærer den invitation,
 * bekræftelsen aldrig gav dem.
 */
export const BEKRAEFTELSE_FRA = "2026-09-22T17:03:00Z";

/** Samme øjeblik som millisekunder — udregnet én gang, aldrig i dommen. */
export const BEKRAEFTELSE_FRA_MS = Date.parse(BEKRAEFTELSE_FRA);

export const TZ = "Europe/Copenhagen";

// ── Dansk tid uden imports (samme metode som _shared/hverdage.ts) ──────────

const FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

interface KbhDele { aar: number; maaned: number; dag: number; time: number; minut: number }

export function kbhDele(d: Date): KbhDele {
  const p: Record<string, string> = {};
  for (const del of FORMAT.formatToParts(d)) p[del.type] = del.value;
  return { aar: Number(p.year), maaned: Number(p.month), dag: Number(p.day), time: Number(p.hour) % 24, minut: Number(p.minute) };
}

/** Den danske tidszones forskydning (ms) fra UTC på et tidspunkt: vægtid − instant. */
function forskydningMs(d: Date): number {
  const p = kbhDele(d);
  return Date.UTC(p.aar, p.maaned - 1, p.dag, p.time, p.minut) - Math.floor(d.getTime() / 60_000) * 60_000;
}

/**
 * Dansk vægtid → UTC-instant. To runder, fordi gættet kan ramme den anden side
 * af et sommertidsskifte; anden runde retter det.
 */
export function kbhTilUtc(aar: number, maaned: number, dag: number, time: number, minut: number): Date {
  const gaet = Date.UTC(aar, maaned - 1, dag, time, minut);
  const f1 = forskydningMs(new Date(gaet));
  let instant = gaet - f1;
  const f2 = forskydningMs(new Date(instant));
  if (f2 !== f1) instant = gaet - f2;
  return new Date(instant);
}

// ── Tidspunktet for én mail ────────────────────────────────────────────────

/**
 * Hvornår skal mailen `art` gå for en session på `sessionTid`?
 * `null` når tiden ikke kan læses — kalderen springer over frem for at gætte.
 */
export function planlagtTid(sessionTid: string, art: MailArt): Date | null {
  const ms = Date.parse(sessionTid);
  if (!Number.isFinite(ms)) return null;
  const plan = PLANEN.find((p) => p.art === art);
  if (!plan) return null;
  // «Straks» har intet tidspunkt at regne. Epoken betyder «forfalden siden
  // altid»; doemMail springer nåde-reglen over for netop de arter, så en
  // bekræftelse aldrig kan blive «for sent».
  if (plan.straks === true) return new Date(0);
  if (plan.minutterFoer !== undefined) return new Date(ms - plan.minutterFoer * 60_000);
  const p = kbhDele(new Date(ms));
  // Kalenderdage trækkes fra på den DANSKE dato, ikke på instantet: 7 dage før
  // en session 13/10 er 6/10, også hen over et sommertidsskifte.
  const dagen = new Date(Date.UTC(p.aar, p.maaned - 1, p.dag) - (plan.dageFoer ?? 0) * 86_400_000);
  return kbhTilUtc(
    dagen.getUTCFullYear(), dagen.getUTCMonth() + 1, dagen.getUTCDate(),
    plan.time ?? 8, plan.minut ?? 0,
  );
}

export type Springgrund =
  | "afmeldt"
  | "ingen_session"
  | "ingen_mail"
  | "for_sent"
  | "endnu_ikke"
  | "sessionen_begyndt"
  | "allerede_sendt"
  // Bekræftelse til en tilmelding fra FØR overtagelsen (BEKRAEFTELSE_FRA).
  | "for_tidlig_tilmelding"
  // En mail, VI fejlede med at sende, og som ikke nåede at blive indhentet, før
  // den næste art tog over (Jonas 29/9 — se INDHENTNING i doemMail).
  | "for_sent_efter_fejl"
  // En påmindelse til en session, der IKKE er personens nærmeste kommende (29/9 —
  // se KUN NÆRMESTE SESSION i planlaegKoersel). Skrives aldrig i sporet.
  | "senere_session"
  // Et tidligere forsøg, hvor vi IKKE ved, om Mailgun tog imod (29/9 — se
  // afsendelseUkendt). Sendes aldrig igen automatisk. Skrives aldrig i sporet.
  | "levering_ukendt"
  // «ti_minutter» til en række, der IKKE er webinarmotorens (Plan.kunMotor, 3/10).
  // Én pr. eWebinar-person og kørsel — beviset for, at eWebinars tilmeldte aldrig
  // får vores 10-minutters-mail. Skrives aldrig i sporet.
  | "ikke_motor";

export type MailDom =
  // `indhentning: true` KUN når mailen sendes, fordi et tidligere forsøg fejlede, og
  // den er mere end nåden forsinket. Nøglen udelades ellers — en almindelig
  // afsendelse er ordret som før.
  | { send: true; art: MailArt; planlagt: Date; indhentning?: true }
  | { send: false; art: MailArt; grund: Springgrund };

/**
 * Skal ÉN mail af ÉN art sendes til ÉN person nu?
 *
 * Rækkefølgen er dommen, og den er fail-closed: alt, der taler imod, tæller
 * FØR det, der taler for.
 */
export function doemMail(i: {
  art: MailArt;
  sessionTid: string | null;
  email: string | null | undefined;
  /** Tilmeldingens registreret_at. KRÆVET — porten foran bekræftelsen er fail-closed. */
  registreretAt: string | null | undefined;
  afmeldt: boolean;
  alleredeSendt: boolean;
  /**
   * Nøglerne (noegle()) for rækker i webinar_mails med udfald <> 'ok' — mails, vi
   * HAR forsøgt at sende og fejlede med. Udeladt = tom: så er dommen ordret som før
   * 29/9, og en forsinket mail er for_sent.
   */
  fejlede?: ReadonlySet<string>;
  /**
   * Nøglerne for forsøg, hvor vi IKKE ved, om Mailgun tog imod (afsendelseUkendt).
   * En nøgle her sendes aldrig igen automatisk — heller ikke inden for nåden.
   * Udeladt = tom.
   */
  ukendte?: ReadonlySet<string>;
  /**
   * true, når personen (samme mail) har en KOMMENDE session, der ligger FØR denne
   * (planlaegKoersel regner det). Så får denne session ingen påmindelser — kun
   * bekræftelsen. Udeladt = false.
   */
  senereSession?: boolean;
  /**
   * Er rækken webinarmotorens (erMotorRaekke)? KUN en art med kunMotor læser den,
   * og den er fail-closed: udeladt = ikke motorens. Arterne uden kunMotor er
   * ordret som før.
   */
  motorRaekke?: boolean;
  nu: Date;
}): MailDom {
  const { art } = i;
  // KUN MOTORENS RÆKKER (3/10) — FØRST, før alt andet: en eWebinar-række får
  // aldrig «ti_minutter», uanset afmelding, spor eller tid.
  if (kunMotor(art) && i.motorRaekke !== true) return { send: false, art, grund: "ikke_motor" };
  if (i.afmeldt) return { send: false, art, grund: "afmeldt" };
  if (i.alleredeSendt) return { send: false, art, grund: "allerede_sendt" };
  const mail = (i.email ?? "").trim().toLowerCase();
  if (!mail || !mail.includes("@")) return { send: false, art, grund: "ingen_mail" };
  if (i.sessionTid === null) return { send: false, art, grund: "ingen_session" };
  const sessionMs = Date.parse(i.sessionTid);
  if (!Number.isFinite(sessionMs)) return { send: false, art, grund: "ingen_session" };

  // INGEN BLIND GENSENDELSE (29/9). Et forsøg med ukendt udfald (timeout, afbrudt
  // forbindelse, 5xx) kan være kommet frem — og Mailgun kan ikke afvise en
  // gentagelse. Det slår alt, der ellers ville sende: nåden OG indhentningen.
  // Regnestykket står ved afsendelseUkendt.
  if (i.ukendte?.has(noegle(mail, i.sessionTid, art)) ?? false) {
    return { send: false, art, grund: "levering_ukendt" };
  }

  // BEKRÆFTELSEN KUN FREMAD. En tilmelding fra før overtagelsen er bekræftet
  // af et andet system — og et ulæseligt tidspunkt tæller som «før», fordi vi
  // hellere undlader en bekræftelse end sender en dublet til 216 mennesker.
  if (art === "bekraeftelse") {
    const registreret = Date.parse(i.registreretAt ?? "");
    if (!Number.isFinite(registreret) || registreret < BEKRAEFTELSE_FRA_MS) {
      return { send: false, art, grund: "for_tidlig_tilmelding" };
    }
  }

  // KUN NÆRMESTE SESSION FÅR PÅMINDELSER (29/9). Er personen også tilmeldt en
  // tidligere kommende session, venter denne sessions påmindelser, til den anden
  // er begyndt — og de, hvis tidspunkt til den tid er passeret, dømmes for_sent
  // nedenfor som enhver sen tilmelding (der er intet fejlet forsøg at indhente).
  if (i.senereSession === true && erPaamindelse(art)) {
    return { send: false, art, grund: "senere_session" };
  }

  const plan = PLANEN.find((p) => p.art === art);
  if (!plan) return { send: false, art, grund: "ingen_session" };
  // «Om en time» (og bekræftelsen) må ALDRIG gå efter starten — så er det ikke
  // en påmindelse, det er en besked om noget, der allerede sker. En art uden
  // plads i PLANEN (UDGAAEDE_ARTER) er svaret ovenfor som ingen_session;
  // planlaegKoersel spørger aldrig om den.
  if (plan.kraeverIkkeBegyndt && i.nu.getTime() >= sessionMs) {
    return { send: false, art, grund: "sessionen_begyndt" };
  }

  const tid = planlagtTid(i.sessionTid, art);
  if (tid === null) return { send: false, art, grund: "ingen_session" };
  // «STRAKS»: forfalden nu, og aldrig for sent. Sessionen er i fremtiden
  // (kraeverIkkeBegyndt ovenfor), sporet er tomt (allerede_sendt ovenfor) —
  // så er der intet mere at spørge om. Tidspunktet i sporet bliver NU, ikke
  // epoken, så rækken kan læses bagud.
  if (plan.straks === true) return { send: true, art, planlagt: i.nu };
  const forsinkelse = i.nu.getTime() - tid.getTime();
  // tidligstFoerMs og naadeMs er udeladt på alle arter undtagen «ti_minutter»:
  // så er det 0 og SEN_TILMELDING_NAADE_MS — ordret som før.
  if (forsinkelse < -(plan.tidligstFoerMs ?? 0)) return { send: false, art, grund: "endnu_ikke" };
  if (forsinkelse > naadeFor(art)) {
    // INDHENTNING (Jonas 29/9-2026). En mail, der er mere end nåden forsinket, kan
    // være forsinket af to grunde, og de to er ikke det samme:
    //   1. PERSONEN KOM FOR SENT — tilmeldte sig fire dage før, og «om en uge ses
    //      vi» er forkert. Så sendes den aldrig: for_sent, som altid.
    //   2. VI FEJLEDE — mailen var forfalden til tiden, men afsendelsen fik et
    //      afslag (29/9: 211 modtagere af fjorten_dage fik Mailguns loft). Så var
    //      personen klar, og det er vores fejl, ikke deres. Den indhentes.
    // BEVISET for 2 er et fejlet forsøg i sporet: cronen forsøger KUN en mail,
    // dommen har kaldt forfalden — altså fandtes personen, og tidspunktet var nået,
    // da forsøget blev gjort. En sen tilmelding har intet fejlet forsøg.
    // GRÆNSEN er den TIDLIGSTE af to (indhentningSlut): den næste tidssatte arts
    // danske kalenderdato (ellers kom «om to uger» og «om en uge» på én dag), og
    // artens eget loft (indhentesSenestDageFoer — teksten skal stadig være sand).
    // Så udløber den med sin egen grund, så svaret viser, at det var en fejlet mail.
    // Teksten er uændret: en indhentet fjorten_dage siger stadig «om to uger».
    if (!(i.fejlede?.has(noegle(mail, i.sessionTid, art)) ?? false)) {
      // Sen tilmelding: «om en uge ses vi» til en, der meldte sig i går, er forkert.
      return { send: false, art, grund: "for_sent" };
    }
    const naeste = naesteTidssatteArt(art);
    // Ingen næste art (en_time, ti_minutter): uændret. «Om en time» mere end to
    // timer forsinket er efter starten, og sessionen_begyndt har allerede svaret
    // ovenfor; «ti_minutter» efter sin nåde (T−5) går aldrig — for_sent.
    if (naeste === null) return { send: false, art, grund: "for_sent" };
    const slut = indhentningSlut(i.sessionTid, art);
    if (slut === null) return { send: false, art, grund: "for_sent_efter_fejl" };
    if (i.nu.getTime() < slut.getTime()) {
      return { send: true, art, planlagt: tid, indhentning: true };
    }
    return { send: false, art, grund: "for_sent_efter_fejl" };
  }
  return { send: true, art, planlagt: tid };
}

/**
 * ER ARTEN EN PÅMINDELSE? Alt i PLANEN, der har et tidspunkt — altså ikke
 * «straks». Læses af PLANEN, aldrig af artens navn: bekræftelsen er et SVAR på
 * noget, personen lige har gjort (og bærer DEN sessions invite.ics), mens
 * påmindelserne er vores eget initiativ og derfor dem, der kan blive for mange.
 */
export function erPaamindelse(art: MailArt): boolean {
  const plan = PLANEN.find((p) => p.art === art);
  return plan !== undefined && plan.straks !== true;
}

/**
 * VED VI, OM MAILGUN TOG IMOD? (29/9-2026 — en deltager klagede 22/9 over
 * dubletter, og mail-worstcase §1a fandt vejen, platformen selv kunne give én.)
 *
 * Et forsøg, der fejlede, er ikke det samme som en mail, der ikke blev sendt:
 *   timeout            — vi afbrød efter TIMEOUT_MS (10 s). Kroppen var sendt, og
 *                        Mailgun kan have lagt mailen i kø uden at nå at svare.
 *   fejl, status null  — kaldet kastede (forbindelsen afbrudt, nulstillet). Vi
 *                        ved ikke, om det skete før eller efter, Mailgun tog imod.
 *   fejl, status ≥ 500 — Mailgun fik HELE kaldet og svarede med en serverfejl.
 *                        Om beskeden nåede køen først, siger svaret ikke.
 * De tre er UKENDTE. Alt andet er en tydelig afvisning og sendte intet:
 *   loft · noegle_afvist · ugyldig (et 4xx-svar på selve kaldet), ingen_noegle
 *   og ugyldig uden status (vi kaldte aldrig), og fejl med et 4xx (fx 404, 413).
 *
 * Mailgun har INGEN idempotensnøgle på `/messages` (kun `v:`-variabler, som ikke
 * afviser en gentagelse), så et nyt forsøg på et ukendt udfald er et gæt på, at
 * det første ikke kom frem.
 *
 * REGNESTYKKET (hvorfor ALDRIG gensende et ukendt automatisk, heller ikke
 * bekræftelsen):
 *   Gensender vi, og Mailgun tog imod første gang: personen får den SAMME mail to
 *   gange — 1 synlig fejl, præcis den, der blev klaget over 22/9. Et kald, der
 *   når 10 s, har sendt hele kroppen, og Mailgun svarer normalt langt under ét
 *   sekund, så «tog imod» er det sandsynlige udfald, ikke undtagelsen.
 *   Gensender vi ikke, og mailen kom IKKE frem: personen mangler 1 af op til 5
 *   mails (7 før 30/9). For en påmindelse er det 1 af 4, og hver af de andre bærer den samme
 *   knap til join-linket og den samme kalenderrække (webinarMailTekster.ts), og
 *   eWebinar sender selv sin 10-minutters-mail — så tabet er et gentaget budskab.
 *   For BEKRÆFTELSEN (vurderet særskilt, fordi en manglende bekræftelse er værre):
 *   den mister kun invite.ics-filen, ikke adgangen — «om to uger» (MED_INVITATION)
 *   bærer den samme fil til alle, der er tilmeldt 14 dage før, og alle påmindelser
 *   bærer join-knappen og kalenderlinkene. En dublet af bekræftelsen er derimod to
 *   kalenderinvitationer i indbakken. Samme dom: hellere én manglende end én dublet.
 *   Den kørsel, der fik det ukendte svar, tæller det som fejlet, og alarmen
 *   (webinarMailAlarm.doemAlarm, «fejl») går til driftModtager samme time — et
 *   menneske kan så slå op i Mailguns log, om mailen kom frem.
 */
export function afsendelseUkendt(forsoeg: { udfald: string; status: number | null }): boolean {
  if (forsoeg.udfald === "timeout") return true;
  if (forsoeg.udfald === "fejl" && (forsoeg.status === null || forsoeg.status >= 500)) return true;
  return false;
}

/**
 * Den næste art i PLANEN med et tidspunkt (ikke «straks») — eller null for den sidste.
 * Bruges af indhentningSlut som den ene af to grænser.
 *
 * En kunMotor-art («ti_minutter», 3/10) er ALDRIG «den næste»: den gælder kun
 * motorens rækker og er ingen grænse for nogen anden arts indhentning — så kæden
 * for eWebinars rækker er ordret som før (en_time har stadig ingen næste art).
 */
export function naesteTidssatteArt(art: MailArt): MailArt | null {
  const i = PLANEN.findIndex((p) => p.art === art);
  if (i === -1) return null;
  const naeste = PLANEN.slice(i + 1).find((p) => p.straks !== true && p.kunMotor !== true);
  return naeste ? naeste.art : null;
}

/** Dansk midnat (00:00) på den danske dato `dage` kalenderdage før `d`s danske dato. */
function danskMidnatDageFoer(d: Date, dage: number): Date {
  const p = kbhDele(d);
  const dag = new Date(Date.UTC(p.aar, p.maaned - 1, p.dag) - dage * 86_400_000);
  return kbhTilUtc(dag.getUTCFullYear(), dag.getUTCMonth() + 1, dag.getUTCDate(), 0, 0);
}

/**
 * HVORNÅR SLUTTER INDHENTNINGEN af en fejlet mail? Det første instant, hvor den
 * IKKE længere må sendes (eksklusivt): nu < slut → indhent. null = ingen
 * indhentning (straks-arter, en_time, en art uden loft, ulæselig tid).
 *
 * slut = min(A, B):
 *   A  dansk midnat på den næste tidssatte arts danske dato — «aldrig samme dag
 *      som den næste» (Jonas 29/9). nu < A ⟺ nu < næste arts tidspunkt OG ikke på
 *      dens dato, som reglen stod før 30/9.
 *   B  dansk midnat DAGEN EFTER artens loft = midnat (indhentesSenestDageFoer − 1)
 *      dage før sessionens danske dato. Loftet er INKLUSIVT: 4 dage før en session
 *      13/10 er 9/10, og 9/10 23:59 dansk sendes; 10/10 00:00 dansk gør ikke.
 *
 * Session 13/10-2026 kl. 11:00 dansk (09:00Z) — slut (første dansk minut, hvor den
 * IKKE sendes):
 *   fjorten_dage  A = 6/10 00:00 (syv_dage)  B = 6/10 00:00  → 5/10 22:00Z
 *   syv_dage      A = 12/10 00:00 (en_dag)   B = 10/10 00:00 → 9/10 22:00Z
 *   en_dag        A = 13/10 00:00 (en_time)  B = 13/10 00:00 → 12/10 22:00Z
 * webinarMailAlarm.fristFor læser SAMME funktion — alarmen og dommen kan ikke
 * være uenige om, hvornår en ventende mail er tabt.
 */
export function indhentningSlut(sessionTid: string, art: MailArt): Date | null {
  const ms = Date.parse(sessionTid);
  if (!Number.isFinite(ms)) return null;
  const plan = PLANEN.find((p) => p.art === art);
  if (!plan || plan.straks === true || plan.indhentesSenestDageFoer === undefined) return null;
  const naeste = naesteTidssatteArt(art);
  if (naeste === null) return null;
  const naesteTid = planlagtTid(sessionTid, naeste);
  if (naesteTid === null) return null;
  const a = danskMidnatDageFoer(naesteTid, 0);
  const b = danskMidnatDageFoer(new Date(ms), plan.indhentesSenestDageFoer - 1);
  return new Date(Math.min(a.getTime(), b.getTime()));
}

/** Ligger to instants på samme danske kalenderdato? */
export function sammeDanskeDato(a: Date, b: Date): boolean {
  const x = kbhDele(a), y = kbhDele(b);
  return x.aar === y.aar && x.maaned === y.maaned && x.dag === y.dag;
}

// ── Fra rækker til sendinger ───────────────────────────────────────────────

/** Så lidt af webinar_tilmeldinger, som dommen behøver. */
export interface Tilmeldt {
  ewebinar_id: string;
  email: string;
  navn: string | null;
  session_tid: string | null;
  /** Tilmeldingstidspunktet — bekræftelsens port (BEKRAEFTELSE_FRA). */
  registreret_at: string | null;
  webinar_titel: string | null;
  subscribed: string | null;
  sidste_action: string | null;
  join_link: string | null;
  kalender_link: string | null;
  replay_link: string | null;
}

/** Én mail, der skal sendes. Personen er én — uanset hvor mange registreringer. */
export interface Sending {
  email: string;
  sessionTid: string;
  art: MailArt;
  planlagt: string;
  navn: string | null;
  webinarTitel: string | null;
  joinLink: string | null;
  kalenderLink: string | null;
  /** Den registrering, linkene kom fra — til sporet, ikke til nøglen. */
  ewebinarId: string;
  /** Kun sat (true), når mailen indhentes efter et fejlet forsøg (29/9). */
  indhentning?: true;
}

/** «Har personen sagt fra i eWebinar?» — samme regel som webinarAfmelding.erAfmeldt. */
export function erAfmeldtIEwebinar(r: Pick<Tilmeldt, "subscribed" | "sidste_action">): boolean {
  const s = (r.subscribed ?? "").trim().toLowerCase();
  const a = (r.sidste_action ?? "").trim().toLowerCase();
  return s === "unsubscribed" || a === "unsubscribed";
}

/** Nøglen, sporet er unikt på: én mail pr. person pr. session pr. art. */
export function noegle(email: string, sessionTid: string, art: MailArt): string {
  return `${email.trim().toLowerCase()}|${new Date(sessionTid).toISOString()}|${art}`;
}

/**
 * ÉN PERSON, ÉN SESSION — uanset hvor mange registreringer. Den række, der
 * vinder, er den med FLEST links: en gammel registrering uden join_link må
 * ikke slå en ny med. Ved lige stand vinder den, der kom først i listen.
 */
function bedsteRaekke(a: Tilmeldt, b: Tilmeldt): Tilmeldt {
  const vaegt = (r: Tilmeldt) => (r.join_link ? 2 : 0) + (r.kalender_link ? 1 : 0);
  return vaegt(b) > vaegt(a) ? b : a;
}

/**
 * Hele planen for én kørsel: hvilke mails skal sendes NU.
 *
 * `sendte` er nøglerne fra webinar_mails med udfald ok (noegle()). Databasen er
 * stadig dommeren — det unikke indeks forhindrer to samtidige kørsler i at
 * sende det samme — men vi spørger først, så vi ikke bygger 384 mails for at
 * få 384 afvisninger.
 *
 * `afmeldte` er mails fra webinar_afmeldinger (små bogstaver).
 *
 * `fejlede` er nøglerne fra webinar_mails med udfald <> 'ok' (samme noegle()).
 * Udeladt = tom, og planen er ordret som før 29/9 — ingen indhentning.
 *
 * `ukendte` er de fejlede forsøg, afsendelseUkendt kalder ukendte — de sendes
 * aldrig igen automatisk. Udeladt = tom.
 *
 * KUN NÆRMESTE SESSION (29/9-2026). Er samme mail tilmeldt flere KOMMENDE
 * sessioner, får kun den nærmeste påmindelser (erPaamindelse); de senere får kun
 * bekræftelsen. Uden det fik en person tilmeldt 13/10 og 20/10 to hele serier —
 * «om en uge» (13/10) og «om to uger» (20/10) i samme minut 6/10 (mail-worstcase
 * §3 scenarie C: 27 mails på 30 dage, heraf 5 fra den dobbelte serie).
 * «Kommende» = sessionen er ikke begyndt (session_tid > nu). Når den nærmeste
 * begynder, overtager den næste — og en art, hvis tidspunkt er passeret med mere
 * end nåden, er for_sent og indhentes ikke.
 */
export function planlaegKoersel(i: {
  raekker: readonly Tilmeldt[];
  afmeldte: ReadonlySet<string>;
  sendte: ReadonlySet<string>;
  fejlede?: ReadonlySet<string>;
  ukendte?: ReadonlySet<string>;
  nu: Date;
}): { sendinger: Sending[]; sprunget: Record<Springgrund, number> } {
  const sprunget: Record<Springgrund, number> = {
    afmeldt: 0, ingen_session: 0, ingen_mail: 0, for_sent: 0,
    endnu_ikke: 0, sessionen_begyndt: 0, allerede_sendt: 0, for_tidlig_tilmelding: 0,
    for_sent_efter_fejl: 0, senere_session: 0, levering_ukendt: 0, ikke_motor: 0,
  };

  // 1. Én person pr. (mail, session).
  const personer = new Map<string, Tilmeldt>();
  for (const r of i.raekker) {
    const mail = (r.email ?? "").trim().toLowerCase();
    if (r.session_tid === null || !Number.isFinite(Date.parse(r.session_tid))) continue;
    const n = `${mail}|${new Date(r.session_tid).toISOString()}`;
    const har = personer.get(n);
    personer.set(n, har ? bedsteRaekke(har, r) : r);
  }

  // 1b. Den NÆRMESTE kommende session pr. mail (ms). En session, der er begyndt,
  //     er ikke kommende — så overtager den næste.
  const naermeste = new Map<string, number>();
  for (const r of personer.values()) {
    const mail = (r.email ?? "").trim().toLowerCase();
    const ms = Date.parse(r.session_tid as string);
    if (!Number.isFinite(ms) || ms <= i.nu.getTime()) continue; // uden læsbar tid: ingen «nærmeste»
    const har = naermeste.get(mail);
    if (har === undefined || ms < har) naermeste.set(mail, ms);
  }

  // 2. Afmeldingen gælder PERSONEN, ikke registreringen — og den læses på
  //    ALLE personens rækker: en afmelding kan stå på en anden tilmelding end
  //    den kommende (samme regel som klaviyo-profil-cron).
  const afmeldtIEwebinar = new Set<string>();
  for (const r of i.raekker) {
    if (erAfmeldtIEwebinar(r)) afmeldtIEwebinar.add((r.email ?? "").trim().toLowerCase());
  }

  const sendinger: Sending[] = [];
  for (const r of [...personer.values()]) {
    const mail = r.email.trim().toLowerCase();
    const afmeldt = i.afmeldte.has(mail) || afmeldtIEwebinar.has(mail);
    const foersteKommende = naermeste.get(mail);
    const senereSession = foersteKommende !== undefined && Date.parse(r.session_tid as string) > foersteKommende;
    // Den række, der vandt for (mail, session) — er samme mail tilmeldt samme
    // tidspunkt i BEGGE systemer, vinder eWebinars (den har join_link), og så
    // sender eWebinar selv sin 10-minutters-mail.
    const motorRaekke = erMotorRaekke(r.ewebinar_id);
    for (const art of AKTIVE_ARTER) {
      const dom = doemMail({
        art,
        sessionTid: r.session_tid,
        email: mail,
        registreretAt: r.registreret_at,
        afmeldt,
        alleredeSendt: r.session_tid !== null && i.sendte.has(noegle(mail, r.session_tid, art)),
        fejlede: i.fejlede,
        ukendte: i.ukendte,
        senereSession,
        motorRaekke,
        nu: i.nu,
      });
      // `=== false`, ikke `!dom.send`: repoets tsconfig har strict slået fra, og
      // uden strictNullChecks indsnævrer et bart boolean-felt ikke en
      // diskrimineret union (samme fælde som cvrLoft.laesTal).
      if (dom.send === false) { sprunget[dom.grund]++; continue; }
      sendinger.push({
        email: mail,
        sessionTid: new Date(r.session_tid as string).toISOString(),
        art,
        planlagt: dom.planlagt.toISOString(),
        navn: r.navn,
        webinarTitel: r.webinar_titel,
        joinLink: r.join_link,
        kalenderLink: r.kalender_link,
        ewebinarId: r.ewebinar_id,
        ...(dom.indhentning === true ? { indhentning: true as const } : {}),
      });
    }
  }
  // RÆKKEFØLGEN (Jonas 29/9): BEKRÆFTELSER FØRST, derefter ældste planlagte, så
  // mail. Under et loft (MAILGUN_LOFT_PR_TIME, 90 i timen) sendes kun de første
  // i listen, og resten venter til næste kørsel. Før stod der kun «ældste
  // planlagte først» — men en «straks»-mail får planlagt = nu (doemMail), altså
  // det SENESTE tidspunkt af alle. Med 211 indhentede fjorten_dage foran sig
  // ville en ny tilmeldts bekræftelse vente to-tre timer. En bekræftelse er svaret
  // på noget, personen lige har gjort; en indhentet påmindelse kan vente en kørsel.
  // «Straks» læses af PLANEN, ikke af artens navn.
  // KORT NÅDE NÆST (3/10): en art med egen nåde (naadeMs — i dag kun «ti_minutter»,
  // 5 min) står lige efter bekræftelserne; bag 211 indhentede mails ville den tabes.
  // Uden en sådan art i listen er rækkefølgen ordret som før.
  const erStraks = (art: MailArt) => PLANEN.find((p) => p.art === art)?.straks === true;
  const kortNaade = (art: MailArt) => PLANEN.find((p) => p.art === art)?.naadeMs !== undefined;
  sendinger.sort((a, b) =>
    Number(erStraks(b.art)) - Number(erStraks(a.art)) ||
    Number(kortNaade(b.art)) - Number(kortNaade(a.art)) ||
    a.planlagt.localeCompare(b.planlagt) ||
    a.email.localeCompare(b.email));
  return { sendinger, sprunget };
}

// ── Kalenderlinkene ────────────────────────────────────────────────────────

/** Sessionens længde i mailenes kalenderlinks. Webinaret er «en time» (Mortens egne ord). */
export const VARIGHED_MIN = 60;

/** «20261013T090000Z» — Googles form. */
export function googleTid(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Google Kalender. Formen er UOFFICIEL — Google dokumenterer den ikke selv;
 * den bedste kilde er add-event-to-calendar-docs:
 *   action   «A default required parameter with the value TEMPLATE.»
 *   text     «Event title, formatted as text.»
 *   dates    «… formatted as YYYYMMDDTHHmmSSZ/YYYYMMDDTHHmmSSZ. Dates must have
 *             both start and end time or it won't work.»
 *   details  valgfri — beskrivelsen; her står join-linket
 * <https://interactiondesignfoundation.github.io/add-event-to-calendar-docs/services/google.html>
 */
export function googleKalenderUrl(i: { titel: string; sessionTid: string; joinLink: string | null }): string | null {
  const ms = Date.parse(i.sessionTid);
  if (!Number.isFinite(ms)) return null;
  const p = new URLSearchParams();
  p.set("action", "TEMPLATE");
  p.set("text", i.titel);
  p.set("dates", `${googleTid(new Date(ms))}/${googleTid(new Date(ms + VARIGHED_MIN * 60_000))}`);
  if (i.joinLink) {
    p.set("details", `Link til webinaret: ${i.joinLink}`);
    p.set("location", i.joinLink);
  }
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/**
 * Outlook på nettet. Formen er UOFFICIEL — Microsoft dokumenterer den kun i
 * Q&A-svar, og parametrene er: subject, startdt, enddt, body, location, samt
 * `path=/calendar/action/compose` og `rru=addevent`. Tidsformen er «ISO
 * 8601-like: YYYY-MM-DDTHH:mm:ss» — altså en ANDEN form end Googles.
 * <https://learn.microsoft.com/en-us/answers/questions/4619953/want-to-pre-populate-to-cc-subject-body-by-passing>
 */
export function outlookTid(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function outlookKalenderUrl(i: { titel: string; sessionTid: string; joinLink: string | null }): string | null {
  const ms = Date.parse(i.sessionTid);
  if (!Number.isFinite(ms)) return null;
  const p = new URLSearchParams();
  p.set("path", "/calendar/action/compose");
  p.set("rru", "addevent");
  p.set("subject", i.titel);
  p.set("startdt", outlookTid(new Date(ms)));
  p.set("enddt", outlookTid(new Date(ms + VARIGHED_MIN * 60_000)));
  if (i.joinLink) {
    p.set("body", `Link til webinaret: ${i.joinLink}`);
    p.set("location", i.joinLink);
  }
  return `https://outlook.office.com/calendar/0/deeplink/compose?${p.toString()}`;
}
