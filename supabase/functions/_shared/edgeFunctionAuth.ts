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
 * FASE 3a, TRIN 1 (1/10-2026, docs/prod-hjem-plan.md): legacy-nøglerne
 * slettes «Late 2026, TBC». authenticateServiceRole har derfor fået en
 * ANDEN vej ind: `apikey` (eller `Authorization: Bearer sb_secret_…`), der
 * i KONSTANT TID er lig runtimens SUPABASE_SERVICE_ROLE_KEY og har formen
 * sb_secret_… Role-claim-vejen er UÆNDRET, og invarianten ovenfor gælder
 * stadig fuldt ud: trin 1 ændrer ingen verify_jwt. Dommen bor ren i
 * _shared/serviceNoegle.ts (vitest: src/lib/__tests__/serviceNoegle.test.ts).
 * Trin 2 (verify_jwt = false + «kun nøgle», pr. function) er IKKE bygget.
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
import { domServiceRole, parseJwtClaims } from "./serviceNoegle.ts";

// parseJwtClaims bor nu i serviceNoegle.ts (ren, testbar) — re-eksporteret
// her uændret, så eksisterende imports (generate-weekly-focus) står.
export { parseJwtClaims };

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

/** Runtimens SUPABASE_SERVICE_ROLE_KEY — eller undefined, hvis den ikke kan
 *  læses (fx `deno test` uden --allow-env). undefined lukker nøglevejen
 *  (fail-closed); role-claim-vejen er upåvirket. */
function laesRuntimeNoegle(): string | undefined {
  try {
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  } catch {
    return undefined;
  }
}

/**
 * Bucket B: Autentificér et service-role-/cron-/internt kald.
 *
 * To veje (dommen: domServiceRole i serviceNoegle.ts):
 *   1. Nøglen (fase 3a, trin 1): `apikey` eller `Bearer sb_secret_…`,
 *      konstant-tids-lig runtimens SUPABASE_SERVICE_ROLE_KEY (sb_secret-form
 *      på begge sider).
 *   2. Role-claimet (uændret): Bearer-token med role = "service_role".
 *      Signaturen verificeres af gatewayen — se INVARIANT i fil-headeren.
 * En forkert nøgle afvises ikke i sig selv; den falder igennem til vej 2,
 * så trin 1 ikke ændrer svaret for nogen kalder, der virker i dag.
 *
 * 401 = intet eller ugyldigt Bearer-token (og ingen gyldig nøgle).
 * 403 = gyldigt token, forkert rolle. Adskillelsen er bevidst: en
 *       tvetydig 401 kostede en times fejlsøgning 10-08-2026.
 *
 * @returns true ved succes, ellers en 401/403 Response.
 */
export function authenticateServiceRole(req: Request): true | Response {
  const dom = domServiceRole(req.headers, laesRuntimeNoegle());
  if (dom.ok) return true;
  return new Response(
    JSON.stringify({ error: dom.error }),
    { status: dom.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/** Re-export corsHeaders for convenience */
export { corsHeaders };
