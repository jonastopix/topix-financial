import { describe, expect, it } from "vitest";
import {
  aeldsteFriskeMaaned,
  DISCIPLIN_BUDGET_POINT,
  DISCIPLIN_MAAL_POINT,
  disciplin,
  disciplinVindue,
  indtjening,
  kontantforbrug,
  likviditet,
  maalteAfsluttede,
  resultatAf,
  SOEJLE_MAX,
  vaekst,
  VAEKST_MIN_GRUNDLAG_KR,
} from "@/lib/boardroomScore/soejler";
import { naesteMaaned } from "@/lib/boardroomScore/streak";
import type { ScoreGrundlag, ScoreMaaned, SoejleDom } from "@/lib/boardroomScore/typer";

/* De fire søjler (docs/boardroom-score.md §2). Kun målte, afsluttede
   måneder; en manglende nøgle er umålt; fravær = «ikke_nok_data» — undtagen
   disciplin, hvor fraværet er adfærden. */

/** 30/9-2026 kl. 12:00 dansk tid. */
const NU = new Date("2026-09-30T10:00:00Z");

const maaned = (key: string, metrics: Record<string, number | null>, over: Partial<ScoreMaaned> = {}): ScoreMaaned => ({
  key,
  basis: "measured",
  foersteGodkendtAt: `${naesteMaaned(key)}-05T09:00:00Z`,
  metrics,
  ...over,
});

/** En sund måned: 100.000 i omsætning, 60.000 i omkostninger (payroll 40.000 + admin 20.000), resultat 10.000, 200.000 i banken. */
const sund = (key: string, over: Record<string, number | null> = {}, raekke: Partial<ScoreMaaned> = {}) =>
  maaned(key, { revenue: 100_000, gross_profit: 70_000, payroll: 40_000, admin_costs: 20_000, ebt: 10_000, cash: 200_000, ...over }, raekke);

const grundlag = (maaneder: ScoreMaaned[], over: Partial<ScoreGrundlag> = {}): ScoreGrundlag => ({
  maaneder,
  kontraktStart: null,
  harBudgetForAaret: false,
  harMaal: false,
  ...over,
});

/** Point når søjlen har data, ellers null — så en «ikke_nok_data» aldrig ligner 0. */
const pointAf = (d: SoejleDom): number | null => (d.status === "ok" ? d.point : null);

const keys = (fra: string, antal: number): string[] => {
  const ud = [fra];
  while (ud.length < antal) ud.push(naesteMaaned(ud[ud.length - 1]));
  return ud;
};

describe("maalteAfsluttede", () => {
  it("kun målte, kun afsluttede (key < indeværende måned), ældste først, én pr. nøgle", () => {
    const rows = [sund("2026-09"), sund("2026-08"), sund("2026-07", {}, { basis: "estimated" }), sund("2026-06")];
    expect(maalteAfsluttede(rows, NU).map((r) => r.key)).toEqual(["2026-06", "2026-08"]);
  });
});

describe("resultatAf — ebt når målt, ellers regnet af posterne", () => {
  it("ebt vinder", () => {
    expect(resultatAf(sund("2026-08"))).toBe(10_000);
  });
  it("uden ebt: ebtRegnet = dækningsbidrag − Σ|drift| = 70.000 − 60.000 = 10.000", () => {
    expect(resultatAf(sund("2026-08", { ebt: null }))).toBe(10_000);
  });
  it("uden ebt og uden dækningsbidrag → null (ikke 0)", () => {
    expect(resultatAf(sund("2026-08", { ebt: null, gross_profit: null }))).toBeNull();
  });
});

