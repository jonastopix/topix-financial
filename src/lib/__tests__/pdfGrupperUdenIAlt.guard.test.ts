import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn: grupper uden «i alt» i de to e-conomic-PDF-skabeloner (17/9-2026). Fire domme:
//   1. gruppetrae.ts: kontolinjer er aldrig grupper; en sumlinje lukker overskriften med samme navn (+ « i alt»);
//      uafsluttede overskrifter kasseres, børnene beholdes.
//   2. Saldobalance-PDF: linjerAfTekst skelner konto (4–6 cifre først) fra gruppe og lader «Aktiver …» MED tal være
//      totalen; gruppeNoegletal lægger en kredit-gruppe i andre_driftsindtaegter, en ukendt debet-gruppe i
//      oevrige_omkostninger, løn/pension ud af Personaleudgifter, og bruger «Resultat før renter» kun som sidste udvej.
//      Træets tal vinder over «… i alt»-matcherne, som bliver faldback.
//   3. PDF-resultatopgørelse: de nye matchere (løn/gager, pensioner, personale, leasing → øvrige, finansieringsomkostninger),
//      vareforbrug kun efter omsætningstotalen (begge veje), efterbehandlPersonale trækker løn og pension ud af beholderen.
//   4. Fixtures i begge filers form findes; Deno-testen og vitest-testen bruger dem.
// Kildelæsning med selvbevis på kopier.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const TRAE = "supabase/functions/_shared/gruppetrae.ts";
const SALDO = "supabase/functions/_shared/templates/dkEconomicSaldobalancePdfV1.ts";
const PNL = "supabase/functions/_shared/templates/dkEconomicResultatopgoerelsePdfV1.ts";
const FIX_KJ = "supabase/functions/_test_fixtures/saldobalancePdfGrupperSyntetisk.ts";
const FIX_BV = "supabase/functions/_test_fixtures/pnlPdfBrillevaerkSyntetisk.ts";
const DENO = "supabase/functions/extract-financial-data/pdf_grupper_uden_i_alt_test.ts";
const VITEST = "src/lib/__tests__/pdfGrupperUdenIAlt.test.ts";

export const traeet = (t: string): boolean =>
  t.includes("if (l.erKonto) continue;") &&
  t.includes("return sum === `${header} i alt` || sum === `${header} ialt`;") &&
  t.includes("for (let i = stack.length - 1; i >= 0; i--) if (erSumAf(stack[i].norm, norm)) { h = i; break; }") &&
  t.includes("for (const s of stack) roots.push(...s.children);");

export const saldoen = (s: string): boolean =>
  s.includes('import { alleGrupper, bygGruppetrae, findGruppe, type Gruppe, type Gruppelinje } from "../gruppetrae.ts";') &&
  s.includes("const erKonto = /^\\s*\\d{4,6}\\s+\\S/.test(line);") &&
  s.includes("    if (nums.length === 0) {\n      if (/^resultatopg/i.test(line)) { section = \"PNL\"; continue; }") &&
  s.includes("if (g.value < 0) { indtaegt += -g.value; indtaegtFundet = true; spor.push(`andre_driftsindtaegter<-${g.label}`); }") &&
  s.includes("else { oevrige += g.value; oevrigeFundet = true; spor.push(`oevrige_omkostninger<-${g.label}`); }") &&
  s.includes('if (regel.key === "oevrige_personale") {') &&
  s.includes("const ebtG = rfs ?? rfe ?? res;") &&
  s.includes("else if (rfr) saet(\"resultat_foer_skat\", -rfr.value - (kf.finansielle_omkostninger ?? 0) + (kf.finansielle_indtaegter ?? 0), `${rfr.label} − finans + finansielle indtægter (sidste udvej)`);") &&
  s.includes("const trae = gruppeNoegletal(linjerAfTekst(text));") &&
  s.includes("if (v !== null && v !== undefined) keyFigures[k] = v;") &&
  s.includes('name: "groups_from_tree",');

