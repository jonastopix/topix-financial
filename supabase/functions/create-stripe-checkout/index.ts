import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Get user profile and company
    // Maalt i produktion 13-08-2026: company_members.role er 24 'owner' / 13 'member'
    // af 37 raekker. Kolonnens default er 'owner'::text, og der findes INGEN
    // CHECK-constraint. handle_new_user tildeler 'member' ved invitation MED
    // company_id og 'owner' ved invitation UDEN company_id (der oprettes en ny
    // virksomhed) — 'owner' er altsaa netop founderen. Ingen RLS-policy og ingen
    // SQL-funktion i databasen laeser kolonnen; det er verificeret mod pg_policies
    // og pg_proc. Et filter .eq("role","member") rammer derfor systematisk forbi
    // founderen. Foersteoprettede raekke pr. virksomhed er founderen, jf. samme
    // loesning i PR #343 og #345.
    const { data: member } = await adminClient
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const APP_URL = "https://app.theboardroom.dk";
    const PRICE_ID = "price_1TJXmx4DoYItGRbIw9DSzmuW";

    // Create Stripe Checkout session
    const stripeBody = new URLSearchParams({
      "mode": "payment",
      "line_items[0][price]": PRICE_ID,
      "line_items[0][quantity]": "1",
      "success_url": `${APP_URL}/book-session?success=true&session_id={CHECKOUT_SESSION_ID}`,
      "cancel_url": `${APP_URL}/book-session?cancelled=true`,
      "customer_email": user.email!,
      "automatic_tax[enabled]": "true",
      "tax_id_collection[enabled]": "true",
      "metadata[user_id]": user.id,
      "metadata[company_id]": member?.company_id || "",
      "payment_intent_data[metadata][user_id]": user.id,
    });

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
      console.error("Stripe error:", err);
      throw new Error("Stripe checkout creation failed");
    }

    const session = await stripeResponse.json();

    // Log the pending booking
    await adminClient.from("session_bookings").insert({
      user_id: user.id,
      company_id: member?.company_id || null,
      stripe_session_id: session.id,
      amount_dkk: 500,
      status: "pending",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-stripe-checkout error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
