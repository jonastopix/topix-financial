import { describe, expect, it } from "vitest";
import {
  DIN_MAANED_BEHANDLES_OVERSKRIFT,
  DIN_MAANED_TOM_LINJE,
  DIN_MAANED_TOM_OVERSKRIFT,
  dinMaanedDom,
  retningTekst,
  sparkline,
  sparklineKoordinater,
  type MaanedsRaekke,
} from "@/lib/hjemmebane/dinMaaned";

/* «Din måned» (forside PR 2, 17/9 — Jonas «A» til valg 2): tre tal med
   retning i ORD mod forrige måned, sparkline over de seneste 12 måneder med
   tal (manglende springes over), og dag 1-teksten uden tal. */

const r = (key: string, over: Partial<MaanedsRaekke> = {}): MaanedsRaekke => ({
  key,
  period: `${key.slice(5)}/${key.slice(0, 4)}`,
  basis: "measured",
  omsaetning: 100_000,
  resultat: 10_000,
  bank: 50_000,
  ...over,
});

describe("retningTekst — ord, aldrig tal", () => {
  it("højere / lavere / som — med forrige måneds navn", () => {
    expect(retningTekst(120, 100, "2026-06")).toBe("højere end i juni");
    expect(retningTekst(80, 100, "2026-06")).toBe("lavere end i juni");
    expect(retningTekst(100, 100, "2026-06")).toBe("som i juni");
  });
  it("negative tal følger samme ord (ingen farve-skam, ingen procent)", () => {
    expect(retningTekst(-5_000, -20_000, "2026-01")).toBe("højere end i januar");
    expect(retningTekst(-5_000, 1_000, "2026-12")).toBe("lavere end i december");
  });
  it("mangler et af tallene eller nøglen er ugyldig → null", () => {
    expect(retningTekst(null, 100, "2026-06")).toBeNull();
    expect(retningTekst(100, null, "2026-06")).toBeNull();
    expect(retningTekst(100, 90, "hest")).toBeNull();
  });
});

describe("sparkline — de seneste 12 måneder MED tallet; manglende springes over, aldrig nul", () => {
  it("sorterer på key, filtrerer null og tager de seneste 12", () => {
    const rows = [
      r("2026-03", { omsaetning: 3 }),
      r("2026-01", { omsaetning: 1 }),
      r("2026-02", { omsaetning: null }),
      r("2025-12", { omsaetning: 12 }),
    ];
    expect(sparkline(rows, "omsaetning")).toEqual([
      { key: "2025-12", value: 12 },
      { key: "2026-01", value: 1 },
      { key: "2026-03", value: 3 },
    ]);
  });
  it("14 måneder → de 12 seneste; huller giver ingen nul-punkter", () => {
    const rows = Array.from({ length: 14 }, (_, i) => r(`2025-${String(i + 1).padStart(2, "0")}`.replace("2025-13", "2026-01").replace("2025-14", "2026-02"), { omsaetning: i + 1 }));
    const p = sparkline(rows, "omsaetning");
    expect(p).toHaveLength(12);
    expect(p[0].value).toBe(3);
    expect(p[11].value).toBe(14);
    expect(p.some((x) => x.value === 0)).toBe(false);
  });
  it("tom eller alle null → tom liste", () => {
    expect(sparkline([], "bank")).toEqual([]);
    expect(sparkline([r("2026-01", { bank: null })], "bank")).toEqual([]);
  });
});

