import { describe, it, expect } from "vitest";
import {
  abonnementIdFraFaktura,
  abonnementsMetadataFraFaktura,
  abonnementsperiodeFraLinjer,
  bygTraekRaekke,
  maaRegistrereFejlet,
  momsFraFaktura,
  paymentIntentIdFraFaktura,
  paymentIntentIdFraInvoicePayments,
  traekFejlFraPaymentIntent,
  type StripeAbonnementsFaktura,
} from "../../../supabase/functions/_shared/abonnementstraek.ts";

// Registreringen af månedstræk (indgangen-design §31, 3/9): fakturaen
// læses i BEGGE API-former (2025-03-31.basil og ældre), og rækken til
// company_traek bærer det seneste kendte udfald. Feltnavnene er Stripes
// API-reference, målt 3/9.

const NU = new Date("2026-09-13T08:35:29.000Z");
const COMPANY = "382fd787-3141-45c7-8eea-297b7b947fe0";

// doggybeds rate 12 i basil-form: 3.500 + 875 moms = 4.375 kr.
const basil: StripeAbonnementsFaktura = {
  id: "in_rate12",
  customer: "cus_TE9XePd7bWBkaO",
  metadata: {},
  parent: {
    type: "subscription_details",
    subscription_details: {
      subscription: "sub_1UB6wE3CvBmCx5Ptq3hHp2vt",
      metadata: { art: "migreret", company_id: COMPANY, migreret_fra: "sub_1SHhE5" },
    },
  },
  payments: { data: [{ payment: { type: "payment_intent", payment_intent: "pi_basil" } }] },
  period_start: 1789288529,
  period_end: 1791880529,
  total: 437_500,
  amount_due: 437_500,
  amount_paid: 437_500,
  attempt_count: 1,
  next_payment_attempt: null,
  status: "paid",
  status_transitions: { paid_at: 1789288600 },
  billing_reason: "subscription_cycle",
  number: "DZ7BZXM5-0012",
  hosted_invoice_url: "https://invoice.stripe.com/i/x",
};

const aeldre: StripeAbonnementsFaktura = {
  id: "in_aeldre",
  customer: { id: "cus_obj" },
  subscription: "sub_aeldre",
  subscription_details: { metadata: { art: "indgang", company_id: COMPANY } },
  payment_intent: "pi_aeldre",
  total: 437_500,
  amount_paid: 0,
  attempt_count: 2,
  next_payment_attempt: 1789634129,
  status: "open",
  billing_reason: "subscription_cycle",
};

describe("abonnementIdFraFaktura — basil først, ældre form som fallback", () => {
  it("basil: parent.type subscription_details → parent.subscription_details.subscription", () => {
    expect(abonnementIdFraFaktura(basil)).toBe("sub_1UB6wE3CvBmCx5Ptq3hHp2vt");
  });
  it("basil med udfoldet subscription-objekt", () => {
    const f = { ...basil, parent: { type: "subscription_details", subscription_details: { subscription: { id: "sub_udfoldet" } } } };
    expect(abonnementIdFraFaktura(f)).toBe("sub_udfoldet");
  });
  it("ældre: invoice.subscription", () => {
    expect(abonnementIdFraFaktura(aeldre)).toBe("sub_aeldre");
  });
  it("en manuel faktura (parent null, ingen subscription) er ikke en abonnementsfaktura", () => {
    expect(abonnementIdFraFaktura({ id: "in_manuel", parent: null })).toBeNull();
    expect(abonnementIdFraFaktura({ id: "in_quote", parent: { type: "quote_details" } })).toBeNull();
  });
});

