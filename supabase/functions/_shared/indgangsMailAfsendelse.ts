/**
 * Indgangens send-vej — én funktion, som begge indgange deler.
 *
 * HVORFOR DEN FINDES: dag 0-mailen sendes af send-indgangs-betalingsmail
 * (kaldt af Monday-grenen og af prissætningen, §19), og dag 14/25/31
 * sendes af indgangs-paamindelser-cron. Begge skal ende i den samme kø
 * på den samme måde. Send-vejen er kopieret fra send-invitation-email og
 * intro-reminder-cron (målt 2/9, recon af mailsystemet):
 *
 *   1. email_send_log får en række med status 'pending' FØR enqueue.
 *   2. enqueue_email(queue_name, payload) — service-role-only, tager kun
 *      et JSONB-objekt og kender ingen bruger. Det er netop derfor køen
 *      kan bruges her: modtageren har ikke en konto endnu.
 *   3. message_id = crypto.randomUUID(), som også er idempotency_key.
 *      DB-værnet er unique index på email_send_log(message_id) WHERE
 *      status = 'sent'.
 *
 * KASTER ALDRIG. Fejler noget, logges det med company_id, og der
 * returneres false. Kalderen afgør hvad det betyder: dag 0-kalderen
 * svarer 500 og lader betalingsmail_sendt_at stå tom, cronen tæller en
 * fejl og lader sidste_paamindelse_dag stå — i begge tilfælde prøves
 * mailen igen næste gang frem for at forsvinde (samme regel som
 * intro-reminder-cron: stemplet sættes KUN ved succes).
 *
 * AFSENDER: det verificerede domæne, samme VERIFIED_FROM_EMAIL som
 * send-notification-email. Afsendernavnet er «The Boardroom» — mailene
 * er signeret Morten Larsen i teksten, og rådgivermailen er ikke fra
 * Morten.
 *
 * DATOHJÆLPERNE nederst bor her og ikke i betalingsfrist.ts, fordi den
 * fil er et ordret spejl af src/lib/betalingsfrist.ts og skal forblive
 * uden IO og uden formatering. Fristen som DATO er §9's regel, og den
 * skal være den SAMME dato som betalingssiden viser: hent_betalingstilbud
 * regner underskrevet_at::date + 30 i Postgres (UTC), så her regnes på
 * UTC-komponenter og lægges BETALINGSFRIST_DAGE til. FRISTEN ER
 * KONTRAKTENS (rettet 2/9): 30 dage fra underskriften, ikke fra mailen.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { BETALINGSFRIST_DAGE } from "./betalingsfrist.ts";

export const SENDER_DOMAIN = "boardroom.topix.dk";
export const VERIFIED_FROM_EMAIL = `noreply@${SENDER_DOMAIN}`;
export const SENDER_FROM = `The Boardroom <${VERIFIED_FROM_EMAIL}>`;

const QUEUE_NAME = "transactional_emails";

export interface SendIndgangsMailArgs {
  adminClient: SupabaseClient;
  til: string;
  subject: string;
  html: string;
  /** fx "indgang-dag0" — bliver template_name i email_send_log og label i køen. */
  label: string;
  /** Til logning og til email_send_log.metadata, så en række kan spores til virksomheden. */
  companyId: string;
}

/**
 * Sender én af indgangens mails gennem transactional_emails.
 * true = enqueued (ikke leveret — leveringen er process-email-queue's sag).
 * false = noget fejlede; det er logget, intet er sendt.
 */
export async function sendIndgangsMail(args: SendIndgangsMailArgs): Promise<boolean> {
  const { adminClient, til, subject, html, label, companyId } = args;
  const praefiks = `[indgangsMail:${label}]`;

  const modtager = til.trim().toLowerCase();
  if (!modtager) {
    console.error(`${praefiks} tom modtager for company ${companyId} — intet sendt`);
    return false;
  }

  const messageId = crypto.randomUUID();

  try {
    // 1. pending-rækken FØR enqueue, så en mail der ender i køen altid har
    //    et spor i loggen. Fejler indsættelsen, sendes der ikke: en mail
    //    uden logrække kan ikke afstemmes, og kalderen prøver igen.
    const { error: logError } = await adminClient.from("email_send_log").insert({
      message_id: messageId,
      template_name: label,
      recipient_email: modtager,
      status: "pending",
      metadata: { company_id: companyId, label },
    });
    if (logError) {
      console.error(`${praefiks} email_send_log insert fejlede for company ${companyId}:`, logError);
      return false;
    }

    // 2. Køen. Payload-formen er den samme som send-invitation-email og
    //    intro-reminder-cron bruger; process-email-queue læser den.
    const { error: enqueueError } = await adminClient.rpc("enqueue_email", {
      queue_name: QUEUE_NAME,
      payload: {
        message_id: messageId,
        idempotency_key: messageId,
        to: modtager,
        from: SENDER_FROM,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text: htmlTilTekst(html),
        purpose: "transactional",
        label,
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error(`${praefiks} enqueue_email fejlede for company ${companyId}:`, enqueueError);
      // Samme bogføring som send-invitation-email: en 'failed'-række ved
      // siden af pending-rækken, så loggen viser hvad der skete.
      await adminClient.from("email_send_log").insert({
        message_id: messageId,
        template_name: label,
        recipient_email: modtager,
        status: "failed",
        error_message: "Failed to enqueue email",
        metadata: { company_id: companyId, label },
      });
      return false;
    }

    console.log(`${praefiks} enqueued til ${modtager} for company ${companyId} (message_id ${messageId})`);
    return true;
  } catch (err) {
    console.error(`${praefiks} uventet fejl for company ${companyId}:`, err);
    return false;
  }
}

/**
 * Tekstudgaven til køens text-felt: afsnit og linjeskift bevares, tags
 * fjernes, de fire entities fra indgangsMail.ts' esc() vendes tilbage.
 * Ikke en generel HTML-til-tekst — kun til det layout, indgangsMailHtml
 * producerer.
 */
export function htmlTilTekst(html: string): string {
  return html
    .replace(/<head>[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|td|tr|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();
}

// ── Datoer ───────────────────────────────────────────────────────────

const MAANEDER = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

/** «2. oktober 2026» — på UTC-komponenter, så datoen er den samme som Postgres' ::date. */
export function formatDanskDato(d: Date): string {
  return `${d.getUTCDate()}. ${MAANEDER[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Betalingsfristen som dato: UTC-kalenderdagen for UNDERSKRIFTEN plus
 * BETALINGSFRIST_DAGE. Fristen er kontraktens — 30 dage fra underskriften,
 * ikke fra betalingsmailen (rettet 2/9). Samme regnestykke som
 * hent_betalingstilbud (underskrevet_at::date + 30) og motoren, så mailen,
 * betalingssiden og rådgiverfladen siger samme dato. Kaldes med
 * company_betalingslink.underskrevet_at.
 */
export function betalingsfristDato(underskrevetAt: Date | string): Date {
  const underskrevet = new Date(underskrevetAt);
  return new Date(
    Date.UTC(underskrevet.getUTCFullYear(), underskrevet.getUTCMonth(), underskrevet.getUTCDate() + BETALINGSFRIST_DAGE),
  );
}

/** Fornavnet af «Lisbeth Hansen» — null når feltet er tomt, så tiltale() udelader navnet. */
export function fornavnAf(kontaktperson: string | null | undefined): string | null {
  const navn = (kontaktperson ?? "").trim();
  if (!navn) return null;
  return navn.split(/\s+/)[0];
}
