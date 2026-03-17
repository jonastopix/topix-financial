import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Bucket A: authenticate the caller
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  // Gate: only advisors/admins may create groups
  const { data: roleRows } = await callerClient
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .in("role", ["advisor", "admin"]);

  if (!roleRows || roleRows.length === 0) {
    return new Response(
      JSON.stringify({ error: "Only advisors or admins can create groups" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { group_name, companies } = await req.json();

    // Input validation
    if (!group_name || typeof group_name !== "string" || group_name.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "group_name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(companies)) {
      return new Response(
        JSON.stringify({ error: "companies must be an array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate each company entry
    for (const comp of companies) {
      if (comp.mode === "create") {
        if (!comp.name || typeof comp.name !== "string" || comp.name.trim().length === 0) {
          return new Response(
            JSON.stringify({ error: "Each create company must have a name" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else if (comp.mode === "attach") {
        if (!comp.company_id || typeof comp.company_id !== "string") {
          return new Response(
            JSON.stringify({ error: "Each attach company must have a company_id" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ error: `Invalid company mode: ${comp.mode}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Call create_group RPC via service-role client (REVOKE prevents caller-scoped access)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await adminClient.rpc("create_group", {
      _caller_id: callerId,
      _group_name: group_name.trim(),
      _companies: companies,
    });

    if (error) {
      console.error("create_group RPC error:", error);
      const status = error.message?.includes("not enabled") ? 403
        : error.message?.includes("already belongs") ? 409
        : 400;
      return new Response(
        JSON.stringify({ error: error.message }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-group error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
