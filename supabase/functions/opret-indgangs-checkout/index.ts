// Opretter en Stripe Checkout-session for et NYT medlems indgangsbetaling.
//
// KALDEREN HAR INGEN SESSION. Personen har ikke en konto endnu — de kommer
// fra dag 0-mailen via /betal?token=<uuid>. Legitimationen er tokenet,
// verificeret af verifyBetalingstoken (_shared/betalingstokenAuth.ts), som
// kalder public.hent_betalingsdata_til_checkout(uuid): SECURITY DEFINER,
// EXECUTE kun til service_role, svarer KUN når betaling er tilladt.
// Derfor service-role-klient FØRST, og prædikatet FØR alt andet — samme
// invariant som husets webhooks (signaturen verificeres før parsing).
//
// PRISEN KOMMER FRA VIRKSOMHEDENS GEMTE DATA — ALDRIG FRA KLIENTEN.
// Body bærer kun token og betalingsmodel; prisniveau, lookup_key og
// virksomhed udledes serverside af company_betalingslink-rækken. Et
// videresendt link kan derfor ikke give en anden virksomheds pris (§15).
//
// Forlæg: opret-fornyelse-checkout — samme Stripe-kald, samme metadata-
// form, samme regel om at cancel_at IKKE sættes her.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { verifyBetalingstoken } from "../_shared/betalingstokenAuth.ts";
import {
  beregnIndgangspris,
  erFejl,
  type Betalingsmodel,
} from "../_shared/indgangspris.ts";
import { hentPrisId } from "../_shared/stripePris.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MODELLER: readonly Betalingsmodel[] = ["fuld", "rate2", "rate12"];
const APP_URL = "https://app.theboardroom.dk";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── 1. Body: KUN token og betalingsmodel. Intet company_id, intet
    //       beløb, ingen pris, ingen lookup_key — alt andet udledes ──
    const body = await req.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const betalingsmodel = body?.betalingsmodel;
    if (!token) {
      return jsonResponse({ error: "Manglende token" }, 400);
    }
    if (!MODELLER.includes(betalingsmodel)) {
      return jsonResponse({ error: "Ugyldig betalingsmodel" }, 400);
    }

    // ── 2. Legitimation FØRST — tokenet er kalderens bevis. null = må
    //       ikke betale, uanset grund; grunden røbes ikke (samme neutrale
    //       svar som opret-fornyelse-checkout giver ved afvisning) ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const betalingsdata = await verifyBetalingstoken(token, adminClient);
    if (!betalingsdata) {
      return jsonResponse({ error: "Betaling er ikke tilgængelig." }, 403);
    }
    const { company_id, kontakt_email, prisniveau_oere } = betalingsdata;

    // ── 3. Prisen fra virksomhedens gemte niveau (spejlet motor) ──
    const pris = beregnIndgangspris({
      prisniveau_oere,
      betalingsmodel: betalingsmodel as Betalingsmodel,
    });
    if (erFejl(pris)) {
      // Datafejl en rådgiver skal opdage — prisniveauet på rækken matcher
      // ikke Stripe-kataloget. Ikke noget den besøgende skal se.
      console.error(
        `[opret-indgangs-checkout] prisberegning fejlede for company ${company_id}: ${pris.grund} — ${pris.detalje}`,
      );
      throw new Error("Entry price could not be computed");
    }

    // ── 4. Price-id via lookup_key — aldrig et hardkodet id ──
    const priceId = await hentPrisId(pris.lookup_key, stripeSecretKey);

    // ── 5. Checkout-sessionen ──
    const mode = betalingsmodel === "fuld" ? "payment" : "subscription";
    const tokenParam = encodeURIComponent(token);
    const stripeBody = new URLSearchParams({
      "mode": mode,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      // Tilbage til betalingssiden, som selv slår status op. betalt=1 er
      // et hint til siden om at betalingen lige er sket; dommen "betalt"
      // kommer fra databasen når webhooken har skrevet contract_end_date.
      "success_url": `${APP_URL}/betal?token=${tokenParam}&betalt=1`,
      "cancel_url": `${APP_URL}/betal?token=${tokenParam}`,
      "automatic_tax[enabled]": "true",
      "tax_id_collection[enabled]": "true",
      // Ingen Stripe-kunde findes endnu: den oprettes af Checkout ud fra
      // customer_email. SQL-funktionen svarer kun når mailen findes, så
      // feltet er aldrig tomt her.
      "customer_email": kontakt_email,
      "metadata[company_id]": company_id,
      "metadata[art]": "indgang",
      "metadata[betalingsmodel]": betalingsmodel,
      "metadata[grundbeloeb_oere]": String(pris.grundbeloeb_oere),
      // Faktisk betalt (rate12 bærer 5 %-tillægget); grundbeloeb_oere er
      // listeprisen og bliver companies.indgangspris_oere ved betaling.
      "metadata[samlet_oere]": String(pris.samlet_oere),
    });

    if (mode === "subscription") {
      // ── 6. KRITISK: ophør efter N træk. Prisen bærer IKKE selv et ophør —
      //       rate2 er en 6-måneders-pris og rate12 en månedspris, og et
      //       abonnement på dem fornyer i det uendelige uden et cancel_at.
      //
      //       Ophøret sættes IKKE her: subscription_data[cancel_at] findes
      //       ikke som Checkout-parameter (Stripe afviser den med
      //       parameter_unknown, målt i produktion 1/9), og abonnementets
      //       faktiske starttidspunkt kendes først når det er oprettet —
      //       ved betalingen. Derfor sætter stripe-webhook cancel_at på det
      //       oprettede abonnement ud fra dets start_date.
      //
      //       Regnestykket: rate2 trækker i måned 0 og 6, rate12 i måned
      //       0–11; næste træk ville i begge tilfælde falde i måned 12.
      //       cancel_at skal ligge EFTER sidste aftalte træk og FØR det
      //       næste — altså start + 12 måneder MINUS 1 dag. (En tidligere
      //       version brugte PLUS 1 dag og ville have givet rate12 et
      //       trettende træk.) Metadata her gør at abonnementet selv bærer
      //       hvad det er, så webhooken kan kende det ──
      stripeBody.set("subscription_data[metadata][company_id]", company_id);
      stripeBody.set("subscription_data[metadata][art]", "indgang");
      stripeBody.set("subscription_data[metadata][betalingsmodel]", betalingsmodel);
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
      console.error("[opret-indgangs-checkout] Stripe error:", err);
      throw new Error("Stripe checkout creation failed");
    }

    const session = await stripeResponse.json();

    console.log(
      `[opret-indgangs-checkout] Created ${mode} session ${session.id} for company ${company_id} (${betalingsmodel})`,
    );

    // ── 7. ──
    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error("[opret-indgangs-checkout] Error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