describe("abonnementsMetadataFraFaktura", () => {
  it("basil-snapshot på fakturaen", () => {
    expect(abonnementsMetadataFraFaktura(basil)?.company_id).toBe(COMPANY);
    expect(abonnementsMetadataFraFaktura(basil)?.art).toBe("migreret");
  });
  it("ældre subscription_details.metadata", () => {
    expect(abonnementsMetadataFraFaktura(aeldre)?.art).toBe("indgang");
  });
  it("tom metadata → null (kalderen slår abonnementet op)", () => {
    expect(abonnementsMetadataFraFaktura({ id: "x", parent: { type: "subscription_details", subscription_details: { subscription: "sub_x", metadata: {} } } })).toBeNull();
    expect(abonnementsMetadataFraFaktura({ id: "y" })).toBeNull();
  });
});

describe("paymentIntentIdFraFaktura", () => {
  it("ældre invoice.payment_intent vinder", () => {
    expect(paymentIntentIdFraFaktura(aeldre)).toBe("pi_aeldre");
  });
  it("basil: første InvoicePayment af typen payment_intent", () => {
    expect(paymentIntentIdFraFaktura(basil)).toBe("pi_basil");
    const f = { ...basil, payments: { data: [{ payment: { type: "charge", payment_intent: null } }, { payment: { type: "payment_intent", payment_intent: { id: "pi_2" } } }] } };
    expect(paymentIntentIdFraFaktura(f)).toBe("pi_2");
  });
  it("null når intet findes", () => {
    expect(paymentIntentIdFraFaktura({ id: "x" })).toBeNull();
    expect(paymentIntentIdFraFaktura({ id: "x", payments: { data: [] } })).toBeNull();
  });
});

describe("traekFejlFraPaymentIntent", () => {
  it("de tre felter fra last_payment_error — plus advice_code og network_decline_code (16/9), null når de mangler", () => {
    expect(traekFejlFraPaymentIntent({ last_payment_error: { code: "card_declined", decline_code: "insufficient_funds", message: "Your card has insufficient funds." } }))
      .toEqual({ kode: "card_declined", decline_code: "insufficient_funds", besked: "Your card has insufficient funds.", advice_code: null, network_decline_code: null });
  });
  it("Livja 16/9 (pi_3UG5Lo3CvBmCx5Pt0Mczu1dC): card_declined / invalid_account / do_not_try_again / 46 / «Invalid account.»", () => {
    expect(traekFejlFraPaymentIntent({
      last_payment_error: { type: "card_error", code: "card_declined", decline_code: "invalid_account", advice_code: "do_not_try_again", network_decline_code: "46", message: "Invalid account.", charge: "ch_3UG5Lo3CvBmCx5Pt0hv0XVPG" } as never,
    })).toEqual({ kode: "card_declined", decline_code: "invalid_account", besked: "Invalid account.", advice_code: "do_not_try_again", network_decline_code: "46" });
  });
  it("null når fejlen mangler eller er tom", () => {
    expect(traekFejlFraPaymentIntent(null)).toBeNull();
    expect(traekFejlFraPaymentIntent({ last_payment_error: null })).toBeNull();
    expect(traekFejlFraPaymentIntent({ last_payment_error: { code: "", decline_code: null, message: " " } })).toBeNull();
  });
});

describe("paymentIntentIdFraInvoicePayments — vej 2: GET /v1/invoice_payments?invoice= (16/9)", () => {
  it("første InvoicePayment af typen payment_intent; udfoldet objekt; tom liste → null", () => {
    expect(paymentIntentIdFraInvoicePayments([{ payment: { type: "payment_intent", payment_intent: "pi_3UG5Lo3CvBmCx5Pt0Mczu1dC" } }])).toBe("pi_3UG5Lo3CvBmCx5Pt0Mczu1dC");
    expect(paymentIntentIdFraInvoicePayments([{ payment: { type: "charge", payment_intent: null } }, { payment: { type: "payment_intent", payment_intent: { id: "pi_2" } } }])).toBe("pi_2");
    expect(paymentIntentIdFraInvoicePayments([])).toBeNull();
    expect(paymentIntentIdFraInvoicePayments(null)).toBeNull();
  });
});

