import { describe, it, expect } from "vitest";
// Cross-boundary import (samme mønster som canonicalTechSoftwareMerge.test.ts):
// vi tester den delte Deno-udvælgelseslogik direkte fra vitest, så CI
// (bun run test) dækker den.
import {
  selectNotificationEmails,
  parseDkReportPeriodKey,
  type EmailCandidate,
} from "../../../supabase/functions/_shared/notificationEmailSelection.ts";

/**
 * Reproduktion af fejlsporet 2026-07-22: natlige duplikerede
 * "Dine tal er klar til gennemsyn"-mails kl. 00:00 UTC — også for SLETTEDE
 * rapporter.
 *
 * Rodårsag (recon 2026-07-22):
 * - send-notification-email læste KUN notifications og joinede aldrig
 *   rapportens tilstand → soft-deletede/committede rapporters notifikationer
 *   blev mailet.
 * - dedup_key er per-reportId → to rapporter for samme company+periode
 *   gav to mails.
 * - Anti-spam-kvoten (MAX_EMAILS_PER_DAY, UTC-midnat-reset) udskød
 *   over-kvote-notifikationer UDEN at markere dem → flush ved første
 *   cron-kørsel efter UTC-midnat (00:00:0x = kl. 02 dansk).
 * - Commit disposer notifikationen (clearReportReviewNotification), men
 *   sletning gjorde ikke → forældreløse pending-notifikationer.
 *
 * Bemærk: "godkendt" = committed (financial_report_facts.source_report_id).
 * financial_reports.reviewed_at er advisorens læst-flag og undertrykker IKKE.
 */

// Fast "nu" i alle basistests: 2026-07-21 14:00 dansk (CEST) — inde i
// afsendelsesvinduet, så vindues-guarden ikke interfererer med de øvrige cases.
const NOW = new Date("2026-07-21T12:00:00.000Z");

let seq = 0;
function candidate(overrides: Partial<EmailCandidate> = {}): EmailCandidate {
  seq++;
  return {
    id: `notif-${seq}`,
    user_id: "user-1",
    type: "report_review_ready",
    company_id: "company-1",
    reference_id: `report-${seq}`,
    created_at: "2026-07-21T10:00:00.000Z",
    report: { deleted_at: null, committed: false, period_key: "2026-06" },
    ...overrides,
  };
}

describe("selectNotificationEmails — rapport-tilstandsfiltre", () => {
  it("soft-deleted rapport udelades fra mail og disposes", () => {
    const deleted = candidate({
      report: { deleted_at: "2026-07-21T14:00:00.000Z", committed: false, period_key: "2026-06" },
    });
    const alive = candidate({ report: { deleted_at: null, committed: false, period_key: "2026-05" } });

    const { toEmail, toDispose } = selectNotificationEmails([deleted, alive], { now: NOW });

    expect(toEmail.map((n) => n.id)).toEqual([alive.id]);
    expect(toDispose.map((n) => n.id)).toEqual([deleted.id]);
  });

  it("rapport slettet EFTER notifikationen blev oprettet giver ingen mail (dispose-stien)", () => {
    // Præcis fejlsporet: upload kl. 10 skriver notifikationen, sletning kl. 14
    // sætter deleted_at — den pending notifikation må aldrig flushe om natten.
    const orphaned = candidate({
      created_at: "2026-07-21T10:00:00.000Z",
      report: { deleted_at: "2026-07-21T14:00:00.000Z", committed: false, period_key: "2026-06" },
    });

    const { toEmail, toDispose } = selectNotificationEmails([orphaned], { now: NOW });

    expect(toEmail).toEqual([]);
    expect(toDispose.map((n) => n.id)).toEqual([orphaned.id]);
  });

  it("allerede-godkendt (committet) rapport udelades og disposes", () => {
    // Dækker bl.a. advisor-commit hvor frontend-suppress rammer 0 rækker pga.
    // RLS, og fejlede/fire-and-forget clearReportReviewNotification-kald.
    const committed = candidate({
      report: { deleted_at: null, committed: true, period_key: "2026-06" },
    });

    const { toEmail, toDispose } = selectNotificationEmails([committed], { now: NOW });

    expect(toEmail).toEqual([]);
    expect(toDispose.map((n) => n.id)).toEqual([committed.id]);
  });

  it("hard-deletet rapport (join giver null) udelades og disposes", () => {
    const gone = candidate({ report: null });

    const { toEmail, toDispose } = selectNotificationEmails([gone], { now: NOW });

    expect(toEmail).toEqual([]);
    expect(toDispose.map((n) => n.id)).toEqual([gone.id]);
  });
});

