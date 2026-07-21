export interface McpEnv {
  supabaseUrl: string;
  /**
   * Publishable (anon) key. RLS-safe by design — it carries no privileges of its
   * own; the advisor's rights come from the JWT minted by signInWithPassword.
   */
  publishableKey: string;
  /** Advisor login. Read here, only ever handed to signInWithPassword; never logged. */
  advisorEmail: string;
  advisorPassword: string;
  /**
   * OPTIONAL. The production instance is Lovable-owned (ref loiavmastgeieqyiwyyr),
   * so the service-role key is NOT available to us and is not required. Kept only
   * for the hypothetical future where the instance is migrated to our own Supabase
   * (see createServiceRoleContext). Read passively if present, never demanded.
   */
  serviceRoleKey?: string;
}

// Phase-1 auth pivots to user-JWT (advisor login) because the Lovable-owned prod
// instance exposes no service-role key. These four are the real requirements.
const REQUIRED_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "MCP_ADVISOR_EMAIL",
  "MCP_ADVISOR_PASSWORD",
] as const;

/**
 * Reads the required environment. Throws a clear error naming the missing
 * key(s) — NEVER their values (RECON.md §5: secrets never appear in output).
 * Credentials are read here and only ever handed to the Supabase auth call;
 * they are never logged.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): McpEnv {
  const missing = REQUIRED_KEYS.filter((k) => {
    const v = source[k];
    return v === undefined || v.trim() === "";
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Set them in your local environment (see mcp/.env.example). ` +
        `Advisor credentials must never be committed.`,
    );
  }

  const serviceRoleKey = source.SUPABASE_SERVICE_ROLE_KEY;

  return {
    supabaseUrl: source.SUPABASE_URL as string,
    publishableKey: source.SUPABASE_PUBLISHABLE_KEY as string,
    advisorEmail: source.MCP_ADVISOR_EMAIL as string,
    advisorPassword: source.MCP_ADVISOR_PASSWORD as string,
    ...(serviceRoleKey !== undefined && serviceRoleKey.trim() !== ""
      ? { serviceRoleKey }
      : {}),
  };
}