// ── Perioden fra abonnementslinjen (16/9) ──
//
// Livja, TBR-0007 (subscription_create): fakturaens period_start = period_end
// = 2026-09-15T22:00Z — nul-lang. Linjens period: 15/9 22:00Z → 15/10 22:00Z.
// Referencen: «Use the line item period to get the service period for each
// price.» Rækken skal bære linjens periode; fakturaens kun som fallback.
const LIVJA_START = Date.UTC(2026, 8, 15, 22) / 1000;
const LIVJA_SLUT = Date.UTC(2026, 9, 15, 22) / 1000;
const livja: StripeAbonnementsFaktura = {
  id: "in_1UG4PE3CvBmCx5Pt5LSqqIW2",
  customer: "cus_livja",
  parent: { type: "subscription_details", subscription_details: { subscription: "sub_livja", metadata: { art: "migreret", company_id: COMPANY } } },
  period_start: LIVJA_START,
  period_end: LIVJA_START,
  lines: {
    data: [
      { parent: { type: "subscription_item_details", subscription_item_details: { subscription_item: "si_x", subscription: "sub_livja" } }, period: { start: LIVJA_START, end: LIVJA_SLUT } },
    ],
  },
  total: 437_500,
  amount_due: 437_500,
  amount_paid: 0,
  attempt_count: 1,
  next_payment_attempt: Date.UTC(2026, 8, 19, 1, 1) / 1000,
  status: "open",
  billing_reason: "subscription_create",
  number: "TBR-0007",
};

describe("abonnementsperiodeFraLinjer — linjen med parent.subscription_item_details (basil) eller type subscription (ældre)", () => {
  it("Livja: subscription_create med nul-lang fakturaperiode → linjens periode", () => {
    expect(abonnementsperiodeFraLinjer(livja)).toEqual({ start: LIVJA_START, end: LIVJA_SLUT });
  });
  it("ældre form: type «subscription»", () => {
    expect(abonnementsperiodeFraLinjer({ lines: { data: [{ type: "subscription", subscription_item: "si", period: { start: 10, end: 20 } }] } })).toEqual({ start: 10, end: 20 });
  });
  it("proration og abonnement på samme faktura: den længste periode er abonnementets", () => {
    const f = { lines: { data: [
      { parent: { type: "subscription_item_details", subscription_item_details: { subscription_item: "si", subscription: "sub" } }, period: { start: 15, end: 20 } },
      { parent: { type: "subscription_item_details", subscription_item_details: { subscription_item: "si", subscription: "sub" } }, period: { start: 10, end: 20 } },
    ] } };
    expect(abonnementsperiodeFraLinjer(f)).toEqual({ start: 10, end: 20 });
  });
  it("ingen abonnementslinje (invoice item, tom liste, ingen lines, ulæselig period) → null", () => {
    expect(abonnementsperiodeFraLinjer({ lines: { data: [{ parent: { type: "invoice_item_details" }, period: { start: 1, end: 2 } }] } })).toBeNull();
    expect(abonnementsperiodeFraLinjer({ lines: { data: [] } })).toBeNull();
    expect(abonnementsperiodeFraLinjer({})).toBeNull();
    expect(abonnementsperiodeFraLinjer({ lines: { data: [{ type: "subscription", period: { start: null, end: 2 } }] } })).toBeNull();
  });
});

