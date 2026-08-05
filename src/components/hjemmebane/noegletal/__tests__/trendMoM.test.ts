import { describe, expect, it } from "vitest";
import { deriveMoMChange } from "../trendMoM";

describe("deriveMoMChange — trend-M/M-dommen", () => {
  it("op: seneste over forrige", () => {
    const change = deriveMoMChange([100, 110]);
    expect(change.direction).toBe("up");
    expect(change.pct).toBeCloseTo(10);
  });

  it("ned: seneste under forrige", () => {
    const change = deriveMoMChange([100, 80]);
    expect(change.direction).toBe("down");
    expect(change.pct).toBeCloseTo(-20);
  });

  it("flat: |ændring| < 1 % (arvet grænse)", () => {
    const change = deriveMoMChange([1000, 1005]);
    expect(change.direction).toBe("flat");
    expect(change.pct).toBeCloseTo(0.5);
  });

  it("<2 punkter → flat uden pct", () => {
    expect(deriveMoMChange([100])).toEqual({ direction: "flat", pct: null });
    expect(deriveMoMChange([])).toEqual({ direction: "flat", pct: null });
  });

  it("prev = 0 → flat uden pct (ingen division)", () => {
    expect(deriveMoMChange([0, 50])).toEqual({ direction: "flat", pct: null });
  });
});
