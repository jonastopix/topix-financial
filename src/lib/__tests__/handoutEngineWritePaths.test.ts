import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHandoutTablesMock, type HandoutTablesMock } from "@/test/handoutTablesMock";

/** Dybdetesten af handout-motorens dataveje (hb-handouts-byggeplan §2,
    PR 1): skrivevejene H1-H6 køres end-to-end mod in-memory-simulationen
    af handouts / milestones / handout_lever_milestones (rigtige unikke
    nøgler) — save-payload + status-afledning, insert-vs-update,
    toggleCompleted m. completed_at-friskning + H6-notifikationen,
    lever-milestone m. junction/idempotens og isOwner-gaten. */

const h = vi.hoisted(() => ({ current: null as unknown as HandoutTablesMock }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (...args: any[]) => (h.current.supabase.from as any)(...args),
    functions: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invoke: (...args: any[]) => (h.current.supabase.functions.invoke as any)(...args),
    },
    auth: {
      getSession: () => h.current.supabase.auth.getSession(),
    },
  },
}));

import {
  createLeverMilestone,
  loadHandout,
  loadHandoutSummaries,
  loadLeverMilestones,
  requestHandoutAiFeedback,
  saveHandout,
  toggleHandoutCompleted,
} from "../handoutEngine";

const MEMBER = "member-1";
const ADVISOR = "advisor-1";
const COMPANY = "company-a";

const emptyArgs = {
  effectiveUserId: MEMBER,
  isOwner: true,
  module: "bogholderi" as const,
  companyId: COMPANY,
  handoutId: null as string | null,
  responses: {} as Record<string, string>,
  checklist: {} as Record<string, boolean>,
  levers: [] as string[],
};

beforeEach(() => {
  h.current = createHandoutTablesMock();
});

describe("mock-invarianter (unikke nøgler)", () => {
  it("handouts-insert af dublet på (user_id, module) → 23505, intet skrevet", async () => {
    h.current.seed("handouts", [{ user_id: MEMBER, module: "salg", status: "in_progress" }]);
    const res = await h.current.supabase
      .from("handouts")
      .insert({ user_id: MEMBER, module: "salg", status: "not_started" })
      .select("id")
      .single();
    expect(res.error).toMatchObject({ code: "23505" });
    expect(h.current.tables.handouts).toHaveLength(1);
    expect(h.current.tables.handouts[0].status).toBe("in_progress");
  });
});

describe("H2 — saveHandout (payload + status-afledning)", () => {
  it("uden indhold → insert m. status 'not_started' og fuldt payload", async () => {
    const result = await saveHandout({ ...emptyArgs });
    expect(result).toMatchObject({ skipped: false, error: null });
    expect(h.current.tables.handouts).toHaveLength(1);
    expect(h.current.tables.handouts[0]).toMatchObject({
      user_id: MEMBER,
      module: "bogholderi",
      company_id: COMPANY,
      status: "not_started",
      responses: {},
      checklist: {},
      levers: [],
    });
  });

  it.each([
    ["response", { responses: { a: "svar" } }],
    ["checklist", { checklist: { k: true } }],
    ["løftestang", { levers: ["gør noget"] }],
  ])("indhold i %s → status 'in_progress'", async (_navn, patch) => {
    await saveHandout({ ...emptyArgs, ...patch });
    expect(h.current.tables.handouts[0].status).toBe("in_progress");
  });

  it("whitespace-svar tæller IKKE som indhold (trim-reglen fra kilden)", async () => {
    await saveHandout({ ...emptyArgs, responses: { a: "   " }, levers: ["  "] });
    expect(h.current.tables.handouts[0].status).toBe("not_started");
  });

  it("insert-grenen returnerer nyt handoutId; update-grenen genbruger rækken", async () => {
    const first = await saveHandout({ ...emptyArgs, responses: { a: "x" } });
    if (first.skipped) throw new Error("uventet skip");
    expect(first.handoutId).toBeTruthy();
    expect(h.current.tables.handouts).toHaveLength(1);

    const second = await saveHandout({
      ...emptyArgs,
      handoutId: first.handoutId,
      responses: { a: "x", b: "y" },
    });
    if (second.skipped) throw new Error("uventet skip");
    expect(second.handoutId).toBe(first.handoutId);
    expect(h.current.tables.handouts).toHaveLength(1);
    expect(h.current.tables.handouts[0].responses).toEqual({ a: "x", b: "y" });
  });

  it("isOwner-gaten: advisor-visning (isOwner=false) skriver INTET", async () => {
    const result = await saveHandout({ ...emptyArgs, isOwner: false, responses: { a: "advisor-tekst" } });
    expect(result).toMatchObject({ skipped: true, error: null });
    expect(h.current.tables.handouts).toHaveLength(0);
  });

  it("manglende effectiveUserId skriver INTET", async () => {
    const result = await saveHandout({ ...emptyArgs, effectiveUserId: null });
    expect(result).toMatchObject({ skipped: true, error: null });
    expect(h.current.tables.handouts).toHaveLength(0);
  });
});

