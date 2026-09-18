import { describe, expect, it } from "vitest";
import { erAktiv, tolkCvrTilAnsoeger } from "../../../../supabase/functions/_shared/cvrAnsoeger.ts";
import { tolkDataCvrSvar } from "../../../../supabase/functions/_shared/cvrOpslag.ts";

// DataCVR's eksempelsvar fra dokumentationen (18/9), med ejere og
// personfelter der ALDRIG må komme med i visningen.
const BODY = {
  vat: 12345678,
  name: "Nordic Byg ApS",
  address: "Vestergade 41",
  zipcode: "8600",
  city: "Silkeborg",
  startdate: "2019-05-01",
  employees: "10-19",
  industrycode: 412000,
  industrydesc: "Opførelse af bygninger",
  companycode: 80,
  companydesc: "Anpartsselskab",
  companystatus: "Aktiv",
  website: "www.nordicbyg.dk",
  owners: [{ name: "Test Ejer", role: "Direktør" }],
  phone: "12345678",
  email: "kontakt@nordicbyg.dk",
};

describe("tolkCvrTilAnsoeger — de fire felter formularen viser, intet personligt", () => {
  it("navn, år, ansatte-interval, selskabsform, branche, status og normaliseret hjemmeside", () => {
    expect(tolkCvrTilAnsoeger(BODY)).toEqual({
      navn: "Nordic Byg ApS",
      stiftet_aar: 2019,
      antal_ansatte: "10-19",
      selskabsform: "Anpartsselskab",
      branche: "Opførelse af bygninger",
      status: "Aktiv",
      hjemmeside: "https://nordicbyg.dk",
    });
  });

  it("ejere, telefon, mail og adresse kommer aldrig med", () => {
    const tekst = JSON.stringify(tolkCvrTilAnsoeger(BODY));
    for (const forbudt of ["Test Ejer", "owners", "12345678", "kontakt@", "Vestergade", "8600"]) expect(tekst, forbudt).not.toContain(forbudt);
  });

  it("uden navn, eller uden objekt → null; tomme felter → null", () => {
    expect(tolkCvrTilAnsoeger({ ...BODY, name: "" })).toBeNull();
    expect(tolkCvrTilAnsoeger(null)).toBeNull();
    expect(tolkCvrTilAnsoeger([BODY])).toBeNull();
    expect(tolkCvrTilAnsoeger({ name: "X", employees: "", website: "ikke-en-adresse" })).toEqual({
      navn: "X",
      stiftet_aar: null,
      antal_ansatte: null,
      selskabsform: null,
      branche: null,
      status: null,
      hjemmeside: null,
    });
  });

  it("employees som tal tåles (bliver tekst) — DataCVR dokumenterer interval, men vi gætter ikke", () => {
    expect(tolkCvrTilAnsoeger({ name: "X", employees: 14 })?.antal_ansatte).toBe("14");
  });

  it("erAktiv: «Aktiv» eller intet er aktivt; alt andet ikke", () => {
    const v = tolkCvrTilAnsoeger(BODY)!;
    expect(erAktiv(v)).toBe(true);
    expect(erAktiv({ ...v, status: null })).toBe(true);
    expect(erAktiv({ ...v, status: "Ophørt" })).toBe(false);
  });

  it("samme rå body gennem tolkDataCvrSvar giver stadig præcis de syv felter — de to læsere blander ikke", () => {
    const r = tolkDataCvrSvar(200, BODY);
    if (r.udfald !== "fundet") throw new Error("forventede fundet");
    expect(Object.keys(r.svar).sort()).toEqual(["address", "city", "founded", "industry_code", "industry_label", "name", "zipcode"]);
  });
});
