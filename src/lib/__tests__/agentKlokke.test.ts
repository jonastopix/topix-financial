import { describe, expect, it } from "vitest";
import { klokkeRaekker } from "../../../supabase/functions/_shared/agentKlokke.ts";
import { klassificer } from "../../../supabase/functions/_shared/klokkeMail.ts";

const F = { title: "AI-agent har analyseret ny rapport", body: "Indsigt", company_id: "c1", member_id: "m1" };

describe("agentKlokke — én klokke-række pr. rådgiver", () => {
  it("én række pr. rådgiver med alle felterne og advisor_id sat", () => {
    expect(klokkeRaekker(["a", "b"], F)).toEqual([
      { type: "agent_insight", title: F.title, body: "Indsigt", company_id: "c1", member_id: "m1", advisor_id: "a", reference_type: "agent" },
      { type: "agent_insight", title: F.title, body: "Indsigt", company_id: "c1", member_id: "m1", advisor_id: "b", reference_type: "agent" },
    ]);
  });
  it("dubletter af id (rådgiver + admin) giver én række; tomme/null tabes", () => {
    expect(klokkeRaekker(["a", "a", "", null, undefined, "b", "a"], F).map((r) => r.advisor_id)).toEqual(["a", "b"]);
  });
  it("ingen rådgivere giver ingen rækker", () => expect(klokkeRaekker([], F)).toEqual([]));
  it("uden medlem falder member_id tilbage på rådgiveren (som før)", () => {
    expect(klokkeRaekker(["a"], { ...F, member_id: null })[0].member_id).toBe("a");
  });
  it("typen er i aldrig-klassen (1/10): klokke, ikke mail", () => expect(klassificer("agent_insight", "agent")).toBe("aldrig"));
});