describe("bygTraekRaekke — perioden (16/9)", () => {
  it("Livja fejlet: periode_start/periode_slut fra abonnementslinjen, ikke fakturaens nul-lange periode", () => {
    const r = bygTraekRaekke(livja, "fejlet", COMPANY, "sub_livja", "migreret", null, NU);
    expect(r.periode_start).toBe("2026-09-15T22:00:00.000Z");
    expect(r.periode_slut).toBe("2026-10-15T22:00:00.000Z");
    expect(r).toMatchObject({ status: "fejlet", forsoeg: 1, naeste_forsoeg_at: "2026-09-19T01:01:00.000Z", faktura_nummer: "TBR-0007", billing_reason: "subscription_create" });
  });
  it("betalt: samme regel — linjens periode", () => {
    const r = bygTraekRaekke({ ...livja, status: "paid", amount_paid: 437_500 }, "betalt", COMPANY, "sub_livja", "migreret", null, NU);
    expect(r.periode_start).toBe("2026-09-15T22:00:00.000Z");
    expect(r.periode_slut).toBe("2026-10-15T22:00:00.000Z");
  });
  it("ingen abonnementslinje → fakturaens period_start/period_end (som før)", () => {
    const r = bygTraekRaekke(basil, "betalt", COMPANY, "sub_x", null, null, NU);
    expect(r.periode_start).toBe("2026-09-13T08:35:29.000Z");
    expect(r.periode_slut).toBe("2026-10-13T08:35:29.000Z");
  });
});

describe("bygTraekRaekke", () => {
  it("betalt: total inkl. moms, betalt_at fra Stripe, ingen fejl-nøgler, art fra abonnementet", () => {
    const r = bygTraekRaekke(basil, "betalt", COMPANY, "sub_1UB6wE3CvBmCx5Ptq3hHp2vt", "migreret", null, NU);
    expect(r).toMatchObject({
      company_id: COMPANY,
      stripe_subscription_id: "sub_1UB6wE3CvBmCx5Ptq3hHp2vt",
      stripe_invoice_id: "in_rate12",
      stripe_customer_id: "cus_TE9XePd7bWBkaO",
      art: "migreret",
      periode_start: "2026-09-13T08:35:29.000Z",
      periode_slut: "2026-10-13T08:35:29.000Z",
      beloeb_oere: 437_500,
      betalt_oere: 437_500,
      status: "betalt",
      forsoeg: 1,
      naeste_forsoeg_at: null,
      billing_reason: "subscription_cycle",
      faktura_nummer: "DZ7BZXM5-0012",
      betalt_at: "2026-09-13T08:36:40.000Z",
    });
    expect("fejl_kode" in r).toBe(false);
    expect("fejlet_at" in r).toBe(false);
  });

  it("fejlet: fejlet_at = nu, fejl-felterne sat, næste forsøg fra Stripe, betalt_oere 0, ingen betalt_at-nøgle", () => {
    const r = bygTraekRaekke(aeldre, "fejlet", COMPANY, "sub_aeldre", "indgang", { kode: "card_declined", decline_code: "insufficient_funds", besked: "Insufficient." }, NU);
    expect(r).toMatchObject({
      status: "fejlet",
      betalt_oere: 0,
      forsoeg: 2,
      naeste_forsoeg_at: "2026-09-17T08:35:29.000Z",
      fejlet_at: NU.toISOString(),
      fejl_kode: "card_declined",
      fejl_decline_code: "insufficient_funds",
      fejl_besked: "Insufficient.",
      stripe_customer_id: "cus_obj",
      art: "indgang",
    });
    expect("betalt_at" in r).toBe(false);
  });

  it("fejlet uden fejl fra Stripe → fejl-felterne er null, ikke udeladt", () => {
    const r = bygTraekRaekke(aeldre, "fejlet", COMPANY, "sub_aeldre", null, null, NU);
    expect(r.fejl_kode).toBeNull();
    expect(r.fejl_decline_code).toBeNull();
    expect(r.fejl_besked).toBeNull();
    expect(r.art).toBeNull();
  });

  it("betalt uden paid_at → betalt_at = nu; tom art → null", () => {
    const r = bygTraekRaekke({ ...basil, status_transitions: null }, "betalt", COMPANY, "sub_x", "  ", null, NU);
    expect(r.betalt_at).toBe(NU.toISOString());
    expect(r.art).toBeNull();
  });
});

