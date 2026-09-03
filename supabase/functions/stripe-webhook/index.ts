import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { sikrIndgangsInvitation } from "../_shared/sikrIndgangsInvitation.ts";
import {
  beloebFraFaktura,
  beregnIndgangsPeriode,
  erIndgangsFaktura,
  kundeIdFraFaktura,
  type IndgangsPeriode,
  type StripeInvoiceBetaling,
} from "../_shared/indgangsFakturaBetaling.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

async function verifyStripeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const parts = signature.split(",");
  const timestamp = parts.find(p => p.startsWith("t="))?.slice(2);
  const v1 = parts.find(p => p.startsWith("v1="))?.slice(3);
  if (!timestamp || !v1) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return expected === v1;
}

/**
 * Sætter cancel_at på et fornyelses-abonnement, hvis det ikke allerede har
 * et. Kaldes fra fornyelsesgrenen — både ved første behandling og ved
 * gensendelser, så et abonnement uden ophør aldrig passerer i tavshed.
 *
 * REGNESTYKKET: rate12 trækker i måned 0-11, rate2 i måned 0 og 6, og
 * næste træk ville i begge tilfælde falde i måned 12. cancel_at skal
 * derfor ligge EFTER sidste aftalte træk og FØR måned 12 — abonnementets
 * faktiske start + 12 måneder MINUS 1 dag rammer sikkert inden for begge.
 * Der regnes fra abonnementets start_date, ikke fra "nu": webhooken kan
 * køre timer efter betalingen (og gensendelser dage efter). Uden
 * cancel_at trækkes medlemmet i det uendelige.
 */
async function sikrOphoerPaaFornyelsesAbonnement(
  subscriptionId: string,
  stripeSecretKey: string
): Promise<void> {
  const getRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey}` },
  });
  if (!getRes.ok) {
    const err = await getRes.text();
    console.error(`[stripe-webhook] kunne ikke hente abonnement ${subscriptionId}:`, err);
    throw new Error(`Failed to fetch subscription ${subscriptionId}`);
  }
  const sub = await getRes.json();

  if (sub.cancel_at) {
    console.log(`[stripe-webhook] abonnement ${subscriptionId} har allerede cancel_at, springer over`);
    return;
  }

  const cancelAt = new Date(sub.start_date * 1000);
  cancelAt.setUTCMonth(cancelAt.getUTCMonth() + 12);
  cancelAt.setUTCDate(cancelAt.getUTCDate() - 1);

  const postRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      cancel_at: String(Math.floor(cancelAt.getTime() / 1000)),
    }).toString(),
  });
  if (!postRes.ok) {
    const err = await postRes.text();
    console.error(`[stripe-webhook] kunne ikke sætte cancel_at på abonnement ${subscriptionId}:`, err);
    throw new Error(`Failed to set cancel_at on subscription ${subscriptionId}`);
  }
  console.log(
    `[stripe-webhook] cancel_at sat på abonnement ${subscriptionId}: ${cancelAt.toISOString()}`
  );
}

async function getCalendlyEventTypeUri(apiKey: string, slug: string): Promise<string> {
  // First get the current user's URI
  const meResponse = await fetch("https://api.calendly.com/users/me", {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });
  const meData = await meResponse.json();
  const userUri = meData?.resource?.uri;
  const orgUri = meData?.resource?.current_organization;
  if (!userUri) throw new Error(`Could not get Calendly user URI: ${JSON.stringify(meData)}`);
  console.log("[stripe-webhook] Calendly user URI:", userUri);
  console.log("[stripe-webhook] Calendly org URI:", orgUri);

  // Fetch event types for this user
  const url = `https://api.calendly.com/event_types?count=100&user=${encodeURIComponent(userUri)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });
  const data = await response.json();
  console.log("[stripe-webhook] Event types:", JSON.stringify(data?.collection?.map((e: any) => ({ slug: e.slug, name: e.name }))));

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

/**
 * Nulstiller company_betalingslink.sidste_checkout_session_id når en
 * indgangsbetaling er behandlet — sessionen er brugt, og feltet skal ikke
 * pege på noget dødt (værnet mod dobbeltbetaling, _shared/checkoutSession.ts).
 * Kaster aldrig: kontrakten er sat og pengene modtaget; en manglende
 * nulstilling betyder kun at næste checkout forsøger at udløbe en session
 * der allerede er complete, hvilket hjælperen tåler.
 */
async function nulstilIndgangsSession(
  adminClient: SupabaseClient,
  companyId: string,
): Promise<void> {
  const { error } = await adminClient
    .from("company_betalingslink")
    .update({ sidste_checkout_session_id: null } as any)
    .eq("company_id", companyId);
  if (error) {
    console.warn(`[stripe-webhook] kunne ikke nulstille sidste_checkout_session_id for ${companyId}:`, error);
  }
}

