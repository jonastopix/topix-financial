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
}

const APP_URL = "https://app.theboardroom.dk";
const HILSEN = "Venlig hilsen\nMorten Larsen";

/** HTML-escaper tekst. Linjeskift (\n) bliver til <br>. */
function esc(tekst: string): string {
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
  const knap = args.knap
    ? bulletproofButton({ href: args.knap.url, label: args.knap.tekst, bgColor: "#133332" }) +
      "\n" + fallbackLinkBlock(args.knap.url)
    : "";
  const efterKnap = (args.efterKnap ?? []).map((a) => `<p style="${P_STYLE}">${esc(a)}</p>`).join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background-color:#f4f4f5;font-family:'Manrope',Arial,sans-serif;margin:0;padding:24px 0">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse">
    <tr><td style="background-color:#133332;padding:18px 24px">
      <span style="font-family:'Manrope',Arial,sans-serif;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">The Boardroom</span>
    </td></tr>
    <tr><td style="height:3px;background-color:#27AE82"></td></tr>
  </table>
  <div style="padding:28px 32px 32px">
    <h1 style="color:#133332;font-size:20px;font-weight:700;margin:0 0 16px;line-height:1.3">${esc(args.overskrift)}</h1>
${afsnit}
${knap}
${efterKnap}
    <p style="${P_STYLE}margin-top:20px">${esc(args.hilsen)}</p>
    <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:24px 0 0;border-top:1px solid #eee;padding-top:16px">The Boardroom · theboardroom.dk</p>
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
        `Din aftale gælder i 30 dage fra underskriften. Har du ikke betalt inden ${a.fristDato}, sender vi automatisk en faktura på det fulde beløb.`,
        "Skulle noget gå i vejen med betalingen, så skriv til mig — så finder vi ud af det.",
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
      efterKnap: ["Har du spørgsmål, er jeg kun en mail væk."],
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
        `Betaler du ikke inden da, sender vi automatisk en faktura på det fulde beløb, ${formatKr(a.beloebKr)} kr. Vil du betale i rater, skal du bruge linket ovenfor inden fristen.`,
        "Er der noget i vejen, så sig til. Jeg vil hellere høre fra dig end sende en faktura.",
      ],
      hilsen: HILSEN,
    }),
  };
}

/** Dag 31 har INGEN knap — betalingslinket er passeret, fakturaen er sendt. */
export function dag31Mail(a: {
  fornavn: string | null | undefined;
  beloebKr: number;
}): IndgangsMail {
  return {
    subject: "Din faktura til The Boardroom",
    html: indgangsMailHtml({
      overskrift: tiltale("Hej", a.fornavn),
      afsnit: [
        `Fristen for at aktivere dit medlemskab via betalingslinket er passeret, og derfor har vi sendt dig en faktura på ${formatKr(a.beloebKr)} kr. Du finder den i en separat mail fra Stripe.`,
        "Din plads står stadig klar — betal fakturaen, så åbner vi din adgang.",
        "Er der noget vi skal tale om, så ring eller skriv. Vi tager den gerne.",
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
 * hvornår, og et direkte link til /members. Siger udtrykkeligt at
 * betalingsmailen IKKE er sendt, og at den sendes automatisk når
 * prisniveauet er sat.
 */
export function raadgiverManglerPrisMail(a: {
  virksomhed: string;
  cvr: string | null | undefined;
  kontakt: string | null | undefined;
  godkendtDato: string;
  companyId: string;
}): IndgangsMail {
  const cvr = (a.cvr ?? "").trim() || "ukendt";
  const kontakt = (a.kontakt ?? "").trim() || "ukendt";
  return {
    subject: `${a.virksomhed} mangler et prisniveau`,
    html: indgangsMailHtml({
      overskrift: `${a.virksomhed} mangler et prisniveau`,
      afsnit: [
        `${a.virksomhed} (CVR ${cvr}) blev godkendt ${a.godkendtDato} og er oprettet i platformen. Kontakt: ${kontakt}.`,
        "Betalingsmailen er IKKE sendt, fordi der ikke er sat et prisniveau. Sæt prisniveauet på virksomheden, så sendes betalingsmailen automatisk.",
      ],
      knap: { tekst: "Åbn i platformen", url: `${APP_URL}/members` },
      efterKnap: [`Virksomheds-id: ${a.companyId}`],
      hilsen: "The Boardroom",
    }),
  };
}
