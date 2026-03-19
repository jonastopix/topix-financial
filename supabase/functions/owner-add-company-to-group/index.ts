import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Bucket A: authenticate caller
    const auth = await authenticateUser(req);
    if (auth instanceof Response) return auth;
    const { callerClient } = auth;

    // Parse body
    const body = await req.json();
    const { group_id, company_name, cvr_number } = body;

    if (!group_id) {
      return new Response(
        JSON.stringify({ error: "group_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!company_name || typeof company_name !== "string") {
      return new Response(
        JSON.stringify({ error: "company_name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call RPC via callerClient (RPC uses auth.uid() internally)
    const { data, error } = await callerClient.rpc("owner_add_company_to_group", {
      _group_id: group_id,
      _company_name: company_name,
      _cvr_number: cvr_number || null,
    });

    if (error) {
      console.error("owner_add_company_to_group RPC error:", error);
      const msg = error.message || "Unknown error";

      // Map RPC exceptions to HTTP status codes
      if (msg.includes("Kun ejeren") || msg.includes("Ikke autentificeret")) {
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (msg.includes("CVR") && msg.includes("findes allerede")) {
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Validation errors (empty name, CVR length)
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("owner-add-company-to-group error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
