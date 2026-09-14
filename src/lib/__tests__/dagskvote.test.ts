/**
 * Dagskvoten (14/9 2026 aften, _shared/dagskvote.ts): en mail medlemmet
 * aldrig fik, må ikke bruge hans kvote. Målt i prod kl. 19:38: fem adresser
 * spærret resten af dagen efter tre modtagne mails, fordi to afvisninger
 * (status failed, før #857) talte med. Kvoten tæller nu det der NÅEDE FREM
 * (status sent) — ikke det der blev forsøgt.
 *
 * Fire låse: failed bruger ikke kvote; rate_limited heller ikke; fem SENDTE
 * spærrer stadig; og grænsen er uændret (5) for det der faktisk når frem.
 * Plus kildeværn på send-notification-email: DB-filteret bruger
 * KVOTE_STATUSSER, begge gates sammenligner mod MAX_EMAILS_PER_DAY, og
 * info-prioritet hentes aldrig (de 587 gamle rådgivernotifikationer).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  KVOTE_STATUSSER,
  MAX_EMAILS_PER_DAY,
  taelDagskvote,
  taellerMedIKvoten,
} from "../../../supabase/functions/_shared/dagskvote.ts";

const BSL = "bsl@larsen.dk";
const RNL = "rnl@larsen.dk";
const emailTilBruger = new Map([
  [BSL, "uid-bsl"],
  [RNL, "uid-rnl"],
]);
const raekke = (recipient_email: string, status: string) => ({ recipient_email, status });

describe("dagskvote — kun det der nåede frem tæller", () => {
  it("grænsen er uændret: fem om dagen, og kun status sent betyder fremme", () => {
    expect(MAX_EMAILS_PER_DAY).toBe(5);
    expect([...KVOTE_STATUSSER]).toEqual(["sent"]);
    expect(taellerMedIKvoten("sent")).toBe(true);
  });

  it("en failed-række bruger ikke kvote — målingen 14/9: 3 sendt + 2 failed er 3, ikke 5", () => {
    const rows = [
      raekke(BSL, "sent"), raekke(BSL, "sent"), raekke(BSL, "sent"),
      raekke(BSL, "failed"), raekke(BSL, "failed"),
    ];
    const antal = taelDagskvote(rows, emailTilBruger);
    expect(antal["uid-bsl"]).toBe(3);
    expect(antal["uid-bsl"] >= MAX_EMAILS_PER_DAY).toBe(false);
    expect(taellerMedIKvoten("failed")).toBe(false);
  });

  it("en rate_limited-række bruger heller ikke kvote (#857 holder stadig)", () => {
    const rows = [
      raekke(RNL, "sent"), raekke(RNL, "sent"), raekke(RNL, "sent"), raekke(RNL, "sent"),
      raekke(RNL, "rate_limited"), raekke(RNL, "rate_limited"), raekke(RNL, "rate_limited"),
    ];
    expect(taelDagskvote(rows, emailTilBruger)["uid-rnl"]).toBe(4);
    expect(taellerMedIKvoten("rate_limited")).toBe(false);
  });

  it("ingen af de øvrige kendte statusser tæller — de er alle mails medlemmet aldrig så", () => {
    // EmailLogView.ALL_STATUSES minus sent: pending og dlq (den gamle kø),
    // failed, rate_limited, suppressed (mailFejl.ts), bounced/complained
    // (handle-email-events, template 'system').
    for (const s of ["pending", "failed", "dlq", "rate_limited", "suppressed", "bounced", "complained"]) {
      expect(taellerMedIKvoten(s), s).toBe(false);
    }
    const rows = ["pending", "failed", "dlq", "rate_limited", "suppressed", "bounced", "complained"].map((s) => raekke(BSL, s));
    expect(taelDagskvote(rows, emailTilBruger)).toEqual({});
  });

  it("fem SENDTE spærrer stadig — og fire gør det ikke", () => {
    const fem = Array.from({ length: 5 }, () => raekke(BSL, "sent"));
    expect(taelDagskvote(fem, emailTilBruger)["uid-bsl"] >= MAX_EMAILS_PER_DAY).toBe(true);
    const fire = fem.slice(0, 4);
    expect(taelDagskvote(fire, emailTilBruger)["uid-bsl"] >= MAX_EMAILS_PER_DAY).toBe(false);
    // Fem sendte plus ti afvisninger er stadig præcis fem — afvisninger flytter ikke grænsen nogen vej.
    const femPlusStoej = [...fem, ...Array.from({ length: 10 }, () => raekke(BSL, "failed"))];
    expect(taelDagskvote(femPlusStoej, emailTilBruger)["uid-bsl"]).toBe(5);
  });

  it("tæller pr. modtager, og en adresse uden kendt bruger tælles ingen steder", () => {
    const rows = [raekke(BSL, "sent"), raekke(RNL, "sent"), raekke(RNL, "sent"), raekke("ukendt@x.dk", "sent")];
    expect(taelDagskvote(rows, emailTilBruger)).toEqual({ "uid-bsl": 1, "uid-rnl": 2 });
  });
});

// ── Kildeværn: køen bruger dommen, og de øvrige gates er urørte ──
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

describe("dagskvote.guard — send-notification-email", () => {
  const kode = udenKommentarer(laes("supabase/functions/send-notification-email/index.ts"));

  it("importerer dommen fra dagskvote.ts og har ingen lokal MAX_EMAILS_PER_DAY", () => {
    expect(kode).toContain('import { KVOTE_STATUSSER, MAX_EMAILS_PER_DAY, taelDagskvote } from "../_shared/dagskvote.ts";');
    expect(kode).not.toMatch(/const MAX_EMAILS_PER_DAY\s*=/);
  });

  it("DB-filteret tæller kun KVOTE_STATUSSER, og rækkerne går gennem taelDagskvote", () => {
    const opslag = kode.slice(kode.indexOf('const { data: dailyCounts }'), kode.indexOf("countMap = taelDagskvote("));
    expect(opslag).toContain('.select("recipient_email, status")');
    expect(opslag).toContain('.gte("created_at", todayIso)');
    expect(opslag).toContain('.like("template_name", "notification-%")');
    expect(opslag).toContain('.in("status", [...KVOTE_STATUSSER])');
    expect(opslag).not.toContain('.neq("status"');
    expect(kode).toContain("countMap = taelDagskvote(dailyCounts || [], emailToUser);");
  });

  it("begge gates sammenligner stadig mod MAX_EMAILS_PER_DAY — grænsen er uændret", () => {
    expect(kode.split("if (userDailyCount >= MAX_EMAILS_PER_DAY) {").length - 1).toBe(2);
  });

  it("info-prioritet når aldrig mailkøen — de 587 gamle rådgivernotifikationer (14/9) bliver liggende", () => {
    const hent = kode.slice(kode.indexOf('.from("notifications")'), kode.indexOf(".limit(50);"));
    expect(hent).toContain('.in("priority", ["action_required", "important"])');
    expect(hent).toContain('.is("email_sent_at", null)');
    expect(hent).toContain('.is("seen_at", null)');
    expect(hent).toContain('.neq("type", "report_reminder")');
  });

  it("de øvrige gates er urørte: for tidligt, advisor-skip, opt-out, ingen mail, rate limit-stop", () => {
    expect(kode).toContain(".lt(\"created_at\", fifteenMinAgo)");
    expect(kode).toContain("selectNotificationEmails(candidates)");
    expect(kode.split("if (advisorUserIds.has(").length - 1).toBe(2);
    expect(kode).toContain('(userPrefs as any).important === false');
    expect(kode).toContain("(userPrefs as any)[priorityKey] === false");
    expect(kode.split("if (!userEmail) {").length - 1).toBe(2);
    expect(kode.split("if (skalKoeStoppe(resultat)) {").length - 1).toBe(2);
    expect(kode).toContain("if (rateLimit) break;");
  });
});
