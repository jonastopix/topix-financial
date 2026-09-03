/**
 * supabase/functions/_shared/indgangsFakturaBetaling.ts
 *
 * Den RENE del af webhookens invoice.paid-gren (docs/indgangen-design.md
 * §30): hvad er en indgangsfaktura, hvilket beløb bærer rækken, og hvilken
 * periode giver betalingen. Ingen IO, ingen Deno, nul imports — så det kan
 * testes i src/lib/__tests__/indgangsFakturaBetaling.test.ts. Selve kæden
 * (company_perioder, companies, invitation) ligger i stripe-webhook.
 *
 * Feltnavnene på Invoice-objektet er Stripes (API-referencen 3/9):
 * `metadata`, `total_excluding_tax`, `amount_paid`, `customer`, `id`.
 */

/** Det af Stripes Invoice-objekt som grenen læser. */
export interface StripeInvoiceBetaling {
  id: string;
  customer?: string | { id?: string } | null;
  metadata?: Record<string, string> | null;
  /** Total uden moms — det beløb der matcher checkoutens samlet_oere. */
  total_excluding_tax?: number | null;
  /** Det betalte inkl. moms. Kun fallback. */
  amount_paid?: number | null;
}

/**
 * Kun fakturaer VI har oprettet (_shared/indgangsFaktura.ts) bærer
 * metadata[art]=indgang og metadata[company_id] på selve invoice-objektet.
 * Et abonnements månedsfaktura (rate2/rate12) har tom metadata på
 * fakturaen — dens metadata sidder på abonnementet
 * (parent.subscription_details) — og falder derfor igennem her, som den
 * skal: raterne registreres ikke (§31), og de giver ikke en ny periode.
 */
export function erIndgangsFaktura(invoice: StripeInvoiceBetaling): invoice is StripeInvoiceBetaling & {
  metadata: { art: "indgang"; company_id: string };
} {
  const art = invoice.metadata?.art;
  const companyId = invoice.metadata?.company_id;
  return art === "indgang" && typeof companyId === "string" && companyId.trim().length > 0;
}

/**
 * BELØBET PÅ RÆKKEN — regnestykket, besluttet 3/9:
 *
 *   Checkout skriver company_perioder.beloeb_oere = session.metadata.samlet_oere,
 *   som er listeprisen + ratetillæg (rate12: +5 %), UDEN moms — Stripe
 *   lægger momsen oven på i Checkout (automatic_tax), og metadata bærer
 *   vores egne tal. Eksempel: 50.000 kr. i 12 rater → samlet_oere 5.250.000;
 *   det medlemmet faktisk betaler over året er 5.250.000 × 1,25 = 6.562.500
 *   øre, og DET tal står ikke i rækken.
 *
 *   Fakturaen har intet ratetillæg (én faktura, fuldt beløb, §4), så
 *   listepris = linjebeløb = prisniveau_oere. Stripe Tax lægger momsen
 *   til ved finalisering: total = total_excluding_tax × 1,25 når kunden
 *   kunne placeres, ellers total = total_excluding_tax (Tax slået fra).
 *   amount_paid er det medlemmet betalte, altså INKL. moms.
 *
 *   Rækken skal kunne sammenlignes med checkoutens rækker, som er uden
 *   moms. Derfor bærer beloeb_oere fakturaens total_excluding_tax — ikke
 *   amount_paid, som ville stå 25 % over en tilsvarende checkout-betaling
 *   og få 50 %-reglen for fornyelsesprisen (indgangspris_oere) til at
 *   regne på et momsbeløb. Samme tal går i companies.indgangspris_oere
 *   (listeprisen; uden ratetillæg er de ens).
 *
 *   Mangler total_excluding_tax (ældre API-version på kontoen), falder vi
 *   tilbage på amount_paid og siger det i kilden, så loggen viser at
 *   rækken kan bære momsen.
 */
export function beloebFraFaktura(
  invoice: StripeInvoiceBetaling,
): { beloeb_oere: number; kilde: "total_excluding_tax" | "amount_paid" } | null {
  if (typeof invoice.total_excluding_tax === "number" && Number.isFinite(invoice.total_excluding_tax)) {
    return { beloeb_oere: invoice.total_excluding_tax, kilde: "total_excluding_tax" };
  }
  if (typeof invoice.amount_paid === "number" && Number.isFinite(invoice.amount_paid)) {
    return { beloeb_oere: invoice.amount_paid, kilde: "amount_paid" };
  }
  return null;
}

/** Stripe-kunden som streng — Invoice.customer kan være id eller udfoldet objekt. */
export function kundeIdFraFaktura(invoice: StripeInvoiceBetaling): string | null {
  const c = invoice.customer;
  if (typeof c === "string" && c) return c;
  if (c && typeof c === "object" && typeof c.id === "string" && c.id) return c.id;
  return null;
}

export interface IndgangsPeriode {
  periode_start: string;
  periode_slut: string;
}

/**
 * Kontrakten løber fra BETALINGSDAGEN, ikke fra underskriften
 * (docs/indgangen-design.md §1): aftalegrundlaget giver 30 dages frist
 * efter underskrift, og de dage skal ikke tages fra medlemmet. Tolv
 * måneder frem på UTC-komponenter — samme regnestykke som checkout-
 * indgangsgrenen i stripe-webhook har brugt siden 2/9, nu delt.
 */
export function beregnIndgangsPeriode(now: Date = new Date()): IndgangsPeriode {
  const periode_start = now.toISOString().slice(0, 10);
  const slut = new Date(now);
  slut.setUTCMonth(slut.getUTCMonth() + 12);
  return { periode_start, periode_slut: slut.toISOString().slice(0, 10) };
}
