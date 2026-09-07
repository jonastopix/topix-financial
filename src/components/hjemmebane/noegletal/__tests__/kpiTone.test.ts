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

  // En dom kræver et aftalt mål (7/9). CARMA: 106.096 mod standard < 80.000
  // stod i rust — nu stille, uden pct, men målet er der stadig at vise.
  it("standardmål (kilde «standard»): ingen dom — state standard, quiet, pct null, selv når tallet er langt fra målet", () => {
    const view = deriveKpiTone({ actual: 106_096, target: 80_000, lowerIsBetter: true, kilde: "standard" });
    expect(view.state).toBe("standard");
    expect(view.tone).toBe("quiet");
    expect(view.pct).toBeNull();
    expect(deriveKpiTone({ actual: 60, target: 100, lowerIsBetter: false, kilde: "standard" }).tone).toBe("quiet");
  });

  it("aftalt mål (kilde «aftalt»): dømmer præcis som før", () => {
    const view = deriveKpiTone({ actual: 106_096, target: 80_000, lowerIsBetter: true, kilde: "aftalt" });
    expect(view.state).toBe("off");
    expect(view.tone).toBe("attention");
    expect(deriveKpiTone({ actual: 120, target: 100, lowerIsBetter: false, kilde: "aftalt" })).toEqual({ state: "hit", tone: "quiet", pct: 120 });
  });

  it("ukendt kilde (undefined/null — ældre hentning): dømmer som før, ukendt er ikke standard", () => {
    expect(deriveKpiTone({ actual: 60, target: 100, lowerIsBetter: false }).state).toBe("off");
    expect(deriveKpiTone({ actual: 60, target: 100, lowerIsBetter: false, kilde: null }).state).toBe("off");
  });

  it("standardmål uden tal eller uden gyldigt mål er stadig no_target — ikke standard", () => {
    expect(deriveKpiTone({ actual: null, target: 100, lowerIsBetter: false, kilde: "standard" }).state).toBe("no_target");
    expect(deriveKpiTone({ actual: 50, target: 0, lowerIsBetter: false, kilde: "standard" }).state).toBe("no_target");
  });
});
