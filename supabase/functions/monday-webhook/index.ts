// Monday-webhook — «Godkendt» på Ansøgninger opretter virksomheden, sætter
// prisniveauet, genererer betalingstokenet og udløser dag 0-mailen.
// Bucket C: HMAC-SHA256-signaturen verificeres FØR noget andet (uændret).
//
// OMSKREVET 2/9 — tre målte fejl:
//
//   1. Kolonne-id'et `e_mail` fandtes ikke på et eneste af de 50 boards
//      API'et returnerer; på Ansøgninger hedder mailkolonnen `email`.
//      Monday fejler ikke på et ukendt id — den udelader det fra svaret —
//      så opslaget gav undefined, og webhooken svarede { skipped: true,
//      reason: "no_contact_email" } med 200 for hver ansøgning. Den har
//      derfor aldrig fundet nogen at invitere. Id'erne står nu målt og
//      navngivet i _shared/mondayAnsoegning.ts (ANSOEGNING_KOLONNER).
//   2. Navnet ligger i to kolonner (Fornavn, Efternavn) og blev ikke
//      læst. Nu bliver det companies.contact_person, som dag 0-mailen
//      bruger til tiltalen.
//   3. Gaten var «I gang». Den status var make.coms ekko EFTER en
//      betaling på den gamle Stripe-konto — ikke en menneskehandling.
//      Underskriften er «Godkendt» (docs/indgangen-design.md §8).
//
// DEN GAMLE INVITATIONSVEJ ER FJERNET: grenen oprettede en
// company_invitations-række med company_id: null og kaldte
// send-invitation-email. Invitationen sendes nu af stripe-webhook EFTER
// betaling (§21 — to mails i to øjeblikke, aldrig samtidig). En
// invitation ved godkendelse ville give adgang uden betaling: en
// virksomhed uden kontraktdatoer giver computeMembershipTier «no_date»,
// som useAuth oversætter til «full». Rådgiver-opslaget (user_roles
// limit 1 uden order) var kun til invited_by og er væk med den.
//
// KONTRAKTDATOER SÆTTES IKKE HER. opretEllerGenbrugVirksomhed tager dem
// ikke imod, og det er værnet: tre steder læser contract_end_date som
// «har betalt». De skrives af stripe-webhook på betalingsdagen (§1).
//
// DAG 0 udløses i samme proces via _shared/indgangsBetalingsmail.ts — ikke
// som HTTP-kald til send-indgangs-betalingsmail, som står bag
// verify_jwt = true og ikke kan nås med edge-runtimens sb_secret-nøgle
// (se det moduls filhoved). Modulet afgør selv om det bliver
// betalingsmailen (pris sat) eller rådgivermailen (pris mangler, §17).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { opretEllerGenbrugVirksomhed } from "../_shared/virksomhedsOprettelse.ts";
import { udloesIndgangsBetalingsmail } from "../_shared/indgangsBetalingsmail.ts";
import {
  ANSOEGNING_KOLONNE_IDS,
  ANSOEGNINGER_BOARD_ID,
  bygKontaktnavn,
  laesAnsoegningsFelter,
  laesStatusTekst,
  parsePrisKontraktOere,
  type MondayKolonneVaerdi,
} from "../_shared/mondayAnsoegning.ts";

// ── Kolonnerne, navngivet øverst (målt 2/9 på «Ansøgninger», board 1899777797).
//    Id'erne og fælden med `short_text` (Fornavn her, «Kontaktperson» på
//    Legat-ansøgninger) står ved konstanten i _shared/mondayAnsoegning.ts.
const KOLONNE_IDS = ANSOEGNING_KOLONNE_IDS;

/**
 * Statusværdien der udløser: underskriften. Alle andre statusser logges
 * og ignoreres — herunder «Medlem» og «I gang». De to var make.coms
 * registrering af en betaling uden for platformen (den gamle Stripe-
 * konto), ikke en menneskehandling, og den betalingsvej findes ikke mere:
 * vores egen stripe-webhook registrerer betalingen. Loggen er der, så det
 * kan ses hvornår make.com holder op med at sende dem.
 */
