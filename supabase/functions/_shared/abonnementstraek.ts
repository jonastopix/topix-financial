/**
 * supabase/functions/_shared/abonnementstraek.ts
 *
 * Den RENE del af registreringen af månedstræk (docs/indgangen-design.md
 * §31, bygget 3/9): hvordan en Stripe-faktura på et ABONNEMENT læses, og
 * hvilken række den bliver i company_traek. Nul imports, ingen Deno — så
 * det kan testes i src/lib/__tests__/abonnementstraek.test.ts. IO'en
 * (opslag på abonnement/PaymentIntent, upsert) ligger i stripe-webhook.
 *
 * KOBLINGEN FAKTURA → ABONNEMENT, målt i Stripes API-reference 3/9 og
 * IKKE gættet: repoet sætter ingen Stripe-Version-header, så webhookens
 * events kommer i kontoens standard-version, som ikke står i repoet.
 * Derfor læses BEGGE former:
 *   - API-version 2025-03-31.basil og nyere: `invoice.parent.type ===
 *     "subscription_details"` og `invoice.parent.subscription_details
 *     .subscription` (id, evt. udfoldet objekt); metadata i
 *     `parent.subscription_details.metadata` — «an immutable snapshot of
 *     the subscription metadata at the time of invoice finalization …
 *     populated only for invoices created on or after June 29, 2023».
 *     Betalingen: `invoice.payments.data[].payment.payment_intent`
 *     (InvoicePayment-objektet, `payment.type === "payment_intent"`).
 *   - Ældre versioner: `invoice.subscription`, `invoice.subscription_details
 *     .metadata`, `invoice.payment_intent`.
 * Docs (billing/subscriptions/webhooks, «Handle refund events»): «For API
 * version 2025-03-31.basil or later, verify parent.type is
 * subscription_details, then use parent.subscription_details.subscription.
 * For API versions earlier than 2025-03-31.basil, use subscription.»
 *
 * FEJLEN («hvad Stripe sagde»): fakturaen bærer ikke afvisningsgrunden —
 * den ligger på PaymentIntent.last_payment_error (`code`, `decline_code`,
 * `message`, `advice_code`, `network_decline_code` — målt i referencen
 * 16/9). Kalderen slår den op ved fejlet træk og giver den hertil.
 *
 * VEJEN TIL PAYMENTINTENT'ET (målt i referencen 16/9, efter Livjas træk
 * TBR-0007 stod uden grund): `Invoice.payments` er i den nuværende
 * API-version «expandable» — «Payments for this invoice. Use invoice payment
 * to get more details» — så webhookens event kan komme UDEN listen.
 * Kalderen går derfor tre veje, i rækkefølge: (1) fakturaens egne felter
 * (paymentIntentIdFraFaktura: ældre `payment_intent`, ellers en medsendt
 * `payments.data[]`), (2) `GET /v1/invoice_payments?invoice={id}` (basil:
 * InvoicePayment-listen, `payment.type === "payment_intent"` →
 * `payment.payment_intent`; dokumenteret som «List all payments for an
 * invoice»), (3) intet PaymentIntent → rækken skrives uden grund.
 *
 * PERIODEN (16/9): fakturaens `period_start`/`period_end` er IKKE
 * abonnementsperioden — referencen: «The earliest/latest timestamp at which
 * invoice items can be associated with this invoice. Use the line item
 * period to get the service period for each price.» For subscription_create
 * er de ens (målt: 2026-09-15T22:00Z begge, Livja). Perioden læses fra
 * ABONNEMENTSLINJEN: `lines.data[]` med `parent.type ===
 * "subscription_item_details"` (basil), ellers `type === "subscription"`
 * (ældre), og dens `period.start`/`period.end` — «For subscription line
 * items, this is the subscription period.» Fallback: fakturaens felter.
 */

/** Det af Stripes Invoice-objekt som registreringen læser — begge API-former. */
export interface StripeAbonnementsFaktura {
  id: string;
  customer?: string | { id?: string } | null;
  metadata?: Record<string, string> | null;
  /** 2025-03-31.basil+ */
  parent?: {
    type?: string | null;
    subscription_details?: {
      subscription?: string | { id?: string } | null;
      metadata?: Record<string, string> | null;
    } | null;
  } | null;
  /** Ældre API-versioner */
  subscription?: string | { id?: string } | null;
  subscription_details?: { metadata?: Record<string, string> | null } | null;
  payment_intent?: string | { id?: string } | null;
  /** 2025-03-31.basil+: InvoicePayment-listen */
  payments?: {
    data?: { payment?: { type?: string | null; payment_intent?: string | { id?: string } | null } | null }[] | null;
  } | null;
  period_start?: number | null;
  period_end?: number | null;
  /** Linjerne — abonnementslinjen bærer abonnementsperioden (16/9). */
  lines?: { data?: StripeFakturaLinje[] | null } | null;
  total?: number | null;
  amount_due?: number | null;
  amount_paid?: number | null;
  attempt_count?: number | null;
  next_payment_attempt?: number | null;
  status?: string | null;
  status_transitions?: { paid_at?: number | null } | null;
  billing_reason?: string | null;
  number?: string | null;
  hosted_invoice_url?: string | null;
}

