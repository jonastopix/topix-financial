/**
 * _shared/samlemail.ts — samlemailens motor (15/9-2026).
 *
 * ÉN fil, som husets andre mailbyggere (eventMails.ts, opslagsMail.ts):
 * REN — ingen Deno-, Supabase- eller npm-imports, ingen I/O, ingen
 * Date.now() — «nu» sendes ind — så vitest læser den direkte
 * (src/lib/__tests__/samlemail.test.ts). Bygget UDEN afsendelse;
 * integrationen i send-notification-email (med tørkørsel først) er næste
 * skridt, ikke dette. Mapningen fra notifications-rækker til punkter er
 * også næste skridt: motoren tager punkterne som de kommer.
 *
 * FØRSTE UDGAVE (Claude Code, vindue A, samme aften) var et src/lib-spejl
 * med importfri kopier af husets hjælpere; omarbejdet FØR commit til denne
 * ene fil, fordi importen af eventMails.ts fjernede grunden til spejlet,
 * og kopierne kunne glide (rammen og datoformatet var ikke vogtet).
 *
 * BESLUTNINGERNE MOTOREN BÆRER:
 * - Jonas 15/9: højst én samlemail pr. modtager pr. dansk døgn, sendt fra
 *   kl. 17:00 dansk tid; tidspunktet står på hver linje (Jonas' eksempel:
 *   et opslag om «live session i morgen» skal stadig kunne læses rigtigt).
 * - Jonas 15/9: præsentationer er med i samlemailen. Fallback hvis
 *   samlemailen ikke er i drift og bevist senest 21/9: præsentationer som
 *   info (kun klokken) i to uger.
 * - Chattens forslag 15/9, ikke modsagt: de samlede typer er præcis
 *   event_published og community_opslag (inkl. præsentationer). Alt andet
 *   mailes som i dag.
 *
 * DATOFORMATET — chattens beslutning 15/9 (tilføjelsen til opgaven), ikke
 * Jonas'. Der findes tre formater i huset:
 *   ./eventMails.ts:51-58            datoOrd/tidOrd, «onsdag 23. september» /
 *                                    «14:00», timeZone Europe/Copenhagen
 *   event-reminders/index.ts:39-57   fmtDate med år, fmtTime
 *   cancel-event/index.ts:131-135    dateLabel uden timeZone
 * Samlemailen bruger eventMails.ts' format. Ældre end i går =
 * «{datoOrd} kl. {tidOrd}». datoOrd/tidOrd importeres — ingen tredje kopi,
 * eventMails.ts er ikke rettet.
 *
 * IMPORTERNE (alle originaler, alle rene): datoOrd/tidOrd (./eventMails.ts),
 * escHtml (./htmlEscape.ts), bulletproofButton/fallbackLinkBlock
 * (./emailButtonHelpers.ts), tiltale (./indgangsMail.ts), copenhagenHour
 * (./notificationEmailSelection.ts — kun gjort export, samme kontrakt:
 * Date ind, dansk time 0–23 ud). Dansk dato via sv-SE som
 * event-reminders/index.ts:42 og maanedsnoegle.ts:21. Aldrig et fast
 * UTC-offset.
 *
 * DEL 2 (15/9 aften) — VINDUET, MAPNINGEN OG FORDELINGEN. CHATTENS
 * beslutninger 15/9 (ikke Jonas'):
 *   a) Samlemailen sendes kun i vinduet 17:00–20:00 dansk. Ikke sendt inden
 *      20 → næste dag kl. 17. Begrundelse: Jonas' valg af kl. 17 (en
 *      aftenmail læses først næste morgen) og køens vindue 07–20 (fund 18).
 *   b) event_published → punkt: titel = events.title; tekst =
 *      «{datoOrd(starts_at)} kl. {tidOrd(starts_at)}» + « · Online» når
 *      meet_url er sat; link = rækkens deep_link; oprettet = created_at.
 *      UDELADES (stemples uden mail, med grund) når eventet ikke findes,
 *      status ≠ 'published', eller starts_at ≤ nu.
 *   c) community_opslag → punkt: titel = trådens titel; tekst = «{navn} har
 *      præsenteret sig» når kilde_type = 'praesentation', ellers «{navn}
 *      har skrevet i Community»; navn efter husets visningsnavn-regel
 *      (opslagsMail.ts:134, importeret); link = deep_link; erPraesentation
 *      = (kilde_type = 'praesentation'). UDELADES når tråden mangler eller
 *      status ≠ 'aktiv', eller når modtageren har åbnet tråden — samme dom
 *      som køen (set_i_app === true → dispose, notificationEmailSelection
 *      .ts:311-314; opslaget i community_visninger er I/O i
 *      send-notification-email/index.ts:380-399 og gøres af kalderen).
 *   d) Forældet (erForaeldetTilSamlemail, > 48 t) → stemples uden mail, med
 *      grund. Køens erForaeldet (12 t, BEGIVENHED_TYPES) bruges IKKE her —
 *      den skal undtages for samlemailens typer i integrationen.
 *   e) Pr. modtager: rådgiver/admin → rækkerne stemples uden mail (som i
 *      dag); notification_email_prefs.important === false → stemples uden
 *      mail; ingen auth-mail → venter (intet stempel); dagskvote nået →
 *      venter.
 *   f) «Sidst sendt» = seneste email_send_log med template_name
 *      'notification-samlemail' og status 'sent' for modtagerens mail.
 *      Label 'notification-samlemail' (tæller i dagskvoten som én mail).
 *      Idempotency-nøgle 'notification-samlemail-{userId}-{danskDato(nu)}'
 *      — prod har UNIQUE (message_id) WHERE status='sent' (målt 15/9), så
 *      en anden sendt række samme dag afvises af databasen.
 *   g) Fornavn = første ord i profiles.full_name; tomt → null. Samme regel
 *      som fornavnAf (indgangsMailAfsendelse.ts:130-134), som ikke kan
 *      importeres her: den fil importerer managedEmail (npm) og en https:-
 *      type, og vitest læser den ikke. Reglen står derfor her som
 *      fornavnFraFuldtNavn med kilde.
 * INVARIANT i fordelSamlemail: hver række optræder præcis ét sted (mail,
 * stemplesUdenMail eller venter) — testet som notificationEmailSelection's
 * «regnestykket går op». Modtagerne afgøres af skriverne
 * (get_event_non_responders, get_community_medlemmer) og ændres ikke her.
 *
 * RAMMEN ER EN KOPI — ÅBENT: indgangsMailHtml (./indgangsMail.ts:122-152)
 * er eksporteret, men dens kontrakt escaper alle afsnit og kræver en
 * underskrift, så linjer med fed titel, link-anker og gruppeoverskrift kan
 * ikke gå igennem den uden at ændre mailens form. Markup'en herunder er
 * derfor den samme ramme som indgangsMail.ts:130-151 og opslagsMail.ts:
 * 173-204 — tre kopier i huset. Samles, når nogen tager rammen ud som
 * funktion med råt indhold.
 */
