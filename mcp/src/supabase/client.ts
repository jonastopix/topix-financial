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