describe("likviditet — runway = bank / gennemsnitlig månedlig omkostning", () => {
  it("200.000 / 60.000 = 3,33 måneder → mellem knæk 3 (150) og 6 (225): 150 + 0,333/3 × 75 = 158,3", () => {
    const d = likviditet(grundlag(keys("2026-06", 3).map((k) => sund(k))), NU);
    expect(d.status).toBe("ok");
    if (d.status !== "ok") return;
    expect(d.detaljer.runwayMaaneder).toBeCloseTo(3.3333, 3);
    expect(d.detaljer.maanedligOmkostning).toBe(60_000);
    expect(d.detaljer.omkostningsMaaneder).toBe(3);
    expect(d.point).toBeCloseTo(158.33, 1);
    expect(d.detaljer.bankKey).toBe("2026-08");
  });
  it("banken må være ældre end omkostningsvinduet", () => {
    const rows = [sund("2026-05"), sund("2026-06", { cash: null }), sund("2026-07", { cash: null }), sund("2026-08", { cash: null })];
    const d = likviditet(grundlag(rows), NU);
    expect(d.status).toBe("ok");
    if (d.status === "ok") expect(d.detaljer.bankKey).toBe("2026-05");
  });
  it("negativ bank = 0 point (kassekredit trukket)", () => {
    const d = likviditet(grundlag([sund("2026-08", { cash: -50_000 })]), NU);
    expect(d.status === "ok" && d.point).toBe(0);
  });
  it("ekstrem runway mætter ved 250", () => {
    const d = likviditet(grundlag([sund("2026-08", { cash: 60_000_000 })]), NU);
    expect(d.status === "ok" && d.point).toBe(250);
  });
  it("intet banktal → ikke nok data (aldrig straf)", () => {
    const d = likviditet(grundlag([sund("2026-08", { cash: null })]), NU);
    expect(d.status).toBe("ikke_nok_data");
  });
  it("ingen omkostningspost i nogen måned → ikke nok data", () => {
    const d = likviditet(grundlag([maaned("2026-08", { revenue: 100_000, cash: 50_000 })]), NU);
    expect(d.status).toBe("ikke_nok_data");
  });
  it("omkostningerne går gennem omkostningsnoegler: negative fortegn tælles som |beløb|", () => {
    const d = likviditet(grundlag([sund("2026-08", { payroll: -40_000, admin_costs: -20_000 })]), NU);
    expect(d.status === "ok" && d.detaljer.maanedligOmkostning).toBe(60_000);
  });
  it("indeværende måned (ikke afsluttet) indgår ikke", () => {
    const d = likviditet(grundlag([sund("2026-09", { cash: 1 })]), NU);
    expect(d.status).toBe("ikke_nok_data");
  });
  it("kontantforbrug: afskrivninger tæller ikke (ikke penge ud af banken); vareforbrug og finans gør", () => {
    const d = likviditet(grundlag([sund("2026-08", { depreciation: 30_000 })]), NU);
    expect(d.status === "ok" && d.detaljer.maanedligOmkostning).toBe(60_000);
    const d2 = likviditet(grundlag([sund("2026-08", { cogs: 10_000, financial_costs: 5_000, depreciation: 30_000 })]), NU);
    expect(d2.status === "ok" && d2.detaljer.maanedligOmkostning).toBe(75_000);
    expect(kontantforbrug({ depreciation: 30_000 })).toEqual({ sum: 0, fundet: 0 });
  });
  it("friskhed: banktal ældre end 6 måneder op til seneste passerede frist → ikke nok data", () => {
    expect(aeldsteFriskeMaaned(NU)).toBe("2026-03");
    const rows = [sund("2026-02"), sund("2026-06", { cash: null }), sund("2026-07", { cash: null }), sund("2026-08", { cash: null })];
    const d = likviditet(grundlag(rows), NU);
    expect(d.status).toBe("ikke_nok_data");
    if (d.status === "ikke_nok_data") expect(d.grund).toContain("2026-02");
    // Marts er stadig frisk.
    const d2 = likviditet(grundlag([sund("2026-03"), ...rows.slice(1)]), NU);
    expect(d2.status === "ok" && d2.detaljer.bankKey).toBe("2026-03");
  });
  it("friskhed: kun gamle omkostningsmåneder → ikke nok data", () => {
    const d = likviditet(grundlag([sund("2025-06"), sund("2025-07"), sund("2025-08")]), NU);
    expect(d.status).toBe("ikke_nok_data");
  });
});

