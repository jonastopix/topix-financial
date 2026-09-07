/**
 * mailLog — virksomhedens e-mail-log, de rene dele.
 *
 * BESLUTTET (Jonas 7/9): loggen pr. virksomhed bygges på MODTAGERENS
 * ADRESSE, ikke på metadata. Målt i prod 7/9: 1.664 rækker over 153 dage,
 * men kun otte bærer company_id i metadata (indgangens og fornyelsens
 * pending-rækker), og sent-rækken bærer det aldrig. Adresserne dækker hele
 * historikken uden at røre en eneste mail-skriver: medlemmernes
 * profiles.email plus company_invitations.email — invitationen går til en
 * adresse FØR personen er medlem.
 *
 * DEDUP er EmailLogViews greb, ordret (EmailLogView.tsx:153-166): én mail
 * har flere rækker med samme message_id (pending, så sent/failed/…); den
 * NYESTE række vinder, og rækker uden message_id står for sig selv. En
 * mail der fejlede har derfor sin failed-række som nyeste og VISES — den
 * filtreres ikke væk. EmailLogView har stadig sin inline-kopi (admin-
 * mappen er uden for denne PR); de to skal sige det samme.
 */

export type MailRaekke = {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  subject: string | null;
  status: string;
  error_message: string | null;
  is_test: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

/** Virksomhedens kendte adresser — medlemmer + invitationer, små bogstaver,
    uden dubletter og uden tomme. Rækkefølgen er stabil (medlemmer først). */
export function virksomhedensAdresser(
  medlemmer: ReadonlyArray<{ email: string | null }>,
  invitationer: ReadonlyArray<{ email: string | null }>,
): string[] {
  const set = new Set<string>();
  for (const m of [...medlemmer, ...invitationer]) {
    const e = m.email?.trim().toLowerCase();
    if (e) set.add(e);
  }
  return [...set];
}

/** Én række pr. mail — den nyeste pr. message_id; uden message_id står
    rækken for sig selv. Nyeste først. (EmailLogView.tsx:153-166, ordret.) */
export function nyesteRaekkePrMail<T extends Pick<MailRaekke, "message_id" | "created_at">>(raw: readonly T[]): T[] {
  const byMessageId = new Map<string, T>();
  const noMessageId: T[] = [];
  for (const row of raw) {
    if (!row.message_id) {
      noMessageId.push(row);
      continue;
    }
    const existing = byMessageId.get(row.message_id);
    if (!existing || new Date(row.created_at) > new Date(existing.created_at)) {
      byMessageId.set(row.message_id, row);
    }
  }
  return [...byMessageId.values(), ...noMessageId]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/** Samme ord som EmailLogView.tsx:61-70. */
export const MAIL_STATUS_LABELS: Record<string, string> = {
  sent: "Sendt",
  pending: "Afventer",
  failed: "Fejlet",
  dlq: "DLQ",
  rate_limited: "Rate-limited",
  suppressed: "Undertrykket",
  bounced: "Bounce",
  complained: "Klage",
};

/** Fejl-familien som EmailLogView tæller den (:106). */
export const MAIL_FEJL_FAMILIEN = ["failed", "dlq", "bounced", "complained"] as const;

export function erMailFejl(status: string): boolean {
  return (MAIL_FEJL_FAMILIEN as readonly string[]).includes(status);
}

export const MAILLOG_TOM = "Ingen mails til denne virksomhed endnu";
export const MAILLOG_FEJL = "Mail-loggen kunne ikke hentes. Prøv igen.";
