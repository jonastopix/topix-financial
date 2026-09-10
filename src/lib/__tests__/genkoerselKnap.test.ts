/**
 * Knappen «Prøv at læse filen igen» (10/9): dommen om hvad der kan genkøres,
 * pariteten mod Deno-spejlet, og ordene for serverens svar.
 */
import { describe, expect, it } from "vitest";
import {
  afgoerGenkoersel,
  fejlgrundAfRapport,
  GENKOER_KNAP_TEKST,
  GENKOERSEL_TEKST,
  genkoerselAfRapport,
  needsManualEntryAf,
  tolkGenkoerselFejl,
  tolkGenkoerselSvar,
  tolkToerkoersel,
  type GenkoerselRaekke,
} from "@/lib/genkoersel";
import {
  afgoerGenkoersel as afgoerGenkoerselDeno,
  GENKOERSEL_TEKST as GENKOERSEL_TEKST_DENO,
} from "../../../supabase/functions/_shared/genkoersel.ts";

const ID = "11111111-1111-4111-8111-111111111111";

const raekke = (over: Partial<GenkoerselRaekke> = {}): GenkoerselRaekke => ({
  id: ID,
  file_name: "Saldobalance.csv",
  file_path: `c/${ID}/Saldobalance.csv`,
  status: "processed",
  validation_status: "FAIL",
  deleted_at: null,
  manual_override_status: null,
  needs_manual_entry: true,
  har_facts: false,
  ...over,
});

describe("dommen på fladen — genkoerselAfRapport (rækken fra useVirksomhed + facts)", () => {
  it("CSV strandet uden facts: knappen tilbydes", () => {
    const d = genkoerselAfRapport({ id: ID, file_name: "Saldobalance.csv", file_path: "x", status: "error", manual_override_status: null }, false);
    expect(d).toMatchObject({ kan: true, grund: "ok", filtype: "csv" });
  });
  it("XLSX med processed + FAIL: knappen tilbydes", () => {
    const d = genkoerselAfRapport({ id: ID, file_name: "ANLA.xlsx", file_path: "x", status: "processed", validation_status: "FAIL", manual_override_status: null }, false);
    expect(d.kan).toBe(true);
  });
  it("PDF: ingen knap — grunden nævner browseren og ny upload", () => {
    const d = genkoerselAfRapport({ id: ID, file_name: "2026-05+06 Almindelig.pdf", file_path: "x", status: "error", manual_override_status: null }, false);
    expect(d).toMatchObject({ kan: false, grund: "pdf_kraever_browser" });
    expect(d.tekst).toMatch(/browseren/);
  });
  it("allerede med facts: ingen knap, uanset filtype", () => {
    expect(genkoerselAfRapport({ id: ID, file_name: "a.csv", file_path: "x", status: "error", manual_override_status: null }, true).grund).toBe("har_facts");
  });
  it("behandlet og i orden (PASS, ingen manuel indtastning): ikke strandet", () => {
    expect(genkoerselAfRapport({ id: ID, file_name: "a.csv", file_path: "x", status: "processed", validation_status: "PASS", quality_signals: { needs_manual_entry: false }, manual_override_status: null }, false).grund).toBe("ikke_strandet");
  });
  it("needs_manual_entry som 'true' (klientens streng) tæller som strandet", () => {
    expect(needsManualEntryAf({ needs_manual_entry: "true" })).toBe(true);
    expect(needsManualEntryAf({ needs_manual_entry: true })).toBe(true);
    expect(needsManualEntryAf({ needs_manual_entry: false })).toBe(false);
    expect(needsManualEntryAf(null)).toBe(false);
    const d = genkoerselAfRapport({ id: ID, file_name: "a.xls", file_path: "x", status: "processed", validation_status: "PASS", quality_signals: { needs_manual_entry: "true" }, manual_override_status: null }, false);
    expect(d.kan).toBe(true);
  });
  it("manuelt anvendt, uden filsti, ukendt filtype: hver sin grund", () => {
    expect(genkoerselAfRapport({ id: ID, file_name: "a.csv", file_path: "x", status: "error", manual_override_status: "applied" }, false).grund).toBe("manuel_anvendt");
    expect(genkoerselAfRapport({ id: ID, file_name: "a.csv", file_path: null, status: "error", manual_override_status: null }, false).grund).toBe("ingen_fil");
    expect(genkoerselAfRapport({ id: ID, file_name: "a.numbers", file_path: "x", status: "error", manual_override_status: null }, false).grund).toBe("ukendt_filtype");
  });
});

