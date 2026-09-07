import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Driftværn (7/9): ALLE fire skriveveje til financial_report_facts.metrics
// skriver omkostninger POSITIVT. Målt i prod 7/9: annual_report 24/132 og
// manual 16/67 rækker negative, canonical/v2 nul. Læserne er immune (abs),
// men virksomhedssidens rapporttal, nøgletalsgrafen og agentens payroll_pct
// læser råt. Værnet læser kilden (kildelæsende, husets form), fordi tre af
// vejene er Deno/SQL-kode uden ren funktion at kalde fra vitest:
//   1) manuel vej: saveManualOverride → positiveOmkostninger FØR afledning
//   2) årsrapport-vej: extract-annual-report → normaliserAarsrapport (regel 1: abs)
//   3) baseline-vej: save-annual-baseline → Math.abs på payroll
//   4) månedsvej: normalizationProfiles → cost_like er ABS i hver profil

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("omkostningernes fortegn — alle fire skriveveje skriver positivt", () => {
  it("manuel vej: saveManualOverride kører positiveOmkostninger FØR computeDerivedMetrics", () => {
    const k = udenKommentarer(laes("src/lib/reportOverrideHelpers.ts"));
    expect(k).toContain('from "@/lib/omkostningsFortegn"');
    const start = k.indexOf("export async function saveManualOverride");
    expect(start).toBeGreaterThan(-1);
    const fn = k.slice(start, k.indexOf("\n}\n", start));
    const iPos = fn.indexOf("positiveOmkostninger(");
    const iDer = fn.indexOf("computeDerivedMetrics(");
    expect(iPos, "positiveOmkostninger kaldes ikke i saveManualOverride").toBeGreaterThan(-1);
    expect(iDer).toBeGreaterThan(-1);
    expect(iPos, "afledningen skal regne på de positive tal").toBeLessThan(iDer);
  });

  it("årsrapport-vej: extract-annual-report går gennem normaliserAarsrapport, og regel 1 abs'er de fire omkostningsnøgler", () => {
    const vej = udenKommentarer(laes("supabase/functions/extract-annual-report/index.ts"));
    expect(vej).toContain("normaliserAarsrapport(");
    expect(vej, "payroll skal komme fra motorens vaerdier, ikke fra AI'ens råtal").toMatch(/payroll:\s*monthly\(vaerdier\.payroll\)/);
    expect(vej).toMatch(/depreciation:\s*monthly\(vaerdier\.depreciation\)/);
    const motor = udenKommentarer(laes("supabase/functions/_shared/aarsrapportNormalisering.ts"));
    for (const n of ["cogs", "payroll", "depreciation", "admin_costs"]) {
      expect(motor, `${n} abs'es ikke i normaliserAarsrapport`).toMatch(new RegExp(`absEllerNull\\(input\\.${n}\\)`));
    }
    expect(motor).toContain("Math.abs(n)");
  });

  it("baseline-vej: save-annual-baseline skriver payroll som |beløb|", () => {
    const k = udenKommentarer(laes("supabase/functions/save-annual-baseline/index.ts"));
    expect(k, "payroll gemmes som tastet — minus følger med").toMatch(/const pay = [^\n]*Math\.abs\(Number\(payroll\)\)/);
  });

  // Månedsvejens profiler ender ALLE i positiv konvention, men ad tre regler:
  // ABS (kilden kan have begge fortegn), NEGATE (kilden er negativ — vendes
  // positiv; combined_dk_business_v1: «costs are negative → negate to positive
  // bucket»), og KEEP for én profil hvis kilde allerede er positiv
  // (economic_pnl_business_v1: «values already positive-means-positive»).
  // KEEP er den eneste regel der IKKE selv sikrer fortegnet — derfor står
  // den som navngiven undtagelse: en NY profil med KEEP fejler her.
  it("månedsvej: cost_like er ABS eller NEGATE i hver profil — KEEP kun i den ene navngivne", () => {
    const raa = laes("supabase/functions/_shared/normalizationProfiles.ts");
    const k = udenKommentarer(raa);
    const KEEP_UNDTAGELSE = "economic_pnl_business_v1";
    // Hver cost_like-regel parres med den NÆRMESTE foregående profile_id —
    // uafhængigt af hvordan filen ellers er delt op.
    const regler = [...k.matchAll(/cost_like:\s*([A-Z_]+)/g)];
    expect(regler.length, "ingen profiler fundet").toBeGreaterThanOrEqual(4);
    for (const m of regler) {
      const foer = k.slice(0, m.index);
      const ider = [...foer.matchAll(/profile_id:\s*"([^"]+)"/g)];
      const id = ider.at(-1)?.[1] ?? "?";
      const regel = m[1];
      if (id === KEEP_UNDTAGELSE) {
        expect(regel, `${id}: undtagelsen forudsætter KEEP`).toBe("KEEP");
        expect(raa, `${id}: beskrivelsen skal sige at kilden allerede er positiv`).toMatch(/economic_pnl_business_v1[\s\S]{0,300}already positive/);
      } else {
        expect(["ABS", "NEGATE"], `${id}: cost_like er ${regel} — skriver omkostninger med et andet fortegn`).toContain(regel);
      }
    }
  });
});
