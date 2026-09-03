/**
 * supabase/functions/_shared/indgangsFaktura.ts
 *
 * Dag 31-fakturaen: opretter og sender en Stripe-faktura på det fulde,
 * aftalte beløb til et medlem der ikke har betalt inden kontraktens frist
 * (docs/indgangen-design.md §4, §30). Bygget 3/9 som MOTOR FØR FLADE:
 * ingen kaldesteder endnu — indgangs-paamindelser-cron kalder den ikke, og
 * stripe-webhook har ingen invoice.paid-gren. Begge kommer i egne trin.
 *
 * HVORFOR DEN FINDES: §30 målte at en faktura sendt i hånden fra
 * dashboardet ikke kan finde tilbage til virksomheden — ingen metadata,
 * ingen kendt kunde, ingen unik kontaktmail. Derfor opretter vi selv:
 * kunden får metadata[company_id], og fakturaen får metadata[company_id]
 * OG metadata[art]=indgang, så webhooken kan læse dem direkte af
 * invoice-objektet uden opslag.
 *
 * STRIPE-KALDENE er rå fetch mod api.stripe.com/v1 med Bearer
 * STRIPE_SECRET_KEY og application/x-www-form-urlencoded — husets mønster
 * (opret-indgangs-checkout, _shared/checkoutSession.ts). Ingen SDK.
 * Endpoints (slået op 3/9 i Stripes API-reference):
 *   GET  /v1/invoices?customer=…         (idempotens-opslag mod Stripe)
 *   POST /v1/customers                   (kun når virksomheden ingen har)
 *   POST /v1/invoices                    (tom kladde, send_invoice + 4 dage)
 *   POST /v1/invoiceitems                (linjen, knyttet med invoice=<id>)
 *   POST /v1/invoices/{id}/finalize      (kladde → open, Stripe Tax regnes)
 *   POST /v1/invoices/{id}/send          (mailen fra Stripe til medlemmet)
 * Parametrene bygges i indgangsFakturaParametre.ts (ren, testet).
 *
 * IDEMPOTENS — samme virksomhed må ikke få to fakturaer. Tre lag:
 *   1. company_betalingslink.faktura_invoice_id (migration 20260903130000):
 *      stemplet KUN når fakturaen er sendt — husets mønster
 *      (betalingsmail_sendt_at, sidste_paamindelse_dag). Sat → fandtes
 *      allerede, intet Stripe-kald.
 *   2. Opslag i Stripe på kundens fakturaer (GET /v1/invoices?customer=,
 *      konsistent læsning — ikke Search-API'et, som er eventual consistent)
 *      med match på metadata. Dækker den kørsel hvor fakturaen kom ud, men
 *      stemplet ikke kunne skrives. En kladde fra et afbrudt forsøg
 *      genoptages (finalize + send); en færdig faktura stemples og tælles
 *      som «fandtes allerede».
 *   3. Idempotency-Key på hver POST, afledt af company_id og trin, så et
 *      afbrudt kald inden for Stripes 24-timers-vindue giver SAMME objekt.
 *
 * MOMS: fakturaen oprettes med automatic_tax[enabled]=true og linjen med
 * tax_behavior=exclusive — samme som husets Checkout-sessioner og priser.
 * Stripe Tax kræver mindst landeniveau på kunden (uden for USA); adressen
 * tages fra companies (address/postal_code/city, land DK) når den findes.
 * Mangler den, FEJLER finaliseringen IKKE — Stripe slår Tax fra på
 * fakturaen og sætter automatic_tax.disabled_reason (Invoice-objektets
 * dokumentation: «automatically turned off Tax … with a missing or
 * incomplete location»). Det læses efter finalize og bæres i resultatet
 * som moms_beregnet, så cronen kan logge det tydeligt.
 *
 * KASTER ALDRIG — samme kontrakt som sikrIndgangsInvitation, af samme
 * grund: kalderen (cronen) skal kunne fortsætte til næste virksomhed.
 * Hver fejl logges med company_id, og resultatet siger hvad der skete.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import {
  bygFakturalinjeParametre,
  bygFakturaParametre,
  bygKundeParametre,
  findIndgangsFaktura,
  idempotensNoegle,
  type StripeFakturaKort,
} from "./indgangsFakturaParametre.ts";

const STRIPE_API = "https://api.stripe.com/v1";
const LOG = "[indgangsFaktura]";

export type IndgangsFakturaResultat =
  | {
      udfald: "sendt";
      invoice_id: string;
      /** Linjens beløb — prisniveau_oere, uden moms. */
      beloeb_oere: number;
      /** Fakturaens total efter finalisering (inkl. evt. moms), som Stripe regnede den. */
      total_oere: number | null;
      /** true = Stripe Tax regnede moms; false = Tax blev slået fra (typisk manglende adresse). */
      moms_beregnet: boolean;
      hosted_invoice_url: string | null;
      /** false = fakturaen ER sendt, men stemplet på linkrækken kunne ikke skrives (logget KRITISK). */
      stemplet: boolean;
    }
  | { udfald: "fandtes_allerede"; invoice_id: string }
  | {
      udfald: "sprunget_over";
      grund:
        | "secret_mangler"
        | "ingen_linkraekke"
        | "ingen_virksomhed"
        | "allerede_betalt"
        | "pris_mangler"
        | "ingen_email";
    }
  | { udfald: "fejlet"; aarsag: string };

