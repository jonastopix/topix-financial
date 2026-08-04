import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isAccessContext, type AccessContext } from "../access/accessContext";
import { queryWithReauth, type QueryResult } from "../supabase/session";
import { FINANCIAL_REPORT_FACTS_COLUMNS, selectList } from "../schema/columns";

export const GET_FINANCIAL_METRICS_TOOL_NAME = "get_financial_metrics";

export const PERIOD_KEY_PATTERN = /^\d{4}-\d{2}$/;

// Input schema as a Zod raw shape (the ping convention). The SDK validates args
// against this before the handler runs; the handler re-validates defensively
// because it is pure and directly callable in tests.
export const getFinancialMetricsInputSchema = {
  company_id: z.string().uuid().describe("UUID for selskabet (companies.id)"),
  period_key: z
    .string()
    .regex(PERIOD_KEY_PATTERN)
    .optional()
    .describe("Valgfri YYYY-MM. Udeladt: alle committede perioder, nyeste først."),
};

// Standalone zod schemas for the handler's own validation, run BEFORE dbFor.
const companyIdSchema = z.string().uuid();
const periodKeySchema = z.string().regex(PERIOD_KEY_PATTERN);

/** Raw row shape as selected via FINANCIAL_REPORT_FACTS_COLUMNS (§3.3). */
interface FinancialMetricsRow {
  company_id: string;
  period_key: string;
  period_label: string;
  source_type: string;
  committed_at: string | null;
  metrics: Record<string, unknown>;
}

/**
 * One committed period. `metrics` is the RAW jsonb as stored: its key set
 * varies between periods and source types (BACKLOG P3) — no fixed shape is
 * assumed or enforced here. `company_id` is fetched for scoping but not echoed.
 */
export interface FinancialMetricsPeriod {
  period_key: string;
  period_label: string;
  source_type: string; // canonical | canonical_v2 | manual (§3.3 CHECK)
  committed_at: string | null;
  metrics: Record<string, unknown>;
}

export interface FinancialMetricsResult {
  company_id: string;
  period_key?: string; // echoed only when the input carried one
  count: number;
  periods: FinancialMetricsPeriod[];
}

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
}

export interface GetFinancialMetricsArgs {
  company_id: string;
  period_key?: string;
}

/** Explicit row → output mapping; the metrics jsonb passes through untouched. */
export function toFinancialMetricsPeriod(
  row: FinancialMetricsRow,
): FinancialMetricsPeriod {
  return {
    period_key: row.period_key,
    period_label: row.period_label,
    source_type: row.source_type,
    committed_at: row.committed_at ?? null,
    metrics: row.metrics ?? {},
  };
}

/**
 * Handler. Refuses to run without a valid AccessContext, and validates inputs
 * BEFORE ctx.dbFor is touched. Single-tenant lookup: dbFor's scope gate is
 * defence-in-depth; the explicit .eq("company_id") is the actual filter,
 * because the advisor JWT's RLS sees every company (§3.3 policies). Newest
 * first = period_key desc (YYYY-MM is lexically chronological, §3.3 — the same
 * chronology definition as Tool 1; NOT committed_at).
 */
export async function runGetFinancialMetrics(
  ctx: AccessContext,
  args: GetFinancialMetricsArgs,
): Promise<ToolResult> {
  if (!isAccessContext(ctx)) {
    throw new Error("get_financial_metrics requires a valid AccessContext");
  }

  const parsedId = companyIdSchema.safeParse(args?.company_id);
  if (!parsedId.success) {
    throw new Error("get_financial_metrics requires company_id as a UUID");
  }
  const companyId = parsedId.data;

  let periodKey: string | undefined;
  if (args?.period_key !== undefined) {
    const parsedKey = periodKeySchema.safeParse(args.period_key);
    if (!parsedKey.success) {
      throw new Error("get_financial_metrics period_key must match YYYY-MM");
    }
    periodKey = parsedKey.data;
  }

  const res = await queryWithReauth<FinancialMetricsRow>(ctx, () => {
    let q = ctx
      .dbFor(companyId)
      .from("financial_report_facts")
      .select(selectList(FINANCIAL_REPORT_FACTS_COLUMNS))
      .eq("company_id", companyId);
    if (periodKey !== undefined) {
      q = q.eq("period_key", periodKey); // 0 or 1 row (UNIQUE(company_id, period_key))
    }
    return q.order("period_key", {
      ascending: false,
    }) as unknown as PromiseLike<QueryResult<FinancialMetricsRow>>;
  });
  if (res.error) {
    console.error(
      `[boardroom-mcp] get_financial_metrics query failed: ${res.error.message}`,
    );
    throw new Error("Failed to load financial metrics");
  }

  const periods = (res.data ?? []).map(toFinancialMetricsPeriod);
  const result: FinancialMetricsResult = {
    company_id: companyId,
    ...(periodKey !== undefined ? { period_key: periodKey } : {}),
    count: periods.length,
    periods,
  };
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

export function registerGetFinancialMetrics(
  server: McpServer,
  ctx: AccessContext,
): void {
  server.registerTool(
    GET_FINANCIAL_METRICS_TOOL_NAME,
    {
      title: "Financial metrics",
      description:
        "Committed financial metrics for one company from " +
        "financial_report_facts. Optional period_key (YYYY-MM) returns that " +
        "single period; omitted returns all committed periods, newest first. " +
        "The metrics object is returned as stored: its key set varies between " +
        "periods and source types (e.g. some periods lack " +
        "current_liabilities/facility_costs; older manual-sourced periods " +
        "lack ebitda/ebit) — do not assume a fixed key set; a missing key " +
        "means 'not recorded', not zero.",
      inputSchema: getFinancialMetricsInputSchema,
    },
    async (args) => runGetFinancialMetrics(ctx, args as GetFinancialMetricsArgs),
  );
}
