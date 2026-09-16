// send-invitation-email — invitationsmailen til et nyt medlem.
//
// SKABELON ELLER FALLBACK (rettet 14/9 2026): mailen tages fra email_templates-
// rækken «Invitation til virksomhed» når præcis én række findes og er slået
// til; ellers husets egen mail i indgangsformen (_shared/invitationsMail.ts).
// Dommen bor i _shared/invitationsSkabelonvalg.ts og logges ALTID med årsag,
// og vej + årsag lægges i email_send_log.metadata. template_name er stadig
// 'invitation' — den har aftagere (src/hooks/invitationer.ts, EmailLogView).
// Målt i prod 14/9: rækken findes med enabled=false, så fallbacken er den
// mail nye medlemmer får i dag.
//
// AUTH (uændret): service-role-nøglen som Bearer → body'ens email,
// company_name og signup_url bruges. Bruger-JWT → kun email bruges; navn og
// link udledes af invitationsrækken, og kalderen skal have myndighed over den
// (invited_by, samme virksomhed, eller advisor), så funktionen ikke kan
// bruges som phishing-relæ.
import { VERIFIED_FROM_EMAIL, FROM_DOMAIN, SENDER_FROM, sendManagedEmail } from '../_shared/managedEmail.ts';
import { htmlTilTekst } from '../_shared/indgangsMailAfsendelse.ts';
import { invitationsMailSkabelon, invitationsVaerdier, udfyldPladsholdere } from '../_shared/invitationsMail.ts';
import {
  afgoerSkabelonvalg,
  SKABELON_NAVN,
  skabelonvalgLogtekst,
  skabelonvalgMetadata,
  type SkabelonRaekke,
} from '../_shared/invitationsSkabelonvalg.ts';
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SENDER = SENDER_FROM;
const SENDER_DOMAIN = FROM_DOMAIN;

/** Fallbacken: husets mail med {{company_name}} og {{signup_url}} som pladsholdere — udfyldes nedenfor som DB-skabelonen. */
const FALLBACK = invitationsMailSkabelon();

