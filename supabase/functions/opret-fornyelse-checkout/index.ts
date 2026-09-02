// Opretter en Stripe Checkout-session for et udløbet medlems fornyelse.
//
// PRISEN KOMMER FRA VIRKSOMHEDENS GEMTE DATA — ALDRIG FRA KLIENTEN.
// Body bærer kun betalingsmodellen; beløb, lookup_key og virksomhed
// udledes serverside af kalderens egen virksomhed og dens gemte
// indgangspris/afvigelse. Grunden er fjortendagesvinduets beslutning
// (1/9): et tilbudslink udløber ikke, og derfor må et videresendt link
// ikke kunne give en anden kohortes pris — prisen slås op i det øjeblik
// der betales, ud fra den virksomhed kalderen faktisk hører til.
//
// Bucket A: authenticateUser → virksomhed udledes via callerClient (RLS)
// → service-role KUN til companies/company_fornyelse-læsningen
// (company_fornyelse er advisor-only; medlemmet må kun se resultatet).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { afgoerFornyelsestilstand } from "../_shared/fornyelse.ts";
import {
  beregnFornyelsespris,
  erFejl,
  type Betalingsmodel,
} from "../_shared/fornyelsespris.ts";
import { hentPrisId } from "../_shared/stripePris.ts";
import { udloebTidligereSession, udloebsTidspunkt } from "../_shared/checkoutSession.ts";

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
    // ── 1. Auth (Bucket A) — MUST precede any service-role construction ──
    const auth = await authenticateUser(req);
    if (auth instanceof Response) return auth;
    const { callerId, callerClient } = auth;

    // ── 2. Body: KUN betalingsmodellen. Intet company_id, intet beløb,
    //       ingen pris, ingen lookup_key — alt andet udledes serverside ──
    const { betalingsmodel } = await req.json();
    if (!MODELLER.includes(betalingsmodel)) {
      return jsonResponse({ error: "Ugyldig betalingsmodel" }, 400);
    }

    // ── 3. Udled virksomheden af KALDEREN — ældste company_members-række
    //       er founderen (jf. hent-fornyelsestilbud og PR #343/#345).
    //       Opslaget går via callerClient, så RLS afgør adgangen ──
    const { data: member, error: memberError } = await callerClient
      .from("company_members")
      .select("company_id")
      .eq("user_id", callerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memberError) {
      console.error("[opret-fornyelse-checkout] membership lookup failed:", memberError);
      throw new Error("Membership lookup failed");
    }
    if (!member?.company_id) {
      return jsonResponse({ error: "Du er ikke tilknyttet en virksomhed." }, 403);
    }
    const company_id = member.company_id;

    // ── 4. Service-role — nødvendig her: company_fornyelse er advisor-only ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: company, error: companyError } = await adminClient
      .from("companies")
      .select(
        "contract_end_date, subscription_status, subscription_current_period_end, indgangspris_oere, fornyelsespris_oere, stripe_customer_id, sidste_checkout_session_id"
      )
      .eq("id", company_id)
      .maybeSingle();

    if (companyError || !company) {
      console.error("[opret-fornyelse-checkout] company lookup failed:", companyError);
      throw new Error("Company lookup failed");
    }

    const { data: fornyelse, error: fornyelseError } = await adminClient
      .from("company_fornyelse")
      .select("beslutning")
      .eq("company_id", company_id)
      .maybeSingle();

    if (fornyelseError) {
      console.error("[opret-fornyelse-checkout] fornyelse lookup failed:", fornyelseError);
      throw new Error("Fornyelse lookup failed");
    }

    // ── 5. Kun "udloebet_tilbyd" må betale. klar_til_tilbud er bevidst
    //       udelukket: fornyelse betales EFTER udløb, ikke før (ordningens
    //       §1, besluttet 1/9) — tilbuddet kommunikeres i vinduet op til
    //       udløb, men betalingen hører til efter slutdatoen. Alt andet
    //       (ophoert, tilbyd_ikke, selvbetjener, aktive medlemmer) afvises
    //       med samme neutrale besked, så svaret ikke røber kategorien ──
    const tilstand = afgoerFornyelsestilstand({
      contract_end_date: company.contract_end_date ?? null,
      subscription_status: company.subscription_status ?? null,
      subscription_current_period_end: company.subscription_current_period_end ?? null,
      beslutning: fornyelse?.beslutning ?? null,
    });
    if (tilstand.status !== "udloebet_tilbyd") {
      return jsonResponse({ error: "Fornyelse er ikke tilgængelig." }, 403);
    }

    // ── 6. Prisen fra virksomhedens gemte data ──
    const pris = beregnFornyelsespris({
      indgangspris_oere: company.indgangspris_oere ?? null,
      fornyelsespris_oere: company.fornyelsespris_oere ?? null,
      betalingsmodel: betalingsmodel as Betalingsmodel,
    });
    if (erFejl(pris)) {
      // Datafejl en rådgiver skal opdage — ikke noget medlemmet skal se.
      console.error(
        `[opret-fornyelse-checkout] prisberegning fejlede for company ${company_id}: ${pris.grund} — ${pris.detalje}`
      );
      throw new Error("Renewal price could not be computed");
    }

    // ── 7. Price-id via lookup_key — aldrig et hardkodet id ──
    const priceId = await hentPrisId(pris.lookup_key, stripeSecretKey);

    // ── 7b. Værnet mod dobbeltbetaling (_shared/checkoutSession.ts):
    //        udløb virksomhedens seneste session FØR en ny oprettes.
    //        Hjælperen kaster aldrig ──
    await udloebTidligereSession(company.sidste_checkout_session_id, stripeSecretKey);

    // ── 8. Checkout-sessionen ──
    const mode = betalingsmodel === "fuld" ? "payment" : "subscription";
    const stripeBody = new URLSearchParams({
      "mode": mode,
      // Kort levetid (30 min, Stripes minimum) — se _shared/checkoutSession.ts.
      "expires_at": String(udloebsTidspunkt()),
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "success_url": `${APP_URL}/?fornyelse=success`,
      "cancel_url": `${APP_URL}/?fornyelse=cancelled`,
      "automatic_tax[enabled]": "true",
      "tax_id_collection[enabled]": "true",
      "metadata[user_id]": callerId,
      "metadata[company_id]": company_id,
      "metadata[art]": "fornyelse",
      "metadata[betalingsmodel]": betalingsmodel,
      "metadata[grundbeloeb_oere]": String(pris.grundbeloeb_oere),
      // Faktisk betalt for perioden (rate12 bærer 5 %-tillægget) — webhooken
      // skriver denne til company_perioder.beloeb_oere, jf. kolonnens
      // semantik. grundbeloeb_oere beholdes som aftalens grundbeløb.
      "metadata[samlet_oere]": String(pris.samlet_oere),
    });

    if (mode === "subscription") {
      // ── 9. KRITISK: ophør efter N træk. Prisen bærer IKKE selv et ophør —
      //       rate2 er en 6-måneders-pris og rate12 en månedspris, og et
      //       abonnement på dem fornyer i det uendelige uden et cancel_at.
      //
      //       Ophøret sættes IKKE her: subscription_data[cancel_at] findes
      //       ikke som Checkout-parameter (Stripe afviser den med
      //       parameter_unknown, målt i produktion), og abonnementets
      //       faktiske starttidspunkt kendes først når det er oprettet —
      //       ved betalingen, ikke ved sessionens oprettelse. Derfor sætter
      //       stripe-webhook cancel_at på abonnementet når det findes.
      //       Metadata her (art + betalingsmodel) gør at abonnementet selv
      //       bærer hvad det er, så webhooken kan kende det ──
      stripeBody.set("subscription_data[metadata][company_id]", company_id);
      stripeBody.set("subscription_data[metadata][art]", "fornyelse");
      stripeBody.set("subscription_data[metadata][betalingsmodel]", betalingsmodel);
    }

    // Genbrug eksisterende Stripe-kunde; ellers skal Checkout bære kalderens
    // e-mail fra egen profil (self-only RLS). profiles.email er nullable —
    // fejl højt frem for en tom streng, som Stripe accepterer tavst (samme
    // begrundelse som i create-subscription-checkout).
    if (company.stripe_customer_id) {
      stripeBody.set("customer", company.stripe_customer_id);
    } else {
      const { data: profile } = await callerClient
        .from("profiles")
        .select("email")
        .eq("user_id", callerId)
        .maybeSingle();
      if (!profile?.email) {
        console.error(`[opret-fornyelse-checkout] no profile email for caller ${callerId}`);
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
      console.error("[opret-fornyelse-checkout] Stripe error:", err);
      throw new Error("Stripe checkout creation failed");
    }

    const session = await stripeResponse.json();

    console.log(
      `[opret-fornyelse-checkout] Created ${mode} session ${session.id} for company ${company_id} (${betalingsmodel})`
    );

    // ── 9b. Gem session-id'et, så næste kald kan udløbe det. Fejler
    //        skrivningen, logges det tydeligt — men url'en returneres ──
    const { error: gemErr } = await adminClient
      .from("companies")
      .update({ sidste_checkout_session_id: session.id })
      .eq("id", company_id);
    if (gemErr) {
      console.error(
        `[opret-fornyelse-checkout] KUNNE IKKE GEMME session ${session.id} på companies for ${company_id} — værnet mod dobbeltbetaling dækker ikke denne session:`,
        gemErr,
      );
    }

    // ── 10. ──
    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error("[opret-fornyelse-checkout] Error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
