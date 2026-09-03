import { describe, it, expect } from "vitest";
import {
  beregnBerigelse,
  erRegisterkode,
  felterDerKraeverCvr,
  harCvr,
  type BerigelsesVirksomhed,
} from "../../../supabase/functions/_shared/berigelse.ts";

// Engangs-berigelsen (berig-virksomheder, 3/9): kun tomme felter udfyldes,
// registerkoder i industry_code rettes når motoren rammer, contact_email
// kommer fra medlemmet — og en gentagelse ændrer intet.

const tom = (overrides: Partial<BerigelsesVirksomhed> = {}): BerigelsesVirksomhed => ({
  id: "c1",
  name: "Test ApS",
  cvr_number: "41772239",
  address: null,
  postal_code: null,
  city: null,
  industry_code: null,
  industry_label: null,
  contact_email: null,
  raw_industry_code: null,
  ...overrides,
});

// cvrapi's feltnavne, målt live 3/9 (FLOOR1). 620100 rammer tech_software.
const cvr = {
  industry_code: "620100",
  industry_label: "Computerprogrammering",
  address: "Vestergade 41, 1. tv.",
  zipcode: "8600",
  city: "Silkeborg",
};

describe("beregnBerigelse — tomme felter udfyldes", () => {
  it("alle seks felter tomme + fuldt CVR-svar + ejer → alle seks sættes", () => {
    const plan = beregnBerigelse(tom(), cvr, { email: "Ejer@Test.dk" });
    expect(plan.opdatering).toEqual({
      address: "Vestergade 41, 1. tv.",
      postal_code: "8600",
      city: "Silkeborg",
      industry_code: "tech_software",
      industry_label: "Computerprogrammering",
      contact_email: "ejer@test.dk",
    });
    expect(plan.sprunget_over).toEqual([]);
  });

  it("eksisterende værdier overskrives ALDRIG — heller ikke når CVR siger noget andet", () => {
    const v = tom({
      address: "Strandvejen 1",
      postal_code: "2900",
      city: "Hellerup",
      industry_code: "retail_other",
      industry_label: "Detailhandel",
      contact_email: "nogen@firma.dk",
    });
    const plan = beregnBerigelse(v, cvr, { email: "ejer@test.dk" });
    expect(plan.opdatering).toEqual({});
    expect(plan.sprunget_over).toEqual([]);
  });

  it("delvist udfyldt: kun hullerne fyldes", () => {
    const v = tom({ address: "Strandvejen 1", industry_label: "Egen tekst", contact_email: "x@y.dk" });
    const plan = beregnBerigelse(v, cvr, null);
    expect(plan.opdatering).toEqual({ postal_code: "8600", city: "Silkeborg", industry_code: "tech_software" });
  });

  it("idempotent: planen på en allerede beriget række er tom", () => {
    const foerste = beregnBerigelse(tom(), cvr, { email: "ejer@test.dk" });
    const beriget = tom({ ...(foerste.opdatering as Partial<BerigelsesVirksomhed>) });
    const anden = beregnBerigelse(beriget, cvr, { email: "ejer@test.dk" });
    expect(anden.opdatering).toEqual({});
    expect(anden.kraever_cvr).toBe(false);
  });
});

describe("beregnBerigelse — registerkoden i industry_code (WESDEX/Two Socks-fejlen)", () => {
  it("rene cifre erstattes af motorens kode når den rammer — labelen røres ikke", () => {
    const v = tom({ industry_code: "620100", industry_label: "Software", address: "a", postal_code: "b", city: "c", contact_email: "e@e.dk" });
    const plan = beregnBerigelse(v, cvr, null);
    expect(plan.opdatering).toEqual({ industry_code: "tech_software" });
  });

  it("rene cifre står urørt når motoren IKKE rammer — og det bogføres", () => {
    const v = tom({ industry_code: "551000", address: "a", postal_code: "b", city: "c", industry_label: "Hotel", contact_email: "e@e.dk" });
    const plan = beregnBerigelse(v, { ...cvr, industry_code: "551000", industry_label: "Hoteller" }, null);
    expect(plan.opdatering).toEqual({});
    expect(plan.sprunget_over).toEqual([{ felt: "industry_code", grund: expect.stringContaining("motoren rammer ikke DB25-koden 551000") }]);
    expect(plan.sprunget_over[0].grund).toContain("registerkoden 551000 står urørt");
  });

  it("en taksonomikode er ikke en registerkode", () => {
    expect(erRegisterkode("tech_software")).toBe(false);
    expect(erRegisterkode("439100")).toBe(true);
    expect(erRegisterkode("11100")).toBe(true); // tabt foranstillet nul
    expect(erRegisterkode("")).toBe(false);
    expect(erRegisterkode(null)).toBe(false);
  });
});

