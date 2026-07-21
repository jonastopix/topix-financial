import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { loadEnv, type McpEnv } from "../env";
import { createAdvisorClient, createServiceRoleClient } from "../supabase/client";

export type AccessMode = "service-role" | "user";

/** "all" = unrestricted (phase 1); an array = the caller's allowed company IDs. */
export type CompanyScope = "all" | readonly string[];

/**
 * The chainable, awaitable query object returned by selectAcrossTenants — a
 * structural subset of PostgREST's filter builder. Awaiting it yields the usual
 * `{ data, error }`; `.in/.order/.eq` allow further chaining before the await.
 */
export interface TenantQuery<T = unknown>
  extends PromiseLike<{ data: T[] | null; error: PostgrestError | null }> {
  in(column: string, values: readonly string[]): TenantQuery<T>;
  order(column: string, options?: { ascending?: boolean }): TenantQuery<T>;
  eq(column: string, value: unknown): TenantQuery<T>;
}

/**
 * The single gateway between a tool and the database. Tools depend ONLY on this
 * interface — never on process.env or createClient directly (RECON.md §2/§5),
 * which makes it structurally impossible to query outside the context layer.
 */
export interface AccessContext {
  readonly actor: string;
  readonly mode: AccessMode;
  readonly companyScope: CompanyScope;

  /**
   * The ONLY accessor for a tenant-scoped table (any table with a company_id,
   * RECON.md §3). Runs the tenant gate internally and throws if `companyId` is
   * empty or outside this context's scope — the assertion cannot be forgotten
   * because there is no ungated tenant accessor.
   */
  dbFor(companyId: string): SupabaseClient;

  /**
   * ONLY for tables that have NO company_id column — e.g. email_send_log,
   * email_send_state, suppressed_emails (RECON.md §3.5). There is no implicit
   * tenant scope here: the calling tool MUST scope results manually (e.g.
   * recipient_email → company_members). Never use this for a tenant table.
   */
  dbGlobal(): SupabaseClient;

  /**
   * The ONLY legal way to LIST ACROSS tenant tables. Builds
   * from(table).select(columns) and, when companyScope is a list, applies
   * `.in(companyIdColumn, scope)` ITSELF before returning — so cross-tenant
   * scoping is structural, never a step a tool can forget (unlike a raw
   * cross-tenant client + a separate scope helper). Under scope "all" the filter
   * is a no-op and advisor RLS is the gate. `companyIdColumn` is the tenant key
   * of `table` — "company_id" for most tenant tables, "id" for `companies`
   * itself. Returns the filter builder for further chaining (.order/.eq/...).
   */
  selectAcrossTenants<T = unknown>(
    table: string,
    columns: string,
    companyIdColumn: string,
  ): TenantQuery<T>;

  /**
   * Present ONLY on contexts that own a refreshable session (advisor mode):
   * re-establishes the session on the same client. Used by queryWithReauth for a
   * single retry on JWT expiry. Absent on service-role contexts.
   */
  reauthenticate?: () => Promise<void>;
}

export interface CreateContextOptions {
  actor: string;
  mode: AccessMode;
  companyScope: CompanyScope;
  client: SupabaseClient;
  reauthenticate?: () => Promise<void>;
}

/** Private gate. Not exposed as a standalone method, so it cannot be bypassed. */
function assertCompanyAccess(scope: CompanyScope, companyId: string): void {
  if (typeof companyId !== "string" || companyId.trim() === "") {
    throw new Error("dbFor requires a non-empty companyId");
  }
  if (scope === "all") return;
  if (!scope.includes(companyId)) {
    throw new Error(`Company ${companyId} is outside the caller's access scope`);
  }
}

/**
 * Internal builder shared by every factory — the phase-1 advisor login
 * (createAdvisorContext) and the preserved service-role path
 * (createServiceRoleContext). Because tools depend only on AccessContext, the
 * factory can change without touching any tool.
 */
export function createContext(opts: CreateContextOptions): AccessContext {
  const { actor, mode, companyScope, client, reauthenticate } = opts;
  return {
    actor,
    mode,
    companyScope,
    dbFor(companyId: string): SupabaseClient {
      assertCompanyAccess(companyScope, companyId);
      return client;
    },
    dbGlobal(): SupabaseClient {
      return client;
    },
    selectAcrossTenants<T = unknown>(
      table: string,
      columns: string,
      companyIdColumn: string,
    ): TenantQuery<T> {
      const query = client.from(table).select(columns);
      // Scope is applied HERE, inside the accessor — a tool cannot skip it.
      const scoped =
        companyScope === "all" ? query : query.in(companyIdColumn, companyScope);
      return scoped as unknown as TenantQuery<T>;
    },
    ...(reauthenticate ? { reauthenticate } : {}),
  };
}

