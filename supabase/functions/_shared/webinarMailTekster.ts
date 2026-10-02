/**
 * webinarMailTekster — de syv før-webinar-mails (22/9-2026; den syvende 28/9).
 *
 * UDGÅET 30/9 (besluttet af Jonas 30/9 kl. 06:06 (morgenlistens D1: "Ja det skal de. Drop de to"),
 * mail-worstcase §4 P1-8): «tre_dage» og «dagen» er taget
 * ud af dommens PLANEN og SENDES IKKE (webinarMailDom.UDGAAEDE_ARTER). Teksterne
 * står her stadig, ubrugte, af tre grunde: EMNER er et Record<MailArt>, og
 * MailArt kender dem (CHECK'en og sporet har ordene); kildeværnet dom 5 læser
 * emnerne i den rækkefølge; og en art tages ind igen ved at lægge dens linje
 * tilbage i PLANEN — uden at skrive teksten igen.
 *
 * TEKSTEN ER MORTENS, IKKE MIN. De fem første er hentet ORDRET fra Klaviyo
 * gennem flowet — fire fra «Jonas - Før webinar» (UiECQS), bekræftelsen fra
 * WFzxH9 — som husets regel kræver
 * (CLAUDE.md, Klaviyo-motoren §6: en flowmails skabelon er en KLON, usynlig i
 * skabelonlisten — find den altid gennem flowet):
 *
 *   bekraeftelse  flow WFzxH9 · flow-message TZWDfu · skabelon XwLpXq
 *                 «Du har en plads — her er hvad der sker nu»
 *   syv_dage  flow-message XYgG3S · skabelon SYKyM6 «Webinar — 7 dage før»
 *   tre_dage  flow-message YvXu7d · skabelon Yn3dix
 *   en_dag    flow-message TpDAEF · skabelon Tx9m4j
 *   dagen     flow-message Y3Rc7W · skabelon VjzeyN
 *
 * Den sjette, `en_time`, findes ikke i Klaviyo — den er NY og skrevet i samme
 * form og samme længde som «dagen» (30 sekunders læsning).
 *
 * Den syvende, `fjorten_dage` (28/9-2026, Jonas), findes heller ikke i Klaviyo.
 * Den er «om to uger»-påmindelsen MED eWebinars invite.ics vedhæftet — som
 * bekræftelsen, og af samme grund: de ~217, der tilmeldte sig 13/10 før 22/9
 * kl. 19:03, har aldrig fået en invitation, og bekræftelsen går aldrig bagud.
 * Teksten er skrevet i Mortens form ud fra det, huset VED om webinaret (de to
 * områder og de fem spørgsmål — ordret fra «tre_dage» og «dagen»); de to er de
 * eneste tekster i filen, der ikke er Mortens egne, og begge er markeret.
 *
 * Den ottende, `ti_minutter` (3/10-2026), er også husets: «Vi begynder kl. 11.00
 * — venteværelset er åbent» (klokkeslættet, aldrig «om 10 minutter»: mailen går
 * 5–15 min før) — KUN til webinarmotorens tilmeldte (dommens kunMotor; eWebinar
 * sender selv sin 10-minutters-mail til sine). Ingen kalenderrække (UDEN_KALENDER)
 * og ingen kalenderfil.
 *
 * ÆNDRET I FORHOLD TIL KLAVIYO, og kun det:
 *   1. `{% unsubscribe %}` → vores eget afmeldingslink (token, ingen login).
 *   2. Tidsteksten sættes ind, hvor mailen omtaler tidspunktet — fra
 *      _shared/klaviyoDato.ts' `webinarTekst`, som har ét hjem. Hvor
 *      Klaviyo-mailen omtalte tidspunktet i ord, står nu «Vi ses <tid>», så
 *      påmindelsen bærer det klokkeslæt, den handler om.
 *   3. Hver mail har fået en KNAP til join-linket og en kalenderrække
 *      (Google · Apple · Outlook). Klaviyo-mailene havde ingen af delene —
 *      det er hele grunden til, at platformen overtager dem.
 *   4. BEKRÆFTELSEN alene: sætningen «Du har fået en kalenderinvitation. Læg
 *      den i din kalender nu …» er FJERNET. Den var sand, da eWebinar sendte
 *      bekræftelsen — men eWebinars bekræftelse var slået FRA indtil 22/9 kl.
 *      15:50 (Jonas' fund), og den slukkes helt, når platformen overtager. Nu
 *      ER invitationen vedhæftet DENNE mail, så teksten siger det, der faktisk
 *      er sket — og kalenderrækken står under den for dem, hvis klient ikke
 *      viser vedhæftningen som en invitation.
 *   5. LØFTET OM ET LINK, «DER KOMMER», ER VÆK (Jonas 22/9 ca. 19:35). Fire
 *      af mailene sagde, at linket kom senere — «Linket til webinaret kommer
 *      en time før», «Du får et link i god tid», «Du får linket en time før
 *      start». Det var sandt i Klaviyo, hvor mailene ingen knap havde; her
 *      står knappen med modtagerens EGET join-link i hver eneste mail (punkt
 *      3). Nu peger teksten på den: «Dit personlige link står herunder».
 *      «dagen» beholder sit løfte om flere, fordi begge dele er sande:
 *      platformen sender «en time før» (arten `en_time`), og eWebinars egen
 *      påmindelse går ti minutter før.
 *
 *   6. OPTAGELSEN LOVES IKKE (Jonas 28/9-2026: «optagelsen sendes IKKE»). «en_dag»
 *      og «en_time» sluttede med «Kan du ikke alligevel? Så gør ingenting — du får
 *      optagelsen bagefter.» — et løfte, KUN Klaviyos efter-flows holdt, og kun for
 *      dem på Hovedlisten med samtykke (recon-webinar-hvem-faar-hvad.md §5.1). Nu:
 *      «Så meld dig til en anden dag — jeg holder webinaret igen.» Ordet
 *      «optagelse» må ikke stå i nogen af de syv arter (prøvet, HTML + tekst + emne).
 *
 * TEKSTEN FØLGER INVITATIONEN (Jonas 28/9-2026). De to arter i MED_INVITATION
 * bærer eWebinars invite.ics — men hentningen er FAIL-SOFT, og kan filen ikke
 * hentes, går mailen alligevel. Så må mailen ikke sige «invitationen er
 * vedhæftet». Byggeren får derfor `invitationVedhaeftet` (cronen ved det, når
 * den bygger: hentningen sker FØR), og `invitationsTekst` vælger sætningen:
 * MED — «invitationen er vedhæftet … sig ja til den»; UDEN — samme afsnit
 * uden løftet, og en sætning, der peger på kalenderrækken herunder. Ordet
 * «vedhæftet» står ALDRIG i en mail, der sendes uden (prøvet, HTML og tekst).
 *
 * MORTENS HILSEN SOM VIDEO (udkast 30/9-2026, _shared/webinarVideo.ts). KUN
 * «en_dag» kan bære den, og kun når cronen giver en `video` (konfigurationen
 * app_config.webinar_en_dag_video er sat, gyldig og tændt — eller det er prøven).
 * `video` er KRÆVET på MailArgs (null = uden), som `invitationVedhaeftet`: en
 * glemt værdi må ikke kunne blive til en blok. Blokken er et afsnit, Bunnys
 * stillbillede (link-wrapped) og en knap «Se Mortens hilsen (N min)» — ingen
 * afspiller, mailklienter kan ikke. Begge links går til husets klik-function.
 * Afsnittet over billedet er HUSETS tekst, ikke Mortens, og undgår med vilje
 * ordet «optage» i alle bøjninger (regel 6). Uden `video` er «en_dag» tegn for
 * tegn som før (prøvet).
 *
 * Layoutet er ordret Mortens: Parkinsans/Manrope, #FAF8F5, 600 px, TOPIX-
 * ordmærke, eyebrow i #A3D9C4, portrættet, hårlinjerne, den grønne boks.
 */
