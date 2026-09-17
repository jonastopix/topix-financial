import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn: rimelighedstjek FØR godkendelse — «tal der ikke kan passe» D
// (18/9-2026). Fem domme:
//   1. canonicalEngine.runExtendedValidation kører rimelighedstjek som de
//      sidste tjek og lægger dem i canonical_checks med deres eget resultat
//      (WARN/PASS/SKIP) — og status-dommen tæller stadig KUN FAIL: en WARN
//      giver aldrig FAIL (WARN må ikke blokere en rigtig rapport).
//   2. Typen: CheckResult kender "WARN"; ValidationCheck bærer tekst og felter.
//   3. Godkendelsesdialogen kræver et aktivt «Ja, tallene er rigtige — godkend
//      alligevel» (BEKRAEFT_TEKST) før commit_report_facts, når der er
//      advarsler: knappen er disabled og handleCommit/handleReplace/
//      handleSaveEdits afviser uden bekræftelsen.
//   4. Manuel rettelse (ReportManualOverride) får samme advarsler og samme
//      bekræftelse før «Gem og anvend».
//   5. src/lib/rimelighed.ts er et spejl af _shared/rimelighed.ts (paritet-
//      testen læser begge); årsrapporten får advarslerne som noter.
// Kildelæsning med selvbevis på kopier.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const ENGINE = "supabase/functions/_shared/canonicalEngine.ts";
const TYPES = "supabase/functions/_shared/canonicalTypes.ts";
const DIALOG = "src/components/ReportReviewDialog.tsx";
const MANUEL = "src/components/ReportManualOverride.tsx";
const AARS = "supabase/functions/_shared/aarsrapportNormalisering.ts";
const SPEJL = "src/lib/rimelighed.ts";
const BOKS = "src/components/RimelighedBoks.tsx";
const DENO = "supabase/functions/_shared/rimelighed.ts";

/** Dom 1: motoren kører tjekkene, og WARN giver aldrig FAIL. */
export const motorenKoererTjekkene = (e: string): boolean => {
  const start = e.indexOf("export function runExtendedValidation(");
  const slut = e.indexOf("export function computeAiEligible(");
  if (start === -1 || slut === -1) return false;
  const krop = e.slice(start, slut);
  return e.includes('import { rimelighedstjek } from "./rimelighed.ts";') &&
    krop.includes("for (const r of rimelighedstjek(metrics, statementType)) {") &&
    krop.includes("checks.push({ name: r.name, result: r.result, details: r.details, tekst: r.tekst, felter: r.felter });") &&
    krop.includes('const hasCanonicalFail = checks.some(c => c.result === "FAIL");') &&
    !/errors\.push\([^)]*r\.details/.test(krop);
};

/** Dom 2: typen. */
export const typenKenderWarn = (t: string): boolean =>
  t.includes('export type CheckResult = "PASS" | "FAIL" | "SKIP" | "WARN";') &&
  /export interface ValidationCheck \{\s*name: string;\s*result: CheckResult;\s*details: string;\s*tekst\?: string;\s*felter\?: string\[\];\s*\}/.test(t);

/** Dom 3: dialogen kræver bekræftelsen. */
export const dialogenKraeverBekraeftelse = (d: string, boks: string): boolean =>
  d.includes('import RimelighedBoks, { advarslerFraInputs, advarslerFraPreview, BEKRAEFTELSE_MANGLER } from "@/components/RimelighedBoks";') &&
  boks.includes('import { ADVARSEL_INTRO, ADVARSEL_OVERSKRIFT, BEKRAEFT_TEKST, rimelighedAdvarsler, type RimelighedAdvarsel } from "@/lib/rimelighed";') &&
  boks.includes("<span>{BEKRAEFT_TEKST}</span>") &&
  d.includes("const [bekraeftet, setBekraeftet] = useState(false);") &&
  d.includes("const kraeverBekraeftelse = advarsler.length > 0 && !bekraeftet;") &&
  d.includes("if (kraeverBekraeftelse) { toast.error(BEKRAEFTELSE_MANGLER); return; }") &&
  (d.match(/if \(kraeverBekraeftelse\) \{ toast\.error\(BEKRAEFTELSE_MANGLER\); return; \}/g) ?? []).length >= 3 &&
  d.includes("disabled={committing || kraeverBekraeftelse}") &&
  d.includes("disabled={replacing || kraeverBekraeftelse}") &&
  d.includes("disabled={saving || kraeverBekraeftelse}") &&
  d.includes("<RimelighedBoks advarsler={advarsler} bekraeftet={bekraeftet} onBekraeft={setBekraeftet} />");

