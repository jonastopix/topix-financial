import { describe, expect, it } from "vitest";
import { agentProgressRaekke, F0_MARKOER } from "../../../supabase/functions/_shared/agentIndholdsFremdrift.ts";

/**
 * run-company-agent v8 (3/10-2026): get_member_content_progress dømmer F0
 * med husets regel — et tidsstempel LIG markeret_at er rådgiverens.
 * docs/akademi-grundlag.md §8 «Åbne punkter efter F0».
 */

const T = "2026-08-05T10:00:00.000Z"; // batch-stemplet (backfill: acknowledged_at = markeret_at)
const T_PG = "2026-08-05T10:00:00+00:00"; // samme øjeblik, PostgREST-form
const EGEN = "2026-09-01T08:00:00.000Z";
const item = { title: "Outsource klogt", area: "fundamentet", duration_seconds: 600 };

describe("agentProgressRaekke — F0", () => {
  it("en backfillet batch-række er IKKE medlemmets «gennemført» — kun gennemgået med rådgiver", () => {
    const r = agentProgressRaekke({ content_item_id: "a", acknowledged_at: T, seen_at: T, markeret_at: T, content_items: item });
    expect(r.state).toBe("urørt");
    expect(r.gennemgaaet_med_raadgiver).toBe(true);
    expect(r.egen_gennemfoert_at).toBeNull();
    expect(r.eget_set_at).toBeNull();
    expect(r.title).toBe("Outsource klogt");
  });

  it("samme øjeblik i to serialiseringer er stadig rådgiverens stempel", () => {
    const r = agentProgressRaekke({ content_item_id: "a", acknowledged_at: T_PG, markeret_at: T });
    expect(r.state).toBe("urørt");
  });

  it("medlemmets eget klik efter markeringen er hendes", () => {
    const r = agentProgressRaekke({ content_item_id: "a", acknowledged_at: EGEN, seen_at: T, markeret_at: T });
    expect(r.state).toBe("gennemført");
    expect(r.egen_gennemfoert_at).toBe(EGEN);
    expect(r.eget_set_at).toBeNull();
    expect(r.gennemgaaet_med_raadgiver).toBe(true);
  });

  it("uden markering dømmes som før: gennemført > sprunget over > set > urørt", () => {
    expect(agentProgressRaekke({ content_item_id: "a", acknowledged_at: EGEN, skipped_at: EGEN }).state).toBe("gennemført");
    expect(agentProgressRaekke({ content_item_id: "a", skipped_at: EGEN, seen_at: EGEN }).state).toBe("sprunget_over");
    expect(agentProgressRaekke({ content_item_id: "a", seen_at: EGEN }).state).toBe("set_men_ikke_gennemført");
    expect(agentProgressRaekke({ content_item_id: "a" }).state).toBe("urørt");
    expect(agentProgressRaekke({ content_item_id: "a", seen_at: EGEN }).gennemgaaet_med_raadgiver).toBe(false);
  });

  it("set af medlemmet på en batch-række: eget seen_at ≠ markeret_at", () => {
    const r = agentProgressRaekke({ content_item_id: "a", acknowledged_at: T, seen_at: EGEN, markeret_at: T, last_position_seconds: 120, content_items: item });
    expect(r.state).toBe("set_men_ikke_gennemført");
    expect(r.eget_set_at).toBe(EGEN);
    expect(r.last_position_seconds).toBe(120);
    expect(r.duration_seconds).toBe(600);
  });

  it("de rå tidsstempler sendes ikke videre til modellen", () => {
    const r = agentProgressRaekke({ content_item_id: "a", acknowledged_at: T, seen_at: T, markeret_at: T });
    expect(Object.keys(r)).not.toContain("acknowledged_at");
    expect(Object.keys(r)).not.toContain("seen_at");
    expect(Object.keys(r)).not.toContain("markeret_at");
  });

  it("markøren for udrulningen", () => {
    expect(F0_MARKOER).toBe("skive-1");
  });
});