import { webinarKlokke, webinarTekst } from "./klaviyoDato.ts";
import { googleKalenderUrl, outlookKalenderUrl, type MailArt } from "./webinarMailDom.ts";
import { knapTekst, type MailVideo, VIDEO_ART } from "./webinarVideo.ts";

/** Afsenderen, som Jonas satte den 22/9. Adressen er domænet webinar.topix.dk. */
export const AFSENDER = "Morten Larsen <morten@webinar.topix.dk>";
export const SVAR_TIL = "kontakt@topix.dk";
export const PORTRAET = "https://topix.dk/assets/morten-larsen-CP8jk__s.jpg";

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── Layoutet ───────────────────────────────────────────────────────────────

const HOVED = `<!DOCTYPE html>
<html lang="da"><head><meta charset="utf-8"/>
<meta content="width=device-width,initial-scale=1" name="viewport"/>
<meta name="x-apple-disable-message-reformatting"/><title>TITEL</title>
<style>@import url("https://fonts.googleapis.com/css2?family=Parkinsans:wght@700&family=Manrope:wght@400;500;700&display=swap");
body{margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}
img{border:0;outline:none;text-decoration:none;max-width:100%;height:auto}
a{color:#152825}
@media only screen and (max-width:620px){.px{padding-left:24px !important;padding-right:24px !important}.h1{font-size:27px !important;line-height:1.24 !important}}</style></head>`;

