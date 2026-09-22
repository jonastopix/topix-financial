/**
 * mailgunAfsendelse — platformens ENE vej til Mailgun EU (22/9-2026).
 *
 * HVORFOR IKKE HUSETS EGEN MAILVEJ. `managedEmail.ts` sender gennem Lovables
 * mail-API, og den har to grænser, før-webinar-mailene ikke kan leve med:
 *   1. LOFTET. Lovables dokumenterede plan-tabel er Pro 100 / Business 300 /
 *      Enterprise 1.000 app-mails i TIMEN, pr. workspace
 *      (<https://docs.lovable.dev/features/custom-emails>). Én udsendelse til
 *      384 tilmeldte overskrider Business-loftet i sig selv — og loftet deles
 *      med kvitteringer, rykkere og samlemailen.
 *   2. VEDHÆFTNINGER. `EmailSendRequest` i @lovable.dev/email-js@0.1.0 har
 *      intet attachments-felt (læst i pakkens egen .d.ts).
 *
 * OPSAT AF JONAS 22/9: Mailgun EU, domænet `webinar.topix.dk`
 * (SPF/DKIM/MX/CNAME verificeret 16:56), secret `MAILGUN_SENDING_KEY`
 * (en DOMÆNE-sendenøgle, ikke kontoens private nøgle).
 *
 * ── HVERT API-VALG, MED MAILGUNS EGNE ORD ─────────────────────────────────
 *
 * ENDEPUNKTET. «POST /v3/YOUR_DOMAIN_NAME/messages», og for EU-regionen:
 *   «If your domain exists in the EU region, be sure to substitute
 *    "https://api.mailgun.net" with "https://api.eu.mailgun.net"»
 *   <https://documentation.mailgun.com/docs/mailgun/api-reference/api-overview>
 *   <https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-http>
 *
 * LEGITIMATIONEN. «Basic auth with username `api` and your API key as password»
 *   — derfor `Authorization: Basic base64("api:" + nøgle)`.
 *
 * KROPPEN. «Content-Type: multipart/form-data» med felterne
 *   `from` · `to` · `subject` · `text` (påkrævede) og `html` («HTML version»).
 *
 * SPORINGEN SLÅS FRA. `o:tracking` tager «yes, no, true, false, htmlonly», og
 *   `no` «Disable[s] tracking on a per-message basis»
 *   <https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages>
 *   VI SÆTTER `no`, og det er en beslutning, ikke en indstilling: med
 *   klik-sporing skriver Mailgun hvert link om til sit eget domæne — og
 *   linkene her er PERSONLIGE (eWebinars joinLink er adgangen til sessionen).
 *   Et omskrevet link i en servicemail er både en unødig omvej og en ekstra
 *   ting, der kan gå i stykker et minut før start.
 *
 * EGNE HEADERE. «Adds custom headers to the email. Use 'h:' prefix followed by
 *   header name and value» — derfor `h:Reply-To` og `h:List-Unsubscribe`.
 *
 * ── HUSETS FORM ───────────────────────────────────────────────────────────
 * Udfaldene er ORDRET klaviyo.ts' (ok · ingen_noegle · noegle_afvist · loft ·
 * ugyldig · fejl · timeout), så de to spor kan læses ens. KASTER ALDRIG:
 * en mail, der ikke kunne sendes, må ikke kunne vælte en cron-kørsel til 384.
 */

/** Mailguns EU-region. Aldrig api.mailgun.net — dataene skal blive i EU. */
export const MAILGUN_EU_BASE = "https://api.eu.mailgun.net/v3";

/** Domænet, Jonas verificerede 22/9 kl. 16:56. */
export const MAILGUN_DOMAENE = "webinar.topix.dk";

/** Secret'en. En DOMÆNE-sendenøgle — ikke kontoens private nøgle. */
export const MAILGUN_SECRET = "MAILGUN_SENDING_KEY";

/**
 * Hvor længe ét kald må tage. Længere end klaviyo.ts' 3 s, fordi kaldet her
 * IKKE sker inde i en ansøgning eller en betaling — det sker i en cron, hvor
 * den eneste, der venter, er cronen selv. Kortere end cronens eget budget,
 * så en enkelt hængende mail ikke æder kørslen.
 */
export const TIMEOUT_MS = 10_000;

/**
 * Mailguns loft. MÅLT: dokumentationen opgiver 1.000 modtagere pr. batch ved
 * recipient-variables; et dokumenteret loft pr. sekund for enkeltkald har jeg
 * ikke fundet. Vi sender ÉN modtager ad gangen og lægger en lille pause ind
 * mellem kaldene — 20 i sekundet er langsomt nok til aldrig at være problemet
 * og hurtigt nok til at tømme 384 på under et minut.
 */
