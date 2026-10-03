/**
 * webinarRum/links — tokenet, kalenderen, ansøgningen og tilmeldingsformen
 * (skive 2, 30/9-2026). Kun klienten; rene funktioner.
 *
 * TOKENET er seerens legitimation (HMAC, webinarMotor/token.ts). Siden flytter
 * det fra adresselinjen til sessionStorage (spec §C6: strengt nødvendigt for
 * den tjeneste, personen selv har bedt om — intet cookiesamtykke) og fjerner
 * det fra URL'en med history.replaceState.
 *
 * ANSØGNINGEN fra exitrummet (spec §A9): /ansoeg?kilde=webinar#wt=<token>.
 * Tokenet står i FRAGMENTET — det sendes aldrig til en server, heller ikke i
 * en Referer — og /ansoeg henter navn og mail med det (webinar-rum
 * «forudfyld»). Intet persondata i en URL. Ingen egne utm-parametre: de er
 * annoncens, ikke vores knappers (spec §A9).
 */
import { DELTAGERTOKEN_FORM } from "@/lib/webinarMotor/token";
import { EMAIL_FORM } from "@/lib/webinarMotor/tilmelding";
import { googleKalenderUrl, outlookKalenderUrl } from "@/lib/webinar/mailDom";

export const TOKEN_PARAM = "t";
export const WT_FRAGMENT = "wt";

export const gyldigtToken = (t: unknown): t is string => typeof t === "string" && DELTAGERTOKEN_FORM.test(t);

/** sessionStorage-nøglen — pr. webinar, så to webinarer i samme fane ikke deler token. */
export const tokenNoegle = (slug: string): string => `webinar-rum:${slug}`;

/** URL'ens token vinder (et nyt link fra en mail), ellers det gemte. Et ugyldigt er intet. */
export function vaelgToken(fraUrl: string | null, gemt: string | null): string | null {
  if (gyldigtToken(fraUrl)) return fraUrl;
  if (gyldigtToken(gemt)) return gemt;
  return null;
}

/** Adressen uden tokenet — til history.replaceState. Alt andet i URL'en bliver. */
export function udenToken(href: string): string {
  const u = new URL(href);
  u.searchParams.delete(TOKEN_PARAM);
  const q = u.searchParams.toString();
  return `${u.pathname}${q ? `?${q}` : ""}${u.hash}`;
}

/** Husets egen .ics fra motoren (webinar-rum GET, handling=ics). */
export function icsUrl(supabaseUrl: string, token: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/webinar-rum?handling=ics&t=${encodeURIComponent(token)}`;
}

/** Linket fra exitrummets CTA til ansøgningen — tokenet i fragmentet, intet andet. */
export function ansoegUrl(token: string): string {
  return `/ansoeg?kilde=webinar#${WT_FRAGMENT}=${encodeURIComponent(token)}`;
}

/** Tokenet fra /ansoeg's fragment («#wt=…») — null, når der intet gyldigt er. */
export function laesWt(hash: string | null | undefined): string | null {
  if (!hash) return null;
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const t = p.get(WT_FRAGMENT);
  return gyldigtToken(t) ? t : null;
}

export interface KalenderLinks {
  google: string | null;
  outlook: string | null;
  ics: string;
}

/** «Føj til Google-kalender», «Outlook» og «Apple/andet (.ics)» — samme byggere som mailene (mailDom). */
export function kalenderLinks(i: { titel: string; starterAt: string; rumUrl: string; supabaseUrl: string; token: string }): KalenderLinks {
  const ind = { titel: i.titel, sessionTid: i.starterAt, joinLink: i.rumUrl };
  return { google: googleKalenderUrl(ind), outlook: outlookKalenderUrl(ind), ics: icsUrl(i.supabaseUrl, i.token) };
}

// ── Dansk tid ────────────────────────────────────────────────────────────────

const DAG = new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", weekday: "long", day: "numeric", month: "long" });
const KLOKKE = new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** «tirsdag 13. oktober kl. 11.00» — altid dansk tid, uanset enhedens tidszone. */
export function sessionTekst(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${DAG.format(d)} kl. ${klokkeTekst(iso)}`;
}

/** «10.45» — dansk tid. */
export function klokkeTekst(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return KLOKKE.format(d).replace(":", ".");
}

// ── Tilmeldingsformen ────────────────────────────────────────────────────────

export type TilmeldFejl = Partial<Record<"fornavn" | "email" | "session", string>>;

/** Samme regler som serverens laesTilmeldInput — så formen siger det, før serveren gør. */
export function validerTilmelding(i: { fornavn: string; email: string; sessionId: string | null }): TilmeldFejl {
  const fejl: TilmeldFejl = {};
  const navn = i.fornavn.replace(/\s+/g, " ").trim();
  if (navn.length < 1) fejl.fornavn = "Skriv dit fornavn.";
  else if (navn.length > 80 || /[<>@]/.test(navn)) fejl.fornavn = "Det ligner ikke et fornavn.";
  const mail = i.email.trim().toLowerCase();
  if (mail.length < 1) fejl.email = "Skriv din e-mail.";
  else if (mail.length > 254 || !EMAIL_FORM.test(mail)) fejl.email = "Tjek e-mailen — den ser ikke rigtig ud.";
  if (!i.sessionId) fejl.session = "Vælg et tidspunkt.";
  return fejl;
}

const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/**
 * Annoncesporet fra URL'en (utm_*, fbclid), landingssiden og referreren — det,
 * webinar-tilmeld gemmer på rækken. App'en har intet samtykkebanner og ingen
 * pixel (tracking.md §2 række 18), så _fbp/_fbc og GA's klient-id læses ALDRIG
 * her; de kommer kun fra topix.dk-formularen (skive 8).
 */
export function laesTilmeldSpor(i: { get: (navn: string) => string | null; href: string | null; referrer: string | null }): Record<string, string> {
  const ud: Record<string, string> = {};
  for (const n of [...UTM, "fbclid"] as const) {
    const v = (i.get(n) ?? "").trim();
    if (v) ud[n] = v.slice(0, n === "fbclid" ? 500 : 200);
  }
  if (i.href) {
    const u = new URL(i.href);
    ud.landing = `${u.origin}${udenToken(i.href)}`.slice(0, 1000);
  }
  const r = (i.referrer ?? "").trim();
  if (r) ud.referrer = r.slice(0, 1000);
  return ud;
}
