import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isAccessContext, type AccessContext } from "../access/accessContext";
import { queryWithReauth, type QueryResult } from "../supabase/session";
import { FINANCIAL_REPORTS_COLUMNS, selectList } from "../schema/columns";

export const GET_PARSE_STATUS_TOOL_NAME = "get_parse_status";

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;

// Input schema as a Zod raw shape (the ping convention). The SDK validates args
// against this before the handler runs; the handler re-validates defensively
// because it is pure and directly callable in tests.
export const getParseStatusInputSchema = {
  company_id: z.string().uuid().describe("UUID for selskabet (companies.id)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Antal rækker, nyeste først. Default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.`),
};

// Standalone zod schemas for the handler's own validation, run BEFORE dbFor.
const companyIdSchema = z.string().uuid();
const limitSchema = z.number().int().min(1).max(MAX_LIMIT);

/** Raw row shape as selected via FINANCIAL_REPORTS_COLUMNS (§3.2). */
interface ParseStatusRow {
  id: string;
  company_id: string;
  file_name: string | null;
  report_type: string | null;
  report_period: string | null;
  status: string | null;
  validation_status: string | null;
  validation_errors: string[] | null;
  uploaded_at: string | null;
  processed_at: string | null;
  manual_override_status: string | null;
  deleted_at: string | null;
}

/**
 * The 10 agreed output fields. `company_id` and `deleted_at` are fetched (they
 * drive scoping and the soft-delete filter) but deliberately NOT echoed per row.
 */
export interface ParseStatusReport {
  id: string;
  file_name: string | null;
  report_type: string | null;
  report_period: string | null;
  status: string | null; // processing | processed | error (§3.2 CHECK)
  validation_status: string | null;
  validation_errors: string[] | null; // text[] (§3.2)
  uploaded_at: string | null;
  processed_at: string | null;
  manual_override_status: string | null; // draft | applied (§3.2)
}

export interface ParseStatusResult {
  company_id: string;
  count: number;
  reports: ParseStatusReport[];
}

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
}

export interface GetParseStatusArgs {
  company_id: string;
  limit?: number;
}

/** Explicit row → output mapping; never spreads the raw row. */
export function toParseStatusReport(row: ParseStatusRow): ParseStatusReport {
  return {
    id: row.id,
    file_name: row.file_name ?? null,
    report_type: row.report_type ?? null,
    report_period: row.report_period ?? null,
    status: row.status ?? null,
    validation_status: row.validation_status ?? null,
    validation_errors: row.validation_errors ?? null,
    uploaded_at: row.uploaded_at ?? null,
    processed_at: row.processed_at ?? null,
    manual_override_status: row.manual_override_status ?? null,
  };
}

/**
 * Handler. Refuses to run without a valid AccessContext, and validates inputs
 * BEFORE ctx.dbFor is touched. Single-tenant lookup: dbFor's scope gate is
 * defence-in-depth; the explicit .eq("company_id") is the actual filter,
 * because the advisor JWT's RLS sees every company (§3.2 policies).
 */
export async function runGetParseStatus(
  ctx: AccessContext,
  args: GetParseStatusArgs,
): Promise<ToolResult> {
  if (!isAccessContext(ctx)) {
    throw new Error("get_parse_status requires a valid AccessContext");
  }

  const parsedId = companyIdSchema.safeParse(args?.company_id);
  if (!parsedId.success) {
    throw new Error("get_parse_status requires company_id as a UUID");
  }
  const companyId = parsedId.data;

  let limit = DEFAULT_LIMIT;
  if (args?.limit !== undefined) {
    const parsedLimit = limitSchema.safeParse(args.limit);
    if (!parsedLimit.success) {
      throw new Error(
        `get_parse_status limit must be an integer between 1 and ${MAX_LIMIT}`,
      );
    }
    limit = parsedLimit.data;
  }

  const res = await queryWithReauth<ParseStatusRow>(
    ctx,
    () =>
      ctx
        .dbFor(companyId)
        .from("financial_reports")
        .select(selectList(FINANCIAL_REPORTS_COLUMNS))
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false })
        .limit(limit) as unknown as PromiseLike<QueryResult<ParseStatusRow>>,
  );
  if (res.error) {
    console.error(
      `[boardroom-mcp] get_parse_status query failed: ${res.error.message}`,
    );
    throw new Error("Failed to load parse status");
  }

  const reports = (res.data ?? []).map(toParseStatusReport);
  const result: ParseStatusResult = {
    company_id: companyId,
    count: reports.length,
    reports,
  };
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

export function registerGetParseStatus(
  server: McpServer,
  ctx: AccessContext,
): void {
  server.registerTool(
    GET_PARSE_STATUS_TOOL_NAME,
    {
      title: "Parse status",
      description:
        "Latest financial report uploads for one company with parse status " +
        "(processing/processed/error) and validation status. Soft-deleted " +
        "uploads are excluded. Newest first; default 10, max 50. " +
        "System-generated baseline sentinel rows (file_name prefix " +
        "'_annual_baseline_sentinel_') may appear and can be ignored for " +
        "status purposes.",
      inputSchema: getParseStatusInputSchema,
    },
    async (args) => runGetParseStatus(ctx, args as GetParseStatusArgs),
  );
}
