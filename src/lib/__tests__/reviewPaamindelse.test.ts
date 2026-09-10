import { describe, expect, it } from "vitest";
import { afgoerReviewPaamindelse, reviewBesked, type ReviewKandidat } from "../../../supabase/functions/_shared/reviewPaamindelse.ts";

const nu = new Date("2026-10-01T05:20:00Z"); // 1/10 kl. 07:20 dansk tid
const k = (over: Partial<ReviewKandidat> = {}): ReviewKandidat => ({
  report_id: "r1", user_id: "u1", company_id: "c1", file_name: "September.xlsx",
  eligible: true, state: "ready", period_key: "2026-09", period_label: "September 2026", ...over,
});

describe("afgoerReviewPaamindelse — hvem får «gennemgå dine tal» når måneden er omme", () => {
  it("september-rapport den 1. oktober kl. 07:20: klar", () => expect(afgoerReviewPaamindelse(k(), nu)).toEqual({ skal: true, grund: "klar" }));
  it("oktober-rapport samme morgen: ikke afsluttet", () => expect(afgoerReviewPaamindelse(k({ period_key: "2026-10" }), nu).grund).toBe("ikke_afsluttet"));
  it("30/9 kl. 23:30 dansk tid: september er IKKE omme endnu", () =>
    expect(afgoerReviewPaamindelse(k(), new Date("2026-09-30T21:30:00Z")).grund).toBe("ikke_afsluttet"));
  it("1/10 kl. 00:30 dansk tid (22:30 UTC): september ER omme — de to timer hvor UTC ville sige nej", () =>
    expect(afgoerReviewPaamindelse(k(), new Date("2026-09-30T22:30:00Z")).grund).toBe("klar"));
  it("resolveren ikke eligible (fx v1 uden PASS, ingen metrics): nej", () =>
    expect(afgoerReviewPaamindelse(k({ eligible: false, state: "not_ready" }), nu).grund).toBe("ikke_eligible"));
  it("perioden ejes af en anden rapport (blocked): nej — ingen påmindelse om noget der ikke kan godkendes", () =>
    expect(afgoerReviewPaamindelse(k({ eligible: true, state: "blocked" }), nu).grund).toBe("blokeret"));
  it("update_available (rapporten ejer selv perioden): klar", () =>
    expect(afgoerReviewPaamindelse(k({ state: "update_available" }), nu).grund).toBe("klar"));
  it("uden bruger: nej", () => expect(afgoerReviewPaamindelse(k({ user_id: null }), nu).grund).toBe("ingen_bruger"));
  it("uden periodenøgle: nej", () => expect(afgoerReviewPaamindelse(k({ period_key: null }), nu).grund).toBe("ikke_afsluttet"));
});

describe("reviewBesked — samme besked som parsingen, samme dedup, action_required til klokken", () => {
  it("med periode", () => {
    expect(reviewBesked(k())).toMatchObject({
      type: "report_review_ready", priority: "action_required",
      title: "September 2026 — gennemgå dine tal",
      deep_link: "/reports?reportId=r1", dedup_key: "report_review_ready:r1", reference_type: "report", reference_id: "r1", company_id: "c1",
    });
    expect(reviewBesked(k()).body).toContain("September 2026-rapport");
  });
  it("uden periode: den generelle titel", () => {
    expect(reviewBesked(k({ period_label: null })).title).toBe("Din rapport er klar til gennemsyn");
  });
});
