import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { computeMembershipTier } from "../_shared/membershipTier.ts";

// DEN INKLUDEREDE SESSION — for BEGGE raadgivere (13/9, recon-de-tre-sessioner.md §3).
// Medlemskabet indeholder een session med hver raadgiver. Funktionen var otte steder bundet
// til Morten (kolonne, fem fejltekster, to secrets, advisor-insert); den er nu parametriseret
// paa body { advisor: "jonas" | "morten" } (default "morten" = praecis den gamle adfaerd, saa
// et kald uden body opfoerer sig som foer). Function-navnet BLIVER — det sidder i config.toml,
// CI-vaernet, SECURITY_BASELINE og fladen, og en omdoebning koster mere end den giver.
//
// Alt raadgiver-specifikt staar i SPOR-tabellen nedenfor; resten af flowet er ens:
//   ret (kolonne paa companies) -> atomisk gate UPDATE ... WHERE <ret> IS NULL (409 ved nul
//   raekker) -> guarded rollback paa samme ts -> single-use Calendly-link med raekkens id
//   indlejret (salesforce_uuid/utm_content, saa calendly-webhook kan melde tilbage) ->
//   insert med advisor og amount_dkk 0.
//
// Jonas' slug (JONAS_CALENDLY_EVENT_SLUG) findes IKKE som secret endnu — kandidaten er
// Calendly-eventet «Onboarding», slug `intro-snak`, 30 min (maalt 13/9). Mangler den, svarer
// funktionen 503 + rollback, praecis som Mortens gjorde foer hans secrets blev sat: ingen
// bruger forbruger sin ret mod en uudfyldt konfiguration.

type Raadgiver = "jonas" | "morten";

interface Spor {
  navn: string;
  /** Kolonnen paa companies der baerer retten. NULL = ikke brugt. */
  ret: "intro_session_used_at" | "jonas_session_used_at";
  apiKeyEnv: string;
  slugEnv: string;
}

const SPOR: Record<Raadgiver, Spor> = {
  morten: {
    navn: "Morten",
    ret: "intro_session_used_at",
    apiKeyEnv: "MORTEN_CALENDLY_API_KEY",
    slugEnv: "MORTEN_CALENDLY_EVENT_SLUG",
  },
  jonas: {
    navn: "Jonas",
    ret: "jonas_session_used_at",
    // CALENDLY_API_KEY er Jonas' noegle (den stripe-webhook bruger til det koebte spor).
    apiKeyEnv: "CALENDLY_API_KEY",
    slugEnv: "JONAS_CALENDLY_EVENT_SLUG",
  },
};