describe("maaRegistrereFejlet — et betalt træk bliver aldrig til fejlet (11/9)", () => {
  it("ingen række endnu → skriv", () => {
    expect(maaRegistrereFejlet(null)).toBe(true);
  });
  it("rækken står som fejlet → skriv (et forsøg til)", () => {
    expect(maaRegistrereFejlet("fejlet")).toBe(true);
  });
  it("rækken står som betalt → skriv IKKE: betalt er slutstatus, og et senere fejlet-event er et ældre forsøg", () => {
    expect(maaRegistrereFejlet("betalt")).toBe(false);
  });
});

// ── Momsen pr. betaling (16/9; Jonas: «Priserne vi vil se er dem ex. moms.») ──
// Aldrig 25 % antaget: momsen læses fra Stripes Invoice-objekt. Referencen
// (docs.stripe.com/api/invoices/object, 16/9): «total_taxes — The aggregate
// tax information of all line items» med «amount — The amount of the tax, in
// the smallest currency unit»; changelog 2025-03-31.basil «Replaces top-level
// tax-related properties …»: «`tax`, `total_tax_amounts` — Removed — Invoice».
describe("momsFraFaktura — momsen fra Stripe, i rækkefølge, aldrig et gæt", () => {
  // doggybed rate 12 som en basil-faktura bærer det: 3.500 + 875 = 4.375 kr.
  const basilMoms = { total_taxes: [{ amount: 87_500, tax_behavior: "exclusive", type: "tax_rate_details" }], total: 437_500, total_excluding_tax: 350_000 };
  it("basil: total_taxes[].amount summeret — flere elementer lægges sammen", () => {
    expect(momsFraFaktura(basilMoms)).toBe(87_500);
    expect(momsFraFaktura({ total_taxes: [{ amount: 50_000 }, { amount: 37_500 }] })).toBe(87_500);
  });
  it("basil med TOM total_taxes er et svar: ingen moms → 0 (fx en momsfri kunde eller en 0-faktura)", () => {
    expect(momsFraFaktura({ total_taxes: [], total: 0 })).toBe(0);
    expect(momsFraFaktura({ total_taxes: [], total: 350_000, total_excluding_tax: 350_000 })).toBe(0);
  });
  it("ældre API: `tax` når total_taxes mangler; ellers total_tax_amounts[] summeret", () => {
    expect(momsFraFaktura({ tax: 87_500, total: 437_500 })).toBe(87_500);
    expect(momsFraFaktura({ tax: null, total_tax_amounts: [{ amount: 87_500 }], total: 437_500 })).toBe(87_500);
  });
  it("kun total og total_excluding_tax: differencen", () => {
    expect(momsFraFaktura({ total: 437_500, total_excluding_tax: 350_000 })).toBe(87_500);
  });
  it("intet af det → null (ikke kendt) — og aldrig beløb × 0,2", () => {
    expect(momsFraFaktura({ total: 437_500 })).toBeNull();
    expect(momsFraFaktura({})).toBeNull();
    expect(momsFraFaktura({ total_taxes: null, tax: null, total_tax_amounts: null, total: 437_500, total_excluding_tax: null })).toBeNull();
  });
  it("bygTraekRaekke bærer moms_oere: fra basil-fakturaen 87.500; uden momsfelter null", () => {
    const med = bygTraekRaekke({ ...basil, ...basilMoms }, "betalt", COMPANY, "sub_x", "migreret", null, NU);
    expect(med.moms_oere).toBe(87_500);
    expect(med.beloeb_oere).toBe(437_500);
    const uden = bygTraekRaekke(basil, "betalt", COMPANY, "sub_x", "migreret", null, NU);
    expect(uden.moms_oere).toBeNull();
    expect("moms_oere" in uden).toBe(true);
    // Fejlet træk bærer også momsen (samme faktura, samme moms).
    expect(bygTraekRaekke({ ...aeldre, tax: 87_500 }, "fejlet", COMPANY, "sub_aeldre", null, null, NU).moms_oere).toBe(87_500);
  });
});