describe("indtjening — Σ resultat / Σ omsætning over ≤ 3 måneder", () => {
  it("10 % margin → 200 point", () => {
    const d = indtjening(grundlag(keys("2026-06", 3).map((k) => sund(k))), NU);
    expect(d.status).toBe("ok");
    if (d.status !== "ok") return;
    expect(d.detaljer.margin).toBeCloseTo(0.1, 6);
    expect(d.point).toBe(200);
    expect(d.detaljer.maaneder).toEqual(["2026-06", "2026-07", "2026-08"]);
  });
  it("summer, ikke gennemsnit af marginer: en lille måned vejer lidt", () => {
    const rows = [sund("2026-07", { revenue: 10_000, ebt: -9_000 }), sund("2026-08", { revenue: 190_000, ebt: 29_000 })];
    const d = indtjening(grundlag(rows), NU);
    expect(d.status === "ok" && d.detaljer.margin).toBeCloseTo(0.1, 6);
  });
  it("break-even giver 100, ikke 0; −20 % giver 0; +20 % giver 250 (mættet derover)", () => {
    const ved = (ebt: number) => pointAf(indtjening(grundlag([sund("2026-07", { ebt }), sund("2026-08", { ebt })]), NU));
    expect(ved(0)).toBe(100);
    expect(ved(-20_000)).toBe(0);
    expect(ved(-500_000)).toBe(0);
    expect(ved(90_000)).toBe(250);
  });
  it("kun én måned → ikke nok data", () => {
    expect(indtjening(grundlag([sund("2026-08")]), NU).status).toBe("ikke_nok_data");
  });
  it("måneder uden omsætning eller resultat filtreres fra vinduet — vinduet er de tre seneste, ikke de tre seneste MED tal", () => {
    const rows = [sund("2026-05"), sund("2026-06"), sund("2026-07", { revenue: null }), sund("2026-08", { ebt: null, gross_profit: null })];
    // Vinduet er 06, 07, 08; kun 06 har begge → under 2 → ikke nok data.
    expect(indtjening(grundlag(rows), NU).status).toBe("ikke_nok_data");
  });
  it("friskhed: seneste måned med tal ældre end 6 måneder → ikke nok data; marts–april er friske", () => {
    expect(indtjening(grundlag([sund("2025-11"), sund("2025-12"), sund("2026-01")]), NU).status).toBe("ikke_nok_data");
    expect(indtjening(grundlag([sund("2026-03"), sund("2026-04")]), NU).status).toBe("ok");
  });
  it("omsætning 0 → ikke nok data (ingen division)", () => {
    expect(indtjening(grundlag([sund("2026-07", { revenue: 0 }), sund("2026-08", { revenue: 0 })]), NU).status).toBe("ikke_nok_data");
  });
});

describe("vækst — tre sammenhængende måneder mod samme tre året før, ellers kvartalet før", () => {
  it("år-mod-år: 300.000 mod 250.000 = +20 % → mellem 10 % (190) og 25 % (250): 190 + 10/15 × 60 = 230", () => {
    const rows = [...keys("2025-06", 3).map((k) => sund(k, { revenue: 83_333.3333 })), ...keys("2026-06", 3).map((k) => sund(k))];
    const d = vaekst(grundlag(rows), NU);
    expect(d.status).toBe("ok");
    if (d.status !== "ok") return;
    expect(d.detaljer.sammenligning).toBe("aar_til_aar");
    expect(d.detaljer.vaekst).toBeCloseTo(0.2, 4);
    expect(d.point).toBeCloseTo(230, 1);
  });
  it("uden året før: kvartalet før, mærket", () => {
    const rows = [...keys("2026-03", 3).map((k) => sund(k, { revenue: 100_000 })), ...keys("2026-06", 3).map((k) => sund(k, { revenue: 100_000 }))];
    const d = vaekst(grundlag(rows), NU);
    expect(d.status === "ok" && d.detaljer.sammenligning).toBe("kvartal_til_kvartal");
    expect(d.status === "ok" && d.detaljer.vaekst).toBe(0);
    expect(d.status === "ok" && d.point).toBe(125);
  });
  it("året før vinder over kvartalet før, når begge findes", () => {
    const rows = [...keys("2025-06", 3), ...keys("2026-03", 3), ...keys("2026-06", 3)].map((k) => sund(k));
    const d = vaekst(grundlag(rows), NU);
    expect(d.status === "ok" && d.detaljer.sammenligning).toBe("aar_til_aar");
  });
  it("et hul i de tre seneste → ikke nok data", () => {
    const rows = [sund("2026-05"), sund("2026-07"), sund("2026-08"), ...keys("2025-05", 4).map((k) => sund(k))];
    expect(vaekst(grundlag(rows), NU).status).toBe("ikke_nok_data");
  });
  it("sammenligning under grundlagsgrænsen → ikke nok data (procentbomben)", () => {
    const rows = [...keys("2026-03", 3).map((k) => sund(k, { revenue: VAEKST_MIN_GRUNDLAG_KR / 3 - 1 })), ...keys("2026-06", 3).map((k) => sund(k))];
    expect(vaekst(grundlag(rows), NU).status).toBe("ikke_nok_data");
  });
  it("fald på 50 % mætter ved 0; tidobling mætter ved 250", () => {
    const halv = [...keys("2026-03", 3).map((k) => sund(k, { revenue: 200_000 })), ...keys("2026-06", 3).map((k) => sund(k))];
    expect(pointAf(vaekst(grundlag(halv), NU))).toBe(0);
    const ti = [...keys("2026-03", 3).map((k) => sund(k, { revenue: 10_000 })), ...keys("2026-06", 3).map((k) => sund(k))];
    expect(pointAf(vaekst(grundlag(ti), NU))).toBe(250);
  });
  it("færre end tre målte → ikke nok data", () => {
    expect(vaekst(grundlag([sund("2026-07"), sund("2026-08")]), NU).status).toBe("ikke_nok_data");
  });
  it("friskhed: et år gamle tal giver ingen vækst-dom, selv med fuld sammenligning", () => {
    const rows = [...keys("2024-06", 3), ...keys("2025-06", 3)].map((k) => sund(k));
    expect(vaekst(grundlag(rows), NU).status).toBe("ikke_nok_data");
    const friske = [...keys("2025-01", 3), ...keys("2026-01", 3)].map((k) => sund(k));
    expect(vaekst(grundlag(friske), NU).status).toBe("ok");
  });
});

