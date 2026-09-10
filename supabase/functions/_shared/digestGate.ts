/**
 * digestGate — hvem må sende månedsdigesten, hvornår, og til hvem.
 *
 * HVORFOR (10/9, mangellisten «monthly-digest har ingen dag-gate»): cronen
 * kører '0 8 22 * *', men funktionen tjekkede ikke datoen — kaldt en anden
 * dag sendte den til alle. Og admin-knappen «Send digest nu» sendte til ALLE
 * founders med aktivt medlemskab hver gang den blev trykket, uden nøgle: ét
 * fejlklik var en dubletmail til hele medlemsbasen. Dedup'en i email_send_log
 * dækkede kun «i dag».
 *
 * DOMMEN — ren, uden I/O, testet i src/lib/__tests__/digestGate.test.ts:
 *   cron  (service-role)  → sender kun på DIGEST_DAG (UTC, som cronens ur);
 *                           ellers «cron_ikke_digestdag» og intet sendes.
 *   admin (bruger-JWT)    → TEST er standarden: { test_email } sender ÉN
 *                           virksomheds digest til den adresse, mærket
 *                           is_test, uden månedsnøgle. Kun et eksplicit
 *                           { send_til_alle: true } sender rigtigt — og så
 *                           gælder månedsnøglen, så et dobbeltklik ikke
 *                           bliver to mails.
 *                           Ingen af delene → «admin_afvist» (400).
 * Nøglen: monthly-digest:<YYYY-MM>:<userId> — én mail pr. modtager pr. måned,
 * uanset hvem eller hvad der udløste den.
 */

/** Dagen cronen kører ('0 8 22 * *', migration 20260810230000). */
export const DIGEST_DAG = 22;

export type DigestKaldtAf = "cron" | "admin";

export interface DigestKald {
  kaldtAf: DigestKaldtAf;
  body: Record<string, unknown> | null | undefined;
  now: Date;
}

export type DigestDom =
  | { tilstand: "cron_send" }
  | { tilstand: "cron_ikke_digestdag"; dag: number }
  | { tilstand: "admin_test"; testEmail: string }
  | { tilstand: "admin_send_alle" }
  | { tilstand: "admin_afvist"; grund: string };

export function afgoerDigestKald(k: DigestKald): DigestDom {
  if (k.kaldtAf === "cron") {
    const dag = k.now.getUTCDate();
    return dag === DIGEST_DAG ? { tilstand: "cron_send" } : { tilstand: "cron_ikke_digestdag", dag };
  }
  const body = k.body ?? {};
  if (body.send_til_alle === true) return { tilstand: "admin_send_alle" };
  const testEmail = typeof body.test_email === "string" ? body.test_email.trim() : "";
  if (testEmail.includes("@")) return { tilstand: "admin_test", testEmail };
  return {
    tilstand: "admin_afvist",
    grund: "Angiv test_email (sender én digest til dig selv) eller send_til_alle: true (sender til alle founders, én gang pr. måned).",
  };
}

/** «2026-09» — måneden digesten hører til, i UTC som cronens ur. */
export function digestPeriode(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Idempotens-nøglen: én rigtig digest pr. modtager pr. måned. */
export function digestNoegle(periode: string, userId: string): string {
  return `monthly-digest:${periode}:${userId}`;
}

/** Første øjeblik i måneden (UTC) — dedup-vinduet i email_send_log. */
export function maanedensStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
