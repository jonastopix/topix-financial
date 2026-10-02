import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SIDE, alleSider } from "../../../supabase/functions/_shared/alleSider";

/**
 * Kildeværn mod stille lofter i send-report-reminder og onboarding-rytme
 * (analyse-drift fund 6, 30/9-2026). PostgREST giver højst 1.000 rækker pr.
 * forespørgsel UDEN fejl (DEL 4, #929), så et `.limit(5000)` eller
 * `.limit(10000)` ligner et loft uden at være det: send-report-reminder
 * tabte målte tal og medlemmer, onboarding-rytme (ældste først) tabte de
 * NYESTE medlemmer, dem rytmen er til for.
 *
 *   1. INGEN `.limit(n)` MED n > 1000 i de to functions.
 *   2. Hvert opslag går gennem `alleSider` (importeret fra _shared), og hvert
 *      kald har `.range(fra, til)` og en sortering — uden stabil rækkefølge
 *      kan en række falde mellem to sider.
 *   3. Hjælperen henter alle sider og KASTER på en fejl (en halv liste, der
 *      ligner en hel, er værre end en stoppet kørsel).
 *
 * Domme 1 og 2 er bevist nedenfor på en kopi med fejlen indsat.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/ [^\n]*/g, "");

const FUNKTIONER = [
  "supabase/functions/send-report-reminder/index.ts",
  "supabase/functions/onboarding-rytme/index.ts",
];

/** Alle `.limit(n)` med et tal over PostgREST-loftet. */
const storeLimits = (kode: string): number[] =>
  [...udenKommentarer(kode).matchAll(/\.limit\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1])).filter((n) => n > SIDE);

const antal = (kode: string, moenster: RegExp): number => (udenKommentarer(kode).match(moenster) ?? []).length;

/** Dom 2: importen, og pr. alleSider-kald én `.range(fra, til)` og mindst én `.order(`. */
const sideFejl = (kode: string): string[] => {
  const fejl: string[] = [];
  const k = udenKommentarer(kode);
  if (!/import \{ alleSider \} from "\.\.\/_shared\/alleSider\.ts"/.test(k)) fejl.push("mangler import af _shared/alleSider");
  const kald = antal(k, /alleSider</g);
  if (kald === 0) fejl.push("intet alleSider-kald");
  if (antal(k, /\.range\(fra, til\)/g) !== kald) fejl.push("antal .range(fra, til) er ikke lig antal alleSider-kald");
  if (antal(k, /\.order\(/g) < kald) fejl.push("et alleSider-kald mangler .order(");
  return fejl;
};

describe("stille lofter — send-report-reminder og onboarding-rytme", () => {
  for (const sti of FUNKTIONER) {
    it(`${sti}: intet .limit(n) over ${SIDE}`, () => {
      expect(storeLimits(laes(sti))).toEqual([]);
    });
    it(`${sti}: alle opslag går gennem alleSider med .range og .order`, () => {
      expect(sideFejl(laes(sti))).toEqual([]);
    });
  }

  it("værnet fælder den gamle kode (.limit(5000)/.limit(10000), ingen alleSider)", () => {
    const gammel = `supabase.from("company_members").select("company_id, created_at").limit(5000);
      supabase.from("financial_reports").select("company_id").is("deleted_at", null).limit(10000);`;
    expect(storeLimits(gammel)).toEqual([5000, 10000]);
    expect(sideFejl(gammel)).toContain("intet alleSider-kald");
  });

  it("værnet fælder et alleSider-kald uden .range eller .order", () => {
    const halv = `import { alleSider } from "../_shared/alleSider.ts";
      await alleSider<X>((fra, til) => supabase.from("t").select("id").order("id"), "t");`;
    expect(sideFejl(halv)).toContain("antal .range(fra, til) er ikke lig antal alleSider-kald");
    const uden = halv.replace('.order("id")', '.range(fra, til)');
    expect(sideFejl(uden)).toContain("et alleSider-kald mangler .order(");
  });

  it("et loft i en kommentar fælder ikke", () => {
    expect(storeLimits("// var .limit(5000)\nconst x = 1;")).toEqual([]);
  });
});

describe("alleSider", () => {
  const raekker = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));
  const fra = (alle: { id: number }[]) => async (a: number, b: number) => ({ data: alle.slice(a, b + 1), error: null });

  it("henter alle rækker over 1.000 (2.350 → 2.350, ikke 1.000)", async () => {
    expect((await alleSider(fra(raekker(2350)), "t")).length).toBe(2350);
  });
  it("præcis en fuld side giver en tom side til sidst, ikke et tab", async () => {
    expect((await alleSider(fra(raekker(SIDE)), "t")).length).toBe(SIDE);
  });
  it("tom tabel og null-data giver tom liste", async () => {
    expect(await alleSider(async () => ({ data: null, error: null }), "t")).toEqual([]);
  });
  it("kaster med kildens navn ved en fejl på en senere side", async () => {
    const alle = raekker(1500);
    await expect(
      alleSider(async (a, b) => (a === 0 ? { data: alle.slice(a, b + 1), error: null } : { data: null, error: { message: "timeout" } }), "company_members"),
    ).rejects.toThrow("company_members: timeout");
  });
});
