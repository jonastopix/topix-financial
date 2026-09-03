/**
 * opslagsMail — mailen der fortæller de øvrige medlemmer, at nogen har
 * skrevet et nyt opslag i Community (Jonas 3/9: «en mail hvor du kan se
 * en del af opslaget, og gå ind og få vist mere, samt se hvem der har
 * slået opslaget op — den gode oplevelse, som trigger folk til at
 * interagere»).
 *
 * Ren funktion, ingen Deno, ingen DB: send-notification-email samler
 * tråd + forfatter + virksomhed og kalder opslagsMail(). Testet i
 * src/lib/__tests__/opslagsMail.test.ts.
 *
 * Formen er husets mailfamilie (indgangsMail.ts: 520 px, #133332-header
 * med #27AE82-linje, Manrope, 28/32 px indre kant). Farverne i
 * forfatterblokken er Hjemmebane-tokens omsat til hex (mails kan ikke
 * læse CSS-variabler): ink #152825, ink-soft/brødtekst #4D6663 (husets
 * mailtekst), rust #B8572E (eyebrow), sage #D7EAE2 (initial-cirklen),
 * line #E4E2DD (hairline). Knappen er evergreen #133332 som i
 * indgangsmailene.
 *
 * Al brugerskrevet tekst (navn, virksomhed, titel, uddrag) går gennem
 * escHtml. avatar_url er husets egen offentlige storage-URL (Settings.tsx
 * gemmer getPublicUrl), men attribut-escapes alligevel.
 */
import { escHtml } from "./htmlEscape.ts";
import { bulletproofButton, fallbackLinkBlock } from "./emailButtonHelpers.ts";

const APP_URL = "https://app.theboardroom.dk";

/** Hvad et medlem hedder i mailen når profilnavnet er tomt — som feedet («Medlem»). */
export const NAVN_FALLBACK = "Et medlem";

// ── Uddraget ────────────────────────────────────────────────────────────

/**
 * Øvre grænse for uddraget: 280 tegn og højst 3 sætninger.
 *
 * Hvorfor 280: mailens tekstspalte er ~456 px (520 − 2×32) i 14 px Manrope
 * ≈ 60–65 tegn pr. linje, så 280 tegn er 4–5 linjer — nok til at fornemme
 * hvad opslaget handler om, og kort nok til at «Læs opslaget» stadig har
 * et ærinde. Højst tre sætninger, fordi «de første par sætninger» er
 * ønsket; tre korte sætninger på 90 tegn skal ikke fylde op med en fjerde.
 */
export const UDDRAG_MAKS_TEGN = 280;
export const UDDRAG_MAKS_SAETNINGER = 3;

export interface Uddrag {
  /** Teksten der vises. Ender på «…» KUN når der er klippet midt i en sætning. */
  tekst: string;
  /** Sandt når hele opslaget IKKE er med (uanset hvor der blev klippet). */
  afkortet: boolean;
}

/**
 * De første par sætninger af opslagets rene tekst (community_traade.indhold),
 * uden at klippe midt i et ord.
 *
 * Regler:
 * 1. Whitespace normaliseres (indhold er allerede én linje med mellemrum).
 * 2. Sætninger deles ved . ! ? efterfulgt af mellemrum eller slut. En
 *    forkortelse som «kr. 5.000» tæller som sætningsgrænse — det gør kun
 *    uddraget kortere, aldrig klippet midt i et ord.
 * 3. Hele sætninger tages med så længe antallet ≤ maksSaetninger og
 *    længden ≤ maksTegn. Når hele teksten er med: afkortet = false.
 * 4. Passer den første sætning ikke inden for maksTegn, klippes ved sidste
 *    mellemrum før grænsen (plads til «…»), efterhængende tegnsætning
 *    fjernes, og «…» sættes på. Ét ord længere end grænsen hårdklippes.
 */
export function uddrag(
  indhold: string | null | undefined,
  maksTegn = UDDRAG_MAKS_TEGN,
  maksSaetninger = UDDRAG_MAKS_SAETNINGER,
): Uddrag {
  const tekst = String(indhold ?? "").replace(/\s+/g, " ").trim();
  if (tekst === "") return { tekst: "", afkortet: false };
  if (tekst.length <= maksTegn) {
    const alle = delISaetninger(tekst);
    if (alle.length <= maksSaetninger) return { tekst, afkortet: false };
    return { tekst: alle.slice(0, maksSaetninger).join(" "), afkortet: true };
  }

  const saetninger = delISaetninger(tekst);
  const valgte: string[] = [];
  let laengde = 0;
  for (const s of saetninger) {
    if (valgte.length >= maksSaetninger) break;
    const ny = laengde === 0 ? s.length : laengde + 1 + s.length;
    if (ny > maksTegn) break;
    valgte.push(s);
    laengde = ny;
  }
  if (valgte.length > 0) return { tekst: valgte.join(" "), afkortet: true };

  // Første sætning er for lang: klip ved ordgrænse.
  return { tekst: klipVedOrd(tekst, maksTegn), afkortet: true };
}

