import type { PostgrestError } from "@supabase/supabase-js";
import type { AccessContext } from "../access/accessContext";

export interface QueryResult<T> {
  data: T[] | null;
  error: PostgrestError | null;
}

/**
 * Best-effort detection of an expired-JWT PostgREST error. PostgREST returns
 * code "PGRST301" for an expired/invalid JWT; we also match a "jwt … expired"
 * message as a fallback in case the code shape drifts.
 */
export function isJwtExpired(error: PostgrestError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST301") return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("jwt") && msg.includes("expired");
}

/**
 * Runs a query and, on a mid-flight JWT expiry, re-authenticates ONCE and
 * retries exactly once (choice (a), Sprint 2). `run` is a THUNK that rebuilds
 * and executes the query — PostgREST builders cannot be re-awaited, so the retry
 * must construct a fresh query. Contexts without `reauthenticate` (service-role)
 * never retry: the original result (error and all) is returned unchanged.
 */
export async function queryWithReauth<T>(
  ctx: Pick<AccessContext, "reauthenticate">,
  run: () => PromiseLike<QueryResult<T>>,
): Promise<QueryResult<T>> {
  const first = await run();
  if (!isJwtExpired(first.error) || !ctx.reauthenticate) {
    return first;
  }
  console.error("[boardroom-mcp] JWT expired mid-flight; re-authenticating once");
  await ctx.reauthenticate();
  return run(); // exactly one retry — no loop
}
