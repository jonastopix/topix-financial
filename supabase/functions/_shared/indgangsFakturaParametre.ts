/**
 * supabase/functions/_shared/indgangsFakturaParametre.ts
 *
 * Den RENE del af dag 31-fakturaen: konstanter og de parametersæt der
 * sendes til Stripe, som funktioner uden IO. Adskilt fra indgangsFaktura.ts
 * (som taler med Supabase og Stripe og bruger Deno.env), så de to
 * KRITISKE krav fra docs/indgangen-design.md §30 kan låses med en test i
 * src/lib/__tests__/indgangsFaktura.test.ts:
 *
 *   1. metadata[company_id] står på KUNDEN — uden den kan en betaling ikke
 *      finde tilbage til virksomheden.
 *   2. metadata[company_id] står på SELVE FAKTURAEN, ikke kun på kunden —
 *      webhookens invoice.paid-gren skal kunne læse den direkte af
 *      invoice-objektet.
 *
 * Parameternavnene er slået op i Stripes API-reference 3/9 2026
 * (docs.stripe.com/api/customers/create, /api/invoices/create,
 * /api/invoiceitems/create) — ikke husket:
 *   - Kunde: name, email, address[line1|postal_code|city|country],
 *     metadata[<key>].
 *   - Faktura: customer, collection_method (send_invoice), days_until_due
 *     («Valid only for invoices where collection_method=send_invoice»),
 *     currency, auto_advance, pending_invoice_items_behavior,
 *     automatic_tax[enabled], metadata[<key>].
 *   - Fakturalinje: customer, invoice, amount («integer amount in the
 *     smallest currency unit»), currency, description, tax_behavior,
 *     metadata[<key>].
 *
 * Formen er URLSearchParams-klar (Record<string, string>), fordi huset
 * sender rå fetch med application/x-www-form-urlencoded og ingen SDK
 * (opret-indgangs-checkout:105-129).
 *
 * Filen har nul imports og ingen Deno-referencer, så den kan loades af
 * både Vitest (Node) og Deno uden ændringer.
 */

/** Besluttet 3/9 (Jonas): fire dage fra fakturaen sendes til den forfalder. */
export const FAKTURA_DAGE_TIL_FORFALD = 4;

/** Samme mærke som Checkout-sessionerne bærer (opret-indgangs-checkout:123). */
export const FAKTURA_ART = "indgang";

/** Husets priser er i danske kroner (beløb i øre). */
export const FAKTURA_VALUTA = "dkk";

/**
 * Samme tax_behavior som husets priser (målt 3/9: exclusive). Beløbet på
 * linjen er listeprisen uden moms; Stripe Tax lægger momsen til ved
 * finalisering, når kundens adresse kan placeres (se indgangsFaktura.ts).
 */
export const FAKTURA_TAX_BEHAVIOR = "exclusive";

/**
 * Linjeteksten. Kontrakten er 12 måneder fra betalingsdagen
 * (stripe-webhook:483-487 regner periode_slut = start + 12 måneder), og
 * beløbet er det aftalte prisniveau — det fulde beløb, aldrig rater (§4).
 */
export const FAKTURA_LINJETEKST = "Medlemskab af The Boardroom, 12 måneder";

export interface FakturaKundeInput {
  companyId: string;
  navn: string;
  email: string;
  adresse: string | null;
  postnummer: string | null;
  by: string | null;
}

/**
 * Parametre til POST /v1/customers. Adressen sendes kun hvor den findes;
 * landet sættes til DK når der er noget at placere — Stripe Tax kræver
 * mindst et landeniveau for kunder uden for USA (docs.stripe.com/tax/
 * invoicing, «Set up the customer»). Uden adresse oprettes kunden
 * alligevel: fakturaen skal ud, og momsspørgsmålet logges af kalderen.
 */
