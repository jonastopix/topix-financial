import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId } = auth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Only advisors and admins can create enrollments
  const { data: roleRows } = await adminClient
    .from("user_roles").select("role").eq("user_id", callerId)
    .in("role", ["advisor", "admin"]).limit(1);
  if (!roleRows || roleRows.length === 0) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { full_name, email, company_name, start_date, notes } = await req.json();

  if (!full_name || !email) {
    return new Response(JSON.stringify({ error: "full_name and email are required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Create or find auth user
    let userId: string;
    const { data: listData } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    const existingUser = (listData?.users ?? []).find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (existingUser) {
      userId = existingUser.id;
      console.log(`[create-legat-enrollment] Using existing user ${userId} for ${email}`);
    } else {
      const { data: newUser, error: userError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (userError) throw new Error(`Auth user creation failed: ${userError.message}`);
      userId = newUser.user.id;
    }

    // 2. Upsert profile (may already exist for existing users)
    await adminClient.from("profiles").upsert({
      user_id: userId,
      full_name,
      company_name: company_name || "",
    }, { onConflict: "user_id" });

    // 3. Create legat company
    const { data: company, error: companyError } = await adminClient
      .from("companies")
      .insert({
        name: company_name || full_name,
        is_legat: true,
      })
      .select("id")
      .single();
    if (companyError) throw new Error(`Company creation failed: ${companyError.message}`);

    // 4. Add user as company member
    await adminClient.from("company_members").insert({
      company_id: company.id,
      user_id: userId,
      role: "member",
    });

    // 5. Create legat enrollment
    const enrollStart = start_date || new Date().toISOString().split("T")[0];
    const { error: enrollError } = await adminClient.from("legat_enrollments").insert({
      user_id: userId,
      company_id: company.id,
      start_date: enrollStart,
      status: "active",
      notes: notes || null,
      created_by: callerId,
    });
    if (enrollError) throw new Error(`Enrollment creation failed: ${enrollError.message}`);

    // 6. Create "Book Momentumkald" milestone — unlocked day 1
    const deadline = new Date(enrollStart);
    deadline.setDate(deadline.getDate() + 3);
    await adminClient.from("milestones").insert({
      user_id: userId,
      company_id: company.id,
      title: "Book dit Momentumkald med Jonas",
      description: "Book et 30-minutters Momentumkald — det er din mulighed for at få sparring direkte på din forretning og afslutte forløbet stærkt. Book her: https://theboardroom.dk/momentumkald",
      deadline: deadline.toISOString().split("T")[0],
      progress: 0,
      status: "active",
      source: "legat",
    });

    // 7. Send invitation email via Supabase magic link
    const { error: inviteError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: "https://app.theboardroom.dk/legat",
      },
    });
    if (inviteError) {
      console.error("Magic link generation failed:", inviteError.message);
      // Non-fatal — user is created, link can be resent
    }

    // 8. Send welcome email via email queue
    const firstName = full_name.split(" ")[0];
    const messageId = crypto.randomUUID();
    await adminClient.from("email_send_log").insert({
      message_id: messageId,
      template_name: "legat-welcome",
      recipient_email: email,
      status: "pending",
    });

    const html = `<div style="font-family:'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;color:#1a1a1a">
    <div style="text-align:center;margin-bottom:24px">
      <h2 style="margin:0;font-size:18px;font-weight:700;color:#1a1a1a">The Boardroom</h2>
    </div>
    <h1 style="font-size:22px;font-weight:700;margin:0 0 8px">The Boardroom Legat</h1>
    <p style="font-size:16px;color:#6b7280;margin:0 0 24px">Tillykke, ${firstName} — du er udvalgt</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 24px">Du har fået en plads på The Boardroom Legat. De næste 10 dage får du adgang til materialer, handouts og sparring der hjælper dig med at tage din forretning videre.</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 24px">Klik herunder for at logge ind på platformen og komme i gang.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="https://app.theboardroom.dk/legat" style="display:inline-block;padding:14px 32px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Kom i gang →</a>
    </div>
    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:24px 0">
      <p style="margin:0;font-size:14px;color:#374151"><strong>Første skridt:</strong> Book dit Momentumkald med Jonas — du finder det som dit første mål på platformen.</p>
    </div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0"/>
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0">
      The Boardroom · theboardroom.dk
    </p>
</div>`;

    await adminClient.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: email,
        from: "The Boardroom <noreply@mail.topix.dk>",
        sender_domain: "mail.topix.dk",
        subject: `Velkommen til The Boardroom Legat, ${firstName}`,
        html,
        text: `Hej ${firstName} — du er udvalgt til The Boardroom Legat. Log ind her: https://app.theboardroom.dk/legat`,
        purpose: "transactional",
        label: "legat-welcome",
        queued_at: new Date().toISOString(),
      },
    });

    console.log(`[create-legat-enrollment] Created legat user ${userId} for ${email}`);

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      company_id: company.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[create-legat-enrollment] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});