const UDLOESENDE_STATUS = "Godkendt";

// HMAC-SHA256 verification for Monday.com webhook JWT
async function verifyMondayJwt(authHeader: string | null, signingSecret: string): Promise<boolean> {
  if (!authHeader) return false;

  try {
    const parts = authHeader.split(".");
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, signatureB64] = parts;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signingSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureStr = signatureB64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = signatureStr.length % 4;
    const paddedSig = pad ? signatureStr + "=".repeat(4 - pad) : signatureStr;
    const sigBytes = Uint8Array.from(atob(paddedSig), (c) => c.charCodeAt(0));

    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, data);

    return valid;
  } catch (e) {
    console.error("JWT verification error:", e);
    return false;
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Henter alle ansøgningens kolonner for ét item. Kaster ved API-fejl. */
async function hentAnsoegningsKolonner(itemId: number, apiToken: string): Promise<MondayKolonneVaerdi[]> {
  const ids = KOLONNE_IDS.map((id) => `"${id}"`).join(", ");
  const query = `query {
    items(ids: [${itemId}]) {
      column_values(ids: [${ids}]) {
        id
        text
        value
      }
    }
  }`;

  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiToken,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Monday API error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Monday GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  const columns = json.data?.items?.[0]?.column_values;
  if (!Array.isArray(columns)) {
    throw new Error(`Monday item ${itemId} not found or has no column_values`);
  }
  return columns.map((c: { id: string; text?: string | null; value?: string | null }) => ({
    id: c.id,
    text: c.text ?? null,
    value: c.value ?? null,
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Handle Monday.com webhook challenge verification (must be publicly reachable)
    if (body.challenge) {
      console.log("Monday webhook challenge received");
      return jsonResponse({ challenge: body.challenge });
    }

    // ── SIGNATURE VERIFICATION (required for all event processing) ──
    const MONDAY_SIGNING_SECRET = Deno.env.get("MONDAY_SIGNING_SECRET");
    if (!MONDAY_SIGNING_SECRET) {
      console.error("MONDAY_SIGNING_SECRET not configured — refusing to process webhook");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.warn("Missing Authorization header on Monday webhook event");
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const isValid = await verifyMondayJwt(authHeader, MONDAY_SIGNING_SECRET);
    if (!isValid) {
      console.error("Invalid Monday.com webhook signature");
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    console.log("Monday.com webhook signature verified");

    const event = body.event;
    if (!event) {
      return jsonResponse({ error: "No event in payload" }, 400);
    }

    const pulseId = Number(event.pulseId);
    const pulseName = String(event.pulseName ?? "");
    const boardId = event.boardId !== undefined ? Number(event.boardId) : null;
    const status = laesStatusTekst(event.value);
    console.log(`[monday-webhook] event: boardId=${boardId} pulseId=${pulseId} pulseName="${pulseName}" status="${status}"`);

    // ── A. GATEN: kun «Godkendt». Alt andet logges og ignoreres — se
    //       UDLOESENDE_STATUS for hvorfor «Medlem» og «I gang» er med i
    //       «alt andet». ──
    if (status !== UDLOESENDE_STATUS) {
      console.log(`[monday-webhook] status "${status}" udløser intet (pulseId=${pulseId}, "${pulseName}") — ignoreret`);
      return jsonResponse({ ok: true, skipped: true, reason: "status_uden_handling", status });
    }

    // Kolonne-id'erne gælder KUN Ansøgninger: `short_text` betyder noget
    // andet på Legat-ansøgninger. Et event fra et andet board må ikke
    // oprette en virksomhed på forkerte felter. Mangler boardId i
    // eventet, fortsættes der (ældre payload-form).
    if (boardId !== null && boardId !== ANSOEGNINGER_BOARD_ID) {
      console.error(`[monday-webhook] «Godkendt» fra board ${boardId}, ikke Ansøgninger (${ANSOEGNINGER_BOARD_ID}) — ignoreret`);
      return jsonResponse({ ok: true, skipped: true, reason: "forkert_board", board_id: boardId });
    }

    if (!Number.isFinite(pulseId) || pulseId <= 0) {
      return jsonResponse({ error: "Ugyldigt pulseId i event" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MONDAY_API_TOKEN = Deno.env.get("MONDAY_API_TOKEN");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }
    if (!MONDAY_API_TOKEN) {
      // Uden token kan item'et ikke læses, og uden mail kan intet ske.
      // 500, så det ses — ikke et stille skip.
      console.error("[monday-webhook] MONDAY_API_TOKEN not set — kan ikke læse ansøgningen");
      return jsonResponse({ error: "MONDAY_API_TOKEN not configured" }, 500);
    }

    // ── B1. Alle kolonner for item'et ──
    const kolonner = await hentAnsoegningsKolonner(pulseId, MONDAY_API_TOKEN);
    const felter = laesAnsoegningsFelter(kolonner);

    // ── B2. Uden mail kan intet sendes — hverken dag 0 eller invitationen
    //        efter betaling (hent_betalingsdata_til_checkout svarer kun når
    //        contact_email findes). ──
    if (!felter.email) {
      console.error(
        `[monday-webhook] «Godkendt» for "${pulseName}" (pulseId=${pulseId}) uden e-mail i kolonnen «email» — intet oprettet, intet sendt. Sæt mailen på Monday og sæt status til «Godkendt» igen.`,
      );
      return jsonResponse({ ok: true, skipped: true, reason: "ingen_email", item_id: pulseId });
    }

    const kontaktnavn = bygKontaktnavn(felter.fornavn, felter.efternavn);
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── B3+B4. Virksomheden — den delte vej (samme som import-application).
    //           INGEN kontraktdatoer: hjælperen tager dem ikke imod. ──
    const oprettet = await opretEllerGenbrugVirksomhed(
      {
        company_name: pulseName || felter.email,
        cvr_number: felter.cvr,
        website: felter.hjemmeside,
        phone: felter.telefon,
        industry_label: felter.branche,
        current_situation: felter.nuvaerendeSituation,
        goals: felter.maal,
        help_needed: felter.hjaelp,
        annual_revenue: felter.aarligOmsaetning,
        revenue_interval: felter.omsaetningsinterval,
        contact_name: kontaktnavn,
        contact_email: felter.email,
        application_date: felter.ansoegningsdato,
      },
      adminClient,
    );
    const companyId = oprettet.company_id;
    console.log(
      `[monday-webhook] virksomhed ${oprettet.genbrugt ? "genbrugt" : "oprettet"}: ${companyId} «${oprettet.company_name}» (CVR ${felter.cvr ?? "ukendt"})`,
    );

    // ── B5. contact_person i en separat opdatering. Målt 2/9: feltet blev
    //        skrevet af INGEN, og dag 0-mailen læser det for fornavnet.
    //        Rækkebyggeren bærer det ikke (låst feltliste), så det sættes
    //        her. Adressen fra Monday følger med af samme grund: rækken
    //        har heller ikke address/postal_code/city. Kun ikke-tomme
    //        felter skrives, så en genbrugt virksomhed ikke får tomme
    //        værdier over eksisterende. ──
    const opdatering: Record<string, string> = {};
    if (kontaktnavn) opdatering.contact_person = kontaktnavn;
    if (felter.adresse) opdatering.address = felter.adresse;
    if (felter.postnummer) opdatering.postal_code = felter.postnummer;
    if (felter.by) opdatering.city = felter.by;
    if (Object.keys(opdatering).length > 0) {
      const { error: kontaktErr } = await adminClient.from("companies").update(opdatering).eq("id", companyId);
      if (kontaktErr) {
        // Ikke fatalt: virksomheden findes. Mailen bliver upersonlig
        // («Kære,»), og det skal ses i loggen.
        console.error(`[monday-webhook] kunne ikke sætte contact_person/adresse på ${companyId}:`, kontaktErr);
      }
    } else {
      console.warn(`[monday-webhook] hverken Fornavn eller Efternavn udfyldt for ${companyId} — dag 0-mailen åbner med «Kære,»`);
    }

    // ── B6. Prisniveauet fra «Pris (kontrakt)» — text, parses robust.
    //        Ulæseligt eller tomt → null → afventer_pris → rådgivermail. ──
    const prisniveauOere = parsePrisKontraktOere(felter.prisKontraktTekst);
    if (prisniveauOere === null) {
      console.warn(
        `[monday-webhook] «Pris (kontrakt)» = ${JSON.stringify(felter.prisKontraktTekst)} kunne ikke læses for ${companyId} — prisniveau_oere = null, rådgiveren får besked`,
      );
    }

    // ── B7. Linkrækken: company_id, prisniveau_oere, underskrevet_at = now().
    //        Tokenet genereres af databasen (gen_random_uuid). Findes rækken
    //        (PK-konflikt, 23505), er det et gentaget «Godkendt»: spring
    //        over og log — rækken og dens stempler bevares, det er
    //        idempotensen. ──
    let linkOprettet = false;
    const { error: linkErr } = await adminClient.from("company_betalingslink").insert({
      company_id: companyId,
      prisniveau_oere: prisniveauOere,
      underskrevet_at: new Date().toISOString(),
    });
    if (linkErr) {
      if (linkErr.code === "23505") {
        console.log(`[monday-webhook] company_betalingslink findes allerede for ${companyId} — gentaget «Godkendt», rækken bevares`);
      } else {
        // Uden linkrække er der intet token og ingen frist; dag 0 kan ikke
        // sendes. Virksomheden ER oprettet — det logges, og der kastes så
        // Monday viser fejlen.
        console.error(`[monday-webhook] kunne ikke oprette company_betalingslink for ${companyId}:`, linkErr);
        throw new Error(`Kunne ikke oprette betalingslink for ${companyId}: ${linkErr.message}`);
      }
    } else {
      linkOprettet = true;
    }

    // ── B8. Dag 0 — modulet afgør selv: betalingsmail (pris sat) eller
    //        rådgivermail (pris mangler), og springer over hvis mailen
    //        allerede er sendt. Fejler det, logges det og der FORTSÆTTES:
    //        virksomheden er oprettet og rulles ikke tilbage. Mailen kan
    //        udløses igen gennem send-indgangs-betalingsmail. ──
    let mailUdloest = false;
    let mailSvar: Record<string, unknown> = {};
    try {
      const dag0 = await udloesIndgangsBetalingsmail(companyId, adminClient);
      mailSvar = dag0.body;
      mailUdloest = dag0.status === 200 && dag0.body.sent === true;
      if (dag0.status !== 200) {
        console.error(`[monday-webhook] dag 0 fejlede for ${companyId} (status ${dag0.status}):`, JSON.stringify(dag0.body));
      } else {
        console.log(`[monday-webhook] dag 0 for ${companyId}:`, JSON.stringify(dag0.body));
      }
    } catch (mailErr) {
      console.error(`[monday-webhook] dag 0 kastede for ${companyId} — virksomheden er oprettet, mailen skal udløses igen via send-indgangs-betalingsmail:`, mailErr);
      mailSvar = { error: mailErr instanceof Error ? mailErr.message : String(mailErr) };
    }

    // ── B9. ──
    return jsonResponse({
      ok: true,
      company_id: companyId,
      company_name: oprettet.company_name,
      genbrugt: oprettet.genbrugt,
      betalingslink_oprettet: linkOprettet,
      prisniveau_oere: prisniveauOere,
      mail_udloest: mailUdloest,
      mail: mailSvar,
      monday_item: pulseName,
    });
  } catch (error: unknown) {
    console.error("Monday webhook error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: errorMessage }, 500);
  }
});
