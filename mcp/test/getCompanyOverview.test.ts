import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateOverview,
  runGetCompanyOverview,
  type CompanyOverview,
} from "../src/tools/getCompanyOverview";
import { createContext, type AccessContext } from "../src/access/accessContext";

// Generates `count` consecutive YYYY-MM period_keys starting at startYear/Month.
function periodRange(startYear: number, startMonth: number, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const m0 = startMonth - 1 + i;
    const year = startYear + Math.floor(m0 / 12);
    const month = (m0 % 12) + 1;
    out.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return out;
}

const companies = [
  { id: "topix", name: "Topix.dk ApS", status: "active" },
  { id: "brick", name: "Brick Works ApS", status: "active" },
  { id: "bastant", name: "Bastant Design", status: "active" }, // no committed facts
];

// Topix: 18 periods, max 2026-06 (ground truth). Rows intentionally unsorted.
const topixFacts = periodRange(2025, 1, 18).map((period_key) => ({
  company_id: "topix",
  period_key,
}));
// Brick: 21 periods 2024-07..2026-03, max 2026-03, INCLUDES 2024-10 — proves
// latest = max(period_key), not latest-committed (the rejected definition).
const brickFacts = periodRange(2024, 7, 21).map((period_key) => ({
  company_id: "brick",
  period_key,
}));
const allFacts = [...brickFacts, ...topixFacts]; // shuffled order across companies

function byId(rows: CompanyOverview[]): Record<string, CompanyOverview> {
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

describe("aggregateOverview", () => {
  it("computes latest = max(period_key) and the committed-period count", () => {
    const rows = byId(aggregateOverview(companies, allFacts));
    expect(rows.topix).toEqual({
      id: "topix",
      name: "Topix.dk ApS",
      status: "active",
      latest_committed_period_key: "2026-06",
      committed_period_count: 18,
    });
    expect(rows.brick.latest_committed_period_key).toBe("2026-03");
    expect(rows.brick.committed_period_count).toBe(21);
    // Sanity: the older 2024-10 period exists but does not win.
    expect(brickFacts.some((f) => f.period_key === "2024-10")).toBe(true);
  });

  it("gives null/0 for a company with no committed facts (main scenario, 18/40)", () => {
    const rows = byId(aggregateOverview(companies, allFacts));
    expect(rows.bastant).toEqual({
      id: "bastant",
      name: "Bastant Design",
      status: "active",
      latest_committed_period_key: null,
      committed_period_count: 0,
    });
  });

  it("returns every company even when there are no facts at all", () => {
    const rows = aggregateOverview(companies, []);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.committed_period_count === 0)).toBe(true);
    expect(rows.every((r) => r.latest_committed_period_key === null)).toBe(true);
  });
});

// Fake context whose selectAcrossTenants returns canned rows per table.
function overviewCtx(
  companiesData: unknown,
  factsData: unknown,
  companiesError: unknown = null,
): AccessContext {
  const stub = { __stub: true } as unknown as SupabaseClient;
  return {
    actor: "user:test",
    mode: "user",
    companyScope: "all",
    dbFor: () => stub,
    dbGlobal: () => stub,
    selectAcrossTenants: ((table: string) =>
      Promise.resolve(
        table === "companies"
          ? { data: companiesData, error: companiesError }
          : { data: factsData, error: null },
      )) as unknown as AccessContext["selectAcrossTenants"],
  } as unknown as AccessContext;
}

describe("runGetCompanyOverview", () => {
  it("is rejected without a valid AccessContext", async () => {
    await expect(
      runGetCompanyOverview(null as unknown as AccessContext),
    ).rejects.toThrow(/valid AccessContext/);
    await expect(
      runGetCompanyOverview({} as unknown as AccessContext),
    ).rejects.toThrow(/valid AccessContext/);
  });

  it("maps the two cross-tenant reads into the aggregated overview", async () => {
    const ctx = overviewCtx(companies, allFacts);
    const res = await runGetCompanyOverview(ctx);
    const rows = byId(JSON.parse(res.content[0]!.text) as CompanyOverview[]);
    expect(rows.topix.latest_committed_period_key).toBe("2026-06");
    expect(rows.topix.committed_period_count).toBe(18);
    expect(rows.bastant.committed_period_count).toBe(0);
    expect(rows.bastant.latest_committed_period_key).toBeNull();
  });

  it("surfaces a neutral error (raw cause to stderr) on a query error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = overviewCtx(null, null, { code: "PGRST000", message: "boom" });
    await expect(runGetCompanyOverview(ctx)).rejects.toThrow(
      "Failed to load company overview",
    );
    errorSpy.mockRestore();
  });
});

// Records the from/select/in chain so we can assert scope enforcement.
function recordingClient() {
  const calls: unknown[][] = [];
  const builder = {
    select(cols: string) {
      calls.push(["select", cols]);
      return builder;
    },
    in(col: string, vals: readonly string[]) {
      calls.push(["in", col, [...vals]]);
      return builder;
    },
  };
  const client = {
    from(table: string) {
      calls.push(["from", table]);
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("selectAcrossTenants (scope enforcement)", () => {
  it("applies .in(companyIdColumn, scope) when the scope is a list", () => {
    const { client, calls } = recordingClient();
    const ctx = createContext({
      actor: "user:x",
      mode: "user",
      companyScope: ["A", "B"],
      client,
    });
    ctx.selectAcrossTenants("financial_report_facts", "company_id,period_key", "company_id");
    expect(calls).toContainEqual(["from", "financial_report_facts"]);
    expect(calls).toContainEqual(["in", "company_id", ["A", "B"]]);
  });

  it("adds NO filter under scope 'all' (advisor RLS is the gate)", () => {
    const { client, calls } = recordingClient();
    const ctx = createContext({
      actor: "user:x",
      mode: "user",
      companyScope: "all",
      client,
    });
    ctx.selectAcrossTenants("companies", "id,name,status", "id");
    expect(calls).toContainEqual(["from", "companies"]);
    expect(calls.some((c) => c[0] === "in")).toBe(false);
  });
});
