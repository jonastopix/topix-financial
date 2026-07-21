import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEnv, type McpEnv } from "../env";
import { createServiceRoleClient } from "../supabase/client";

export type AccessMode = "service-role" | "user";

/** "all" = unrestricted (phase 1); an array = the caller's allowed company IDs. */
export type CompanyScope = "all" | readonly string[];

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
}

export interface CreateContextOptions {
  actor: string;
  mode: AccessMode;
  companyScope: CompanyScope;
  client: SupabaseClient;
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
 * Internal builder shared by the phase-1 (service-role) and future phase-3
 * (user OAuth) factories. Because tools depend only on AccessContext, the
 * factory can change without touching any tool.
 */
export function createContext(opts: CreateContextOptions): AccessContext {
  const { actor, mode, companyScope, client } = opts;
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
  };
}

/**
 * Phase 1: full-access context built from the service-role key. `dbFor` allows
 * any company (scope "all") but still routes through the same gate a phase-3
 * user context will enforce, so tools are identical across phases. Phase 3 adds
 * a `createUserContext(jwt)` factory here that derives actor/scope/client from
 * validated OAuth claims — without changing this interface or any tool.
 */
export function createServiceRoleContext(env: McpEnv = loadEnv()): AccessContext {
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
    typeof c.dbGlobal === "function"
  );
}
