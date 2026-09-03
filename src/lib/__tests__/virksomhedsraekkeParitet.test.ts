import { describe, it, expect } from "vitest";
import {
  byggVirksomhedsRaekke,
  parseCvrStiftelsesdato,
  type CvrSvar,
  type VirksomhedsInput,
} from "@/lib/virksomhedsraekke";
// Parity import — the Deno copy is intentionally a verbatim mirror of the
// frontend copy. We import it here so vitest fails loudly if the two drift.
import {
  byggVirksomhedsRaekke as byggVirksomhedsRaekkeDeno,
  parseCvrStiftelsesdato as parseCvrStiftelsesdatoDeno,
} from "../../../supabase/functions/_shared/virksomhedsraekke.ts";

// Parity gate — the Deno copy at supabase/functions/_shared/virksomhedsraekke.ts
// is what import-application og monday-webhook actually insert with, via
// _shared/virksomhedsOprettelse.ts. The frontend copy is the one the unit
// tests lock. If this block fails, the two files have drifted and must be
// re-synced — otherwise the tests guard a row nobody inserts.

const NU = new Date("2026-09-02T10:00:00.000Z");

describe("parseCvrStiftelsesdato — parity between src/lib and supabase/functions/_shared", () => {
  const datoer: Array<string | null | undefined> = [
    "2019-03-15", // ISO
    "2019-03-15T00:00:00Z", // ISO med tidsdel
    "15/03 - 2019", // DD/MM - YYYY (cvrapi.dk)
    "15/03/2019", // DD/MM/YYYY
    "15-03-2019", // DD-MM-YYYY
    "15.03.2019", // DD.MM.YYYY
    "5/3/2019", // encifret
    "marts 2019", // ugyldig
    "2019", // ugyldig
    "", // tom
    "   ", // kun mellemrum
    null,
    undefined,
  ];

  for (const d of datoer) {
    it(`parity: ${JSON.stringify(d)}`, () => {
      expect(parseCvrStiftelsesdatoDeno(d)).toBe(parseCvrStiftelsesdato(d));
    });
  }

  it("de fem formater giver samme ISO-dato i begge kopier", () => {
    for (const d of ["2019-03-15", "15/03 - 2019", "15/03/2019", "15-03-2019", "15.03.2019"]) {
      expect(parseCvrStiftelsesdato(d)).toBe("2019-03-15");
      expect(parseCvrStiftelsesdatoDeno(d)).toBe("2019-03-15");
    }
  });
});

describe("byggVirksomhedsRaekke — parity between src/lib and supabase/functions/_shared", () => {
  const fuldtInput: VirksomhedsInput = {
    company_name: "Test fra ansøgning",
    cvr_number: "12345678",
    website: "https://test.dk",
    phone: "12345678",
    industry_label: "Detailhandel",
    start_date: "2020-01-01",
    current_situation: "Vi vokser",
    goals: "Mere overskud",
    help_needed: "Styr på tallene",
    annual_revenue: 2_500_000,
    revenue_interval: "2-5 mio.",
    contact_name: "Jonas Test",
    contact_email: "jonas@test.dk",
    application_date: "2026-08-25",
  };
  const cvr: CvrSvar = {
    name: "Testvirksomhed ApS",
    founded: "15/03 - 2019",
    industry_code: "620100",
    industry_label: "Computerprogrammering",
  };

  const parityCases: Array<[string, VirksomhedsInput, CvrSvar | null]> = [
    ["fuldt input + CVR-svar", fuldtInput, cvr],
    ["fuldt input, intet CVR-svar", fuldtInput, null],
    ["kun navn, CVR-svar bærer alt", { company_name: "Kun navn" }, cvr],
    ["kun navn, intet CVR-svar", { company_name: "Kun navn" }, null],
    ["tom branche og dato → CVR fylder ud", { ...fuldtInput, industry_label: null, start_date: null }, cvr],
    ["uparselig CVR-dato", { ...fuldtInput, start_date: null }, { ...cvr, founded: "marts 2019" }],
    ["tomme strenge og nul", { ...fuldtInput, cvr_number: "", website: "", annual_revenue: 0, contact_email: "" }, cvr],
    // Branchemotoren (trin 4): registerkode der rammer, der ikke rammer, uden tekst, og med tabt nul.
    ["registerkode der rammer (471110)", { company_name: "Kun navn" }, { ...cvr, industry_code: "471110", industry_label: "Kioskvarer" }],
    ["registerkode der ikke rammer (551000 hotel)", { company_name: "Kun navn" }, { ...cvr, industry_code: "551000", industry_label: "Hoteller" }],
    ["registerkode uden CVR-tekst → motorens label", { company_name: "Kun navn" }, { name: "Kun kode ApS", industry_code: "620100" }],
    ["registerkode med tabt foranstillet nul (11100)", { company_name: "Kun navn" }, { ...cvr, industry_code: "11100" }],
  ];

  for (const [navn, input, svar] of parityCases) {
    it(`parity: ${navn}`, () => {
      const fe = byggVirksomhedsRaekke(input, svar, NU);
      const deno = byggVirksomhedsRaekkeDeno(input, svar, NU);
      expect(deno).toEqual(fe);
    });
  }

  it("begge kopier oversætter registerkoden — og ingen af dem lægger den selv i feltet", () => {
    for (const raekke of [byggVirksomhedsRaekke(fuldtInput, cvr, NU), byggVirksomhedsRaekkeDeno(fuldtInput, cvr, NU)]) {
      expect(raekke.industry_code).toBe("tech_software");
      expect(raekke.industry_label).toBe("Detailhandel"); // input-labelen overskrives ikke
    }
  });

  it("feltlisten er identisk i de to kopier — også inde i application_context", () => {
    const fe = byggVirksomhedsRaekke(fuldtInput, cvr, NU);
    const deno = byggVirksomhedsRaekkeDeno(fuldtInput, cvr, NU);
    expect(Object.keys(deno).sort()).toEqual(Object.keys(fe).sort());
    expect(Object.keys(deno.application_context as object).sort()).toEqual(
      Object.keys(fe.application_context as object).sort(),
    );
  });

  it("ingen af kopierne bærer kontraktdatoer — tre steder læser contract_end_date som «har betalt»", () => {
    for (const raekke of [byggVirksomhedsRaekke(fuldtInput, cvr, NU), byggVirksomhedsRaekkeDeno(fuldtInput, cvr, NU)]) {
      expect("contract_start_date" in raekke).toBe(false);
      expect("contract_end_date" in raekke).toBe(false);
    }
  });
});
