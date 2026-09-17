import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (17/9-2026) for Mamut/C5-skabelonen DK_MAMUT_SALDO_XLSX_V1 (ANLA GLAS' filformat).
// Fem domme, læst i kilden:
//   1. SKABELONEN er registreret i templateRegistry og scorer på FORMEN (række 0 «Saldo:»,
//      række 1 præcis Kontonummer/Kontonavn/Beløb) — ikke på ordet «resultatopgørelse».
//   2. VÆRNET i e-conomic-XLSX'ens detect: Kontonummer/Kontonavn/Beløb i række 1 → 0.
//   3. PROFILEN mamut_saldo_business_v1 findes med cost NEGATE / profit KEEP / equity NEGATE /
//      cash KEEP, og kilden «mamut» er i SourceSystem og fingerprintet.
//   4. GRUPPERNE: «Dækningsbidrag 1» (ikke 2), «Årets resultat» med anti-match «skat af»,
//      finansielle indtægter som egen kandidat (A's nøgle), øvrige (C's nøgle), kontrolsum pnl_coverage.
//   5. PERIODEN bæres som teksten står — ingen månedstolkning i skabelonen (åbent spørgsmål).
// Selvbevis («VÆRNET VIRKER») kører hver dom på kopier med fejlen indsat.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");

const SKABELON = "supabase/functions/_shared/templates/dkMamutSaldoXlsxV1.ts";
const ECONOMIC = "supabase/functions/_shared/templates/dkEconomicResultatopgoerelseXlsxV1.ts";
const REGISTRY = "supabase/functions/_shared/templateRegistry.ts";
const PROFILER = "supabase/functions/_shared/normalizationProfiles.ts";
const TYPER = "supabase/functions/_shared/semanticTypes.ts";
const FINGERPRINT = "supabase/functions/_shared/sourceFingerprint.ts";
const FIXTURE_TS = "supabase/functions/_test_fixtures/mamutSaldoSyntetisk.ts";
const FIXTURE_XLSX = "supabase/functions/_test_fixtures/mamut_saldo_syntetisk_v1.xlsx";
const DENO_TEST = "supabase/functions/extract-financial-data/mamut_saldo_test.ts";

/** Dom 1. */
export const skabelonenErRegistreretOgScorerPaaFormen = (skabelon: string, registry: string): boolean => {
  const detect = skabelon.slice(skabelon.indexOf("  detect(ctx: DetectionContext): number {"), skabelon.indexOf("  extract(_ctx: ExtractionContext) {"));
  return (
    registry.includes('import { dkMamutSaldoXlsxV1 } from "./templates/dkMamutSaldoXlsxV1.ts";') &&
    /const TEMPLATE_REGISTRY: TemplateEntry\[\] = \[[\s\S]*?dkMamutSaldoXlsxV1,[\s\S]*?\];/.test(registry) &&
    detect.includes("if (saldoTekst(ctx.headerRows[0]) === null) return 0;") &&
    detect.includes("if (!erMamutKolonner(ctx.headerRows[1])) return 0;") &&
    detect.includes("let score = 50 + 30;") &&
    !/resultatopgørelse/i.test(detect)
  );
};

/** Dom 2. */
export const economicVaernet = (economic: string): boolean => {
  const detect = economic.slice(economic.indexOf("  detect(ctx: DetectionContext): number {"), economic.indexOf("  extract("));
  return (
    economic.includes('import { erMamutKolonner } from "./dkMamutSaldoXlsxV1.ts";') &&
    detect.includes("if (erMamutKolonner(ctx.headerRows[1])) return 0;") &&
    detect.indexOf("if (erMamutKolonner(ctx.headerRows[1])) return 0;") < detect.indexOf("let score = 0;")
  );
};

/** Dom 3. */
export const profilOgKilde = (profiler: string, typer: string, fingerprint: string): boolean => {
  const start = profiler.indexOf('profile_id: "mamut_saldo_business_v1"');
  const profil = profiler.slice(start, profiler.indexOf("\n};", start)); // KUN Mamuts profil — der står flere profiler efter den (17/9 aften)
  return (
    /cost_like:\s+NEGATE/.test(profil) && /profit_like:\s+KEEP/.test(profil) && /equity_like:\s+NEGATE/.test(profil) &&
    /cash_like:\s+KEEP/.test(profil) && /liability_like:\s+NEGATE/.test(profil) && /revenue_like:\s+KEEP/.test(profil) &&
    /combined_dk_business_v1,\s*mamut_saldo_business_v1,/.test(profiler) && // registreret efter combined — flere profiler må følge
    typer.includes('"combined_dk" | "mamut" | "unknown"') &&
    fingerprint.includes('source_system: "mamut",')
  );
};

/** Dom 4. */
export const grupperneOgKontrolsummen = (skabelon: string): boolean =>
  skabelon.includes('{ key: "daekningsbidrag", pattern: /^dækningsbidrag\\s*1$/i },') &&
  skabelon.includes('{ key: "arets_resultat", pattern: /^årets\\s+resultat$/i, anti: /skat\\s+af/i },') &&
  skabelon.includes('export const FINANSIELLE_INDTAEGTER_KEY = "finansielle_indtaegter";') &&
  skabelon.includes('export const OEVRIGE_KEY = "oevrige_omkostninger";') &&
  skabelon.includes('name: "pnl_coverage"') &&
  skabelon.includes('name: "sum_rows_consistent"') &&
  skabelon.includes("if (fordeling.ebtNr !== null && g.nr > fordeling.ebtNr) continue;");

/** Dom 5. */
export const periodenSomTekst = (skabelon: string): boolean =>
  skabelon.includes("report_period_label: periodeTekst,") &&
  skabelon.includes("period_start: null,") &&
  skabelon.includes("period_end: null,") &&
  !/januar|februar|marts.*april|DK_MONTHS|MONTH_NAMES/i.test(skabelon);

describe("mamutSkabelon.guard — Mamut/C5-saldolisten (ANLA GLAS' format)", () => {
  const skabelon = udenKommentarer(laes(SKABELON));
  const economic = udenKommentarer(laes(ECONOMIC));
  const registry = udenKommentarer(laes(REGISTRY));
  const profiler = udenKommentarer(laes(PROFILER));
  const typer = udenKommentarer(laes(TYPER));
  const fingerprint = udenKommentarer(laes(FINGERPRINT));

  it("1. skabelonen er registreret og scorer på formen, ikke på ordet «resultatopgørelse»", () => {
    expect(skabelonenErRegistreretOgScorerPaaFormen(skabelon, registry)).toBe(true);
  });
  it("2. e-conomic-XLSX'ens detect giver 0 ved Kontonummer/Kontonavn/Beløb — før det gamle +40", () => {
    expect(economicVaernet(economic)).toBe(true);
  });
  it("3. profilen mamut_saldo_business_v1 og kilden «mamut» findes", () => {
    expect(profilOgKilde(profiler, typer, fingerprint)).toBe(true);
  });
  it("4. Dækningsbidrag 1 (ikke 2), Årets resultat (ikke «skat af»), finansielle indtægter, øvrige, kontrolsum", () => {
    expect(grupperneOgKontrolsummen(skabelon)).toBe(true);
  });
  it("5. perioden bæres som teksten står — ingen månedstolkning", () => {
    expect(periodenSomTekst(skabelon)).toBe(true);
  });
  it("fixturen (syntetisk tabel + xlsx) og Deno-testen findes", () => {
    expect(existsSync(resolve(process.cwd(), FIXTURE_TS))).toBe(true);
    expect(existsSync(resolve(process.cwd(), FIXTURE_XLSX))).toBe(true);
    expect(existsSync(resolve(process.cwd(), DENO_TEST))).toBe(true);
    expect(laes(FIXTURE_TS)).not.toMatch(/ANLA|GLAS|Ka-ching/);
  });
});

describe("mamutSkabelon.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const skabelon = udenKommentarer(laes(SKABELON));
  const economic = udenKommentarer(laes(ECONOMIC));
  const registry = udenKommentarer(laes(REGISTRY));
  const profiler = udenKommentarer(laes(PROFILER));
  const typer = udenKommentarer(laes(TYPER));
  const fingerprint = udenKommentarer(laes(FINGERPRINT));

  it("1. en uregistreret skabelon, eller en detect der scorer på «resultatopgørelse», falder", () => {
    expect(skabelonenErRegistreretOgScorerPaaFormen(skabelon, registry.replace("  dkMamutSaldoXlsxV1,", ""))).toBe(false);
    expect(skabelonenErRegistreretOgScorerPaaFormen(skabelon.replace("let score = 50 + 30;", "let score = 50 + 30;\n    if (/resultatopgørelse/i.test(String(ctx.headerRows[2]))) score += 40;"), registry)).toBe(false);
  });
  it("2. e-conomic-XLSX'en uden værnet (den gamle form) falder", () => {
    expect(economicVaernet(economic.replace("if (erMamutKolonner(ctx.headerRows[1])) return 0;\n", ""))).toBe(false);
  });
  it("3. en profil med cost ABS eller equity KEEP, eller en kilde uden «mamut», falder", () => {
    const profil = profiler.slice(profiler.indexOf('profile_id: "mamut_saldo_business_v1"'), profiler.indexOf("// ── Registry ──"));
    expect(profilOgKilde(profiler.replace(profil, profil.replace(/cost_like:\s+NEGATE/, "cost_like:               ABS")), typer, fingerprint)).toBe(false);
    expect(profilOgKilde(profiler.replace(profil, profil.replace(/equity_like:\s+NEGATE/, "equity_like:             KEEP")), typer, fingerprint)).toBe(false);
    expect(profilOgKilde(profiler, typer.replace('"combined_dk" | "mamut" | "unknown"', '"combined_dk" | "unknown"'), fingerprint)).toBe(false);
  });
  it("4. Dækningsbidrag uden 1-tallet, årets resultat uden anti-match, eller skat før ebt med i grupperne, falder", () => {
    expect(grupperneOgKontrolsummen(skabelon.replace('{ key: "daekningsbidrag", pattern: /^dækningsbidrag\\s*1$/i },', '{ key: "daekningsbidrag", pattern: /^dækningsbidrag/i },'))).toBe(false);
    expect(grupperneOgKontrolsummen(skabelon.replace('{ key: "arets_resultat", pattern: /^årets\\s+resultat$/i, anti: /skat\\s+af/i },', '{ key: "arets_resultat", pattern: /årets\\s+resultat/i },'))).toBe(false);
    expect(grupperneOgKontrolsummen(skabelon.replace("if (fordeling.ebtNr !== null && g.nr > fordeling.ebtNr) continue;", ""))).toBe(false);
  });
  it("5. en skabelon der tolker måneden af teksten falder", () => {
    expect(periodenSomTekst(skabelon.replace("report_period_label: periodeTekst,", 'report_period_label: periodeTekst.replace(/december/i, "December 2025"),'))).toBe(false);
    expect(periodenSomTekst(skabelon + '\nconst DK_MONTHS = ["Januar","Februar"];')).toBe(false);
  });
});
