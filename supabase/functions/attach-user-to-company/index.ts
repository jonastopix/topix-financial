import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;

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

  // Check not already a member of any company
  const { data: existing } = await adminClient
    .from("company_members")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
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
