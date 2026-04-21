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
}

async function lookupCVR(cvr: string): Promise<{
  name?: string;
  founded?: string;
  industry_code?: string;
  industry_label?: string;
  address?: string;
  zip?: string;
  city?: string;
} | null> {
  try {
    const resp = await fetch(
      `https://data.virk.dk/datahenter/CVR/virksomhed/_search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _source: ["Vrvirksomhed.cvrNummer", "Vrvirksomhed.virksomhedMetadata.nyesteNavn.navn",
            "Vrvirksomhed.virksomhedMetadata.stiftelsesDato",
            "Vrvirksomhed.virksomhedMetadata.nyesteBranchekode.branchekode",
            "Vrvirksomhed.virksomhedMetadata.nyesteBranchekode.branchetekst"],
          query: { term: { "Vrvirksomhed.cvrNummer": parseInt(cvr) } },
        }),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const hit = data?.hits?.hits?.[0]?._source?.Vrvirksomhed;
    if (!hit) return null;
    const meta = hit.virksomhedMetadata;
    return {
      name: meta?.nyesteNavn?.navn,
      founded: meta?.stiftelsesDato,
      industry_code: meta?.nyesteBranchekode?.branchekode,
      industry_label: meta?.nyesteBranchekode?.branchetekst,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;

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

  // 1. Check if invitation already exists for this email
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

  // 2. CVR lookup
  let cvrData: Awaited<ReturnType<typeof lookupCVR>> = null;
  let startDate: string | null = body.start_date || null;

  if (body.cvr_number && /^\d{8}$/.test(body.cvr_number)) {
    cvrData = await lookupCVR(body.cvr_number);
    if (cvrData?.founded && !startDate) {
      startDate = cvrData.founded;
    }
  }

  // 3. Create company with full context
  const companyName = cvrData?.name || body.company_name;
  const industryLabel = body.industry_label || cvrData?.industry_label || null;

  const { data: company, error: companyErr } = await adminClient
    .from("companies")
    .insert({
      name: companyName,
      cvr_number: body.cvr_number || null,
      industry_label: industryLabel,
      industry_code: cvrData?.industry_code || null,
      website: body.website || null,
      contact_phone: body.phone || null,
      start_date: startDate,
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

  // 4. Create conversation for the company (no member yet)
  await adminClient.from("conversations").insert({
    member_id: "00000000-0000-0000-0000-000000000000", // placeholder — updated when member accepts
    company_id: company.id,
  }).then(() => {}).catch(() => {});

  // 5. Create invitation token
  const { data: invitation, error: invErr } = await adminClient
    .from("company_invitations")
    .insert({
      company_id: company.id,
      email,
      invited_by: (await adminClient.auth.admin.listUsers()).data?.users?.[0]?.id || "00000000-0000-0000-0000-000000000000",
      status: "pending",
    })
    .select("token")
    .single();

  if (invErr || !invitation) {
    return new Response(JSON.stringify({ error: "Failed to create invitation", detail: invErr?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 6. Send invitation email
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
    company_id: company.id,
    company_name: companyName,
    invitation_token: invitation.token,
    signup_url: signupUrl,
    cvr_data: cvrData,
    email_sent: !emailErr,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
