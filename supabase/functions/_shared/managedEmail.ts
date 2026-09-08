/**
 * Husets send-vej efter overgangen til Lovable-styret levering.
 *
 * FØR: hver afsender lagde en pending-række i email_send_log og kaldte
 * enqueue_email(); process-email-queue sendte og skrev sent/failed.
 * NU: mailen sendes med det samme gennem Lovable's mail-API, og den
 * SAMME logrække skrives her — status 'sent', 'suppressed' eller
 * 'failed'. Levering, genforsøg, hastighedsgrænser, afmelding og
 * bounce-spærring håndteres af platformen.
 *
 * HTML'en bygges stadig af afsenderne selv (databaseskabeloner,
 * indgangens og fornyelsens rene mailfunktioner). Kun transporten er
 * skiftet — teksten er urørt.
 */
import { EmailAPIError, sendLovableEmail } from "npm:@lovable.dev/email-js@0.1.0";

/** Det verificerede afsenderdomæne (delegeret til Lovable). */
export const SENDER_DOMAIN = "notify.theboardroom.dk";
/** Domænet modtageren ser i afsenderadressen. */
export const FROM_DOMAIN = "theboardroom.dk";
export const VERIFIED_FROM_EMAIL = `noreply@${FROM_DOMAIN}`;
export const SENDER_FROM = `The Boardroom <${VERIFIED_FROM_EMAIL}>`;

/** «Morten fra The Boardroom <noreply@…>» — navnet må vælges, adressen ikke. */
export function afsenderMedNavn(navn: string | null | undefined): string {
  const rent = (navn ?? "").trim().replace(/[<>]/g, "");
  return rent ? `${rent} <${VERIFIED_FROM_EMAIL}>` : SENDER_FROM;
}

export interface ManagedMailArgs {
  /** Service-role-klient — bruges kun til email_send_log. */
  adminClient: { from: (t: string) => any };
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Afsenderlinjen. Standard er «The Boardroom <noreply@…>». */
  from?: string;
  /** template_name i email_send_log og label hos Lovable. */
  label: string;
  /** Dedup på gentagne kald. Bliver også message_id i loggen. */
  idempotencyKey?: string;
  metadata?: Record<string, unknown> | null;
  isTest?: boolean;
  subjectForLog?: string;
}

export type ManagedMailResultat =
  | { sent: true; messageId: string }
  | { sent: false; reason: "recipient_suppressed" | "failed"; messageId: string; error?: string };

/**
 * Sender én mail og bogfører den i email_send_log. Kaster aldrig —
 * kalderen læser resultatet (samme kontrakt som den gamle kø-hjælper).
 */
export async function sendManagedEmail(args: ManagedMailArgs): Promise<ManagedMailResultat> {
  const {
    adminClient,
    subject,
    html,
    text,
    label,
    metadata = null,
    isTest = false,
    subjectForLog,
  } = args;

  const modtager = (args.to ?? "").trim().toLowerCase();
  const messageId = args.idempotencyKey || crypto.randomUUID();
  const praefiks = `[mail:${label}]`;

  if (!modtager) {
    console.error(`${praefiks} tom modtager — intet sendt`);
    return { sent: false, reason: "failed", messageId, error: "empty recipient" };
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.error(`${praefiks} LOVABLE_API_KEY mangler — intet sendt`);
    return { sent: false, reason: "failed", messageId, error: "LOVABLE_API_KEY missing" };
  }

  async function log(status: string, errorMessage?: string) {
    const rad: Record<string, unknown> = {
      message_id: messageId,
      template_name: label,
      recipient_email: modtager,
      status,
      is_test: isTest,
    };
    if (subjectForLog ?? subject) rad.subject = subjectForLog ?? subject;
    if (metadata) rad.metadata = metadata;
    if (errorMessage) rad.error_message = errorMessage.slice(0, 1000);
    const { error } = await adminClient.from("email_send_log").insert(rad);
    if (error) {
      console.error(`${praefiks} email_send_log (${status}) fejlede:`, {
        code: (error as { code?: string }).code,
        message: (error as { message?: string }).message,
      });
    }
  }

  try {
    await sendLovableEmail(
      {
        to: modtager,
        from: args.from || SENDER_FROM,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text: text || subject,
        purpose: "transactional",
        label,
        idempotency_key: messageId,
      },
      { apiKey, sendUrl: Deno.env.get("LOVABLE_SEND_URL") },
    );
  } catch (error) {
    if (error instanceof EmailAPIError && error.code === "recipient_suppressed") {
      await log("suppressed", "Modtageren er spærret (afmeldt, bounce eller klage)");
      console.warn(`${praefiks} modtageren er spærret — intet sendt`);
      return { sent: false, reason: "recipient_suppressed", messageId };
    }
    const besked = error instanceof Error ? error.message : String(error);
    await log("failed", besked);
    console.error(`${praefiks} afsendelse fejlede:`, besked);
    return { sent: false, reason: "failed", messageId, error: besked };
  }

  await log("sent");
  return { sent: true, messageId };
}