const P = (tekst: string, daempet = false): string =>
  `<tr><td class="px" style="padding:22px 56px 0 56px;font-family:'Manrope',Helvetica,Arial,sans-serif;font-size:16px;line-height:29px;color:${daempet ? "#5C6B66" : "#152825"};">${tekst}</td></tr>`;

const FOERSTE = (tekst: string): string =>
  `<tr><td class="px" style="padding:30px 56px 0 56px;font-family:'Manrope',Helvetica,Arial,sans-serif;font-size:16px;line-height:29px;color:#152825;">${tekst}</td></tr>`;

const BOKS = (indhold: string, stor = false): string =>
  `<tr><td class="px" style="padding:26px 56px 0 56px;">
<table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background-color:#EFF6F2;border-radius:6px;" width="100%">
<tr><td style="padding:${stor ? "24px 24px 26px 24px" : "22px 24px 24px 24px"};font-family:${stor ? "'Parkinsans',Helvetica,Arial,sans-serif;font-size:19px;line-height:31px;font-weight:700" : "'Manrope',Helvetica,Arial,sans-serif;font-size:15px;line-height:27px"};color:#152825;">${indhold}</td></tr></table></td></tr>`;

const LINJE = `<tr><td style="padding:26px 56px 0 56px;"><table cellpadding="0" cellspacing="0" role="presentation" width="100%"><tr><td style="border-top:1px solid #D8D4CC;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`;

/**
 * KNAPPEN. Bulletproof-formen med VML, så Outlook på Windows også tegner den
 * som en knap og ikke som et bart link.
 */
const KNAP = (url: string, tekst: string): string =>
  `<tr><td class="px" style="padding:30px 56px 0 56px;">
<table cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="background-color:#152825;border-radius:6px;">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(url)}" style="height:48px;v-text-anchor:middle;width:230px;" arcsize="13%" fillcolor="#152825" stroke="f"><w:anchorlock/><center style="color:#FFFFFF;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;"><![endif]-->
<a href="${esc(url)}" style="display:inline-block;padding:15px 30px;font-family:'Manrope',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:6px;">${esc(tekst)}</a>
<!--[if mso]></center></v:roundrect><![endif]--></td></tr></table></td></tr>`;

/** Kalenderrækken: tre links, tre kalendere. Apple og Outlook-desktop får eWebinars .ics. */
const KALENDER = (google: string | null, ics: string | null, outlook: string | null): string => {
  const dele: string[] = [];
  if (google) dele.push(`<a href="${esc(google)}" style="color:#152825;text-decoration:underline;">Google</a>`);
  if (ics) dele.push(`<a href="${esc(ics)}" style="color:#152825;text-decoration:underline;">Apple</a>`);
  if (outlook) dele.push(`<a href="${esc(outlook)}" style="color:#152825;text-decoration:underline;">Outlook</a>`);
  if (dele.length === 0) return "";
  return `<tr><td class="px" style="padding:16px 56px 0 56px;font-family:'Manrope',Helvetica,Arial,sans-serif;font-size:14px;line-height:24px;color:#5C6B66;">Læg i kalender: ${dele.join(" &middot; ")}</td></tr>`;
};

/**
 * VIDEOBLOKKEN (30/9). Stillbilledet er link-wrapped (hele billedet er et link),
 * 488 px = 600 − 2 × 56 (kolonnens indre bredde). Knappen er bulletproof som
 * KNAP, men i den lyse grønne (#A3D9C4) — «Gå til webinaret» forbliver den mørke,
 * primære handling. Alt-teksten er konfigurationens titel: står billedet tomt
 * (en klient, der blokerer billeder — eller pull zonens referrer-værn), bærer
 * alt-teksten og knappen stadig ærindet.
 */
/** Husets tekst (ikke Mortens). Samme sætning i HTML og tekst; varigheden står på knappen. */
const VIDEO_INTRO = "Jeg har lavet en kort video til dig inden i morgen.";
const VIDEOBLOK = (v: MailVideo): string =>
  P(VIDEO_INTRO) +
  `<tr><td class="px" style="padding:20px 56px 0 56px;"><a href="${esc(v.klikUrl)}" style="text-decoration:none;"><img alt="${esc(v.titel)}" src="${esc(v.stillbilledeUrl)}" width="488" style="display:block;width:100%;max-width:488px;height:auto;border:0;border-radius:6px;"/></a></td></tr>
<tr><td class="px" style="padding:18px 56px 0 56px;">
<table cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="background-color:#A3D9C4;border-radius:6px;">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(v.klikUrl)}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="13%" fillcolor="#A3D9C4" stroke="f"><w:anchorlock/><center style="color:#152825;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;"><![endif]-->
<a href="${esc(v.klikUrl)}" style="display:inline-block;padding:15px 30px;font-family:'Manrope',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#152825;text-decoration:none;border-radius:6px;">${esc(knapTekst(v.varighedMin))}</a>
<!--[if mso]></center></v:roundrect><![endif]--></td></tr></table></td></tr>`;

