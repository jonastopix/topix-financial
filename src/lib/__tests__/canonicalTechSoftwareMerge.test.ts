import { describe, it, expect } from "vitest";
// Parity/cross-boundary import (samme mønster som membershipTier.test.ts): vi
// tester den delte Deno-motor direkte fra vitest, så CI (bun run test) dækker
// den. engine_test.ts er Deno-only og køres IKKE i CI.
import { normalizeToCanonical } from "../../../supabase/functions/_shared/canonicalEngine.ts";

/**
 * Regression + guard for tech_software_merged_into_admin.
 *
 * Reglen lagde tech_software UBETINGET oveni admin_costs. Når software-konti
 * ligger inde i admin-sektionen (e-conomic), er de allerede i admin-totalen →
 * dobbelttælling (Topix, juni: 13204,82 + 668,24 = 13873,06 i correction_log).
 *
 * Fixet: komparativ afstemning mod stated P&L-result. Fold KUN hvis
 * delta_med < delta_uden (inklusion af tech bringer det rekonstruerede resultat
 * TÆTTERE på stated result). Finansposter forurener begge grene ens (de adskiller
 * sig med præcis tech_software), så ingen absolut tolerance. Fallback = legacy
 * fold når GP eller stated result mangler.
 */
describe("tech_software_merged_into_admin — reconciliation-guarded fold", () => {
  // (a) FAKTISK Topix-scenarie: admin (13204,82) INKLUDERER allerede software
  // (668,24). Stated result 1970,49 bærer +175,31 finansposter over driftsresultatet
  // (1795,18), så delta_uden = 175,31, delta_med = 843,55 → skip.
  const topix = {
    report_type: "resultatopgørelse",
    key_figures: {
      omsaetning: 100000,
      direkte_omkostninger: 30000,
      daekningsbidrag: 70000,
      loenninger: 40000,
      marketing: 5000,
      lokaler: 8000,
      admin: 13204.82, // sektionstotal — INKLUDERER allerede software (668,24)
      afskrivninger: 2000,
      tech_software: 668.24, // samme 668,24, udtrukket separat
      resultat_foer_skat: 1970.49, // driftsresultat 1795,18 + 175,31 finansposter
    },
    line_items: [
      { name: "Kontorartikler", period_amount: -400, ytd_amount: -400, raw_sign: "MINUS", account_no: "3601", class: "OPEX" },
      { name: "Software abonnementer", period_amount: -50.29, ytd_amount: -50.29, raw_sign: "MINUS", account_no: "3604", class: "OPEX" },
      { name: "Software licenser", period_amount: -25.0, ytd_amount: -25.0, raw_sign: "MINUS", account_no: "3605", class: "OPEX" },
      { name: "Hosting / cloud", period_amount: -592.95, ytd_amount: -592.95, raw_sign: "MINUS", account_no: "3606", class: "OPEX" },
    ],
  };

  it("(a) skipper fold når software allerede er i admin-totalen (var 13873,06)", () => {
    const { metrics, correction_log } = normalizeToCanonical(topix, "ai_extraction");
    expect(metrics.admin_costs).toBe(13204.82);

    const entry = correction_log.find((c) => c.field === "tech_software");
    expect(entry?.rule).toBe("tech_software_merge_skipped_double_count");
    // Auditerbar: begge deltaer i beslutningen.
    expect(entry?.reason).toContain("delta_med");
    expect(entry?.reason).toContain("delta_uden");
  });

  // (b) SYNTETISK separat-tech: admin (12000) INDEHOLDER IKKE software; tech er
  // reelt additiv. Stated result 2350 ligger tættest på med-tech-grenen → merge.
  // Beskytter reglens oprindelige formål. (Rene heltal → ingen float-støj.)
  const separateTech = {
    report_type: "resultatopgørelse",
    key_figures: {
      omsaetning: 100000,
      direkte_omkostninger: 30000,
      daekningsbidrag: 70000,
      loenninger: 40000,
      marketing: 5000,
      lokaler: 8000,
      admin: 12000, // EKSKLUDERER software
      afskrivninger: 2000,
      tech_software: 700,
      // expected_uden = 70000-65000-2000 = 3000 ; expected_med = 2300
      resultat_foer_skat: 2350, // tættest på 2300 → merge
    },
    line_items: [],
  };

  it("(b) folder stadig når tech er en separat, additiv post", () => {
    const { metrics, correction_log } = normalizeToCanonical(separateTech, "ai_extraction");
    expect(metrics.admin_costs).toBe(12700); // 12000 + 700

    const entry = correction_log.find((c) => c.field === "tech_software");
    expect(entry?.rule).toBe("tech_software_merged_into_admin");
  });

  // (c) FALLBACK: intet stated result → kan ikke afstemme → behold legacy fold.
  const noStatedResult = {
    report_type: "resultatopgørelse",
    key_figures: {
      omsaetning: 100000,
      direkte_omkostninger: 30000,
      daekningsbidrag: 70000,
      loenninger: 40000,
      admin: 13204.82,
      afskrivninger: 2000,
      tech_software: 668.24,
      // resultat_foer_skat udeladt bevidst
    },
    line_items: [],
  };

  it("(c) falder tilbage til legacy fold når stated result mangler", () => {
    const { metrics, correction_log } = normalizeToCanonical(noStatedResult, "ai_extraction");
    expect(metrics.admin_costs).toBe(13873.06); // 13204,82 + 668,24 (legacy)

    const entry = correction_log.find((c) => c.field === "tech_software");
    expect(entry?.rule).toBe("tech_software_merged_into_admin");
    expect(entry?.reason).toContain("reconciliation unavailable");
    expect(entry?.confidence).toBe("MEDIUM");
  });
});
