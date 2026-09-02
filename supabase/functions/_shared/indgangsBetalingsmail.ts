/**
 * Dag 0 — indgangens betalingsmail som delt funktion.
 *
 * HVORFOR DEN LIGGER HER og ikke kun i send-indgangs-betalingsmail:
 * monday-webhook skal udløse dag 0 ved «Godkendt», og et HTTP-kald fra
 * en edge function til en anden bag verify_jwt = true kan IKKE bære
 * edge-runtimens SUPABASE_SERVICE_ROLE_KEY — den er en sb_secret-nøgle
 * uden JWT-claims (målt 10/8, se _shared/edgeFunctionAuth.ts), og
 * gatewayen afviser den før koden kører. Målt 2/9: ingen eksisterende
 * intern function-til-function-kald rammer en verify_jwt = true-funktion.
 * Derfor deles LOGIKKEN, og hver kalder bringer sin egen service-role-
 * klient: send-indgangs-betalingsmail (HTTP, Bucket B) til prissætningen
 * og manuelle kald, monday-webhook (Bucket C) i samme proces ved
 * «Godkendt».
 *
 * KALDERNE er de to udløsere fra docs/indgangen-design.md §19: Monday-
 * grenen ved «Godkendt» og prissætningen på en virksomhed der manglede
 * pris. Begge giver et company_id og intet andet — motoren afgør.
 *
 * IDEMPOTENSEN bæres af betalingsmail_sendt_at (§19): afgoerBetalingsfrist
 * giver klar_til_mail KUN når prisen er sat og stemplet er tomt. Efter
 * første sending stemples feltet, og ethvert senere kald lander i
 * afventer_betaling og svarer { skipped: true }. Stemplet sættes KUN når
 * enqueue lykkedes — fejler sendingen, står feltet tomt, svaret er 500,
 * og kalderen kan prøve igen uden risiko for dobbeltsending.
 *
 * UDEN PRIS (afventer_pris, §17/§18/§21): der sendes IKKE noget til
 * medlemmet. I stedet får rådgiveren en mail (husets første, se
 * raadgiverManglerPrisMail) på RAADGIVER_MAIL_TIL — en secret, så
 * adressen kan ændres uden kodeændring. Mangler secret'en, logges det og
 * der svares skipped; virksomheden er stadig synlig som afventer_pris på
 * rådgiverfladen.
 *
 * FRISTEN som dato (§9) ER KONTRAKTENS (rettet 2/9): underskrevet_at + 30
 * dage regnet på UTC-kalenderdagen — ikke betalingsmailen + 30. Samme
 * regnestykke som hent_betalingstilbud og motoren, så mailen,
 * betalingssiden og rådgiverfladen siger samme dato. Sendes dag 0 sent
 * (prisen sat dag 4), står der i mailen en frist 26 dage ude — det er
 * tilsigtet. Rådgivermailen får dage tilbage af samme grund: hver dag
 * prisen mangler, er en dag mindre for medlemmet.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { afgoerBetalingsfrist, BETALINGSFRIST_DAGE } from "./betalingsfrist.ts";
import { dag0Mail, raadgiverManglerPrisMail } from "./indgangsMail.ts";
import {
  betalingsfristDato,
  formatDanskDato,
  fornavnAf,
  sendIndgangsMail,
} from "./indgangsMailAfsendelse.ts";

const APP_URL = "https://app.theboardroom.dk";
const LABEL_DAG0 = "indgang-dag0";
const LABEL_RAADGIVER = "indgang-raadgiver-mangler-pris";
const LOG = "[indgangsBetalingsmail]";

/** Svaret som HTTP-status + JSON-body, så kalderne kan svare eller logge det direkte. */
export interface Dag0Resultat {
  status: number;
  body: Record<string, unknown>;
}

