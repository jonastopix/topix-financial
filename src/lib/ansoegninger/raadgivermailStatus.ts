/**
 * raadgivermailStatus — kan I SE om mailen til kontakt@ om en ny ansøgning
 * kom af sted? (generalprøvens brist 7, 18/9-2026). Ren dom over rækker fra
 * email_send_log; ingen Supabase, ingen React. Testet i
 * __tests__/raadgivermailStatus.test.ts.
 *
 * MÅLT 18/9: registrerIndsendelse sender mailen via sendManagedEmail med
 * label «ansoegning-ny-raadgiver», idempotencyKey «ansoegning-ny-raadgiver-<id>»
 * og metadata { ansoegning_id } — og sendManagedEmail skriver ÉN række i
 * email_send_log pr. forsøg: status sent / failed / suppressed /
 * rate_limited, med error_message ved fejl. Fejler afsendelsen, logges det
 * og indsendelsen fortsætter (klokken er så den eneste besked). Lovables
 * hændelser (handle-email-events) skriver EGNE rækker med status bounced /
 * complained på modtageradressen — «sent» betyder «Lovable tog imod», ikke
 * «leveret». Rådgivere kan læse loggen (RLS SELECT, 20260907180000).
 *
 * Dommen: nyeste række for ansøgningen vinder; en bounce/klage på kontakt@
 * EFTER den sendte række gør «sendt» til «sendt, men bouncet».
 */

export interface MailLogRaekke {
  status: string;
  created_at: string;
  error_message: string | null;
  recipient_email: string;
  template_name: string;
  metadata: Record<string, unknown> | null;
}

export const RAADGIVERMAIL_LABEL = "ansoegning-ny-raadgiver";

export type RaadgivermailDom =
  | { tilstand: "sendt"; tidspunkt: string }
  | { tilstand: "sendt_men_bouncet"; tidspunkt: string; grund: string }
  | { tilstand: "fejlet"; tidspunkt: string; status: string; grund: string | null }
  | { tilstand: "ingen" };

function tid(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Rækkerne for netop denne ansøgning (label + metadata.ansoegning_id), nyeste først. */
export function raekkerForAnsoegning(raekker: readonly MailLogRaekke[], ansoegningId: string): MailLogRaekke[] {
  return raekker
    .filter((r) => r.template_name === RAADGIVERMAIL_LABEL && r.metadata?.ansoegning_id === ansoegningId)
    .sort((a, b) => tid(b.created_at) - tid(a.created_at));
}

export function afgoerRaadgivermail(
  raekker: readonly MailLogRaekke[],
  ansoegningId: string,
  /** Bounce-/klage-rækker på kontaktadressen (handle-email-events) — uanset ansøgning. */
  haendelser: readonly MailLogRaekke[],
): RaadgivermailDom {
  const egne = raekkerForAnsoegning(raekker, ansoegningId);
  if (egne.length === 0) return { tilstand: "ingen" };
  const nyeste = egne[0];
  if (nyeste.status !== "sent") {
    return { tilstand: "fejlet", tidspunkt: nyeste.created_at, status: nyeste.status, grund: nyeste.error_message };
  }
  const efter = haendelser
    .filter((h) => (h.status === "bounced" || h.status === "complained") && tid(h.created_at) >= tid(nyeste.created_at))
    .sort((a, b) => tid(a.created_at) - tid(b.created_at));
  if (efter.length > 0) {
    return { tilstand: "sendt_men_bouncet", tidspunkt: efter[0].created_at, grund: efter[0].error_message ?? efter[0].status };
  }
  return { tilstand: "sendt", tidspunkt: nyeste.created_at };
}

const STATUS_ORD: Record<string, string> = {
  failed: "fejlede",
  rate_limited: "afvist af mailloftet",
  suppressed: "modtageren er spærret",
};

/** «Mail til jer: sendt 18/9 kl. 14.02 — Lovable tog imod, ingen bounce.» */
export function raadgivermailTekst(d: RaadgivermailDom, formaterTid: (iso: string) => string): string {
  switch (d.tilstand) {
    case "sendt":
      return `Mail til jer (kontakt@): sendt ${formaterTid(d.tidspunkt)} — Lovable tog imod, ingen bounce set.`;
    case "sendt_men_bouncet":
      return `Mail til jer (kontakt@): sendt, men bouncede ${formaterTid(d.tidspunkt)} (${d.grund}). Tjek klokken — det er den eneste besked.`;
    case "fejlet":
      return `Mail til jer (kontakt@): IKKE sendt ${formaterTid(d.tidspunkt)} — ${STATUS_ORD[d.status] ?? d.status}${d.grund ? ` (${d.grund})` : ""}. Klokken er den eneste besked.`;
    case "ingen":
      return "Mail til jer (kontakt@): ingen række i mailloggen for denne ansøgning — sendt før 18/9, eller afsendelsen kastede før loggen.";
  }
}
