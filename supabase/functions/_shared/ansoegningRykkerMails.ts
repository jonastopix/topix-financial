/**
 * ansoegningRykkerMails — de tretten mails rykkerkøen kan sende, rene
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
 * Rammen er intro-reminder-cron's (bulletproofButton + fallbackLinkBlock),
 * afsenderlinjen «The Boardroom» — det er en maskine der sender på Jonas'
 * vegne, og den siger det.
 */
import { escHtml } from "./htmlEscape.ts";
import { bulletproofButton, fallbackLinkBlock } from "./emailButtonHelpers.ts";
import { KONTAKT_ADRESSE } from "./indgangsMail.ts";
import { ANSOEG_STI, TOKEN_PARAM } from "./ansoegningSkema.ts";
import { TZ } from "./hverdage.ts";

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
  /** Vis «ikke nu»-linjen (kun rykkere til ansøgeren om samtale/aftale). */
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

const IKKE_NU_TEKST = "Er det ikke det rigtige tidspunkt? Så sig til her — vi sætter det på pause i tre måneder og skriver ikke imens:";

const BYGGERE: Record<string, (k: MailKontekst) => Udkast> = {
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
      knap: { tekst: "Fortsæt ansøgningen", href: genoptagLink(k.token) },
      ikkeNu: false,
    };
  },
  "ansoegning-indkaldelse": (k) => ({
    emne: "Lad os tage en uforpligtende snak",
    eyebrow: "Din ansøgning til The Boardroom",
    afsnit: [
      `${hej(k)},`,
      `Tak for din ansøgning for ${k.virksomhedsnavn}. ${PROCESTEKST}`,
      "Jeg har læst din ansøgning og vil gerne tale med dig. Vælg et tidspunkt der passer dig — samtalen tager 30 minutter, og vi holder den online.",
    ],
    knap: { tekst: "Book samtalen med Jonas", href: k.bookingUrl },
    ikkeNu: true,
  }),
  "ansoegning-indkaldt-rykker-1": (k) => ({
    emne: "Har du fundet et tidspunkt til vores snak?",
    eyebrow: "Afklaringssamtalen",
    afsnit: [`${hej(k)},`, "Jeg skrev forleden, at jeg gerne vil tale med dig om din ansøgning. Der er stadig ledige tider i min kalender — det tager to minutter at vælge en."],
    knap: { tekst: "Book samtalen med Jonas", href: k.bookingUrl },
    ikkeNu: true,
  }),
  "ansoegning-indkaldt-rykker-2": (k) => ({
    emne: "Samtalen venter på dig",
    eyebrow: "Afklaringssamtalen",
    afsnit: [`${hej(k)},`, `Din ansøgning for ${k.virksomhedsnavn} ligger klar hos os. Det eneste der mangler, er et tidspunkt til vores snak.`],
    knap: { tekst: "Vælg et tidspunkt", href: k.bookingUrl },
    ikkeNu: true,
  }),
  "ansoegning-indkaldt-rykker-3": (k) => ({
    emne: "Skal jeg hjælpe med at finde et tidspunkt?",
    eyebrow: "Afklaringssamtalen",
    afsnit: [`${hej(k)},`, "Passer ingen af tiderne, så svar på denne mail med et par forslag — så finder vi ud af det. Ellers er linket her:"],
    knap: { tekst: "Book samtalen med Jonas", href: k.bookingUrl },
    ikkeNu: true,
  }),
  "ansoegning-indkaldt-rykker-4": (k) => ({
    emne: "Sidste hilsen fra mig om samtalen",
    eyebrow: "Afklaringssamtalen",
    afsnit: [
      `${hej(k)},`,
      "Jeg har skrevet et par gange uden at høre fra dig, så dette er den sidste mail om samtalen. Hører jeg ikke fra dig inden for et par dage, lukker vi ansøgningen — og du er velkommen til at søge igen, når det passer bedre.",
    ],
    knap: { tekst: "Book samtalen med Jonas", href: k.bookingUrl },
    ikkeNu: true,
  }),
  "ansoegning-samtale-i-morgen": (k) => ({
    emne: "I morgen: vores snak",
    eyebrow: "Afklaringssamtalen",
    afsnit: [
      `${hej(k)},`,
      `Vi ses i morgen${k.samtaleStart ? `, ${formaterSamtaletid(k.samtaleStart)}` : ""}. Har du jeres seneste regnskab eller et par nøgletal ved hånden, bliver samtalen mere konkret — men det er ikke et krav.`,
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
      `Tak for snakken. Som aftalt sender jeg aftalegrundlaget for ${k.virksomhedsnavn}s medlemskab af The Boardroom. Læs det igennem i ro og mag — og underskriv, når du er klar.`,
    ],
    knap: k.aftaleUrl ? { tekst: "Læs og underskriv", href: k.aftaleUrl } : { tekst: "Se din ansøgning", href: k.statusUrl },
    ikkeNu: true,
  }),
  "ansoegning-aftalegrundlag-rykker-1": (k) => ({
    emne: "Har du set aftalegrundlaget?",
    eyebrow: "Aftalegrundlaget",
    afsnit: [`${hej(k)},`, "Jeg sendte aftalegrundlaget forleden. Har du spørgsmål til det, så svar på denne mail — ellers ligger det klar her:"],
    knap: k.aftaleUrl ? { tekst: "Læs og underskriv", href: k.aftaleUrl } : { tekst: "Se din ansøgning", href: k.statusUrl },
    ikkeNu: true,
  }),
  "ansoegning-aftalegrundlag-rykker-2": (k) => ({
    emne: "Aftalegrundlaget venter",
    eyebrow: "Aftalegrundlaget",
    afsnit: [`${hej(k)},`, `Pladsen til ${k.virksomhedsnavn} står klar. Det eneste der mangler, er din underskrift.`],
    knap: k.aftaleUrl ? { tekst: "Læs og underskriv", href: k.aftaleUrl } : { tekst: "Se din ansøgning", href: k.statusUrl },
    ikkeNu: true,
  }),
  "ansoegning-aftalegrundlag-rykker-3": (k) => ({
    emne: "Er der noget vi skal tale om?",
    eyebrow: "Aftalegrundlaget",
    afsnit: [`${hej(k)},`, "Er der noget i aftalegrundlaget, der holder dig tilbage, vil jeg hellere høre det end lade det ligge. Svar på mailen, eller underskriv her:"],
    knap: k.aftaleUrl ? { tekst: "Læs og underskriv", href: k.aftaleUrl } : { tekst: "Se din ansøgning", href: k.statusUrl },
    ikkeNu: true,
  }),
  "ansoegning-aftalegrundlag-rykker-4": (k) => ({
    emne: "Sidste hilsen om aftalegrundlaget",
    eyebrow: "Aftalegrundlaget",
    afsnit: [
      `${hej(k)},`,
      "Dette er den sidste mail om aftalegrundlaget. Hører jeg ikke fra dig inden for en uge, lader vi det udløbe — og du er velkommen til at vende tilbage, når det passer bedre.",
    ],
    knap: k.aftaleUrl ? { tekst: "Læs og underskriv", href: k.aftaleUrl } : { tekst: "Se din ansøgning", href: k.statusUrl },
    ikkeNu: true,
  }),
};