/**
 * Phase-1 auth (pivoted): logs in as the advisor via signInWithPassword using
 * the publishable key, then wraps the caller-scoped client in an AccessContext.
 *
 * Because the client carries a real advisor JWT, **RLS is the true enforcement**
 * (advisor policies → SELECT on all tenant tables, RECON.md §3). `companyScope:
 * "all"` lets the dbFor gate pass every company_id through — that gate is
 * defence-in-depth layered on top of RLS, not the primary control.
 *
 * Session handling (Sprint 2, choice (a)): the access token is refreshed in the
 * background by the SDK (autoRefreshToken). A hard session loss (refresh token
 * expired) is handled by RESTARTING the server — login happens on startup. An
 * in-flight JWT expiry is caught by queryWithReauth (supabase/session.ts), which
 * calls the `reauthenticate` closure below for a single retry.
 *
 * NOTE (pre-Sprint-4 decision point): this authenticates as Jonas' personal
 * advisor account. Acceptable for read-only Sprint 2, but before the writing
 * tools (Sprint 4) switch to a dedicated MCP-advisor user for auditability,
 * independent rotation, and a separate kill switch.
 */
export async function createAdvisorContext(
  env: McpEnv = loadEnv(),
): Promise<AccessContext> {
  const client = createAdvisorClient(env.supabaseUrl, env.publishableKey);

  const { data, error } = await client.auth.signInWithPassword({
    email: env.advisorEmail,
    password: env.advisorPassword,
  });

  if (error || !data?.user) {
    // Raw detail (which may echo the attempted email) goes to stderr only; the
    // thrown message is neutral and never carries the email or password.
    console.error(
      `[boardroom-mcp] advisor sign-in failed: ${error?.message ?? "no user returned"}`,
    );
    throw new Error("Advisor authentication failed");
  }

  // Single-retry re-auth for queryWithReauth: re-signs in on the SAME client, so
  // the token dbFor/selectAcrossTenants hand out is refreshed in place. Neutral
  // thrown message; raw cause only to stderr.
  const reauthenticate = async (): Promise<void> => {
    const { error: reErr } = await client.auth.signInWithPassword({
      email: env.advisorEmail,
      password: env.advisorPassword,
    });
    if (reErr) {
      console.error(`[boardroom-mcp] advisor re-auth failed: ${reErr.message}`);
      throw new Error("Advisor re-authentication failed");
    }
  };

  return createContext({
    actor: `user:${data.user.id}`,
    mode: "user",
    companyScope: "all",
    client,
    reauthenticate,
  });
}

/**
 * UNUSABLE against the Lovable-owned production instance (ref
 * loiavmastgeieqyiwyyr): the service-role key is not available to us, so
 * env.serviceRoleKey is absent and this throws. Kept for the hypothetical future
 * where the instance is migrated to our own Supabase — the gate and every tool
 * stay identical, so only the factory would be swapped back. Phase-1 uses
 * createAdvisorContext instead.
 */
export function createServiceRoleContext(env: McpEnv = loadEnv()): AccessContext {
  if (!env.serviceRoleKey) {
    throw new Error(
      "createServiceRoleContext is unavailable: no service-role key (the " +
        "production instance is Lovable-owned). Use createAdvisorContext.",
    );
  }
  const client = createServiceRoleClient(env.supabaseUrl, env.serviceRoleKey);
  return createContext({
    actor: "service-role:local",
    mode: "service-role",
    companyScope: "all",
    client,
  });
}

/** Runtime guard used by tools to refuse execution without a valid context. */
export function isAccessContext(value: unknown): value is AccessContext {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Partial<AccessContext>;
  return (
    typeof c.actor === "string" &&
    c.actor.length > 0 &&
    (c.mode === "service-role" || c.mode === "user") &&
    typeof c.dbFor === "function" &&
    typeof c.dbGlobal === "function" &&
    typeof c.selectAcrossTenants === "function"
  );
}