import { datoOrd, tidOrd } from "./eventMails.ts";
import { escHtml } from "./htmlEscape.ts";
import { bulletproofButton, fallbackLinkBlock } from "./emailButtonHelpers.ts";
import { tiltale } from "./indgangsMail.ts";
import { copenhagenHour } from "./notificationEmailSelection.ts";
import { visningsnavn } from "./opslagsMail.ts";


const TZ = "Europe/Copenhagen";

// ── Typerne der samles ──────────────────────────────────────────────────

/** Chattens forslag 15/9, ikke modsagt: præcis disse to typer samles. Alt andet mailes som i dag. */
export const SAMLEMAIL_TYPER = ["event_published", "community_opslag"] as const;
export type SamlemailType = (typeof SAMLEMAIL_TYPER)[number];

export function erSamlemailType(type: string): boolean {
  return (SAMLEMAIL_TYPER as readonly string[]).includes(type);
}

// ── Tiden ───────────────────────────────────────────────────────────────

/** Jonas 15/9: samlemailen sendes fra kl. 17:00 dansk tid. */
export const SAMLEMAIL_TIME_DANSK = 17;
/** Chattens beslutning 15/9 (a): kun i vinduet 17–20 dansk (eksklusiv 20); ikke sendt inden 20 → næste dag kl. 17. */
export const SAMLEMAIL_SLUT_TIME_DANSK = 20;

