import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as srcModul from "@/lib/omkostningsnoegler";
import * as denoModul from "../../../supabase/functions/_shared/omkostningsnoegler.ts";

// Paritet src/lib ↔ _shared (17/9-2026): samme mønster som rimelighedParitet — kroppen er ordret ens,
// filhovedet er den eneste forskel, og hvert regnestykke giver det samme for de samme input.
const inputs: { m: Record<string, number | null>; db: number | null }[] = [
  { m: { cogs: 55000, payroll: 40000, sales_costs: 8000, facility_costs: 0, admin_costs: 10200, other_costs: 3600, other_operating_income: 15500, depreciation: 0, financial_costs: 900 }, db: 143500 },
  { m: { payroll: -30000, sales_costs: -5000, financial_costs: -1000 }, db: 60000 },
  { m: {}, db: null },
  { m: { other_operating_income: 20 }, db: 100 },
];

describe("omkostningsnoegler — parity between src/lib and supabase/functions/_shared", () => {
  it("nøglesættene er ens", () => {
    expect(denoModul.CANONICAL).toEqual(srcModul.CANONICAL);
    expect(denoModul.DANSK).toEqual(srcModul.DANSK);
    expect(denoModul.ANDEL_NOEGLER_TIL_RIMELIGHED).toEqual(srcModul.ANDEL_NOEGLER_TIL_RIMELIGHED);
  });
  for (const [i, c] of inputs.entries()) {
    it(`regnestykkerne er ens for input ${i}`, () => {
      for (const s of [srcModul.CANONICAL, srcModul.DANSK]) {
        expect(denoModul.sumOmkostninger(c.m, s, "alle")).toEqual(srcModul.sumOmkostninger(c.m, s, "alle"));
        expect(denoModul.ebitdaRegnet(c.db, c.m, s)).toEqual(srcModul.ebitdaRegnet(c.db, c.m, s));
        expect(denoModul.ebtRegnet(c.db, c.m, s)).toEqual(srcModul.ebtRegnet(c.db, c.m, s));
        expect(denoModul.omkostningerIAlt(c.m, s)).toEqual(srcModul.omkostningerIAlt(c.m, s));
      }
    });
  }
  it("kroppen er ordret ens (filhovedet er den eneste forskel)", () => {
    const uden = (s: string) => s.replace(/^\/\*\*[\s\S]*?\*\/\n/, "");
    const src = uden(readFileSync(resolve(process.cwd(), "src/lib/omkostningsnoegler.ts"), "utf8"));
    const deno = uden(readFileSync(resolve(process.cwd(), "supabase/functions/_shared/omkostningsnoegler.ts"), "utf8"));
    expect(src).toBe(deno);
  });
});