describe("H3 — toggleHandoutCompleted (m. completed_at-friskning + H6)", () => {
  it("markér udfyldt: status completed, completed_at sat, notifikation affyret m. handout_id", async () => {
    h.current.seed("handouts", [{ user_id: MEMBER, module: "salg", status: "in_progress", completed_at: null }]);
    const id = h.current.tables.handouts[0].id;

    const result = await toggleHandoutCompleted({ handoutId: id, isOwner: true, isCompleted: false });
    expect(result).toMatchObject({ skipped: false, newStatus: "completed", error: null });
    expect(h.current.tables.handouts[0].status).toBe("completed");
    expect(h.current.tables.handouts[0].completed_at).toBeTruthy();

    // H6 er fire-and-forget (via lib/handoutNotify → auth-gate → invoke)
    await vi.waitFor(() => {
      expect(h.current.invokeCalls).toEqual([
        { name: "send-slack-handout-notification", body: { handout_id: id } },
      ]);
    });
  });

  it("genåbn: status in_progress, completed_at nulstillet, INGEN ny notifikation", async () => {
    h.current.seed("handouts", [{ user_id: MEMBER, module: "salg", status: "completed", completed_at: "2026-08-01T00:00:00Z" }]);
    const id = h.current.tables.handouts[0].id;

    const result = await toggleHandoutCompleted({ handoutId: id, isOwner: true, isCompleted: true });
    expect(result).toMatchObject({ skipped: false, newStatus: "in_progress", error: null });
    expect(h.current.tables.handouts[0].completed_at).toBeNull();
    // giv evt. hængende fire-and-forget en chance for at fejle testen
    await new Promise((r) => setTimeout(r, 0));
    expect(h.current.invokeCalls).toHaveLength(0);
  });

  it("isOwner-gaten: advisor kan ikke toggle", async () => {
    h.current.seed("handouts", [{ user_id: MEMBER, module: "salg", status: "in_progress", completed_at: null }]);
    const id = h.current.tables.handouts[0].id;
    const result = await toggleHandoutCompleted({ handoutId: id, isOwner: false, isCompleted: false });
    expect(result).toMatchObject({ skipped: true, error: null });
    expect(h.current.tables.handouts[0].status).toBe("in_progress");
    expect(h.current.invokeCalls).toHaveLength(0);
  });
});

