import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  runGetFinancialMetrics,
  toFinancialMetricsPeriod,
  type FinancialMetricsResult,
} from "../src/tools/getFinancialMetrics";
import { createContext, type AccessContext } from "../src/access/accessContext";
import { FINANCIAL_REPORT_FACTS_COLUMNS, selectList } from "../src/schema/columns";

const TOPIX_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

// Canned fixtures modelled on the live verification (2026-08): key sets differ
// BETWEEN periods (canonical_v2 2026-05 has current_liabilities/facility_costs,
// an older manual period lacks ebitda/ebit) — the P3 caveat the tool must pass
// through untouched. The float artefact in ebitda is deliberate (known P3).
const mayMetrics = {
  revenue: 1200000,
  gross_profit: 800000,
  ebitda: 5609.849999999991,
  ebit: 4200.12,
  equity_total: 267650.77,
  current_liabilities: 350000,
  facility_costs: 12000,
};
const manualMetrics = {
  revenue: 900000,
  gross_profit: 600000,
  net_result: 50000,
  // no ebitda/ebit, no current_liabilities/facility_costs
};

const mayRow = {
  company_id: TOPIX_ID,
  period_key: "2026-05",
  period_label: "Maj 2026",
  source_type: "canonical_v2",
  committed_at: "2026-06-10T08:00:00+00:00",
  metrics: mayMetrics,
};
const manualRow = {
  company_id: TOPIX_ID,
  period_key: "2025-11",
  period_label: "November 2025",
  source_type: "manual",
  committed_at: "2025-12-05T10:00:00+00:00",
  metrics: manualMetrics,
};

