import { describe, expect, it } from "vitest";
import { deriveNextStep, type NextStepInputs } from "../nextStep";

/** Fast "nu": 10. august 2026 → forrige måned = juli 2026 ("2026-07"). */
const NOW = new Date(2026, 7, 10);

/* Milepæls-kilden (slot (e), «milestone-deadline») er UDE siden «Én plan»
   fase 3 (16/9): målet står i forsidens «Dine mål», ikke i fokuskortet.
   Testene 3/3b er fjernet med vilje. */

const base = (overrides: Partial<NextStepInputs> = {}): NextStepInputs => ({
  now: NOW,
  processedPeriodKeys: new Set(["2026-07"]),
  committedPeriodKeys: new Set(["2026-07"]),
  hasPulseThisMonth: true,
  ...overrides,
});

describe("deriveNextStep — prioriteringen fra ActionCenter", () => {
  it("1) rapport mangler slår alt andet", () => {
    const step = deriveNextStep(
      base({
        processedPeriodKeys: new Set(),
        committedPeriodKeys: new Set(),
        hasPulseThisMonth: false,
      }),
    );
    expect(step?.id).toBe("missing-report");
    expect(step?.title).toBe("Upload dine juli-tal");
    expect(step?.link).toBe("/reports");
  });

  it("2) uploadet men ikke godkendt → godkend", () => {
    const step = deriveNextStep(base({ committedPeriodKeys: new Set() }));
    expect(step?.id).toBe("pending-approval");
    expect(step?.link).toBe("/reports");
  });

  it("4) pulse-nudge kun når rapporten er godkendt", () => {
    const step = deriveNextStep(base({ hasPulseThisMonth: false }));
    expect(step?.id).toBe("pulse");
    expect(step?.link).toBe("/pulse");
  });

  it("5) alt ajour → null", () => {
    expect(deriveNextStep(base())).toBeNull();
  });

  it("årsskifte: januar peger på december året før", () => {
    const step = deriveNextStep(
      base({ now: new Date(2027, 0, 5), processedPeriodKeys: new Set(), committedPeriodKeys: new Set() }),
    );
    expect(step?.id).toBe("missing-report");
    expect(step?.title).toBe("Upload dine december-tal");
  });
});