/** Dom 4: manuel rettelse. */
export const manuelKraeverBekraeftelse = (m: string): boolean =>
  m.includes('import RimelighedBoks, { advarslerFraInputs, BEKRAEFTELSE_MANGLER } from "@/components/RimelighedBoks";') &&
  m.includes("const advarsler = advarslerFraInputs(metricInputs, reportType);") &&
  m.includes("const [bekraeftet, setBekraeftet] = useState(false);") &&
  m.includes('if (status === "applied" && advarsler.length > 0 && !bekraeftet) {') &&
  m.includes("<RimelighedBoks advarsler={advarsler} bekraeftet={bekraeftet} onBekraeft={setBekraeftet} />");

/** Dom 5: spejlet og årsrapporten. */
export const spejlOgAarsrapport = (spejlRaa: string, denoRaa: string, aars: string): boolean => {
  const uden = (s: string) => s.replace(/^\/\*\*[\s\S]*?\*\/\n/, "");
  return uden(spejlRaa) === uden(denoRaa) &&
    spejlRaa.includes("Spejlet ordret i supabase/functions/_shared/rimelighed.ts") &&
    aars.includes('import { rimelighedAdvarsler } from "./rimelighed.ts";') &&
    aars.includes("noter.push(`rimelighed: ${a.tekst}`);");
};

describe("rimelighedGodkendelse.guard — D: tjekkene i motoren, WARN aldrig FAIL, bekræftelse før commit", () => {
  const e = udenKommentarer(laes(ENGINE));
  const t = udenKommentarer(laes(TYPES));
  const d = udenKommentarer(laes(DIALOG));
  const m = udenKommentarer(laes(MANUEL));
  const aars = udenKommentarer(laes(AARS));
  const spejlRaa = laes(SPEJL);
  const boks = udenKommentarer(laes(BOKS));
  const denoRaa = laes(DENO);

  it("dom 1: runExtendedValidation kører rimelighedstjek og tæller kun FAIL i status", () => {
    expect(motorenKoererTjekkene(e)).toBe(true);
  });
  it("dom 2: CheckResult kender WARN; ValidationCheck bærer tekst og felter", () => {
    expect(typenKenderWarn(t)).toBe(true);
  });
  it("dom 3: dialogen: bekræftelse før commit, erstat og gem-rettelser", () => {
    expect(dialogenKraeverBekraeftelse(d, boks)).toBe(true);
  });
  it("dom 4: manuel rettelse: samme advarsler, samme bekræftelse før «Gem og anvend»", () => {
    expect(manuelKraeverBekraeftelse(m)).toBe(true);
  });
  it("dom 5: spejlet er ordret; årsrapporten får advarslerne som noter", () => {
    expect(spejlOgAarsrapport(spejlRaa, denoRaa, aars)).toBe(true);
  });

  it("selvbevis 1: WARN talt som FAIL, eller tjekkene lagt i errors, falder", () => {
    expect(motorenKoererTjekkene(e.replace('const hasCanonicalFail = checks.some(c => c.result === "FAIL");', 'const hasCanonicalFail = checks.some(c => c.result === "FAIL" || c.result === "WARN");'))).toBe(false);
    expect(motorenKoererTjekkene(e.replace("checks.push({ name: r.name, result: r.result, details: r.details, tekst: r.tekst, felter: r.felter });", "checks.push({ name: r.name, result: r.result, details: r.details, tekst: r.tekst, felter: r.felter }); errors.push(r.details);"))).toBe(false);
  });
  it("selvbevis 2: typen uden WARN falder", () => {
    expect(typenKenderWarn(t.replace('| "SKIP" | "WARN";', '| "SKIP";'))).toBe(false);
  });
  it("selvbevis 3: commit-knappen uden gaten, eller handleCommit uden afvisningen, falder", () => {
    expect(dialogenKraeverBekraeftelse(d.replace("disabled={committing || kraeverBekraeftelse}", "disabled={committing}"), boks)).toBe(false);
    expect(dialogenKraeverBekraeftelse(d.replace("if (kraeverBekraeftelse) { toast.error(BEKRAEFTELSE_MANGLER); return; }", ""), boks)).toBe(false);
  });
  it("selvbevis 4: «Gem og anvend» uden gaten falder", () => {
    expect(manuelKraeverBekraeftelse(m.replace('if (status === "applied" && advarsler.length > 0 && !bekraeftet) {', 'if (false) {'))).toBe(false);
  });
  it("selvbevis 5: et spejl der driver, eller årsrapporten uden noten, falder", () => {
    expect(spejlOgAarsrapport(spejlRaa.replace("ANDEL_MAX = 3", "ANDEL_MAX = 4"), denoRaa, aars)).toBe(false);
    expect(spejlOgAarsrapport(spejlRaa, denoRaa, aars.replace("noter.push(`rimelighed: ${a.tekst}`);", ""))).toBe(false);
  });
});