export const pnlen = (p: string): boolean =>
  p.includes('{ source_field_id: "loenninger", pattern: /^(lønninger|løn,? gager( og honorarer)?|løn)\\s*(mv\\.?)?\\s*(i alt|ialt)/i, family: "cost_like", canonical_hint: "payroll", require_subtotal: true },') &&
  p.includes('{ source_field_id: "pensioner_sociale", pattern: /^pensioner\\s*(og sociale bidrag)?\\s*(i alt|ialt)/i, family: "cost_like", canonical_hint: "payroll_related", require_subtotal: true },') &&
  p.includes('{ source_field_id: "oevrige_personale", pattern: /^(sociale bidrag og personaleomkostninger|personaleomkostninger|øvrige personale(udgifter|omkostninger))\\s*(i alt|ialt)/i, family: "cost_like", canonical_hint: "other_staff_costs", require_subtotal: true },') &&
  p.includes('{ source_field_id: "oevrige_omkostninger", pattern: /^(leasing|andre eksterne omkostninger|øvrige omkostninger)\\s*(i alt|ialt)/i, family: "cost_like", canonical_hint: "other_costs", require_subtotal: true },') &&
  p.includes("pattern: /(renteudgifter|finansielle (omkostninger|udgifter)|finansierings(udgifter|omkostninger))\\s*(i alt|ialt)/i") &&
  (p.match(/if \(fieldDef\.source_field_id === "direkte_omkostninger"\) \{/g) ?? []).length === 2 &&
  p.includes("else if (efter.length > 0) best = efter[efter.length - 1];") &&
  p.includes("if (total) match = total; else if (efter.length > 0) match = efter[efter.length - 1];") &&
  (p.match(/efterbehandlPersonale\(candidates\);/g) ?? []).length === 2 &&
  p.includes("if (Math.abs(beholder.raw_value) + 0.005 < Math.abs(sumDele) || Math.sign(beholder.raw_value) !== Math.sign(sumDele)) return;");

export const fixturerne = (kj: string, bv: string, d: string, v: string): boolean =>
  kj.includes("export const KJ_FORM_TEKST = `") && kj.includes("        Kapacitetsomkostninger                              315.000,00       630.000,00") &&
  bv.includes("export function brillevaerkFormen(medSocialeLinje = true): Raekke[] {") && bv.includes('{ label: "Løn, gager og honorarer i alt", periode: 20_000, subtotal: true },') &&
  d.includes("KJ_FORM_FORVENTET") && d.includes("BRILLEVAERK_FORM_FORVENTET") &&
  v.includes("KJ_FORM_FORVENTET") && v.includes("BRILLEVAERK_FORM_FORVENTET");

describe("pdfGrupperUdenIAlt.guard — grupperne læses af filens egen opbygning", () => {
  const t = udenKommentarer(laes(TRAE));
  const s = udenKommentarer(laes(SALDO));
  const p = udenKommentarer(laes(PNL));
  const kj = laes(FIX_KJ);
  const bv = laes(FIX_BV);
  const d = udenKommentarer(laes(DENO));
  const v = udenKommentarer(laes(VITEST));
  it("dom 1: træet", () => { expect(traeet(t)).toBe(true); });
  it("dom 2: saldobalance-PDF læser grupperne som træ, «i alt» er faldback", () => { expect(saldoen(s)).toBe(true); });
  it("dom 3: PDF-resultatopgørelsens matchere, vareforbrug efter omsætningen, beholderen", () => { expect(pnlen(p)).toBe(true); });
  it("dom 4: fixtures i begge former og begge tests", () => { expect(fixturerne(kj, bv, d, v)).toBe(true); });
  it("selvbevis: en konto som gruppe, kredit-gruppen som negativ omkostning, «før renter» som første valg, eller den gamle løn-matcher, falder", () => {
    expect(traeet(t.replace("if (l.erKonto) continue;", ""))).toBe(false);
    expect(saldoen(s.replace("if (g.value < 0) { indtaegt += -g.value; indtaegtFundet = true; spor.push(`andre_driftsindtaegter<-${g.label}`); }", "if (false) {}"))).toBe(false);
    expect(saldoen(s.replace("const ebtG = rfs ?? rfe ?? res;", "const ebtG = rfr ?? rfs ?? rfe ?? res;"))).toBe(false);
    expect(pnlen(p.replace("pattern: /^(lønninger|løn,? gager( og honorarer)?|løn)\\s*(mv\\.?)?\\s*(i alt|ialt)/i", "pattern: /lønninger\\s*(mv\\.?)?\\s*(i alt|ialt)/i"))).toBe(false);
  });
});
