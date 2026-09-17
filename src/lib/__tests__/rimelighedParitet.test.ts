import { describe, expect, it } from "vitest";
import { rimelighedstjek, rimelighedAdvarsler, BEKRAEFT_TEKST } from "@/lib/rimelighed";
// Parity import — the Deno copy is intentionally a verbatim mirror of the
// frontend copy (file header is the only allowed difference). We import it
// here so vitest fails loudly if the two drift.
import {
  rimelighedstjek as rimelighedstjekDeno,
  rimelighedAdvarsler as rimelighedAdvarslerDeno,
  BEKRAEFT_TEKST as BEKRAEFT_TEKST_DENO,
} from "../../../supabase/functions/_shared/rimelighed.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Parity gate — supabase/functions/_shared/rimelighed.ts must produce identical
// output for every input the frontend copy handles. If this block fails, the
// two files have drifted and must be re-synced.

const cases: { navn: string; m: Parameters<typeof rimelighedstjek>[0]; type: string }[] = [
  { navn: "Fjeldgaardshop 2025-10", m: { revenue: 241595.98, gross_profit: 198586.71, cogs: 43009.27, payroll: 6328.38, admin_costs: 434071.91, ebt: 241813.3 }, type: "trial_balance" },
  { navn: "Brick Works 2025-01", m: { revenue: 42217.2, gross_profit: 639640.4, cogs: -597423.2, payroll: 490189.87, admin_costs: 1379902.53, ebt: 1232301.57 }, type: "trial_balance" },
  { navn: "Brick Works 2024-08", m: { revenue: 1555817.95, gross_profit: 1211124.87, payroll: 388390.48, admin_costs: 90926.44, ebt: 731361.55 }, type: "trial_balance" },
  { navn: "Booking 46 kr.", m: { revenue: 83665, gross_profit: 60000, payroll: 46, admin_costs: 12000, ebt: 47954 }, type: "pnl" },
  { navn: "balance", m: { revenue: 100, ebt: 10 }, type: "balance" },
  { navn: "tom", m: {}, type: "pnl" },
  { navn: "negativ konvention", m: { revenue: 100_000, gross_profit: 60_000, payroll: -30_000, sales_costs: -5_000, financial_costs: -1_000, ebt: 24_000 }, type: "combined" },
  { navn: "A2: renteindtægter og autodrift", m: { revenue: 440_000, gross_profit: 132_000, payroll: 107_000, sales_costs: 1_000, facility_costs: 20_000, vehicle_costs: 16_000, admin_costs: 38_000, financial_costs: 5_000, financial_income: 16_000, ebt: -39_000 }, type: "pnl" },
];

describe("rimelighedstjek — parity between src/lib and supabase/functions/_shared", () => {
  for (const c of cases) {
    it(`parity: ${c.navn}`, () => {
      expect(rimelighedstjekDeno(c.m, c.type)).toEqual(rimelighedstjek(c.m, c.type));
      expect(rimelighedAdvarslerDeno(c.m, c.type)).toEqual(rimelighedAdvarsler(c.m, c.type));
    });
  }
  it("teksten på bekræftelsen er den samme", () => {
    expect(BEKRAEFT_TEKST_DENO).toBe(BEKRAEFT_TEKST);
  });
  it("kroppen er ordret ens (filhovedet er den eneste forskel)", () => {
    const uden = (s: string) => s.replace(/^\/\*\*[\s\S]*?\*\/\n/, "");
    const src = uden(readFileSync(resolve(process.cwd(), "src/lib/rimelighed.ts"), "utf8"));
    const deno = uden(readFileSync(resolve(process.cwd(), "supabase/functions/_shared/rimelighed.ts"), "utf8"));
    expect(src).toBe(deno);
  });
});
