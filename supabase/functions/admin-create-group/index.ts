import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Bucket A: authenticate caller
    const auth = await authenticateUser(req);
    if (auth instanceof Response) return auth;
    const { callerId, callerClient } = auth;

    // Verify caller is admin via RLS-scoped query
    const { data: roles } = await callerClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const isAdmin = (roles || []).some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: admin role required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse body
    const body = await req.json();
    const { group_name, anchor_company_id, company_ids, members, advisors } = body;

    // Basic input validation
    if (!group_name || typeof group_name !== "string" || group_name.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "group_name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!anchor_company_id) {
      return new Response(
        JSON.stringify({ error: "anchor_company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!Array.isArray(members) || members.length === 0) {
      return new Response(
        JSON.stringify({ error: "members array is required and must not be empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call admin_create_group RPC via service-role client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await adminClient.rpc("admin_create_group", {
      _caller_id: callerId,
      _group_name: group_name.trim(),
      _anchor_company_id: anchor_company_id,
      _company_ids: company_ids || [],
      _member_entries: members,
      _advisor_ids: advisors || [],
    });

    if (error) {
      console.error("admin_create_group RPC error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("admin-create-group error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
