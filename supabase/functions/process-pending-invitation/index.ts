import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT from the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller's JWT using getClaims
    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub as string | undefined;
    if (claimsError || !callerId) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, invite_token } = await req.json();

    // Security: user can only process their own invitation
    if (user_id !== callerId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client for cross-RLS operations
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Resolve the authenticated user's verified email server-side
    // Never trust body.email — only use auth-confirmed email
    const { data: authUser, error: authUserError } =
      await supabase.auth.admin.getUserById(callerId);
    if (authUserError || !authUser?.user) {
      console.error("Failed to resolve auth user:", authUserError);
      return new Response(
        JSON.stringify({ error: "Could not resolve user" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const verifiedEmail = authUser.user.email?.trim().toLowerCase() || null;
    const emailConfirmed = !!authUser.user.email_confirmed_at;

    // 1. Check if user already has a company membership
    const { data: existingMember } = await supabase
      .from("company_members")
      .select("id")
      .eq("user_id", user_id)
      .limit(1)
      .maybeSingle();

    if (existingMember) {
      return new Response(
        JSON.stringify({ success: false, reason: "already_member" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Find pending invitation — token-based first, then verified email fallback
    let invitations: any[] | null = null;

    // Path A: Token-based lookup (works regardless of email confirmation)
    if (invite_token) {
      const { data } = await supabase
        .from("company_invitations")
        .select("id, company_id")
        .eq("status", "pending")
        .eq("token", invite_token)
        .limit(1);
      invitations = data;
    }

    // Path B: Email fallback — requires confirmed/verified email
    if (!invitations || invitations.length === 0) {
      if (!verifiedEmail || !emailConfirmed) {
        // Fail closed: unverified email cannot use email fallback
        return new Response(
          JSON.stringify({ success: false, reason: "no_pending_invitation" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data } = await supabase
        .from("company_invitations")
        .select("id, company_id")
        .eq("status", "pending")
        .eq("email", verifiedEmail)
        .order("created_at", { ascending: false })
        .limit(1);
      invitations = data;
    }

    const invitation = invitations?.[0];
    if (!invitation) {
      return new Response(
        JSON.stringify({ success: false, reason: "no_pending_invitation" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Insert company_members row
    const { error: memberError } = await supabase
      .from("company_members")
      .insert({ company_id: invitation.company_id, user_id, role: "member" });

    if (memberError) {
      console.error("Failed to insert company_member:", memberError);
      return new Response(
        JSON.stringify({ error: "Failed to create membership", detail: memberError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Create conversation
    await supabase
      .from("conversations")
      .insert({ member_id: user_id, company_id: invitation.company_id });

    // 5. Mark invitation as accepted
    await supabase
      .from("company_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    // 6. Get company name
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", invitation.company_id)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        company_id: invitation.company_id,
        company_name: company?.name || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("process-pending-invitation error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
