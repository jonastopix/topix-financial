import { describe, it, expect, vi } from "vitest";

// reportOverrideHelpers importerer Supabase-klienten på modul-niveau; stub den
// væk (samme mønster som parseMetricValue.test.ts). Ingen af de testede
// funktioner bruger klienten.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  canonicalPreviewToDanishInputs,
  parseMetricValue,
  formatMetricValue,
  CANONICAL_TO_DANISH,
} from "../reportOverrideHelpers";

/**
 * REGRESSION for ×100-buggen i "Ret data"-gemmesti.
 *
 * Præcis den fundne visning→gem-sti for et URØRT felt:
 *   1) canonicalPreviewToDanishInputs(preview)  — serialisering til formular-input
 *      (ReportReviewDialog.enterEditMode / reportOverrideHelpers.ts)
 *   2) parseMetricValue(input)                  — parse ved gem (saveManualOverride)
 *
 * De to SKAL være eksakte inverse. Rodårsag: serializer brugte String(value)
 * (US-format, "." = decimal), parseren behandler "." som dansk tusind → strippes.
 */
describe("Ret data visning→gem round-trip (×100 regression)", () => {
  it("round-tripper et urørt 2-decimalers tal uændret (var ×100 før fixet)", () => {
    const preview = { admin_costs: 16984.83 }; // administrationsomkostninger, øre
    const inputs = canonicalPreviewToDanishInputs(preview);
    const daKey = CANONICAL_TO_DANISH.admin_costs;

    const saved = parseMetricValue(inputs[daKey]);

    expect(saved).toBe(16984.83); // var 1698483 (×100) før fixet
  });

  it("round-tripper flere urørte felter uændret gennem visning→gem", () => {
    const preview = {
      revenue: 2500000.75, // 2 decimaler → var ×100
      payroll: 84250.5, //    1 decimal   → var ×10
      admin_costs: 16984.83,
      cash: 13204, //         heltal       → var aldrig ramt
      ebt: -125000.5, //      negativ decimal
    };
    const inputs = canonicalPreviewToDanishInputs(preview);
    const roundTrip = (enKey: keyof typeof preview) =>
      parseMetricValue(inputs[CANONICAL_TO_DANISH[enKey]]);

    expect(roundTrip("revenue")).toBe(2500000.75);
    expect(roundTrip("payroll")).toBe(84250.5);
    expect(roundTrip("admin_costs")).toBe(16984.83);
    expect(roundTrip("cash")).toBe(13204);
    expect(roundTrip("ebt")).toBe(-125000.5);
  });

  it("bevarer float-artefakt uændret (oprydning er out of scope, men må ikke korrumperes)", () => {
    const preview = { admin_costs: 16984.829999999998 };
    const inputs = canonicalPreviewToDanishInputs(preview);
    const saved = parseMetricValue(inputs[CANONICAL_TO_DANISH.admin_costs]);
    // Værdien round-trippes eksakt — hverken ×100 eller afrundet.
    expect(saved).toBe(16984.829999999998);
  });
});

/**
 * formatMetricValue er den eksakte INVERS af parseMetricValue. Disse tests er
 * kontrakten for det par — de dokumenterer bl.a. at heltalsstien ALDRIG var ramt
 * (formatMetricValue(13204) === "13204", identisk med den gamle String(13204)).
 */
describe("formatMetricValue ↔ parseMetricValue (invers par)", () => {
  it("round-tripper heltal identisk (heltalsstien var aldrig ramt)", () => {
    expect(formatMetricValue(13204)).toBe("13204");
    expect(parseMetricValue("13204")).toBe(13204);
    expect(parseMetricValue(formatMetricValue(13204))).toBe(13204);
  });

  it("serialiserer decimaltal med dansk komma", () => {
    expect(formatMetricValue(16984.83)).toBe("16984,83");
    expect(parseMetricValue(formatMetricValue(16984.83))).toBe(16984.83);
  });

  it("håndterer negative tal og nul", () => {
    expect(formatMetricValue(-2500000.5)).toBe("-2500000,5");
    expect(parseMetricValue(formatMetricValue(-2500000.5))).toBe(-2500000.5);
    expect(formatMetricValue(0)).toBe("0");
    expect(parseMetricValue(formatMetricValue(0))).toBe(0);
  });

  it("serialiserer null/undefined/NaN til tom streng (tomt input)", () => {
    expect(formatMetricValue(null)).toBe("");
    expect(formatMetricValue(undefined)).toBe("");
    expect(formatMetricValue(Number.NaN)).toBe("");
    expect(parseMetricValue(formatMetricValue(null))).toBeNull();
  });
});

/**
 * Redigerede felter (brugeren taster selv) gemmes korrekt gennem parseMetricValue
 * med både komma-decimal og punktum-som-tusind — parseren er uændret af fixet.
 */
describe("Ret data — redigeret felt gemmes korrekt", () => {
  it("accepterer komma-decimal input", () => {
    expect(parseMetricValue("13.204,50")).toBe(13204.5);
    expect(parseMetricValue("84250,5")).toBe(84250.5);
  });

  it("accepterer punktum-som-tusindtalsseparator", () => {
    expect(parseMetricValue("2.500.000")).toBe(2500000);
    expect(parseMetricValue("13.204")).toBe(13204);
  });

  it("accepterer negative (minus og parentes) og nul/tomt", () => {
    expect(parseMetricValue("-2.500.000,50")).toBe(-2500000.5);
    expect(parseMetricValue("(2.500.000)")).toBe(-2500000);
    expect(parseMetricValue("0")).toBe(0);
    expect(parseMetricValue("")).toBeNull();
  });
});
