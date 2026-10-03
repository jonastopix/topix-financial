import { describe, expect, it } from "vitest";
import {
  DIN_MAANED_BEHANDLES_OVERSKRIFT,
  DIN_MAANED_TOM_LINJE,
  DIN_MAANED_TOM_OVERSKRIFT,
  dinMaanedDom,
  retningTekst,
  sparkline,
  SPARKLINE_UDEN_MAALTE_TEKST,
  sparklineKoordinater,
  type MaanedsRaekke,
} from "@/lib/hjemmebane/dinMaaned";

/* «Din måned» (forside PR 2, 17/9 — Jonas «A» til valg 2): tre tal med
   retning i ORD mod forrige måned, sparkline over de seneste 12 måneder med
   tal (manglende springes over), og dag 1-teksten uden tal.
   KUN MÅLTE i kurven (17/9, Jonas «Vi går med dine anbefalinger» — valg A):
   estimater (årsregnskabet /12) udelades af sparkline og af «seneste N
   måneder»; retningen og de tre tal er uændrede. */

// «nu» = 3/10-2026 dansk formiddag: seneste måned med passeret frist er august (frist 21/9) →
// aeldsteFriskeMaaned = august − 5 = 2026-03 (boardroomScore/soejler.ts, FRISKHED_MAANEDER = 6).
const NU = new Date("2026-10-03T08:00:00Z");

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

describe("sparkline — kun målte måneder (17/9, valg A): estimater er ikke måneder", () => {
  it("blandede estimated/measured: kun de målte i kurven, rækkefølgen bevaret (Topix.dk-mønstret: 2025 estimeret /12, 2026 målt)", () => {
    const rows = [
      r("2026-02", { omsaetning: 95_000 }),
      r("2025-12", { basis: "estimated", omsaetning: 48_929.75 }),
      r("2026-01", { omsaetning: 88_000 }),
      r("2025-11", { basis: "estimated", omsaetning: 48_929.75 }),
      r("2026-03", { omsaetning: 101_000 }),
    ];
    expect(sparkline(rows, "omsaetning")).toEqual([
      { key: "2026-01", value: 88_000 },
      { key: "2026-02", value: 95_000 },
      { key: "2026-03", value: 101_000 },
    ]);
    const d = dinMaanedDom(rows, false, NU);
    if (d.tom === true) return;
    expect(d.sparklineTekst).toBe("Omsætning · seneste 3 måneder");
  });
  it("kun estimated → ingen kurve, teksten «kurven kommer med første målte måned»; tallene følger seneste række, kortet mærket som estimat — men INGEN retning og ingen bank (3/10)", () => {
    const rows = [r("2025-11", { basis: "estimated", omsaetning: 48_929.75 }), r("2025-12", { basis: "estimated", omsaetning: 48_929.75, period: "December 2025" })];
    expect(sparkline(rows, "omsaetning")).toEqual([]);
    const d = dinMaanedDom(rows, false, NU);
    expect(d.tom).toBe(false);
    if (d.tom === true) return;
    expect(d.sparkline).toEqual([]);
    expect(d.sparklineTekst).toBe(SPARKLINE_UDEN_MAALTE_TEKST);
    expect(d.sparklineTekst).toBe("Omsætning · kurven kommer med første målte måned");
    expect(d.periodLabel).toBe("December 2025");
    expect(d.estimeret).toBe(true);
    // 3/10: et estimat sammenlignes aldrig — «som i november» var netop fejlen (g03-bank-som-i-november).
    expect(d.tal[0]).toMatchObject({ label: "Omsætning", value: 48_929.75, retning: null, mangler: null });
    expect(d.tal[2]).toMatchObject({ label: "Bank", value: null, retning: null, mangler: BANK_FOERSTE_MAALTE_TEKST });
  });
  it("et estimat NYERE end de målte: kurven stopper ved sidste målte; tallene følger den nyeste (estimerede) række med estimat-mærket — uden retning mod en måling (3/10)", () => {
    const rows = [
      r("2026-05", { omsaetning: 90_000 }),
      r("2026-06", { omsaetning: 100_000 }),
      r("2026-07", { basis: "estimated", omsaetning: 70_000, period: "Juli 2026" }),
    ];
    expect(sparkline(rows, "omsaetning").map((p) => p.key)).toEqual(["2026-05", "2026-06"]);
    const d = dinMaanedDom(rows, false, NU);
    if (d.tom === true) return;
    expect(d.sparkline.map((p) => p.value)).toEqual([90_000, 100_000]);
    expect(d.sparklineTekst).toBe("Omsætning · seneste 2 måneder");
    expect(d.periodLabel).toBe("Juli 2026");
    expect(d.estimeret).toBe(true);
    expect(d.tal[0]).toMatchObject({ label: "Omsætning", value: 70_000, retning: null });
    // Banken: Scores regel — seneste målte med banktal (juni), med sin egen måned, uden retning.
    expect(d.tal[2]).toMatchObject({ label: "Bank", value: 50_000, retning: null, pr: "pr. juni" });
  });
  it("én målt måned (og estimater før den) → ingen kurve endnu, teksten siger næste måned", () => {
    const d = dinMaanedDom([r("2025-12", { basis: "estimated" }), r("2026-01")], false, NU);
    if (d.tom === true) return;
    expect(d.sparkline).toHaveLength(1);
    expect(d.sparklineTekst).toBe("Omsætning · kurven kommer med næste måned");
  });
});

