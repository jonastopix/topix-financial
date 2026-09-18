/**
 * Indgangens mails — ét layout og fem tekster som rene funktioner.
 *
 * HVORFOR DEN FINDES: målt 2/9 (recon-mailsystemet.md §2.4) findes der
 * INGEN fælles layout-funktion, der bruges. Hver udgående mail bærer sin
 * egen fulde HTML-streng; der er tre familier og fem uafhængige kopier af
 * «The Boardroom by Topix»-headeren — heraf én, brandHeader() i
 * emailButtonHelpers.ts, med nul kaldere. Bygges indgangens fem mails i
 * det landskab, bliver der seks familier. Denne fil er IKKE en oprydning
 * af de eksisterende mails: den er ét layout, som indgangens fem mails
 * deler, og som kan bruges videre.
 *
 * FORMEN er familie A (send-invitation-email FALLBACK_HTML / DB-skabelonen
 * «Invitation til virksomhed»): baggrund #f4f4f5, hvidt kort med radius
 * 10px, header-bjælke #133332, 3px grøn linje #27AE82, brødtekst #4D6663
 * 14px, overskrift #133332 20px 700. Knappen og «virker knappen ikke»-
 * linjen er bulletproofButton() og fallbackLinkBlock() fra
 * emailButtonHelpers.ts — de har kaldere i huset og genbruges her.
 * brandHeader() fra samme fil bruges IKKE: den bærer «by Topix» (se
 * nedenfor), og er ellers præcis samme bjælke.
 *
 * UDEN «by Topix». Efter 1/9 hedder Stripe-kontoen, betalingssiden
 * (/betal) og fakturaerne The Boardroom; mailene var det sidste sted,
 * Topix stod. Headeren siger kun «The Boardroom».
 *
 * FOOTER uden «Ignorer denne besked hvis du ikke forventer den»:
 * modtageren har skrevet under og forventer mailen.
 *
 * TEKSTERNE er skrevet og godkendt 1/9 (rytmen og principperne i
 * docs/indgangen-design.md §9: fristen som DATO, beløbet konkret,
 * faktura-konsekvensen allerede i dag 0, betalingsmodellen nævnes ikke).
 * Fornavn kan mangle — så udelades navnet («Kære,» / «Hej,»), aldrig
 * «Kære ,».
 *
 * REN: ingen IO, ingen Supabase, ingen datoer. Kalderen formaterer
 * fristDato som tekst («2. oktober 2026») og sender beløbet i hele kroner.
 * Alt tekstindhold HTML-escapes her, så et virksomhedsnavn med «&» eller
 * «<» ikke bryder mailen.
 */
import { bulletproofButton, fallbackLinkBlock } from "./emailButtonHelpers.ts";

export interface IndgangsMail {
  subject: string;
  html: string;
}

export interface IndgangsMailArgs {
  overskrift: string;
  afsnit: string[]; // brødtekst, ét afsnit pr. streng
  knap?: { tekst: string; url: string };
  efterKnap?: string[]; // afsnit under knappen
  hilsen: string; // "Venlig hilsen\nMorten Larsen"
  /**
   * Ansøgningsmailene (18/9) deler rammen med indgangen — samme kort, farver,
   * typografi og knap — og får fem VALGFRIE udvidelser. Udelades de, er
   * HTML'en byte for byte som før, så dag 0/14/25/31, invitationen og
   * fornyelsen er urørte (indgangsMail_test.ts).
   */
  eyebrow?: string; // lille grøn overlinje over overskriften («Afklaringssamtalen»)
  knapSekundaer?: { tekst: string; url: string }; // en knap nr. to, hvid med grøn kant, lige under den første
  knapBredde?: number; // px — ansøgningsmailenes knapper er længere («Nej tak — giv den videre →»)
  pause?: { spoergsmaal: string; tekst: string; url: string; note: string }; // «Passer det ikke lige nu?» + knap + note — efter hilsenen
  kontaktIFooter?: boolean; // footeren bærer kontaktadressen som link
  maerke?: boolean; // husets mærke (app.theboardroom.dk/favicon.png) foran ordmærket i headeren
}

