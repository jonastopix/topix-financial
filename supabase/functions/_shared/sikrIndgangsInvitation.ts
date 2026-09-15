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
 * «ALLEREDE ACCEPTERET» (DE TYVE (8), chattens beslutning 15/9): før kendte
 * funktionen kun pending. Fandtes en ACCEPTERET række på (company_id,
 * contact_email) — genbrug på CVR efter et tidligere signup, en tidligere
 * kunde der betaler sig ind igen, eller Stripes gensendelse EFTER at
 * medlemmet har oprettet sin konto — ramte insert'en UNIQUE, udfaldet blev
 * «fejlet», og klokken sagde «medlemmet har intet login» om et medlem der
 * havde et. Nu, når pending-opslaget er tomt, slås rækken på (company_id,
 * e-mail) op UANSET status, før der indsættes:
 *   1. accepteret, og accepted_by peger på en bruger der FINDES
 *      (auth.admin.getUserById) → «allerede_medlem»: ingen mail, ingen
 *      række skrevet, ingen rådgiverbesked.
 *   2. accepteret, men accepted_by er null eller brugeren findes ikke →
 *      rækken nulstilles som rådgiverens «Inviter» gør det
 *      (src/hooks/invitationer.ts: status pending, accepted_at null,
 *      accepted_by null), og mailen sendes med rækkens token → «sendt».
 *   3. insert-fejl 23505 (kapløb) → rækken læses igen og 1–2 anvendes;
 *      er den pending, er svaret «fandtes_allerede» som pending-opslaget
 *      ville have givet. Alle andre fejl som før → «fejlet».
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
  | { udfald: "allerede_medlem"; email: string }
  | { udfald: "sprunget_over"; grund: "secret_mangler" }
  | { udfald: "fejlet"; aarsag: string };

/** Rækken på (company_id, email) — uanset status. */
interface InvitationsRaekke {
  id: string;
  token: string;
  status: string;
  accepted_by: string | null;
}

/** Hvad der skal ske med en række der findes, men ikke er pending. */
type EksisterendeAfgoerelse =
  | { afgoerelse: "allerede_medlem" }
  | { afgoerelse: "nulstillet"; token: string };

/** Opslag UDEN statusfilter — det pending-opslaget ikke ser. */
async function findRaekkeUansetStatus(
  adminClient: SupabaseClient,
  companyId: string,
  email: string,
): Promise<InvitationsRaekke | null> {
  const { data, error } = await adminClient
    .from("company_invitations")
    .select("id, token, status, accepted_by")
    .eq("company_id", companyId)
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(`invitationsopslag uanset status fejlede: ${error.message}`);
  return (data as InvitationsRaekke | null) ?? null;
}

/**
 * Findes brugeren accepted_by peger på? «Not found» (404) er et nej; enhver
 * anden fejl kastes — en forbigående fejl må ikke nulstille et rigtigt
 * medlems invitation.
 */
async function brugerFindes(adminClient: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error) {
    const status = (error as { status?: number }).status;
    if (status === 404 || /not found/i.test(error.message ?? "")) return false;
    throw new Error(`bruger-opslag fejlede for ${userId}: ${error.message}`);
  }
  return Boolean(data?.user);
}

/** Beslutningens gren 1 og 2 for en række der findes og ikke er pending. */
async function afgoerEksisterendeRaekke(
  adminClient: SupabaseClient,
  companyId: string,
  raekke: InvitationsRaekke,
  email: string,
): Promise<EksisterendeAfgoerelse> {
  if (raekke.status !== "accepted") {
    throw new Error(`invitationsrækken ${raekke.id} har uventet status «${raekke.status}»`);
  }
  if (raekke.accepted_by && (await brugerFindes(adminClient, raekke.accepted_by))) {
    console.log(
      `[stripe-webhook] Indgang for company ${companyId}: invitationen til ${email} er accepteret og brugeren ${raekke.accepted_by} findes — allerede medlem — sender ikke`,
    );
    return { afgoerelse: "allerede_medlem" };
  }

  // Nulstillingen — samme tre felter som rådgiverens «Inviter»
  // (src/hooks/invitationer.ts), og husets to tjek: fejl OG antal rækker.
  const { data, error } = await adminClient
    .from("company_invitations")
    .update({ status: "pending", accepted_at: null, accepted_by: null })
    .eq("id", raekke.id)
    .select("token");
  if (error) throw new Error(`nulstilling af invitationen fejlede: ${error.message}`);
  if (!data || data.length === 0) throw new Error("nulstillingen ramte nul rækker — invitationen er IKKE genåbnet");
  console.log(
    `[stripe-webhook] Indgang for company ${companyId}: accepteret invitation til ${email} uden gyldig bruger (accepted_by ${raekke.accepted_by ?? "null"}) er nulstillet til pending — sender igen`,
  );
  return { afgoerelse: "nulstillet", token: (data[0] as { token: string }).token };
}

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

    // «Allerede accepteret» (15/9): rækken på (company_id, e-mail) uanset
    // status, FØR insert — gren 1 (allerede medlem) eller 2 (nulstil).
    let token: string;
    const raekkeUansetStatus = await findRaekkeUansetStatus(adminClient, companyId, invitationEmail);
    if (raekkeUansetStatus) {
      const afgjort = await afgoerEksisterendeRaekke(adminClient, companyId, raekkeUansetStatus, invitationEmail);
      if (afgjort.afgoerelse === "allerede_medlem") return { udfald: "allerede_medlem", email: invitationEmail };
      token = afgjort.token;
    } else {
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
      if (invErr?.code === "23505") {
        // Gren 3: kapløbet — en anden kørsel skrev rækken mellem opslag og
        // insert. Læs den igen og anvend 1–2; pending = «fandtes allerede».
        const kaploeb = await findRaekkeUansetStatus(adminClient, companyId, invitationEmail);
        if (!kaploeb) {
          throw new Error(`invitations-indsættelse fejlede: ${invErr.message} (rækken fandtes ikke ved genlæsning)`);
        }
        if (kaploeb.status === "pending") {
          console.log(
            `[stripe-webhook] Indgang for company ${companyId}: kapløb — pending invitation findes allerede (${invitationEmail}), sender ikke igen`
          );
          return { udfald: "fandtes_allerede", email: invitationEmail };
        }
        const afgjort = await afgoerEksisterendeRaekke(adminClient, companyId, kaploeb, invitationEmail);
        if (afgjort.afgoerelse === "allerede_medlem") return { udfald: "allerede_medlem", email: invitationEmail };
        token = afgjort.token;
      } else if (invErr || !invitation) {
        throw new Error(`invitations-indsættelse fejlede: ${invErr?.message ?? "ingen række"}`);
      } else {
        token = invitation.token;
      }
    }

    // Mailen, som import-application sender den (:348-355):
    // service-role-kald med company_name og signup_url i body.
    const signupUrl = `${APP_URL}/auth?mode=signup&invite=${token}`;
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
