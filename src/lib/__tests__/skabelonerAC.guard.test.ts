import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn: «to rettelser før 22/9» A + A2 + C (18/9-2026, recon-resultat-alle-
// skabeloner.md §4). Seks domme:
//   1. P&L-PDF-skabelonen: admin-matcheren rammer «Administrationsomkostninger i
//      alt»; matchere for renteindtægter/renteudgifter, «Salgs- og rejse…» og
//      «Autodrift …»; «Resultat før renter» er ebit (ikke ebt) og står ikke i
//      ebt-kæden; tekstvejen respekterer anti_pattern og konventionen.
//   2. Saldobalance-PDF-skabelonen: lokaler, autodrift, renteindtægter og
//      renteudgifter fanges til key_figures med KF_TO_CANONICAL-nøglerne.
//   3. Motoren: financial_income i CanonicalMetrics; resultat_foer_renter → ebit i
//      begge kort; ebt = ebit − financial_costs + financial_income, dernæst
//      periodens resultat, dernæst ebit alene med WARN ebt_before_interest.
//   4. Motoren (C): AI-resultatets fortegn krydstjekkes for resultatopgørelser
//      (!isSaldobalance && !isDeterministic) med ai_result_sign_inverted, og
//      kun ved samme størrelse (tolerance 5 % / 500 kr.).
//   5. Prompten TRIN 3 D: kreditformatet skrevet ud; den gamle linje
//      «I RESULTATOPGØRELSER: Aflæs DIREKTE — negativt = tab, positivt = overskud»
//      er væk; skemaet har finansielle_omkostninger/finansielle_indtaegter.
//   6. rimelighed (begge spejle): vehicle_costs, payroll_related, other_staff_costs
//      i OPEX_FELTER og financial_income lagt til i regnestykket.
// Kildelæsning med selvbevis på kopier.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const PNL = "supabase/functions/_shared/templates/dkEconomicResultatopgoerelsePdfV1.ts";
const SALDO = "supabase/functions/_shared/templates/dkEconomicSaldobalancePdfV1.ts";
const ENGINE = "supabase/functions/_shared/canonicalEngine.ts";
const TYPES = "supabase/functions/_shared/canonicalTypes.ts";
const INDEX = "supabase/functions/extract-financial-data/index.ts";
const RIM_DENO = "supabase/functions/_shared/rimelighed.ts";
const RIM_SRC = "src/lib/rimelighed.ts";
const OMK_DENO = "supabase/functions/_shared/omkostningsnoegler.ts";
const OMK_SRC = "src/lib/omkostningsnoegler.ts";

/** Dom 1. */
export const pnlSkabelonen = (p: string): boolean =>
  p.includes('{ source_field_id: "administrationsomkostninger", pattern: /administration(s?omkostninger)?\\b/i, family: "cost_like", canonical_hint: "admin_costs", require_subtotal: true },') &&
  p.includes('{ source_field_id: "renteindtaegter", pattern: /(renteindtægter|finansielle indtægter)\\s*(i alt|ialt)/i, family: "revenue_like", canonical_hint: "financial_income", require_subtotal: true },') &&
  p.includes('{ source_field_id: "renteudgifter", pattern: /(renteudgifter|finansielle (omkostninger|udgifter)|finansieringsudgifter)\\s*(i alt|ialt)/i, family: "cost_like", canonical_hint: "financial_costs", require_subtotal: true },') &&
  p.includes('{ source_field_id: "salgsomkostninger", pattern: /salgs.*omkostninger/i, family: "cost_like", canonical_hint: "sales_costs", require_subtotal: true },') &&
  p.includes('{ source_field_id: "transportomkostninger", pattern: /^(transportomkostninger|autodrift).*(i alt|ialt)/i, family: "cost_like", canonical_hint: "vehicle_costs", require_subtotal: true },') &&
  p.includes('{ source_field_id: "resultat_foer_renter", pattern: /resultat før renter/i, family: "profit_like", canonical_hint: "ebit", require_subtotal: true },') &&
  (p.match(/const ebtFieldIds = \["resultat_foer_skat", "resultat_foer_ekstraordinaere", "periodens_resultat", "arets_resultat"\];/g) ?? []).length === 2 &&
  !/ebtFieldIds = \[[^\]]*resultat_foer_renter/.test(p) &&
  p.includes("l => fieldDef.pattern.test(l.name) && (!fieldDef.anti_pattern || !fieldDef.anti_pattern.test(l.name)) && (!fieldDef.require_subtotal || l.is_subtotal)") &&
  p.includes('if (fieldDef.family === "profit_like" && rawValue !== null && legacyConvention === "business") {') &&
  p.includes('const adminLine = findByLabel(lines, /administration(s?omkostninger)?\\b/i);');

/** Dom 2. */
export const saldoSkabelonen = (s: string): boolean =>
  s.includes('const lokaleLine = findByLabel(lines, /lokale.*(i alt|ialt)/i, "PNL");') &&
  s.includes('const autoLine = findByLabel(lines, /(autodrift|transport|\\bbil(er|omk))[^\\n]*(i alt|ialt)/i, "PNL");') &&
  s.includes('const renteindtLine = findByLabel(lines, /(renteindtægter|finansielle indtægter).*(i alt|ialt)/i, "PNL");') &&
  s.includes('const renteudgLine = findByLabel(lines, /(renteudgifter|finansielle (omkostninger|udgifter)|finansieringsudgifter).*(i alt|ialt)/i, "PNL");') &&
  s.includes("lokaleomkostninger: absVal(lokaleLine?.period_amount ?? null),") &&
  s.includes("transportomkostninger: absVal(autoLine?.period_amount ?? null),") &&
  s.includes("finansielle_indtaegter: absVal(renteindtLine?.period_amount ?? null),") &&
  s.includes("finansielle_omkostninger: absVal(renteudgLine?.period_amount ?? null),");

/** Dom 3. */
export const motorenAfleder = (e: string, t: string): boolean =>
  t.includes("financial_income: number | null;") &&
  (e.match(/resultat_foer_renter: "ebit",/g) ?? []).length === 2 &&
  !/resultat_foer_renter: "ebt"/.test(e) &&
  e.includes('finansielle_indtaegter: "financial_income",') &&
  e.includes('renteindtaegter: "financial_income",') &&
  e.includes('FIN_INCOME: "financial_income",') &&
  e.includes("if (metrics.ebt == null && metrics.ebit != null && (metrics.financial_costs != null || metrics.financial_income != null)) {") &&
  e.includes("metrics.ebt = metrics.ebit - (metrics.financial_costs ?? 0) + (metrics.financial_income ?? 0);") &&
  e.includes("} else if (metrics.ebt == null && metrics.net_result != null && !skatKandidat) {") &&
  e.includes('rule: "ebt_from_net_result",') &&
  e.includes('rule: "ebt_from_ebit_no_financials",') &&
  e.includes('name: "ebt_before_interest",') &&
  e.includes('result: "WARN",\n      details: `ebt = ebit (${metrics.ebit}) — no financial items captured; result is before interest`,');

/** Dom 4. */
export const aiFortegnet = (e: string): boolean => {
  const start = e.indexOf("export function normalizeToCanonical(");
  const slut = e.indexOf("export function buildRawLines(");
  if (start === -1 || slut === -1) return false;
  const krop = e.slice(start, slut);
  return e.includes("export const AI_RESULTAT_TOLERANCE_PCT = 0.05;") &&
    e.includes("export const AI_RESULTAT_TOLERANCE_MIN_KR = 500;") &&
    krop.includes("if (resultatFields.includes(dkField) && !isSaldobalance && !isDeterministic && value !== 0) {") &&
    krop.includes("const dom = aiResultatFortegnsdom(kf, lineItems, value);") &&
    krop.includes('correct(dkField, value, normalized, "ai_result_sign_inverted", dom.reason, "HIGH");') &&
    e.includes("if (forventet === 0 || Math.sign(forventet) === Math.sign(value)) continue;") &&
    e.includes("const tolerance = Math.max(AI_RESULTAT_TOLERANCE_PCT * Math.max(Math.abs(value), Math.abs(forventet)), AI_RESULTAT_TOLERANCE_MIN_KR);");
};

/** Dom 5. */
export const prompten = (i: string): boolean =>
  i.includes("   - I RESULTATOPGØRELSER: se på omsætningslinjen FØRST:") &&
  i.includes("     · Omsætning står NEGATIV (e-conomics kreditformat: omsætning negativ, omkostninger positive): resultatet står med OMVENDT fortegn — NEGATIVT = OVERSKUD, POSITIVT = TAB → VEND fortegnet (gang med -1)") &&
  !i.includes("   - I RESULTATOPGØRELSER: Aflæs DIREKTE — negativt = tab, positivt = overskud") &&
  i.includes('finansielle_omkostninger: { type: "number", description: "Renteudgifter / finansielle omkostninger i alt — positivt tal" },') &&
  i.includes('finansielle_indtaegter: { type: "number", description: "Renteindtægter / finansielle indtægter i alt — positivt tal" },');

/** Dom 6. */
// Efter C's saldobalance-rettelse går regnestykket gennem omkostningsnoegler.ts (begge spejle):
// drift-listen bærer vehicle_costs/payroll_related/other_staff_costs, og ebtRegnet lægger finansielle indtægter til.
export const rimelighedRegner = (r: string, o: string): boolean =>
  // kontrolsummen (17/9-2026) udvidede importen — før ordret: 'import { CANONICAL as OMK, ANDEL_NOEGLER_TIL_RIMELIGHED, ebtRegnet, sumOmkostninger } from "./omkostningsnoegler.ts";'
  r.includes('import { CANONICAL as OMK, ANDEL_NOEGLER_TIL_RIMELIGHED, ebtRegnet, kontrolsum, sumOmkostninger, udaekketErStort, udaekketTekst } from "./omkostningsnoegler.ts";') &&
  r.includes("const beregnetEbt = ebtRegnet(grossProfit, m, OMK);") &&
  r.includes("financial_income?: number | null;") &&
  o.includes('drift: ["payroll", "payroll_related", "other_staff_costs", "sales_costs", "facility_costs", "admin_costs", "vehicle_costs", "other_costs"],') &&
  o.includes('finansielleIndtaegter: "financial_income",') &&
  o.includes("return ebitda - (afskr === null ? 0 : Math.abs(afskr)) - (finans === null ? 0 : Math.abs(finans)) + finansielleIndtaegter(m, s);");

describe("skabelonerAC.guard — A, A2 og C: admin og renter i PDF'erne, ebt afledt rigtigt, AI-fortegnet krydstjekket", () => {
  const p = udenKommentarer(laes(PNL));
  const s = udenKommentarer(laes(SALDO));
  const e = udenKommentarer(laes(ENGINE));
  const t = udenKommentarer(laes(TYPES));
  const i = laes(INDEX); // prompten er en template-streng — læses RÅ
  const rd = udenKommentarer(laes(RIM_DENO));
  const rs = udenKommentarer(laes(RIM_SRC));
  const od = udenKommentarer(laes(OMK_DENO));
  const os = udenKommentarer(laes(OMK_SRC));

  it("dom 1: P&L-PDF-skabelonen", () => { expect(pnlSkabelonen(p)).toBe(true); });
  it("dom 2: saldobalance-PDF-skabelonen", () => { expect(saldoSkabelonen(s)).toBe(true); });
  it("dom 3: motoren afleder ebt = ebit − financial_costs + financial_income, dernæst periodens resultat, dernæst ebit med WARN", () => { expect(motorenAfleder(e, t)).toBe(true); });
  it("dom 4: AI-resultatets fortegn krydstjekkes for resultatopgørelser, kun ved samme størrelse", () => { expect(aiFortegnet(e)).toBe(true); });
  it("dom 5: prompten og skemaet", () => { expect(prompten(i)).toBe(true); });
  it("dom 6: rimelighed regner alle grupper med — i begge spejle", () => { expect(rimelighedRegner(rd, od)).toBe(true); expect(rimelighedRegner(rs, os)).toBe(true); });

  it("selvbevis 1: den gamle admin-matcher, eller «Resultat før renter» tilbage i ebt-kæden, falder", () => {
    expect(pnlSkabelonen(p.replace("pattern: /administration(s?omkostninger)?\\b/i, family", "pattern: /administration\\b/i, family"))).toBe(false);
    expect(pnlSkabelonen(p.replace('canonical_hint: "ebit", require_subtotal: true },', 'canonical_hint: "ebt", require_subtotal: true },'))).toBe(false);
  });
  it("selvbevis 2: lokaleomkostninger uden nøgle falder", () => {
    expect(saldoSkabelonen(s.replace("lokaleomkostninger: absVal(lokaleLine?.period_amount ?? null),", ""))).toBe(false);
  });
  it("selvbevis 3: ebt uden renteindtægterne, eller WARN'en fjernet, falder", () => {
    expect(motorenAfleder(e.replace("metrics.ebt = metrics.ebit - (metrics.financial_costs ?? 0) + (metrics.financial_income ?? 0);", "metrics.ebt = metrics.ebit - (metrics.financial_costs ?? 0);"), t)).toBe(false);
    expect(motorenAfleder(e.replace('name: "ebt_before_interest",', 'name: "ebt_note",'), t)).toBe(false);
  });
  it("selvbevis 4: dommen kun for saldobalancer igen, eller uden størrelsestjek, falder", () => {
    expect(aiFortegnet(e.replace("if (resultatFields.includes(dkField) && !isSaldobalance && !isDeterministic && value !== 0) {", "if (resultatFields.includes(dkField) && isSaldobalance && !isDeterministic && value !== 0) {"))).toBe(false);
    expect(aiFortegnet(e.replace("if (afvigelse <= tolerance && (bedst === null || afvigelse < bedst.afvigelse)) bedst = { variant, forventet, afvigelse };", "bedst = { variant, forventet, afvigelse };").replace("const tolerance = Math.max(AI_RESULTAT_TOLERANCE_PCT * Math.max(Math.abs(value), Math.abs(forventet)), AI_RESULTAT_TOLERANCE_MIN_KR);", ""))).toBe(false);
  });
  it("selvbevis 5: den gamle promptlinje tilbage falder", () => {
    expect(prompten(i.replace("   - I RESULTATOPGØRELSER: se på omsætningslinjen FØRST:", "   - I RESULTATOPGØRELSER: Aflæs DIREKTE — negativt = tab, positivt = overskud"))).toBe(false);
  });
  it("selvbevis 6: vehicle_costs ude af OPEX_FELTER falder", () => {
    expect(rimelighedRegner(rd, od.replace('"admin_costs", "vehicle_costs", "other_costs"],', '"admin_costs", "other_costs"],'))).toBe(false);
    expect(rimelighedRegner(rd, od.replace(" + finansielleIndtaegter(m, s);", ";"))).toBe(false);
  });
});
