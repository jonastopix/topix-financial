import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isAccessContext, type AccessContext } from "../access/accessContext";
import { queryWithReauth } from "../supabase/session";
import {
  COMPANIES_COLUMNS,
  COMPANY_OVERVIEW_FACTS_COLUMNS,
  selectList,
} from "../schema/columns";

export const GET_COMPANY_OVERVIEW_TOOL_NAME = "get_company_overview";

// No inputs: phase 1 lists ALL companies with `status` visible (no status
// filter — a status filter may become an input parameter later).
export const getCompanyOverviewInputSchema = {};

interface CompanyRow {
  id: string;
  name: string;
  status: string | null;
}

interface OverviewFactRow {
  company_id: string;
  period_key: string;
}

export interface CompanyOverview {
  id: string;
  name: string;
  status: string | null;
  latest_committed_period_key: string | null;
  committed_period_count: number;
}

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
}

/**
 * Pure aggregation (strategy C, design (1)): join companies with their facts in
 * code — two flat queries, no N+1. Latest = max(period_key) via string compare
 * (YYYY-MM is lexically chronological, §3.3). Companies with no committed facts
 * get null/0 (the left-join semantic — 18 of 40 in prod, the main scenario).
 */
export function aggregateOverview(
  companies: readonly CompanyRow[],
  facts: readonly OverviewFactRow[],
): CompanyOverview[] {
  const byCompany = new Map<string, { latest: string | null; count: number }>();
  for (const f of facts) {
    if (
      !f ||
      typeof f.company_id !== "string" ||
      typeof f.period_key !== "string"
    ) {
      continue;
    }
    const cur = byCompany.get(f.company_id) ?? { latest: null, count: 0 };
    cur.count += 1;
    if (cur.latest === null || f.period_key > cur.latest) {
      cur.latest = f.period_key;
    }
    byCompany.set(f.company_id, cur);
  }

  return companies.map((c) => {
    const agg = byCompany.get(c.id) ?? { latest: null, count: 0 };
    return {
      id: c.id,
      name: c.name,
      status: c.status ?? null,
      latest_committed_period_key: agg.latest,
      committed_period_count: agg.count,
    };
  });
}

/**
 * Handler. Refuses to run without a valid AccessContext. Two cross-tenant reads
 * through selectAcrossTenants (scope enforced inside the accessor), each wrapped
 * in queryWithReauth. PostgrestError → stderr; a neutral error is surfaced.
 */
export async function runGetCompanyOverview(ctx: AccessContext): Promise<ToolResult> {
  if (!isAccessContext(ctx)) {
    throw new Error("get_company_overview requires a valid AccessContext");
  }

  const companiesRes = await queryWithReauth<CompanyRow>(ctx, () =>
    ctx.selectAcrossTenants<CompanyRow>(
      "companies",
      selectList(COMPANIES_COLUMNS),
      "id",
    ),
  );
  if (companiesRes.error) {
    console.error(
      `[boardroom-mcp] get_company_overview companies query failed: ${companiesRes.error.message}`,
    );
    throw new Error("Failed to load company overview");
  }

  const factsRes = await queryWithReauth<OverviewFactRow>(ctx, () =>
    ctx.selectAcrossTenants<OverviewFactRow>(
      "financial_report_facts",
      selectList(COMPANY_OVERVIEW_FACTS_COLUMNS),
      "company_id",
    ),
  );
  if (factsRes.error) {
    console.error(
      `[boardroom-mcp] get_company_overview facts query failed: ${factsRes.error.message}`,
    );
    throw new Error("Failed to load company overview");
  }

  const overview = aggregateOverview(companiesRes.data ?? [], factsRes.data ?? []);
  return { content: [{ type: "text", text: JSON.stringify(overview) }] };
}

export function registerGetCompanyOverview(
  server: McpServer,
  ctx: AccessContext,
): void {
  server.registerTool(
    GET_COMPANY_OVERVIEW_TOOL_NAME,
    {
      title: "Company overview",
      description:
        "Lists every company with its status, its latest committed period_key, " +
        "and its committed-period count. Advisor-scoped (all companies in phase 1).",
      inputSchema: getCompanyOverviewInputSchema,
    },
    async () => runGetCompanyOverview(ctx),
  );
}