const BUND = (afmeldUrl: string): string =>
  `<tr><td style="padding:40px 56px 0 56px;"><table cellpadding="0" cellspacing="0" role="presentation" width="100%"><tr><td style="border-top:1px solid #D8D4CC;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td class="px" style="padding:22px 56px 40px 56px;font-family:'Manrope',Helvetica,Arial,sans-serif;font-size:11px;line-height:18px;color:#5C6B66;">Du får denne mail, fordi du har tilmeldt dig webinaret. Du kan <a href="${esc(afmeldUrl)}" style="color:#5C6B66;text-decoration:underline;">afmelde dig her</a>.</td></tr>`;

export interface MailIndhold {
  eyebrow: string;
  overskrift: string;
  laesetid: string;
  /** Hele kroppen mellem hårlinjen og hilsenen. */
  krop: string;
  /** Tekstudgaven af kroppen — afsnit adskilt af tomme linjer. */
  kropTekst: string;
}

export interface MailArgs {
  art: MailArt;
  sessionTid: string;
  webinarTitel: string | null;
  joinLink: string | null;
  kalenderLink: string | null;
  afmeldUrl: string;
  /**
   * Mortens hilsen (30/9) — KRÆVET, null = uden. Kun «en_dag» tegner den;
   * alle andre arter ignorerer den (prøvet på alle aktive arter).
   */
  video: MailVideo | null;
  /**
   * Kom eWebinars invite.ics FAKTISK med i denne mail? KRÆVET, ikke valgfrit:
   * en glemt værdi må ikke kunne blive til et løfte. Cronen sætter den til
   * `ics !== null` efter hentningen; for de fem arter uden invitation er den
   * false og uden virkning på teksten.
   */
  invitationVedhaeftet: boolean;
}

/**
 * DOMMEN OVER KALENDERSÆTNINGEN — ét sted for begge arter i MED_INVITATION.
 * Ren funktion: prøves direkte, og på de færdige mails.
 *
 *   kalenderHtml / kalenderTekst  det, der står efter «Vi ses <tid>.»
 *   linkSted                      «herunder og i invitationen» / «herunder»
 */
export function invitationsTekst(medInvitation: boolean): { kalenderHtml: string; kalenderTekst: string; linkSted: string } {
  if (medInvitation) {
    return {
      kalenderHtml: "Invitationen er vedhæftet denne mail — sig ja til den, så står tiden reserveret i din kalender, og du får en påmindelse af dig selv.",
      kalenderTekst: "Invitationen er vedhæftet denne mail — sig ja til den, så står tiden reserveret i din kalender.",
      linkSted: "herunder og i invitationen",
    };
  }
  // UDEN: intet løfte om en fil, der ikke er der. Kalenderrækken (Google ·
  // Apple · Outlook) står under knappen i alle mails — pegefingeren går dertil.
  return {
    kalenderHtml: "Læg den i din kalender med linkene herunder, så står tiden reserveret, og du får en påmindelse af dig selv.",
    kalenderTekst: "Læg den i din kalender med linkene herunder, så står tiden reserveret.",
    linkSted: "herunder",
  };
}

export interface Mail {
  subject: string;
  html: string;
  text: string;
}

export const WEBINAR_TITEL_STANDARD = "Webinar med Morten Larsen";

/** Emnelinjerne — ORDRET fra Klaviyo-flowet; `en_time` er den nye. */
export const EMNER: Record<MailArt, string> = {
  bekraeftelse: "Du har en plads — her er hvad der sker nu",
  fjorten_dage: "Vi ses om to uger — læg det i kalenderen nu",
  syv_dage: "Et spørgsmål, du kan stille dig selv inden webinaret",
  tre_dage: "De fem spørgsmål, jeg stiller alle mine investeringer",
  en_dag: "Vi ses i morgen — tag én beslutning med",
  dagen: "Det er i dag",
  en_time: "Vi starter om en time — her er dit link",
  // Intet antal minutter: mailen går 5–15 min før (dommens vindue). Klokkeslættet står i mailen.
  ti_minutter: "Venteværelset er åbent — her er dit link",
};

