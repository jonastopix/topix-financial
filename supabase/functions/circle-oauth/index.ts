import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("CIRCLE_OAUTH_CLIENT_ID")!;
  const clientSecret = Deno.env.get("CIRCLE_OAUTH_CLIENT_SECRET")!;

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // ── /authorize ──────────────────────────────────────────────────────────────
  if (path.endsWith("/authorize")) {
    const params = url.searchParams;
    const reqClientId = params.get("client_id");
    const redirectUri = params.get("redirect_uri");
    const state = params.get("state") ?? "";

    if (reqClientId !== clientId) return json({ error: "invalid_client" }, 400);
    if (!redirectUri) return json({ error: "missing redirect_uri" }, 400);

    // Read Supabase auth cookie
    const cookieHeader = req.headers.get("cookie") ?? "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c) => {
        const [k, ...v] = c.trim().split("=");
        return [k, v.join("=")];
      })
    );

    const authCookieKey = Object.keys(cookies).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
    );
    let accessToken: string | null = null;
    if (authCookieKey) {
      try {
        const parsed = JSON.parse(decodeURIComponent(cookies[authCookieKey]));
        accessToken = parsed?.access_token ?? null;
      } catch {
        accessToken = null;
      }
    }

    const authorizeUrl = new URL(req.url);
    const fullAuthorizeUrl = authorizeUrl.toString();
    const LOGIN_URL = `https://topix.lovable.app/auth?returnUrl=${encodeURIComponent(fullAuthorizeUrl)}`;

    if (!accessToken) return redirect(LOGIN_URL);

    const userClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await userClient.auth.getUser(accessToken);
    if (userErr || !userData?.user) return redirect(LOGIN_URL);

    const user = userData.user;
    const code = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error: insertErr } = await admin.from("circle_oauth_codes").insert({
      code,
      user_id: user.id,
      email: user.email!,
      expires_at: expiresAt,
    });

    if (insertErr) {
      console.error("[circle-oauth/authorize] insert failed:", insertErr);
      return json({ error: "server_error" }, 500);
    }

    const dest = new URL(redirectUri);
    dest.searchParams.set("code", code);
    if (state) dest.searchParams.set("state", state);
    return redirect(dest.toString());
  }

  // ── /token ───────────────────────────────────────────────────────────────────
  if (path.endsWith("/token")) {
    let body: URLSearchParams;
    try {
      const text = await req.text();
      body = new URLSearchParams(text);
    } catch {
      return json({ error: "invalid_request" }, 400);
    }

    const reqClientId = body.get("client_id");
    const reqClientSecret = body.get("client_secret");
    const code = body.get("code");

    if (reqClientId !== clientId || reqClientSecret !== clientSecret) {
      return json({ error: "invalid_client" }, 401);
    }
    if (!code) return json({ error: "invalid_request" }, 400);

    const { data: row, error: fetchErr } = await admin
      .from("circle_oauth_codes")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (fetchErr || !row) return json({ error: "invalid_grant" }, 400);
    if (new Date(row.expires_at) < new Date()) {
      await admin.from("circle_oauth_codes").delete().eq("code", code);
      return json({ error: "invalid_grant", error_description: "Code expired" }, 400);
    }

    await admin.from("circle_oauth_codes").delete().eq("code", code);

    const token = crypto.randomUUID();
    await admin.from("circle_oauth_tokens").insert({
      token,
      user_id: row.user_id,
      email: row.email,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    return json({ access_token: token, token_type: "bearer", expires_in: 3600 });
  }

  // ── /me ──────────────────────────────────────────────────────────────────────
  if (path.endsWith("/me")) {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^bearer\s+/i, "");
    if (!token) return json({ error: "missing_token" }, 401);

    const { data: row, error: fetchErr } = await admin
      .from("circle_oauth_tokens")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (fetchErr || !row) return json({ error: "invalid_token" }, 401);
    if (new Date(row.expires_at) < new Date()) {
      await admin.from("circle_oauth_tokens").delete().eq("token", token);
      return json({ error: "invalid_token" }, 401);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("user_id", row.user_id)
      .maybeSingle();

    return json({
      id: row.email,
      email: row.email,
      name: profile?.full_name ?? row.email,
      avatar_url: profile?.avatar_url ?? null,
    });
  }

  return json({ error: "not_found" }, 404);
});