interface LinkRaekke {
  prisniveau_oere: number | null;
  faktura_invoice_id: string | null;
}

interface Virksomhed {
  name: string;
  contact_email: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  contract_end_date: string | null;
  stripe_customer_id: string | null;
}

/** Et Stripe-invoice-objekt, de felter vi læser. */
interface StripeFaktura extends StripeFakturaKort {
  total?: number | null;
  hosted_invoice_url?: string | null;
  automatic_tax?: { enabled?: boolean; status?: string | null; disabled_reason?: string | null } | null;
  status_transitions?: { finalized_at?: number | null } | null;
}

async function stripePost<T>(
  sti: string,
  params: Record<string, string> | null,
  secretKey: string,
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${STRIPE_API}${sti}`, {
    method: "POST",
    headers,
    body: params ? new URLSearchParams(params).toString() : "",
  });
  const tekst = await res.text();
  if (!res.ok) {
    throw new Error(`Stripe POST ${sti} svarede ${res.status}: ${tekst.slice(0, 300)}`);
  }
  return JSON.parse(tekst) as T;
}

async function stripeGet<T>(sti: string, secretKey: string): Promise<T> {
  const res = await fetch(`${STRIPE_API}${sti}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const tekst = await res.text();
  if (!res.ok) {
    throw new Error(`Stripe GET ${sti} svarede ${res.status}: ${tekst.slice(0, 300)}`);
  }
  return JSON.parse(tekst) as T;
}

function momsBeregnet(f: StripeFaktura): boolean {
  return f.automatic_tax?.enabled === true && f.automatic_tax?.status === "complete";
}

/**
 * Stempler linkrækken med fakturaen. Kaster aldrig: fakturaen er allerede
 * ude, og et manglende stempel må ikke gøre kørslen til en fejl — laget
 * over (Stripe-opslaget) fanger det næste gang. Returnerer om stemplet
 * blev skrevet.
 */
