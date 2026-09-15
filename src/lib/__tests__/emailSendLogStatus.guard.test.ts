import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { logStatusFor } from "../../../supabase/functions/_shared/mailFejl.ts";

// Værn (15/9 2026): prod HAR CHECK-constrainten email_send_log_status_check
// (målt 15/9, query-results-export-2026-09-15_20-58-05.csv), og reglen kom
// fra en migration Lovable slettede 8/9 (68d86a46). Den nyeste migration i
// repoet der sætter constrainten, SKAL tillade hver status koden kan logge —
// ellers afviser prod rækken i tavshed (managedEmail.ts log() gør kun
// console.error, :106-110), som et 429 gjorde fra #857 (14/9) til
// 20260915210000. mailFejl.ts importeres (ren); managedEmail.ts og
// handle-email-events importerer npm: og læses derfor som kilde.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

/** Den nyeste migrationsfil (sorteret på tidsstemplet i navnet) der nævner constrainten. */
export function nyesteStatusMigration(): { fil: string; sql: string } {
  const mappe = resolve(ROD, "supabase/migrations");
  const med = readdirSync(mappe)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => readFileSync(join(mappe, f), "utf8").includes("email_send_log_status_check"));
  if (med.length === 0) throw new Error("ingen migration nævner email_send_log_status_check");
  const fil = med[med.length - 1];
  return { fil, sql: readFileSync(join(mappe, fil), "utf8") };
}

/** De tilladte værdier i migrationens SIDSTE «ADD CONSTRAINT email_send_log_status_check CHECK (status IN (…))». */
export function tilladteStatusser(sql: string): string[] {
  const re = /ADD CONSTRAINT email_send_log_status_check\s+CHECK\s*\(\s*status IN \(([^)]*)\)\s*\)/gi;
  let m: RegExpExecArray | null;
  let sidste: string | null = null;
  while ((m = re.exec(sql))) sidste = m[1];
  if (sidste === null) throw new Error("ingen ADD CONSTRAINT email_send_log_status_check … CHECK (status IN (…)) i migrationen");
  return sidste
    .split(",")
    .map((s) => s.trim().replace(/^'(.*)'$/, "$1"))
    .filter((s) => s !== "");
}

/** Hver status koden kan skrive i email_send_log.status, med kilde. */
export function loggedeStatusser(): Array<{ status: string; kilde: string }> {
  const ud: Array<{ status: string; kilde: string }> = [];
  // mailFejl.ts:71-75 — de tre domme managedEmail.ts:139 logger.
  for (const reason of ["recipient_suppressed", "rate_limited", "failed"] as const) {
    ud.push({ status: logStatusFor(reason), kilde: `mailFejl.ts logStatusFor("${reason}")` });
  }
  // managedEmail.ts:152 — succes.
  const managed = udenKommentarer(laes("supabase/functions/_shared/managedEmail.ts"));
  const sent = managed.match(/await log\("([a-z_]+)"\);/);
  if (!sent) throw new Error('managedEmail.ts: fandt ikke `await log("…")` for succes');
  ud.push({ status: sent[1], kilde: "managedEmail.ts await log(…)" });
  // handle-email-events/index.ts:49-55 — webhookens tre (template 'system').
  const hook = udenKommentarer(laes("supabase/functions/handle-email-events/index.ts"));
  const kald = [...hook.matchAll(/bogfoer\([^,]+,[^,]+,\s*'([a-z_]+)'/g)].map((m) => m[1]);
  if (kald.length === 0) throw new Error("handle-email-events: fandt ingen bogfoer(…, '<status>', …)-kald");
  for (const s of kald) ud.push({ status: s, kilde: "handle-email-events bogfoer(…)" });
  return ud;
}

/** Kaster med navnene på de statusser der mangler i reglen. */
export function kraevAlleTilladt(sql: string): void {
  const tilladt = new Set(tilladteStatusser(sql));
  const mangler = loggedeStatusser().filter((l) => !tilladt.has(l.status));
  if (mangler.length > 0) {
    throw new Error(`statusregel mangler: ${mangler.map((m) => `${m.status} (${m.kilde})`).join(", ")}`);
  }
}

describe("emailSendLogStatus.guard — den nyeste migration med email_send_log_status_check", () => {
  const { fil, sql } = nyesteStatusMigration();

  it("er 20260915210000 eller nyere, og tillader hver status koden logger", () => {
    expect(fil >= "20260915210000_email_send_log_rate_limited.sql").toBe(true);
    expect(() => kraevAlleTilladt(sql)).not.toThrow();
    const tilladt = tilladteStatusser(sql);
    for (const l of loggedeStatusser()) expect(tilladt, l.kilde).toContain(l.status);
  });

  it("beholder de syv værdier fra prod-målingen 15/9 og tilføjer kun rate_limited", () => {
    expect(tilladteStatusser(sql).sort()).toEqual(
      ["pending", "sent", "suppressed", "failed", "bounced", "complained", "dlq", "rate_limited"].sort(),
    );
  });

  it("dækker det koden faktisk skriver: sent, failed, rate_limited, suppressed, bounced, complained", () => {
    const statusser = new Set(loggedeStatusser().map((l) => l.status));
    expect([...statusser].sort()).toEqual(["bounced", "complained", "failed", "rate_limited", "sent", "suppressed"]);
  });

  it("VÆRNET VIRKER: en kopi af migrationsteksten uden 'rate_limited' fejler (filen er ikke rørt)", () => {
    const kopi = sql.replace(/,\s*'rate_limited'/, "");
    expect(kopi).not.toBe(sql);
    expect(tilladteStatusser(kopi)).not.toContain("rate_limited");
    expect(() => kraevAlleTilladt(kopi)).toThrow(/statusregel mangler: rate_limited \(mailFejl\.ts logStatusFor\("rate_limited"\)\)/);
    // og en tekst helt uden ADD CONSTRAINT fanges også
    expect(() => tilladteStatusser("ALTER TABLE x DROP CONSTRAINT y;")).toThrow(/ingen ADD CONSTRAINT/);
  });
});
