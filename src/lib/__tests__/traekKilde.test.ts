import { describe, expect, it } from "vitest";
import { TRAEK_KILDER, harFakturaLink, traekLabel } from "@/lib/traek";
import { traekLinje } from "@/lib/hjemmebane/indstillinger";

/* Én betalingsliste pr. virksomhed (16/9): kilden afgør linjens label —
   «Træk {nr}» (abonnement, som i dag), «Stripe · {nr}» (engangsbetaling),
   «e-conomic #{nr}» — og fakturalinket findes kun når Stripe har en side. */

describe("traekLabel — kilden i ordene", () => {
  it("abonnementstræk: «Træk {nr}» som i dag; uden nummer bare «Træk»", () => {
    expect(traekLabel({ kilde: "stripe_abonnement", faktura_nummer: "VYSFU5CT-0003" })).toBe("Træk VYSFU5CT-0003");
    expect(traekLabel({ kilde: "stripe_abonnement", faktura_nummer: null })).toBe("Træk");
  });
  it("engangsbetaling i Stripe: «Stripe · {nr}»", () => {
    expect(traekLabel({ kilde: "stripe_engang", faktura_nummer: "D9VAUPRB-0001" })).toBe("Stripe · D9VAUPRB-0001");
    expect(traekLabel({ kilde: "stripe_engang", faktura_nummer: null })).toBe("Stripe");
  });
  it("e-conomic: «e-conomic #{nr}»", () => {
    expect(traekLabel({ kilde: "e-conomic", faktura_nummer: "138" })).toBe("e-conomic #138");
    expect(traekLabel({ kilde: "e-conomic", faktura_nummer: "  " })).toBe("e-conomic");
  });
  it("manglende eller ukendt kilde læses som abonnement (rækker fra før migrationen bærer DEFAULT'en)", () => {
    expect(traekLabel({ faktura_nummer: "A-1" })).toBe("Træk A-1");
    expect(traekLabel({ kilde: null, faktura_nummer: "A-1" })).toBe("Træk A-1");
    expect(traekLabel({ kilde: "noget_nyt", faktura_nummer: "A-1" })).toBe("Træk A-1");
  });
  it("medlemmets ord for abonnementet er «Faktura» — de andre kilder er ens for begge flader", () => {
    expect(traekLabel({ kilde: "stripe_abonnement", faktura_nummer: "F-100" }, "Faktura")).toBe("Faktura F-100");
    expect(traekLabel({ kilde: "stripe_engang", faktura_nummer: "F-100" }, "Faktura")).toBe("Stripe · F-100");
    expect(traekLabel({ kilde: "e-conomic", faktura_nummer: "112" }, "Faktura")).toBe("e-conomic #112");
  });
  it("de tre kilder er præcis migrationens CHECK", () => {
    expect([...TRAEK_KILDER]).toEqual(["stripe_abonnement", "stripe_engang", "e-conomic"]);
  });
});

describe("harFakturaLink — kun når Stripe har en side", () => {
  it("null, tom og whitespace giver intet link; en URL giver", () => {
    expect(harFakturaLink({ hosted_invoice_url: null })).toBe(false);
    expect(harFakturaLink({ hosted_invoice_url: "" })).toBe(false);
    expect(harFakturaLink({ hosted_invoice_url: "   " })).toBe(false);
    expect(harFakturaLink({ hosted_invoice_url: "https://invoice.stripe.com/i/x" })).toBe(true);
  });
});

describe("traekLinje (medlemmets flade) — nøgle og label pr. kilde", () => {
  const basis = { status: "betalt", beloeb_oere: 5000000, betalt_at: "2026-01-21T11:00:00Z", fejlet_at: null, hosted_invoice_url: null };
  it("e-conomic-række: nøglen er rækkens id, label «e-conomic #{nr}», intet fakturalink", () => {
    const l = traekLinje({ ...basis, id: "row-1", kilde: "e-conomic", stripe_invoice_id: null, faktura_nummer: "122" });
    expect(l).toEqual({ id: "row-1", label: "e-conomic #122", vaerdi: "50.000 kr. · Betalt 21. januar 2026", rust: false, fakturaUrl: null });
  });
  it("engangsbetaling: «Stripe · {nr}», link når Stripe har en side", () => {
    const l = traekLinje({ ...basis, id: "row-2", kilde: "stripe_engang", stripe_invoice_id: "in_1Ry8oB", faktura_nummer: "D9VAUPRB-0001", hosted_invoice_url: "https://invoice.stripe.com/i/y" });
    expect(l.label).toBe("Stripe · D9VAUPRB-0001");
    expect(l.fakturaUrl).toBe("https://invoice.stripe.com/i/y");
  });
  it("abonnement uden id (ældre kalder): nøglen falder tilbage til Stripe-id'et, label «Faktura {nr}»", () => {
    const l = traekLinje({ ...basis, stripe_invoice_id: "in_1", faktura_nummer: "F-100" });
    expect(l.id).toBe("in_1");
    expect(l.label).toBe("Faktura F-100");
  });
  it("hverken id eller Stripe-id: nøglen bygges af nummeret — aldrig null", () => {
    const l = traekLinje({ ...basis, kilde: "e-conomic", stripe_invoice_id: null, faktura_nummer: "130" });
    expect(l.id).toBe("traek:130");
  });
});
