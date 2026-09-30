/**
 * webinarMailBudget — må webinar-mail-cron STARTE et forsøg mere? (30/9-2026)
 *
 * HVORFOR DEN FINDES (analyse-drift fund 4, før 7-dagsholdet 6/10 kl. 08:00,
 * ~217 mails): det gamle budget (BUDGET_MS = 45_000) blev tjekket FØR et
 * forsøg, men forsøget selv kunne tage ics-hentning (8 s) + Mailgun (10 s) +
 * sporskrivningen. Værste sidste forsøg: 45 + 8 + 10 = 63 s + insert — mod
 * cron-jobbets timeout på 60 s. Når pg_net giver op, afbrydes edge-functionen
 * (OVERLEVERING DEL 4, målt 3/9). Sker det efter Mailguns 200, men før rækken
 * i webinar_mails er skrevet, findes der INGEN ok-række; det unikke indeks kan
 * ikke fange noget, og næste slot sender samme mail igen (Mailgun har ingen
 * idempotensnøgle). Det er dubletten.
 *
 * DOMMEN: et nyt forsøg startes kun, hvis der er tid til dets VÆRSTE forløb,
 * før jobbets timeout — med en margin for det, der ligger uden for functionens
 * ur (opstarten før `startMs`, netværket til og fra pg_net).
 *
 * REGNESTYKKET (alle tal i ms; kilderne står ved hver konstant):
 *
 *   JOB_TIMEOUT_MS        = 60 000   kald_edge('webinar-mail-cron', …, 60000, 300000)
 *                                    i 20260922172000_webinar_mail_cron.sql (repoets form;
 *                                    prod-kommandoen er ikke målt herfra)
 *   OPSTART_MARGIN_MS     =  5 000   uden for functionens ur: boot før startMs + netværk
 *   INVITATION_TIMEOUT_MS =  8 000   mimeInvitation.ts (abort dækker også svar.text())
 *   TIMEOUT_MS (Mailgun)  = 10 000   mailgunAfsendelse.ts (abort dækker også svarets krop)
 *   SPOR_RESERVE_MS       =  5 000   token + MIME-bygning + insert i webinar_mails
 *                                    (insertet har ingen timeout; typisk < 0,5 s)
 *
 *   resttid, MED invitation  = 8 000 + 10 000 + 5 000 = 23 000
 *   resttid, UDEN invitation =     0 + 10 000 + 5 000 = 15 000
 *
 *   et forsøg må starte, når  forløbet + resttid ≤ 60 000 − 5 000 = 55 000
 *     → seneste start MED invitation  = 55 000 − 23 000 = 32 000
 *     → seneste start UDEN invitation = 55 000 − 15 000 = 40 000
 *
 *   værste slut = seneste start + resttid = 55 000 ≤ 60 000 − 5 000.  ✔
 *   (Før: 45 000 + 8 000 + 10 000 = 63 000 + insert > 60 000.  ✘)
 *
 * STOPPET ER ENDELIGT i kørslen: når dommen først har sagt nej, startes intet
 * mere — heller ikke en mail uden invitation, der teknisk ville kunne nå det.
 * Ellers ville en bekræftelse (sorteret først) vente, mens påmindelser bag
 * den blev sendt. Resten tælles som «udsat» og tages af næste slot.
 *
 * REN og uden Deno: importerer kun de to timeout-konstanter (begge filer er
 * importfri) og prøves direkte af vitest (webinarMailBudget.test.ts).
 */

import { TIMEOUT_MS } from "./mailgunAfsendelse.ts";
import { INVITATION_TIMEOUT_MS } from "./mimeInvitation.ts";

/** Cron-jobbets timeout: kald_edge-argumentet i 20260922172000_webinar_mail_cron.sql. Ændres jobbet, ændres dette tal i SAMME PR. */
export const JOB_TIMEOUT_MS = 60_000;

/** Tid uden for functionens ur: boot før startMs, netværket til og fra pg_net. */
export const OPSTART_MARGIN_MS = 5_000;

/** Token, MIME-bygning og insertet i webinar_mails efter Mailguns svar. */
export const SPOR_RESERVE_MS = 5_000;

/** Værste forløb for ét forsøg: (ics-hentning) + Mailgun + spor. */
export function resttidKraevetMs(medInvitation: boolean): number {
  return (medInvitation ? INVITATION_TIMEOUT_MS : 0) + TIMEOUT_MS + SPOR_RESERVE_MS;
}

/** Det seneste forløb (ms siden startMs), hvor et forsøg må starte. */
export function senesteStartMs(medInvitation: boolean): number {
  return JOB_TIMEOUT_MS - OPSTART_MARGIN_MS - resttidKraevetMs(medInvitation);
}

/**
 * Må et forsøg starte nu? `forloebetMs` = Date.now() − startMs. Fail-closed:
 * et ulæseligt eller negativt forløb giver nej.
 */
export function budgetTillader(a: { forloebetMs: number; medInvitation: boolean }): boolean {
  if (!Number.isFinite(a.forloebetMs) || a.forloebetMs < 0) return false;
  return a.forloebetMs + resttidKraevetMs(a.medInvitation) <= JOB_TIMEOUT_MS - OPSTART_MARGIN_MS;
}

/** Beviset i svaret: tallene, dommen regnede med — kun den nye kode kan svare med dem. */
export interface BudgetBevis {
  job_timeout_ms: number;
  opstart_margin_ms: number;
  resttid_kraevet_ms: { med_invitation: number; uden_invitation: number };
  seneste_start_ms: { med_invitation: number; uden_invitation: number };
  stoppet_af_budget: boolean;
  /** Forløbet (ms siden startMs), da dommen første gang sagde nej — ellers null. */
  forloebet_ved_stop_ms: number | null;
}

export function tomtBudgetBevis(): BudgetBevis {
  return {
    job_timeout_ms: JOB_TIMEOUT_MS,
    opstart_margin_ms: OPSTART_MARGIN_MS,
    resttid_kraevet_ms: { med_invitation: resttidKraevetMs(true), uden_invitation: resttidKraevetMs(false) },
    seneste_start_ms: { med_invitation: senesteStartMs(true), uden_invitation: senesteStartMs(false) },
    stoppet_af_budget: false,
    forloebet_ved_stop_ms: null,
  };
}