/** Én fakturalinje — det registreringen læser (begge API-former). */
export interface StripeFakturaLinje {
  /** basil */
  parent?: { type?: string | null; subscription_item_details?: { subscription_item?: string | null; subscription?: string | null } | null } | null;
  /** ældre API-versioner */
  type?: string | null;
  subscription_item?: string | null;
  period?: { start?: number | null; end?: number | null } | null;
}

/** InvoicePayment (basil) — det `GET /v1/invoice_payments?invoice=` giver. */
export interface StripeInvoicePayment {
  payment?: { type?: string | null; payment_intent?: string | { id?: string } | null } | null;
}

/**
 * PaymentIntent.last_payment_error — de tre felter vi gemmer (fejl_kode,
 * fejl_decline_code, fejl_besked) plus to der KUN bæres til klokken (16/9):
 * advice_code («do_not_try_again» = Stripes nye forsøg vil ikke lykkes) og
 * network_decline_code. company_traek har ingen kolonner til dem
 * (20260903150000), og der laves ingen migration for dem.
 */
export interface TraekFejl {
  kode: string | null;
  decline_code: string | null;
  besked: string | null;
  advice_code?: string | null;
  network_decline_code?: string | null;
}

export type TraekUdfald = "betalt" | "fejlet";

/** Rækken til company_traek. Nøgler der ikke gælder udfaldet UDELADES
    (ikke null), så et upsert på stripe_invoice_id lader dem stå. */
export interface TraekRaekke {
  company_id: string;
  stripe_subscription_id: string;
  stripe_invoice_id: string;
  stripe_customer_id: string | null;
  art: string | null;
  periode_start: string | null;
  periode_slut: string | null;
  beloeb_oere: number;
  betalt_oere: number;
  status: TraekUdfald;
  forsoeg: number | null;
  naeste_forsoeg_at: string | null;
  billing_reason: string | null;
  faktura_nummer: string | null;
  hosted_invoice_url: string | null;
  updated_at: string;
  betalt_at?: string | null;
  fejlet_at?: string;
  fejl_kode?: string | null;
  fejl_decline_code?: string | null;
  fejl_besked?: string | null;
}

function idAf(v: string | { id?: string } | null | undefined): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object" && typeof v.id === "string") return v.id.trim() || null;
  return null;
}

function tsIso(sek: number | null | undefined): string | null {
  return typeof sek === "number" && Number.isFinite(sek) ? new Date(sek * 1000).toISOString() : null;
}