/**
 * Hvidlisten for subscription-grenene (3/9): kun SELVBETJENINGSABONNEMENTET
 * må skrive subscription_status m.fl. på companies, og det er det eneste
 * abonnement uden metadata.art — create-subscription-checkout sætter kun
 * subscription_data[metadata][company_id]. Alle medlemskabsabonnementer
 * bærer en art (indgang, fornyelse, migreret, og enhver fremtidig) og
 * springes over, uanset navn. Se kommentaren ved grenene.
 */
function erSelvbetjeningsabonnement(sub: { metadata?: Record<string, string> | null }): boolean {
  const art = sub.metadata?.art;
  return typeof art !== "string" || art.trim() === "";
}

// ── Indgangskæden som hjælpere (3/9) — delt af checkout-indgangsgrenen og
//    invoice.paid-grenen, så en fakturabetaling ender PRÆCIS samme sted som
//    en checkout-betaling: company_perioder → companies → session-pegeren
//    → invitationen. Udtrukket ordret fra indgangsgrenen; fejlteksterne er
//    de samme, og hjælperne KASTER som blokkene gjorde, så kalderen selv
//    afgør hvad et kast betyder (checkout: 500 → Stripe gensender). ──

interface EksisterendeIndgangsPeriode extends IndgangsPeriode {
  id: string;
}

/** Idempotens-opslaget: findes der allerede en periode på denne Stripe-reference? */
async function findIndgangsPeriode(
  adminClient: SupabaseClient,
  stripeReference: string,
): Promise<EksisterendeIndgangsPeriode | null> {
  const { data, error } = await adminClient
    .from("company_perioder")
    .select("id, periode_start, periode_slut")
    .eq("stripe_reference", stripeReference)
    .maybeSingle();
  if (error) {
    console.error("[stripe-webhook] idempotens-opslag (indgang) fejlede:", error);
    throw new Error("Idempotency lookup failed");
  }
  return (data as EksisterendeIndgangsPeriode | null) ?? null;
}

/** Perioden FØRST — fejler det næste trin, findes perioden som spor af hvad der blev betalt. */
async function opretIndgangsPeriode(
  adminClient: SupabaseClient,
  raekke: {
    company_id: string;
    periode: IndgangsPeriode;
    beloeb_oere: number;
    betalingsmodel: string;
    stripe_reference: string;
  },
): Promise<void> {
  const { error } = await adminClient.from("company_perioder").insert({
    company_id: raekke.company_id,
    periode_start: raekke.periode.periode_start,
    periode_slut: raekke.periode.periode_slut,
    beloeb_oere: raekke.beloeb_oere,
    betalingsmodel: raekke.betalingsmodel,
    art: "indgang",
    stripe_reference: raekke.stripe_reference,
    oprettet_af: null, // betalingen er ikke en rådgiverhandling
  });
  if (error) {
    console.error("[stripe-webhook] periode-indsættelse (indgang) fejlede:", error);
    throw new Error("Failed to insert company_periode");
  }
}

/** Kontrakten på virksomheden: datoerne, listeprisen og (når kendt) Stripe-kunden. */
async function skrivIndgangsKontrakt(
  adminClient: SupabaseClient,
  companyId: string,
  periode: IndgangsPeriode,
  listeprisOere: number,
  stripeCustomerId: string | null,
  kontekst: "" | " (gensendelse)",
): Promise<void> {
  const { error } = await adminClient
    .from("companies")
    .update({
      contract_start_date: periode.periode_start,
      contract_end_date: periode.periode_slut,
      indgangspris_oere: listeprisOere,
      ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}),
    } as any)
    .eq("id", companyId);
  if (error) {
    console.error(`[stripe-webhook] kontrakt-opdatering (indgang) fejlede${kontekst}:`, error);
    throw new Error("Failed to update contract dates");
  }
}

type IndgangsFakturaBetalingResultat =
  | { udfald: "gennemfoert"; periode: IndgangsPeriode; beloeb_oere: number; genoptaget: boolean }
  | { udfald: "allerede_behandlet" }
  | { udfald: "fejlet"; aarsag: string };

/**
 * invoice.paid for dag 31-fakturaen (docs/indgangen-design.md §30):
 * samme kæde som checkout-indgangsgrenen, med betalingsmodel 'faktura',
 * stripe_reference = invoice-id og beløbet fra fakturaen uden moms
 * (regnestykket i _shared/indgangsFakturaBetaling.ts). Idempotent på
 * stripe_reference som indgangsgrenen: en gensendelse fuldfører halvt
 * udført arbejde eller springer over — aldrig to perioder.
 *
 * KASTER ALDRIG: resultatet siger hvad der skete, og grenen afgør
 * svaret. Ingen cancel_at-trin: en faktura er ét beløb, intet abonnement.
 */
