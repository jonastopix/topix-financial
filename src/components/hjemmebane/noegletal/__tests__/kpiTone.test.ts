import { describe, expect, it } from "vitest";
import { deriveKpiTone } from "../kpiTone";

describe("deriveKpiTone — målopfyldelses-dommen", () => {
  it("hit (normal retning): actual ≥ target → quiet", () => {
    const view = deriveKpiTone({ actual: 120, target: 100, lowerIsBetter: false });
    expect(view.state).toBe("hit");
    expect(view.tone).toBe("quiet");
    expect(view.pct).toBe(120);
  });

  it("near (normal retning): ≥85 % men ikke nået → attention", () => {
    const view = deriveKpiTone({ actual: 90, target: 100, lowerIsBetter: false });
    expect(view.state).toBe("near");
    expect(view.tone).toBe("attention");
  });

  it("off (normal retning): <85 % → attention", () => {
    const view = deriveKpiTone({ actual: 60, target: 100, lowerIsBetter: false });
    expect(view.state).toBe("off");
    expect(view.tone).toBe("attention");
  });

  it("grænsen: præcis 85 % dømmes near (ikke off)", () => {
    const view = deriveKpiTone({ actual: 85, target: 100, lowerIsBetter: false });
    expect(view.state).toBe("near");
  });

  it("hit (lowerIsBetter): actual ≤ target → quiet", () => {
    const view = deriveKpiTone({ actual: 80, target: 100, lowerIsBetter: true });
    expect(view.state).toBe("hit");
    expect(view.tone).toBe("quiet");
  });

  it("off (lowerIsBetter): markant over målet → attention", () => {
    const view = deriveKpiTone({ actual: 130, target: 100, lowerIsBetter: true });
    expect(view.state).toBe("off");
    expect(view.tone).toBe("attention");
  });

  it("no_target: manglende actual eller target → quiet uden pct", () => {
    expect(deriveKpiTone({ actual: null, target: 100, lowerIsBetter: false }).state).toBe("no_target");
    expect(deriveKpiTone({ actual: 50, target: null, lowerIsBetter: false }).state).toBe("no_target");
    expect(deriveKpiTone({ actual: 50, target: null, lowerIsBetter: false }).pct).toBeNull();
  });

  it("ugyldigt target (≤0) afvises som no_target", () => {
    expect(deriveKpiTone({ actual: 50, target: 0, lowerIsBetter: false }).state).toBe("no_target");
    expect(deriveKpiTone({ actual: 50, target: -10, lowerIsBetter: true }).state).toBe("no_target");
  });
});
