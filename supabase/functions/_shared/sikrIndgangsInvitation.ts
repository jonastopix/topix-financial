/**
 * Indgangens invitation efter betaling — udtrukket fra stripe-webhook.
 *
 * HVORFOR DEN KALDES TRE STEDER (målt 2/9, recon-webhook-invitation.md):
 * invitationsblokken lå sidst i indgangsgrenen, EFTER cancel_at-kaldet.
 * Fejlede cancel_at eller kontrakt-opdateringen, svarede webhooken 500,
 * Stripe gensendte, og anden kørsel gik i gensendelsesgrenen — som
 * returnerede («already_processed» eller «fuldførte halvt udført
 * arbejde») uden nogensinde at nå invitationen. Betalingen var
 * modtaget, adgangen åben, og medlemmet fik aldrig sit login.
 *
 * Derfor kaldes funktionen både i hovedvejen og i BEGGE udgange af
 * gensendelsesgrenen. Det er sikkert at kalde den igen: pending-opslaget
 * på company_id og UNIQUE(company_id, email) i databasen forhindrer
 * dubletter — to invitationer kan ikke opstå, og en gensendelse giver
 * højst «fandtes allerede».
 *
 * KASTER ALDRIG ud af sig selv — samme kontrakt som blokken havde
 * (selv-indkapslet try/catch): kontrakten er sat og pengene modtaget; et
 * kast ville få Stripe til at gensende et forløb der allerede er
 * gennemført. Hver fejl logges med company_id, og resultatet siger hvad
 * der skete, så kalderen kan logge eller ignorere det.
 *
 * invited_by (besluttet 2/9): kolonnen er uuid NOT NULL uden FK og er
 * IKKE en afsender — mailens afsendernavn kommer fra
 * email_templates.sender_name. Værdien tages fra secret'en
 * INVITATION_AFSENDER_USER_ID, så den kan ændres uden kodeændring.
 *
 * Logteksterne er bevaret ordret fra stripe-webhook, inklusive
 * «INVITATION IKKE SENDT — … Rådgiver skal invitere manuelt.» — derfor
 * bærer funktionen Stripe-session-id'et som tredje argument, kun til
 * logning.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const APP_URL = "https://app.theboardroom.dk";

export type IndgangsInvitationResultat =
  | { udfald: "sendt"; email: string }
  | { udfald: "fandtes_allerede"; email: string }
  | { udfald: "sprunget_over"; grund: "secret_mangler" }
  | { udfald: "fejlet"; aarsag: string };

export async function sikrIndgangsInvitation(
  adminClient: SupabaseClient,
  companyId: string,
  stripeSessionId: string,
): Promise<IndgangsInvitationResultat> {
  const invitationAfsender = Deno.env.get("INVITATION_AFSENDER_USER_ID")?.trim() || null;
  if (!invitationAfsender) {
    console.error(
      `[stripe-webhook] Indgang ${stripeSessionId} for company ${companyId}: INVITATION IKKE SENDT — secret INVITATION_AFSENDER_USER_ID mangler. Rådgiver skal invitere manuelt.`
    );
    return { udfald: "sprunget_over", grund: "secret_mangler" };
  }

  try {
    // Idempotens: en gensendelse fra Stripe må ikke give to invitationer.
    const { data: eksisterendeInvitation, error: invOpslagError } = await adminClient
      .from("company_invitations")
      .select("id, email")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();
    if (invOpslagError) throw new Error(`invitationsopslag fejlede: ${invOpslagError.message}`);

    if (eksisterendeInvitation) {
      console.log(
        `[stripe-webhook] Indgang for company ${companyId}: pending invitation findes allerede (${eksisterendeInvitation.email}), sender ikke igen`
      );
      return { udfald: "fandtes_allerede", email: eksisterendeInvitation.email };
    }

    const { data: invitationCompany, error: invCompanyError } = await adminClient
      .from("companies")
      .select("name, contact_email")
      .eq("id", companyId)
      .maybeSingle();
    if (invCompanyError) throw new Error(`virksomhedsopslag fejlede: ${invCompanyError.message}`);

    const invitationEmail = invitationCompany?.contact_email?.trim().toLowerCase() || null;
    if (!invitationEmail) {
      throw new Error("companies.contact_email er tom — ingen adresse at invitere");
    }

    // Rækken, som import-application opretter den (:328-337):
    // company_id, email, invited_by, status. token får sin default.
    const { data: invitation, error: invErr } = await adminClient
      .from("company_invitations")
      .insert({
        company_id: companyId,
        email: invitationEmail,
        invited_by: invitationAfsender,
        status: "pending",
      })
      .select("token")
      .single();
    if (invErr || !invitation) {
      throw new Error(`invitations-indsættelse fejlede: ${invErr?.message ?? "ingen række"}`);
    }

    // Mailen, som import-application sender den (:348-355):
    // service-role-kald med company_name og signup_url i body.
    const signupUrl = `${APP_URL}/auth?mode=signup&invite=${invitation.token}`;
    const { error: emailErr } = await adminClient.functions.invoke("send-invitation-email", {
      body: {
        email: invitationEmail,
        company_name: invitationCompany?.name ?? "The Boardroom",
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
        console.warn("[stripe-webhook] kunne ikke læse send-invitation-email-fejlsvar:", readErr);
      }
      throw new Error(`send-invitation-email fejlede: status=${status ?? "?"} body=${bodyText ?? ""} error=${emailErr.message ?? String(emailErr)}`);
    }

    console.log(
      `[stripe-webhook] Indgang for company ${companyId}: invitation sendt til ${invitationEmail}`
    );
    return { udfald: "sendt", email: invitationEmail };
  } catch (invitationFejl) {
    const aarsag = invitationFejl instanceof Error ? invitationFejl.message : String(invitationFejl);
    console.error(
      `[stripe-webhook] Indgang ${stripeSessionId} for company ${companyId}: INVITATION IKKE SENDT — ${aarsag}. Rådgiver skal invitere manuelt.`
    );
    return { udfald: "fejlet", aarsag };
  }
}