async function behandlIndgangsFakturaBetaling(
  adminClient: SupabaseClient,
  invoice: StripeInvoiceBetaling & { metadata: { art: "indgang"; company_id: string } },
): Promise<IndgangsFakturaBetalingResultat> {
  const companyId = invoice.metadata.company_id;
  const invoiceId = invoice.id;
  try {
    const beloeb = beloebFraFaktura(invoice);
    if (!beloeb) {
      throw new Error("fakturaen bærer hverken total_excluding_tax eller amount_paid");
    }
    if (beloeb.kilde === "amount_paid") {
      console.warn(
        `[stripe-webhook] invoice.paid ${invoiceId}: total_excluding_tax mangler — beloeb_oere falder tilbage på amount_paid og kan bære momsen`,
      );
    }
    const stripeCustomerId = kundeIdFraFaktura(invoice);

    const { data: company } = await adminClient
      .from("companies")
      .select("contract_end_date")
      .eq("id", companyId)
      .maybeSingle();

    // Idempotens FØRST — og som «er ARBEJDET fuldført», ikke «findes
    // rækken»: præcis som indgangsgrenen.
    const eksisterende = await findIndgangsPeriode(adminClient, invoiceId);
    if (eksisterende) {
      if (company?.contract_end_date === eksisterende.periode_slut) {
        // Invitationen sikres også her: første forsøg kan være fejlet
        // EFTER kontrakten var sat og FØR invitationen gik.
        await sikrIndgangsInvitation(adminClient, companyId, invoiceId);
        console.log(`[stripe-webhook] invoice.paid ${invoiceId} allerede behandlet, springer over`);
        return { udfald: "allerede_behandlet" };
      }
      await skrivIndgangsKontrakt(adminClient, companyId, eksisterende, beloeb.beloeb_oere, stripeCustomerId, " (gensendelse)");
      await nulstilIndgangsSession(adminClient, companyId);
      await sikrIndgangsInvitation(adminClient, companyId, invoiceId);
      console.log(
        `[stripe-webhook] invoice.paid ${invoiceId}: gensendelse fuldførte halvt udført arbejde — kontrakt ${eksisterende.periode_start} → ${eksisterende.periode_slut}`,
      );
      return { udfald: "gennemfoert", periode: eksisterende, beloeb_oere: beloeb.beloeb_oere, genoptaget: true };
    }

    const periode = beregnIndgangsPeriode();
    await opretIndgangsPeriode(adminClient, {
      company_id: companyId,
      periode,
      beloeb_oere: beloeb.beloeb_oere,
      betalingsmodel: "faktura",
      stripe_reference: invoiceId,
    });
    // Listeprisen = linjebeløbet: en faktura har intet ratetillæg.
    await skrivIndgangsKontrakt(adminClient, companyId, periode, beloeb.beloeb_oere, stripeCustomerId, "");
    await nulstilIndgangsSession(adminClient, companyId);
    // Invitationen — betalingen giver adgang (§21). Kaster aldrig selv.
    await sikrIndgangsInvitation(adminClient, companyId, invoiceId);
    return { udfald: "gennemfoert", periode, beloeb_oere: beloeb.beloeb_oere, genoptaget: false };
  } catch (err) {
    const aarsag = err instanceof Error ? err.message : String(err);
    console.error(
      `[stripe-webhook] KRITISK: invoice.paid ${invoiceId} for company ${companyId} — betalingen er modtaget, men kæden er ikke fuldført: ${aarsag}. Svaret er 500, så Stripe gensender; kæden er idempotent på stripe_reference.`,
    );
    return { udfald: "fejlet", aarsag };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
  const stripeSignature = req.headers.get("stripe-signature") || "";
  const payload = await req.text();

  const isValid = await verifyStripeSignature(payload, stripeSignature, webhookSecret);
  if (!isValid) {
    console.error("Invalid Stripe signature");
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(payload);
  console.log("[stripe-webhook] Event type:", event.type);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const calendlyApiKey = Deno.env.get("CALENDLY_API_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  try {
    // ── Subscription lifecycle events ──
    //
    // HVIDLISTE, ikke sortliste (rettet 3/9). subscription_status,
    // stripe_subscription_id og subscription_current_period_end på
    // companies er forbeholdt SELVBETJENINGSABONNEMENTET («dine tal», exit-
    // produktet fra create-subscription-checkout) — det eneste abonnement
    // der bærer INGEN metadata.art (det sætter kun company_id). Et
    // MEDLEMSKABSABONNEMENT er ikke et selvbetjeningsabonnement: indgangens
    // og fornyelsens rater (art "indgang"/"fornyelse") bærer adgangen i
    // contract_end_date, og skrev vi status her, ville virksomheden fremstå
    // som abonnent (tier "subscriber") i stedet for fuldt medlem.
    //
    // Før stod der en SORTLISTE (art === "fornyelse" || art === "indgang"),
    // og alt andet faldt igennem til skrivningen. Det afslørede doggybeds
    // migrerede abonnement 3/9 2026: sub_1UB6wE3CvBmCx5Ptq3hHp2vt bærer
    // art "migreret" (pilotmigrationen 2/9), som ingen gren kendte — så
    // trækket 13/9 ville have skrevet active + period_end = cancel_at på
    // companies, /members ville vise «Abonnement: Active», og på
    // fornyelsesdagen 13/10 mellem 00:00 og cancel_at ville tier blive
    // "subscriber" i stedet for "expired": væk fra FornyelsesSektion,
    // tomt fornyelsestilbud, 403 på fornyelses-checkout
    // (~/Downloads/recon-migreret.md). En ny art må ikke kunne forurene
    // feltet ved at blive glemt — derfor springes ALT med en art over,
    // og kun det art-løse selvbetjeningsabonnement skriver.
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const sub = event.data.object;
      if (!erSelvbetjeningsabonnement(sub)) {
        console.log(`[stripe-webhook] ${event.type} for ${sub.metadata.art}-abonnement ${sub.id}, springer status-skrivning over (kun selvbetjening skriver)`);
        return new Response(JSON.stringify({ received: true, skipped: `${sub.metadata.art}_subscription` }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      const companyId = sub.metadata?.company_id;
      if (companyId) {
        await adminClient
          .from("companies")
          .update({
            subscription_status: sub.status,
            stripe_customer_id: sub.customer,
            stripe_subscription_id: sub.id,
            subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          } as any)
          .eq("id", companyId);
        console.log(`[stripe-webhook] Subscription ${event.type} for company ${companyId}, status: ${sub.status}`);
      }
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      // Samme hvidliste som ovenfor: et medlemskabsabonnement der rammer
      // sit cancel_at efter sidste rate (indgang, fornyelse, migreret), er
      // et normalt afsluttet betalingsforløb — ikke en opsagt selvbetjening.
      // Kun det art-løse selvbetjeningsabonnement skriver "cancelled".
      if (!erSelvbetjeningsabonnement(sub)) {
        console.log(`[stripe-webhook] ${event.type} for ${sub.metadata.art}-abonnement ${sub.id}, springer status-skrivning over (kun selvbetjening skriver)`);
        return new Response(JSON.stringify({ received: true, skipped: `${sub.metadata.art}_subscription` }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      const companyId = sub.metadata?.company_id;
      if (companyId) {
        await adminClient
          .from("companies")
          .update({
            subscription_status: "cancelled",
            subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          } as any)
          .eq("id", companyId);
        console.log(`[stripe-webhook] Subscription cancelled for company ${companyId}`);
      }
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── invoice.paid — dag 31-fakturaen (docs/indgangen-design.md §30).
    //    Kun fakturaer VI har oprettet bærer metadata[art]=indgang og
    //    metadata[company_id] på selve fakturaen; abonnementernes måneds-
    //    fakturaer (rate2/rate12, fornyelse, exit) har tom metadata på
    //    fakturaen og ack'es som før, uden handling. invoice.paid sendes
    //    både ved Stripe-betaling og ved paid_out_of_band (registreret i
    //    hånden) — begge giver adgang. Grenen står FØR checkout-tjekket,
    //    for alt efter det forudsætter en Checkout-session. ──
    if (event.type === "invoice.paid") {
      const invoice = event.data.object as StripeInvoiceBetaling;
      if (!erIndgangsFaktura(invoice)) {
        console.log(`[stripe-webhook] invoice.paid ${invoice?.id ?? "?"} er ikke en indgangsfaktura, springer over`);
        return new Response(JSON.stringify({ received: true, skipped: "ikke_indgangsfaktura" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      const resultat = await behandlIndgangsFakturaBetaling(adminClient, invoice);
      if (resultat.udfald === "fejlet") {
        // Intet kast — men et ufuldført forløb skal gensendes: 500 får
        // Stripe til at prøve igen, og kæden er idempotent. Et FULDFØRT
        // forløb svarer altid 200 (gennemfoert/allerede_behandlet), så en
        // gensendelse af noget der er gennemført, sker ikke.
        return new Response(JSON.stringify({ received: true, indgang_faktura: "fejlet", error: resultat.aarsag }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (resultat.udfald === "gennemfoert") {
        console.log(
          `[stripe-webhook] Indgang (faktura) for company ${invoice.metadata.company_id}: ${resultat.beloeb_oere} øre ekskl. moms, kontrakt ${resultat.periode.periode_start} → ${resultat.periode.periode_slut}${resultat.genoptaget ? " (genoptaget)" : ""}`,
        );
      }
      return new Response(JSON.stringify({ received: true, indgang_faktura: resultat.udfald }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (event.type !== "checkout.session.completed") {
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = event.data.object;

    // ── Fornyelse (opret-fornyelse-checkout) — gribes FØR mode-kontrollen
    //    nedenfor: fuld betaling er mode=payment, raterne mode=subscription,
    //    og begge skal skrive perioden og forlænge kontrakten ──
    if (session.metadata?.art === "fornyelse") {
      const fornyelseCompanyId = session.metadata?.company_id;
      const betalingsmodel = session.metadata?.betalingsmodel;
      const grundbeloebOere = Number(session.metadata?.grundbeloeb_oere);
      if (!fornyelseCompanyId || !betalingsmodel || !Number.isFinite(grundbeloebOere)) {
        console.error(`[stripe-webhook] fornyelse session ${session.id} mangler metadata`);
        return new Response("Missing metadata", { status: 400 });
      }

      // beloeb_oere er "faktisk betalt for perioden" (rate12 bærer
      // 5 %-tillægget) — det er samlet_oere. Sessions oprettet før
      // samlet_oere kom i metadata falder tilbage på grundbeløbet; rækken
      // kan så mangle tillægget, og advarslen gør det synligt.
      const samletOere = Number(session.metadata?.samlet_oere);
      let beloebOere: number;
      if (Number.isFinite(samletOere)) {
        beloebOere = samletOere;
      } else {
        console.warn(
          `[stripe-webhook] fornyelse session ${session.id} har intet samlet_oere i metadata — falder tilbage på grundbeloeb_oere; beloeb_oere kan mangle rate12-tillægget`
        );
        beloebOere = grundbeloebOere;
      }

      const { data: fornyelseCompany } = await adminClient
        .from("companies")
        .select("contract_end_date")
        .eq("id", fornyelseCompanyId)
        .maybeSingle();

      // Idempotens FØRST — stripe_reference bærer den (jf. kolonne-
      // kommentaren på company_perioder). Et gensendt webhook-event må
      // ALDRIG give to perioder eller forlænge kontrakten to gange.
      // Tjekket spørger om ARBEJDET er fuldført, ikke kun om perioden
      // findes: fejlede dato-opdateringen i første forsøg, svarede vi 500,
      // og gensendelsen skal så FULDFØRE arbejdet frem for at springe over
      // — ellers forlænges kontrakten aldrig.
      const { data: eksisterende, error: eksisterendeError } = await adminClient
        .from("company_perioder")
        .select("id, periode_slut")
        .eq("stripe_reference", session.id)
        .maybeSingle();
      if (eksisterendeError) {
        console.error("[stripe-webhook] idempotens-opslag fejlede:", eksisterendeError);
        throw new Error("Idempotency lookup failed");
      }
      if (eksisterende) {
        // Også ved gensendelse: sæt cancel_at hvis abonnementet mangler det
        // — første forsøg kan være fejlet netop dér. Hjælperen springer selv
        // over hvis cancel_at allerede er sat.
        if (session.mode === "subscription" && session.subscription) {
          await sikrOphoerPaaFornyelsesAbonnement(
            session.subscription,
            Deno.env.get("STRIPE_SECRET_KEY")!
          );
        }
        if (fornyelseCompany?.contract_end_date === eksisterende.periode_slut) {
          console.log(`[stripe-webhook] Fornyelse ${session.id} allerede behandlet, springer over`);
          return new Response(JSON.stringify({ received: true, skipped: "already_processed" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        const { error: fuldfoerError } = await adminClient
          .from("companies")
          // sidste_checkout_session_id nulstilles: sessionen er brugt
          // (værnet mod dobbeltbetaling, _shared/checkoutSession.ts).
          .update({ contract_end_date: eksisterende.periode_slut, sidste_checkout_session_id: null } as any)
          .eq("id", fornyelseCompanyId);
        if (fuldfoerError) {
          console.error("[stripe-webhook] contract_end_date-opdatering fejlede (gensendelse):", fuldfoerError);
          throw new Error("Failed to update contract_end_date");
        }
        console.log(
          `[stripe-webhook] Fornyelse ${session.id}: gensendelse fuldførte halvt udført arbejde — contract_end_date sat til ${eksisterende.periode_slut} for company ${fornyelseCompanyId}`
        );
        return new Response(JSON.stringify({ received: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Kontrakten løber fra BETALINGSDATOEN, ikke fra den gamle slutdato
      // (besluttet 1/9 — medlemmet skal ikke snydes for dage).
      const startDato = new Date();
      const periode_start = startDato.toISOString().slice(0, 10);
      const slutDato = new Date(startDato);
      slutDato.setUTCMonth(slutDato.getUTCMonth() + 12);
      const periode_slut = slutDato.toISOString().slice(0, 10);

      // Perioden FØRST, datoen bagefter: fejler opdateringen, findes
      // perioden som spor af hvad der blev betalt. Fejler indsættelsen,
      // er intet sket, og Stripe forsøger igen.
      const { error: periodeError } = await adminClient.from("company_perioder").insert({
        company_id: fornyelseCompanyId,
        periode_start,
        periode_slut,
        beloeb_oere: beloebOere,
        betalingsmodel,
        art: "fornyelse",
        stripe_reference: session.id,
        oprettet_af: null, // betalingen er ikke en rådgiverhandling
      });
      if (periodeError) {
        console.error("[stripe-webhook] periode-indsættelse fejlede:", periodeError);
        throw new Error("Failed to insert company_periode");
      }

      const { error: datoError } = await adminClient
        .from("companies")
        // sidste_checkout_session_id nulstilles: sessionen er brugt
        // (værnet mod dobbeltbetaling, _shared/checkoutSession.ts).
        .update({ contract_end_date: periode_slut, sidste_checkout_session_id: null } as any)
        .eq("id", fornyelseCompanyId);
      if (datoError) {
        console.error("[stripe-webhook] contract_end_date-opdatering fejlede:", datoError);
        throw new Error("Failed to update contract_end_date");
      }

      // Ophør på rate-abonnementet — sættes her fordi Checkout ikke kan
      // (subscription_data[cancel_at] afvises med parameter_unknown), og
      // fordi abonnementets faktiske start først kendes nu. Fejler kaldet,
      // kaster hjælperen → 500 → Stripe gensender; et abonnement uden ophør
      // må ikke passere i tavshed.
      if (session.mode === "subscription" && session.subscription) {
        await sikrOphoerPaaFornyelsesAbonnement(
          session.subscription,
          Deno.env.get("STRIPE_SECRET_KEY")!
        );
      }

      console.log(
        `[stripe-webhook] Fornyelse for company ${fornyelseCompanyId}: ${beloebOere} øre (${betalingsmodel}), kontrakt ${fornyelseCompany?.contract_end_date ?? "ukendt"} → ${periode_slut}`
      );
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Indgang (opret-indgangs-checkout) — gribes FØR mode-kontrollen
    //    nedenfor af samme grund som fornyelsen: fuld betaling er
    //    mode=payment, raterne mode=subscription, og begge skal skrive
    //    perioden, sætte kontraktdatoerne og indgangsprisen. Spejler
    //    fornyelsesgrenen i form: idempotens først, rækkefølge,
    //    genindtrædelighed, samme cancel_at-hjælper ──
    if (session.metadata?.art === "indgang") {
      const indgangCompanyId = session.metadata?.company_id;
      const betalingsmodel = session.metadata?.betalingsmodel;
      const grundbeloebOere = Number(session.metadata?.grundbeloeb_oere);
      if (!indgangCompanyId || !betalingsmodel || !Number.isFinite(grundbeloebOere)) {
        console.error(`[stripe-webhook] indgang session ${session.id} mangler metadata`);
        return new Response("Missing metadata", { status: 400 });
      }

      // beloeb_oere er det FAKTISK betalte (rate12 bærer 5 %-tillægget) —
      // det er samlet_oere. Mangler det, falder vi tilbage på grundbeløbet
      // med en advarsel, som fornyelsen gør.
      const samletOere = Number(session.metadata?.samlet_oere);
      let beloebOere: number;
      if (Number.isFinite(samletOere)) {
        beloebOere = samletOere;
      } else {
        console.warn(
          `[stripe-webhook] indgang session ${session.id} har intet samlet_oere i metadata — falder tilbage på grundbeloeb_oere; beloeb_oere kan mangle tillægget`
        );
        beloebOere = grundbeloebOere;
      }

      // Stripe-kunden er lige oprettet af Checkout (customer_email). Gemmes
      // på virksomheden, så fornyelsen om et år kan genbruge den
      // (opret-fornyelse-checkout:177). I payment-mode kan den mangle —
      // så skrives feltet ikke.
      const stripeCustomerId =
        typeof session.customer === "string" && session.customer ? session.customer : null;

      const { data: indgangCompany } = await adminClient
        .from("companies")
        .select("contract_end_date")
        .eq("id", indgangCompanyId)
        .maybeSingle();

      // Idempotens FØRST — og som "er ARBEJDET fuldført", ikke "findes
      // rækken": fejler et senere trin, svarer vi 500, Stripe gensender, og
      // en simpel findes-test ville springe over uden at fuldføre.
      // stripe_reference bærer den (jf. kolonnekommentaren på
      // company_perioder). Et gensendt event må ALDRIG give to perioder
      // eller sætte kontrakten to gange.
      const eksisterende = await findIndgangsPeriode(adminClient, session.id);
      if (eksisterende) {
        // Også ved gensendelse: sæt cancel_at hvis abonnementet mangler det
        // — første forsøg kan være fejlet netop dér. Hjælperen springer selv
        // over hvis cancel_at allerede er sat, og kaster ellers ved fejl.
        if (session.mode === "subscription" && session.subscription) {
          await sikrOphoerPaaFornyelsesAbonnement(
            session.subscription,
            Deno.env.get("STRIPE_SECRET_KEY")!
          );
        }
        if (indgangCompany?.contract_end_date === eksisterende.periode_slut) {
          // Invitationen sikres også her: første forsøg kan være fejlet
          // EFTER kontrakten var sat (cancel_at) og FØR invitationen gik.
          // Idempotent — se _shared/sikrIndgangsInvitation.ts.
          await sikrIndgangsInvitation(adminClient, indgangCompanyId, session.id);
          console.log(`[stripe-webhook] Indgang ${session.id} allerede behandlet, springer over`);
          return new Response(JSON.stringify({ received: true, skipped: "already_processed" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        await skrivIndgangsKontrakt(adminClient, indgangCompanyId, eksisterende, grundbeloebOere, stripeCustomerId, " (gensendelse)");
        await nulstilIndgangsSession(adminClient, indgangCompanyId);
        // Kontrakten er nu fuldført — invitationen sikres før svaret, så
        // en gensendelse aldrig efterlader et betalt medlem uden login.
        await sikrIndgangsInvitation(adminClient, indgangCompanyId, session.id);
        console.log(
          `[stripe-webhook] Indgang ${session.id}: gensendelse fuldførte halvt udført arbejde — kontrakt ${eksisterende.periode_start} → ${eksisterende.periode_slut}`
        );
        return new Response(JSON.stringify({ received: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Kontrakten løber fra BETALINGSDAGEN, ikke fra underskriften
      // (docs/indgangen-design.md §1): aftalegrundlaget giver 30 dages
      // frist efter underskrift, og de dage skal ikke tages fra medlemmet.
      // Regnestykket er delt med invoice.paid-grenen (3/9).
      const periode = beregnIndgangsPeriode();

      // Perioden FØRST, virksomheden bagefter: fejler det andet, findes
      // perioden som spor af hvad der blev betalt. Fejler indsættelsen,
      // er intet sket, og Stripe forsøger igen.
      await opretIndgangsPeriode(adminClient, {
        company_id: indgangCompanyId,
        periode,
        beloeb_oere: beloebOere,
        betalingsmodel,
        stripe_reference: session.id,
      });

      // indgangspris_oere er LISTEPRISEN (grundbeloeb_oere), ikke det
      // betalte: ratetillægget er finansiering, ikke pris (rettelsen 1/9 i
      // docs/fornyelseskaeden-1-september.md). En der betaler 52.500 i tolv
      // rater er kommet ind på 50.000 og fornyer til 25.000.
      await skrivIndgangsKontrakt(adminClient, indgangCompanyId, periode, grundbeloebOere, stripeCustomerId, "");

      // Sessionen er brugt — pegeren på company_betalingslink nulstilles
      // (værnet mod dobbeltbetaling). Feltet bor på linkrækken, ikke på
      // companies, fordi opret-indgangs-checkout gemmer det dér.
      await nulstilIndgangsSession(adminClient, indgangCompanyId);

      // Ophør på rate-abonnementet — sættes her fordi Checkout ikke kan
      // (subscription_data[cancel_at] afvises med parameter_unknown), og
      // fordi abonnementets faktiske start først kendes nu. Samme hjælper
      // som fornyelsen: mekanikken er identisk (start + 12 måneder − 1 dag).
      // Fejler kaldet, kaster hjælperen → 500 → Stripe gensender; et
      // abonnement uden ophør må ikke passere i tavshed.
      if (session.mode === "subscription" && session.subscription) {
        await sikrOphoerPaaFornyelsesAbonnement(
          session.subscription,
          Deno.env.get("STRIPE_SECRET_KEY")!
        );
      }

      // ── INVITATIONEN — det led fornyelsen ikke har. Betalingen giver
      //    adgang (§21: to mails i to øjeblikke, aldrig samtidig). Står
      //    EFTER kontraktopdateringen og kaster aldrig (kontrakten er sat,
      //    pengene modtaget). Logikken bor i _shared/sikrIndgangsInvitation.ts
      //    og kaldes OGSÅ i begge udgange af gensendelsesgrenen ovenfor —
      //    før udtrækket nåede en gensendelse aldrig hertil, og fejlede
      //    cancel_at eller kontrakt-opdateringen i første forsøg, udeblev
      //    invitationen for evigt. Idempotent: pending-opslag +
      //    UNIQUE(company_id, email). ──
      await sikrIndgangsInvitation(adminClient, indgangCompanyId, session.id);

      // company_betalingslink røres IKKE: rækken bliver stående som historik,
      // og hent_betalingstilbud giver "betalt" af sig selv, nu hvor
      // contract_end_date er sat.

      console.log(
        `[stripe-webhook] Indgang for company ${indgangCompanyId}: ${beloebOere} øre (${betalingsmodel}), listepris ${grundbeloebOere} øre, kontrakt ${periode.periode_start} → ${periode.periode_slut}`
      );
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Begge checkout-functions sætter samme metadata-nøgler (user_id,
    // company_id) på sessionen, og Stripe sender checkout.session.completed
    // i BÅDE payment- og subscription-mode. Denne gren er 1:1-sessionskøbet
    // og må kun køre for engangsbetalinger — abonnements- (og setup-)
    // sessions ack'es med 200 uden handling, så Stripe ikke forsøger igen;
    // abonnementsadgangen håndteres af subscription-grenene ovenfor.
    if (session.mode !== "payment") {
      console.log(`[stripe-webhook] Skipping checkout.session.completed for session ${session.id} (mode: ${session.mode})`);
      return new Response(JSON.stringify({ received: true, skipped: "non_payment_mode" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = session.metadata?.user_id;
    const companyId = session.metadata?.company_id || null;
    const stripeSessionId = session.id;
    const paymentIntentId = session.payment_intent;

    if (!userId) {
      console.error("No user_id in session metadata");
      return new Response("Missing metadata", { status: 400 });
    }

    // Idempotency: check if we already processed this session
    const { data: existingBooking } = await adminClient
      .from("session_bookings")
      .select("status, calendly_booking_url")
      .eq("stripe_session_id", stripeSessionId)
      .maybeSingle();

    if (existingBooking?.calendly_booking_url) {
      console.log(`[stripe-webhook] Already processed session ${stripeSessionId}, skipping`);
      return new Response(JSON.stringify({ received: true, skipped: "already_processed" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generate Calendly single-use link
    const eventTypeUri = await getCalendlyEventTypeUri(calendlyApiKey, "1to1-session-45");
    const bookingUrl = await createCalendlySingleUseLink(calendlyApiKey, eventTypeUri);

    // Update booking record
    await adminClient
      .from("session_bookings")
      .update({
        status: "booking_sent",
        stripe_payment_intent_id: paymentIntentId,
        calendly_booking_url: bookingUrl,
      })
      .eq("stripe_session_id", stripeSessionId);

    // Get user email for notification
    const { data: userData } = await adminClient.auth.admin.getUserById(userId);
    const userEmail = userData?.user?.email;

    // Get profile for first name
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .maybeSingle();
    const firstName = profile?.full_name?.split(" ")[0] || "dig";

    // Send in-app notification
    await adminClient.from("notifications").insert({
      user_id: userId,
      company_id: companyId || null,
      type: "session_booked",
      priority: "important",
      title: "Din betaling er modtaget — book din session nu",
      body: "Klik her for at vælge et tidspunkt til din 1:1 session med Jonas.",
      deep_link: "/book-session",
      dedup_key: `session_booked:${stripeSessionId}`,
    });

    // Send email with booking link
    if (userEmail) {
      const subject = "Din 1:1 session med Jonas — vælg et tidspunkt";
      const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#1a1a2e;padding:28px 32px;text-align:center">
    <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:0.5px">The Boardroom</span>
  </div>
  <div style="padding:32px">
    <p style="color:#64748b;font-size:13px;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px">1:1 Session · Jonas Herlev</p>
    <h1 style="color:#1a1a2e;font-size:22px;margin:0 0 20px;font-weight:700">Hej ${firstName} — tak for din betaling!</h1>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 24px">Din betaling er bekræftet. Brug linket herunder til at vælge et tidspunkt der passer dig. Linket er personligt og kan kun bruges én gang.</p>
    <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:14px 18px;border-radius:8px;margin:0 0 28px">
      <p style="color:#15803d;font-size:14px;margin:0">Sessionen varer 45 minutter og afholdes online via Google Meet.</p>
    </div>
    <a href="${bookingUrl}" style="display:inline-block;background:#22c55e;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
      Vælg tidspunkt →
    </a>
  </div>
  <div style="padding:20px 32px;border-top:1px solid #f1f5f9;text-align:center">
    <p style="color:#94a3b8;font-size:12px;margin:0">
      The Boardroom · theboardroom.dk
    </p>
  </div>
</div>`;

      const messageId = crypto.randomUUID();
      await adminClient.from("email_send_log").insert({
        message_id: messageId,
        template_name: "session-booking-confirmation",
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
          text: `Hej ${firstName} — tak for din betaling. Book din session her: ${bookingUrl}`,
          purpose: "transactional",
          label: "session-booking-confirmation",
          queued_at: new Date().toISOString(),
        },
      });
    }

    console.log(`[stripe-webhook] Booking confirmed for user ${userId}, link: ${bookingUrl}`);
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[stripe-webhook] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