export const PAUSE_MS = 50;

export type MailgunUdfald = "ok" | "ingen_noegle" | "noegle_afvist" | "loft" | "ugyldig" | "fejl" | "timeout";

/** Sporet efter ét kald. Bærer ALDRIG nøglen. */
export interface MailgunSpor {
  udfald: MailgunUdfald;
  status: number | null;
  /** Mailguns svar, afkortet. */
  svar: string | null;
  /** Vores egen forklaring, når udfaldet ikke er «ok». */
  grund: string | null;
  varighed_ms: number;
  /** Mailguns eget id, når den tog imod. */
  mailgun_id: string | null;
}

export interface MailgunBrev {
  til: string;
  fra: string;
  emne: string;
  html: string;
  tekst: string;
  svarTil: string;
  /** Sættes som List-Unsubscribe — så mailklienten selv kan tilbyde afmelding. */
  afmeldUrl: string;
}

const SVAR_MAKS = 2000;

/** Base64 uden Deno-afhængighed: btoa findes i både Deno og browseren. */
function basicAuth(noegle: string): string {
  return `Basic ${btoa(`api:${noegle}`)}`;
}

/**
 * Kroppen som multipart/form-data. REN FUNKTION — hele formen kan prøves uden
 * at røre netværket, og en ændring i felterne bliver en rød prøve i stedet for
 * en tavs 400'er.
 */
export function bygFormData(b: MailgunBrev): FormData {
  const fd = new FormData();
  fd.set("from", b.fra);
  fd.set("to", b.til);
  fd.set("subject", b.emne);
  fd.set("text", b.tekst);
  fd.set("html", b.html);
  // Ingen åbne- eller klik-sporing: servicemails med personlige links.
  fd.set("o:tracking", "no");
  fd.set("o:tracking-clicks", "no");
  fd.set("o:tracking-opens", "no");
  fd.set("h:Reply-To", b.svarTil);
  // RFC 8058-formen: både One-Click og linket. Mailklienten kan så vise sin
  // egen «Afmeld» — og den fører til VORES side, ikke til Mailguns.
  fd.set("h:List-Unsubscribe", `<${b.afmeldUrl}>`);
  fd.set("h:List-Unsubscribe-Post", "List-Unsubscribe=One-Click");
  return fd;
}

/** URL'en for ét domæne. Ét sted, så EU-regionen ikke kan glemmes. */
export function beskedUrl(domaene: string = MAILGUN_DOMAENE): string {
  return `${MAILGUN_EU_BASE}/${domaene}/messages`;
}

/**
 * URL'en for en FÆRDIGBYGGET MIME — bekræftelsens vej, fordi den bærer en
 * kalenderinvitation:
 *
 *   «POST `/v3/{domain_name}/messages.mime`» · `message`: «The MIME content
 *   itself» · «Send options (parameters starting with `o:`, `h:`, `v:`, or
 *   `t:`) are limited to 16KB total»
 *   <https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages/post-v3--domain-name--messages.mime>
 *
 * Hvorfor ikke `/messages` med `attachment`: dokumentationen giver ingen måde
 * at sætte Content-Type PR. VEDHÆFTNING, og uden `method=REQUEST` viser
 * Outlook filen som en almindelig vedhæftning i stedet for en invitation.
 * Hele begrundelsen står i _shared/mimeInvitation.ts' filhoved.
 */
export function mimeUrl(domaene: string = MAILGUN_DOMAENE): string {
  return `${MAILGUN_EU_BASE}/${domaene}/messages.mime`;
}

/**
 * Kroppen til `/messages.mime`. `to` skal med som felt VED SIDEN AF MIME'en —
 * Mailgun bruger det som konvolut-modtager. Sporingsvalgene er de samme som
 * på `/messages`; headerne står i MIME'en selv og gentages ikke her.
 */
export function bygMimeFormData(til: string, mime: string): FormData {
  const fd = new FormData();
  fd.set("to", til);
  fd.set("message", new Blob([mime], { type: "message/rfc822" }), "besked.mime");
  fd.set("o:tracking", "no");
  fd.set("o:tracking-clicks", "no");
  fd.set("o:tracking-opens", "no");
  return fd;
}

/**
 * Send én mail. KASTER ALDRIG.
 *
 * Nøglen gives IND — den læses ét sted (webinar-mail-cron), så denne fil kan
 * prøves uden Deno.
 */
