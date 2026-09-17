import { describe, expect, it } from "vitest";
import {
  advarslerAf,
  afgoerGodkendelse,
  afgoerMasseGenkoersel,
  filtypeAf,
  gruppeAf,
  HOLD_LOFT,
  koerselsRaekkefoelge,
  MASSE_TEKST,
  opsummer,
  PAUSE_MS,
  periodeNoegleAf,
  skabelonAf,
  talTekst,
  type RapportTilMasse,
  type Resultat,
} from "@/lib/genkoerselBrowser";

/* «Genkør flere rapporter» i browseren (17/9-2026) — dommene. Fiktive rækker, ingen kundedata. */

const raekke = (o: Partial<RapportTilMasse> = {}): RapportTilMasse => ({
  id: "r1", company_id: "c1", virksomhed: "Syntetisk ApS", file_name: "resultat.pdf", file_path: "c1/r1/resultat.pdf",
  status: "processed", validation_status: "PASS", report_period: "Juni 2026", report_type: "resultatopgørelse",
  manual_override_status: null, manual_report_period_key: null, extraction_method: "deterministic_structural", deleted_at: null,
  template_id: "DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1", routing_template_id: null, metrics: { ebt: -49089.83, revenue: 439521.58 },
  quality_signals: null, facts_period_key: null, facts_ebt: null, periode_ejes_af: null, ...o,
});
const alle = { skabeloner: null, medManuelle: false };

describe("skabelon, gruppe, filtype, periodenøgle", () => {
  it("skabelonen læses som reconen: template_id → routing_trace → extraction_method", () => {
    expect(skabelonAf(raekke())).toBe("DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1");
    expect(skabelonAf(raekke({ template_id: null, routing_template_id: "DK_ECONOMIC_SALDOBALANCE_PDF_V1" }))).toBe("DK_ECONOMIC_SALDOBALANCE_PDF_V1");
    expect(skabelonAf(raekke({ template_id: null, extraction_method: "ai_extraction" }))).toBe("ai_extraction");
    expect(gruppeAf(raekke())).toBe("b");
    expect(gruppeAf(raekke({ template_id: "DK_ECONOMIC_SALDOBALANCE_XLSX_V1" }))).toBe("a");
    expect(gruppeAf(raekke({ template_id: "DK_DINERO_RESULTATOPGOERELSE_V1" }))).toBe("oevrige");
  });
  it("filtypen på navnet", () => {
    expect(filtypeAf("a.PDF")).toBe("pdf"); expect(filtypeAf("a.xls")).toBe("xlsx"); expect(filtypeAf("a.csv")).toBe("csv"); expect(filtypeAf(null)).toBe("ukendt");
  });
  it("periodenøglen: facts først, så manuel nøgle, så «Juni 2026» / «sept. 2025» / «2026-06»", () => {
    expect(periodeNoegleAf(raekke({ facts_period_key: "2026-05" }))).toBe("2026-05");
    expect(periodeNoegleAf(raekke({ manual_override_status: "applied", manual_report_period_key: "2026-04" }))).toBe("2026-04");
    expect(periodeNoegleAf(raekke({ report_period: "Juni 2026" }))).toBe("2026-06");
    expect(periodeNoegleAf(raekke({ report_period: "sept. 2025" }))).toBe("2025-09");
    expect(periodeNoegleAf(raekke({ report_period: "2026-06" }))).toBe("2026-06");
    expect(periodeNoegleAf(raekke({ report_period: "Q2 2026" }))).toBeNull();
  });
});