function delISaetninger(tekst: string): string[] {
  return tekst
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function klipVedOrd(tekst: string, maksTegn: number): string {
  const plads = Math.max(1, maksTegn - 1); // plads til «…»
  const stump = tekst.slice(0, plads);
  const sidsteMellemrum = stump.lastIndexOf(" ");
  const kerne = (sidsteMellemrum > 0 ? stump.slice(0, sidsteMellemrum) : stump)
    .replace(/[\s,;:.!?–-]+$/g, "");
  return `${kerne}…`;
}

// ── Mailen ──────────────────────────────────────────────────────────────

export interface OpslagsMailInput {
  traadId: string;
  titel: string;
  /** Opslagets rene tekst (community_traade.indhold). Uddraget laves her. */
  indhold: string | null | undefined;
  forfatterNavn: string | null | undefined;
  forfatterAvatarUrl: string | null | undefined;
  forfatterVirksomhed: string | null | undefined;
}

export interface OpslagsMail {
  subject: string;
  html: string;
  text: string;
  /** Til test/log: hvad uddraget blev. */
  uddrag: Uddrag;
}

/** Forfatterens visningsnavn: profilnavn eller fallback. */
export function visningsnavn(fullName: string | null | undefined): string {
  const navn = String(fullName ?? "").trim();
  return navn === "" ? NAVN_FALLBACK : navn;
}

/** Første bogstav til initial-cirklen når der ikke er et billede. */
function initial(navn: string): string {
  const foerste = navn.trim().charAt(0);
  return /[\p{L}\p{N}]/u.test(foerste) ? foerste.toUpperCase() : "";
}

const P_STYLE = "color:#4D6663;font-size:14px;line-height:1.6;margin:0 0 14px";

export function opslagsMail(input: OpslagsMailInput): OpslagsMail {
  const navn = visningsnavn(input.forfatterNavn);
  const virksomhed = String(input.forfatterVirksomhed ?? "").trim();
  const titel = String(input.titel ?? "").trim();
  const udd = uddrag(input.indhold);
  const url = `${APP_URL}/community/${input.traadId}`;
  const avatarUrl = String(input.forfatterAvatarUrl ?? "").trim();

  const subject = titel ? `${navn} har skrevet i Community: ${titel}` : `${navn} har skrevet i Community`;

  // Portrættet: <img> når der er et billede, ellers en cirkel med initial.
  const portraet = avatarUrl
    ? `<img src="${escHtml(avatarUrl)}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;border-radius:24px;object-fit:cover;border:0">`
    : `<div style="width:48px;height:48px;border-radius:24px;background-color:#D7EAE2;color:#133332;font-size:18px;font-weight:700;line-height:48px;text-align:center">${escHtml(initial(navn))}</div>`;

  const virksomhedLinje = virksomhed
    ? `<div style="color:#4D6663;font-size:13px;line-height:1.4">${escHtml(virksomhed)}</div>`
    : "";

  const uddragBlok = udd.tekst
    ? `<p style="${P_STYLE}">${escHtml(udd.tekst)}</p>`
    : "";
  const mereLinje = udd.afkortet
    ? `<p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0 0 4px">Der er mere i opslaget.</p>`
    : "";

  const html = `<!DOCTYPE html>
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
    <p style="font-size:11px;font-weight:600;color:#B8572E;text-transform:uppercase;letter-spacing:.08em;margin:0 0 14px">Nyt opslag i Community</p>
    <table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;margin:0 0 18px">
      <tr>
        <td style="width:48px;vertical-align:middle;padding:0 12px 0 0">${portraet}</td>
        <td style="vertical-align:middle">
          <div style="color:#152825;font-size:15px;font-weight:700;line-height:1.3">${escHtml(navn)}</div>
          ${virksomhedLinje}
        </td>
      </tr>
    </table>
    <h1 style="color:#133332;font-size:20px;font-weight:700;margin:0 0 12px;line-height:1.3">${escHtml(titel)}</h1>
${uddragBlok}
${mereLinje}
${bulletproofButton({ href: url, label: "Læs opslaget", bgColor: "#133332" })}
${fallbackLinkBlock(url)}
    <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:24px 0 0;border-top:1px solid #E4E2DD;padding-top:16px">The Boardroom · theboardroom.dk &nbsp;·&nbsp; <a href="${APP_URL}/settings" style="color:#9ca3af;text-decoration:underline">Administrer notifikationer</a></p>
  </div>
</div>
</body>
</html>`;

  const hvem = virksomhed ? `${navn} (${virksomhed})` : navn;
  const text = [
    `${hvem} har skrevet et nyt opslag i Community.`,
    "",
    titel,
    "",
    udd.tekst,
    udd.afkortet ? "(Der er mere i opslaget.)" : "",
    "",
    `Læs opslaget: ${url}`,
  ]
    .filter((linje, i, arr) => !(linje === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();

  return { subject, html, text, uddrag: udd };
}
