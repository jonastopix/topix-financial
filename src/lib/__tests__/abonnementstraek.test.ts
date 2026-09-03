import { describe, it, expect } from "vitest";
import {
  abonnementIdFraFaktura,
  abonnementsMetadataFraFaktura,
  bygTraekRaekke,
  paymentIntentIdFraFaktura,
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
  it("de tre felter fra last_payment_error", () => {
    expect(traekFejlFraPaymentIntent({ last_payment_error: { code: "card_declined", decline_code: "insufficient_funds", message: "Your card has insufficient funds." } }))
      .toEqual({ kode: "card_declined", decline_code: "insufficient_funds", besked: "Your card has insufficient funds." });
  });
  it("null når fejlen mangler eller er tom", () => {
    expect(traekFejlFraPaymentIntent(null)).toBeNull();
    expect(traekFejlFraPaymentIntent({ last_payment_error: null })).toBeNull();
    expect(traekFejlFraPaymentIntent({ last_payment_error: { code: "", decline_code: null, message: " " } })).toBeNull();
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
