// Serverside afgørelse af et udløbet medlems fornyelsestilbud — til
// MembershipExpiredGate.
//
// HVORFOR SERVERSIDE: beslutningen om HVEM der får et tilbud ligger i
// company_fornyelse, som er advisor-only i RLS. Medlemmet må aldrig se
// beslutningen (eller noten) — kun resultatet. At sende beslutningen med
// ned i browseren og filtrere dér er en kendt fejlklasse i dette repo:
// create-stripe-checkout havde frem til 13-08-2026 hele sin adgangsgrænse
// i en UI-skærm (BookSession.tsx:28), som enhver kunne gå uden om ved at
// kalde funktionen direkte. Klient-filter som eneste beskyttelse tæller
// derfor ikke. Svaret indeholder KUN resultatet: { tilbud: null } eller
// prismulighederne — aldrig beslutning, note eller indgangspris. 'tilbyd_ikke',
// "ingen beslutning truffet" og et lukket tilbudsvindue giver samme svar og
// kan ikke skelnes.
//
// HVEM der får et tilbud afgøres af MOTOREN (afgoerFornyelsestilstand, spejlet
// fra src/lib/fornyelse.ts): kun status udloebet_tilbyd. Før 7/9 tjekkede
// funktionen selv tier og beslutning og gav derfor et tilbud uanset hvor
// længe siden slutdatoen var — det hul lukker tilbudsvinduet (14 dage efter
// udløb, kun efter tilbyd; derefter udloebet_vindue_lukket).
//
// Bucket A: authenticateUser → virksomhed udledes via callerClient (RLS)
// → service-role KUN til companies/company_fornyelse-læsningen, som er
// nødvendig netop fordi company_fornyelse er advisor-only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { afgoerFornyelsestilstand } from "../_shared/fornyelse.ts";
import {
  beregnFornyelsespris,
  erFejl,
  type Betalingsmodel,
} from "../_shared/fornyelsespris.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MODELLER: Betalingsmodel[] = ["fuld", "rate2", "rate12"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── 1. Auth (Bucket A) — MUST precede any service-role construction ──
    const auth = await authenticateUser(req);
    if (auth instanceof Response) return auth;
    const { callerId, callerClient } = auth;

    // ── 2. Udled virksomheden af KALDEREN — ingen parametre ──
    // Funktionen tager bevidst intet company_id fra body: et body-id kunne
    // misbruges til at slå en fremmed virksomheds tilbud op, og det var
    // netop hullet der blev lukket i create-subscription-checkout (#479).
    // Ældste company_members-række er founderen, jf. create-stripe-checkout
    // linje 38-46 (PR #343/#345-mønstret). Opslaget går via callerClient,
    // så RLS afgør hvad kalderen overhovedet kan se.
    const { data: member, error: memberError } = await callerClient
      .from("company_members")
      .select("company_id")
      .eq("user_id", callerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memberError) {
      console.error("[hent-fornyelsestilbud] membership lookup failed:", memberError);
      throw new Error("Membership lookup failed");
    }
    if (!member?.company_id) {
      return jsonResponse({ error: "Du er ikke tilknyttet en virksomhed." }, 403);
    }
    const company_id = member.company_id;

    // ── 3. Service-role — nødvendig præcis her: company_fornyelse er
    //       advisor-only i RLS, og medlemmet må kun se resultatet ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: company, error: companyError } = await adminClient
      .from("companies")
      .select(
        "contract_end_date, subscription_status, subscription_current_period_end, indgangspris_oere, fornyelsespris_oere"
      )
      .eq("id", company_id)
      .maybeSingle();

    if (companyError || !company) {
      console.error("[hent-fornyelsestilbud] company lookup failed:", companyError);
      throw new Error("Company lookup failed");
    }

    const { data: fornyelse, error: fornyelseError } = await adminClient
      .from("company_fornyelse")
      .select("beslutning")
      .eq("company_id", company_id)
      .maybeSingle();

    if (fornyelseError) {
      console.error("[hent-fornyelsestilbud] fornyelse lookup failed:", fornyelseError);
      throw new Error("Fornyelse lookup failed");
    }

    // ── 4+5. Motoren afgør om der er et tilbud: KUN udloebet_tilbyd
    //       (udløbet, beslutning tilbyd, højst 14 dage efter slutdato).
    //       Ikke-udløbet, tilbyd_ikke, "ingen række" (ophoert) og lukket
    //       vindue (udloebet_vindue_lukket) giver samme svar — de må ikke
    //       kunne skelnes. Samme dom som opret-fornyelse-checkout, så
    //       tilbud og betaling aldrig er uenige ──
    const tilstand = afgoerFornyelsestilstand({
      contract_end_date: company.contract_end_date ?? null,
      subscription_status: company.subscription_status ?? null,
      subscription_current_period_end: company.subscription_current_period_end ?? null,
      beslutning: fornyelse?.beslutning ?? null,
    });
    if (tilstand.status !== "udloebet_tilbyd") {
      return jsonResponse({ tilbud: null });
    }

    // ── 6. Beregn de tre betalingsmodeller; kun ok-resultater returneres ──
    const muligheder: Array<{
      betalingsmodel: Betalingsmodel;
      samlet_oere: number;
      rate_oere: number;
      antal_traek: number;
      lookup_key: string;
    }> = [];
    let grundbeloeb_oere: number | null = null;
    const fejlgrunde: string[] = [];

    for (const betalingsmodel of MODELLER) {
      const r = beregnFornyelsespris({
        indgangspris_oere: company.indgangspris_oere ?? null,
        fornyelsespris_oere: company.fornyelsespris_oere ?? null,
        betalingsmodel,
      });
      if (erFejl(r)) {
        fejlgrunde.push(`${betalingsmodel}: ${r.grund} — ${r.detalje}`);
        continue;
      }
      grundbeloeb_oere = r.grundbeloeb_oere;
      muligheder.push({
        betalingsmodel,
        samlet_oere: r.samlet_oere,
        rate_oere: r.rate_oere,
        antal_traek: r.antal_traek,
        lookup_key: r.lookup_key,
      });
    }

    if (muligheder.length === 0 || grundbeloeb_oere === null) {
      // Beslutningen siger 'tilbyd', men der findes ingen gyldig pris — det
      // er en datafejl en rådgiver skal opdage, ikke noget medlemmet skal se.
      console.error(
        `[hent-fornyelsestilbud] 'tilbyd' uden gyldig pris for company ${company_id}: ${fejlgrunde.join("; ")}`
      );
      return jsonResponse({ tilbud: null });
    }

    return jsonResponse({ tilbud: { grundbeloeb_oere, muligheder } });
  } catch (err) {
    console.error("[hent-fornyelsestilbud] Error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