/**
 * MAILS UDEN KALENDERRÆKKE (3/10-2026): «ti_minutter» går 5–15 minutter før
 * starten (dommens vindue) — at lægge sessionen i kalenderen er da ingen hjælp,
 * og en kalenderfil følger den heller ikke (den står ikke i MED_INVITATION).
 * Knappen til rummet er hele ærindet. Alle andre arter: uændret.
 */
export const UDEN_KALENDER: readonly MailArt[] = ["ti_minutter"];

function indhold(art: MailArt, tid: string, medInvitation: boolean, video: MailVideo | null, klokke: string): MailIndhold {
  const inv = invitationsTekst(medInvitation);
  switch (art) {
    case "bekraeftelse":
      return {
        eyebrow: "DU ER TILMELDT",
        overskrift: "Du har en plads.<br/>Her er hvad der sker nu",
        laesetid: "1 minuts læsning",
        krop:
          FOERSTE("Tak, fordi du meldte dig til. Din plads er reserveret, og du skal ikke gøre mere lige nu.") +
          BOKS(`<strong style="font-weight:700;">Vi ses ${esc(tid)}.</strong> ${esc(inv.kalenderHtml)}<br/><br/><strong style="font-weight:700;">Dit personlige link står ${inv.linkSted}</strong> — gem mailen, så har du det, når vi starter.`) +
          P("Webinaret tager en time. Sæt den af, sæt telefonen på lydløs, og hav noget at skrive på. Det er ikke et oplæg, du kan have kørende i baggrunden — det er tal og beslutninger, og du får mest ud af det, hvis du regner med.") +
          P("Vi ses."),
        kropTekst:
          "Tak, fordi du meldte dig til. Din plads er reserveret, og du skal ikke gøre mere lige nu.\n\n" +
          `VI SES ${tid}. ${inv.kalenderTekst}\n\n` +
          `DIT PERSONLIGE LINK STÅR ${inv.linkSted.toUpperCase()} — gem mailen, så har du det, når vi starter.\n\n` +
          "Webinaret tager en time. Sæt den af, sæt telefonen på lydløs, og hav noget at skrive på. Det er ikke et oplæg, du kan have kørende i baggrunden — det er tal og beslutninger, og du får mest ud af det, hvis du regner med.\n\n" +
          "Vi ses.",
      };
    case "fjorten_dage":
      // NY MAIL (28/9) — ikke Mortens egen tekst; samme form og længde som
      // «dagen». Den bærer invitationen (MED_INVITATION), så boksen siger det,
      // der faktisk er sket — vedhæftet, ELLER «læg den i din kalender med
      // linkene herunder» (invitationsTekst). Ingen løfter om et link, der
      // kommer — knappen står herunder.
      return {
        eyebrow: "OM TO UGER",
        overskrift: "Vi ses om to uger.<br/>Læg det i kalenderen nu",
        laesetid: "30 sekunders læsning",
        krop:
          FOERSTE("Om to uger holder jeg webinaret, du har meldt dig til.") +
          BOKS(`<strong style="font-weight:700;">Vi ses ${esc(tid)}.</strong> Læg den i kalenderen nu. ${esc(inv.kalenderHtml)}<br/><br/><strong style="font-weight:700;">Dit personlige link står ${inv.linkSted}.</strong>`) +
          P("Jeg bruger timen på de to områder, jeg mener afgør, om en virksomhed vokser eller står stille — og på de fem spørgsmål, jeg stiller alle mine investeringer. Det er tal og beslutninger, ikke et oplæg, du kan have kørende i baggrunden.") +
          P("Vi ses."),
        kropTekst:
          "Om to uger holder jeg webinaret, du har meldt dig til.\n\n" +
          `VI SES ${tid}. Læg den i kalenderen nu. ${inv.kalenderTekst}\n\n` +
          `DIT PERSONLIGE LINK STÅR ${inv.linkSted.toUpperCase()}.\n\n` +
          "Jeg bruger timen på de to områder, jeg mener afgør, om en virksomhed vokser eller står stille — og på de fem spørgsmål, jeg stiller alle mine investeringer. Det er tal og beslutninger, ikke et oplæg, du kan have kørende i baggrunden.\n\n" +
          "Vi ses.",
      };
    case "syv_dage":
      return {
        eyebrow: "INDEN WEBINARET &middot; OM EN UGE",
        overskrift: "Et spørgsmål, du kan<br/>stille dig selv inden<br/>vi ses",
        laesetid: "1 minuts læsning",
        krop:
          FOERSTE("Om en uge holder jeg webinaret, du har meldt dig til.") +
          P("Indtil da vil jeg give dig ét spørgsmål at tænke over:") +
          BOKS("Hvilken beslutning har du skubbet foran dig længst — og hvad venter du egentlig på?", true) +
          P("De fleste ejerledere, jeg taler med, kan svare på det første med det samme. Det er det andet, der bliver stille. Som regel venter man ikke på noget bestemt — man mangler bare nogen at vende den med.") +
          P("Jeg har lavet fejlene selv, i dba, i Just Eat, i Miinto og i Hungry. På webinaret giver jeg dig det, jeg lærte af dem.") +
          P(`Vi ses ${esc(tid)}. Dit personlige link står herunder.`, true),
        kropTekst:
          "Om en uge holder jeg webinaret, du har meldt dig til.\n\n" +
          "Indtil da vil jeg give dig ét spørgsmål at tænke over:\n\n" +
          "Hvilken beslutning har du skubbet foran dig længst — og hvad venter du egentlig på?\n\n" +
          "De fleste ejerledere, jeg taler med, kan svare på det første med det samme. Det er det andet, der bliver stille. Som regel venter man ikke på noget bestemt — man mangler bare nogen at vende den med.\n\n" +
          "Jeg har lavet fejlene selv, i dba, i Just Eat, i Miinto og i Hungry. På webinaret giver jeg dig det, jeg lærte af dem.\n\n" +
          `Vi ses ${tid}. Dit personlige link står herunder.`,
      };
    case "tre_dage":
      return {
        eyebrow: "OM TRE DAGE",
        overskrift: "De fem spørgsmål,<br/>jeg stiller alle mine<br/>investeringer",
        laesetid: "2 minutters læsning",
        krop:
          FOERSTE("Der er tre dage til, vi ses. Jeg vil kort sige, hvad du går derfra med — så du ved, om du skal rydde kalenderen eller ej.") +
          P("Jeg har investeret i over femten virksomheder. Og jeg stiller de samme fem spørgsmål hver gang. Kan en ejerleder svare på dem uden at lede, er der styr på forretningen. Kan han ikke, ved jeg hvor arbejdet ligger.") +
          BOKS("De fem spørgsmål er den ene halvdel af webinaret. Den anden er de <strong style=\"font-weight:700;\">to områder, jeg mener afgør, om en virksomhed vokser eller står stille</strong>. Dem har jeg brugt tyve år på at finde — dels i dba, Just Eat og Miinto, dels ved at bygge Hungry og sælge den.") +
          P("Jeg har lavet fejlene undervejs. Pointen med timen er, at du slipper for at lave dem igen.") +
          P(`Vi ses ${esc(tid)}. Dit personlige link står herunder og i din kalenderinvitation.`, true),
        kropTekst:
          "Der er tre dage til, vi ses. Jeg vil kort sige, hvad du går derfra med — så du ved, om du skal rydde kalenderen eller ej.\n\n" +
          "Jeg har investeret i over femten virksomheder. Og jeg stiller de samme fem spørgsmål hver gang. Kan en ejerleder svare på dem uden at lede, er der styr på forretningen. Kan han ikke, ved jeg hvor arbejdet ligger.\n\n" +
          "De fem spørgsmål er den ene halvdel af webinaret. Den anden er de to områder, jeg mener afgør, om en virksomhed vokser eller står stille. Dem har jeg brugt tyve år på at finde — dels i dba, Just Eat og Miinto, dels ved at bygge Hungry og sælge den.\n\n" +
          "Jeg har lavet fejlene undervejs. Pointen med timen er, at du slipper for at lave dem igen.\n\n" +
          `Vi ses ${tid}. Dit personlige link står herunder og i din kalenderinvitation.`,
      };
    case "en_dag":
      return {
        eyebrow: "I MORGEN",
        overskrift: "Tag én beslutning<br/>med i morgen",
        laesetid: "1 minuts læsning",
        krop:
          FOERSTE(`Vi ses ${esc(tid)}. Én ting, du kan gøre i aften, så du får mere ud af timen:`) +
          BOKS("Tænk på den beslutning, du har skubbet længst foran dig. Den du ved, du skal tage, men bliver ved med at udskyde — ansættelsen, prisen, kunden der fylder for meget, eller samtalen med investoren.<br/><br/>Hold den i baghovedet i morgen. Alt hvad jeg gennemgår, skal kunne bruges på lige netop den.") +
          P("Det er forskellen på at lære noget og at bruge noget.") +
          (video ? VIDEOBLOK(video) : "") +
          P("Dit personlige link står herunder og i din kalenderinvitation — gem det, så er du klar i morgen.") +
          P("Kan du ikke alligevel? Så meld dig til en anden dag — jeg holder webinaret igen.", true),
        kropTekst:
          `Vi ses ${tid}. Én ting, du kan gøre i aften, så du får mere ud af timen:\n\n` +
          "Tænk på den beslutning, du har skubbet længst foran dig. Den du ved, du skal tage, men bliver ved med at udskyde — ansættelsen, prisen, kunden der fylder for meget, eller samtalen med investoren.\n\n" +
          "Hold den i baghovedet i morgen. Alt hvad jeg gennemgår, skal kunne bruges på lige netop den.\n\n" +
          "Det er forskellen på at lære noget og at bruge noget.\n\n" +
          (video ? `${VIDEO_INTRO}\n\n${knapTekst(video.varighedMin)}: ${video.klikUrl}\n\n` : "") +
          "Dit personlige link står herunder og i din kalenderinvitation — gem det, så er du klar i morgen.\n\n" +
          "Kan du ikke alligevel? Så meld dig til en anden dag — jeg holder webinaret igen.",
      };
    case "dagen":
      return {
        eyebrow: "I DAG",
        overskrift: "Vi ses om lidt",
        laesetid: "30 sekunders læsning",
        krop:
          FOERSTE("Er du klar?") +
          BOKS(`<strong style="font-weight:700;">Vi starter ${esc(tid)}</strong> — dit personlige link står herunder. Du får det igen en time og ti minutter før start.`) +
          P("Hav kaffen klar og luk mailen. Vi bruger timen på de to områder, der afgør, om en virksomheds vækst er sund eller usund — og på de fem spørgsmål, jeg stiller alle mine investeringer.") +
          P("Vi ses om lidt."),
        kropTekst:
          "Er du klar?\n\n" +
          `Vi starter ${tid} — dit personlige link står herunder. Du får det igen en time og ti minutter før start.\n\n` +
          "Hav kaffen klar, luk mailen, og tag noter. Vi bruger timen på de to områder, der afgør, om en virksomhed vokser — og på de fem spørgsmål, jeg stiller alle mine investeringer.\n\n" +
          "Vi ses om lidt.",
      };
    case "en_time":
      // NY MAIL (22/9) — ikke Mortens egen tekst, skrevet i samme form og
      // længde som «dagen». Den korteste af de syv, og den eneste, hvor
      // knappen er hele ærindet.
      return {
        eyebrow: "OM EN TIME",
        overskrift: "Her er dit link",
        laesetid: "10 sekunders læsning",
        krop:
          FOERSTE(`Vi starter ${esc(tid)} — om en time.`) +
          BOKS("Knappen herunder er dit personlige link. Du behøver ikke installere noget; det åbner i browseren.") +
          P("Kan du ikke alligevel? Så meld dig til en anden dag — jeg holder webinaret igen.", true),
        kropTekst:
          `Vi starter ${tid} — om en time.\n\n` +
          "Linket herunder er dit personlige link. Du behøver ikke installere noget; det åbner i browseren.\n\n" +
          "Kan du ikke alligevel? Så meld dig til en anden dag — jeg holder webinaret igen.",
      };
    case "ti_minutter":
      // NY MAIL (3/10-2026) — husets tekst, ikke Mortens; KUN til webinarmotorens
      // tilmeldte (dommens kunMotor — eWebinar sender selv sin til sine). Den
      // korteste af alle: knappen til rummet er hele ærindet. Intet løfte om noget
      // bagefter og ingen påstand om sendingen (D2.1, docs/webinarmotor.md §7).
      //
      // KLOKKESLÆTTET, IKKE ET ANTAL MINUTTER (3/10-2026): mailen går et sted
      // mellem T−15 og T−5 (dommens vindue mod cronens slots) — «om 10 minutter»
      // ville være forkert med op til fem minutter. Teksten skal være sand, så den
      // siger klokkeslættet i dansk tid (webinarKlokke, samme hjælper som
      // webinarTekst). «Venteværelset er åbent» holder, når sessionens lobby_min
      // er standarden 15 (vinduet begynder T−15).
      return {
        eyebrow: "VENTEVÆRELSET ER ÅBENT",
        overskrift: `Vi begynder<br/>${esc(klokke)}`,
        laesetid: "10 sekunders læsning",
        krop:
          FOERSTE(`Vi begynder ${esc(klokke)} — venteværelset er åbent.`) +
          BOKS("Knappen herunder er dit personlige link til rummet. Det åbner i browseren — du behøver ikke installere noget.") +
          P("Find noget at skrive på, og sæt telefonen på lydløs. Vi ses om lidt.") +
          P(`Webinaret: ${esc(tid)}.`, true),
        kropTekst:
          `Vi begynder ${klokke} — venteværelset er åbent.\n\n` +
          "Linket herunder er dit personlige link til rummet. Det åbner i browseren — du behøver ikke installere noget.\n\n" +
          "Find noget at skrive på, og sæt telefonen på lydløs. Vi ses om lidt.\n\n" +
          `Webinaret: ${tid}.`,
      };
  }
}