export const RYKKER_SKABELONER: readonly string[] = Object.keys(BYGGERE);

function ramme(u: Udkast, k: MailKontekst): string {
  const P = "color:#4a4a4a;font-size:14px;line-height:24px;margin:0 0 14px";
  const afsnit = u.afsnit.map((a) => `<p style="${P}">${escHtml(a)}</p>`).join("\n");
  const knap = u.knap ? `${bulletproofButton({ href: u.knap.href, label: u.knap.tekst })}\n${fallbackLinkBlock(u.knap.href)}` : "";
  const ikkeNu = u.ikkeNu
    ? `<p style="color:#6b7280;font-size:13px;line-height:20px;margin:18px 0 0">${escHtml(IKKE_NU_TEKST)} <a href="${escHtml(k.ikkeNuUrl)}" style="color:#6b7280;text-decoration:underline">Ikke nu</a></p>`
    : "";
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background-color:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:24px 0">
<div style="max-width:520px;margin:0 auto">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse">
    <tr><td style="background-color:#133332;border-radius:10px 10px 0 0;padding:18px 28px">
      <span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:-.01em;font-family:'Manrope',Arial,sans-serif">The Boardroom</span>
    </td></tr>
  </table>
  <div style="background:#ffffff;border-radius:0 0 10px 10px;padding:28px 28px 0">
    <p style="font-size:11px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px">${escHtml(u.eyebrow)}</p>
    <h1 style="color:#0f1117;font-size:22px;font-weight:700;margin:0 0 14px;line-height:1.3;letter-spacing:-.02em">${escHtml(u.emne)}</h1>
${afsnit}
    ${knap}
    <p style="${P}">${escHtml(HILSEN_JONAS).replace(/\n/g, "<br>")}</p>
    ${ikkeNu}
    <div style="height:0.5px;background:#e5e7eb;margin:16px 0 0"></div>
    <div style="padding:16px 0">
      <span style="font-size:12px;color:#9ca3af">The Boardroom · theboardroom.dk &nbsp;·&nbsp; <a href="mailto:${escHtml(KONTAKT_ADRESSE)}" style="font-size:12px;color:#9ca3af;text-decoration:underline">${escHtml(KONTAKT_ADRESSE)}</a></span>
    </div>
  </div>
</div>
</body>
</html>`;
}

function tekst(u: Udkast, k: MailKontekst): string {
  const linjer = [...u.afsnit];
  if (u.knap) linjer.push("", `${u.knap.tekst}: ${u.knap.href}`);
  linjer.push("", HILSEN_JONAS);
  if (u.ikkeNu) linjer.push("", `${IKKE_NU_TEKST} ${k.ikkeNuUrl}`);
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