describe("H4 — createLeverMilestone (+ junction + idempotens)", () => {
  it("opretter milestone (source: handout) + junction-række, og H1b læser den tilbage", async () => {
    h.current.seed("handouts", [{ user_id: MEMBER, module: "salg", status: "in_progress" }]);
    const handoutId = h.current.tables.handouts[0].id;

    const { milestoneId } = await createLeverMilestone({
      userId: MEMBER, companyId: COMPANY, handoutId, leverIndex: 0, title: "Flere leads",
    });

    expect(h.current.tables.milestones[0]).toMatchObject({
      id: milestoneId, user_id: MEMBER, company_id: COMPANY, title: "Flere leads", source: "handout",
    });
    expect(h.current.tables.handout_lever_milestones[0]).toMatchObject({
      handout_id: handoutId, lever_index: 0, milestone_id: milestoneId,
    });

    // Rundtur: H1b mapper på lever_index
    h.current.tables.milestones[0].progress = 40;
    h.current.tables.milestones[0].status = "active";
    const map = await loadLeverMilestones(handoutId);
    expect(map[0]).toMatchObject({ milestone_id: milestoneId, title: "Flere leads", progress: 40 });
  });

  it("UNIQUE(handout_id, lever_index): andet forsøg på samme løftestang kaster 23505 og skriver ingen ny junction", async () => {
    h.current.seed("handouts", [{ user_id: MEMBER, module: "salg", status: "in_progress" }]);
    const handoutId = h.current.tables.handouts[0].id;
    await createLeverMilestone({ userId: MEMBER, companyId: COMPANY, handoutId, leverIndex: 1, title: "A" });

    await expect(
      createLeverMilestone({ userId: MEMBER, companyId: COMPANY, handoutId, leverIndex: 1, title: "B" }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(h.current.tables.handout_lever_milestones).toHaveLength(1);
    // Dokumenteret prod-semantik (kilden ordret): milestone-rækken oprettes
    // FØR junction-fejlen — den forældreløse milestone er kendt adfærd.
    expect(h.current.tables.milestones).toHaveLength(2);
  });
});

describe("H1 — læseveje", () => {
  it("loadHandout finder rækken på (user_id, module); null ellers", async () => {
    h.current.seed("handouts", [{ user_id: MEMBER, module: "salg", status: "in_progress", responses: { a: "x" } }]);
    const row = await loadHandout(MEMBER, "salg");
    expect(row).toMatchObject({ user_id: MEMBER, module: "salg", responses: { a: "x" } });
    expect(await loadHandout(MEMBER, "marketing")).toBeNull();
  });

  it("loadHandoutSummaries: advisor ser virksomhedens rækker, medlem kun sine egne", async () => {
    h.current.seed("handouts", [
      { user_id: MEMBER, module: "salg", status: "in_progress", company_id: COMPANY },
      { user_id: "member-2", module: "salg", status: "completed", company_id: COMPANY },
      { user_id: "member-3", module: "salg", status: "completed", company_id: "company-b" },
    ]);
    const advisorRows = await loadHandoutSummaries({ userId: ADVISOR, companyId: COMPANY, isAdvisor: true });
    expect(advisorRows).toHaveLength(2);
    const memberRows = await loadHandoutSummaries({ userId: MEMBER, companyId: COMPANY, isAdvisor: false });
    expect(memberRows).toHaveLength(1);
    expect(memberRows[0].user_id).toBe(MEMBER);
  });
});

describe("H5 — requestHandoutAiFeedback", () => {
  it("invoker handout-ai-feedback m. ordret body inkl. industry", async () => {
    await requestHandoutAiFeedback({ handoutId: "h-9", module: "salg", companyName: "ACME", industry: "Detail" });
    expect(h.current.invokeCalls).toEqual([
      { name: "handout-ai-feedback", body: { handout_id: "h-9", module: "salg", company_name: "ACME", industry: "Detail" } },
    ]);
  });

  it("kaster ved invoke-fejl (kalderen ejer toasten)", async () => {
    h.current.setInvokeHandler("handout-ai-feedback", () => ({ error: { message: "boom" } }));
    await expect(
      requestHandoutAiFeedback({ handoutId: "h-9", module: "salg" }),
    ).rejects.toMatchObject({ message: "boom" });
  });
});