describe("beregnBerigelse — uden CVR-opslag", () => {
  it("branchen udledes af raw_cvr_data når der intet svar er (tørkørsel)", () => {
    const v = tom({ raw_industry_code: "620100", address: "a", postal_code: "b", city: "c", contact_email: "e@e.dk" });
    const plan = beregnBerigelse(v, null, null);
    expect(plan.opdatering).toEqual({ industry_code: "tech_software", industry_label: "Softwareudvikling" });
  });

  it("adressen kræver opslag når der er CVR men intet svar", () => {
    const plan = beregnBerigelse(tom({ industry_code: "x", industry_label: "y", contact_email: "e@e.dk" }), null, null);
    expect(plan.opdatering).toEqual({});
    expect(plan.sprunget_over.map((s) => s.felt).sort()).toEqual(["address", "city", "postal_code"]);
    expect(plan.sprunget_over.every((s) => s.grund === "kræver CVR-opslag")).toBe(true);
    expect(plan.kraever_cvr).toBe(true);
  });

  it("intet CVR-nummer: adresse og branche kan ikke hjælpes, og det siges", () => {
    const plan = beregnBerigelse(tom({ cvr_number: null, contact_email: "e@e.dk" }), null, null);
    expect(plan.opdatering).toEqual({});
    expect(plan.sprunget_over.find((s) => s.felt === "address")?.grund).toBe("intet CVR-nummer");
    expect(plan.sprunget_over.find((s) => s.felt === "industry_code")?.grund).toContain("intet CVR-nummer");
    expect(plan.kraever_cvr).toBe(false);
  });

  it("ingen DB25-kode nogen steder (Bastant, Capture IT, Din økonomiafdeling)", () => {
    const plan = beregnBerigelse(tom({ address: "a", postal_code: "b", city: "c", contact_email: "e@e.dk" }), { address: "a", zipcode: "b", city: "c" }, null);
    expect(plan.opdatering).toEqual({});
    expect(plan.sprunget_over.find((s) => s.felt === "industry_code")?.grund).toContain("hverken CVR-svaret eller raw_cvr_data");
  });
});

describe("beregnBerigelse — contact_email fra medlemmet, aldrig CVR", () => {
  const fuld = tom({ address: "a", postal_code: "b", city: "c", industry_code: "x", industry_label: "y" });

  it("ejeren giver mailen, i små bogstaver", () => {
    expect(beregnBerigelse(fuld, null, { email: "  Ejer@Firma.DK " }).opdatering).toEqual({ contact_email: "ejer@firma.dk" });
  });

  it("ingen medlemmer / flere uden ejer / medlem uden mail → sprunget over med grund", () => {
    for (const [grund, tekst] of [
      ["ingen_medlemmer", "ingen medlemmer på virksomheden"],
      ["flere_medlemmer_ingen_ejer", "flere medlemmer, ingen med rollen owner"],
      ["medlem_uden_mail", "medlemmet har ingen mail"],
    ] as const) {
      const plan = beregnBerigelse(fuld, null, { email: null, grund });
      expect(plan.opdatering).toEqual({});
      expect(plan.sprunget_over).toEqual([{ felt: "contact_email", grund: tekst }]);
    }
  });
});

describe("felterDerKraeverCvr / harCvr", () => {
  it("tæller kun felter et opslag kan udfylde — branche fra raw_cvr_data kræver intet opslag", () => {
    expect(felterDerKraeverCvr(tom({ raw_industry_code: "620100" })).sort()).toEqual(["address", "city", "postal_code"]);
    expect(felterDerKraeverCvr(tom()).sort()).toEqual(["address", "city", "industry_code", "industry_label", "postal_code"]);
    expect(felterDerKraeverCvr(tom({ address: "a", postal_code: "b", city: "c", industry_code: "x", industry_label: "y" }))).toEqual([]);
  });

  it("harCvr kræver præcis otte cifre", () => {
    expect(harCvr({ cvr_number: "41772239" })).toBe(true);
    expect(harCvr({ cvr_number: " 41772239 " })).toBe(true);
    expect(harCvr({ cvr_number: "4177223" })).toBe(false);
    expect(harCvr({ cvr_number: null })).toBe(false);
  });
});
