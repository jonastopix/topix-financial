import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import {
  opretEllerGenbrugVirksomhed,
  type OpretResultat,
} from "../_shared/virksomhedsOprettelse.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  // Caller-authz: must be advisor (admin inherits via has_role). The frontend
  // route is AdvisorRoute-guarded, but a valid JWT can hit this edge function
  // directly — server-side gate closes that path.
  const { data: callerIsAdvisor, error: callerRoleError } = await callerClient.rpc(
    "has_role",
    { _user_id: callerId, _role: "advisor" }
  );
  if (callerRoleError || !callerIsAdvisor) {
    console.warn("[import-application] caller not advisor", { callerId });
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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

  // 2-3. Opret eller genbrug virksomheden — den delte vej, som
  // monday-webhook også skal gå. CVR-opslag, genbrugsreglen (otte cifre +
  // eksisterende række) og insert'en ligger i hjælperen; rækken bygges af
  // motoren med låst feltliste. contact_email sendes med: indgangen kræver
  // den (hent_betalingsdata_til_checkout svarer kun når den findes).
  let oprettet: OpretResultat;
  try {
    oprettet = await opretEllerGenbrugVirksomhed({
      company_name: body.company_name,
      cvr_number: body.cvr_number,
      website: body.website,
      phone: body.phone,
      industry_label: body.industry_label,
      start_date: body.start_date,
      current_situation: body.current_situation,
      goals: body.goals,
      help_needed: body.help_needed,
      annual_revenue: body.annual_revenue,
      revenue_interval: body.revenue_interval,
      contact_name: body.contact_name,
      contact_email: email,
      application_date: body.application_date,
      // Adressen (3/9): payloadens address/zip/city har stået i typen uden
      // at blive brugt, og CVR-svaret bar den ikke — derfor stod FLOOR1
      // (oprettet her 2/9 med CVR-opslag) uden adresse. Nu: input vinder,
      // CVR fylder. (Berig-stien, som ikke rørte adressen, blev fjernet
      // 10/9 — «bruges ikke», Jonas.)
      address: body.address,
      postal_code: body.zip,
      city: body.city,
    }, adminClient);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[import-application] Failed to create company:", detail);
    return new Response(JSON.stringify({ error: "Failed to create company", detail }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const companyId = oprettet.company_id;
  const companyName = oprettet.company_name;
  const cvrData = oprettet.cvr_svar;

  // 3b. Kontraktdatoerne sættes SEPARAT, og kun ved nyoprettelse. De er
  // holdt ude af hjælperen med vilje: Monday-vejen må ikke kunne sætte dem,
  // fordi tre steder læser contract_end_date som «har betalt»
  // (hent_betalingstilbud, afgoerBetalingsfrist, useAuth via
  // computeMembershipTier). Rådgiverens import bærer stadig datoer fra
  // regnearket, så her — og kun her — skrives de efter oprettelsen.
  // Ved GENBRUG røres datoerne ikke (uændret adfærd fra før udskillelsen).
  if (!oprettet.genbrugt && (body.contract_start_date || body.contract_end_date)) {
    const { error: datoErr } = await adminClient
      .from("companies")
      .update({
        contract_start_date: body.contract_start_date ? body.contract_start_date.slice(0, 10) : null,
        contract_end_date: body.contract_end_date ? body.contract_end_date.slice(0, 10) : null,
      })
      .eq("id", companyId);
    if (datoErr) {
      // Virksomheden findes nu uden datoer. Fejl højt frem for at invitere
      // ind i en kontrakt uden løbetid — rådgiveren kan sætte datoerne i
      // «Rediger virksomhedsdata» på virksomhedssiden bagefter.
      console.error("[import-application] Failed to set contract dates:", datoErr, "company_id:", companyId);
      return new Response(JSON.stringify({ error: "Failed to set contract dates", detail: datoErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
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
    console.error("[import-application] Failed to create invitation:", invErr, "company_id:", companyId, "email:", email);
    return new Response(JSON.stringify({ error: "Failed to create invitation", detail: invErr?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 5. Send invitation email
  const signupUrl = `https://app.theboardroom.dk/auth?mode=signup&invite=${invitation.token}`;
  const { data: _emailData, error: emailErr } = await adminClient.functions.invoke("send-invitation-email", {
    body: {
      email,
      company_name: companyName,
      signup_url: signupUrl,
    },
  });

  if (emailErr) {
    let bodyText: string | null = null;
    let status: number | undefined;
    try {
      status = emailErr.context?.status;
      bodyText = (await emailErr.context?.text()) ?? null;
    } catch (readErr) {
      console.warn("[import-application] Failed to read send-invitation-email error body:", readErr);
    }
    console.warn("[import-application] Failed to send invitation email (non-blocking):", { status, body: bodyText, error: emailErr });
  }

  console.log(`[import-application] Invitation created: company=${companyId}, email=${email}, token=${invitation.token}, email_sent=${!emailErr}`);

  return new Response(JSON.stringify({
    ok: true,
    reused_company: oprettet.genbrugt,
    company_id: companyId,
    company_name: companyName,
    invitation_token: invitation.token,
    signup_url: signupUrl,
    cvr_data: cvrData,
    email_sent: !emailErr,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