/**
 * Ældre end dette er forældet og kommer ikke med. Regnestykket: samlemailen
 * sendes én gang i døgnet; en række skrevet lige efter gårsdagens udsendelse
 * er ca. 24 t gammel ved næste; 48 t giver én mislykket dag som margin;
 * ældre er forældet.
 */
export const SAMLEMAIL_MAKS_ALDER_TIMER = 48;

/** Dansk kalenderdag som «YYYY-MM-DD» — sv-SE giver ISO-formen (som event-reminders/index.ts:42 og maanedsnoegle.ts:21). */
export function danskDato(t: Date): string {
  return t.toLocaleDateString("sv-SE", { timeZone: TZ });
}

/** Er dansk klokkeslæt inden for vinduet 17 ≤ time < 20? */
export function erISamlemailVindue(nu: Date): boolean {
  const time = copenhagenHour(nu);
  return time >= SAMLEMAIL_TIME_DANSK && time < SAMLEMAIL_SLUT_TIME_DANSK;
}

/** Er der allerede sendt en samlemail til modtageren på nu's danske dato? */
export function erSendtIDag(nu: Date, sidstSendt: Date | null): boolean {
  return sidstSendt !== null && danskDato(sidstSendt) === danskDato(nu);
}

/**
 * Er det tid til samlemailen? Sand når dansk klokkeslæt for nu er i vinduet
 * 17 ≤ time < 20 OG (sidstSendt er null ELLER sidstSendt ligger på en anden
 * dansk dato end nu). Én pr. modtager pr. dansk døgn (Jonas 15/9). En fejlet
 * kørsel kl. 17:00 prøves igen ved næste kørsel samme aften (datoen er
 * stadig ny); efter kl. 20 og efter midnat venter rækkerne til næste dag
 * kl. 17 (chattens beslutning a).
 */
export function erSamlemailTid(nu: Date, sidstSendt: Date | null): boolean {
  if (!erISamlemailVindue(nu)) return false;
  return !erSendtIDag(nu, sidstSendt);
}

/** Forældet når rækken er ÆLDRE end grænsen (præcis 48 t er ikke forældet — som erForaeldet i notificationEmailSelection.ts:132-137). */
export function erForaeldetTilSamlemail(oprettet: Date, nu: Date): boolean {
  return nu.getTime() - oprettet.getTime() > SAMLEMAIL_MAKS_ALDER_TIMER * 60 * 60 * 1000;
}

// ── Punkterne ───────────────────────────────────────────────────────────

export interface SamlemailPunkt {
  id: string;
  type: SamlemailType;
  titel: string;
  tekst: string | null;
  /** Absolut URL eller husets deep_link («/events/{id}») — sidstnævnte sættes på appUrl. */
  link: string | null;
  oprettet: Date;
  /** Jonas 15/9: præsentationer er med i samlemailen — som første gruppe. */
  erPraesentation: boolean;
}

export type SamlemailGruppe = "praesentation" | "event" | "opslag";

export const GRUPPE_OVERSKRIFT: Readonly<Record<SamlemailGruppe, string>> = {
  praesentation: "Nye medlemmer har præsenteret sig",
  event: "Nye events",
  opslag: "Nye opslag i Community",
};

const GRUPPE_RAEKKEFOELGE: readonly SamlemailGruppe[] = ["praesentation", "event", "opslag"];

export function gruppeAf(p: Pick<SamlemailPunkt, "type" | "erPraesentation">): SamlemailGruppe {
  if (p.erPraesentation) return "praesentation";
  return p.type === "event_published" ? "event" : "opslag";
}

/** Kopi sorteret: præsentationer, events, øvrige opslag — inden for hver gruppe ældste først. */
export function sorterPunkter(punkter: readonly SamlemailPunkt[]): SamlemailPunkt[] {
  return [...punkter].sort((a, b) => {
    const ga = GRUPPE_RAEKKEFOELGE.indexOf(gruppeAf(a));
    const gb = GRUPPE_RAEKKEFOELGE.indexOf(gruppeAf(b));
    if (ga !== gb) return ga - gb;
    return a.oprettet.getTime() - b.oprettet.getTime();
  });
}

// ── Emnet ───────────────────────────────────────────────────────────────

