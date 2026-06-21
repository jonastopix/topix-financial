import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { computeMembershipTier } from "../_shared/membershipTier.ts";

// Kopieret fra stripe-webhook (apiKey + slug-parametriseret). Bevidst dupliceret saa
// webhook'en ikke roeres; en evt. samling i _shared/calendly.ts er et andet run.
async function getCalendlyEventTypeUri(apiKey: string, slug: string): Promise<string> {
  const meResponse = await fetch("https://api.calendly.com/users/me", {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });
  const meData = await meResponse.json();
  const userUri = meData?.resource?.uri;
  if (!userUri) throw new Error(`Could not get Calendly user URI: ${JSON.stringify(meData)}`);

  const url = `https://api.calendly.com/event_types?count=100&user=${encodeURIComponent(userUri)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });
  const data = await response.json();
  const eventType = (data.collection || []).find((e: any) =>
    e.slug === slug || e.scheduling_url?.includes(slug)
  );
  if (!eventType) throw new Error(`Event type not found for slug: ${slug}. Available: ${JSON.stringify(data?.collection?.map((e: any) => e.slug))}`);
  return eventType.uri;
}

async function createCalendlySingleUseLink(apiKey: string, eventTypeUri: string): Promise<string> {
  const response = await fetch("https://api.calendly.com/scheduling_links", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ max_event_count: 1, owner: eventTypeUri, owner_type: "EventType" }),
  });
  const data = await response.json();
  if (!data.resource?.booking_url) throw new Error("Failed to create Calendly link");
  return data.resource.booking_url;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // 1. CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 2. Bucket A: authenticate caller FOER nogen service-role-handling (CI-guard kraever dette).
    const auth = await authenticateUser(req);
    if (auth instanceof Response) return auth;
    const { callerId } = auth;

    // 3. Service-role-klient til berettigelses-laesning, atomisk gate og insert.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 4. Find brugerens virksomhed (samme moenster som create-stripe-checkout).
    const { data: member } = await admin
      .from("company_members")
      .select("company_id")
      .eq("user_id", callerId)
      .eq("role", "member")
      .maybeSingle();

    const companyId = member?.company_id;
    if (!companyId) {
      return json(400, { error: "Du er ikke tilknyttet en virksomhed." });
    }

    // 5. Berettigelse: kun aktive fulde medlemmer maa booke den gratis intro.
    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("contract_end_date, subscription_status, subscription_current_period_end, intro_session_used_at")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError || !company) {
      console.error("[create-free-intro-booking] company fetch failed:", companyError);
      return json(500, { error: "Kunne ikke slaa din virksomhed op. Proev igen." });
    }

    const tier = computeMembershipTier({
      contract_end_date: company.contract_end_date,
      subscription_status: company.subscription_status,
      subscription_current_period_end: company.subscription_current_period_end,
    });
    if (tier !== "full") {
      return json(403, { error: "Kun fulde medlemmer kan booke en gratis intro-session." });
    }

    // 6. ATOMISK GATE (foerste mutation): markér intro_session_used_at i samme sætning som
    //    betingelsen IS NULL. To hurtige klik kan aldrig begge vinde, da UPDATE'en tager
    //    row-laasen og kun matcher saa laenge feltet stadig er NULL.
    const ts = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin
      .from("companies")
      .update({ intro_session_used_at: ts })
      .eq("id", companyId)
      .is("intro_session_used_at", null)
      .select("id");

    if (claimError) {
      console.error("[create-free-intro-booking] gate update failed:", claimError);
      return json(500, { error: "Noget gik galt. Proev igen." });
    }
    if (!claimed || claimed.length === 0) {
      return json(409, { error: "Virksomheden har allerede brugt sin gratis intro-session." });
    }

    // Guarded rollback: nulstil KUN hvis vaerdien stadig er vores (samme ts), saa vi aldrig
    // sletter en anden markering. Returnér altid en venlig fejl der siger at gratis IKKE er brugt.
    const rollback = async () => {
      const { error: rbError } = await admin
        .from("companies")
        .update({ intro_session_used_at: null })
        .eq("id", companyId)
        .eq("intro_session_used_at", ts);
      if (rbError) {
        console.error(`[create-free-intro-booking] ROLLBACK FAILED, company_id=${companyId} ts=${ts}, kraever manuel oprydning:`, rbError);
      }
    };

    // 7. Læs Mortens secrets. De er endnu IKKE sat, og en manglende secret giver 503 + rollback,
    //    saa ingen bruger forbruger sin gratis mod en uudfyldt konfiguration.
    const mortenApiKey = Deno.env.get("MORTEN_CALENDLY_API_KEY");
    const mortenSlug = Deno.env.get("MORTEN_CALENDLY_EVENT_SLUG");
    if (!mortenApiKey || !mortenSlug) {
      console.error("[create-free-intro-booking] Morten Calendly secrets mangler, afviser og ruller tilbage.");
      await rollback();
      return json(503, { error: "Gratis intro-session er ikke konfigureret endnu. Din gratis intro er ikke brugt." });
    }

    // 8. Generér bookingens id FOER linket, saa vi kan indlejre det i booking_url'en og senere
    //    matche en Calendly-webhook tilbage til praecis denne raekke. crypto.randomUUID() er
    //    synkron og kaster ikke; den throwbare del (URL-append nedenfor) ligger inde i try'en,
    //    saa rollback stadig daekker en evt. fejl.
    const bookingId = crypto.randomUUID();

    // 9. Generér Mortens Calendly single-use link og indlejr id'et. Enhver fejl -> rollback + 502.
    let bookingUrl: string;
    try {
      const eventTypeUri = await getCalendlyEventTypeUri(mortenApiKey, mortenSlug);
      bookingUrl = await createCalendlySingleUseLink(mortenApiKey, eventTypeUri);

      // Indlejr id'et i linket. salesforce_uuid er Calendlys dedikerede pass-through-felt;
      // utm_content er en redundant fallback. URL-API'et haandterer ? vs & og encoding selv.
      const u = new URL(bookingUrl);
      u.searchParams.set("salesforce_uuid", bookingId);
      u.searchParams.set("utm_content", bookingId);
      bookingUrl = u.toString();
    } catch (calErr) {
      console.error("[create-free-intro-booking] Calendly link generation failed:", calErr);
      await rollback();
      return json(502, { error: "Kunne ikke hente en tid hos Morten. Proev igen. Din gratis intro er ikke brugt." });
    }

    // 10. Opret bookingen med det faste id (DB-defaulten gaelder kun ved udeladelse).
    //     Gratis: advisor='morten', amount_dkk=0, ingen Stripe-session.
    const { error: insertError } = await admin
      .from("session_bookings")
      .insert({
        id: bookingId,
        user_id: callerId,
        company_id: companyId,
        advisor: "morten",
        amount_dkk: 0,
        stripe_session_id: null,
        status: "booking_sent",
        calendly_booking_url: bookingUrl,
      });

    if (insertError) {
      console.error("[create-free-intro-booking] booking insert failed:", insertError);
      await rollback();
      return json(500, { error: "Kunne ikke oprette bookingen. Proev igen. Din gratis intro er ikke brugt." });
    }

    // 11. Samme returform som create-stripe-checkout.
    return json(200, { url: bookingUrl });
  } catch (err) {
    console.error("create-free-intro-booking error:", err);
    return json(500, { error: "Der opstod en fejl. Proev igen." });
  }
});