/**
 * Hele mailen. KASTER ALDRIG på manglende links: uden join_link tegnes ingen
 * knap, og uden kalender_link ingen Apple-link — mailen er stadig hel, og den
 * siger stadig hvornår. En mail uden tidspunkt findes derimod ikke, så en
 * ulæselig session_tid er kalderens fejl og fanges før.
 */
export function bygWebinarMail(a: MailArgs): Mail {
  const tid = webinarTekst(new Date(a.sessionTid));
  const titel = (a.webinarTitel ?? "").trim() || WEBINAR_TITEL_STANDARD;
  // Kun VIDEO_ART kan bære videoen — også hvis en kalder giver den til en anden art.
  const video = a.art === VIDEO_ART ? a.video : null;
  // «kl. 11.00» i dansk tid — kun «ti_minutter» bruger den (3/10).
  const klokke = webinarKlokke(new Date(a.sessionTid));
  const i = indhold(a.art, tid, a.invitationVedhaeftet, video, klokke);
  // UDEN_KALENDER («ti_minutter»): ingen kalenderrække — hverken i HTML eller tekst.
  const medKalender = !UDEN_KALENDER.includes(a.art);
  const google = medKalender ? googleKalenderUrl({ titel, sessionTid: a.sessionTid, joinLink: a.joinLink }) : null;
  const outlook = medKalender ? outlookKalenderUrl({ titel, sessionTid: a.sessionTid, joinLink: a.joinLink }) : null;
  const kalenderLink = medKalender ? a.kalenderLink : null;

  const html = `${HOVED.replace("TITEL", esc(EMNER[a.art]))}
<body style="margin:0;padding:0;background-color:#FAF8F5;">
<table cellpadding="0" cellspacing="0" role="presentation" style="background-color:#FAF8F5;width:100%;" width="100%"><tr><td align="center" style="padding:0;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:600px;margin:0 auto;" width="100%">
<tr><td class="px" style="padding:34px 56px 0 56px;font-family:'Manrope',Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;color:#5C6B66;">TOPIX</td></tr>
<tr><td class="px" style="padding:30px 56px 0 56px;font-family:'Manrope',Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.8px;color:#A3D9C4;">${i.eyebrow}</td></tr>
<tr><td class="px" style="padding:14px 56px 0 56px;"><div class="h1" style="font-family:'Parkinsans',Helvetica,Arial,sans-serif;font-size:32px;line-height:41px;font-weight:700;color:#152825;">${i.overskrift}</div></td></tr>
<tr><td class="px" style="padding:22px 56px 0 56px;">
<table cellpadding="0" cellspacing="0" role="presentation"><tr>
<td style="padding-right:14px;" width="40"><img alt="Morten Larsen" src="${PORTRAET}" style="width:40px;height:auto;border-radius:4px;display:block;" width="40"/></td>
<td style="font-family:'Manrope',Helvetica,Arial,sans-serif;"><div style="font-size:13px;font-weight:500;color:#152825;line-height:18px;">Morten Larsen</div>
<div style="font-size:12px;color:#5C6B66;line-height:16px;">${i.laesetid}</div></td></tr></table></td></tr>
${LINJE}
${i.krop}
${a.joinLink ? KNAP(a.joinLink, "Gå til webinaret") : ""}
${KALENDER(google, kalenderLink, outlook)}
${P("Venlig hilsen<br/>Morten")}
${BUND(a.afmeldUrl)}
</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;

  const tekstDele = [
    i.kropTekst,
    a.joinLink ? `Gå til webinaret: ${a.joinLink}` : "",
    google ? `Læg i kalender — Google: ${google}` : "",
    kalenderLink ? `Læg i kalender — Apple/Outlook: ${kalenderLink}` : "",
    outlook ? `Læg i kalender — Outlook på nettet: ${outlook}` : "",
    "Venlig hilsen\nMorten",
    "---",
    `Du får denne mail, fordi du har tilmeldt dig webinaret. Afmeld dig her: ${a.afmeldUrl}`,
  ].filter((d) => d !== "");

  return { subject: EMNER[a.art], html, text: tekstDele.join("\n\n") };
}