function resolveSenderFromTemplate(senderName: string | null | undefined, senderEmail: string | null | undefined): string {
  const safeName = (senderName ?? 'The Boardroom').trim() || 'The Boardroom';
  const normalizedEmail = (senderEmail ?? VERIFIED_FROM_EMAIL).trim().toLowerCase();
  const emailDomain = normalizedEmail.split('@')[1] ?? '';
  if (emailDomain !== SENDER_DOMAIN) return `${safeName} <${VERIFIED_FROM_EMAIL}>`;
  return `${safeName} <${normalizedEmail}>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.97.0");
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === serviceRoleKey;

    let callerId: string | null = null;
    if (!isServiceRole) {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userData, error: userErr } = await authClient.auth.getUser();
      if (userErr || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      callerId = userData.user.id;
    }

    const body = await req.json();
    const rawEmail = body?.email;
    if (!rawEmail || typeof rawEmail !== 'string') {
      return new Response(JSON.stringify({ error: "Missing required field: email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

    let email: string;
    let company_name: string;
    let signup_url: string;

    if (isServiceRole) {
      if (!body?.company_name || !body?.signup_url) {
        return new Response(JSON.stringify({ error: "Missing required fields: company_name, signup_url" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      email = rawEmail;
      company_name = body.company_name;
      signup_url = body.signup_url;
    } else {
      // Authority-resolution: caller must have authority over an invitation row
      // for this email. company_name and signup_url are server-derived from the
      // canonical row so the function cannot be used as a phishing relay.
      const normalizedEmail = rawEmail.trim().toLowerCase();

      const { data: candidates, error: lookupErr } = await adminSupabase
        .from('company_invitations')
        .select('id, token, company_id, invited_by, companies(name)')
        .ilike('email', normalizedEmail)
        .order('created_at', { ascending: false });

      if (lookupErr) {
        console.error('[send-invitation-email] invitation lookup failed:', lookupErr);
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!candidates || candidates.length === 0) {
        console.warn(`[send-invitation-email] denied: no invitation row for email=${normalizedEmail} caller=${callerId}`);
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: isAdvisor } = await adminSupabase.rpc('has_role', { _user_id: callerId, _role: 'advisor' });
      const { data: callerCompanyId } = await adminSupabase.rpc('user_company_id', { _user_id: callerId });

      const authorized =
        candidates.find((row: any) => row.invited_by === callerId) ??
        (callerCompanyId ? candidates.find((row: any) => row.company_id === callerCompanyId) : undefined) ??
        (isAdvisor === true ? candidates[0] : undefined);

      if (!authorized) {
        console.warn(`[send-invitation-email] denied: caller=${callerId} not authorized over invitation(s) for email=${normalizedEmail}`);
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const companyRel = (authorized as any).companies;
      const resolvedName = Array.isArray(companyRel) ? companyRel[0]?.name : companyRel?.name;
      email = normalizedEmail;
      company_name = resolvedName ?? 'The Boardroom';
      signup_url = `https://app.theboardroom.dk/auth?mode=signup&invite=${(authorized as any).token}`;
    }

    // ── Skabelonvalget: ALLE rækker med navnet læses (intet maybeSingle, så
    //    «flere rækker» er en dom og ikke en tavs PGRST116), error læses, og
    //    dommen falder i _shared/invitationsSkabelonvalg.ts. Logges altid. ──
    const { data: skabelonRaekker, error: skabelonFejl } = await adminSupabase
      .from('email_templates')
      .select('id, subject, body_html, sender_name, sender_email, enabled')
      .eq('name', SKABELON_NAVN);

    if (skabelonFejl) {
      console.error('[send-invitation-email] email_templates-opslag fejlede:', skabelonFejl);
    }
    const valg = afgoerSkabelonvalg({
      raekker: (skabelonRaekker ?? null) as SkabelonRaekke[] | null,
      fejl: skabelonFejl ? { message: skabelonFejl.message, code: skabelonFejl.code } : null,
    });
    if (valg.vej === 'skabelon') {
      console.log(skabelonvalgLogtekst(valg));
    } else {
      console.warn(skabelonvalgLogtekst(valg));
    }

    let subjectTpl = FALLBACK.subject;
    let bodyTpl = FALLBACK.html;
    let senderFrom = SENDER;
    if (valg.vej === 'skabelon') {
      subjectTpl = valg.raekke.subject;
      bodyTpl = valg.raekke.body_html;
      senderFrom = resolveSenderFromTemplate(valg.raekke.sender_name, valg.raekke.sender_email);
    }

    // company_name escapes i HTML'en (rå i emnet); signup_url aldrig — se
    // invitationsVaerdier. Gælder begge veje, også DB-skabelonen.
    const vaerdier = invitationsVaerdier({ companyName: company_name, signupUrl: signup_url });
    const subject = udfyldPladsholdere(subjectTpl, vaerdier.tilEmne);
    const html = udfyldPladsholdere(bodyTpl, vaerdier.tilHtml);

    const resultat = await sendManagedEmail({
      adminClient: adminSupabase,
      to: email,
      from: senderFrom,
      subject,
      html,
      text: htmlTilTekst(html),
      // template_name bliver 'invitation' — aftagere: src/hooks/invitationer.ts
      // («Sendt {dato}») og EmailLogView. Vejen står i metadata i stedet.
      label: 'invitation',
      metadata: { ...skabelonvalgMetadata(valg), company_name },
    });

    // Kun en spærret modtager passerer stille; failed OG rate_limited (14/9) kaster som før.
    if (!resultat.sent && resultat.reason !== 'recipient_suppressed') {
      throw new Error(`Failed to send invitation email (${resultat.reason}): ${resultat.error}`);
    }

    // Spærret hos Lovable (16/9): svaret SIGER det (spaerret: true), så kalderne
    // kan handle — funktionen ringer ikke selv klokken, fordi service-role-
    // kaldene (stripe-webhook, import-application) ikke bærer company_id.
    // Ikke «Enqueued»: intet blev sendt (email_send_log har status suppressed).
    if (!resultat.sent) {
      console.warn(`[send-invitation-email] ${email} er spærret hos mailudbyderen — intet sendt (company: ${company_name}, vej: ${valg.vej})`);
      return new Response(JSON.stringify({ success: true, spaerret: true, skabelonvalg: valg.vej }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[send-invitation-email] Enqueued invitation for: ${email} (company: ${company_name}, vej: ${valg.vej})`);
    return new Response(JSON.stringify({ success: true, spaerret: false, skabelonvalg: valg.vej }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    console.error("send-invitation-email error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
