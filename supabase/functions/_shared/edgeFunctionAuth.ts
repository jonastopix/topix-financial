/**
 * Edge Function Auth Standard (project-specific)
 * ================================================
 *
 * STATUS: This is the DEFAULT pattern for ALL new edge functions going forward.
 *         Existing functions can be migrated to use these helpers incrementally.
 *
 * BACKGROUND: Gatewayen validerer JWT-signaturen for funktioner med
 * verify_jwt = true i supabase/config.toml, og validerer INTET for
 * funktioner uden blok eller med false. Begge dele er bevist i
 * produktion 10-08-2026.
 *
 * CONSEQUENCE: SUPABASE_SERVICE_ROLE_KEY i edge-runtime er en
 * sb_secret-nøgle (41 tegn), mens cron sender en legacy-JWT (219
 * tegn). En streng-sammenligning mellem de to kan ALDRIG bestå.
 * Bucket B bruger derfor role-claimet og lader gatewayen bære
 * signaturtjekket.
 *
 * INVARIANT: Enhver funktion der bruger authenticateServiceRole SKAL
 * have verify_jwt = true i supabase/config.toml. Uden det er
 * role-claimet uverificeret og kan forfalskes af hvem som helst.
 * Håndhæves af scripts/check-verify-jwt-invariant.ts.
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
 * Læser claims ud af en JWT UDEN at verificere signaturen.
 * Må kun bruges bag verify_jwt = true. Se INVARIANT i fil-headeren.
 */
export function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Bucket B: Autentificér et service-role-/cron-/internt kald.
 *
 * Kræver et Bearer-token hvis role-claim er "service_role".
 * Signaturen verificeres af gatewayen — se INVARIANT i fil-headeren.
 *
 * 401 = intet eller ugyldigt Bearer-token.
 * 403 = gyldigt token, forkert rolle. Adskillelsen er bevidst: en
 *       tvetydig 401 kostede en times fejlsøgning 10-08-2026.
 *
 * @returns true ved succes, ellers en 401/403 Response.
 */
export function authenticateServiceRole(req: Request): true | Response {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized — service-role key required" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const claims = parseJwtClaims(authHeader.slice("Bearer ".length).trim());
  if (!claims) {
    return new Response(
      JSON.stringify({ error: "Unauthorized — service-role key required" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (claims.role !== "service_role") {
    return new Response(
      JSON.stringify({ error: "Forbidden — service-role required" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return true;
}

/** Re-export corsHeaders for convenience */
export { corsHeaders };