// Records the from/select/eq/order chain and resolves (thenable) to the canned
// { data, error } when awaited by queryWithReauth.
function recordingClient(data: unknown, error: unknown = null) {
  const calls: unknown[][] = [];
  const builder = {
    select(cols: string) {
      calls.push(["select", cols]);
      return builder;
    },
    eq(col: string, val: unknown) {
      calls.push(["eq", col, val]);
      return builder;
    },
    order(col: string, opts: unknown) {
      calls.push(["order", col, opts]);
      return builder;
    },
    then(onFulfilled: (v: { data: unknown; error: unknown }) => unknown) {
      return Promise.resolve({ data, error }).then(onFulfilled);
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

function ctxWith(client: SupabaseClient, scope: "all" | string[] = "all"): AccessContext {
  return createContext({
    actor: "user:test",
    mode: "user",
    companyScope: scope,
    client,
  });
}

function parseResult(res: { content: { text: string }[] }): FinancialMetricsResult {
  return JSON.parse(res.content[0]!.text) as FinancialMetricsResult;
}

describe("runGetFinancialMetrics — gate", () => {
  it("is rejected without a valid AccessContext", async () => {
    await expect(
      runGetFinancialMetrics(null as unknown as AccessContext, {
        company_id: TOPIX_ID,
      }),
    ).rejects.toThrow(/valid AccessContext/);
    await expect(
      runGetFinancialMetrics({} as unknown as AccessContext, {
        company_id: TOPIX_ID,
      }),
    ).rejects.toThrow(/valid AccessContext/);
  });

  it("rejects a company outside the caller's scope via the real dbFor gate", async () => {
    const { client } = recordingClient([]);
    const ctx = ctxWith(client, [OTHER_ID]);
    await expect(
      runGetFinancialMetrics(ctx, { company_id: TOPIX_ID }),
    ).rejects.toThrow(/outside the caller's access scope/);
  });
});

describe("runGetFinancialMetrics — input validation (BEFORE dbFor)", () => {
  function spyCtx(): { ctx: AccessContext; dbFor: ReturnType<typeof vi.fn> } {
    const dbFor = vi.fn();
    const ctx = {
      actor: "user:test",
      mode: "user",
      companyScope: "all",
      dbFor,
      dbGlobal: () => ({}) as SupabaseClient,
      selectAcrossTenants: () => ({}),
    } as unknown as AccessContext;
    return { ctx, dbFor };
  }

  it("rejects a non-UUID company_id without ever touching dbFor", async () => {
    for (const bad of ["topix", "", "123", "not-a-uuid"]) {
      const { ctx, dbFor } = spyCtx();
      await expect(
        runGetFinancialMetrics(ctx, { company_id: bad }),
      ).rejects.toThrow(/company_id as a UUID/);
      expect(dbFor).not.toHaveBeenCalled();
    }
  });

  it("rejects a malformed period_key without touching dbFor", async () => {
    for (const bad of ["2026-6", "202606", "2026-06-01", ""]) {
      const { ctx, dbFor } = spyCtx();
      await expect(
        runGetFinancialMetrics(ctx, { company_id: TOPIX_ID, period_key: bad }),
      ).rejects.toThrow(/period_key must match YYYY-MM/);
      expect(dbFor).not.toHaveBeenCalled();
    }
  });
});

describe("runGetFinancialMetrics — query chain", () => {
  it("builds the scoped, newest-first query WITHOUT a period filter when omitted", async () => {
    const { client, calls } = recordingClient([mayRow, manualRow]);
    await runGetFinancialMetrics(ctxWith(client), { company_id: TOPIX_ID });
    expect(calls).toEqual([
      ["from", "financial_report_facts"],
      ["select", selectList(FINANCIAL_REPORT_FACTS_COLUMNS)],
      ["eq", "company_id", TOPIX_ID],
      ["order", "period_key", { ascending: false }],
    ]);
  });

  it("adds the period_key filter before the order when given", async () => {
    const { client, calls } = recordingClient([mayRow]);
    await runGetFinancialMetrics(ctxWith(client), {
      company_id: TOPIX_ID,
      period_key: "2026-05",
    });
    expect(calls).toEqual([
      ["from", "financial_report_facts"],
      ["select", selectList(FINANCIAL_REPORT_FACTS_COLUMNS)],
      ["eq", "company_id", TOPIX_ID],
      ["eq", "period_key", "2026-05"],
      ["order", "period_key", { ascending: false }],
    ]);
  });
});

describe("runGetFinancialMetrics — result mapping (P3: raw metrics)", () => {
  it("passes differing metrics key sets through untouched", async () => {
    const { client } = recordingClient([mayRow, manualRow]);
    const res = await runGetFinancialMetrics(ctxWith(client), {
      company_id: TOPIX_ID,
    });
    const result = parseResult(res);
    expect(result.company_id).toBe(TOPIX_ID);
    expect(result.count).toBe(2);
    // The jsonb payloads are deep-equal to what was stored — including the
    // float artefact and the ABSENT keys on the manual period.
    expect(result.periods[0]!.metrics).toEqual(mayMetrics);
    expect(result.periods[1]!.metrics).toEqual(manualMetrics);
    expect(result.periods[1]!.metrics).not.toHaveProperty("ebitda");
    expect(result.periods[1]!.metrics).not.toHaveProperty("ebit");
  });

  it("maps exactly the 5 agreed fields per period and no company_id", async () => {
    const { client } = recordingClient([mayRow, manualRow]);
    const res = await runGetFinancialMetrics(ctxWith(client), {
      company_id: TOPIX_ID,
    });
    const result = parseResult(res);
    expect(result.periods[0]).toEqual({
      period_key: "2026-05",
      period_label: "Maj 2026",
      source_type: "canonical_v2",
      committed_at: "2026-06-10T08:00:00+00:00",
      metrics: mayMetrics,
    });
    for (const period of result.periods) {
      expect(Object.keys(period)).not.toContain("company_id");
      expect(Object.keys(period)).toHaveLength(5);
    }
  });

  it("echoes period_key in the envelope only when the input carried one", async () => {
    const withKey = recordingClient([mayRow]);
    const resWith = await runGetFinancialMetrics(ctxWith(withKey.client), {
      company_id: TOPIX_ID,
      period_key: "2026-05",
    });
    expect(parseResult(resWith).period_key).toBe("2026-05");

    const withoutKey = recordingClient([mayRow, manualRow]);
    const resWithout = await runGetFinancialMetrics(ctxWith(withoutKey.client), {
      company_id: TOPIX_ID,
    });
    expect(parseResult(resWithout)).not.toHaveProperty("period_key");
  });

  it("treats an empty list as a valid answer (unknown period / no facts)", async () => {
    const { client } = recordingClient([]);
    const res = await runGetFinancialMetrics(ctxWith(client), {
      company_id: TOPIX_ID,
      period_key: "2026-13",
    });
    expect(parseResult(res)).toEqual({
      company_id: TOPIX_ID,
      period_key: "2026-13",
      count: 0,
      periods: [],
    });
  });
});

describe("runGetFinancialMetrics — error path", () => {
  it("surfaces a neutral error (raw cause to stderr) on a query error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = recordingClient(null, { code: "PGRST000", message: "boom" });
    await expect(
      runGetFinancialMetrics(ctxWith(client), { company_id: TOPIX_ID }),
    ).rejects.toThrow("Failed to load financial metrics");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("boom"));
    errorSpy.mockRestore();
  });
});

describe("toFinancialMetricsPeriod", () => {
  it("normalises a missing metrics payload to an empty object", () => {
    const period = toFinancialMetricsPeriod({
      company_id: TOPIX_ID,
      period_key: "2026-01",
      period_label: "Januar 2026",
      source_type: "canonical_v2",
      committed_at: null,
      metrics: null as never,
    });
    expect(period).toEqual({
      period_key: "2026-01",
      period_label: "Januar 2026",
      source_type: "canonical_v2",
      committed_at: null,
      metrics: {},
    });
  });
});
