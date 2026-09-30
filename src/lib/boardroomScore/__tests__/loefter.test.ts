import { describe, expect, it } from "vitest";
import { boardroomScore } from "@/lib/boardroomScore/score";
import { naesteMaaned } from "@/lib/boardroomScore/streak";
import { LOEFTER_MAKS, loefterMitTal } from "@/lib/boardroomScore/loefter";
import type { Handling, ScoreGrundlag, ScoreMaaned } from "@/lib/boardroomScore/typer";

/* «Hvad løfter mit tal» (loefter.ts): de 1–3 handlinger med størst REGNET
   gevinst, ellers den første, der låser en søjle op — aldrig en opdigtet. */

const h = (soejle: Handling["soejle"], gevinst: number | null, tekst = `${soejle}-${gevinst}`): Handling => ({ soejle, tekst, gevinst, sti: null });

describe("loefterMitTal — reglen", () => {
  it("størst gevinst først, højst tre", () => {
    const ud = loefterMitTal({ handlinger: [h("disciplin", 5), h("likviditet", 40), h("indtjening", 12), h("vaekst", 20)] });
    expect(ud.map((x) => x.soejle)).toEqual(["likviditet", "vaekst", "indtjening"]);
    expect(LOEFTER_MAKS).toBe(3);
  });
  it("lige gevinst: disciplin → likviditet → indtjening → vækst (adfærd før tal), uanset indgangsorden", () => {
    const ud = loefterMitTal({ handlinger: [h("vaekst", 10), h("indtjening", 10), h("likviditet", 10), h("disciplin", 10)] });
    expect(ud.map((x) => x.soejle)).toEqual(["disciplin", "likviditet", "indtjening"]);
  });
  it("gevinst 0 eller negativ kommer aldrig med", () => {
    const ud = loefterMitTal({ handlinger: [h("disciplin", 0), h("likviditet", -3), h("indtjening", 7)] });
    expect(ud.map((x) => x.soejle)).toEqual(["indtjening"]);
  });
  it("ingen regnet gevinst > 0: ÉN handling, der låser op (den første uden gevinst) — ikke tre ens", () => {
    const ud = loefterMitTal({ handlinger: [h("disciplin", 0), h("likviditet", null, "upload bank"), h("indtjening", null), h("vaekst", null)] });
    expect(ud).toHaveLength(1);
    expect(ud[0].tekst).toBe("upload bank");
  });
  it("en låse-op-handling fylder aldrig op ved siden af regnede gevinster", () => {
    const ud = loefterMitTal({ handlinger: [h("disciplin", 25), h("likviditet", null)] });
    expect(ud.map((x) => x.soejle)).toEqual(["disciplin"]);
  });
  it("intet at gøre → tom liste; maks 0 → tom liste", () => {
    expect(loefterMitTal({ handlinger: [h("disciplin", 0)] })).toEqual([]);
    expect(loefterMitTal({ handlinger: [h("disciplin", 9)] }, 0)).toEqual([]);
  });
  it("NaN/uendelig gevinst regnes ikke som en gevinst", () => {
    expect(loefterMitTal({ handlinger: [h("disciplin", Number.NaN), h("vaekst", Number.POSITIVE_INFINITY), h("indtjening", 3)] }).map((x) => x.soejle)).toEqual(["indtjening"]);
  });
});

/* Mod den rigtige motor: kortets første handling ER motorens loefterMest. */
const NU = new Date("2026-09-30T10:00:00Z");
const sund = (key: string, over: Record<string, number | null> = {}, raekke: Partial<ScoreMaaned> = {}): ScoreMaaned => ({
  key,
  basis: "measured",
  foersteGodkendtAt: `${naesteMaaned(key)}-05T09:00:00Z`,
  metrics: { revenue: 100_000, gross_profit: 70_000, payroll: 40_000, admin_costs: 20_000, ebt: 10_000, cash: 200_000, ...over },
  ...raekke,
});
const keys = (fra: string, antal: number): string[] => {
  const ud = [fra];
  while (ud.length < antal) ud.push(naesteMaaned(ud[ud.length - 1]));
  return ud;
};
const grundlag = (maaneder: ScoreMaaned[], over: Partial<ScoreGrundlag> = {}): ScoreGrundlag => ({
  maaneder,
  kontraktStart: "2025-01-01",
  harBudgetForAaret: true,
  harMaal: true,
  ...over,
});

describe("loefterMitTal — mod motoren", () => {
  const scenarier: Array<[string, ScoreGrundlag]> = [
    ["fuldt grundlag", grundlag(keys("2025-06", 15).map((k) => sund(k)))],
    ["uden budget og mål", grundlag(keys("2025-06", 15).map((k) => sund(k)), { harBudgetForAaret: false, harMaal: false })],
    ["august mangler", grundlag(keys("2025-06", 14).map((k) => sund(k)))],
    ["ingen bank", grundlag(keys("2025-06", 15).map((k) => sund(k, { cash: null })))],
    ["intet uploadet", grundlag([], { kontraktStart: "2026-01-01" })],
    ["svag margin, lille bank", grundlag(keys("2025-06", 15).map((k) => sund(k, { ebt: -5_000, cash: 30_000 })))],
  ];
  for (const [navn, g] of scenarier) {
    it(`${navn}: første handling = loefterMest, alle gevinster > 0 eller én låse-op`, () => {
      const dom = boardroomScore(g, NU);
      const ud = loefterMitTal(dom);
      expect(ud.length).toBeLessThanOrEqual(3);
      expect(ud[0] ?? null).toEqual(dom.loefterMest);
      const regnede = ud.filter((x) => x.gevinst !== null);
      if (regnede.length > 0) {
        expect(regnede).toHaveLength(ud.length);
        for (let i = 1; i < regnede.length; i++) expect(regnede[i - 1].gevinst! >= regnede[i].gevinst!).toBe(true);
      } else {
        expect(ud.length).toBeLessThanOrEqual(1);
      }
      // Hver handling er motorens egen (samme objekt), aldrig en ny tekst.
      for (const x of ud) expect(dom.handlinger).toContain(x);
    });
  }
});
