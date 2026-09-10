/**
 * Dommen om hvad der kan genkøres fra storage (10/9-2026) — læser Deno-siden
 * direkte, som fortegnsdommen.test.ts: _shared/genkoersel.ts er ren.
 */
import { describe, expect, it } from "vitest";
import {
  afgoerGenkoersel,
  base64AfBytes,
  csvTekstAfBytes,
  erStrandet,
  filtypeAfNavn,
  GENKOERSEL_TEKST,
  regnearkTekst,
  TEKST_LOFT,
  type GenkoerselRaekke,
} from "../../../supabase/functions/_shared/genkoersel.ts";

const strandet = (over: Partial<GenkoerselRaekke> = {}): GenkoerselRaekke => ({
  id: "11111111-1111-4111-8111-111111111111",
  file_name: "Saldobalance.csv",
  file_path: "c/11111111-1111-4111-8111-111111111111/Saldobalance.csv",
  status: "processed",
  validation_status: "FAIL",
  deleted_at: null,
  manual_override_status: null,
  needs_manual_entry: true,
  har_facts: false,
  ...over,
});

describe("afgoerGenkoersel — hvad kan genkøres", () => {
  it("CSV: ja (de tre Dinero-saldobalancer, #783)", () => {
    const d = afgoerGenkoersel(strandet());
    expect(d).toMatchObject({ kan: true, grund: "ok", filtype: "csv" });
    expect(d.report_id).toBe("11111111-1111-4111-8111-111111111111");
  });
  it("XLSX og XLS: ja (ANLA GLAS' tre, #784) — også med status error", () => {
    expect(afgoerGenkoersel(strandet({ file_name: "ANLA juni.XLSX", status: "error", validation_status: null, needs_manual_entry: false }))).toMatchObject({ kan: true, filtype: "xlsx" });
    expect(afgoerGenkoersel(strandet({ file_name: "gammel.xls" }))).toMatchObject({ kan: true, filtype: "xlsx" });
  });
  it("PDF: nej — pdfjs findes kun i browseren, og det siges med ord", () => {
    const d = afgoerGenkoersel(strandet({ file_name: "2026-05+06 Almindelig.pdf" }));
    expect(d).toMatchObject({ kan: false, grund: "pdf_kraever_browser", filtype: "pdf" });
    expect(d.tekst).toContain("browseren");
    expect(d.tekst).toContain("Upload filen igen");
  });
  it("allerede med facts: nej — uanset filtype, og før PDF-grunden", () => {
    expect(afgoerGenkoersel(strandet({ har_facts: true }))).toMatchObject({ kan: false, grund: "har_facts" });
    expect(afgoerGenkoersel(strandet({ har_facts: true, file_name: "x.pdf" })).grund).toBe("har_facts");
  });
  it("slettet, manuelt anvendt, under behandling, uden fil, ukendt filtype: nej med hver sin grund", () => {
    expect(afgoerGenkoersel(strandet({ deleted_at: "2026-09-01T00:00:00Z" })).grund).toBe("slettet");
    expect(afgoerGenkoersel(strandet({ manual_override_status: "applied" })).grund).toBe("manuel_anvendt");
    expect(afgoerGenkoersel(strandet({ status: "processing", validation_status: null, needs_manual_entry: false })).grund).toBe("behandles");
    expect(afgoerGenkoersel(strandet({ file_path: null })).grund).toBe("ingen_fil");
    expect(afgoerGenkoersel(strandet({ file_name: "tal.numbers" })).grund).toBe("ukendt_filtype");
    expect(afgoerGenkoersel(strandet({ file_name: null })).grund).toBe("ukendt_filtype");
  });
  it("en rapport der er læst og i orden genkøres ikke — den ville blive overskrevet uden grund", () => {
    const d = afgoerGenkoersel(strandet({ status: "processed", validation_status: "PASS", needs_manual_entry: false }));
    expect(d).toMatchObject({ kan: false, grund: "ikke_strandet" });
  });
  it("hver grund har en tekst i ord — ingen koder med understreg", () => {
    for (const tekst of Object.values(GENKOERSEL_TEKST)) {
      expect(tekst.length).toBeGreaterThan(10);
      expect(tekst).not.toMatch(/_/);
    }
  });
});

describe("erStrandet og filtypeAfNavn — samme regler som målingen og som extract-financial-data", () => {
  it("strandet = error, eller processed med FAIL / manuel indtastning", () => {
    expect(erStrandet({ status: "error", validation_status: null, needs_manual_entry: false })).toBe(true);
    expect(erStrandet({ status: "processed", validation_status: "FAIL", needs_manual_entry: false })).toBe(true);
    expect(erStrandet({ status: "processed", validation_status: "PASS", needs_manual_entry: true })).toBe(true);
    expect(erStrandet({ status: "processed", validation_status: "PASS", needs_manual_entry: false })).toBe(false);
    expect(erStrandet({ status: "processing", validation_status: null, needs_manual_entry: false })).toBe(false);
  });
  it("filtypen afgøres på endelsen alene, uanset store bogstaver", () => {
    expect(filtypeAfNavn("Resultat.CSV")).toBe("csv");
    expect(filtypeAfNavn("a.xlsx")).toBe("xlsx");
    expect(filtypeAfNavn("a.xls")).toBe("xlsx");
    expect(filtypeAfNavn("a.pdf")).toBe("pdf");
    expect(filtypeAfNavn("a.csv.zip")).toBe("ukendt");
    expect(filtypeAfNavn(undefined)).toBe("ukendt");
  });
});

describe("payloaden — præcis som browseren laver den", () => {
  it("CSV: UTF-8, BOM strippes som file.text() gør, loft på 30.000 tegn", () => {
    const medBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Konto;Kontonavn;Beløb\n1000;Salg;-1,00")]);
    expect(csvTekstAfBytes(medBom)).toBe("Konto;Kontonavn;Beløb\n1000;Salg;-1,00");
    const lang = new TextEncoder().encode("a".repeat(TEKST_LOFT + 500));
    expect(csvTekstAfBytes(lang).length).toBe(TEKST_LOFT);
  });
  it("XLSX-tekst: «=== Sheet: navn ===» pr. ark, to linjeskift imellem, samme loft", () => {
    const t = regnearkTekst([{ navn: "Ark1", csv: "a\tb\n1\t2" }, { navn: "Balance", csv: "x\ty" }]);
    expect(t).toBe("=== Sheet: Ark1 ===\na\tb\n1\t2\n\n=== Sheet: Balance ===\nx\ty");
    expect(regnearkTekst([{ navn: "S", csv: "z".repeat(TEKST_LOFT * 2) }]).length).toBe(TEKST_LOFT);
  });
  it("base64: samme resultat som btoa af den binære streng, også over bidgrænsen", () => {
    const smaa = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
    expect(base64AfBytes(smaa)).toBe(btoa(String.fromCharCode(...smaa)));
    const stor = new Uint8Array(0x8000 * 2 + 7).map((_, i) => i % 251);
    let binary = "";
    for (let i = 0; i < stor.length; i++) binary += String.fromCharCode(stor[i]);
    expect(base64AfBytes(stor)).toBe(btoa(binary));
  });
});
