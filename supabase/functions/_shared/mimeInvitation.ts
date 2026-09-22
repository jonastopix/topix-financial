/**
 * mimeInvitation — bekræftelsen med en RIGTIG kalenderinvitation vedhæftet
 * (22/9-2026).
 *
 * ── HVORFOR DEN HER FIL FINDES: MAILGUNS `/messages` KAN DET IKKE ──────────
 *
 * Mailguns almindelige endepunkt tager vedhæftninger, men kun som filer:
 *
 *   «`attachment` — Array of strings, (binary)» · «You must use
 *   `multipart/form-data` encoding for sending attachments.»
 *   <https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages/post-v3--domain-name--messages>
 *
 * Der er INGEN dokumenteret måde at sætte Content-Type PR. VEDHÆFTNING. Uden
 * den ville `invite.ics` få `text/calendar` uden `method=REQUEST` — og så er
 * det ikke en invitation:
 *
 *   «Gmail and Google Calendar interpret ICS files as RSVP events, whereas
 *    **Outlook treats the same ICS file as a regular attachment**.» · «setting
 *    the email header as `ContentType = "text/calendar; method=REQUEST;
 *    charset=UTF-8"` causes the ICS file to display as an RSVP event in
 *    Outlook. However … `ContentType = "text/calendar;"` results in the ICS
 *    file being treated as a normal attachment, not as an RSVP event.»
 *   <https://learn.microsoft.com/en-us/answers/questions/4738199/how-to-ensure-ics-files-are-displayed-as-rsvp-even>
 *
 * DERFOR BYGGER VI MIME'EN SELV og sender den til Mailguns ANDET endepunkt:
 *
 *   «POST `/v3/{domain_name}/messages.mime`» · `message`: «The MIME content
 *   itself» — «Send options (parameters starting with `o:`, `h:`, `v:`, or
 *   `t:`) are limited to 16KB total»
 *   <https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages/post-v3--domain-name--messages.mime>
 *
 * Kun bekræftelsen går den vej. De fem påmindelser har ingen vedhæftning og
 * bliver på `/messages`, hvor `o:tracking` og `h:`-headerne er felter og ikke
 * linjer, vi selv skal skrive.
 *
 * ── FORMEN: INLINE **OG** VEDHÆFTET ───────────────────────────────────────
 * Postmark, som er den eneste udbyder med en skrevet opskrift, anbefaler at
 * lægge kalenderdelen ind i TO former — «inline with 7-bit encoding **and** as
 * an attached file with base64 encoding» — «to ensure wider support across
 * different calendar servers and email clients».
 * <https://postmarkapp.com/support/article/1101-how-do-i-send-calendar-invites-with-postmark>
 *
 *   multipart/mixed
 *   ├── multipart/alternative
 *   │   ├── text/plain
 *   │   ├── text/html
 *   │   └── text/calendar; charset=utf-8; method=REQUEST     ← inline
 *   └── text/calendar; charset=utf-8; method=REQUEST; name="invite.ics"
 *       Content-Disposition: attachment                       ← vedhæftet
 *
 * ── INVITATIONEN ER EWEBINARS EGEN ────────────────────────────────────────
 * Vi bygger den IKKE selv. `addToCalendarLink` er eWebinars personlige
 * .ics-endepunkt pr. registrant («Calendar ICS file URL»,
 * <https://ewebinar.com/help/webhook>), målt 22/9 som offentligt tilgængeligt
 * (HTTP 200) og med METHOD:REQUEST. Den bærer eWebinars eget UID, ORGANIZER og
 * ATTENDEE — og dermed også muligheden for, at en senere ændring eller
 * aflysning fra eWebinar RAMMER den samme aftale i modtagerens kalender
 * (RFC 5546: samme UID + højere SEQUENCE afløser). En .ics, vi selv byggede,
 * ville være en konkurrerende aftale ved siden af eWebinars egen.
 *
 * KASTER ALDRIG. Kan filen ikke hentes, svarer `hentInvitation` med grunden,
 * og kalderen sender mailen UDEN vedhæftning — en bekræftelse uden invitation
 * er stadig en bekræftelse. Det skrives i sporet.
 */

export const INVITATION_TIMEOUT_MS = 8000;
export const INVITATION_MAKS_BYTES = 256 * 1024;
export const INVITATION_FILNAVN = "invite.ics";
/** Ordret den type, der får Outlook til at vise Ja/Nej (se filhovedet). */
export const INVITATION_TYPE = 'text/calendar; charset=utf-8; method=REQUEST';

export type InvitationUdfald = "hentet" | "intet_link" | "ikke_ics" | "for_stor" | "fejl" | "timeout";

export interface Invitation {
  udfald: InvitationUdfald;
  /** Filens indhold, når den kunne hentes. */
  ics: string | null;
  grund: string | null;
  varighed_ms: number;
}

/**
 * Hent eWebinars personlige .ics. KASTER ALDRIG.
 *
 * FAIL-SOFT MED VILJE: en bekræftelse, der venter på en fil, er en
 * bekræftelse, der ikke bliver sendt.
 */
