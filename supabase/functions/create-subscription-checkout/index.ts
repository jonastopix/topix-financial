// Creates a Stripe Checkout session (subscription mode) for a company.
//
// Bucket A: authenticateUser → callerClient SELECT on companies (RLS gate)
// → Stripe call. RLS on `companies` already encodes "who may act for this
// company" (member of the company, or advisor via the advisor-wide read
// policy), so re-using it as the gate keeps the security model in one place.
// No service-role client is needed: the only DB reads (companies, own
// profile) are both reachable through the caller's own RLS.

import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { hentPrisId } from "../_shared/stripePris.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth (Bucket A) — MUST precede everything else ──
    const auth = await authenticateUser(req);
    if (auth instanceof Response) return auth;
    const { callerId, callerClient } = auth;

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

    const { company_id } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: "Missing company_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Authz via callerClient — RLS gates the company row ──
    // company_id comes from the request body; without this check any logged-in
    // member could start a subscription on another company's id. No row can
    // mean "doesn't exist" or "RLS denied" — do NOT differentiate, that would
    // leak existence info to unauthorised callers.
    const { data: company, error: companyError } = await callerClient
      .from("companies")
      .select("stripe_customer_id, name")
      .eq("id", company_id)
      .maybeSingle();

    if (companyError) {
      console.error("[create-subscription-checkout] company lookup failed:", companyError);
      throw new Error("Company lookup failed");
    }
    if (!company) {
      return new Response(JSON.stringify({ error: "Forbidden — no access to this company" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const APP_URL = "https://app.theboardroom.dk";
    // Opslag på lookup_key EFTER adgangstjekket mod callerClient — intet
    // Stripe-kald for en der alligevel afvises. Fejler opslaget, fejler
    // funktionen; aldrig fallback til et hardkodet id (id'er er
    // konto-specifikke, nøgler er roller — se _shared/stripePris.ts).
    const PRICE_ID = await hentPrisId("abonnement_maanedlig", stripeSecretKey);

    // Build Stripe Checkout session (subscription mode)
    const stripeBody = new URLSearchParams({
      "mode": "subscription",
      "line_items[0][price]": PRICE_ID,
      "line_items[0][quantity]": "1",
      "success_url": `${APP_URL}/?subscription=success`,
      "cancel_url": `${APP_URL}/?subscription=cancelled`,
      "automatic_tax[enabled]": "true",
      "tax_id_collection[enabled]": "true",
      "metadata[user_id]": callerId,
      "metadata[company_id]": company_id,
      "subscription_data[metadata][company_id]": company_id,
    });

    // Reuse existing Stripe customer if we have one; otherwise Checkout needs
    // the caller's e-mail, read from their own profile (self-only RLS).
    // profiles.email is nullable — fail loudly if it's missing rather than
    // sending an empty string: Stripe accepts that silently, the customer
    // gets no receipt, and the gap would only surface with a human.
    if (company.stripe_customer_id) {
      stripeBody.set("customer", company.stripe_customer_id);
    } else {
      const { data: profile } = await callerClient
        .from("profiles")
        .select("email")
        .eq("user_id", callerId)
        .maybeSingle();
      if (!profile?.email) {
        console.error(`[create-subscription-checkout] no profile email for caller ${callerId}`);
        throw new Error("Caller has no profile email — cannot create checkout without a receipt address");
      }
      stripeBody.set("customer_email", profile.email);
    }

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: stripeBody.toString(),
    });

    if (!stripeResponse.ok) {
      const err = await stripeResponse.text();
      console.error("[create-subscription-checkout] Stripe error:", err);
      throw new Error("Stripe checkout creation failed");
    }

    const session = await stripeResponse.json();

    console.log(`[create-subscription-checkout] Created session ${session.id} for company ${company_id}`);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[create-subscription-checkout] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
