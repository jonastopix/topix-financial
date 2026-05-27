import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  // Caller-authz: must be advisor (admin inherits via has_role). The frontend
  // route is AdvisorRoute-guarded, but a valid JWT can hit this edge function
  // directly — server-side gate closes that path.
  const { data: callerIsAdvisor, error: callerRoleError } = await callerClient.rpc(
    "has_role",
    { _user_id: callerId, _role: "advisor" }
  );
  if (callerRoleError || !callerIsAdvisor) {
    console.warn("[attach-user-to-company] caller not advisor", { callerId });
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { email: rawEmail, company_id } = await req.json();
  if (!rawEmail || !company_id) {
    return new Response(JSON.stringify({ error: "email and company_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const email = String(rawEmail).trim().toLowerCase();

  // Find auth user by email — supabase-js v2 has no getUserByEmail, so paginate listUsers.
  let userId: string | null = null;
  try {
    let page = 1;
    const perPage = 200;
    // Cap at 10 pages = 2000 users (safety net)
    while (page <= 10) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      const match = data?.users?.find((u) => (u.email || "").toLowerCase() === email);
      if (match) { userId = match.id; break; }
      if (!data?.users || data.users.length < perPage) break;
      page += 1;
    }
  } catch (err) {
    console.error("[attach-user-to-company] listUsers failed:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ ok: false, error: "Failed to look up user" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: "User not found" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Target-protection: never attach an advisor/admin to a company. A
  // company_members row makes user_company_id() resolve to that company for
  // the advisor, which breaks the advisor-bypass model — ownCompanyId in
  // useAuth.tsx:113 falls back from null to the injected company, and the
  // `if (isAdvisor && !companyId)` advisor-view guards across 6 routes
  // (Index, Milestones, Reports, KPIs, Handouts, Budget) start sending
  // advisors into member-view. Advisors are never the legitimate target of
  // this flow — customer accounts are.
  const { data: targetRoles, error: targetRoleError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["advisor", "admin"]);
  if (targetRoleError) {
    console.error("[attach-user-to-company] target role lookup failed:", targetRoleError);
    return new Response(JSON.stringify({ ok: false, error: "Role lookup failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (targetRoles && targetRoles.length > 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "Cannot attach an advisor or admin to a company" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Check not already a member of any company. Use .limit(1) instead of
  // .maybeSingle() so 2+ existing rows can't fall through to INSERT —
  // maybeSingle returns data=null on PGRST116 (multi-row), which the prior
  // code misread as "no existing membership".
  const { data: existing, error: existingError } = await adminClient
    .from("company_members")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (existingError) {
    console.error("[attach-user-to-company] membership check failed:", existingError);
    return new Response(JSON.stringify({ ok: false, error: "Membership check failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (existing && existing.length > 0) {
    return new Response(JSON.stringify({ ok: false, error: "User already has a company" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Attach to company
  const { error: memberErr } = await adminClient
    .from("company_members")
    .insert({ company_id, user_id: userId, role: "member" });

  if (memberErr) {
    return new Response(JSON.stringify({ ok: false, error: memberErr.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Create conversation if not exists
  const { data: existingConv } = await adminClient
    .from("conversations")
    .select("id")
    .eq("company_id", company_id)
    .maybeSingle();

  if (!existingConv) {
    await adminClient.from("conversations").insert({
      member_id: userId,
      company_id,
    });
  }

  // Mark any pending invitations as accepted
  await adminClient
    .from("company_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq("company_id", company_id)
    .eq("email", email)
    .eq("status", "pending");

  console.log(`[attach-user-to-company] Attached ${email} (user_id=${userId}) to company ${company_id}`);

  return new Response(JSON.stringify({ ok: true, user_id: userId }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