/** «a», «a og b», «a, b og c». */
export function samlMedOg(dele: readonly string[]): string {
  if (dele.length <= 1) return dele.join("");
  return `${dele.slice(0, -1).join(", ")} og ${dele[dele.length - 1]}`;
}

export const EMNE_PRAEFIKS = "Nyt i The Boardroom: ";

export function samlemailEmne(punkter: readonly SamlemailPunkt[]): string {
  if (punkter.length === 0) throw new Error("samlemail uden punkter");
  let praes = 0;
  let events = 0;
  let opslag = 0;
  for (const p of punkter) {
    const g = gruppeAf(p);
    if (g === "praesentation") praes++;
    else if (g === "event") events++;
    else opslag++;
  }
  const dele: string[] = [];
  if (praes > 0) dele.push(praes === 1 ? "1 nyt medlem har præsenteret sig" : `${praes} nye medlemmer har præsenteret sig`);
  if (events > 0) dele.push(events === 1 ? "1 nyt event" : `${events} nye events`);
  if (opslag > 0) dele.push(opslag === 1 ? "1 nyt opslag" : `${opslag} nye opslag`);
  return `${EMNE_PRAEFIKS}${samlMedOg(dele)}`;
}

// ── Tidsmærket ──────────────────────────────────────────────────────────

/** Klokkeslættet og ugedag + dato er eventMails.ts' datoOrd/tidOrd (importeret — chattens beslutning 15/9, se filhovedet). */
function klokke(t: Date): string {
  return tidOrd(t.toISOString());
}

function ugedagDato(t: Date): string {
  return datoOrd(t.toISOString());
}

/** Dagnummer for en «YYYY-MM-DD»-streng, så to danske datoer kan trækkes fra hinanden uden tidszone. */
function dagnummer(dato: string): number {
  const [aar, maaned, dag] = dato.split("-").map(Number);
  return Date.UTC(aar, maaned - 1, dag) / 86_400_000;
}

/**
 * Tidspunktet på hver linje (Jonas 15/9: «live session i morgen» skal
 * stadig kunne læses rigtigt). Samme danske dato som nu: «i dag kl. {tidOrd}»;
 * dagen før: «i går kl. {tidOrd}»; ældre end i går: «{datoOrd} kl. {tidOrd}».
 */
export function tidsmaerke(oprettet: Date, nu: Date): string {
  const diff = dagnummer(danskDato(nu)) - dagnummer(danskDato(oprettet));
  if (diff === 0) return `i dag kl. ${klokke(oprettet)}`;
  if (diff === 1) return `i går kl. ${klokke(oprettet)}`;
  return `${ugedagDato(oprettet)} kl. ${klokke(oprettet)}`;
}

// ── Mailen ──────────────────────────────────────────────────────────────
// escHtml, tiltale, bulletproofButton og fallbackLinkBlock er importeret —
// originalerne, ingen kopier. Rammen nedenfor er den eneste kopi (se filhovedet).

const P_STYLE = "color:#4D6663;font-size:14px;line-height:1.6;margin:0 0 14px";
const EYEBROW_STYLE = "font-size:11px;font-weight:600;color:#B8572E;text-transform:uppercase;letter-spacing:.08em;margin:18px 0 10px";

export const KNAP_TEKST = "Åbn The Boardroom";
export const INDLEDNING = "Her er det nye i The Boardroom siden sidst — samlet i én mail.";

export interface SamlemailInput {
  fornavn: string | null;
  punkter: readonly SamlemailPunkt[];
  nu: Date;
  appUrl: string;
}

export interface Samlemail {
  emne: string;
  html: string;
  tekst: string;
}

function linkTekst(g: SamlemailGruppe): string {
  return g === "event" ? "Se eventet" : "Læs opslaget";
}

function fuldUrl(link: string, appUrl: string): string {
  return /^https?:\/\//i.test(link) ? link : `${appUrl}${link}`;
}

/**
 * Bygger samlemailen. Rammen er husets mailfamilie (indgangsMail.ts:130-151,
 * den opslagsMail.ts:173-204 også bruger): 520 px, #133332-header med
 * #27AE82-linje, Manrope, 28/32 px indre kant, knappen evergreen #133332.
 * Tiltalen er tiltale("Hej", fornavn). AL brugertekst (titel, tekst, navn,
 * link) escapes. Én knap til platformen. Tom liste kaster — kalderen må
 * aldrig bygge en tom mail.
 */
