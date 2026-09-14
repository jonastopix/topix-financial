/**
 * Dagskvoten — hvad der TÆLLER mod et medlems fem mails om dagen.
 *
 * HVORFOR DEN FINDES (14/9-2026, målt i prod kl. 19:38): køen havde ikke
 * sendt noget i 216 minutter, og cron-vagten svarede 200 hver gang — den
 * gatede, den fejlede ikke. Tælleren i send-notification-email talte rækker
 * i email_send_log UANSET status. I formiddags fik hvert medlem fire
 * eventmails; seks fik en femte der blev afvist på Lovables loft kl. 09:10 —
 * FØR #857 var udrullet (10:03), så de står som «failed», ikke
 * «rate_limited». Fem adresser var derfor spærret resten af dagen efter kun
 * TRE modtagne mails (målt: 5 rækker i alt, sendt 3, failed 2).
 *
 * #857 undtog én fejlstatus ad gangen («rate_limited»). Det holdt ikke: den
 * næste afvisning med en anden status æder kvoten igen. DOMMEN er vendt om:
 * vi tæller det der NÅEDE FREM, ikke det der blev forsøgt.
 *
 * STATUSSERNE i email_send_log (kolonnen er text uden CHECK,
 * 20260226224654:7). Skrevet af koden i dag:
 *   sent          — Lovables API tog imod mailen (managedEmail.ts:152).
 *   failed        — afvist, alt andet end 429/spærring (mailFejl.ts:74).
 *   rate_limited  — 429 hos udbyderen (mailFejl.ts:73).
 *   suppressed    — modtageren er spærret (mailFejl.ts:72), OG
 *                   handle-email-events' afmeldings-rækker (template 'system').
 *   bounced / complained — handle-email-events, template 'system'; rammer
 *                   aldrig `notification-%`-filteret.
 * Arv fra den gamle kø (enqueue_email/process-email-queue, væk i dag):
 *   pending, dlq  — kendt af EmailLogView (ALL_STATUSES), skrives ikke mere.
 *
 * Kun «sent» betyder fremme. Alt andet er en mail medlemmet aldrig så, og
 * den må ikke bruge hans kvote.
 *
 * REN: ingen IO, ingen npm-import — vitest læser den direkte
 * (src/lib/__tests__/dagskvote.test.ts). send-notification-email bruger
 * KVOTE_STATUSSER i DB-filteret og taelDagskvote på rækkerne, så dommen
 * står ét sted.
 */

/** Fem mails om dagen pr. medlem — uændret siden fase 2. */
export const MAX_EMAILS_PER_DAY = 5;

/** De statusser der betyder at mailen nåede frem. Kun «sent». */
export const KVOTE_STATUSSER = ["sent"] as const;

export function taellerMedIKvoten(status: string): boolean {
  return (KVOTE_STATUSSER as readonly string[]).includes(status);
}

export interface KvoteRaekke {
  recipient_email: string;
  status: string;
}

/**
 * Antal fremkomne mails i dag pr. bruger. Rækker med en status der ikke
 * betyder fremme, tælles ikke — uanset hvad DB-filteret leverede.
 */
export function taelDagskvote(
  raekker: readonly KvoteRaekke[],
  emailTilBruger: ReadonlyMap<string, string>,
): Record<string, number> {
  const antal: Record<string, number> = {};
  for (const r of raekker) {
    if (!taellerMedIKvoten(r.status)) continue;
    const uid = emailTilBruger.get(r.recipient_email);
    if (uid) antal[uid] = (antal[uid] || 0) + 1;
  }
  return antal;
}