describe("selectNotificationEmails — dedup per company+periode", () => {
  it("to rapporter for samme company+periode giver ÉN mail (nyeste vinder), dubletten disposes", () => {
    const older = candidate({ created_at: "2026-07-21T10:00:00.000Z" });
    const newer = candidate({ created_at: "2026-07-21T11:00:00.000Z" });

    const { toEmail, toDispose } = selectNotificationEmails([older, newer], { now: NOW });

    expect(toEmail.map((n) => n.id)).toEqual([newer.id]);
    expect(toDispose.map((n) => n.id)).toEqual([older.id]);
  });

  it("rækkefølgen i input ændrer ikke vinderen (nyeste vinder også når den kommer først)", () => {
    const newer = candidate({ created_at: "2026-07-21T11:00:00.000Z" });
    const older = candidate({ created_at: "2026-07-21T10:00:00.000Z" });

    const { toEmail, toDispose } = selectNotificationEmails([newer, older], { now: NOW });

    expect(toEmail.map((n) => n.id)).toEqual([newer.id]);
    expect(toDispose.map((n) => n.id)).toEqual([older.id]);
  });

  it("samme periode for FORSKELLIGE companies dedupliseres ikke", () => {
    const a = candidate({ company_id: "company-1" });
    const b = candidate({ company_id: "company-2" });

    const { toEmail, toDispose } = selectNotificationEmails([a, b], { now: NOW });

    expect(toEmail.map((n) => n.id).sort()).toEqual([a.id, b.id].sort());
    expect(toDispose).toEqual([]);
  });

  it("rapporter uden periode-nøgle dedupliseres ikke mod hinanden", () => {
    // period_key null = ukendt periode; hellere to mails end at sluge en reel.
    const a = candidate({ report: { deleted_at: null, committed: false, period_key: null } });
    const b = candidate({ report: { deleted_at: null, committed: false, period_key: null } });

    const { toEmail, toDispose } = selectNotificationEmails([a, b], { now: NOW });

    expect(toEmail.map((n) => n.id).sort()).toEqual([a.id, b.id].sort());
    expect(toDispose).toEqual([]);
  });
});

describe("selectNotificationEmails — afsendelsesvindue for udskudte", () => {
  // Kvote-udskudt notifikation fra i går — præcis den klasse der i dag
  // flusher kl. 00:00 UTC (02:00 dansk) ved kvote-nulstilling.
  const yesterdayCandidate = () => candidate({ created_at: "2026-07-20T10:00:00.000Z" });

  it("udskudt kandidat sendes IKKE kl. 00:05 dansk nat — den venter (hverken mail eller dispose)", () => {
    const c = yesterdayCandidate();
    // 2026-07-21T22:05Z = 22/7 00:05 dansk (CEST)
    const { toEmail, toDispose } = selectNotificationEmails([c], { now: new Date("2026-07-21T22:05:00.000Z") });

    expect(toEmail).toEqual([]);
    expect(toDispose).toEqual([]);
  });

  it("udskudt kandidat sendes kl. 07:30 dansk morgen", () => {
    const c = yesterdayCandidate();
    // 2026-07-22T05:30Z = 07:30 dansk (CEST)
    const { toEmail } = selectNotificationEmails([c], { now: new Date("2026-07-22T05:30:00.000Z") });

    expect(toEmail.map((n) => n.id)).toEqual([c.id]);
  });

  it("frisk notifikation sendes straks, også om natten", () => {
    // Upload kl. 23:00 dansk → mail 23:30 dansk er fin (normal 15-min-cron-sti).
    const fresh = candidate({ created_at: "2026-07-21T21:00:00.000Z" });
    const { toEmail } = selectNotificationEmails([fresh], { now: new Date("2026-07-21T21:30:00.000Z") });

    expect(toEmail.map((n) => n.id)).toEqual([fresh.id]);
  });
});

describe("selectNotificationEmails — ikke-rapport-notifikationer røres ikke", () => {
  it("andre typer passerer uændret igennem (ingen join, ingen dedup)", () => {
    const milestone = candidate({ type: "milestone_completed", report: undefined, reference_id: null });
    const weekly = candidate({ type: "weekly_focus_ready", report: undefined, reference_id: null });

    const { toEmail, toDispose } = selectNotificationEmails([milestone, weekly], { now: NOW });

    expect(toEmail.map((n) => n.id)).toEqual([milestone.id, weekly.id]);
    expect(toDispose).toEqual([]);
  });
});

describe("parseDkReportPeriodKey — TS-spejl af parse_dk_report_period_key", () => {
  it("parser 'Juni 2026' → '2026-06' (case-insensitivt, trim)", () => {
    expect(parseDkReportPeriodKey("Juni 2026")).toBe("2026-06");
    expect(parseDkReportPeriodKey("  oktober 2025 ")).toBe("2025-10");
    expect(parseDkReportPeriodKey("DECEMBER 2026")).toBe("2026-12");
  });

  it("returnerer null for ukendt måned, manglende år eller null", () => {
    expect(parseDkReportPeriodKey("Q2 2026")).toBeNull();
    expect(parseDkReportPeriodKey("Juni")).toBeNull();
    expect(parseDkReportPeriodKey("Årsrapport 2025")).toBeNull();
    expect(parseDkReportPeriodKey(null)).toBeNull();
  });
});
