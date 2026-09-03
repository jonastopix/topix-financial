import { describe, it, expect } from "vitest";
import {
  bygFakturalinjeParametre,
  bygFakturaParametre,
  bygKundeParametre,
  FAKTURA_ART,
  FAKTURA_DAGE_TIL_FORFALD,
  findIndgangsFaktura,
  idempotensNoegle,
} from "../../../supabase/functions/_shared/indgangsFakturaParametre.ts";

// Låser de to KRITISKE krav fra docs/indgangen-design.md §30 og
// beslutningerne 3/9: metadata[company_id] på både kunde og faktura,
// send_invoice med days_until_due 4, frit beløb fra prisniveau_oere,
// tax_behavior exclusive, og idempotens-opslaget mod Stripe.

const COMPANY = "0f2b6a1e-1b7c-4c3e-9b1a-2d3e4f5a6b7c";
const KUNDE = "cus_test123";

describe("bygKundeParametre", () => {
  it("sætter metadata[company_id] på kunden — uden den kan betalingen ikke finde tilbage (§30)", () => {
    const p = bygKundeParametre({
      companyId: COMPANY,
      navn: "Two Socks ApS",
      email: "kontakt@twosocks.dk",
      adresse: "Strandvejen 1",
      postnummer: "2900",
      by: "Hellerup",
    });
    expect(p["metadata[company_id]"]).toBe(COMPANY);
    expect(p["metadata[art]"]).toBe(FAKTURA_ART);
    expect(p.name).toBe("Two Socks ApS");
    expect(p.email).toBe("kontakt@twosocks.dk");
  });

  it("sender adressen med land DK når der er noget at placere", () => {
    const p = bygKundeParametre({
      companyId: COMPANY,
      navn: "X",
      email: "x@x.dk",
      adresse: "Strandvejen 1",
      postnummer: "2900",
      by: "Hellerup",
    });
    expect(p["address[line1]"]).toBe("Strandvejen 1");
    expect(p["address[postal_code]"]).toBe("2900");
    expect(p["address[city]"]).toBe("Hellerup");
    expect(p["address[country]"]).toBe("DK");
  });

  it("udelader adressefelterne helt når virksomheden ingen adresse har", () => {
    const p = bygKundeParametre({ companyId: COMPANY, navn: "X", email: "x@x.dk", adresse: null, postnummer: "  ", by: null });
    expect(Object.keys(p).filter((k) => k.startsWith("address["))).toEqual([]);
  });
});

describe("bygFakturaParametre", () => {
  const p = bygFakturaParametre(COMPANY, KUNDE);

  it("sætter metadata[company_id] på SELVE fakturaen, ikke kun på kunden (§30)", () => {
    expect(p["metadata[company_id]"]).toBe(COMPANY);
    expect(p["metadata[art]"]).toBe("indgang");
  });

  it("er send_invoice med days_until_due 4 — send_invoice kræver en forfaldsdag (målt hos Stripe 3/9)", () => {
    expect(p.collection_method).toBe("send_invoice");
    expect(p.days_until_due).toBe("4");
    expect(FAKTURA_DAGE_TIL_FORFALD).toBe(4);
  });

  it("er en tom kladde i DKK uden auto-advance og uden løse linjer", () => {
    expect(p.customer).toBe(KUNDE);
    expect(p.currency).toBe("dkk");
    expect(p.auto_advance).toBe("false");
    expect(p.pending_invoice_items_behavior).toBe("exclude");
    expect(p["automatic_tax[enabled]"]).toBe("true");
  });
});

describe("bygFakturalinjeParametre", () => {
  const p = bygFakturalinjeParametre(COMPANY, KUNDE, "in_test123", 4_250_000);

  it("bærer prisniveau_oere som frit beløb — ingen lookup_key, ingen price (besluttet 3/9)", () => {
    expect(p.amount).toBe("4250000");
    expect(p.currency).toBe("dkk");
    expect(p.price).toBeUndefined();
    expect(Object.keys(p).some((k) => k.startsWith("price_data") || k.startsWith("pricing"))).toBe(false);
  });

  it("knyttes til kladden og bruger husets tax_behavior (exclusive)", () => {
    expect(p.invoice).toBe("in_test123");
    expect(p.customer).toBe(KUNDE);
    expect(p.tax_behavior).toBe("exclusive");
    expect(p.description.length).toBeGreaterThan(0);
    expect(p["metadata[company_id]"]).toBe(COMPANY);
  });
});

describe("findIndgangsFaktura — idempotens mod Stripe", () => {
  it("finder fakturaen på begge metadata-nøgler og springer void over", () => {
    const fundet = findIndgangsFaktura(
      [
        { id: "in_void", status: "void", metadata: { company_id: COMPANY, art: "indgang" } },
        { id: "in_fornyelse", status: "open", metadata: { company_id: COMPANY, art: "fornyelse" } },
        { id: "in_anden", status: "open", metadata: { company_id: "anden", art: "indgang" } },
        { id: "in_rigtig", status: "open", metadata: { company_id: COMPANY, art: "indgang" } },
      ],
      COMPANY,
    );
    expect(fundet?.id).toBe("in_rigtig");
  });

  it("giver null når kunden ingen indgangsfaktura har", () => {
    expect(findIndgangsFaktura([], COMPANY)).toBeNull();
    expect(findIndgangsFaktura([{ id: "in_x", status: "paid", metadata: null }], COMPANY)).toBeNull();
  });
});

describe("idempotensNoegle", () => {
  it("er afledt af virksomhed og trin, forskellig pr. trin, og under Stripes 255 tegn", () => {
    const kunde = idempotensNoegle(COMPANY, "kunde");
    const faktura = idempotensNoegle(COMPANY, "faktura");
    const linje = idempotensNoegle(COMPANY, "linje");
    expect(new Set([kunde, faktura, linje]).size).toBe(3);
    for (const n of [kunde, faktura, linje]) {
      expect(n).toContain(COMPANY);
      expect(n.length).toBeLessThanOrEqual(255);
    }
    expect(idempotensNoegle(COMPANY, "faktura")).toBe(faktura);
  });
});
