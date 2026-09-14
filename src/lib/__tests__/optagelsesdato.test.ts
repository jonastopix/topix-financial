import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { optagelsesLabel } from "@/lib/optagelsesdato";

// «Optaget …» på kreativen kommer fra kontraktens start, aldrig fra dagens dato.

describe("optagelsesLabel — kontraktens start, ikke now()", () => {
  it("«YYYY-MM-DD» → «måned år» med lille begyndelsesbogstav", () => {
    expect(optagelsesLabel("2026-03-01")).toBe("marts 2026");
    expect(optagelsesLabel("2025-11-14")).toBe("november 2025");
    expect(optagelsesLabel("2027-01-31")).toBe("januar 2027");
  });
  it("et ISO-tidsstempel (periode_start fra Stripe) læses på år og måned alene", () => {
    expect(optagelsesLabel("2026-03-01T00:00:00+00:00")).toBe("marts 2026");
    expect(optagelsesLabel("2026-12-31T23:30:00Z")).toBe("december 2026");
  });
  it("tomt eller ugyldigt → null, aldrig en gættet måned", () => {
    for (const v of [null, undefined, "", "   ", "ukendt", "14/9-2026", "2026-13-01", "2026-00-10"]) {
      expect(optagelsesLabel(v), String(v)).toBeNull();
    }
  });
  it("KILDEVÆRN: funktionen kender ikke dagens dato, og DelingView regner ikke længere dateLabel af new Date()", () => {
    const lib = readFileSync("src/lib/optagelsesdato.ts", "utf8");
    expect(lib).not.toMatch(/new Date\(\)|Date\.now/);
    const view = readFileSync("src/components/hjemmebane/deling/DelingView.tsx", "utf8");
    expect(view).not.toMatch(/dateLabel\(new Date\(\)\)/);
    expect(view).toContain("contract_start_date");
  });
});
