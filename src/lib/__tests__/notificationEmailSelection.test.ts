import { describe, it, expect } from "vitest";
// Cross-boundary import (samme mønster som canonicalTechSoftwareMerge.test.ts):
// vi tester den delte Deno-udvælgelseslogik direkte fra vitest, så CI
// (bun run test) dækker den.
import {
  selectNotificationEmails,
  parseDkReportPeriodKey,
  emailDelayMinutes,
  DEFAULT_EMAIL_DELAY_MINUTES,
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

// Fast "nu" i alle basistests: 2026-07-21 18:00 dansk (CEST) — inde i
// afsendelsesvinduet, så vindues-guarden ikke interfererer med de øvrige cases.
// Basis-kandidaterne (created_at 10:00Z) er dermed 6 timer gamle og forbi den
// type-specifikke ventetid (240 min for report_review_ready) — ventetids-
// adfærden testes isoleret i sin egen describe-blok nedenfor.
const NOW = new Date("2026-07-21T16:00:00.000Z");

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

  it("frisk default-type notifikation sendes straks, også om natten", () => {
    // Advisor svarer kl. 23:00 dansk → mail 23:30 dansk er fin (normal
    // 15-min-cron-sti). Gælder KUN default-typer: handlingsudløste typer
    // (report_review_ready m.fl.) bærer nu altid vinduet, se ventetids-blokken.
    const fresh = candidate({ type: "chat_reply", report: undefined, created_at: "2026-07-21T21:00:00.000Z" });
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

describe("selectNotificationEmails — ventetid pr. type (handlingsudløste mails)", () => {
  // NOW er 18:00 dansk (CEST) — inde i afsendelsesvinduet.

  it("report_review_ready 30 min gammel, i vinduet → venter (hverken mail eller dispose)", () => {
    const young = candidate({ created_at: "2026-07-21T15:30:00.000Z" });

    const { toEmail, toDispose } = selectNotificationEmails([young], { now: NOW });

    expect(toEmail).toEqual([]);
    expect(toDispose).toEqual([]);
  });

  it("report_review_ready 5 timer gammel, i vinduet → toEmail", () => {
    const ripe = candidate({ created_at: "2026-07-21T11:00:00.000Z" });

    const { toEmail, toDispose } = selectNotificationEmails([ripe], { now: NOW });

    expect(toEmail.map((n) => n.id)).toEqual([ripe.id]);
    expect(toDispose).toEqual([]);
  });

  it("report_review_ready 5 timer gammel, kl. 22 dansk → venter (hasCustomDelay alene udløser vinduet)", () => {
    // Alderen (5t) er UNDER DEFER_THRESHOLD (6t), så det gamle deferred-kriterium
    // er falsk — kun hasCustomDelay kan binde kandidaten til vinduet.
    // 2026-07-21T20:00Z = 22:00 dansk (CEST); oprettet 15:00Z = 5 timer før.
    const ripe = candidate({ created_at: "2026-07-21T15:00:00.000Z" });

    const { toEmail, toDispose } = selectNotificationEmails([ripe], { now: new Date("2026-07-21T20:00:00.000Z") });

    expect(toEmail).toEqual([]);
    expect(toDispose).toEqual([]);
  });

  it("chat_reply 30 min gammel → toEmail (default 15 min uændret)", () => {
    const reply = candidate({ type: "chat_reply", report: undefined, created_at: "2026-07-21T15:30:00.000Z" });

    const { toEmail } = selectNotificationEmails([reply], { now: NOW });

    expect(toEmail.map((n) => n.id)).toEqual([reply.id]);
  });

  it("chat_reply 5 min gammel → venter", () => {
    const fresh = candidate({ type: "chat_reply", report: undefined, created_at: "2026-07-21T15:55:00.000Z" });

    const { toEmail, toDispose } = selectNotificationEmails([fresh], { now: NOW });

    expect(toEmail).toEqual([]);
    expect(toDispose).toEqual([]);
  });

  it("emailDelayMinutes falder tilbage til default for ukendte typer", () => {
    expect(emailDelayMinutes("ukendt_type")).toBe(15);
    expect(DEFAULT_EMAIL_DELAY_MINUTES).toBe(15);
  });

  it("report_review_ready 30 min gammel MEN committet → toDispose, ikke vent (dispose i trin 1 slår ventetiden i trin 3)", () => {
    // Den dominerende sti efter 240-min ventetiden: medlemmet uploader og
    // godkender kort efter. Kandidaten er UNG (30 min), så uden dispose i
    // trin 1 ville den blot vente — og aldrig blive markeret håndteret.
    const committedYoung = candidate({
      created_at: "2026-07-21T15:30:00.000Z",
      report: { deleted_at: null, committed: true, period_key: "2026-06" },
    });

    const { toEmail, toDispose } = selectNotificationEmails([committedYoung], { now: NOW });

    expect(toEmail).toEqual([]);
    expect(toDispose.map((n) => n.id)).toEqual([committedYoung.id]);
  });

  it("report_review_ready 30 min gammel MEN rapporten er slettet → toDispose, ikke vent", () => {
    const deletedYoung = candidate({
      created_at: "2026-07-21T15:30:00.000Z",
      report: { deleted_at: "2026-07-21T15:35:00.000Z", committed: false, period_key: "2026-06" },
    });

    const { toEmail, toDispose } = selectNotificationEmails([deletedYoung], { now: NOW });

    expect(toEmail).toEqual([]);
    expect(toDispose.map((n) => n.id)).toEqual([deletedYoung.id]);
  });
});

describe("venter-tællerne (10/9) — det der hverken sendes eller disposes, tælles", () => {
  // 10/9 kostede {processed: 1, sent: 0, skipped: 0} en times fejlsøgning:
  // rækken ventede med vilje, men stod i ingen mængde. Nu står den i én.

  it("for ung for sin types ventetid → venterPaaTid (alert_financial_summary, 2 timer af 240 min)", () => {
    const ung = candidate({ type: "alert_financial_summary", report: undefined, created_at: "2026-07-21T14:00:00.000Z" });
    const r = selectNotificationEmails([ung], { now: NOW });
    expect(r.venterPaaTid.map((n) => n.id)).toEqual([ung.id]);
    expect(r.venterPaaVindue).toEqual([]);
    expect(r.toEmail).toEqual([]);
    expect(r.toDispose).toEqual([]);
  });

  it("gammel nok, men kl. 22 dansk → venterPaaVindue", () => {
    const moden = candidate({ created_at: "2026-07-21T15:00:00.000Z" }); // 5 t gammel ved 20:00Z = 22 dansk
    const r = selectNotificationEmails([moden], { now: new Date("2026-07-21T20:00:00.000Z") });
    expect(r.venterPaaVindue.map((n) => n.id)).toEqual([moden.id]);
    expect(r.venterPaaTid).toEqual([]);
    expect(r.toEmail).toEqual([]);
  });

  it("for ung OG uden for vinduet → kun venterPaaTid (tiden dømmes først)", () => {
    const ung = candidate({ created_at: "2026-07-21T19:30:00.000Z" }); // 30 min ved 20:00Z
    const r = selectNotificationEmails([ung], { now: new Date("2026-07-21T20:00:00.000Z") });
    expect(r.venterPaaTid.map((n) => n.id)).toEqual([ung.id]);
    expect(r.venterPaaVindue).toEqual([]);
  });

  it("regnestykket går op: toEmail + toDispose + venterPaaTid + venterPaaVindue = alle kandidater", () => {
    const alle = [
      candidate(),                                                                            // moden, i vinduet → mail
      candidate({ created_at: "2026-07-21T15:30:00.000Z" }),                                  // 30 min → venter på tid
      candidate({ report: { deleted_at: "2026-07-21T14:00:00.000Z", committed: false, period_key: "2026-05" } }), // slettet → dispose
      candidate({ type: "chat_reply", report: undefined, created_at: "2026-07-21T15:30:00.000Z" }), // default 15 min → mail
      candidate({ company_id: "company-9", report: { deleted_at: null, committed: false, period_key: "2026-06" } }),
      candidate({ company_id: "company-9", created_at: "2026-07-21T10:30:00.000Z", report: { deleted_at: null, committed: false, period_key: "2026-06" } }), // dublet: nyeste vinder
    ];
    const r = selectNotificationEmails(alle, { now: NOW });
    const talt = r.toEmail.length + r.toDispose.length + r.venterPaaTid.length + r.venterPaaVindue.length;
    expect(talt).toBe(alle.length);
    const ids = [...r.toEmail, ...r.toDispose, ...r.venterPaaTid, ...r.venterPaaVindue].map((n) => n.id).sort();
    expect(ids).toEqual(alle.map((n) => n.id).sort());
  });

  it("uden for vinduet: kun de udskudte venter — en frisk chat_reply sendes stadig kl. 22", () => {
    const frisk = candidate({ type: "chat_reply", report: undefined, created_at: "2026-07-21T19:30:00.000Z" });
    const r = selectNotificationEmails([frisk], { now: new Date("2026-07-21T20:00:00.000Z") });
    expect(r.toEmail.map((n) => n.id)).toEqual([frisk.id]);
    expect(r.venterPaaVindue).toEqual([]);
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

/**
 * Jonas 10/9: aldersgrænse på BEGIVENHEDER (12 t) og «set i appen» for
 * community. Baggrund: vault tom i otte timer; da jobbet blev tændt kl.
 * 08.57, gik 26 community-mails ud om et opslag fra dagen før.
 */
import {
  BEGIVENHED_MAKS_ALDER_MS,
  BEGIVENHED_TYPES,
  COMMUNITY_TRAAD_TYPES,
  erForaeldet,
} from "../../../supabase/functions/_shared/notificationEmailSelection.ts";

describe("aldersgrænse på begivenheder — 12 timer", () => {
  // Kl. 10 dansk sommertid = 08:00Z: inde i afsendelsesvinduet, så kun alderen afgør.
  const NU = new Date("2026-09-10T08:00:00Z");
  const timerGammel = (t: number) => new Date(NU.getTime() - t * 3_600_000).toISOString();
  const kandidat = (type: string, timer: number, ekstra: Partial<EmailCandidate> = {}): EmailCandidate => ({
    id: `${type}-${timer}`,
    user_id: "u1",
    type,
    company_id: null,
    reference_id: "traad-1",
    created_at: timerGammel(timer),
    ...ekstra,
  });

  it("grænsen er 12 timer, og typerne er community (opslag, svar, nævnelse) og event-påmindelsen", () => {
    expect(BEGIVENHED_MAKS_ALDER_MS).toBe(12 * 60 * 60 * 1000);
    expect([...BEGIVENHED_TYPES].sort()).toEqual(["community_naevnelse", "community_opslag", "community_svar", "event_reminder"]);
  });

  it("community_opslag 11 timer gammel → mail", () => {
    const r = selectNotificationEmails([kandidat("community_opslag", 11)], { now: NU });
    expect(r.toEmail.map((c) => c.id)).toEqual(["community_opslag-11"]);
    expect(r.toDispose).toEqual([]);
  });

  it("community_opslag 13 timer gammel → dispose med grund «foraeldet», IKKE mail", () => {
    const r = selectNotificationEmails([kandidat("community_opslag", 13)], { now: NU });
    expect(r.toEmail).toEqual([]);
    expect(r.toDispose.map((c) => c.id)).toEqual(["community_opslag-13"]);
    expect(r.disposeGrund.get("community_opslag-13")).toBe("foraeldet");
  });

  it("præcis 12 timer er IKKE forældet; ét minut over er", () => {
    expect(erForaeldet({ type: "community_opslag", created_at: timerGammel(12) }, NU)).toBe(false);
    expect(erForaeldet({ type: "community_opslag", created_at: new Date(NU.getTime() - BEGIVENHED_MAKS_ALDER_MS - 60_000).toISOString() }, NU)).toBe(true);
  });

  it("event_reminder og community_naevnelse 13 timer → forældet; event_cancelled 13 timer → mail (du skal vide det ikke sker)", () => {
    const r = selectNotificationEmails(
      [kandidat("event_reminder", 13, { reference_id: "ev-1" }), kandidat("community_naevnelse", 13), kandidat("event_cancelled", 13, { reference_id: "ev-1" })],
      { now: NU },
    );
    expect(r.toDispose.map((c) => c.type).sort()).toEqual(["community_naevnelse", "event_reminder"]);
    expect(r.toEmail.map((c) => c.type)).toEqual(["event_cancelled"]);
  });

  it("OPGAVER holder: chat_reply og report_review_ready (ikke godkendt) 3 dage gamle → stadig mail", () => {
    const r = selectNotificationEmails(
      [
        kandidat("chat_reply", 72, { reference_id: null }),
        kandidat("report_review_ready", 72, { reference_id: "rep-1", company_id: "c1", report: { deleted_at: null, committed: false, period_key: "2026-08" } }),
      ],
      { now: NU },
    );
    expect(r.toEmail.map((c) => c.type).sort()).toEqual(["chat_reply", "report_review_ready"]);
    expect(r.toDispose).toEqual([]);
  });

  it("report_review_ready 3 dage gammel OG godkendt → dispose med grund «rapport_vaek» (tilstanden er dens grænse)", () => {
    const r = selectNotificationEmails(
      [kandidat("report_review_ready", 72, { reference_id: "rep-1", company_id: "c1", report: { deleted_at: null, committed: true, period_key: "2026-08" } })],
      { now: NU },
    );
    expect(r.disposeGrund.get("report_review_ready-72")).toBe("rapport_vaek");
  });
});

describe("«set i appen» dækker community — community_visninger", () => {
  const NU = new Date("2026-09-10T08:00:00Z");
  const kandidat = (type: string, set_i_app: boolean | undefined): EmailCandidate => ({
    id: `${type}-${String(set_i_app)}`,
    user_id: "u1",
    type,
    company_id: null,
    reference_id: "traad-1",
    created_at: new Date(NU.getTime() - 2 * 3_600_000).toISOString(),
    set_i_app,
  });

  it("de tre community-typer er dem kalderen slår op i community_visninger", () => {
    expect([...COMMUNITY_TRAAD_TYPES].sort()).toEqual(["community_naevnelse", "community_opslag", "community_svar"]);
  });

  it("tråden er set (set_i_app true) → dispose med grund «set_i_app», ingen mail — også når den er frisk", () => {
    const r = selectNotificationEmails([kandidat("community_opslag", true)], { now: NU });
    expect(r.toEmail).toEqual([]);
    expect(r.disposeGrund.get("community_opslag-true")).toBe("set_i_app");
  });

  it("ikke set (false) eller ikke slået op (undefined) → mail som før", () => {
    const r = selectNotificationEmails([kandidat("community_opslag", false), kandidat("community_naevnelse", undefined)], { now: NU });
    expect(r.toEmail.map((c) => c.id).sort()).toEqual(["community_naevnelse-undefined", "community_opslag-false"]);
  });

  it("set vinder over alder: set OG forældet → grunden er set_i_app", () => {
    const gammel: EmailCandidate = { ...kandidat("community_opslag", true), created_at: new Date(NU.getTime() - 20 * 3_600_000).toISOString() };
    const r = selectNotificationEmails([gammel], { now: NU });
    expect(r.disposeGrund.get(gammel.id)).toBe("set_i_app");
  });
});
