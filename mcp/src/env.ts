export interface McpEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
}

const REQUIRED_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

/**
 * Reads the required environment. Throws a clear error naming the missing
 * key(s) — NEVER their values (RECON.md §5: secrets never appear in output).
 * The service-role key is read here and only ever handed to the Supabase
 * client factory; it is never logged.
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
        `The service-role key must never be committed.`,
    );
  }

  return {
    supabaseUrl: source.SUPABASE_URL as string,
    serviceRoleKey: source.SUPABASE_SERVICE_ROLE_KEY as string,
  };
}