/** Svaret læses ÉT sted, så de to veje aldrig kan dømme et 429 forskelligt. */
async function doemSvar(svar: Response, start: number): Promise<MailgunSpor> {
  const tekst = (await svar.text().catch(() => "")).slice(0, SVAR_MAKS);
  const varighed = Date.now() - start;
  if (svar.ok) {
    let id: string | null = null;
    try { id = (JSON.parse(tekst) as { id?: string }).id ?? null; } catch { /* Mailgun svarer JSON; en dag måske ikke */ }
    return { udfald: "ok", status: svar.status, svar: tekst, grund: null, varighed_ms: varighed, mailgun_id: id };
  }
  const udfald: MailgunUdfald =
    svar.status === 401 || svar.status === 403 ? "noegle_afvist"
    : svar.status === 429 ? "loft"
    : svar.status >= 400 && svar.status < 500 ? "ugyldig"
    : "fejl";
  return { udfald, status: svar.status, svar: tekst, grund: `Mailgun svarede ${svar.status}`, varighed_ms: varighed, mailgun_id: null };
}

/**
 * Send en FÆRDIGBYGGET MIME (bekræftelsen med invitationen). KASTER ALDRIG.
 * Samme kontrakt og samme udfald som sendMailgun — kun vejen er en anden.
 */
export async function sendMailgunMime(
  noegle: string | null | undefined,
  til: string,
  mime: string,
  valg: { fetcher?: typeof fetch; timeoutMs?: number; domaene?: string } = {},
): Promise<MailgunSpor> {
  const start = Date.now();
  const tom = (udfald: MailgunUdfald, grund: string | null): MailgunSpor =>
    ({ udfald, status: null, svar: null, grund, varighed_ms: Date.now() - start, mailgun_id: null });

  const n = (noegle ?? "").trim();
  if (!n) return tom("ingen_noegle", `secret'en ${MAILGUN_SECRET} mangler — intet sendt`);
  if (!til.includes("@")) return tom("ugyldig", "modtageren er ikke en mailadresse");

  const f = valg.fetcher ?? fetch;
  const styring = new AbortController();
  const ur = setTimeout(() => styring.abort(), valg.timeoutMs ?? TIMEOUT_MS);
  try {
    const svar = await f(mimeUrl(valg.domaene), {
      method: "POST",
      headers: { Authorization: basicAuth(n) },
      body: bygMimeFormData(til, mime),
      signal: styring.signal,
    });
    return await doemSvar(svar, start);
  } catch (e) {
    const afbrudt = e instanceof Error && e.name === "AbortError";
    return tom(afbrudt ? "timeout" : "fejl", afbrudt ? `intet svar inden ${valg.timeoutMs ?? TIMEOUT_MS} ms` : `kaldet kastede: ${String(e).slice(0, 300)}`);
  } finally {
    clearTimeout(ur);
  }
}

export async function sendMailgun(
  noegle: string | null | undefined,
  brev: MailgunBrev,
  valg: { fetcher?: typeof fetch; timeoutMs?: number; domaene?: string } = {},
): Promise<MailgunSpor> {
  const start = Date.now();
  const tom = (udfald: MailgunUdfald, grund: string | null, status: number | null = null, svar: string | null = null): MailgunSpor =>
    ({ udfald, status, svar, grund, varighed_ms: Date.now() - start, mailgun_id: null });

  const n = (noegle ?? "").trim();
  if (!n) return tom("ingen_noegle", `secret'en ${MAILGUN_SECRET} mangler — intet sendt`);
  if (!brev.til.includes("@")) return tom("ugyldig", "modtageren er ikke en mailadresse");

  const f = valg.fetcher ?? fetch;
  const styring = new AbortController();
  const ur = setTimeout(() => styring.abort(), valg.timeoutMs ?? TIMEOUT_MS);
  try {
    const svar = await f(beskedUrl(valg.domaene), {
      method: "POST",
      headers: { Authorization: basicAuth(n) },
      body: bygFormData(brev),
      signal: styring.signal,
    });
    return await doemSvar(svar, start);
  } catch (e) {
    const afbrudt = e instanceof Error && e.name === "AbortError";
    return tom(afbrudt ? "timeout" : "fejl", afbrudt ? `intet svar inden ${valg.timeoutMs ?? TIMEOUT_MS} ms` : `kaldet kastede: ${String(e).slice(0, 300)}`);
  } finally {
    clearTimeout(ur);
  }
}