export async function udloesIndgangsBetalingsmail(
  companyId: string,
  adminClient: SupabaseClient,
): Promise<Dag0Resultat> {
  // ── 1. Linkrækken og virksomheden ──
  const { data: link, error: linkErr } = await adminClient
    .from("company_betalingslink")
    .select("company_id, prisniveau_oere, underskrevet_at, token, betalingsmail_sendt_at, sidste_paamindelse_dag")
    .eq("company_id", companyId)
    .maybeSingle();
  if (linkErr) {
    console.error(`${LOG} company_betalingslink-opslag fejlede for ${companyId}:`, linkErr);
    return { status: 500, body: { error: "Kunne ikke læse company_betalingslink", company_id: companyId } };
  }
  if (!link) {
    // Ingen række = virksomheden er ikke i indgangen. Ikke en fejl i
    // funktionen, men kalderen skal vide det.
    return { status: 404, body: { error: "ingen_betalingslink", company_id: companyId } };
  }

  const { data: company, error: companyErr } = await adminClient
    .from("companies")
    .select("id, name, cvr_number, contact_person, contact_email, contract_end_date")
    .eq("id", companyId)
    .maybeSingle();
  if (companyErr || !company) {
    console.error(`${LOG} companies-opslag fejlede for ${companyId}:`, companyErr);
    return { status: 500, body: { error: "Kunne ikke læse companies", company_id: companyId } };
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
        `${LOG} company ${companyId} (${company.name}) mangler prisniveau, men RAADGIVER_MAIL_TIL er ikke sat — ingen rådgivermail sendt`,
      );
      return { status: 200, body: { skipped: true, reason: "ingen_raadgiver_mail", status: tilstand.status } };
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
      console.warn(`${LOG} kunne ikke slå tidligere rådgivermail op for ${companyId}:`, tidligereErr);
    } else if (tidligere && tidligere.length > 0) {
      console.log(`${LOG} rådgivermail er allerede sendt for ${companyId} — sender ikke igen`);
      return { status: 200, body: { skipped: true, reason: "raadgiver_mail_allerede_sendt", status: tilstand.status } };
    }

    const kontakt = [company.contact_person, company.contact_email]
      .map((s: string | null) => (s ?? "").trim())
      .filter(Boolean)
      .join(", ");
    // Dage tilbage af kontraktens frist — regnet af motoren fra underskriften.
    // Ukendt alder (ugyldigt stempel) vises som fuld frist frem for at
    // skrive et gæt; motoren sender ingen påmindelser i den tilstand.
    const dageTilbage =
      tilstand.dage_siden_underskrift === null
        ? BETALINGSFRIST_DAGE
        : BETALINGSFRIST_DAGE - tilstand.dage_siden_underskrift;
    const mail = raadgiverManglerPrisMail({
      virksomhed: company.name,
      cvr: company.cvr_number,
      kontakt,
      godkendtDato: formatDanskDato(new Date(link.underskrevet_at)),
      dageTilbage,
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
      return { status: 500, body: { error: "raadgiver_mail_fejlede", company_id: companyId } };
    }
    return {
      status: 200,
      body: { sent: true, mail: "raadgiver_mangler_pris", til: raadgiverTil, status: tilstand.status },
    };
  }

  // ── 4. Alt andet end klar_til_mail: intet at gøre. Det er idempotensen. ──
  if (tilstand.status !== "klar_til_mail") {
    console.log(`${LOG} company ${companyId} er ${tilstand.status} — springer over`);
    return { status: 200, body: { skipped: true, status: tilstand.status } };
  }

  // ── 5. Dag 0 ──
  const til = (company.contact_email ?? "").trim();
  if (!til) {
    // Kan ikke sendes, og stemplet må ikke sættes. En rådgiver skal
    // sætte mailen på virksomheden og kalde igen.
    console.error(`${LOG} company ${companyId} (${company.name}) har ingen contact_email — dag 0 ikke sendt`);
    return { status: 422, body: { error: "ingen_kontakt_email", company_id: companyId } };
  }

  // FORNAVNET tages fra companies.contact_person. Feltet skrives af
  // monday-webhook ved «Godkendt» (fra Fornavn + Efternavn på
  // Ansøgninger, 2/9) — før det (målt 2/9) skrev ingen det, og
  // virksomheder oprettet ad andre veje (import-application) har det
  // stadig tomt. tiltale() i indgangsMail.ts håndterer det tomme felt —
  // aldrig «Kære ,».
  const fornavn = fornavnAf(company.contact_person);

  // Fristen er kontraktens: fra underskriften, ikke fra denne mail
  // (rettet 2/9). sendtAt er kun stemplet for idempotensen.
  const sendtAt = new Date();
  const frist = betalingsfristDato(link.underskrevet_at);
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
    return { status: 500, body: { error: "betalingsmail_fejlede", company_id: companyId } };
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
      `${LOG} KRITISK: dag 0 er enqueued for ${companyId} men betalingsmail_sendt_at kunne ikke sættes — sæt det i hånden til ${sendtAt.toISOString()}:`,
      stempelErr,
    );
    return {
      status: 500,
      body: { error: "stempel_fejlede", sent: true, company_id: companyId, betalingsmail_sendt_at: sendtAt.toISOString() },
    };
  }

  console.log(`${LOG} dag 0 sendt til ${til} for ${companyId} (${company.name}), frist ${formatDanskDato(frist)}`);
  return {
    status: 200,
    body: {
      sent: true,
      mail: "dag0",
      til,
      frist: frist.toISOString().slice(0, 10),
      betalingsmail_sendt_at: sendtAt.toISOString(),
    },
  };
}