describe("sparklineKoordinater — ren geometri", () => {
  it("normaliserer x til 0–1 og y vendt (højeste værdi = 0)", () => {
    const k = sparklineKoordinater([{ key: "a", value: 10 }, { key: "b", value: 30 }, { key: "c", value: 20 }]);
    expect(k).toEqual([{ x: 0, y: 1 }, { x: 0.5, y: 0 }, { x: 1, y: 0.5 }]);
  });
  it("ét punkt → midten; alle ens → vandret midt i; tom → tom", () => {
    expect(sparklineKoordinater([{ key: "a", value: 5 }])).toEqual([{ x: 0.5, y: 0.5 }]);
    expect(sparklineKoordinater([{ key: "a", value: 5 }, { key: "b", value: 5 }])).toEqual([{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]);
    expect(sparklineKoordinater([])).toEqual([]);
  });
});

describe("dinMaanedDom", () => {
  it("dag 1 uden rækker: siger hvad det bliver til + «Upload din første rapport»", () => {
    const d = dinMaanedDom([], false);
    expect(d).toEqual({ tom: true, overskrift: DIN_MAANED_TOM_OVERSKRIFT, linje: DIN_MAANED_TOM_LINJE, cta: { label: "Upload din første rapport", to: "/reports" } });
  });
  it("uploadet men ikke godkendt (processing): «på vej» + «Se status»", () => {
    const d = dinMaanedDom([], true);
    expect(d.tom).toBe(true);
    if (d.tom === true) {
      expect(d.overskrift).toBe(DIN_MAANED_BEHANDLES_OVERSKRIFT);
      expect(d.cta).toEqual({ label: "Se status", to: "/reports" });
    }
  });
  it("tre tal med retning mod forrige måned; bank fra en ældre række når seneste mangler bank", () => {
    const rows = [
      r("2026-05", { omsaetning: 90_000, resultat: 5_000, bank: 40_000 }),
      r("2026-06", { omsaetning: 100_000, resultat: 5_000, bank: 45_000 }),
      r("2026-07", { omsaetning: 109_494, resultat: 38_724, bank: null, period: "Juli 2026" }),
    ];
    const d = dinMaanedDom(rows, false);
    expect(d.tom).toBe(false);
    if (d.tom === true) return;
    expect(d.periodLabel).toBe("Juli 2026");
    expect(d.estimeret).toBe(false);
    expect(d.tal.map((t) => [t.label, t.value, t.retning])).toEqual([
      ["Omsætning", 109_494, "højere end i juni"],
      ["Resultat f. skat", 38_724, "højere end i juni"],
      ["Bank", 45_000, "højere end i maj"],
    ]);
    expect(d.sparkline.map((p) => p.value)).toEqual([90_000, 100_000, 109_494]);
    expect(d.sparklineTekst).toBe("Omsætning · seneste 3 måneder");
  });
  it("«som i» ved lige tal; kun én måned → ingen retning og kurve-teksten siger næste måned", () => {
    const en = dinMaanedDom([r("2026-07")], false);
    if (en.tom === true) return;
    expect(en.tal.every((t) => t.retning === null)).toBe(true);
    expect(en.sparklineTekst).toBe("Omsætning · kurven kommer med næste måned");
    const lige = dinMaanedDom([r("2026-06", { resultat: 7 }), r("2026-07", { resultat: 7 })], false);
    if (lige.tom === true) return;
    expect(lige.tal[1].retning).toBe("som i juni");
  });
  it("estimat: seneste række estimeret → kortet mærkes som helhed, tallene ikke hver for sig; ældre bank-række estimeret → bank mærkes", () => {
    const helhed = dinMaanedDom([r("2026-06"), r("2026-07", { basis: "estimated" })], false);
    if (helhed.tom === true) return;
    expect(helhed.estimeret).toBe(true);
    expect(helhed.tal.every((t) => t.estimeret === false)).toBe(true);
    const bank = dinMaanedDom([r("2026-06", { basis: "estimated" }), r("2026-07", { bank: null })], false);
    if (bank.tom === true) return;
    expect(bank.estimeret).toBe(false);
    expect(bank.tal[2]).toMatchObject({ label: "Bank", value: 50_000, estimeret: true });
  });
  it("ingen procent i nogen tekst", () => {
    const d = dinMaanedDom([r("2026-06", { omsaetning: 1 }), r("2026-07", { omsaetning: 1_000_000 })], false);
    expect(JSON.stringify(d)).not.toContain("%");
  });
});
