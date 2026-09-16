import { describe, expect, it } from "vitest";
import { DATACVR_BASE_URL, dataCvrUrl, tolkDataCvrSvar } from "../../../supabase/functions/_shared/cvrOpslag.ts";

// Tolkningen af DataCVR's svar (16/9-2026, _shared/cvrOpslag.ts): fem
// udfald i stedet for ét null (fund 6 og 13). Fixturen er DataCVR's form
// som målt 16/9 — flade felter med cvrapi's navne plus ekstra felter, bl.a.
// owners[] med personnavne, som aldrig må komme med. Navnene er opfundne.

const FUNDET = {
  vat: 12345678,
  name: "Testvirksomhed ApS",
  address: "Vestergade 41, 1. tv.",
  zipcode: "8600",
  city: "Silkeborg",
  cityname: null,
  addressco: null,
  phone: "12345678",
  email: "info@testvirksomhed.test",
  website: null,
  industrycode: 475510,
  industrydesc: "Detailhandel med møbler",
  companycode: 80,
  companydesc: "Anpartsselskab",
  startdate: "2026-04-17",
  enddate: null,
  employees: "5-9",
  protected: true,
  municipality: "Testby",
  municipality_code: 999,
  secondary_industrycode: null,
  secondary_industrydesc: null,
  purpose: "Selskabets formål er handel.",
  capital: 40000,
  capital_currency: "DKK",
  owners: [{ name: "Test Ejer", participantnumber: 1234567, share: "100%" }],
  productionunits: [{ pno: 1000000001, name: "Testvirksomhed ApS" }],
  last_updated: "2026-09-01",
  llm_summary: "En opfunden virksomhed.",
};

const NOT_FOUND = { error: "NOT_FOUND", message: "Virksomhed med CVR 44891917 blev ikke fundet" };

describe("tolkDataCvrSvar — 200: fundet med præcis CvrSvar's syv felter", () => {
  it("mapper name, founded ← startdate, industry_code ← String(industrycode), industry_label ← industrydesc, address, zipcode, city — og intet andet", () => {
    const r = tolkDataCvrSvar(200, FUNDET);
    expect(r).toEqual({
      udfald: "fundet",
      svar: {
        name: "Testvirksomhed ApS",
        founded: "2026-04-17",
        industry_code: "475510",
        industry_label: "Detailhandel med møbler",
        address: "Vestergade 41, 1. tv.",
        zipcode: "8600",
        city: "Silkeborg",
      },
    });
    if (r.udfald !== "fundet") throw new Error("forventede fundet");
    expect(Object.keys(r.svar).sort()).toEqual(["address", "city", "founded", "industry_code", "industry_label", "name", "zipcode"]);
    expect(typeof r.svar.industry_code).toBe("string");
  });

  it("owners, participantnumber, protected og de øvrige ekstra felter kommer ALDRIG med", () => {
    const tekst = JSON.stringify(tolkDataCvrSvar(200, FUNDET));
    for (const forbudt of ["Test Ejer", "1234567", "owners", "participantnumber", "protected", "productionunits", "llm_summary", "municipality", "capital", "purpose", "email", "phone"]) {
      expect(tekst, forbudt).not.toContain(forbudt);
    }
  });

  it("tomme og manglende felter bliver undefined — samme «|| undefined»-regler som før", () => {
    const r = tolkDataCvrSvar(200, { name: "", startdate: null, industrycode: 0, industrydesc: undefined, address: "", zipcode: null });
    expect(r).toEqual({
      udfald: "fundet",
      svar: { name: undefined, founded: undefined, industry_code: undefined, industry_label: undefined, address: undefined, zipcode: undefined, city: undefined },
    });
  });

  it("tal i adressefelterne bliver strenge (String()), som før", () => {
    const r = tolkDataCvrSvar(200, { name: "X", zipcode: 8600, industrycode: "620100" });
    expect(r).toEqual({
      udfald: "fundet",
      svar: { name: "X", founded: undefined, industry_code: "620100", industry_label: undefined, address: undefined, zipcode: "8600", city: undefined },
    });
  });

  it("200 uden et objekt → fejl med grund", () => {
    expect(tolkDataCvrSvar(200, null)).toEqual({ udfald: "fejl", grund: "HTTP 200 uden et objekt som svar" });
    expect(tolkDataCvrSvar(200, "tekst")).toEqual({ udfald: "fejl", grund: "HTTP 200 uden et objekt som svar" });
    expect(tolkDataCvrSvar(200, [FUNDET])).toEqual({ udfald: "fejl", grund: "HTTP 200 uden et objekt som svar" });
  });

  it("200 med et error-felt → fejl med grunden (aldrig fundet)", () => {
    expect(tolkDataCvrSvar(200, { error: "QUOTA_EXCEEDED" })).toEqual({ udfald: "fejl", grund: "HTTP 200 med error=QUOTA_EXCEEDED" });
    expect(tolkDataCvrSvar(200, { ...FUNDET, error: "INVALID_UA" })).toEqual({ udfald: "fejl", grund: "HTTP 200 med error=INVALID_UA" });
  });
});