const APP_URL = "https://app.theboardroom.dk";
/** Underskriften i medlemsmailene — eksporteret 14/9, så invitationsmailen (invitationsMail.ts) kan signere ens. */
export const HILSEN = "Venlig hilsen\nMorten Larsen";
/**
 * Kontaktadressen i indgangen (besluttet af Jonas 14/9). Mailene sendes fra
 * noreply@theboardroom.dk (managedEmail.ts), så «skriv til mig» og «svar på
 * denne mail» lover et svar ingen læser — adressen skal stå i teksten.
 * Defineret HER, i basismodulet, så dag 0 (nedenfor), fornyelsens
 * kvittering (fornyelsesMail.ts) og invitationsmailen (invitationsMail.ts,
 * som re-eksporterer den) deler én adresse. Låst af
 * src/lib/__tests__/kontaktadresse.guard.test.ts.
 */
export const KONTAKT_ADRESSE = "kontakt@theboardroom.dk";

/** HTML-escaper tekst. Linjeskift (\n) bliver til <br>. Eksporteret 14/9, så invitationsMail.ts kan escape virksomhedsnavnet med samme pen. */
export function esc(tekst: string): string {
  return tekst
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

/** Hele kroner med dansk tusindtalsadskiller: 50000 → «50.000». */
export function formatKr(beloebKr: number): string {
  const hel = Math.round(beloebKr);
  return String(Math.abs(hel)).replace(/\B(?=(\d{3})+(?!\d))/g, ".").replace(/^/, hel < 0 ? "-" : "");
}

/** Øre → dansk kronestreng: hele beløb uden decimaler («2.000»), skæve med to («2.187,50»). Flyttet fra fornyelsesMail.ts 16/9 — dag 31-mailen skal sige fakturaens beløb med ører. */
export function formatKrOere(oere: number): string {
  const kroner = oere / 100;
  const hel = Math.trunc(kroner);
  const rest = Math.round(Math.abs(kroner - hel) * 100);
  const helTekst = formatKr(hel);
  return rest === 0 ? helTekst : `${helTekst},${String(rest).padStart(2, "0")}`;
}

/**
 * Beløbet i dag 31-mailen — det der RENT FAKTISK står på fakturaen (10/9,
 * recon-penge-og-roller.md §1). Før stod der listeprisen «50.000 kr.» uden
 * moms-ord, mens fakturaen lød på 62.500 inkl. moms. «Skriv 62.500» ville
 * lyve: mangler kundens adresse, slår Stripe Tax fra og fakturaen lyder på
 * 50.000; en EU-kunde med gyldigt momsnummer betaler 0 % moms. Cronen
 * sender fakturaen FØR mailen og har totalen i hånden — så mailen tager
 * fakturaens tal:
 *   total kendt + moms beregnet → «62.500 kr. inkl. moms»
 *   total kendt + moms IKKE beregnet → «50.000 kr.» (det er totalen; der er
 *                                        ingen moms på fakturaen)
 *   total ukendt (opslag fejlede) → «50.000 kr. ekskl. moms» — listeprisen,
 *                                        mærket som resten af huset gør det
 * Ører bevares (16/9): 1.250 øre → «12,50 kr. inkl. moms» — målt 16/9 stod
 * der «13 kr.» for en faktura på 12,50 (formatKr rundede til hele kroner).
 */
export function fakturaBeloebTekst(a: {
  totalOere: number | null | undefined;
  momsBeregnet: boolean | null | undefined;
  listeprisKr: number;
}): string {
  if (typeof a.totalOere === "number" && Number.isFinite(a.totalOere) && a.totalOere > 0) {
    const kr = formatKrOere(a.totalOere); // fakturaens tal med ører — «12,50», «62.500», «62.500,50»
    return a.momsBeregnet === true ? `${kr} kr. inkl. moms` : `${kr} kr.`;
  }
  return `${formatKr(a.listeprisKr)} kr. ekskl. moms`;
}

/**
 * Tiltalen: «Kære Lisbeth,» — eller «Kære,» når fornavnet mangler.
 * Aldrig «Kære ,» og aldrig to mellemrum.
 */
export function tiltale(praefiks: string, fornavn: string | null | undefined): string {
  const navn = (fornavn ?? "").trim();
  return navn ? `${praefiks} ${navn},` : `${praefiks},`;
}

const P_STYLE = "color:#4D6663;font-size:14px;line-height:1.6;margin:0 0 14px";

export function indgangsMailHtml(args: IndgangsMailArgs): string {
  const afsnit = args.afsnit.map((a) => `<p style="${P_STYLE}">${esc(a)}</p>`).join("\n");
  const bredde = args.knapBredde ? { width: args.knapBredde } : {};
  const knapPrimaer = args.knap
    ? bulletproofButton({ href: args.knap.url, label: args.knap.tekst, bgColor: "#133332", ...bredde }) +
      "\n" + fallbackLinkBlock(args.knap.url)
    : "";
  // Knap nr. to (ventelisten: «Nej tak — giv den videre →»): hvid med grøn kant, tæt under den første.
  const knapSekundaer = args.knapSekundaer
    ? "\n" + bulletproofButton({ href: args.knapSekundaer.url, label: args.knapSekundaer.tekst, bgColor: "#ffffff", textColor: "#133332", borderColor: "#133332", margin: "-8px 0 24px", ...bredde })
    : "";
  const knap = knapPrimaer + knapSekundaer;
  const efterKnap = (args.efterKnap ?? []).map((a) => `<p style="${P_STYLE}">${esc(a)}</p>`).join("\n");
  const eyebrow = args.eyebrow
    ? `<p style="font-family:'Manrope',Arial,sans-serif;font-size:11px;font-weight:700;color:#27AE82;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px">${esc(args.eyebrow)}</p>\n    `
    : "";
  // Ikonet er mørkegrønt på gennemsigtig bund med X'et skåret ud — på headerens
  // grønne bjælke er det usynligt (målt 18/9 i skærmbillede). Derfor en hvid,
  // afrundet plade bag det, som browserfanen viser det.
  const maerke = args.maerke
    ? `<img src="${APP_URL}/favicon.png" width="24" height="24" alt="" style="display:inline-block;vertical-align:middle;background-color:#ffffff;padding:3px;border-radius:7px;margin-right:10px;border:0">`
    : "";
  // Pausen som en KNAP, ikke en sætning (Jonas 18/9: «kunne ikke se, at det var klikbart»).
  const pause = args.pause
    ? `\n    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;margin:20px 0 0">
      <tr><td style="background-color:#f4f7f6;border-radius:8px;padding:16px 20px 12px;text-align:center">
        <p style="color:#133332;font-size:14px;font-weight:700;line-height:1.4;margin:0">${esc(args.pause.spoergsmaal)}</p>
        ${bulletproofButton({ href: args.pause.url, label: args.pause.tekst, bgColor: "#ffffff", textColor: "#133332", borderColor: "#133332", width: 280, margin: "12px 0 8px" })}
        <p style="color:#4D6663;font-size:12px;line-height:1.5;margin:0">${esc(args.pause.note)}</p>
      </td></tr>
    </table>`
    : "";
  const footer = args.kontaktIFooter
    ? `The Boardroom · theboardroom.dk &nbsp;·&nbsp; <a href="mailto:${KONTAKT_ADRESSE}" style="color:#9ca3af;text-decoration:underline">${KONTAKT_ADRESSE}</a>`
    : "The Boardroom · theboardroom.dk";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background-color:#f4f4f5;font-family:'Manrope',Arial,sans-serif;margin:0;padding:24px 0">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse">
    <tr><td style="background-color:#133332;padding:18px 24px">
      ${maerke}<span style="font-family:'Manrope',Arial,sans-serif;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">The Boardroom</span>
    </td></tr>
    <tr><td style="height:3px;background-color:#27AE82"></td></tr>
  </table>
  <div style="padding:28px 32px 32px">
    ${eyebrow}<h1 style="color:#133332;font-size:20px;font-weight:700;margin:0 0 16px;line-height:1.3">${esc(args.overskrift)}</h1>
${afsnit}
${knap}
${efterKnap}
    <p style="${P_STYLE}margin-top:20px">${esc(args.hilsen)}</p>${pause}
    <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:24px 0 0;border-top:1px solid #eee;padding-top:16px">${footer}</p>
  </div>
</div>
</body>
</html>`;
}

// ── De fem mails ─────────────────────────────────────────────────────

export function dag0Mail(a: {
  fornavn: string | null | undefined;
  betalingsUrl: string;
  fristDato: string;
  beloebKr: number;
}): IndgangsMail {
  return {
    subject: "Velkommen i The Boardroom — sådan kommer du i gang",
    html: indgangsMailHtml({
      overskrift: tiltale("Kære", a.fornavn),
      afsnit: [
        "Det er en stor fornøjelse at kunne byde dig velkommen i The Boardroom.",
        "Gå til betaling herunder og vælg, om du vil betale på én gang eller fordelt over flere rater. Så åbner vi din adgang med det samme.",
      ],
      knap: { tekst: "Gå til betaling", url: a.betalingsUrl },
      efterKnap: [
        `Din aftale gælder i 30 dage fra underskriften. Har du ikke betalt inden ${a.fristDato}, sender vi automatisk en faktura på det fulde beløb, ${formatKr(a.beloebKr)} kr. ekskl. moms.`,
        `Skulle noget gå i vejen med betalingen, så skriv til ${KONTAKT_ADRESSE} — så finder vi ud af det.`,
        "Jeg glæder mig til at komme i gang sammen med dig.",
      ],
      hilsen: HILSEN,
    }),
  };
}

export function dag14Mail(a: {
  fornavn: string | null | undefined;
  betalingsUrl: string;
}): IndgangsMail {
  return {
    subject: "Din plads står klar",
    html: indgangsMailHtml({
      overskrift: tiltale("Hej", a.fornavn),
      afsnit: [
        "Det er to uger siden, du skrev under — og din plads i The Boardroom står klar.",
        "Du aktiverer dit medlemskab ved at betale. Så er du inde med det samme.",
      ],
      knap: { tekst: "Gå til betaling", url: a.betalingsUrl },
      efterKnap: [`Har du spørgsmål, så skriv til ${KONTAKT_ADRESSE} — så finder vi ud af det.`],
      hilsen: HILSEN,
    }),
  };
}

export function dag25Mail(a: {
  fornavn: string | null | undefined;
  betalingsUrl: string;
  fristDato: string;
  beloebKr: number;
}): IndgangsMail {
  return {
    subject: "Fem dage til din frist",
    html: indgangsMailHtml({
      overskrift: tiltale("Hej", a.fornavn),
      afsnit: [
        `Jeg minder lige venligt om, at fristen for at aktivere dit medlemskab er ${a.fristDato} — om fem dage.`,
      ],
      knap: { tekst: "Gå til betaling", url: a.betalingsUrl },
      efterKnap: [
        `Betaler du ikke inden da, sender vi automatisk en faktura på det fulde beløb, ${formatKr(a.beloebKr)} kr. ekskl. moms. Vil du betale i rater, skal du bruge linket ovenfor inden fristen.`,
        `Er der noget i vejen, så skriv til ${KONTAKT_ADRESSE}. Jeg vil hellere høre fra dig end sende en faktura.`,
      ],
      hilsen: HILSEN,
    }),
  };
}

/**
 * Dag 31 har INGEN knap — betalingslinket er passeret, fakturaen er sendt.
 * Beløbet er FAKTURAENS (fakturaBeloebTekst): kalderen sender totalen og om
 * momsen blev beregnet; beloebKr (listeprisen) er kun faldback.
 */
export function dag31Mail(a: {
  fornavn: string | null | undefined;
  beloebKr: number;
  fakturaTotalOere?: number | null;
  momsBeregnet?: boolean | null;
}): IndgangsMail {
  const beloeb = fakturaBeloebTekst({ totalOere: a.fakturaTotalOere, momsBeregnet: a.momsBeregnet, listeprisKr: a.beloebKr });
  // «50.000 kr.» ender allerede med punktum (forkortelsen); «… inkl. moms» gør ikke.
  const beloebSaetning = beloeb.endsWith(".") ? beloeb : `${beloeb}.`;
  return {
    subject: "Din faktura til The Boardroom",
    html: indgangsMailHtml({
      overskrift: tiltale("Hej", a.fornavn),
      afsnit: [
        `Fristen for at aktivere dit medlemskab via betalingslinket er passeret, og derfor har vi sendt dig en faktura på ${beloebSaetning} Du finder den i en separat mail fra Stripe.`,
        "Din plads står stadig klar — betal fakturaen, så åbner vi din adgang.",
        `Er der noget vi skal tale om, så skriv til ${KONTAKT_ADRESSE}. Vi tager den gerne.`,
      ],
      hilsen: HILSEN,
    }),
  };
}

/**
 * Husets FØRSTE mail til en rådgiver. Målt 2/9: send-notification-email
 * har ADVISOR_EMAIL_DISABLED = true med kommentaren «Advisors receive
 * Slack notifications — email is for members only». Denne mail er en
 * BEVIDST undtagelse, besluttet af Jonas 2/9: en manglende pris stopper
 * et nyt medlem, og en mail bliver set.
 *
 * Arbejdsbesked, ikke velkomst: virksomhed, CVR, kontakt, godkendt
 * hvornår, hvor mange dage der er tilbage af fristen, og et direkte link
 * til virksomhedssiden (/virksomhed/{companyId} — 13/9: /members lukkes).
 * Siger udtrykkeligt at betalingsmailen IKKE er sendt, og at
 * den sendes automatisk når prisniveauet er sat.
 *
 * FRISTEN ER KONTRAKTENS (rettet 2/9): den løber fra underskriften, ikke
 * fra betalingsmailen — så hver dag prisen mangler, er en dag mindre for
 * medlemmet. dageTilbage regnes af kalderen som BETALINGSFRIST_DAGE −
 * dage siden underskrift. 7 eller færre: det haster. Negativ: fristen er
 * passeret, og mailen siger det.
 */
export function raadgiverManglerPrisMail(a: {
  virksomhed: string;
  cvr: string | null | undefined;
  kontakt: string | null | undefined;
  godkendtDato: string;
  dageTilbage: number;
  companyId: string;
}): IndgangsMail {
  const cvr = (a.cvr ?? "").trim() || "ukendt";
  const kontakt = (a.kontakt ?? "").trim() || "ukendt";
  const haster = a.dageTilbage <= 7;
  const fristLinje =
    a.dageTilbage < 0
      ? `Fristen på 30 dage løber fra underskriften den ${a.godkendtDato} — og den er allerede passeret for ${Math.abs(a.dageTilbage)} ${Math.abs(a.dageTilbage) === 1 ? "dag" : "dage"} siden. Sættes prisen nu, får medlemmet en betalingsmail med en frist der er overskredet.`
      : a.dageTilbage === 0
        ? `Fristen på 30 dage løber fra underskriften den ${a.godkendtDato} — i dag er SIDSTE dag. Det haster.`
        : `Fristen på 30 dage løber fra underskriften den ${a.godkendtDato} — der er ${a.dageTilbage} ${a.dageTilbage === 1 ? "dag" : "dage"} tilbage.${haster ? " Det haster." : ""}`;
  return {
    subject: haster
      ? `HASTER: ${a.virksomhed} mangler et prisniveau`
      : `${a.virksomhed} mangler et prisniveau`,
    html: indgangsMailHtml({
      overskrift: `${a.virksomhed} mangler et prisniveau`,
      afsnit: [
        `${a.virksomhed} (CVR ${cvr}) blev godkendt ${a.godkendtDato} og er oprettet i platformen. Kontakt: ${kontakt}.`,
        fristLinje,
        "Betalingsmailen er IKKE sendt, fordi der ikke er sat et prisniveau. Sæt prisniveauet på virksomheden, så sendes betalingsmailen automatisk.",
      ],
      knap: { tekst: "Åbn i platformen", url: `${APP_URL}/virksomhed/${a.companyId}` },
      efterKnap: [`Virksomheds-id: ${a.companyId}`],
      hilsen: "The Boardroom",
    }),
  };
}