describe("g03-bank-som-i-november (3/10) — Florens RIGTIGE form, målt i prod 3/10", () => {
  // Målt 3/10: 2024-01 → 2025-12 estimated MED cash (årsregnskabet /12 — ens hver måned),
  // 2026-01 → 2026-08 measured UDEN cash. Beløbene er opdigtede (undtagen augusts to fra skærmen); formen er prods.
  const floren: MaanedsRaekke[] = [
    ...Array.from({ length: 24 }, (_, i) => {
      const aar = 2024 + Math.floor(i / 12);
      const md = String((i % 12) + 1).padStart(2, "0");
      return r(`${aar}-${md}`, { basis: "estimated", omsaetning: 400_000, resultat: 30_000, bank: 3_517 });
    }),
    ...Array.from({ length: 8 }, (_, i) => r(`2026-0${i + 1}`, { omsaetning: 500_000 + i * 1_000, resultat: 50_000 - i * 1_000, bank: null })),
  ].map((x) => (x.key === "2026-08" ? { ...x, period: "August 2026", omsaetning: 532_702, resultat: 51_769 } : x));

  it("august vises; banken er «Banksaldo er ikke med i de månedlige rapporter» — aldrig estimatet fra december, aldrig «som i november»", () => {
    const d = dinMaanedDom(floren, false, NU);
    if (d.tom === true) throw new Error("tom");
    expect(d.periodLabel).toBe("August 2026");
    expect(d.estimeret).toBe(false);
    expect(d.tal[2]).toEqual({ felt: "bank", label: "Bank", value: null, retning: null, mangler: "Banksaldo er ikke med i de månedlige rapporter", pr: null });
    expect(JSON.stringify(d)).not.toContain("november");
    expect(JSON.stringify(d)).not.toContain("3517");
  });
  it("omsætning og resultat sammenlignes med JULI (forrige målte), ikke med et estimat", () => {
    const d = dinMaanedDom(floren, false, NU);
    if (d.tom === true) throw new Error("tom");
    expect(d.tal[0]).toMatchObject({ value: 532_702, retning: "højere end i juli", mangler: null });
    expect(d.tal[1]).toMatchObject({ value: 51_769, retning: "højere end i juli", mangler: null });
  });
  it("første målte måned efter estimater: ingen retning (forrige er et estimat)", () => {
    const d = dinMaanedDom(floren.filter((x) => x.key <= "2026-01"), false, NU);
    if (d.tom === true) throw new Error("tom");
    expect(d.tal.map((t) => t.retning)).toEqual([null, null, null]);
  });
  it("alle tal sammenlignes med SAMME forrige målte måned — også over et hul", () => {
    const d = dinMaanedDom([r("2026-05", { bank: 10 }), r("2026-07", { bank: 20, omsaetning: 1, resultat: 1 })], false, NU);
    if (d.tom === true) throw new Error("tom");
    expect(d.tal.map((t) => t.retning)).toEqual(["lavere end i maj", "lavere end i maj", "højere end i maj"]);
  });
  it("de fire bank-tilfælde (CTO 3/10): aldrig målt · kun estimat · ældre målt · samme måned", () => {
    // 1. Aldrig: målte måneder uden banktal.
    const aldrig = dinMaanedDom([r("2026-07", { bank: null }), r("2026-08", { bank: null })], false, NU);
    if (aldrig.tom === true) throw new Error("tom");
    expect(aldrig.tal[2]).toMatchObject({ value: null, mangler: "Banksaldo er ikke med i de månedlige rapporter", pr: null, retning: null });
    // 2. Kun estimat: banktal findes KUN i estimater — vises aldrig.
    const kunEstimat = dinMaanedDom([r("2025-12", { basis: "estimated", bank: 3_517 }), r("2026-08", { bank: null })], false, NU);
    if (kunEstimat.tom === true) throw new Error("tom");
    expect(kunEstimat.tal[2]).toMatchObject({ value: null, mangler: "Banksaldo er ikke med i de månedlige rapporter" });
    // 3a. Ældre målt, frisk (april ≥ marts): tallet med sin egen måned, ingen retning.
    const aeldre = dinMaanedDom([r("2026-04", { bank: 45_000 }), r("2026-08", { bank: null })], false, NU);
    if (aeldre.tom === true) throw new Error("tom");
    expect(aeldre.tal[2]).toEqual({ felt: "bank", label: "Bank", value: 45_000, retning: null, mangler: null, pr: "pr. april" });
    // 3b. Ældre målt, FOR gammel (februar < marts — samme grænse som Score): ikke vist.
    const gammel = dinMaanedDom([r("2026-02", { bank: 45_000 }), r("2026-08", { bank: null })], false, NU);
    if (gammel.tom === true) throw new Error("tom");
    expect(gammel.tal[2]).toMatchObject({ value: null, mangler: BANK_FOR_GAMMEL_TEKST, pr: null });
    expect(BANK_FOR_GAMMEL_TEKST).toBe("Banksaldo er ikke med i de månedlige rapporter fra de seneste 6 måneder");
    // Grænsen er Score's egen funktion.
    expect(aeldsteFriskeMaaned(NU)).toBe("2026-03");
    const graense = dinMaanedDom([r("2026-03", { bank: 1 }), r("2026-08", { bank: null })], false, NU);
    if (graense.tom === true) throw new Error("tom");
    expect(graense.tal[2]).toMatchObject({ value: 1, pr: "pr. marts" });
    // 4. Samme måned: tallet med retning mod forrige målte.
    const samme = dinMaanedDom([r("2026-07", { bank: 40_000 }), r("2026-08", { bank: 50_000 })], false, NU);
    if (samme.tom === true) throw new Error("tom");
    expect(samme.tal[2]).toEqual({ felt: "bank", label: "Bank", value: 50_000, retning: "højere end i juli", mangler: null, pr: null });
    // Ingen målte måneder overhovedet → «kommer med første målte måned».
    const ingen = dinMaanedDom([r("2025-12", { basis: "estimated", bank: 3_517 })], false, NU);
    if (ingen.tom === true) throw new Error("tom");
    expect(ingen.tal[2]).toMatchObject({ value: null, mangler: BANK_FOERSTE_MAALTE_TEKST });
  });
  it("bankPrTekst: årstallet med, når året er et andet end den viste måneds", () => {
    expect(bankPrTekst("2026-04", "2026-08")).toBe("pr. april");
    expect(bankPrTekst("2025-11", "2026-01")).toBe("pr. november 2025");
  });
  it("forrige målte mangler banktallet → ingen bankretning, men banken vises", () => {
    const d = dinMaanedDom([r("2026-06", { bank: null }), r("2026-07", { bank: 20 })], false, NU);
    if (d.tom === true) throw new Error("tom");
    expect(d.tal[2]).toMatchObject({ value: 20, retning: null, mangler: null });
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
    const d = dinMaanedDom([], false, NU);
    expect(d).toEqual({ tom: true, overskrift: DIN_MAANED_TOM_OVERSKRIFT, linje: DIN_MAANED_TOM_LINJE, cta: { label: "Upload din første rapport", to: "/reports" } });
  });
  it("uploadet men ikke godkendt (processing): «på vej» + «Se status»", () => {
    const d = dinMaanedDom([], true, NU);
    expect(d.tom).toBe(true);
    if (d.tom === true) {
      expect(d.overskrift).toBe(DIN_MAANED_BEHANDLES_OVERSKRIFT);
      expect(d.cta).toEqual({ label: "Se status", to: "/reports" });
    }
  });
  it("tre tal med retning mod forrige målte måned; mangler seneste bank, står junis banktal «pr. juni» uden retning (Scores regel, 3/10)", () => {
    const rows = [
      r("2026-05", { omsaetning: 90_000, resultat: 5_000, bank: 40_000 }),
      r("2026-06", { omsaetning: 100_000, resultat: 5_000, bank: 45_000 }),
      r("2026-07", { omsaetning: 109_494, resultat: 38_724, bank: null, period: "Juli 2026" }),
    ];
    const d = dinMaanedDom(rows, false, NU);
    expect(d.tom).toBe(false);
    if (d.tom === true) return;
    expect(d.periodLabel).toBe("Juli 2026");
    expect(d.estimeret).toBe(false);
    expect(d.tal.map((t) => [t.label, t.value, t.retning])).toEqual([
      ["Omsætning", 109_494, "højere end i juni"],
      ["Resultat f. skat", 38_724, "højere end i juni"],
      ["Bank", 45_000, null],
    ]);
    expect(d.tal[2].pr).toBe("pr. juni");
    expect(d.tal.slice(0, 2).every((t) => t.mangler === null)).toBe(true);
    expect(d.sparkline.map((p) => p.value)).toEqual([90_000, 100_000, 109_494]);
    expect(d.sparklineTekst).toBe("Omsætning · seneste 3 måneder");
  });
  it("«som i» ved lige tal; kun én måned → ingen retning og kurve-teksten siger næste måned", () => {
    const en = dinMaanedDom([r("2026-07")], false, NU);
    if (en.tom === true) return;
    expect(en.tal.every((t) => t.retning === null)).toBe(true);
    expect(en.sparklineTekst).toBe("Omsætning · kurven kommer med næste måned");
    const lige = dinMaanedDom([r("2026-06", { resultat: 7 }), r("2026-07", { resultat: 7 })], false, NU);
    if (lige.tom === true) return;
    expect(lige.tal[1].retning).toBe("som i juni");
  });
  it("estimat: seneste række estimeret → kortet mærkes som helhed; en ESTIMERET bank-række bruges aldrig (3/10 — før stod den som «est.»)", () => {
    const helhed = dinMaanedDom([r("2026-06"), r("2026-07", { basis: "estimated" })], false, NU);
    if (helhed.tom === true) return;
    expect(helhed.estimeret).toBe(true);
    const bank = dinMaanedDom([r("2026-06", { basis: "estimated" }), r("2026-07", { bank: null })], false, NU);
    if (bank.tom === true) return;
    expect(bank.estimeret).toBe(false);
    expect(bank.tal[2]).toMatchObject({ label: "Bank", value: null, retning: null, mangler: BANK_IKKE_I_RAPPORTERNE_TEKST });
    expect(bank.tal.some((t) => "estimeret" in t)).toBe(false);
  });
  it("ingen procent i nogen tekst", () => {
    const d = dinMaanedDom([r("2026-06", { omsaetning: 1 }), r("2026-07", { omsaetning: 1_000_000 })], false, NU);
    expect(JSON.stringify(d)).not.toContain("%");
  });
});

