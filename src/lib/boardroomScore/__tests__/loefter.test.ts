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
  it("regnede først, højst én låse-op til sidst (rådets fund 1/10: uden opskalering er en søjle uden data 0 point værd)", () => {
    const ud = loefterMitTal({ handlinger: [h("disciplin", 25), h("likviditet", null), h("vaekst", null)] });
    expect(ud.map((x) => x.soejle)).toEqual(["disciplin", "likviditet"]);
    expect(ud[1].gevinst).toBeNull();
  });
  it("låse-op kun på en ledig plads: tre regnede → ingen låse-op", () => {
    const ud = loefterMitTal({ handlinger: [h("disciplin", 5), h("likviditet", null), h("indtjening", 12), h("vaekst", 20)] });
    expect(ud.map((x) => x.soejle)).toEqual(["vaekst", "indtjening", "disciplin"]);
    expect(loefterMitTal({ handlinger: [h("disciplin", 5), h("likviditet", null)] }, 1).map((x) => x.soejle)).toEqual(["disciplin"]);
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
      const laaserOp = ud.filter((x) => x.gevinst === null);
      // Regnede først (faldende), højst én låse-op — og kun bagest.
      expect(laaserOp.length).toBeLessThanOrEqual(1);
      expect(ud.slice(0, regnede.length)).toEqual(regnede);
      for (const x of regnede) expect(x.gevinst! > 0).toBe(true);
      for (let i = 1; i < regnede.length; i++) expect(regnede[i - 1].gevinst! >= regnede[i].gevinst!).toBe(true);
      // Hver handling er motorens egen (samme objekt), aldrig en ny tekst.
      for (const x of ud) expect(dom.handlinger).toContain(x);
    });
  }
});

/* Brilleværk-tilfældet (rådets fund 1/10-2026): indtjening og vækst mættede,
   disciplin med en lille regnet gevinst (budget mangler), likviditet uden data
   (intet banktal). Uden opskalering står likviditet på 0 af 250 — medlemmet
   SKAL se banksaldo-handlingen, men bag den regnede gevinst. */
describe("loefterMitTal — Brilleværk: lille regnet gevinst + likviditet uden data", () => {
  const voksende = (k: string) =>
    k >= "2026"
      ? sund(k, { revenue: 150_000, gross_profit: 105_000, ebt: 45_000, cash: null })
      : sund(k, { ebt: 30_000, cash: null });
  const dom = boardroomScore(grundlag(keys("2025-06", 15).map(voksende), { harBudgetForAaret: false }), NU);
  it("forudsætningerne holder: indtjening og vækst mættede, likviditet uden data, disciplin med lille gevinst", () => {
    expect(dom.soejler.indtjening).toMatchObject({ status: "ok", point: 250 });
    expect(dom.soejler.vaekst).toMatchObject({ status: "ok", point: 250 });
    expect(dom.soejler.likviditet.status).not.toBe("ok");
    const d = dom.handlinger.find((x) => x.soejle === "disciplin")!;
    expect(d.gevinst).toBeGreaterThan(0);
    expect(d.gevinst!).toBeLessThan(250);
  });
  it("begge vises: disciplin først (= loefterMest), likviditetens låse-op bagest", () => {
    const ud = loefterMitTal(dom);
    expect(ud.map((x) => x.soejle)).toEqual(["disciplin", "likviditet"]);
    expect(ud[0]).toEqual(dom.loefterMest);
    expect(ud[1].gevinst).toBeNull();
  });
});
