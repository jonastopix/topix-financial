import { describe, expect, it } from "vitest";
import { deriveNextStep, type NextStepInputs } from "../nextStep";

/** Fast "nu": 10. august 2026 → forrige måned = juli 2026 ("2026-07"). */
const NOW = new Date(2026, 7, 10);

/** Deadlines bygges RELATIVT til NOW som absolutte tidsstempler —
    tidszone-uafhængigt (CI kører UTC, lokalt Europe/Copenhagen); jf.
    samme helper i focus.test.ts. */
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 86400000).toISOString();

const base = (overrides: Partial<NextStepInputs> = {}): NextStepInputs => ({
  now: NOW,
  processedPeriodKeys: new Set(["2026-07"]),
  committedPeriodKeys: new Set(["2026-07"]),
  milestones: [],
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
        milestones: [{ title: "Ny hjemmeside", deadline: daysFromNow(2), progress: 50, status: "active" }],
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

  it("3) milestone-deadline inden for 14 dage — nærmeste først", () => {
    const step = deriveNextStep(
      base({
        milestones: [
          { title: "Fjern (parked)", deadline: daysFromNow(1), progress: 10, status: "parked" },
          { title: "Fjern (done)", deadline: daysFromNow(1), progress: 100, status: "active" },
          { title: "Senere", deadline: daysFromNow(10), progress: 40, status: "active" },
          { title: "Nærmest", deadline: daysFromNow(3), progress: 40, status: "active" },
        ],
      }),
    );
    expect(step?.id).toBe("milestone-deadline");
    expect(step?.title).toContain("Nærmest");
    expect(step?.link).toBe("/milestones");
  });

  it("3b) deadlines uden for 14-dages-vinduet (eller overskredet) ignoreres", () => {
    const step = deriveNextStep(
      base({
        hasPulseThisMonth: true,
        milestones: [
          { title: "Grænse-15 (lige uden for vinduet)", deadline: daysFromNow(15), progress: 10, status: "active" },
          { title: "Langt ude", deadline: daysFromNow(52), progress: 10, status: "active" },
          { title: "Overskredet", deadline: daysFromNow(-9), progress: 10, status: "active" },
        ],
      }),
    );
    expect(step).toBeNull();
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
