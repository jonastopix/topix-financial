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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Try to extract caller identity from JWT if available
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    let callerId: string | undefined;

    if (token) {
      const authClient = createClient(supabaseUrl, anonKey);
      try {
        const { data: claimsData } = await authClient.auth.getClaims(token);
        callerId = claimsData?.claims?.sub as string | undefined;
      } catch {
        // getClaims failed — try getUser as fallback
        const { data: userData } = await authClient.auth.getUser(token);
        callerId = userData?.user?.id;
      }
    }

    const { user_id, invite_token } = await req.json();

    // If we got a valid caller, enforce identity match
    // If no valid caller (e.g. during signup flow), verify user exists via admin API
    if (callerId) {
      if (user_id !== callerId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Use service role client for cross-RLS operations
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify the user_id actually exists in auth
    const { data: authUser, error: authUserError } =
      await supabase.auth.admin.getUserById(user_id);
    if (authUserError || !authUser?.user) {
      return new Response(JSON.stringify({ error: "Invalid user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
