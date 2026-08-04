import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  runGetParseStatus,
  toParseStatusReport,
  type ParseStatusResult,
} from "../src/tools/getParseStatus";
import { createContext, type AccessContext } from "../src/access/accessContext";
import { FINANCIAL_REPORTS_COLUMNS, selectList } from "../src/schema/columns";

const TOPIX_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

// Canned fixture modelled on the live verification output (2026-08): a fresh
// June saldobalance committed 22/7 (canonical, PASS, no override) plus a
// system-generated baseline sentinel row — returned as-is, never filtered.
const juneRow = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  company_id: TOPIX_ID,
  file_name: "Saldobalance juni 2026.pdf",
  report_type: "saldobalance",
  report_period: "2026-06",
  status: "processed",
  validation_status: "PASS",
  validation_errors: null,
  uploaded_at: "2026-07-22T09:15:00+00:00",
  processed_at: "2026-07-22T09:15:31+00:00",
  manual_override_status: null,
  deleted_at: null,
};
const sentinelRow = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  company_id: TOPIX_ID,
  file_name: `_annual_baseline_sentinel_${TOPIX_ID}`,
  report_type: "andet",
  report_period: null,
  status: "processed",
  validation_status: null,
  validation_errors: null,
  uploaded_at: "2026-03-01T00:00:00+00:00",
  processed_at: null,
  manual_override_status: null,
  deleted_at: null,
};

// Records the full from/select/eq/is/order/limit chain and resolves (thenable)
// to the canned { data, error } when awaited by queryWithReauth.
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
    is(col: string, val: unknown) {
      calls.push(["is", col, val]);
      return builder;
    },
    order(col: string, opts: unknown) {
      calls.push(["order", col, opts]);
      return builder;
    },
    limit(n: number) {
      calls.push(["limit", n]);
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

function parseResult(res: { content: { text: string }[] }): ParseStatusResult {
  return JSON.parse(res.content[0]!.text) as ParseStatusResult;
}

describe("runGetParseStatus — gate", () => {
  it("is rejected without a valid AccessContext", async () => {
    await expect(
      runGetParseStatus(null as unknown as AccessContext, { company_id: TOPIX_ID }),
    ).rejects.toThrow(/valid AccessContext/);
    await expect(
      runGetParseStatus({} as unknown as AccessContext, { company_id: TOPIX_ID }),
    ).rejects.toThrow(/valid AccessContext/);
  });

  it("rejects a company outside the caller's scope via the real dbFor gate", async () => {
    const { client } = recordingClient([]);
    const ctx = ctxWith(client, [OTHER_ID]);
    await expect(
      runGetParseStatus(ctx, { company_id: TOPIX_ID }),
    ).rejects.toThrow(/outside the caller's access scope/);
  });
});

describe("runGetParseStatus — input validation (BEFORE dbFor)", () => {
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
        runGetParseStatus(ctx, { company_id: bad }),
      ).rejects.toThrow(/company_id as a UUID/);
      expect(dbFor).not.toHaveBeenCalled();
    }
  });

  it("rejects limit 0, 51 and non-integers without touching dbFor", async () => {
    for (const bad of [0, 51, 2.5, -1]) {
      const { ctx, dbFor } = spyCtx();
      await expect(
        runGetParseStatus(ctx, { company_id: TOPIX_ID, limit: bad }),
      ).rejects.toThrow(/between 1 and 50/);
      expect(dbFor).not.toHaveBeenCalled();
    }
  });

  it("applies the default limit 10 and accepts the max 50", async () => {
    const a = recordingClient([]);
    await runGetParseStatus(ctxWith(a.client), { company_id: TOPIX_ID });
    expect(a.calls).toContainEqual(["limit", 10]);

    const b = recordingClient([]);
    await runGetParseStatus(ctxWith(b.client), { company_id: TOPIX_ID, limit: 50 });
    expect(b.calls).toContainEqual(["limit", 50]);
  });
});

describe("runGetParseStatus — query chain", () => {
  it("builds the exact scoped, soft-delete-filtered, newest-first query", async () => {
    const { client, calls } = recordingClient([juneRow, sentinelRow]);
    await runGetParseStatus(ctxWith(client), { company_id: TOPIX_ID, limit: 25 });
    expect(calls).toEqual([
      ["from", "financial_reports"],
      ["select", selectList(FINANCIAL_REPORTS_COLUMNS)],
      ["eq", "company_id", TOPIX_ID],
      ["is", "deleted_at", null],
      ["order", "uploaded_at", { ascending: false }],
      ["limit", 25],
    ]);
  });
});

describe("runGetParseStatus — result mapping", () => {
  it("wraps rows in the envelope and maps exactly the 10 agreed fields", async () => {
    const { client } = recordingClient([juneRow, sentinelRow]);
    const res = await runGetParseStatus(ctxWith(client), { company_id: TOPIX_ID });
    const result = parseResult(res);
    expect(result.company_id).toBe(TOPIX_ID);
    expect(result.count).toBe(2);
    expect(result.reports[0]).toEqual({
      id: juneRow.id,
      file_name: "Saldobalance juni 2026.pdf",
      report_type: "saldobalance",
      report_period: "2026-06",
      status: "processed",
      validation_status: "PASS",
      validation_errors: null,
      uploaded_at: "2026-07-22T09:15:00+00:00",
      processed_at: "2026-07-22T09:15:31+00:00",
      manual_override_status: null,
    });
    // company_id/deleted_at are fetched for scoping/filtering but never echoed.
    for (const report of result.reports) {
      expect(Object.keys(report)).not.toContain("company_id");
      expect(Object.keys(report)).not.toContain("deleted_at");
      expect(Object.keys(report)).toHaveLength(10);
    }
  });

  it("returns sentinel rows as they are (no silent filtering)", async () => {
    const { client } = recordingClient([juneRow, sentinelRow]);
    const res = await runGetParseStatus(ctxWith(client), { company_id: TOPIX_ID });
    const sentinel = parseResult(res).reports[1]!;
    expect(sentinel.file_name).toBe(`_annual_baseline_sentinel_${TOPIX_ID}`);
    expect(sentinel.report_period).toBeNull();
    expect(sentinel.processed_at).toBeNull();
    expect(sentinel.validation_status).toBeNull();
  });

  it("treats an empty list as a valid answer, not an error", async () => {
    const { client } = recordingClient([]);
    const res = await runGetParseStatus(ctxWith(client), { company_id: TOPIX_ID });
    expect(parseResult(res)).toEqual({
      company_id: TOPIX_ID,
      count: 0,
      reports: [],
    });
  });
});

describe("runGetParseStatus — error path", () => {
  it("surfaces a neutral error (raw cause to stderr) on a query error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = recordingClient(null, { code: "PGRST000", message: "boom" });
    await expect(
      runGetParseStatus(ctxWith(client), { company_id: TOPIX_ID }),
    ).rejects.toThrow("Failed to load parse status");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
    );
    errorSpy.mockRestore();
  });
});

describe("toParseStatusReport", () => {
  it("normalises missing optionals to null", () => {
    const report = toParseStatusReport({
      id: "x",
      company_id: TOPIX_ID,
    } as never);
    expect(report).toEqual({
      id: "x",
      file_name: null,
      report_type: null,
      report_period: null,
      status: null,
      validation_status: null,
      validation_errors: null,
      uploaded_at: null,
      processed_at: null,
      manual_override_status: null,
    });
  });
});
