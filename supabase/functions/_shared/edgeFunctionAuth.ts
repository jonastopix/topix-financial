/**
 * Edge Function Auth Standard (project-specific)
 * ================================================
 *
 * STATUS: This is the DEFAULT pattern for ALL new edge functions going forward.
 *         Existing functions can be migrated to use these helpers incrementally.
 *
 * BACKGROUND: This repo uses verify_jwt = false for all edge functions in
 * supabase/config.toml. This is a PROJECT-SPECIFIC pattern required by the
 * Supabase signing-keys system — it is NOT a general recommendation.
 *
 * CONSEQUENCE: Because verify_jwt is false, every function MUST perform
 * explicit in-code auth validation BEFORE any service-role reads, writes,
 * or side effects. No exceptions.
 *
 * THREE AUTH BUCKETS:
 *
 * Bucket A — User-triggered functions:
 *   Use authenticateUser(req) → then perform RLS access checks via callerClient
 *   before creating a service-role client for admin operations.
 *
 * Bucket B — Internal / cron / service-role functions:
 *   Use authenticateServiceRole(req) → rejects anything that isn't the
 *   service-role key.
 *
 * Bucket C — External webhook / integration functions:
 *   Each webhook has its own signature scheme (HMAC-SHA256 for Monday.com,
 *   verifyWebhookRequest for auth hooks, etc.). These are NOT generic and
 *   should be implemented per-function. No shared helper applies.
 *
 * INVARIANT: No service-role read/write/side-effect may occur before the
 * auth gate passes. This is enforced by the pattern below and was validated
 * across all existing functions in hardening patches 5–9.
 *
 * USAGE (Bucket A):
 *   const auth = await authenticateUser(req);
 *   if (auth instanceof Response) return auth; // 401
 *   const { callerId, callerClient } = auth;
 *   // Use callerClient for RLS-scoped access checks FIRST
 *   // Then create service-role client only for admin operations
 *
 * USAGE (Bucket B):
 *   const auth = authenticateServiceRole(req);
 *   if (auth instanceof Response) return auth; // 401
 *   // Proceed with service-role operations
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export interface AuthenticatedUser {
  /** The authenticated user's UUID (from JWT sub claim) */
  callerId: string;
  /** The raw Authorization header value */
  authHeader: string;
  /** A Supabase client scoped to the caller's JWT — use for RLS access checks */
  callerClient: SupabaseClient;
}

/**
 * Bucket A: Authenticate a user-triggered edge function request.
 *
 * Validates the Bearer token via getClaims() (NOT getUser — see project knowledge).
 * Returns the caller's identity and a JWT-scoped client for RLS access checks.
 *
 * @returns AuthenticatedUser on success, or a 401 Response on failure.
 */
export async function authenticateUser(
  req: Request
): Promise<AuthenticatedUser | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid authorization" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const token = authHeader.replace("Bearer ", "");

  // Validate JWT signature and extract claims
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
  const callerId = claimsData?.claims?.sub as string | undefined;

  if (claimsError || !callerId) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Create a client scoped to the caller's JWT for RLS access checks
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  return { callerId, authHeader, callerClient };
}

/**
 * Bucket B: Authenticate a service-role / cron / internal request.
 *
 * Compares the Bearer token against SUPABASE_SERVICE_ROLE_KEY.
 * Rejects any request that doesn't carry the service-role key.
 *
 * @returns true on success, or a 401 Response on failure.
 */
export function authenticateServiceRole(req: Request): true | Response {
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(
      JSON.stringify({ error: "Unauthorized — service-role key required" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return true;
}

/** Re-export corsHeaders for convenience */
export { corsHeaders };
