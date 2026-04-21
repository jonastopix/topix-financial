import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

interface ApplicationPayload {
  // Required
  email: string;
  company_name: string;
  // Optional enrichment
  cvr_number?: string;
  contact_name?: string;
  phone?: string;
  address?: string;
  zip?: string;
  city?: string;
  industry_label?: string;
  annual_revenue?: number;
  revenue_interval?: string;
  website?: string;
  // Application text
  current_situation?: string;
  goals?: string;
  help_needed?: string;
  application_date?: string;
  // Pricing
  price?: number;
  start_date?: string;
  contract_start_date?: string;
  contract_end_date?: string;
}

async function lookupCVR(cvr: string): Promise<{
  name?: string;
  founded?: string;
  industry_code?: string;
  industry_label?: string;
} | null> {
  try {
    const resp = await fetch(
      `https://cvrapi.dk/api?country=dk&search=${cvr}`,
      {
        headers: {
          "User-Agent": "TheboardroomDK/1.0 (kontakt@theboardroom.dk)",
        },
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.error) return null;
    return {
      name: data.name || undefined,
      founded: data.startdate || undefined,
      industry_code: data.industrycode ? String(data.industrycode) : undefined,
      industry_label: data.industrydesc || undefined,
    };
  } catch (err) {
    console.warn("[import-application] CVR lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId } = auth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const body: ApplicationPayload = await req.json();

  if (!body.email || !body.company_name) {
    return new Response(JSON.stringify({ error: "email and company_name are required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const email = body.email.trim().toLowerCase();

  // 1a. Check if a Supabase Auth user already exists with this email.
  // If so, the standard signup flow won't work (Supabase suppresses the
  // confirmation email on user_repeated_signup), and the handle_new_user
  // trigger only runs on first signup. Fail fast with a clear reason so
  // the advisor can either ask the user to log in or attach them manually.
  try {
    const { data: existingUserData } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const existingUser = existingUserData?.users?.find(
      (u) => (u.email || "").toLowerCase() === email
    );
    if (existingUser) {
      console.log(
        `[import-application] Skipping import — auth user already exists for ${email} (user_id=${existingUser.id})`
      );
      return new Response(
        JSON.stringify({
          ok: false,
          reason: "user_already_exists",
          existing_user_id: existingUser.id,
          email_confirmed: !!existingUser.email_confirmed_at,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.warn(
      "[import-application] auth.admin.listUsers lookup failed (continuing):",
      err instanceof Error ? err.message : err
    );
  }

  // 1b. Check if invitation already exists for this email
  const { data: existingInv } = await adminClient
    .from("company_invitations")
    .select("id, company_id")
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInv) {
    return new Response(JSON.stringify({ ok: false, reason: "invitation_already_exists", company_id: existingInv.company_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Check if company already exists with this CVR
  let existingCompanyId: string | null = null;
  if (body.cvr_number && /^\d{8}$/.test(body.cvr_number)) {
    const { data: existingCompany } = await adminClient
      .from("companies")
      .select("id, name")
      .eq("cvr_number", body.cvr_number)
      .maybeSingle();
    if (existingCompany) existingCompanyId = existingCompany.id;
  }

  // 3. Resolve company (reuse or create)
  let companyId: string;
  let companyName: string;
  let cvrData: Awaited<ReturnType<typeof lookupCVR>> = null;

  if (existingCompanyId) {
    const { data: co } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", existingCompanyId)
      .maybeSingle();
    companyId = existingCompanyId;
    companyName = co?.name || body.company_name;
  } else {
    let startDate: string | null = body.start_date || null;

    if (body.cvr_number && /^\d{8}$/.test(body.cvr_number)) {
      cvrData = await lookupCVR(body.cvr_number);
      if (cvrData) {
        console.log(`[import-application] CVR ${body.cvr_number} → ${cvrData.name}, founded: ${cvrData.founded}`);
      } else {
        console.warn(`[import-application] CVR ${body.cvr_number} lookup returned no data`);
      }
      if (cvrData?.founded && !startDate) {
        startDate = cvrData.founded.slice(0, 10);
      }
    }

    const resolvedName = cvrData?.name || body.company_name;
    const industryLabel = body.industry_label || cvrData?.industry_label || null;

    const { data: company, error: companyErr } = await adminClient
      .from("companies")
      .insert({
        name: resolvedName,
        cvr_number: body.cvr_number || null,
        industry_label: industryLabel,
        industry_code: cvrData?.industry_code || null,
        website: body.website || null,
        contact_phone: body.phone || null,
        start_date: startDate,
        contract_start_date: body.contract_start_date ? body.contract_start_date.slice(0, 10) : null,
        contract_end_date: body.contract_end_date ? body.contract_end_date.slice(0, 10) : null,
        cvr_fetched_at: cvrData ? new Date().toISOString() : null,
        onboarding_completed: false,
        application_context: {
          current_situation: body.current_situation || null,
          goals: body.goals || null,
          help_needed: body.help_needed || null,
          annual_revenue: body.annual_revenue || null,
          revenue_interval: body.revenue_interval || null,
          contact_name: body.contact_name || null,
          application_date: body.application_date || null,
          raw_cvr_data: cvrData || null,
        },
      })
      .select("id")
      .single();

    if (companyErr || !company) {
      return new Response(JSON.stringify({ error: "Failed to create company", detail: companyErr?.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    companyId = company.id;
    companyName = resolvedName;
  }

  // 4. Create invitation token
  const { data: invitation, error: invErr } = await adminClient
    .from("company_invitations")
    .insert({
      company_id: companyId,
      email,
      invited_by: callerId,
      status: "pending",
    })
    .select("token")
    .single();

  if (invErr || !invitation) {
    return new Response(JSON.stringify({ error: "Failed to create invitation", detail: invErr?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 5. Send invitation email
  const signupUrl = `https://app.theboardroom.dk/auth?mode=signup&invite=${invitation.token}`;
  const { error: emailErr } = await adminClient.functions.invoke("send-invitation-email", {
    body: {
      email,
      company_name: companyName,
      signup_url: signupUrl,
    },
  });

  if (emailErr) {
    console.warn("Failed to send invitation email (non-blocking):", emailErr);
  }

  return new Response(JSON.stringify({
    ok: true,
    reused_company: !!existingCompanyId,
    company_id: companyId,
    company_name: companyName,
    invitation_token: invitation.token,
    signup_url: signupUrl,
    cvr_data: cvrData,
    email_sent: !emailErr,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
