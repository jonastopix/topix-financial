import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (17/9-2026, recon-saldobalance-fortegn.md — omskrevet efter de originale filer):
// resultatet fra e-conomics saldobalance-XLSX er −Σ «Perioden» over ALLE resultatkonti 1000–4999
// (saldobalancens egen sandhed), hver resultatkonto tæller i præcis én gruppe (øvrige tager resten),
// en gruppe hvis netto er en indtægt bliver «andre driftsindtægter», afskrivninger læses ikke fra
// balancen, og de afledte resultatlinjer beholder deres fortegn. Alle læsere der summerer
// omkostninger går gennem ÉN fælles funktion (omkostningsnoegler). Målt i prod 17/9 før rettelsen:
// Fjeldgaardshop 2025-10 ebt +241.813 hvor saldobalancen siger +150.932,87.
//
// SELVBEVIS: hvert værn tjekker først at det finder det det leder efter.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const PROFILER = "supabase/functions/_shared/normalizationProfiles.ts";
const SKABELON = "supabase/functions/_shared/templates/dkEconomicSaldobalanceXlsxV1.ts";
const MOTOR = "supabase/functions/_shared/canonicalEngine.ts";

function profilBlok(kilde: string, id: string): string {
  const start = kilde.indexOf(`profile_id: "${id}"`);
  expect(start, `profilen ${id} findes ikke`).toBeGreaterThan(-1);
  const naeste = kilde.indexOf("profile_id:", start + 1);
  return kilde.slice(start, naeste === -1 ? undefined : naeste);
}

