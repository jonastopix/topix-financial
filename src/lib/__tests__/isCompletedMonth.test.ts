import { describe, it, expect } from "vitest";
import { isCompletedMonth } from "@/lib/financialUtils";

describe("isCompletedMonth", () => {
  // Pin "now" to 2. juni 2026 (måned er 0-indekseret i Date → 5 = juni)
  const now = new Date(2026, 5, 2);

  it("forrige måned er afsluttet (true)", () => {
    expect(isCompletedMonth("2026-05", now)).toBe(true);
  });

  it("indeværende måned er IKKE afsluttet (false)", () => {
    expect(isCompletedMonth("2026-06", now)).toBe(false);
  });

  it("næste måned er IKKE afsluttet (false)", () => {
    expect(isCompletedMonth("2026-07", now)).toBe(false);
  });

  it("måned i et foregående år er afsluttet (true)", () => {
    expect(isCompletedMonth("2025-12", now)).toBe(true);
  });

  // Årsskifte-grænse: bevis at leksikografisk sammenligning ikke har en år-bug
  describe("årsskifte (now = januar 2026)", () => {
    const jan2026 = new Date(2026, 0, 15); // 15. januar 2026

    it("december året før er afsluttet (true)", () => {
      expect(isCompletedMonth("2025-12", jan2026)).toBe(true);
    });

    it("indeværende januar er IKKE afsluttet (false)", () => {
      expect(isCompletedMonth("2026-01", jan2026)).toBe(false);
    });
  });
});