import { BANK_FOERSTE_MAALTE_TEKST, BANK_FOR_GAMMEL_TEKST, BANK_IKKE_I_RAPPORTERNE_TEKST, bankPrTekst, senesteNoegle, talAlderTekst } from "../dinMaaned";
import { aeldsteFriskeMaaned } from "@/lib/boardroomScore/soejler";
describe("talAlderTekst — kun når tallene er bagud efter husets frist (forside v3)", () => {
  const nu = new Date("2026-10-02T18:00:00Z");
  it("Topix 2/10: august er seneste, septembers frist 20/10 er ikke passeret → frisk", () => expect(talAlderTekst("2026-08", nu)).toBeNull());
  it("juni → 3 måneder gamle", () => expect(talAlderTekst("2026-06", nu)).toBe("3 måneder gamle"));
  it("juli → 2 måneder gamle (augusts frist mandag 21/9 passeret)", () => expect(talAlderTekst("2026-07", nu)).toBe("2 måneder gamle"));
  it("september (åben måned i hus) → frisk", () => expect(talAlderTekst("2026-09", nu)).toBeNull());
  it("på fristdagen selv er august stadig ikke for gammel: 20/10 kl. 23 dansk → frisk; 21/10 → 1 måned gammel", () => {
    expect(talAlderTekst("2026-08", new Date("2026-10-20T21:00:00Z"))).toBeNull();
    expect(talAlderTekst("2026-08", new Date("2026-10-21T08:00:00Z"))).toBe("1 måned gammel");
  });
  it("ingen/ugyldig → null", () => {
    expect(talAlderTekst(null, nu)).toBeNull();
    expect(talAlderTekst("2026-8", nu)).toBeNull();
  });
  it("senesteNoegle", () => {
    expect(senesteNoegle([{ key: "2026-03" }, { key: "2026-08" }, { key: "2026-01" }])).toBe("2026-08");
    expect(senesteNoegle([])).toBeNull();
  });
});