async function stemplFaktura(
  adminClient: SupabaseClient,
  companyId: string,
  faktura: StripeFaktura,
): Promise<boolean> {
  const sendtAt = faktura.status_transitions?.finalized_at
    ? new Date(faktura.status_transitions.finalized_at * 1000).toISOString()
    : new Date().toISOString();
  const { error } = await adminClient
    .from("company_betalingslink")
    .update({
      faktura_invoice_id: faktura.id,
      faktura_sendt_at: sendtAt,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId);
  if (error) {
    console.error(
      `${LOG} KRITISK: faktura ${faktura.id} er sendt for company ${companyId}, men faktura_invoice_id kunne ikke skrives på company_betalingslink — sæt det i hånden:`,
      error,
    );
    return false;
  }
  return true;
}

/** Finaliserer (hvis kladde) og sender fakturaen. Returnerer det finaliserede objekt. */
async function finaliserOgSend(
  faktura: StripeFaktura,
  secretKey: string,
): Promise<StripeFaktura> {
  let f = faktura;
  if (f.status === "draft") {
    f = await stripePost<StripeFaktura>(`/invoices/${encodeURIComponent(f.id)}/finalize`, null, secretKey);
  }
  f = await stripePost<StripeFaktura>(`/invoices/${encodeURIComponent(f.id)}/send`, null, secretKey);
  return f;
}

/**
 * Opretter og sender dag 31-fakturaen for én virksomhed i indgangen.
 * Se filhovedet for rækkefølge, idempotens og moms. Kaster aldrig.
 */
export async function sendIndgangsFaktura(
  adminClient: SupabaseClient,
  companyId: string,
): Promise<IndgangsFakturaResultat> {
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim() || null;
  if (!secretKey) {
    console.error(`${LOG} company ${companyId}: FAKTURA IKKE SENDT — secret STRIPE_SECRET_KEY mangler.`);
    return { udfald: "sprunget_over", grund: "secret_mangler" };
  }

  try {
    // ── 1. Linkrækken og virksomheden ──
    const { data: link, error: linkErr } = await adminClient
      .from("company_betalingslink")
      .select("prisniveau_oere, faktura_invoice_id")
      .eq("company_id", companyId)
      .maybeSingle();
    if (linkErr) throw new Error(`company_betalingslink-opslag fejlede: ${linkErr.message}`);
    if (!link) {
      console.log(`${LOG} company ${companyId}: ingen linkrække — ikke i indgangen, springer over`);
      return { udfald: "sprunget_over", grund: "ingen_linkraekke" };
    }
    const linkRaekke = link as LinkRaekke;

    // Lag 1: stemplet. Sat = fakturaen er sendt før.
    if (linkRaekke.faktura_invoice_id) {
      console.log(`${LOG} company ${companyId}: faktura ${linkRaekke.faktura_invoice_id} findes allerede (stempel), sender ikke igen`);
      return { udfald: "fandtes_allerede", invoice_id: linkRaekke.faktura_invoice_id };
    }

    const { data: company, error: companyErr } = await adminClient
      .from("companies")
      .select("name, contact_email, address, postal_code, city, contract_end_date, stripe_customer_id")
      .eq("id", companyId)
      .maybeSingle();
    if (companyErr) throw new Error(`virksomhedsopslag fejlede: ${companyErr.message}`);
    if (!company) {
      console.error(`${LOG} company ${companyId}: companies-rækken mangler`);
      return { udfald: "sprunget_over", grund: "ingen_virksomhed" };
    }
    const virksomhed = company as Virksomhed;

    // Betalt vinder altid — samme regel som motoren (betalingsfrist.ts:195-201).
    if (virksomhed.contract_end_date) {
      console.log(`${LOG} company ${companyId}: contract_end_date er sat — betalt, ingen faktura`);
      return { udfald: "sprunget_over", grund: "allerede_betalt" };
    }
    if (linkRaekke.prisniveau_oere === null || linkRaekke.prisniveau_oere <= 0) {
      console.error(`${LOG} company ${companyId}: prisniveau_oere mangler — kan ikke fakturere`);
      return { udfald: "sprunget_over", grund: "pris_mangler" };
    }
    const email = (virksomhed.contact_email ?? "").trim().toLowerCase();
    if (!email) {
      console.error(`${LOG} company ${companyId} (${virksomhed.name}): contact_email er tom — Stripe kan ikke sende fakturaen`);
      return { udfald: "sprunget_over", grund: "ingen_email" };
    }
    const beloebOere = linkRaekke.prisniveau_oere;

    // ── 2. Kunden: genbrug, ellers opret med metadata[company_id] ──
    let kundeId = (virksomhed.stripe_customer_id ?? "").trim() || null;
    if (!kundeId) {
      const kunde = await stripePost<{ id: string }>(
        "/customers",
        bygKundeParametre({
          companyId,
          navn: virksomhed.name,
          email,
          adresse: virksomhed.address,
          postnummer: virksomhed.postal_code,
          by: virksomhed.city,
        }),
        secretKey,
        idempotensNoegle(companyId, "kunde"),
      );
      kundeId = String(kunde.id);
      const { error: kundeErr } = await adminClient
        .from("companies")
        .update({ stripe_customer_id: kundeId })
        .eq("id", companyId);
      if (kundeErr) {
        // Fortsæt: fakturaen skal ud. Idempotency-nøglen giver samme kunde
        // igen inden for 24 timer; derefter ville en ny kørsel oprette en
        // kunde til — derfor KRITISK, så det bliver set.
        console.error(
          `${LOG} KRITISK: Stripe-kunde ${kundeId} oprettet for company ${companyId}, men stripe_customer_id kunne ikke skrives på companies — sæt det i hånden:`,
          kundeErr,
        );
      } else {
        console.log(`${LOG} company ${companyId}: Stripe-kunde ${kundeId} oprettet`);
      }
    }

    // ── 3. Lag 2: findes der allerede en indgangsfaktura hos Stripe? ──
    const liste = await stripeGet<{ data?: StripeFaktura[] }>(
      `/invoices?customer=${encodeURIComponent(kundeId)}&limit=100`,
      secretKey,
    );
    const eksisterende = findIndgangsFaktura(
      Array.isArray(liste.data) ? liste.data : [],
      companyId,
    ) as StripeFaktura | null;

    if (eksisterende && eksisterende.status !== "draft") {
      // Ude hos medlemmet, men stemplet manglede (fx skrivning fejlede
      // sidst). Stempl nu, og tæl som fandtes.
      console.log(`${LOG} company ${companyId}: faktura ${eksisterende.id} (${eksisterende.status}) findes allerede hos Stripe, sender ikke igen`);
      await stemplFaktura(adminClient, companyId, eksisterende);
      return { udfald: "fandtes_allerede", invoice_id: eksisterende.id };
    }

    // ── 4. Fakturaen: genoptag kladden, eller opret kladde + linje ──
    let faktura: StripeFaktura;
    if (eksisterende) {
      console.log(`${LOG} company ${companyId}: genoptager kladde ${eksisterende.id} fra et afbrudt forsøg`);
      faktura = eksisterende;
    } else {
      faktura = await stripePost<StripeFaktura>(
        "/invoices",
        bygFakturaParametre(companyId, kundeId),
        secretKey,
        idempotensNoegle(companyId, "faktura"),
      );
      await stripePost<{ id: string }>(
        "/invoiceitems",
        bygFakturalinjeParametre(companyId, kundeId, faktura.id, beloebOere),
        secretKey,
        idempotensNoegle(companyId, "linje"),
      );
    }

    // ── 5. Finalisér og send — Stripe mailer medlemmet ──
    const sendt = await finaliserOgSend(faktura, secretKey);
    const moms = momsBeregnet(sendt);
    if (!moms) {
      console.warn(
        `${LOG} company ${companyId}: faktura ${sendt.id} er sendt UDEN automatisk moms (automatic_tax.status=${sendt.automatic_tax?.status ?? "?"}, disabled_reason=${sendt.automatic_tax?.disabled_reason ?? "?"}) — kundens adresse kunne formentlig ikke placeres`,
      );
    }

    // ── 6. Stemplet — kun nu, hvor fakturaen ER sendt ──
    const stemplet = await stemplFaktura(adminClient, companyId, sendt);

    console.log(
      `${LOG} company ${companyId} (${virksomhed.name}): faktura ${sendt.id} sendt til ${email} — ${beloebOere} øre ekskl. moms, total ${sendt.total ?? "?"} øre, moms ${moms ? "beregnet" : "IKKE beregnet"}`,
    );
    return {
      udfald: "sendt",
      invoice_id: sendt.id,
      beloeb_oere: beloebOere,
      total_oere: typeof sendt.total === "number" ? sendt.total : null,
      moms_beregnet: moms,
      hosted_invoice_url: sendt.hosted_invoice_url ?? null,
      stemplet,
    };
  } catch (err) {
    const aarsag = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} company ${companyId}: FAKTURA IKKE SENDT — ${aarsag}. Prøves igen ved næste kørsel.`);
    return { udfald: "fejlet", aarsag };
  }
}