describe("paritet — src/lib/genkoersel spejler supabase/functions/_shared/genkoersel", () => {
  const varianter: Partial<GenkoerselRaekke>[] = [
    {},
    { file_name: "a.xlsx" },
    { file_name: "a.XLS", status: "error", validation_status: null, needs_manual_entry: false },
    { file_name: "a.pdf" },
    { file_name: "a.pdf", har_facts: true },
    { har_facts: true },
    { deleted_at: "2026-09-01T00:00:00Z" },
    { manual_override_status: "applied" },
    { status: "processing", validation_status: null, needs_manual_entry: false },
    { status: "processed", validation_status: "PASS", needs_manual_entry: false },
    { file_path: null },
    { file_name: "tal.numbers" },
    { file_name: null },
  ];
  for (const v of varianter) {
    it(`paritet: ${JSON.stringify(v)}`, () => {
      expect(afgoerGenkoersel(raekke(v))).toEqual(afgoerGenkoerselDeno(raekke(v)));
    });
  }
  it("teksterne er identiske", () => {
    expect(GENKOERSEL_TEKST).toEqual(GENKOERSEL_TEKST_DENO);
  });
});

describe("ordene — fejlgrund, knap, tørkørsel og kørsel", () => {
  it("fejlgrunden er den første gemte fejl, ellers et ærligt fravær", () => {
    expect(fejlgrundAfRapport({ validation_errors: ["  ", "Known source dinero detected but no supported template matched."], status: "processed" })).toBe("Known source dinero detected but no supported template matched.");
    expect(fejlgrundAfRapport({ validation_errors: null, status: "error" })).toBe("Ingen fejlgrund gemt på rapporten.");
    expect(fejlgrundAfRapport({ validation_errors: [], status: "processed" })).toMatch(/kunne ikke godkendes automatisk/);
  });
  it("knappen siger hvad den gør", () => {
    expect(GENKOER_KNAP_TEKST).toBe("Prøv at læse filen igen");
  });
  it("tørkørslen: ok uden advarsel, ok med dublet-advarsel, afvist, ukendt", () => {
    expect(tolkToerkoersel({ ville_genkoere: [{ report_id: ID, tekst: "Kan genkøres fra storage." }], afvist: [] }, ID)).toEqual({ kan: true, tekst: "Kan genkøres fra storage.", advarsel: null });
    expect(tolkToerkoersel({ ville_genkoere: [{ report_id: ID, tekst: "ok", advarsel: "En anden behandlet rapport …" }] }, ID).advarsel).toBe("En anden behandlet rapport …");
    expect(tolkToerkoersel({ ville_genkoere: [], afvist: [{ report_id: ID, tekst: "PDF kan ikke genkøres fra serveren …" }] }, ID)).toMatchObject({ kan: false, tekst: expect.stringContaining("PDF") });
    expect(tolkToerkoersel({ ville_genkoere: [], afvist: [], ukendte_report_ids: [ID] }, ID).tekst).toMatch(/kender ikke rapporten/);
    expect(tolkToerkoersel(null, ID).kan).toBe(false);
  });
  it("kørslen: PASS → succes med periode; FAIL → advarsel med serverens ord; fejlet → fejl med grund, aldrig tom", () => {
    const pass = tolkGenkoerselSvar({ koert: [{ report_id: ID, udfald: "behandlet_pass", svar: {}, raekke_efter: { report_period: "Juli 2026" } }] }, ID);
    expect(pass).toMatchObject({ tone: "success", beskrivelse: "Periode: Juli 2026", genhent: true });
    const fail = tolkGenkoerselSvar({ koert: [{ report_id: ID, udfald: "behandlet_fail_eller_manuel", svar: { message: "Filen er genkendt som en rapport fra Dinero, men …" }, raekke_efter: { routing_branch: "known_source_unsupported_variant" } }] }, ID);
    expect(fail.tone).toBe("warning");
    expect(fail.beskrivelse).toMatch(/Dinero/);
    const failUdenOrd = tolkGenkoerselSvar({ koert: [{ report_id: ID, udfald: "behandlet_fail_eller_manuel", svar: {}, raekke_efter: { routing_branch: "deterministic_structural_fail" } }] }, ID);
    expect(failUdenOrd.beskrivelse).toBe("Rute: deterministic_structural_fail");
    const fejlet = tolkGenkoerselSvar({ koert: [{ report_id: ID, udfald: "fejlet", svar: { error: "Deterministic parsing failed" }, raekke_efter: { status: "error" } }] }, ID);
    expect(fejlet).toMatchObject({ tone: "error", beskrivelse: "Deterministic parsing failed" });
    const fejletTom = tolkGenkoerselSvar({ koert: [{ report_id: ID, udfald: "fejlet", svar: {}, raekke_efter: null }] }, ID);
    expect(fejletTom.beskrivelse).toBe("Serveren gav ingen fejlgrund.");
  });
  it("grunden hentes fra rækkens validation_errors når svaret ingen ord bærer (ANLA 10/9: «1/1 cost fields negative»)", () => {
    const fraRaekken = tolkGenkoerselSvar({ koert: [{ report_id: ID, udfald: "fejlet", svar: { status: null, error: null, message: null },
      raekke_efter: { status: "error", validation_errors: ["suspicious_sign_pattern: 1/1 cost fields negative"] } }] }, ID);
    expect(fraRaekken).toMatchObject({ tone: "error", beskrivelse: "suspicious_sign_pattern: 1/1 cost fields negative" });
    const fraSvaret = tolkGenkoerselSvar({ koert: [{ report_id: ID, udfald: "fejlet", svar: { validation_errors: ["gross_profit_sum: MISMATCH"] }, raekke_efter: { status: "error", validation_errors: [] } }] }, ID);
    expect(fraSvaret.beskrivelse).toBe("gross_profit_sum: MISMATCH");
    const failManuel = tolkGenkoerselSvar({ koert: [{ report_id: ID, udfald: "behandlet_fail_eller_manuel", svar: {},
      raekke_efter: { status: "processed", validation_errors: ["period_consistency: YTD (0) < period (1631529.45)"], routing_branch: "deterministic_success" } }] }, ID);
    expect(failManuel.beskrivelse).toBe("period_consistency: YTD (0) < period (1631529.45)");
  });
  it("kørslen: dublet-gaten, fil ikke hentet, kastede, intet resultat", () => {
    expect(tolkGenkoerselSvar({ koert: [{ report_id: ID, udfald: "raekke_slettet_af_dubletgaten", svar: { duplicate: true, existing_report_id: "abc" } }] }, ID)).toMatchObject({ tone: "error", beskrivelse: expect.stringContaining("abc"), genhent: true });
    expect(tolkGenkoerselSvar({ koert: [{ report_id: ID, udfald: "fil_kunne_ikke_hentes", fejl: "Object not found" }] }, ID)).toMatchObject({ tone: "error", beskrivelse: "Object not found", genhent: false });
    expect(tolkGenkoerselSvar({ koert: [{ report_id: ID, udfald: "kastede", fejl: "boom" }] }, ID).beskrivelse).toBe("boom");
    expect(tolkGenkoerselSvar({ koert: [], afvist: [{ report_id: ID, tekst: "Rapporten har allerede facts …" }] }, ID)).toMatchObject({ tone: "info", genhent: true });
    expect(tolkGenkoerselSvar({}, ID).tone).toBe("error");
  });
  it("HTTP-fejl: 401, 403, 400 og øvrige får hver sin sætning", () => {
    expect(tolkGenkoerselFejl(401, { error: "Invalid or expired token" }).tekst).toMatch(/logget ind/);
    expect(tolkGenkoerselFejl(403, null).tekst).toMatch(/rådgivere/);
    expect(tolkGenkoerselFejl(400, { error: "report_ids skal være en ikke-tom liste af uuid'er" }).beskrivelse).toMatch(/report_ids/);
    expect(tolkGenkoerselFejl(500, null).beskrivelse).toBe("status 500");
    expect(tolkGenkoerselFejl(null, null).beskrivelse).toBe("status ?");
  });
});