describe("disciplinVindue — de seneste 6 måneder med passeret frist, tidligst første hele måned efter kontraktstart", () => {
  it("30/9: august har passeret frist → marts–august", () => {
    expect(disciplinVindue(null, NU)).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
  });
  it("kontraktstart 15/6 → juli–august; den 1/6 → juni–august (måneden er hel)", () => {
    expect(disciplinVindue("2026-06-15", NU)).toEqual(["2026-07", "2026-08"]);
    expect(disciplinVindue("2026-06-01", NU)).toEqual(["2026-06", "2026-07", "2026-08"]);
  });
  it("kontraktstart 20/9 → tomt (ingen hel måned afsluttet med frist)", () => {
    expect(disciplinVindue("2026-09-20", NU)).toEqual([]);
  });
});

describe("disciplin — rytme 150 + rettidighed 50 + budget 25 + mål 25", () => {
  it("alle seks målte til tiden, budget og mål → 250", () => {
    const d = disciplin(grundlag(keys("2026-03", 6).map((k) => sund(k)), { harBudgetForAaret: true, harMaal: true }), NU);
    expect(d.status === "ok" && d.point).toBe(SOEJLE_MAX.disciplin);
  });
  it("3 af 6 målte, 2 af de 3 til tiden, intet budget/mål: 150 × 3/6 + 50 × 2/3 = 75 + 33,3 (kontraktstart 1/3 → vinduet er marts–august)", () => {
    const rows = [sund("2026-04"), sund("2026-06"), sund("2026-08", {}, { foersteGodkendtAt: "2026-09-20T00:00:00Z" })];
    const d = disciplin(grundlag(rows, { kontraktStart: "2026-03-01" }), NU);
    expect(d.status).toBe("ok");
    if (d.status !== "ok") return;
    expect(d.detaljer).toMatchObject({ maalte: 3, rettidige: 2, rytmePoint: 75, budgetPoint: 0, maalPoint: 0 });
    expect(d.detaljer.rettidighedPoint).toBeCloseTo(33.33, 1);
    expect(d.point).toBeCloseTo(108.33, 1);
  });
  it("uden kontraktstart begynder vinduet måneden efter den tidligste godkendelse: samme rækker → juni–august, 2 af 3 målte, 1 af 2 til tiden", () => {
    const rows = [sund("2026-04"), sund("2026-06"), sund("2026-08", {}, { foersteGodkendtAt: "2026-09-20T00:00:00Z" })];
    const d = disciplin(grundlag(rows), NU); // april godkendt 5/5 → første tællende måned er juni
    expect(d.status).toBe("ok");
    if (d.status !== "ok") return;
    expect(d.detaljer).toMatchObject({ vindue: ["2026-06", "2026-07", "2026-08"], maalte: 2, rettidige: 1, rytmePoint: 100, rettidighedPoint: 25 });
  });
  it("fravær tæller HER: ingen målte måneder → rytme 0, rettidighed 0 (ikke NaN), kun budget/mål", () => {
    const d = disciplin(grundlag([], { harBudgetForAaret: true }), NU);
    expect(d.status === "ok" && d.point).toBe(DISCIPLIN_BUDGET_POINT);
    const d2 = disciplin(grundlag([], { harMaal: true }), NU);
    expect(d2.status === "ok" && d2.point).toBe(DISCIPLIN_MAAL_POINT);
  });
  it("nyt medlem uden hel måned → ikke nok data (ikke 0)", () => {
    expect(disciplin(grundlag([], { kontraktStart: "2026-09-20" }), NU).status).toBe("ikke_nok_data");
  });
  it("estimater tæller ikke som målte", () => {
    const d = disciplin(grundlag(keys("2026-03", 6).map((k) => sund(k, {}, { basis: "estimated" }))), NU);
    expect(d.status === "ok" && d.point).toBe(0);
  });
  it("den åbne måned (september) er ikke i vinduet — hverken som mangel eller som plus", () => {
    const med = disciplin(grundlag([...keys("2026-03", 6).map((k) => sund(k)), sund("2026-09")]), NU);
    const uden = disciplin(grundlag(keys("2026-03", 6).map((k) => sund(k))), NU);
    expect(med.status === "ok" && med.point).toBe(uden.status === "ok" && uden.point);
  });
});