function vaelgRaadgiver(body: unknown): Raadgiver | null {
  const a = (body as { advisor?: unknown } | null)?.advisor;
  if (a === undefined || a === null) return "morten";
  if (a === "jonas" || a === "morten") return a;
  return null;
}

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

    // 2b. Hvilken raadgiver? Body er valgfri (tom/manglende = Morten, som foer). Ukendt vaerdi
    //     afvises FOER nogen mutation.
    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const raadgiver = vaelgRaadgiver(body);
    if (!raadgiver) {
      return json(400, { error: "Ukendt raadgiver." });
    }
    const spor = SPOR[raadgiver];
    const log = `[create-free-intro-booking:${raadgiver}]`;

    // 3. Service-role-klient til berettigelses-laesning, atomisk gate og insert.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 4. Find brugerens virksomhed. Rollefilteret .eq("role", "member") er FJERNET
    //    (13-08-2026): handle_new_user giver 'owner' til selv-tilmeldte foundere og
    //    'member' til inviterede (20260319101733:75-76, 92-93), saa filteret ramte
    //    systematisk forbi netop founderne — enhver ejer fik 400 "Du er ikke
    //    tilknyttet en virksomhed." Rollen baerer ingen adgang nogen steder:
    //    user_company_id filtrerer ikke paa den (20260224222456:29-38), og ingen
    //    RLS-policy skelner. .limit(1) uden .order() vaelger vilkaarligt ved flere
    //    brugere (samme faelde som user_company_id), derfor deterministisk aeldste
    //    raekke foerst.
    const { data: member } = await admin
      .from("company_members")
      .select("company_id")
      .eq("user_id", callerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const companyId = member?.company_id;
    if (!companyId) {
      return json(400, { error: "Du er ikke tilknyttet en virksomhed." });
    }

    // 5. Berettigelse: kun aktive fulde medlemmer maa booke den inkluderede session.
    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("contract_end_date, subscription_status, subscription_current_period_end")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError || !company) {
      console.error(`${log} company fetch failed:`, companyError);
      return json(500, { error: "Kunne ikke slaa din virksomhed op. Proev igen." });
    }

    const tier = computeMembershipTier({
      contract_end_date: company.contract_end_date,
      subscription_status: company.subscription_status,
      subscription_current_period_end: company.subscription_current_period_end,
    });
    if (tier !== "full") {
      return json(403, { error: "Kun fulde medlemmer kan booke den inkluderede session." });
    }

    // 6. ATOMISK GATE (foerste mutation): markér retten i samme sætning som betingelsen
    //    IS NULL. To hurtige klik kan aldrig begge vinde, da UPDATE'en tager row-laasen og
    //    kun matcher saa laenge feltet stadig er NULL. Samme form for begge raadgivere —
    //    kun kolonnen skifter.
    const ts = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin
      .from("companies")
      .update({ [spor.ret]: ts })
      .eq("id", companyId)
      .is(spor.ret, null)
      .select("id");

    if (claimError) {
      console.error(`${log} gate update failed:`, claimError);
      return json(500, { error: "Noget gik galt. Proev igen." });
    }
    if (!claimed || claimed.length === 0) {
      return json(409, { error: `Virksomheden har allerede brugt sin inkluderede session med ${spor.navn}.` });
    }

    // Guarded rollback: nulstil KUN hvis vaerdien stadig er vores (samme ts), saa vi aldrig
    // sletter en anden markering. Returnér altid en venlig fejl der siger at retten IKKE er brugt.
    const rollback = async () => {
      const { error: rbError } = await admin
        .from("companies")
        .update({ [spor.ret]: null })
        .eq("id", companyId)
        .eq(spor.ret, ts);
      if (rbError) {
        console.error(`${log} ROLLBACK FAILED, company_id=${companyId} ts=${ts}, kraever manuel oprydning:`, rbError);
      }
    };

    // 7. Laes raadgiverens secrets. En manglende secret giver 503 + rollback, saa ingen bruger
    //    forbruger sin ret mod en uudfyldt konfiguration.
    const apiKey = Deno.env.get(spor.apiKeyEnv);
    const slug = Deno.env.get(spor.slugEnv);
    if (!apiKey || !slug) {
      console.error(`${log} Calendly secrets mangler (${spor.apiKeyEnv} / ${spor.slugEnv}), afviser og ruller tilbage.`);
      await rollback();
      return json(503, { error: `Sessionen med ${spor.navn} er ikke konfigureret endnu. Din inkluderede session er ikke brugt.` });
    }

    // 8. Generér bookingens id FOER linket, saa vi kan indlejre det i booking_url'en og senere
    //    matche en Calendly-webhook tilbage til praecis denne raekke. crypto.randomUUID() er
    //    synkron og kaster ikke; den throwbare del (URL-append nedenfor) ligger inde i try'en,
    //    saa rollback stadig daekker en evt. fejl.
    const bookingId = crypto.randomUUID();

    // 9. Generér raadgiverens Calendly single-use link og indlejr id'et. Enhver fejl -> rollback + 502.
    let bookingUrl: string;
    try {
      const eventTypeUri = await getCalendlyEventTypeUri(apiKey, slug);
      bookingUrl = await createCalendlySingleUseLink(apiKey, eventTypeUri);

      // Indlejr id'et i linket. salesforce_uuid er Calendlys dedikerede pass-through-felt;
      // utm_content er en redundant fallback. URL-API'et haandterer ? vs & og encoding selv.
      // DUBLERET i stripe-webhook 13/9 (Jonas' koebte spor) — anden gang de to filer deler
      // Calendly-kode (hjaelperne oeverst var foerste). En samling i _shared/calendly.ts er
      // et eget run.
      const u = new URL(bookingUrl);
      u.searchParams.set("salesforce_uuid", bookingId);
      u.searchParams.set("utm_content", bookingId);
      bookingUrl = u.toString();
    } catch (calErr) {
      console.error(`${log} Calendly link generation failed:`, calErr);
      await rollback();
      return json(502, { error: `Kunne ikke hente en tid hos ${spor.navn}. Proev igen. Din inkluderede session er ikke brugt.` });
    }

    // 10. Opret bookingen med det faste id (DB-defaulten gaelder kun ved udeladelse).
    //     Inkluderet: advisor = raadgiveren, amount_dkk = 0, ingen Stripe-session.
    //     'jonas' + 0 er det inkluderede Jonas-spor; 'jonas' + 500 er det koebte
    //     (lib/betaltSession.afgoerSessionSpor).
    const { error: insertError } = await admin
      .from("session_bookings")
      .insert({
        id: bookingId,
        user_id: callerId,
        company_id: companyId,
        advisor: raadgiver,
        amount_dkk: 0,
        stripe_session_id: null,
        status: "booking_sent",
        calendly_booking_url: bookingUrl,
      });

    if (insertError) {
      console.error(`${log} booking insert failed:`, insertError);
      await rollback();
      return json(500, { error: "Kunne ikke oprette bookingen. Proev igen. Din inkluderede session er ikke brugt." });
    }

    // 11. Samme returform som create-stripe-checkout.
    return json(200, { url: bookingUrl });
  } catch (err) {
    console.error("create-free-intro-booking error:", err);
    return json(500, { error: "Der opstod en fejl. Proev igen." });
  }
});