function tal(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Abonnementet fakturaen hører til — basil-formen først, så den ældre. Null = ikke en abonnementsfaktura. */
export function abonnementIdFraFaktura(f: StripeAbonnementsFaktura): string | null {
  const basil = f.parent?.type === "subscription_details" ? idAf(f.parent?.subscription_details?.subscription) : null;
  return basil ?? idAf(f.subscription);
}

/** Abonnementets metadata som fakturaen bærer den — basil-snapshot først, så den ældre. Null = ikke med på fakturaen. */
export function abonnementsMetadataFraFaktura(f: StripeAbonnementsFaktura): Record<string, string> | null {
  const basil = f.parent?.subscription_details?.metadata;
  if (basil && typeof basil === "object" && Object.keys(basil).length > 0) return basil;
  const aeldre = f.subscription_details?.metadata;
  if (aeldre && typeof aeldre === "object" && Object.keys(aeldre).length > 0) return aeldre;
  return null;
}

/** PaymentIntent'et bag fakturaens betaling — ældre `payment_intent`, ellers første InvoicePayment af typen payment_intent. */
export function paymentIntentIdFraFaktura(f: StripeAbonnementsFaktura): string | null {
  const aeldre = idAf(f.payment_intent);
  if (aeldre) return aeldre;
  for (const p of f.payments?.data ?? []) {
    if (p?.payment?.type === "payment_intent") {
      const id = idAf(p.payment.payment_intent);
      if (id) return id;
    }
  }
  return null;
}

/** PaymentIntent'et fra InvoicePayment-listen (basil) — første af typen payment_intent. */
export function paymentIntentIdFraInvoicePayments(liste: readonly StripeInvoicePayment[] | null | undefined): string | null {
  for (const p of liste ?? []) {
    if (p?.payment?.type === "payment_intent") {
      const id = idAf(p.payment.payment_intent);
      if (id) return id;
    }
  }
  return null;
}

/** Fejlen fra et PaymentIntent-objekt — de tre felter vi gemmer, plus advice_code og network_decline_code til klokken. Null når intet er sat. */
export function traekFejlFraPaymentIntent(pi: {
  last_payment_error?: {
    code?: string | null;
    decline_code?: string | null;
    message?: string | null;
    advice_code?: string | null;
    network_decline_code?: string | null;
  } | null;
} | null | undefined): TraekFejl | null {
  const e = pi?.last_payment_error;
  if (!e) return null;
  const kode = (e.code ?? "").trim() || null;
  const decline = (e.decline_code ?? "").trim() || null;
  const besked = (e.message ?? "").trim() || null;
  const advice = (e.advice_code ?? "").trim() || null;
  const netvaerk = (e.network_decline_code ?? "").trim() || null;
  return kode || decline || besked ? { kode, decline_code: decline, besked, advice_code: advice, network_decline_code: netvaerk } : null;
}

/**
 * Abonnementsperioden (16/9): linjen med parent.type "subscription_item_details"
 * (basil) eller type "subscription" (ældre), og dens period. Er der flere
 * (fx en proration og selve abonnementet), tages den med den LÆNGSTE
 * periode — prorationer er kortere. Null når ingen abonnementslinje findes
 * eller dens period er ulæselig — så falder kalderen tilbage på fakturaens
 * period_start/period_end.
 */
export function abonnementsperiodeFraLinjer(f: Pick<StripeAbonnementsFaktura, "lines">): { start: number; end: number } | null {
  let bedste: { start: number; end: number } | null = null;
  for (const l of f.lines?.data ?? []) {
    const erAbonnement = l?.parent?.type === "subscription_item_details" || l?.type === "subscription";
    if (!erAbonnement) continue;
    const start = tal(l.period?.start);
    const end = tal(l.period?.end);
    if (start === null || end === null) continue;
    if (!bedste || end - start > bedste.end - bedste.start) bedste = { start, end };
  }
  return bedste;
}

/**
 * Ren dom (11/9): må et FEJLET træk skrives oven på det rækken står som?
 * False kun når rækken står som «betalt». «betalt» er slutstatus for en
 * faktura: Stripe garanterer ikke rækkefølgen på events, og events kan
 * leveres igen — et invoice.payment_failed der kommer EFTER invoice.paid
 * for samme faktura er et ældre forsøg, ikke en ny tilstand, og må ikke
 * vende rækken tilbage til «fejlet». Null (ingen række endnu) og «fejlet»
 * (et forsøg til) skrives som hidtil. Et BETALT træk spørger ikke: betalt
 * vinder altid.
 */
export function maaRegistrereFejlet(eksisterendeStatus: string | null): boolean {
  return eksisterendeStatus !== "betalt";
}

/**
 * Rækken til company_traek. beloeb_oere er fakturaens TOTAL inkl. moms —
 * dette er en betaling, ikke en pris (company_perioder er uden moms).
 * Ved betalt sættes betalt_at fra status_transitions.paid_at (ellers nu)
 * og fejl-nøglerne udelades, så en tidligere fejl står som historik. Ved
 * fejlet sættes fejlet_at = nu og fejl-felterne (null når Stripe intet
 * sagde), mens betalt_at udelades.
 */
export function bygTraekRaekke(
  f: StripeAbonnementsFaktura,
  udfald: TraekUdfald,
  companyId: string,
  abonnementId: string,
  art: string | null,
  fejl: TraekFejl | null,
  now: Date = new Date(),
): TraekRaekke {
  const raekke: TraekRaekke = {
    company_id: companyId,
    stripe_subscription_id: abonnementId,
    stripe_invoice_id: f.id,
    stripe_customer_id: idAf(f.customer),
    art: (art ?? "").trim() || null,
    // Perioden fra abonnementslinjen (16/9); fakturaens felter kun som fallback.
    periode_start: tsIso(abonnementsperiodeFraLinjer(f)?.start ?? f.period_start),
    periode_slut: tsIso(abonnementsperiodeFraLinjer(f)?.end ?? f.period_end),
    beloeb_oere: tal(f.total) ?? tal(f.amount_due) ?? 0,
    betalt_oere: udfald === "betalt" ? (tal(f.amount_paid) ?? tal(f.total) ?? 0) : (tal(f.amount_paid) ?? 0),
    status: udfald,
    forsoeg: tal(f.attempt_count),
    naeste_forsoeg_at: udfald === "fejlet" ? tsIso(f.next_payment_attempt) : null,
    billing_reason: f.billing_reason ?? null,
    faktura_nummer: f.number ?? null,
    hosted_invoice_url: f.hosted_invoice_url ?? null,
    updated_at: now.toISOString(),
  };
  if (udfald === "betalt") {
    raekke.betalt_at = tsIso(f.status_transitions?.paid_at) ?? now.toISOString();
  } else {
    raekke.fejlet_at = now.toISOString();
    raekke.fejl_kode = fejl?.kode ?? null;
    raekke.fejl_decline_code = fejl?.decline_code ?? null;
    raekke.fejl_besked = fejl?.besked ?? null;
  }
  return raekke;
}
