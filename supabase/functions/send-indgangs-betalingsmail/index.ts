// Dag 0 — indgangens betalingsmail. Bucket B: authenticateServiceRole bag
// verify_jwt = true (supabase/config.toml). Body: { company_id }.
//
// KALDERNE er de to udløsere fra docs/indgangen-design.md §19: Monday-
// grenen ved «Godkendt» (ikke bygget endnu, §26) og prissætningen på en
// virksomhed der manglede pris. Begge kalder denne funktion med et
// company_id og intet andet — motoren afgør hvad der skal ske.
//
// IDEMPOTENSEN bæres af betalingsmail_sendt_at (§19): afgoerBetalingsfrist
// giver klar_til_mail KUN når prisen er sat og stemplet er tomt. Efter
// første sending stemples feltet, og ethvert senere kald lander i
// afventer_betaling og svarer { skipped: true }. Stemplet sættes KUN når
// enqueue lykkedes — fejler sendingen, står feltet tomt, funktionen
// svarer 500, og kalderen kan prøve igen uden risiko for dobbeltsending.
//
// UDEN PRIS (afventer_pris, §17/§18/§21): der sendes IKKE noget til
// medlemmet. I stedet får rådgiveren en mail (husets første, se
// raadgiverManglerPrisMail) på RAADGIVER_MAIL_TIL — en secret, så
// adressen kan ændres uden kodeændring. Mangler secret'en, logges det og
// der svares skipped; virksomheden er stadig synlig som afventer_pris på
// rådgiverfladen.
//
// FRISTEN som dato (§9): betalingsmail_sendt_at + 30 dage regnet på UTC-
// kalenderdagen, samme regnestykke som hent_betalingstilbud, så mailen og
// betalingssiden siger samme dato. Tidsstemplet der skrives i
// betalingsmail_sendt_at er det SAMME som fristen regnes fra — ikke et
// nyt now() i databasen — så de to ikke kan ende på hver sin side af
// midnat.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { afgoerBetalingsfrist } from "../_shared/betalingsfrist.ts";
import { dag0Mail, raadgiverManglerPrisMail } from "../_shared/indgangsMail.ts";
import {
  betalingsfristDato,
  formatDanskDato,
  fornavnAf,
  sendIndgangsMail,
} from "../_shared/indgangsMailAfsendelse.ts";

