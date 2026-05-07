import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId } = auth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Only advisors and admins can upgrade
  const { data: roleRows } = await adminClient
    .from("user_roles").select("role").eq("user_id", callerId)
    .in("role", ["advisor", "admin"]).limit(1);
  if (!roleRows || roleRows.length === 0) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { user_id, company_name, industry_label, cvr_number } = await req.json();
  if (!user_id) {
    return new Response(JSON.stringify({ error: "user_id is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Find enrollment
    const { data: enrollment, error: enrollError } = await adminClient
      .from("legat_enrollments")
      .select("id, company_id, status")
      .eq("user_id", user_id)
      .single();
    if (enrollError || !enrollment) throw new Error("Enrollment not found");
    if (enrollment.status === "upgraded") throw new Error("Already upgraded");

    const companyId = enrollment.company_id;

    // 2. Update company: remove legat flag, set real info
    await adminClient.from("companies").update({
      is_legat: false,
      name: company_name || undefined,
      cvr_number: cvr_number || undefined,
      industry_label: industry_label || undefined,
    }).eq("id", companyId);

    // 3. Give user the member role in user_roles
    await adminClient.from("user_roles").upsert({
      user_id,
      role: "member",
    }, { onConflict: "user_id,role" });

    // 4. Mark enrollment as upgraded
    await adminClient.from("legat_enrollments").update({
      status: "upgraded",
      upgraded_at: new Date().toISOString(),
    }).eq("id", enrollment.id);

    // 5. Get user info for welcome email
    const { data: userData } = await adminClient.auth.admin.getUserById(user_id);
    const userEmail = userData?.user?.email;
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("user_id", user_id)
      .maybeSingle();
    const firstName = profile?.full_name?.split(" ")[0] || "dig";

    // 6. Send welcome-to-member email
    if (userEmail) {
      const subject = `Velkommen som medlem af The Boardroom, ${firstName}`;
      const html = `<div style="font-family:'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;color:#1a1a1a">
    <div style="text-align:center;margin-bottom:24px">
      <h2 style="margin:0;font-size:18px;font-weight:700;color:#1a1a1a">The Boardroom</h2>
    </div>
    <h1 style="font-size:22px;font-weight:700;margin:0 0 8px">Nyt medlem</h1>
    <p style="font-size:16px;color:#6b7280;margin:0 0 24px">Hej ${firstName} — du er nu medlem</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 24px">Du har fået fuld adgang til The Boardroom. Dine handouts og milestones fra legatforløbet er gemt og venter på dig.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="https://app.theboardroom.dk" style="display:inline-block;padding:14px 32px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Gå til platformen →</a>
    </div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0"/>
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0">
      The Boardroom · theboardroom.dk
    </p>
</div>`;

      const messageId = crypto.randomUUID();
      await adminClient.from("email_send_log").insert({
        message_id: messageId,
        template_name: "legat-upgrade",
        recipient_email: userEmail,
        status: "pending",
      });
      await adminClient.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: userEmail,
          from: "The Boardroom <noreply@boardroom.topix.dk>",
          sender_domain: "boardroom.topix.dk",
          subject,
          html,
          text: `Hej ${firstName} — du er nu medlem af The Boardroom. Log ind her: https://app.theboardroom.dk`,
          purpose: "transactional",
          label: "legat-upgrade",
          queued_at: new Date().toISOString(),
        },
      });
    }

    console.log(`[upgrade-legat-to-member] Upgraded user ${user_id} to member`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[upgrade-legat-to-member] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});