export function bygKundeParametre(k: FakturaKundeInput): Record<string, string> {
  const p: Record<string, string> = {
    name: k.navn,
    email: k.email,
    "metadata[company_id]": k.companyId,
    "metadata[art]": FAKTURA_ART,
  };
  const linje1 = (k.adresse ?? "").trim();
  const postnr = (k.postnummer ?? "").trim();
  const by = (k.by ?? "").trim();
  if (linje1) p["address[line1]"] = linje1;
  if (postnr) p["address[postal_code]"] = postnr;
  if (by) p["address[city]"] = by;
  if (linje1 || postnr || by) p["address[country]"] = "DK";
  return p;
}

/**
 * Parametre til POST /v1/invoices — en TOM kladde, som linjen bagefter
 * knyttes til med invoice=<id>. pending_invoice_items_behavior=exclude er
 * bevidst: en gammel, løs linje på kunden må ikke ryge med på denne
 * faktura. auto_advance=false: vi finaliserer og sender selv, i den
 * rækkefølge, så et fejlet trin kan ses. collection_method=send_invoice
 * KRÆVER days_until_due (målt hos Stripe 3/9) — udelades den, forsøger
 * Stripe at trække på et kort, og det er forkert her.
 */
export function bygFakturaParametre(companyId: string, kundeId: string): Record<string, string> {
  return {
    customer: kundeId,
    collection_method: "send_invoice",
    days_until_due: String(FAKTURA_DAGE_TIL_FORFALD),
    currency: FAKTURA_VALUTA,
    auto_advance: "false",
    pending_invoice_items_behavior: "exclude",
    "automatic_tax[enabled]": "true",
    "metadata[company_id]": companyId,
    "metadata[art]": FAKTURA_ART,
  };
}

/**
 * Parametre til POST /v1/invoiceitems: frit beløb fra prisniveau_oere,
 * IKKE en pris på lookup_key (besluttet 3/9: nøglerne dækker kun 50.000 og
 * 40.000, og et medlem med et andet aftalt niveau er netop dem der ikke må
 * falde ud af kæden).
 */
export function bygFakturalinjeParametre(
  companyId: string,
  kundeId: string,
  fakturaId: string,
  prisniveauOere: number,
): Record<string, string> {
  return {
    customer: kundeId,
    invoice: fakturaId,
    amount: String(prisniveauOere),
    currency: FAKTURA_VALUTA,
    description: FAKTURA_LINJETEKST,
    tax_behavior: FAKTURA_TAX_BEHAVIOR,
    "metadata[company_id]": companyId,
    "metadata[art]": FAKTURA_ART,
  };
}

/** Det af et Stripe-invoice-objekt som idempotens-opslaget læser. */
export interface StripeFakturaKort {
  id: string;
  status: string | null;
  metadata?: Record<string, string> | null;
}

/**
 * Finder en eksisterende indgangsfaktura for virksomheden i en liste af
 * kundens fakturaer (GET /v1/invoices?customer=…). Matcher på BEGGE
 * metadata-nøgler, så en fornyelsesfaktura for samme kunde en dag ikke
 * tæller. Annullerede (void) springes over — de er ikke en faktura
 * medlemmet kan betale. Første match vinder; listen kommer nyeste først.
 */
export function findIndgangsFaktura(
  fakturaer: readonly StripeFakturaKort[],
  companyId: string,
): StripeFakturaKort | null {
  for (const f of fakturaer) {
    if (f.status === "void") continue;
    if (f.metadata?.company_id === companyId && f.metadata?.art === FAKTURA_ART) return f;
  }
  return null;
}

/**
 * Idempotency-Key til Stripes POST'er (docs.stripe.com/api/idempotent_requests:
 * op til 255 tegn, gemmes mindst 24 timer, samme nøgle med samme parametre
 * giver samme svar). Nøglen er afledt af virksomheden og trinnet, så et
 * forsøg der faldt på gulvet efter Stripe havde oprettet objektet, får det
 * SAMME objekt tilbage ved næste kørsel inden for vinduet — ikke et nyt.
 */
export function idempotensNoegle(companyId: string, trin: "kunde" | "faktura" | "linje"): string {
  return `indgang-faktura-${trin}-${companyId}`;
}