describe("afgoerMasseGenkoersel — rækkefølgen er bevidst", () => {
  it("PDF med samme rapport-id er OK (browser-vejen) — også når rapporten er godkendt og PASS", () => {
    const d = afgoerMasseGenkoersel(raekke({ facts_period_key: "2026-06", facts_ebt: -49089.83 }), alle);
    expect(d).toMatchObject({ kan: true, grund: "ok", gruppe: "b", filtype: "pdf" });
  });
  it("manuelt rettet springes over som standard — og tages med kun når Jonas har besluttet det", () => {
    expect(afgoerMasseGenkoersel(raekke({ manual_override_status: "applied" }), alle).grund).toBe("manuel_anvendt");
    expect(afgoerMasseGenkoersel(raekke({ manual_override_status: "applied" }), { ...alle, medManuelle: true }).grund).toBe("ok");
    expect(MASSE_TEKST.manuel_anvendt).toMatch(/Jonas' beslutning/);
  });
  it("perioden ejet af en anden rapport springes over med grunden", () => {
    const d = afgoerMasseGenkoersel(raekke({ periode_ejes_af: "r9" }), alle);
    expect(d.grund).toBe("periode_ejes_af_anden");
    expect(d.tekst).toMatch(/Erstat gammel data/);
  });
  it("slettet, behandles, årsrapport, ingen fil, legacy-sti, ukendt filtype, fravalgt skabelon", () => {
    expect(afgoerMasseGenkoersel(raekke({ deleted_at: "2026-09-01" }), alle).grund).toBe("slettet");
    expect(afgoerMasseGenkoersel(raekke({ status: "processing" }), alle).grund).toBe("behandles");
    expect(afgoerMasseGenkoersel(raekke({ report_type: "aarsrapport" }), alle).grund).toBe("aarsrapport");
    expect(afgoerMasseGenkoersel(raekke({ file_path: null }), alle).grund).toBe("ingen_fil");
    expect(afgoerMasseGenkoersel(raekke({ file_path: "uploads/u1/f1/resultat.pdf" }), alle).grund).toBe("legacy_sti");
    expect(afgoerMasseGenkoersel(raekke({ file_name: "resultat.docx", file_path: "c1/r1/resultat.docx" }), alle).grund).toBe("ukendt_filtype");
    expect(afgoerMasseGenkoersel(raekke(), { skabeloner: new Set(["DK_ECONOMIC_SALDOBALANCE_XLSX_V1"]), medManuelle: false }).grund).toBe("fravalgt_skabelon");
  });
  it("det der gør kørslen FORKERT (manuel, ejerskab) dømmes før det der gør den UMULIG (fil)", () => {
    expect(afgoerMasseGenkoersel(raekke({ manual_override_status: "applied", file_path: null }), alle).grund).toBe("manuel_anvendt");
    expect(afgoerMasseGenkoersel(raekke({ periode_ejes_af: "r9", file_path: null }), alle).grund).toBe("periode_ejes_af_anden");
  });
});

describe("afgoerGodkendelse — hvad må godkendes automatisk", () => {
  const p = (o: Partial<Parameters<typeof afgoerGodkendelse>[0] & object> = {}) => ({ can_commit: true, state: "ready", state_reason: null, ownership_state: "none", validation_status: "PASS", quality_signals: { canonical_checks: [] }, metrics_preview: { ebt: 1 }, ...o });
  it("PASS uden advarsler → automatisk", () => {
    expect(afgoerGodkendelse(p())).toMatchObject({ maa: true, automatisk: true });
    expect(afgoerGodkendelse(p({ ownership_state: "same_report", state: "update_available" }))).toMatchObject({ maa: true, automatisk: true });
  });
  it("WARN med tekst (D's kryds) → må, men ikke automatisk; teksten står i grunden", () => {
    const d = afgoerGodkendelse(p({ quality_signals: { canonical_checks: [{ name: "resultat_udaekket", result: "WARN", details: "x", tekst: "75.000 kr. af resultatet er ikke fordelt på grupperne." }] } }));
    expect(d).toMatchObject({ maa: true, automatisk: false });
    expect(d.grund).toContain("75.000 kr.");
    expect(advarslerAf({ canonical_checks: [{ result: "WARN", tekst: "" }, { result: "PASS", tekst: "x" }] })).toEqual([]);
  });
  it("FAIL → må med klik, ikke automatisk; kan ikke committe / ejes af anden → må ikke; uden preview → må ikke", () => {
    expect(afgoerGodkendelse(p({ validation_status: "FAIL" }))).toMatchObject({ maa: true, automatisk: false });
    expect(afgoerGodkendelse(p({ can_commit: false, state: "blocked", state_reason: "Periode 2026-06 ejes af rapport r9" }))).toMatchObject({ maa: false, automatisk: false, grund: "Periode 2026-06 ejes af rapport r9" });
    expect(afgoerGodkendelse(p({ ownership_state: "other_report" }))).toMatchObject({ maa: false });
    expect(afgoerGodkendelse(null).maa).toBe(false);
  });
});

describe("takt, rækkefølge, opsummering, tal", () => {
  it("højst 10 pr. hold, 2 s pause", () => { expect(HOLD_LOFT).toBe(10); expect(PAUSE_MS).toBe(2000); });
  it("godkendte først, så gruppe a → d, så periode", () => {
    const r = koerselsRaekkefoelge([
      raekke({ id: "b-ugodkendt", report_period: "Maj 2026" }),
      raekke({ id: "a-godkendt", template_id: "DK_ECONOMIC_SALDOBALANCE_XLSX_V1", facts_period_key: "2025-10" }),
      raekke({ id: "b-godkendt-juni", facts_period_key: "2026-06" }),
      raekke({ id: "b-godkendt-maj", facts_period_key: "2026-05" }),
    ]);
    expect(r.map((x) => x.id)).toEqual(["a-godkendt", "b-godkendt-maj", "b-godkendt-juni", "b-ugodkendt"]);
  });
  it("opsummer og talTekst", () => {
    const res = (o: Partial<Resultat>): Resultat => ({ report_id: "x", udfald: "genlaest", fejl: null, ebt_foer: null, ebt_efter: null, udaekket_foer: null, udaekket_efter: null, validering_foer: null, validering_efter: null, skabelon_efter: null, preview: null, godkendelse: { maa: true, automatisk: true, grund: "" }, godkendt: false, godkend_fejl: null, ...o });
    expect(opsummer([res({}), res({ godkendt: true }), res({ udfald: "fejlet" }), res({ udfald: "afbrudt" }), res({ godkendelse: { maa: true, automatisk: false, grund: "" } })])).toEqual({ genlaest: 3, fejlet: 1, sprunget: 0, afbrudt: 1, godkendt: 1, klarTilAuto: 1 });
    expect(talTekst(150932.87)).toBe("150.933"); expect(talTekst(-1268747)).toBe("−1.268.747"); expect(talTekst(null)).toBe("—");
  });
});