describe("saldobalance — resultatet er saldobalancens egen sandhed", () => {
  it("skabelonen: ebt = −Σ periode over resultatkontiene (fordelResultatkonti), ingen Math.abs i summen, ingen 5100–5200 i resultatgrupperne", () => {
    const k = udenKommentarer(laes(SKABELON));
    const fn = k.slice(k.indexOf("export function fordelResultatkonti"), k.indexOf("\n}\n", k.indexOf("export function fordelResultatkonti")));
    expect(fn.length, "fordelResultatkonti findes ikke").toBeGreaterThan(100);
    expect(fn).toContain("const ebt = -sum;");
    expect(fn).not.toMatch(/Math\.abs/);
    expect(k).toContain("export const PNL_MIN = 1000;");
    expect(k).toContain("export const PNL_MAX = 4999;");
    const grupper = k.slice(k.indexOf("const PNL_GROUPS"), k.indexOf("];", k.indexOf("const PNL_GROUPS")));
    expect(grupper).toContain('key: "omsaetning"');
    expect(grupper, "balancens 5100–5200 må ikke stå som resultatgruppe").not.toMatch(/min: 5100/);
    expect(grupper).not.toMatch(/afskrivninger/);
    // Resultatkandidaten er business-konvention med −Σ som kilde
    expect(k).toContain('source_label: "derived:ebt (−Σ period over all P&L accounts 1000-4999)"');
  });

  it("skabelonen: kontrolsummen pnl_coverage FAIL'er med afvigelse og konti uden gruppe; tolerance 1 kr.", () => {
    const k = udenKommentarer(laes(SKABELON));
    expect(k).toContain("export const KONTROLSUM_TOLERANCE = 1;");
    expect(k).toContain('name: "pnl_coverage"');
    expect(k).toMatch(/accounts without group: \$\{fordeling\.udenGruppe\.join/);
  });

  it("skabelonen: en kredit-gruppe bliver andre_driftsindtaegter (kredit-kandidat → NEGATE → positiv), omkostningsgruppen er den positive del", () => {
    const k = udenKommentarer(laes(SKABELON));
    expect(k).toContain('export const ANDRE_DRIFTSINDTAEGTER_KEY = "andre_driftsindtaegter";');
    expect(k).toContain("raw_value: -fordeling.andreDriftsindtaegter");
    expect(k).toMatch(/if \(v >= 0\) omkostninger\[key\] = v;\s*else \{ omkostninger\[key\] = 0; andre \+= -v; \}/);
  });

  it("profilen: afledte resultatlinjer keep (ingen abs), revenue_like negate; ingen profil abs'er en afledt resultatlinje", () => {
    const k = udenKommentarer(laes(PROFILER));
    const blok = profilBlok(k, "economic_saldobalance_credit_v1");
    for (const felt of ["daekningsbidrag", "resultat_foer_skat", "ebitda", "resultat_efter_skat"]) {
      expect(blok, `${felt} skal være KEEP_DERIVED`).toMatch(new RegExp(`${felt}:\\s*KEEP_DERIVED`));
    }
    expect(k).toMatch(/const KEEP_DERIVED: NormalizationRule = \{ action: "keep"/);
    expect(blok).toMatch(/revenue_like:\s*NEGATE/);
    const ids = [...k.matchAll(/profile_id:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(5);
    for (const id of ids) {
      const b = profilBlok(k, id);
      const overrides = b.slice(b.indexOf("field_overrides"));
      expect(overrides.match(/(daekningsbidrag|resultat_foer_skat|ebitda|resultat_efter_skat|arets_resultat|periodens_resultat):\s*\{[^}]*action:\s*"abs"/), id).toBeNull();
    }
  });

  it("motoren: de to nye nøgler findes i typen og i source→canonical-mappet; tjek 17 derived_sign_preserved med fortegnsspor", () => {
    const typer = udenKommentarer(laes("supabase/functions/_shared/canonicalTypes.ts"));
    expect(typer).toContain("other_costs: number | null;");
    expect(typer).toContain("other_operating_income: number | null;");
    const k = udenKommentarer(laes(MOTOR));
    expect(k).toContain('oevrige_omkostninger: "other_costs"');
    expect(k).toContain('andre_driftsindtaegter: "other_operating_income"');
    expect(k).toContain('name: "derived_sign_preserved", result: "FAIL"');
    expect(k).toMatch(/signTrail\?: readonly DerivedSignTrailEntry\[\]/);
    expect(k.slice(k.indexOf("export function buildCanonicalFromSemantic"))).toMatch(/runExtendedValidation\([\s\S]{0,200}aiChecks, signTrail\s*\)/);
    // Fortegnsdommen og cost_lines_present kender other_costs
    expect(k).toMatch(/SIGN_LOCKED_COSTS[\s\S]{0,300}"other_costs"/);
  });
});

describe("saldobalance — alle læsere der summerer omkostninger går gennem omkostningsnoegler", () => {
  const laesere: { fil: string; import: RegExp; brug: RegExp; forbudt?: RegExp }[] = [
    { fil: "src/lib/financialUtils.ts", import: /from "@\/lib\/omkostningsnoegler"/, brug: /return omkostningerIAlt\(kf, DANSK\);/, forbudt: /Math\.abs\(kf\.afskrivninger/ },
    { fil: "src/components/CombinedBudgetWidget.tsx", import: /calcTotalExpenses/, brug: /const actualExpenses = calcTotalExpenses\(kf\);/, forbudt: /Math\.abs\(kf\.loenninger/ },
    { fil: "src/components/hjemmebane/budget/HbBudgetBva.tsx", import: /from "@\/lib\/omkostningsnoegler"/, brug: /sumOmkostninger\(actualsMap\[i\], DANSK, "vareforbrug_og_drift"\)\.sum - andreDriftsindtaegter\(/, forbudt: /\["administrationsomkostninger"\] \?\? 0\)/ },
    { fil: "src/lib/budgetAktualer.ts", import: /from "@\/lib\/omkostningsnoegler"/, brug: /omkostningsnoegler\(DANSK, "vareforbrug_og_drift"\)/, forbudt: /"lokaleomkostninger",\s*\n\s*"administrationsomkostninger",\s*\n\s*"direkte_omkostninger",/ },
    { fil: "src/lib/reportOverrideHelpers.ts", import: /from "@\/lib\/omkostningsnoegler"/, brug: /ebitdaRegnet\(db, metrics, DANSK\)/, forbudt: /\(metrics\.lokaleomkostninger \|\| 0\)/ },
    { fil: "src/lib/omkostningsFortegn.ts", import: /from "@\/lib\/omkostningsnoegler"/, brug: /omkostningsnoegler\(DANSK, "alle"\)/ },
    { fil: "supabase/functions/_shared/weeklyFocusKpi.ts", import: /from "\.\/omkostningsnoegler\.ts"/, brug: /sumOmkostninger\(m, OMK, "alle"\)/, forbudt: /m\.facility_costs, m\.admin_costs, m\.depreciation/ },
    { fil: "supabase/functions/_shared/canonicalEngine.ts", import: /from "\.\/omkostningsnoegler\.ts"/, brug: /ebitdaRegnet\(metrics\.gross_profit, metrics, OMK\)/, forbudt: /\(metrics\.facility_costs \|\| 0\) \+ \(metrics\.admin_costs \|\| 0\);\s*\n\s*if \(opex > 0\)/ },
    { fil: "supabase/functions/_shared/rimelighed.ts", import: /from "\.\/omkostningsnoegler\.ts"/, brug: /ebtRegnet\(grossProfit, m, OMK\)/ },
    { fil: "src/lib/rimelighed.ts", import: /from "\.\/omkostningsnoegler\.ts"/, brug: /ebtRegnet\(grossProfit, m, OMK\)/ },
    { fil: "supabase/functions/auto-create-baseline-budget/index.ts", import: /other_costs/, brug: /\(metrics\.admin_costs \?\? 0\) \+ \(metrics\.other_costs \?\? 0\)/ },
  ];
  for (const l of laesere) {
    it(`${l.fil}`, () => {
      const k = udenKommentarer(laes(l.fil));
      expect(k, "importerer ikke det fælles modul").toMatch(l.import);
      expect(k, "bruger ikke det fælles regnestykke").toMatch(l.brug);
      if (l.forbudt) expect(k, "den gamle lokale liste står der stadig").not.toMatch(l.forbudt);
    });
  }
  it("motoren regner ebitda gennem det fælles modul alle tre steder (AI-vejen, den semantiske og tjek 4 ebitda_calculation)", () => {
    const k = udenKommentarer(laes(MOTOR));
    expect(k.match(/ebitdaRegnet\(metrics\.gross_profit, metrics, OMK\)/g)?.length).toBe(3);
    expect(k).not.toMatch(/const opex = \(metrics\.payroll \|\| 0\)/);
  });
});

describe("saldobalance — de to nye nøgler kendes overalt hvor nøgler regnes op", () => {
  const steder: { fil: string; moenstre: RegExp[] }[] = [
    { fil: "src/lib/factsAdapter.ts", moenstre: [/other_costs: "oevrige_omkostninger"/, /other_operating_income: "andre_driftsindtaegter"/] },
    { fil: "src/lib/reportOverrideHelpers.ts", moenstre: [/"oevrige_omkostninger",\s*\n\s*"andre_driftsindtaegter",/, /other_costs: "oevrige_omkostninger"/, /oevrige_omkostninger: "Øvrige omkostninger"/, /andre_driftsindtaegter: "Andre driftsindtægter"/] },
    { fil: "src/lib/financialUtils.ts", moenstre: [/oevrige_omkostninger: m\.other_costs \?\? null/, /andre_driftsindtaegter: mnd\.metrics\.andre_driftsindtaegter \?\? null/] },
    { fil: "src/components/ReportReviewDialog.tsx", moenstre: [/other_costs: "Øvrige omkostninger"/, /other_operating_income: "Andre driftsindtægter"/] },
    { fil: "supabase/functions/extract-financial-data/index.ts", moenstre: [/other_costs: "oevrige_omkostninger"/, /other_operating_income: "andre_driftsindtaegter"/] },
    { fil: "supabase/functions/validate-facts-parity/index.ts", moenstre: [/other_costs: "oevrige_omkostninger"/, /oevrige_omkostninger: "other_costs"/] },
    { fil: "supabase/functions/_shared/extractionCompare.ts", moenstre: [/"other_costs", "other_operating_income"/] },
    { fil: "supabase/functions/ai-financial-feedback/index.ts", moenstre: [/"other_costs", "other_operating_income"/, /other_operating_income: Andre driftsindtægter/] },
    // Databasen: de to nøgler står i den fælles liste (kanoniske_noegler-seeden), som resolveren slår op i.
    { fil: "supabase/migrations/20260918170000_kanoniske_noegler_faelles_liste.sql", moenstre: [/\('other_costs', 'oevrige_omkostninger', 'omkostning'/, /\('other_operating_income', 'andre_driftsindtaegter', 'indtaegt'/] },
  ];
  for (const s of steder) {
    it(s.fil, () => {
      const k = laes(s.fil);
      for (const m of s.moenstre) expect(k, String(m)).toMatch(m);
    });
  }
  it("resolveren har ingen fast nøgleliste længere — V2 og V1 slår op i kanoniske_noegler (kanoniskeNoegler.guard holder listen mod typen)", () => {
    const k = laes("supabase/migrations/20260918170000_kanoniske_noegler_faelles_liste.sql").replace(/--[^\n]*/g, "");
    expect(k).not.toMatch(/IN \('revenue'/);
    expect(k.match(/EXISTS \(SELECT 1 FROM public\.kanoniske_noegler kn WHERE kn\.noegle = _k\)/g)?.length).toBe(2);
  });
});