export async function hentInvitation(
  url: string | null | undefined,
  valg: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<Invitation> {
  const start = Date.now();
  const ud = (udfald: InvitationUdfald, grund: string | null, ics: string | null = null): Invitation =>
    ({ udfald, ics, grund, varighed_ms: Date.now() - start });

  const u = (url ?? "").trim();
  if (!u || !/^https:\/\//i.test(u)) return ud("intet_link", "ingen kalender_link på tilmeldingen");

  const f = valg.fetcher ?? fetch;
  const styring = new AbortController();
  const ur = setTimeout(() => styring.abort(), valg.timeoutMs ?? INVITATION_TIMEOUT_MS);
  try {
    const svar = await f(u, { signal: styring.signal, redirect: "follow" });
    if (!svar.ok) return ud("fejl", `eWebinar svarede ${svar.status}`);
    const tekst = await svar.text();
    if (tekst.length > INVITATION_MAKS_BYTES) return ud("for_stor", `${tekst.length} tegn — over loftet`);
    // FAIL-CLOSED PÅ INDHOLDET: en HTML-fejlside med status 200 må ikke blive
    // vedhæftet som en kalenderinvitation. Vi vedhæfter kun noget, der ER en.
    if (!/BEGIN:VCALENDAR/i.test(tekst) || !/BEGIN:VEVENT/i.test(tekst)) {
      return ud("ikke_ics", "svaret er ikke en iCalendar-fil");
    }
    return ud("hentet", null, tekst);
  } catch (e) {
    const afbrudt = e instanceof Error && e.name === "AbortError";
    return ud(afbrudt ? "timeout" : "fejl", afbrudt ? `intet svar inden ${valg.timeoutMs ?? INVITATION_TIMEOUT_MS} ms` : String(e).slice(0, 300));
  } finally {
    clearTimeout(ur);
  }
}

// ── MIME'en ────────────────────────────────────────────────────────────────

const CRLF = "\r\n";

/** base64 i linjer à 76 tegn (RFC 2045 §6.8). */
export function base64Linjer(tekst: string): string {
  const bytes = new TextEncoder().encode(tekst);
  let raa = "";
  for (const b of bytes) raa += String.fromCharCode(b);
  const b64 = btoa(raa);
  const linjer: string[] = [];
  for (let i = 0; i < b64.length; i += 76) linjer.push(b64.slice(i, i + 76));
  return linjer.join(CRLF);
}

/**
 * Et hoved-felt, der kan bære ikke-ASCII (RFC 2047, base64-form). Emnelinjen
 * har æ, ø og å — uden det her ville den stå som volapyk.
 */
export function encodetOrd(tekst: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(tekst)) return tekst;
  const bytes = new TextEncoder().encode(tekst);
  let raa = "";
  for (const b of bytes) raa += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(raa)}?=`;
}

/** Afsenderlinjen «Navn <adresse>» med navnet encodet, hvis det behøver det. */
export function encodetAfsender(afsender: string): string {
  const m = afsender.match(/^(.*?)\s*<([^>]+)>$/);
  if (!m) return afsender;
  return `${encodetOrd(m[1].trim())} <${m[2]}>`;
}

export interface MimeBrev {
  til: string;
  fra: string;
  emne: string;
  html: string;
  tekst: string;
  svarTil: string;
  afmeldUrl: string;
  /** eWebinars .ics — null når den ikke kunne hentes (fail-soft). */
  ics: string | null;
  /** Message-ID'ets domænedel. */
  domaene: string;
  /** Givet ind, så prøven er deterministisk. */
  grænse?: string;
  dato?: Date;
  messageId?: string;
}

/**
 * Hele MIME-meddelelsen. REN FUNKTION — hver linje kan prøves uden at røre
 * netværket, og en ændring i formen bliver en rød prøve i stedet for en mail,
 * der ser forkert ud i én klient.
 *
 * Uden `ics` bygges den som `multipart/alternative` alene: ingen tom
 * vedhæftning, ingen mixed-lag der ikke bærer noget.
 */
export function bygMime(b: MimeBrev): string {
  const g = b.grænse ?? "tbr-graense";
  const gAlt = `${g}-alt`;
  const dato = (b.dato ?? new Date()).toUTCString().replace("GMT", "+0000");
  const messageId = b.messageId ?? `<${crypto.randomUUID()}@${b.domaene}>`;

  const alternativ = [
    `Content-Type: multipart/alternative; boundary="${gAlt}"`,
    "",
    `--${gAlt}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Linjer(b.tekst),
    "",
    `--${gAlt}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Linjer(b.html),
    "",
    // Kalenderdelen INLINE i alternative — den del, Gmail og Apple læser som
    // en invitation uden at åbne en vedhæftning.
    ...(b.ics
      ? [
          `--${gAlt}`,
          `Content-Type: ${INVITATION_TYPE}`,
          "Content-Transfer-Encoding: base64",
          "",
          base64Linjer(b.ics),
          "",
        ]
      : []),
    `--${gAlt}--`,
  ];

  const hoved = [
    `From: ${encodetAfsender(b.fra)}`,
    `To: ${b.til}`,
    `Subject: ${encodetOrd(b.emne)}`,
    `Reply-To: ${b.svarTil}`,
    `Date: ${dato}`,
    `Message-ID: ${messageId}`,
    `List-Unsubscribe: <${b.afmeldUrl}>`,
    "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    "MIME-Version: 1.0",
  ];

  if (!b.ics) {
    return [...hoved, ...alternativ].join(CRLF) + CRLF;
  }

  return [
    ...hoved,
    `Content-Type: multipart/mixed; boundary="${g}"`,
    "",
    `--${g}`,
    ...alternativ,
    "",
    `--${g}`,
    // Og VEDHÆFTET, med samme type — den del, Outlook læser.
    `Content-Type: ${INVITATION_TYPE}; name="${INVITATION_FILNAVN}"`,
    `Content-Disposition: attachment; filename="${INVITATION_FILNAVN}"`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Linjer(b.ics),
    "",
    `--${g}--`,
  ].join(CRLF) + CRLF;
}
