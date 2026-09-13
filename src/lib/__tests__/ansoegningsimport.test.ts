/**
 * Ansøgningsimportens motor (13/9, trin 1 af 2): parseren og valideringen
 * trukket ud af Members.tsx:36-146 og :580-621. Testen låser den adfærd
 * fladen havde — kolonnesøgning, omsætnings- og datotolkning, fejltekster i
 * rækkefølge — og body'ens feltnavne mod import-application.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  byggImportBody,
  FEJL_INGEN_DATA,
  FEJL_INGEN_HEADER,
  findHeaderRaekke,
  HEADER_MARKOERER,
  HEADER_MIN_UDFYLDTE,
  HEADER_SOEGEVINDUE,
  KOLONNER,
  parseAnsoegning,
  TOMME_FELTER,
  tolkExcelDato,
  tolkOmsaetning,
  validerAnsoegning,
  type AnsoegningsFelter,
  type Arkdata,
} from "@/lib/ansoegningsimport";

/* Monday-eksporten som xlsx' sheet_to_json({ header: 1, defval: null })
   leverer den: et par pynterækker, så headerrækken, så ansøgningen. */
const HEADER = [
  "Name", "Email", "CVR", "Kontaktperson", "Telefon", "Hjemmeside",
  "Branche", "Årlig omsætning", "Omsætning (interval)",
  "Nuværende situation", "Mål med virksomhed", "Beskriv hvilken hjælp I har brug for",
  "Startdato", "End date",
];
const RAEKKE = [
  "Two Socks ApS", "kontakt@twosocks.dk", "12 34 56 78", "Mette Hansen", "+45 12345678", "twosocks.dk",
  "Detailhandel", "1.500.000", "1.000.000 - 2.000.000",
  "Vi vokser hurtigere end vi kan følge med.", "Dobbelt omsætning på to år", "Styr på likviditeten",
  46023, 46388, // Excel-serienumre: 2026-01-01 og 2027-01-01 — datocellerne kommer som tal fra xlsx
];
const ARK: Arkdata = [
  ["Ansøgninger", null, null, null, null, null, null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  HEADER,
  RAEKKE,
];

const FELTER_OK: AnsoegningsFelter = {
  ...TOMME_FELTER,
  email: "kontakt@twosocks.dk",
  company_name: "Two Socks ApS",
  cvr_number: "12345678",
  contract_start_date: "2026-01-15",
  contract_end_date: "2027-01-15",
};
const NU = new Date("2026-09-13T12:00:00Z");

describe("parseAnsoegning — en velformet ansøgningsrække", () => {
  it("læser alle fjorten felter ud af rækken under headeren", () => {
    const { felter, advarsler } = parseAnsoegning(ARK);
    expect(felter).toEqual({
      email: "kontakt@twosocks.dk",
      company_name: "Two Socks ApS",
      cvr_number: "12345678",
      contact_name: "Mette Hansen",
      annual_revenue: "1500000",
      revenue_interval: "1.000.000 - 2.000.000",
      industry_label: "Detailhandel",
      current_situation: "Vi vokser hurtigere end vi kan følge med.",
      goals: "Dobbelt omsætning på to år",
      help_needed: "Styr på likviditeten",
      website: "twosocks.dk",
      phone: "+45 12345678",
      contract_start_date: "2026-01-01",
      contract_end_date: "2027-01-01",
    });
    expect(advarsler).toEqual([]);
  });

  it("CVR: mellemrum fjernes (Members.tsx:124)", () => {
    expect(parseAnsoegning([HEADER, [...RAEKKE.slice(0, 2), " 1234 5678 ", ...RAEKKE.slice(3)]]).felter.cvr_number).toBe("12345678");
  });

  it("celler trimmes; null bliver \"\" — aldrig strengen 'null'", () => {
    const raekke = [...RAEKKE];
    raekke[3] = "  Mette  ";
    raekke[4] = null;
    const { felter } = parseAnsoegning([HEADER, raekke]);
    expect(felter.contact_name).toBe("Mette");
    expect(felter.phone).toBe("");
  });

  it("felterne har præcis importForm's fjorten nøgler — så spredning ind i state'en er 1:1", () => {
    expect(Object.keys(parseAnsoegning(ARK).felter).sort()).toEqual(Object.keys(TOMME_FELTER).sort());
    expect(Object.keys(TOMME_FELTER)).toHaveLength(14);
  });
});

describe("headerrækken (Members.tsx:54-66)", () => {
  it("søges i de første 15 rækker, kræver mere end 5 udfyldte celler og præcis «Name» eller «Email»", () => {
    expect(HEADER_SOEGEVINDUE).toBe(15);
    expect(HEADER_MIN_UDFYLDTE).toBe(5);
    expect(HEADER_MARKOERER).toEqual(["Name", "Email"]);
    expect(findHeaderRaekke(ARK)).toBe(2);
  });

  it("uden headerrække: kaster «Kunne ikke finde kolonneoverskrifter»", () => {
    const udenHeader: Arkdata = [["Ansøgninger", null, null, null, null, null, null], RAEKKE];
    expect(() => parseAnsoegning(udenHeader)).toThrow(FEJL_INGEN_HEADER);
    expect(FEJL_INGEN_HEADER).toBe("Kunne ikke finde kolonneoverskrifter");
  });

  it("en række med «Name» men kun fem udfyldte celler er ikke headeren", () => {
    expect(findHeaderRaekke([["Name", "Email", "CVR", "Telefon", "Branche", null, null]])).toBe(-1);
    expect(findHeaderRaekke([["Name", "Email", "CVR", "Telefon", "Branche", "Startdato", null]])).toBe(0);
  });

  it("markøren er cellens præcise værdi — «name» eller «Company Name» alene finder ikke headeren", () => {
    expect(findHeaderRaekke([["name", "E-mail", "CVR", "Telefon", "Branche", "Startdato"]])).toBe(-1);
    expect(findHeaderRaekke([["Company Name", "E-mail", "CVR", "Telefon", "Branche", "Startdato"]])).toBe(-1);
  });

  it("headeren i række 16 eller senere findes ikke", () => {
    const pynt = Array.from({ length: 15 }, () => [null, null, null, null, null, null, null]);
    expect(findHeaderRaekke([...pynt, HEADER, RAEKKE])).toBe(-1);
    expect(findHeaderRaekke([...pynt.slice(1), HEADER, RAEKKE])).toBe(14);
  });

  it("header uden række under: kaster «Ingen data fundet»", () => {
    expect(() => parseAnsoegning([HEADER])).toThrow(FEJL_INGEN_DATA);
    expect(FEJL_INGEN_DATA).toBe("Ingen data fundet");
  });
});

describe("kolonnenavnene — case-uafhængig delstreng, første match vinder (Members.tsx:66-70)", () => {
  // Varianten står FØRST, så den ikke skygges af markørcellerne «Name»/«Email»
  // (findIndex — første match vinder). Markørcellerne bærer andre værdier.
  const ark = (header: string, vaerdi: unknown): Arkdata => [
    [header, "Name", "Email", "x", "x", "x"],
    [vaerdi, "Markør-navn", "markoer@b.dk", null, null, null],
  ];

  it.each([
    ["email", "Email", "EMAIL address", "a@b.dk", "a@b.dk"],
    ["company_name", "Name", "Company NAME", "Firma", "Firma"],
    ["cvr_number", "CVR", "CVR-nummer", "87654321", "87654321"],
    ["contact_name", "Kontaktperson", "kontaktperson (navn)", "Ole", "Ole"],
    ["industry_label", "Branche", "BRANCHE", "IT", "IT"],
    ["current_situation", "Nuværende situation", "Beskriv jeres nuværende situation", "Vokser", "Vokser"],
    ["goals", "Mål med virksomhed", "Mål med virksomheden", "Vækst", "Vækst"],
    ["help_needed", "Beskriv hvilken hjælp", "Beskriv hvilken hjælp I har brug for", "Likviditet", "Likviditet"],
    ["website", "Hjemmeside", "Hjemmeside (URL)", "x.dk", "x.dk"],
    ["phone", "Telefon", "Telefonnummer", "12345678", "12345678"],
    ["contract_start_date", "Startdato", "Kontrakt startdato", 46054, "2026-02-01"],
    ["contract_end_date", "End date", "Contract end date", 46419, "2027-02-01"],
  ] as const)("%s ← «%s»: header «%s»", (felt, noegle, header, vaerdi, forventet) => {
    expect(KOLONNER[felt]).toBe(noegle);
    const { felter } = parseAnsoegning(ark(header, vaerdi));
    expect(felter[felt]).toBe(forventet);
  });

  it("første match vinder — «Name» rammer «Company Name» hvis den står før «Name»", () => {
    const { felter } = parseAnsoegning([
      ["Company Name", "Name", "Email", "x", "x", "x"],
      ["Holdingen", "Driften", "a@b.dk", null, null, null],
    ]);
    expect(felter.company_name).toBe("Holdingen");
  });

  it("omsætningen: «Årlig omsætning» først, ellers «Omsætning (interval)»", () => {
    expect(KOLONNER.aarlig_omsaetning).toBe("Årlig omsætning");
    expect(KOLONNER.omsaetning_interval).toBe("Omsætning (interval)");
    expect(parseAnsoegning(ark("Årlig omsætning (DKK)", "2.000.000")).felter.annual_revenue).toBe("2000000");
    expect(parseAnsoegning(ark("Omsætning (interval)", "0 - 500.000")).felter.annual_revenue).toBe("500000");
  });

  it("«Email» matcher IKKE «E-mail» — den nedarvede grænse, låst så den ikke skrider stille", () => {
    const { felter, advarsler } = parseAnsoegning([
      ["Name", "Email", "CVR", "Kontaktperson", "Telefon", "Hjemmeside", "Branche", "Årlig omsætning", "Omsætning (interval)", "Nuværende situation", "Mål med virksomhed", "Beskriv hvilken hjælp", "Startdato", "End date", "E-mail"],
      ["Firma", null, null, null, null, null, null, null, null, null, null, null, null, null, "a@b.dk"],
    ]);
    expect(felter.email).toBe("");
    expect(advarsler).toEqual([]);
  });

  it("en kolonne der mangler giver tom streng og en advarsel — ikke et kast", () => {
    const { felter, advarsler } = parseAnsoegning([
      ["Name", "Email", "CVR", "Telefon", "Branche", "Startdato"],
      ["Firma", "a@b.dk", "12345678", "1", "IT", "2026-01-01"],
    ]);
    expect(felter.contact_name).toBe("");
    expect(felter.contract_end_date).toBe("");
    expect(advarsler).toContain("Kolonnen «Kontaktperson» blev ikke fundet i arket.");
    expect(advarsler).toContain("Kolonnen «End date» blev ikke fundet i arket.");
  });
});

describe("tolkOmsaetning (Members.tsx:74-96)", () => {
  it.each([
    ["1.500.000", "1500000"],
    ["1 500 000", "1500000"],
    ["1500000", "1500000"],
    ["1,5", "2"],
    ["1.000.000+", "1000000"],
    ["500.000 - 1.000.000", "750000"],
    ["1.000.000-2.000.000", "1500000"],
    ["0 - 500.000", "500000"],
    ["", ""],
    ["Ved ikke", ""],
    ["0", ""],
    ["100.000.000", ""],
  ])("«%s» → «%s»", (raa, forventet) => {
    expect(tolkOmsaetning(raa)).toBe(forventet);
  });

  it("intervallet gemmes råt når det ikke er det samme som den præcise omsætning", () => {
    const med = parseAnsoegning(ARK).felter;
    expect(med.revenue_interval).toBe("1.000.000 - 2.000.000");
    const ens = [...RAEKKE];
    ens[7] = "1.500.000";
    ens[8] = "1.500.000";
    expect(parseAnsoegning([HEADER, ens]).felter.revenue_interval).toBe("");
  });

  it("en omsætning uden tal giver en advarsel", () => {
    const raekke = [...RAEKKE];
    raekke[7] = "Ved ikke";
    raekke[8] = null;
    expect(parseAnsoegning([HEADER, raekke]).advarsler).toContain("Omsætningen «Ved ikke» kunne ikke tolkes som et tal.");
  });
});

describe("tolkExcelDato — hver form der understøttes (Members.tsx:99-118)", () => {
  it("Excel-serienummer som tal: dage siden 1899-12-30 — det xlsx leverer for en datocelle", () => {
    expect(tolkExcelDato(44927)).toBe("2023-01-01");
    expect(tolkExcelDato(46388)).toBe("2027-01-01");
    expect(tolkExcelDato(45000.75)).toBe("2023-03-15");
  });
  it("Excel-serienummer som streng — det er den form parseren faktisk ser (cellen trimmes til tekst først)", () => {
    expect(tolkExcelDato("46388")).toBe("2027-01-01");
    expect(tolkExcelDato(" 46388 ")).toBe("2027-01-01");
  });
  it("tekst uden ledende tal går til new Date(): en engelsk datotekst med eksplicit tidszone", () => {
    expect(tolkExcelDato("Jan 15, 2026 12:00 GMT")).toBe("2026-01-15");
  });
  it("tom, «nan», null og utolkeligt → \"\"", () => {
    expect(tolkExcelDato("")).toBe("");
    expect(tolkExcelDato("nan")).toBe("");
    expect(tolkExcelDato(null)).toBe("");
    expect(tolkExcelDato(undefined)).toBe("");
    expect(tolkExcelDato("ukendt")).toBe("");
  });
  it("serievinduet er 1000 < n < 100000 — 1000 falder til teksttolkning og bliver et årstal", () => {
    expect(tolkExcelDato(1001)).toBe("1902-09-27");
    expect(tolkExcelDato(1000)).toBe("1000-01-01");
  });

  /* NEDARVET FEJL (fundet 13/9 ved udtrækket, IKKE rettet i trin 1 — «ingen
     adfærd ændres»): en ISO-datotekst parseFloat'es til årstallet (2026), som
     ligger i serievinduet, og bliver derfor tolket som Excel-serienummer 2026
     = 1905-07-18. Rammer kun når datocellen er TEKST; en ægte datocelle kommer
     som tal fra xlsx og tolkes rigtigt. Låst her så den ikke skrider stille —
     og så trin 2 kan rette den bevidst og se denne test vende. */
  it("NEDARVET FEJL: ISO-datotekst tolkes som serienummer — 2026-01-15 → 1905-07-18", () => {
    expect(tolkExcelDato("2026-01-15")).toBe("1905-07-18");
    expect(tolkExcelDato("2026-01-15T00:00:00.000Z")).toBe("1905-07-18");
  });
  it("danske formater tolkes IKKE (nedarvet grænse) — og parseren siger det som advarsel", () => {
    expect(tolkExcelDato("15-01-2026")).toBe("");
    expect(tolkExcelDato("15/01/2026")).toBe("");
    const raekke = [...RAEKKE];
    raekke[12] = "15-01-2026";
    const { felter, advarsler } = parseAnsoegning([HEADER, raekke]);
    expect(felter.contract_start_date).toBe("");
    expect(advarsler).toContain("Datoen «15-01-2026» i «Startdato» kunne ikke tolkes.");
  });
});

describe("validerAnsoegning — hvert afslag med Members.tsx' tekst (:581-621)", () => {
  it("en velformet ansøgning går igennem", () => {
    expect(validerAnsoegning(FELTER_OK, NU)).toEqual({ ok: true });
  });

  it("email eller virksomhedsnavn mangler", () => {
    for (const felter of [{ ...FELTER_OK, email: "" }, { ...FELTER_OK, company_name: "" }]) {
      const dom = validerAnsoegning(felter, NU);
      expect(dom.ok).toBe(false);
      if (dom.ok === false) expect(dom.fejl[0]).toEqual({ tekst: "Email og virksomhedsnavn er påkrævet" });
    }
  });

  it("CVR: præcis 8 cifre når det er udfyldt — tomt CVR er tilladt", () => {
    for (const cvr of ["1234567", "123456789", "1234567a", "12 34 56 78"]) {
      const dom = validerAnsoegning({ ...FELTER_OK, cvr_number: cvr }, NU);
      expect(dom.ok).toBe(false);
      if (dom.ok === false) expect(dom.fejl[0]).toEqual({ tekst: "CVR-nummer skal være præcis 8 cifre" });
    }
    expect(validerAnsoegning({ ...FELTER_OK, cvr_number: "" }, NU)).toEqual({ ok: true });
    expect(validerAnsoegning({ ...FELTER_OK, cvr_number: " 12345678 " }, NU)).toEqual({ ok: true });
  });

  it("kontraktslut er påkrævet", () => {
    const dom = validerAnsoegning({ ...FELTER_OK, contract_end_date: "" }, NU);
    expect(dom.ok).toBe(false);
    if (dom.ok === false) expect(dom.fejl[0]).toEqual({ tekst: "Kontraktslut er påkrævet" });
  });

  it("kontraktslut skal være efter kontraktstart — samme dag er også et afslag", () => {
    for (const slut of ["2026-01-15", "2026-01-14"]) {
      const dom = validerAnsoegning({ ...FELTER_OK, contract_end_date: slut }, NU);
      expect(dom.ok).toBe(false);
      if (dom.ok === false) expect(dom.fejl[0]).toEqual({ tekst: "Kontraktslut skal være efter kontraktstart" });
    }
  });

  it("kontraktslut udenfor 2020 … i dag + 5 år", () => {
    const forTidlig = validerAnsoegning({ ...FELTER_OK, contract_start_date: "", contract_end_date: "2019-12-31" }, NU);
    expect(forTidlig).toEqual({
      ok: false,
      fejl: [{ tekst: "Kontraktslut ser forkert ud", detalje: "Datoen 2019-12-31 er udenfor forventet interval (2020–2031)" }],
    });
    const forSen = validerAnsoegning({ ...FELTER_OK, contract_end_date: "2031-09-14" }, NU);
    expect(forSen).toEqual({
      ok: false,
      fejl: [{ tekst: "Kontraktslut ser forkert ud", detalje: "Datoen 2031-09-14 er udenfor forventet interval (2020–2031)" }],
    });
    expect(validerAnsoegning({ ...FELTER_OK, contract_end_date: "2031-09-13" }, NU)).toEqual({ ok: true });
  });

  it("kontraktstart udenfor 2020 … i dag + 2 år", () => {
    const forTidlig = validerAnsoegning({ ...FELTER_OK, contract_start_date: "2019-06-01" }, NU);
    expect(forTidlig).toEqual({
      ok: false,
      fejl: [{ tekst: "Kontraktstart ser forkert ud", detalje: "Datoen 2019-06-01 er udenfor forventet interval (2020–2028)" }],
    });
    const forSen = validerAnsoegning({ ...FELTER_OK, contract_start_date: "2028-09-14", contract_end_date: "2029-01-01" }, NU);
    expect(forSen).toEqual({
      ok: false,
      fejl: [{ tekst: "Kontraktstart ser forkert ud", detalje: "Datoen 2028-09-14 er udenfor forventet interval (2020–2028)" }],
    });
    expect(validerAnsoegning({ ...FELTER_OK, contract_start_date: "2028-09-13", contract_end_date: "2029-01-01" }, NU)).toEqual({ ok: true });
  });

  it("rækkefølgen er handleImports — det første afslag er det fladen viste", () => {
    const dom = validerAnsoegning({ ...TOMME_FELTER, cvr_number: "1" }, NU);
    expect(dom.ok).toBe(false);
    if (dom.ok === false) {
      expect(dom.fejl.map((f) => f.tekst)).toEqual([
        "Email og virksomhedsnavn er påkrævet",
        "CVR-nummer skal være præcis 8 cifre",
        "Kontraktslut er påkrævet",
      ]);
    }
  });

  it("de fire simple afslag har ingen detalje — de to datointervaller har (toast.error's description)", () => {
    const dom = validerAnsoegning({ ...TOMME_FELTER, cvr_number: "1", contract_start_date: "2019-01-01" }, NU);
    expect(dom.ok).toBe(false);
    if (dom.ok === false) {
      const udenDetalje = dom.fejl.filter((f) => f.detalje === undefined).map((f) => f.tekst);
      expect(udenDetalje).toEqual(["Email og virksomhedsnavn er påkrævet", "CVR-nummer skal være præcis 8 cifre", "Kontraktslut er påkrævet"]);
      expect(dom.fejl.find((f) => f.tekst === "Kontraktstart ser forkert ud")?.detalje).toMatch(/^Datoen 2019-01-01 er udenfor/);
    }
  });
});

describe("byggImportBody — det der sendes til import-application (Members.tsx:626-632)", () => {
  it("omsætning bliver tal, tomme valgfrie felter bliver undefined, resten sendes som de er", () => {
    const body = byggImportBody({ ...FELTER_OK, annual_revenue: "1500000", revenue_interval: "", contract_start_date: "" });
    expect(body.annual_revenue).toBe(1500000);
    expect(body.revenue_interval).toBeUndefined();
    expect(body.contract_start_date).toBeUndefined();
    expect(body.contract_end_date).toBe("2027-01-15");
    expect(body.email).toBe("kontakt@twosocks.dk");
    expect(body.contact_name).toBe("");
  });

  it("tom omsætning → undefined, ikke 0", () => {
    expect(byggImportBody(FELTER_OK).annual_revenue).toBeUndefined();
  });

  it("body'en har præcis felternes fjorten nøgler — intet ekstra, intet tabt", () => {
    expect(Object.keys(byggImportBody(FELTER_OK)).sort()).toEqual(Object.keys(TOMME_FELTER).sort());
  });
});

/* KILDEVÆRN: body'ens nøgler skal findes i ApplicationPayload i edge-functionen.
   Omdøbes et felt i den ene ende, bliver det stille tabt i den anden — ingen
   anden test ville se det. */
describe("kildeværn: byggImportBody's nøgler står i import-application's ApplicationPayload", () => {
  const kilde = readFileSync(resolve(process.cwd(), "supabase/functions/import-application/index.ts"), "utf8");
  const payload = kilde.split("interface ApplicationPayload {")[1]?.split("\n}")[0] ?? "";
  const noegler = Object.keys(byggImportBody(FELTER_OK));

  it("ApplicationPayload findes i funktionen", () => {
    expect(payload.length).toBeGreaterThan(0);
  });

  it.each(noegler)("«%s» er et felt i ApplicationPayload", (noegle) => {
    expect(payload).toMatch(new RegExp(`^\\s+${noegle}\\??:`, "m"));
  });

  it("de to påkrævede felter er de samme i begge ender", () => {
    expect(payload).toMatch(/^\s+email: string;/m);
    expect(payload).toMatch(/^\s+company_name: string;/m);
    expect(kilde).toContain("if (!body.email || !body.company_name)");
  });

  it("kontraktdatoerne læses af funktionen — det er dét importen bærer, som Monday-vejen ikke gør", () => {
    expect(kilde).toContain("body.contract_start_date");
    expect(kilde).toContain("body.contract_end_date");
  });
});