describe("tolkDataCvrSvar — de andre statusser", () => {
  it("404 med den målte NOT_FOUND-body → findes_ikke (fund 13: nu kan det skelnes)", () => {
    expect(tolkDataCvrSvar(404, NOT_FOUND)).toEqual({ udfald: "findes_ikke" });
  });

  it("404 uden NOT_FOUND → fejl", () => {
    expect(tolkDataCvrSvar(404, null)).toEqual({ udfald: "fejl", grund: "HTTP 404" });
    expect(tolkDataCvrSvar(404, { error: "ROUTE_NOT_FOUND" })).toEqual({ udfald: "fejl", grund: "HTTP 404: ROUTE_NOT_FOUND" });
    expect(tolkDataCvrSvar(404, { message: "ukendt" })).toEqual({ udfald: "fejl", grund: "HTTP 404" });
  });

  it("429 → graense (rate limit ifølge DataCVR's dokumentation — ikke målt)", () => {
    expect(tolkDataCvrSvar(429, null)).toEqual({ udfald: "graense" });
    expect(tolkDataCvrSvar(429, { error: "RATE_LIMIT" })).toEqual({ udfald: "graense" });
  });

  it("401 og 403 → fejl «nøglen blev afvist (HTTP …)»", () => {
    expect(tolkDataCvrSvar(401, null)).toEqual({ udfald: "fejl", grund: "nøglen blev afvist (HTTP 401)" });
    expect(tolkDataCvrSvar(403, { error: "FORBIDDEN" })).toEqual({ udfald: "fejl", grund: "nøglen blev afvist (HTTP 403)" });
  });

  it("alt andet → fejl «HTTP <status>», med body.error når den findes", () => {
    expect(tolkDataCvrSvar(500, null)).toEqual({ udfald: "fejl", grund: "HTTP 500" });
    expect(tolkDataCvrSvar(502, { error: "BAD_GATEWAY" })).toEqual({ udfald: "fejl", grund: "HTTP 502: BAD_GATEWAY" });
    expect(tolkDataCvrSvar(0, null)).toEqual({ udfald: "fejl", grund: "HTTP 0" });
  });

  it("ingen grund bærer noget fra request-headerne — grundene er status og body.error", () => {
    for (const [status, body] of [[401, null], [500, { error: "X" }], [404, null], [200, { error: "Y" }]] as [number, unknown][]) {
      const r = tolkDataCvrSvar(status, body);
      if (r.udfald !== "fejl") throw new Error("forventede fejl");
      expect(r.grund).not.toMatch(/Bearer|Authorization|DATACVR_API_KEY/);
    }
  });
});

describe("dataCvrUrl — URL'en", () => {
  it("basen er DataCVR's v2-endpoint for et dansk CVR", () => {
    expect(DATACVR_BASE_URL).toBe("https://datacvrapi.dk/api/v2/dk/company");
  });
  it("bygger URL'en af CVR-nummeret, trimmet og URL-kodet", () => {
    expect(dataCvrUrl("46415124")).toBe("https://datacvrapi.dk/api/v2/dk/company/46415124");
    expect(dataCvrUrl(" 46415124 ")).toBe("https://datacvrapi.dk/api/v2/dk/company/46415124");
    expect(dataCvrUrl("46 41")).toBe("https://datacvrapi.dk/api/v2/dk/company/46%2041");
  });
});
