/**
 * Mailfejlens dom — hvad en afvisning fra Lovables mail-API BETYDER.
 *
 * HVORFOR DEN FINDES (14/9-2026, recon-event-fanout.md §6): fire events på
 * 20 minutter gav 109 mails, Lovables loft er 100 app-mails i timen pr.
 * workspace, og fra 09:10 svarede API'et 429. Pakken (@lovable.dev/email-js)
 * kaster en EmailAPIError med .status, .code, .retryAfterSeconds og
 * .retryable (429 eller 5xx) — men managedEmail.ts læste ingen af dem: en
 * 429 blev én «failed»-række og { sent: false, reason: "failed" }, ligesom
 * en tom modtager. Køen (send-notification-email) prøvede så de næste 49
 * rækker mod samme loft, hver med sin failed-linje, og hver linje talte med
 * i medlemmets dagskvote (MAX_EMAILS_PER_DAY = 5).
 *
 * DOMMEN, i rækkefølge:
 *   1. code === "recipient_suppressed" → "recipient_suppressed" (uændret:
 *      modtageren er spærret — afmeldt, bounce eller klage).
 *   2. status === 429 → "rate_limited", med retryAfterSeconds (kan være
 *      null når API'et ikke sender Retry-After).
 *   3. alt andet → "failed", med retryable = 5xx (samme regel som pakkens
 *      egen `retryable`-getter, uden 429 som allerede er taget).
 *
 * LOGGEN: "rate_limited" er en kendt værdi i EmailLogView (STATUS_LABELS
 * og ALL_STATUSES). RETTET 15/9: dette hoved sagde «text uden CHECK
 * (20260226224654:7), ingen migration» — men prod HAR CHECK-constrainten
 * email_send_log_status_check (målt 15/9; arv fra den slettede
 * 20260319090407_email_infra.sql), og den kendte ikke rate_limited, så
 * managedEmail.ts' log() blev afvist i tavshed fra 14/9 til migrationen
 * 20260915210000, som tilføjer værdien. Værn:
 * src/lib/__tests__/emailSendLogStatus.guard.test.ts.
 *
 * KØEN: skalKoeStoppe siger om en kørsel skal holde pause ved dette svar —
 * KUN ved rate limit. En spærret modtager eller en enkelt fejl stopper
 * intet; de næste modtagere er ikke ramt af det.
 *
 * REN: ingen IO, ingen npm-import — så vitest kan læse den direkte
 * (src/lib/__tests__/mailFejl.test.ts). managedEmail.ts, som importerer
 * pakken, kalder hertil med fejlens felter.
 */

export const RATE_LIMIT_STATUS = 429;

/** Det managedEmail.ts læser af en EmailAPIError (alle felter kan mangle på en ikke-API-fejl). */
export interface MailFejlInput {
  status?: number | null;
  code?: string | null;
  retryAfterSeconds?: number | null;
  message: string;
}

export type MailFejlDom =
  | { reason: "recipient_suppressed"; retryable: false; retryAfterSeconds: null }
  | { reason: "rate_limited"; retryable: true; retryAfterSeconds: number | null }
  | { reason: "failed"; retryable: boolean; retryAfterSeconds: null };

/** 5xx er retryable — pakkens regel, uden 429 (som er sin egen dom). */
export function erRetryableStatus(status: number | null | undefined): boolean {
  return typeof status === "number" && status >= 500 && status < 600;
}

export function klassificerMailFejl(fejl: MailFejlInput): MailFejlDom {
  if (fejl.code === "recipient_suppressed") {
    return { reason: "recipient_suppressed", retryable: false, retryAfterSeconds: null };
  }
  if (fejl.status === RATE_LIMIT_STATUS) {
    const sek = fejl.retryAfterSeconds;
    return {
      reason: "rate_limited",
      retryable: true,
      retryAfterSeconds: typeof sek === "number" && Number.isFinite(sek) && sek >= 0 ? sek : null,
    };
  }
  return { reason: "failed", retryable: erRetryableStatus(fejl.status), retryAfterSeconds: null };
}

/** email_send_log.status for en dom — tre kendte værdier, alle i EmailLogView. */
export function logStatusFor(reason: MailFejlDom["reason"]): "suppressed" | "rate_limited" | "failed" {
  if (reason === "recipient_suppressed") return "suppressed";
  if (reason === "rate_limited") return "rate_limited";
  return "failed";
}

/** Fejlteksten til email_send_log.error_message — bærer Retry-After, når den findes. */
export function logTekstFor(dom: MailFejlDom, besked: string): string {
  if (dom.reason === "recipient_suppressed") return "Modtageren er spærret (afmeldt, bounce eller klage)";
  if (dom.reason === "rate_limited") {
    const efter = dom.retryAfterSeconds === null ? "ukendt" : `${dom.retryAfterSeconds} s`;
    return `Rate limit hos udbyderen (429, Retry-After ${efter}): ${besked}`;
  }
  return besked;
}

/**
 * Skal en kørsel der sender til mange holde pause ved dette svar?
 * Kun ved rate limit: de næste modtagere ville få samme svar, og hver
 * afvisning koster en logrække og (før 14/9) en kvoteplads.
 */
export function skalKoeStoppe(resultat: { sent: boolean; reason?: string }): boolean {
  return !resultat.sent && resultat.reason === "rate_limited";
}