const APP_URL = "https://app.theboardroom.dk";
const LABEL_DAG0 = "indgang-dag0";
const LABEL_RAADGIVER = "indgang-raadgiver-mangler-pris";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  try {
    const body = await req.json().catch(() => null);
    const companyId = typeof body?.company_id === "string" ? body.company_id.trim() : "";
    if (!UUID_RE.test(companyId)) {
      return jsonResponse({ error: "Manglende eller ugyldigt company_id" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── 1. Linkrækken og virksomheden ──
    const { data: link, error: linkErr } = await adminClient
      .from("company_betalingslink")
      .select("company_id, prisniveau_oere, underskrevet_at, token, betalingsmail_sendt_at, sidste_paamindelse_dag")
      .eq("company_id", companyId)
      .maybeSingle();
    if (linkErr) {
      console.error(`[send-indgangs-betalingsmail] company_betalingslink-opslag fejlede for ${companyId}:`, linkErr);
      throw new Error("Kunne ikke læse company_betalingslink");
    }
    if (!link) {
      // Ingen række = virksomheden er ikke i indgangen. Ikke en fejl i
      // funktionen, men kalderen skal vide det.
      return jsonResponse({ error: "ingen_betalingslink", company_id: companyId }, 404);
    }

    const { data: company, error: companyErr } = await adminClient
      .from("companies")
      .select("id, name, cvr_number, contact_person, contact_email, contract_end_date")
      .eq("id", companyId)
      .maybeSingle();
    if (companyErr || !company) {
      console.error(`[send-indgangs-betalingsmail] companies-opslag fejlede for ${companyId}:`, companyErr);
      throw new Error("Kunne ikke læse companies");
    }

    // ── 2. Motoren afgør ──
    const tilstand = afgoerBetalingsfrist({
      prisniveau_oere: link.prisniveau_oere,
      underskrevet_at: link.underskrevet_at,
      betalingsmail_sendt_at: link.betalingsmail_sendt_at,
      sidste_paamindelse_dag: link.sidste_paamindelse_dag,
      contract_end_date: company.contract_end_date,
    });

    // ── 3. Uden pris: rådgivermailen i stedet (§17, §21) ──
    if (tilstand.status === "afventer_pris") {
      const raadgiverTil = (Deno.env.get("RAADGIVER_MAIL_TIL") ?? "").trim();
      if (!raadgiverTil) {
        console.error(
          `[send-indgangs-betalingsmail] company ${companyId} (${company.name}) mangler prisniveau, men RAADGIVER_MAIL_TIL er ikke sat — ingen rådgivermail sendt`,
        );
        return jsonResponse({ skipped: true, reason: "ingen_raadgiver_mail", status: tilstand.status });
      }

      // Rådgivermailen har intet stempel i company_betalingslink (der er
      // kun ét felt, og det er dag 0's). Værnet mod at rådgiveren får den
      // samme besked ved hvert kald er email_send_log: er der allerede en
      // række med denne label for virksomheden, sendes den ikke igen. Kan
      // opslaget ikke laves, sendes der — en dublet til en rådgiver er
      // billigere end en virksomhed ingen hører om.
      const { data: tidligere, error: tidligereErr } = await adminClient
        .from("email_send_log")
        .select("id")
        .eq("template_name", LABEL_RAADGIVER)
        .contains("metadata", { company_id: companyId })
        .in("status", ["pending", "sent"])
        .limit(1);
      if (tidligereErr) {
        console.warn(`[send-indgangs-betalingsmail] kunne ikke slå tidligere rådgivermail op for ${companyId}:`, tidligereErr);
      } else if (tidligere && tidligere.length > 0) {
        console.log(`[send-indgangs-betalingsmail] rådgivermail er allerede sendt for ${companyId} — sender ikke igen`);
        return jsonResponse({ skipped: true, reason: "raadgiver_mail_allerede_sendt", status: tilstand.status });
      }

      const kontakt = [company.contact_person, company.contact_email]
        .map((s: string | null) => (s ?? "").trim())
        .filter(Boolean)
        .join(", ");
      const mail = raadgiverManglerPrisMail({
        virksomhed: company.name,
        cvr: company.cvr_number,
        kontakt,
        godkendtDato: formatDanskDato(new Date(link.underskrevet_at)),
        companyId,
      });

      const ok = await sendIndgangsMail({
        adminClient,
        til: raadgiverTil,
        subject: mail.subject,
        html: mail.html,
        label: LABEL_RAADGIVER,
        companyId,
      });
      if (!ok) {
        return jsonResponse({ error: "raadgiver_mail_fejlede", company_id: companyId }, 500);
      }
      return jsonResponse({ sent: true, mail: "raadgiver_mangler_pris", til: raadgiverTil, status: tilstand.status });
    }

    // ── 4. Alt andet end klar_til_mail: intet at gøre. Det er idempotensen. ──
    if (tilstand.status !== "klar_til_mail") {
      console.log(`[send-indgangs-betalingsmail] company ${companyId} er ${tilstand.status} — springer over`);
      return jsonResponse({ skipped: true, status: tilstand.status });
    }

    // ── 5. Dag 0 ──
    const til = (company.contact_email ?? "").trim();
    if (!til) {
      // Kan ikke sendes, og stemplet må ikke sættes. En rådgiver skal
      // sætte mailen på virksomheden og kalde igen.
      console.error(`[send-indgangs-betalingsmail] company ${companyId} (${company.name}) har ingen contact_email — dag 0 ikke sendt`);
      return jsonResponse({ error: "ingen_kontakt_email", company_id: companyId }, 422);
    }

    // FORNAVNET tages fra companies.contact_person. Målt 2/9: feltet
    // skrives i dag ikke af nogen (virksomhedsOprettelse.ts rører det ikke,
    // og import-application/monday-webhook heller ikke), så det er tomt for
    // alle nye virksomheder, og mailen åbner med «Kære,». Monday-grenen
    // (§26) skal sætte det ved oprettelsen. tiltale() i indgangsMail.ts
    // håndterer det tomme felt — aldrig «Kære ,».
    const fornavn = fornavnAf(company.contact_person);

    // Tidsstemplet bruges BÅDE til fristen i mailen og som
    // betalingsmail_sendt_at, så de to aldrig kan ende på hver sin dag.
    const sendtAt = new Date();
    const frist = betalingsfristDato(sendtAt);
    // prisniveau_oere er ikke null her: afventer_pris er afgjort ovenfor.
    const beloebKr = (link.prisniveau_oere as number) / 100;

    const mail = dag0Mail({
      fornavn,
      betalingsUrl: `${APP_URL}/betal?token=${encodeURIComponent(link.token)}`,
      fristDato: formatDanskDato(frist),
      beloebKr,
    });

    const ok = await sendIndgangsMail({
      adminClient,
      til,
      subject: mail.subject,
      html: mail.html,
      label: LABEL_DAG0,
      companyId,
    });
    if (!ok) {
      // Stemplet sættes IKKE: næste kald lander igen i klar_til_mail og
      // prøver forfra. Intet er sendt, så der er intet at dobbeltsende.
      return jsonResponse({ error: "betalingsmail_fejlede", company_id: companyId }, 500);
    }

    // ── 6. Kun ved succes: stemplet der bærer fristen og idempotensen ──
    const { error: stempelErr } = await adminClient
      .from("company_betalingslink")
      .update({ betalingsmail_sendt_at: sendtAt.toISOString(), updated_at: sendtAt.toISOString() })
      .eq("company_id", companyId)
      .is("betalingsmail_sendt_at", null);
    if (stempelErr) {
      // Mailen ER i køen, men stemplet mangler: næste kald VILLE sende
      // igen. Det skal et menneske vide om med det samme.
      console.error(
        `[send-indgangs-betalingsmail] KRITISK: dag 0 er enqueued for ${companyId} men betalingsmail_sendt_at kunne ikke sættes — sæt det i hånden til ${sendtAt.toISOString()}:`,
        stempelErr,
      );
      return jsonResponse(
        { error: "stempel_fejlede", sent: true, company_id: companyId, betalingsmail_sendt_at: sendtAt.toISOString() },
        500,
      );
    }

    console.log(
      `[send-indgangs-betalingsmail] dag 0 sendt til ${til} for ${companyId} (${company.name}), frist ${formatDanskDato(frist)}`,
    );
    return jsonResponse({
      sent: true,
      mail: "dag0",
      til,
      frist: frist.toISOString().slice(0, 10),
      betalingsmail_sendt_at: sendtAt.toISOString(),
    });
  } catch (err) {
    console.error("[send-indgangs-betalingsmail] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
