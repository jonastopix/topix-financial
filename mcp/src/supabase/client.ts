import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Mirrors the canonical edge-function pattern (RECON.md §2, run-weekly-agent):
 * a service-role client with session persistence disabled. The service-role key
 * bypasses RLS, so this client is only ever handed out through AccessContext's
 * gated dbFor() / dbGlobal() — a tool must never call this factory directly.
 */
export function createServiceRoleClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Phase-1 caller-scoped client (RECON.md §2, `callerClient`): the publishable
 * key carries no privileges — the advisor's access is minted by
 * signInWithPassword and enforced by RLS. `persistSession: false` keeps no token
 * on disk (only in process memory); `autoRefreshToken: true` keeps the access
 * token fresh for the life of this long-lived stdio process. Handed out only
 * through AccessContext's gated dbFor()/dbGlobal() — a tool never calls this.
 */
export function createAdvisorClient(
  supabaseUrl: string,
  publishableKey: string,
): SupabaseClient {
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
}
