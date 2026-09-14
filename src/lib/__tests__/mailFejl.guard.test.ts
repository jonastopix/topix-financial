import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (14/9 2026): 429 er en kendt tilstand hele vejen — managedEmail.ts
// dømmer gennem mailFejl.ts og skriver status rate_limited; køen
// (send-notification-email) holder pause ved første rate limit i BEGGE
// løkker; dagskvoten tæller kun det der nåede frem (dagskvote.ts, 14/9
// aften — før: alt undtagen rate_limited); de fire kaldere der før kastede
// på reason === 'failed' kaster stadig på rate_limited.
// Kildelæsning frem for import: filerne importerer npm:-moduler.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

describe("mailFejl.guard — managedEmail.ts", () => {
  const kode = udenKommentarer(laes("supabase/functions/_shared/managedEmail.ts"));

  it("dømmer gennem mailFejl.ts med status, code og retryAfterSeconds fra EmailAPIError", () => {
    expect(kode).toContain('import { klassificerMailFejl, logStatusFor, logTekstFor } from "./mailFejl.ts";');
    expect(kode).toContain("const api = error instanceof EmailAPIError ? error : null;");
    expect(kode).toContain("status: api?.status ?? null,");
    expect(kode).toContain("code: api?.code ?? null,");
    expect(kode).toContain("retryAfterSeconds: api?.retryAfterSeconds ?? null,");
    expect(kode).toContain("await log(logStatusFor(dom.reason), logTekstFor(dom, besked));");
  });

  it("returnerer rate_limited med retryAfterSeconds, og en ubetinget failed-log findes ikke længere", () => {
    expect(kode).toContain('return { sent: false, reason: "rate_limited", messageId, retryAfterSeconds: dom.retryAfterSeconds, error: besked };');
    expect(kode).toContain('| { sent: false; reason: "rate_limited"; messageId: string; retryAfterSeconds: number | null; error: string }');
    expect(kode).not.toContain('await log("failed", besked);');
    expect(kode).not.toContain('error.code === "recipient_suppressed"');
  });
});

describe("mailFejl.guard — send-notification-email holder pause og tæller rigtigt", () => {
  const kode = udenKommentarer(laes("supabase/functions/send-notification-email/index.ts"));

  it("dagskvoten tæller det der nåede frem (KVOTE_STATUSSER) — ikke én fejlstatus undtaget ad gangen (14/9 aften, dagskvote.ts)", () => {
    const opslag = kode.slice(kode.indexOf('const { data: dailyCounts }'), kode.indexOf("countMap = taelDagskvote("));
    expect(opslag).toContain('.like("template_name", "notification-%")');
    expect(opslag).toContain('.in("status", [...KVOTE_STATUSSER])');
    expect(opslag).not.toContain('.neq("status"');
    expect(opslag).not.toContain('.eq("status"');
  });

  it("begge løkker stopper ved første rate limit (skalKoeStoppe → break), og nonChat-løkken starter ikke efter et stop i chat-løkken", () => {
    expect(kode).toContain('import { skalKoeStoppe } from "../_shared/mailFejl.ts";');
    expect(kode.split("if (skalKoeStoppe(resultat)) {").length - 1).toBe(2);
    const chat = kode.slice(kode.indexOf("for (const [userId, chatNotifs] of chatNotifsByUser.entries())"), kode.indexOf("for (let i = 0; i < toEmail.length; i++)"));
    const nonChat = kode.slice(kode.indexOf("for (let i = 0; i < toEmail.length; i++)"), kode.indexOf("const summary = {"));
    for (const loekke of [chat, nonChat]) {
      const stop = loekke.indexOf("if (skalKoeStoppe(resultat)) {");
      expect(stop).toBeGreaterThan(-1);
      // Blokken er kort: objektet, én console.error og break — inden for 900 tegn.
      expect(loekke.slice(stop, stop + 900)).toContain("break;");
    }
    expect(nonChat).toContain("if (rateLimit) break;");
    expect(kode).toContain("rate_limited: rateLimit !== null,");
    expect(kode).toContain("rate_limit_tilbage: rateLimit?.tilbage ?? 0,");
  });
});

describe("mailFejl.guard — kalderne der kaster, kaster stadig ved rate limit", () => {
  const filer = [
    "supabase/functions/send-invitation-email/index.ts",
    "supabase/functions/manage-advisor/index.ts",
    "supabase/functions/send-report-reminder/index.ts",
    "supabase/functions/send-template-email/index.ts",
  ];
  it("ingen af de fire tester reason === 'failed' alene — de tester !== 'recipient_suppressed'", () => {
    for (const f of filer) {
      const kode = udenKommentarer(laes(f));
      expect(kode, f).not.toMatch(/resultat\.reason === ['"]failed['"]/);
      expect(kode, f).toMatch(/!resultat\.sent && resultat\.reason !== ['"]recipient_suppressed['"]/);
    }
  });
});

describe("mailFejl.guard — loggens status er kendt af fladen uden migration", () => {
  it("EmailLogView kender rate_limited som status og filter; email_send_log.status har ingen CHECK", () => {
    const view = laes("src/components/hjemmebane/admin/views/EmailLogView.tsx");
    expect(view).toContain('rate_limited: "Rate-limited"');
    expect(view).toMatch(/ALL_STATUSES = \[[^\]]*"rate_limited"/);
    const ddl = laes("supabase/migrations/20260226224654_edb36b5c-a1c4-42c6-a911-5b30164ebb00.sql");
    expect(ddl).toContain("status text NOT NULL DEFAULT 'sent',");
    expect(ddl).not.toMatch(/status[^,\n]*CHECK/);
  });
});
