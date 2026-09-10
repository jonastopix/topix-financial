import { describe, expect, it } from "vitest";
import { bygFactsCsv, csvFilnavn, csvOverskrifter, csvRaekker, csvTal, csvTekst, maanedOrd } from "@/lib/factsCsv";
import { KPI_DEFS } from "@/lib/kpiDefs";
import type { CompanyFact } from "@/hooks/useCompanyFacts";

const fact = (key: string, metrics: Record<string, number>, basis: "measured" | "estimated" = "measured"): CompanyFact => ({
  id: `f-${key}`, period_key: key, period_label: key, source_report_id: `r-${key}`,
  source_type: basis === "measured" ? "canonical" : "annual_report", data_basis: basis, metrics, committed_at: "2026-09-01T00:00:00Z",
});

const linjer = (csv: string) => csv.replace(/^\uFEFF/, "").split("\r\n").filter(Boolean).map((l) => l.split(";"));

describe("bygFactsCsv — én række pr. måned, kolonner som månedstabellen", () => {
  it("overskrifter: de tre faste + én pr. KPI, procent mærket", () => {
    const h = csvOverskrifter();
    expect(h.slice(0, 3)).toEqual(["Periode", "Måned", "Grundlag"]);
    expect(h).toHaveLength(3 + KPI_DEFS.length);
    expect(h).toContain("Omsætning (kr.)");
    expect(h).toContain("DB Margin (%)");
  });
  it("en målt måned: tallene som på skærmen, decimalkomma, ingen tusindtal", () => {
    const csv = bygFactsCsv([fact("2026-07", { revenue: 125000.5, gross_profit: 50000, payroll: 30000, ebt: 12500 })]);
    const [h, r] = linjer(csv);
    expect(r[0]).toBe("2026-07");
    expect(r[1]).toBe("Juli 2026");
    expect(r[2]).toBe("Målt");
    expect(r[h.indexOf("Omsætning (kr.)")]).toBe("125000,5");
    expect(r[h.indexOf("DB Margin (%)")]).toBe("40");
    expect(r[h.indexOf("Lønninger (kr.)")]).toBe("30000");
    expect(r[h.indexOf("Resultat (kr.)")]).toBe("12500");
    expect(r[h.indexOf("Resultat Margin (%)")]).toBe("10");
  });
  it("ESTIMATER MARKERES i egen kolonne (#786/#787)", () => {
    const csv = bygFactsCsv([fact("2025-12", { revenue: 10000, gross_profit: 4000, payroll: 2000, ebt: 1000 }, "estimated")]);
    const [, r] = linjer(csv);
    expect(r[2]).toBe("Estimat");
  });
  it("ET MANGLENDE TAL ER TOMT, ikke 0 — også Omk. total i en estimeret række med ulæste omkostninger", () => {
    const h = csvOverskrifter();
    // csvRaekker sorterer stigende: 2025-06 (estimat) står før 2026-01 (målt).
    const [estimat, maalt] = csvRaekker([
      fact("2026-01", { revenue: 100 }),                      // ingen lønninger, intet resultat
      fact("2025-06", { revenue: 100, gross_profit: 40 }, "estimated"), // ingen omkostningsfelter læst
    ]);
    expect(estimat[h.indexOf("Lønninger (kr.)")]).toBe("");
    expect(estimat[h.indexOf("Resultat (kr.)")]).toBe("");
    expect(estimat[h.indexOf("Omk. total (kr.)")]).toBe("");
    expect(maalt[h.indexOf("Lønninger (kr.)")]).toBe("");
    expect(maalt[h.indexOf("DB Margin (%)")]).toBe("");
    expect(csvTal(null)).toBe("");
    expect(csvTal(Number.NaN)).toBe("");
  });
  it("sorteret stigende på periode uanset input-rækkefølge", () => {
    const r = csvRaekker([fact("2026-03", { revenue: 3 }), fact("2026-01", { revenue: 1 }), fact("2026-02", { revenue: 2 })]);
    expect(r.map((x) => x[0])).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
  it("filen: BOM, CRLF, semikolon; tom liste = kun overskrifter", () => {
    const csv = bygFactsCsv([]);
    expect(csv.startsWith("\uFEFFPeriode;Måned;Grundlag;")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(linjer(csv)).toHaveLength(1);
  });
});

describe("cellerne", () => {
  it("tal: højst to decimaler, decimalkomma", () => {
    expect(csvTal(1234567.891)).toBe("1234567,89");
    expect(csvTal(-0.5)).toBe("-0,5");
    expect(csvTal(0)).toBe("0");
  });
  it("tekst citeres kun når den bærer skilletegn, anførselstegn eller linjeskift", () => {
    expect(csvTekst("Juli 2026")).toBe("Juli 2026");
    expect(csvTekst("a;b")).toBe('"a;b"');
    expect(csvTekst('sig "hej"')).toBe('"sig ""hej"""');
  });
  it("måneden i ord, hele navnet", () => {
    expect(maanedOrd("2026-01")).toBe("Januar 2026");
    expect(maanedOrd("2026-13")).toBe("2026-13");
  });
  it("filnavn med dato og dansk slug", () => {
    expect(csvFilnavn("Floren Engros ApS", new Date("2026-09-10T12:00:00Z"))).toBe("floren-engros-aps-tal-2026-09-10.csv");
    expect(csvFilnavn("Øl & Ål", new Date("2026-09-10T12:00:00Z"))).toBe("oel-aal-tal-2026-09-10.csv");
    expect(csvFilnavn("   ", new Date("2026-09-10T12:00:00Z"))).toBe("virksomhed-tal-2026-09-10.csv");
  });
});