export function bygSamlemail(input: SamlemailInput): Samlemail {
  if (input.punkter.length === 0) throw new Error("samlemail uden punkter");
  const sorteret = sorterPunkter(input.punkter);
  const emne = samlemailEmne(sorteret);
  const overskrift = tiltale("Hej", input.fornavn);
  const appUrl = input.appUrl.replace(/\/+$/, "");

  const htmlDele: string[] = [];
  const tekstDele: string[] = [overskrift, "", INDLEDNING];
  let sidsteGruppe: SamlemailGruppe | null = null;
  for (const p of sorteret) {
    const g = gruppeAf(p);
    if (g !== sidsteGruppe) {
      htmlDele.push(`    <p style="${EYEBROW_STYLE}">${escHtml(GRUPPE_OVERSKRIFT[g])}</p>`);
      tekstDele.push("", GRUPPE_OVERSKRIFT[g].toUpperCase());
      sidsteGruppe = g;
    }
    const naar = tidsmaerke(p.oprettet, input.nu);
    const tekst = (p.tekst ?? "").trim();
    const url = p.link ? fuldUrl(p.link, appUrl) : null;
    htmlDele.push(
      `    <p style="${P_STYLE}"><strong style="color:#152825">${escHtml(p.titel)}</strong><br>` +
        `<span style="color:#9ca3af;font-size:13px">${escHtml(naar)}</span>` +
        (tekst ? `<br>${escHtml(tekst)}` : "") +
        (url ? `<br><a href="${escHtml(url)}" style="color:#20916C;text-decoration:underline">${linkTekst(g)}</a>` : "") +
        `</p>`,
    );
    tekstDele.push(`- ${p.titel} — ${naar}`);
    if (tekst) tekstDele.push(`  ${tekst}`);
    if (url) tekstDele.push(`  ${linkTekst(g)}: ${url}`);
  }

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
    <h1 style="color:#133332;font-size:20px;font-weight:700;margin:0 0 16px;line-height:1.3">${escHtml(overskrift)}</h1>
    <p style="${P_STYLE}">${escHtml(INDLEDNING)}</p>
${htmlDele.join("\n")}
${bulletproofButton({ href: appUrl, label: KNAP_TEKST, bgColor: "#133332" })}
${fallbackLinkBlock(appUrl)}
    <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:24px 0 0;border-top:1px solid #E4E2DD;padding-top:16px">The Boardroom · theboardroom.dk &nbsp;·&nbsp; <a href="${escHtml(appUrl)}/settings" style="color:#9ca3af;text-decoration:underline">Administrer notifikationer</a></p>
  </div>
</div>
</body>
</html>`;

  tekstDele.push("", `${KNAP_TEKST}: ${appUrl}`);
  return { emne, html, tekst: tekstDele.join("\n") };
}

// ── DEL 2: mapningen fra rækker til punkter (chattens beslutninger b–c) ──

export const SAMLEMAIL_LABEL = "notification-samlemail";

/** Grunde til at en række stemples UDEN mail — logges af kalderen, som køens disposeGrund. */
export const UDELAD = {
  EVENT_MANGLER: "event_mangler",
  EVENT_IKKE_PUBLICERET: "event_ikke_publiceret",
  EVENT_PASSERET: "event_passeret",
  TRAAD_MANGLER: "traad_mangler",
  TRAAD_IKKE_AKTIV: "traad_ikke_aktiv",
  SET_I_APP: "set_i_app",
  FORAELDET: "foraeldet",
  RAADGIVER: "raadgiver",
  PREF_FRA: "pref_fra",
} as const;
export type UdeladGrund = (typeof UDELAD)[keyof typeof UDELAD];

/** Grunde til at en række VENTER — hverken mail eller stempel. */
export const VENT = {
  UDEN_FOR_VINDUET: "uden_for_vinduet",
  SENDT_I_DAG: "sendt_i_dag",
  MODTAGER_UKENDT: "modtager_ukendt",
  INGEN_MAIL: "ingen_mail",
  DAGSKVOTE_NAAET: "dagskvote_naaet",
} as const;
export type VentGrund = (typeof VENT)[keyof typeof VENT];

/** Det motoren skal bruge af en notifications-række (send-notification-email henter mere). */
export interface SamlemailRaekke {
  id: string;
  user_id: string;
  type: SamlemailType;
  reference_id: string | null;
  deep_link: string | null;
  created_at: string;
}

/** events-rækken (publish-event skriver title/starts_at/meet_url/status, recon-samlemail-integration.md §1). */
export interface EventTilSamlemail {
  title: string;
  starts_at: string;
  meet_url: string | null;
  status: string;
}

/** community_traade-rækken (id = reference_id; kilde_type er en kolonne i samme tabel, recon §2). */
export interface TraadTilSamlemail {
  titel: string;
  status: string;
  kilde_type: string | null;
}

export type Mapning = { punkt: SamlemailPunkt } | { udelad: UdeladGrund };

export const KILDE_PRAESENTATION = "praesentation";

/** b) event_published → punkt, eller udeladt når eventet mangler, ikke er publiceret, eller er begyndt. */
export function punktFraEvent(a: { raekke: SamlemailRaekke; event: EventTilSamlemail | null | undefined; nu: Date }): Mapning {
  const { raekke, event, nu } = a;
  if (!event) return { udelad: UDELAD.EVENT_MANGLER };
  if (event.status !== "published") return { udelad: UDELAD.EVENT_IKKE_PUBLICERET };
  if (new Date(event.starts_at).getTime() <= nu.getTime()) return { udelad: UDELAD.EVENT_PASSERET };
  const hvor = event.meet_url ? " · Online" : "";
  return {
    punkt: {
      id: raekke.id,
      type: "event_published",
      titel: event.title,
      tekst: `${datoOrd(event.starts_at)} kl. ${tidOrd(event.starts_at)}${hvor}`,
      link: raekke.deep_link,
      oprettet: new Date(raekke.created_at),
      erPraesentation: false,
    },
  };
}

/** c) community_opslag → punkt, eller udeladt når tråden mangler/ikke er aktiv, eller modtageren har åbnet den (set i app). */
export function punktFraOpslag(a: {
  raekke: SamlemailRaekke;
  traad: TraadTilSamlemail | null | undefined;
  forfatternavn: string | null | undefined;
  harAabnetTraaden: boolean;
}): Mapning {
  const { raekke, traad, forfatternavn, harAabnetTraaden } = a;
  if (!traad) return { udelad: UDELAD.TRAAD_MANGLER };
  if (traad.status !== "aktiv") return { udelad: UDELAD.TRAAD_IKKE_AKTIV };
  if (harAabnetTraaden) return { udelad: UDELAD.SET_I_APP };
  const erPraesentation = traad.kilde_type === KILDE_PRAESENTATION;
  const navn = visningsnavn(forfatternavn);
  return {
    punkt: {
      id: raekke.id,
      type: "community_opslag",
      titel: traad.titel,
      tekst: erPraesentation ? `${navn} har præsenteret sig` : `${navn} har skrevet i Community`,
      link: raekke.deep_link,
      oprettet: new Date(raekke.created_at),
      erPraesentation,
    },
  };
}

/** g) Fornavn = første ord i profiles.full_name; tomt → null (samme regel som fornavnAf, indgangsMailAfsendelse.ts:130-134). */
export function fornavnFraFuldtNavn(fullName: string | null | undefined): string | null {
  const navn = (fullName ?? "").trim();
  if (!navn) return null;
  return navn.split(/\s+/)[0];
}

/** f) Én sendt samlemail pr. modtager pr. dansk dato — nøglen afvises af UNIQUE (message_id) WHERE status = 'sent'. */
export function samlemailIdempotencyKey(userId: string, nu: Date): string {
  return `${SAMLEMAIL_LABEL}-${userId}-${danskDato(nu)}`;
}

// ── DEL 2: fordelingen (chattens beslutninger a, d, e, f) ───────────────

/** Det kalderen har slået op pr. række — event for event_published, tråd/forfatter/visning for community_opslag. */
export interface OpslaaetData {
  event?: EventTilSamlemail | null;
  traad?: TraadTilSamlemail | null;
  forfatternavn?: string | null;
  harAabnetTraaden?: boolean;
}

export interface SamlemailModtager {
  erRaadgiver: boolean;
  /** notification_email_prefs.important === false */
  importantFra: boolean;
  email: string | null;
  fornavn: string | null;
  sidstSendt: Date | null;
  dagskvoteNaaet: boolean;
}

export interface FordelInput {
  nu: Date;
  raekker: readonly SamlemailRaekke[];
  opslaaet: ReadonlyMap<string, OpslaaetData>;
  modtagere: ReadonlyMap<string, SamlemailModtager>;
}

export interface SamlemailTilAfsendelse {
  userId: string;
  email: string;
  fornavn: string | null;
  punkter: SamlemailPunkt[];
  raekkeIder: string[];
  idempotencyKey: string;
}

export interface FordelResultat {
  mails: SamlemailTilAfsendelse[];
  stemplesUdenMail: Array<{ id: string; grund: UdeladGrund }>;
  venter: Array<{ id: string; grund: VentGrund }>;
}

/**
 * Fordeler samlemailens rækker. Rækkefølgen pr. række: forældet (d) →
 * stemples; uden for vinduet eller allerede sendt i dag (a, f) → venter;
 * modtager ukendt → venter; rådgiver eller pref fra (e) → stemples; ingen
 * mail eller kvote nået (e) → venter; mapning (b, c) → punkt eller stemples
 * med grund. En modtager hvis punkter alle er udeladt, får ingen mail.
 * INVARIANT: hver række optræder præcis ét sted. Ren: ingen I/O.
 */
export function fordelSamlemail(input: FordelInput): FordelResultat {
  const { nu, raekker, opslaaet, modtagere } = input;
  const stemplesUdenMail: FordelResultat["stemplesUdenMail"] = [];
  const venter: FordelResultat["venter"] = [];
  const prModtager = new Map<string, SamlemailPunkt[]>();
  const iVinduet = erISamlemailVindue(nu);

  for (const r of raekker) {
    if (erForaeldetTilSamlemail(new Date(r.created_at), nu)) {
      stemplesUdenMail.push({ id: r.id, grund: UDELAD.FORAELDET });
      continue;
    }
    if (!iVinduet) {
      venter.push({ id: r.id, grund: VENT.UDEN_FOR_VINDUET });
      continue;
    }
    const m = modtagere.get(r.user_id);
    if (!m) {
      venter.push({ id: r.id, grund: VENT.MODTAGER_UKENDT });
      continue;
    }
    if (erSendtIDag(nu, m.sidstSendt)) {
      venter.push({ id: r.id, grund: VENT.SENDT_I_DAG });
      continue;
    }
    if (m.erRaadgiver) {
      stemplesUdenMail.push({ id: r.id, grund: UDELAD.RAADGIVER });
      continue;
    }
    if (m.importantFra) {
      stemplesUdenMail.push({ id: r.id, grund: UDELAD.PREF_FRA });
      continue;
    }
    if (!m.email) {
      venter.push({ id: r.id, grund: VENT.INGEN_MAIL });
      continue;
    }
    if (m.dagskvoteNaaet) {
      venter.push({ id: r.id, grund: VENT.DAGSKVOTE_NAAET });
      continue;
    }
    const data = opslaaet.get(r.id) ?? {};
    const mapning =
      r.type === "event_published"
        ? punktFraEvent({ raekke: r, event: data.event, nu })
        : punktFraOpslag({
            raekke: r,
            traad: data.traad,
            forfatternavn: data.forfatternavn,
            harAabnetTraaden: data.harAabnetTraaden === true,
          });
    if ("udelad" in mapning) {
      stemplesUdenMail.push({ id: r.id, grund: mapning.udelad });
      continue;
    }
    const liste = prModtager.get(r.user_id) ?? [];
    liste.push(mapning.punkt);
    prModtager.set(r.user_id, liste);
  }

  const mails: SamlemailTilAfsendelse[] = [];
  for (const [userId, punkter] of prModtager) {
    const m = modtagere.get(userId)!;
    mails.push({
      userId,
      email: m.email!,
      fornavn: m.fornavn,
      punkter: sorterPunkter(punkter),
      raekkeIder: punkter.map((p) => p.id),
      idempotencyKey: samlemailIdempotencyKey(userId, nu),
    });
  }
  return { mails, stemplesUdenMail, venter };
}
