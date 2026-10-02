import { describe, expect, it } from "vitest";
import { boardroomScore, enMaanedTilbage, grundlagPaa, krTekst, MIN_SOEJLER_MED_DATA, samlet, vaelgLoefterMest } from "@/lib/boardroomScore/score";
import { naesteMaaned } from "@/lib/boardroomScore/streak";
import type { Handling, ScoreGrundlag, ScoreMaaned, SoejleDom, SoejleNavn } from "@/lib/boardroomScore/typer";

/* Den samlede score (docs/boardroom-score.md §2.5–§3): Σ point over ALLE fire
   søjler, en søjle uden data giver 0 (Jonas 1/10-2026: «drop opskaleringen»);
   null under MIN_SOEJLER_MED_DATA; forrige = én måned tilbage; handlinger som
   marginal effekt på den samlede score. */

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

/** 15 sunde måneder, juni 2025 – august 2026: alle fire søjler har data. */
const FULD = grundlag(keys("2025-06", 15).map((k) => sund(k)));

const ok = <N extends SoejleNavn>(navn: N, point: number): SoejleDom<N> => ({ navn, max: 250, status: "ok", point, detaljer: {} as never });
const mangler = <N extends SoejleNavn>(navn: N): SoejleDom<N> => ({ navn, max: 250, status: "ikke_nok_data", grund: "test" });

describe("samlet", () => {
  it("fire søjler: Σ point / 1000 × 1000, afrundet", () => {
    const s = samlet({ likviditet: ok("likviditet", 158.33), indtjening: ok("indtjening", 200), vaekst: ok("vaekst", 125), disciplin: ok("disciplin", 250) });
    expect(s).toEqual({ score: 733, daekning: 1, medData: 4 });
  });
  it("tre søjler skaleres IKKE op — likviditet uden data giver 0: 0 + 200 + 125 + 250 = 575 (før 1/10: 767)", () => {
    const s = samlet({ likviditet: mangler("likviditet"), indtjening: ok("indtjening", 200), vaekst: ok("vaekst", 125), disciplin: ok("disciplin", 250) });
    expect(s).toEqual({ score: 575, daekning: 0.75, medData: 3 });
  });
  it("Brilleværk (målt i drift 1/10): indtjening 250 + disciplin 150 + to søjler uden data = 400, ikke (250 + 150) / 500 × 1000 = 800", () => {
    const s = samlet({ likviditet: mangler("likviditet"), indtjening: ok("indtjening", 250), vaekst: mangler("vaekst"), disciplin: ok("disciplin", 150) });
    expect(s).toEqual({ score: 400, daekning: 0.5, medData: 2 });
  });
  it("egenskab: at lægge en søjle til kan aldrig sænke scoren — alle delmængder × alle pointniveauer", () => {
    // Uden fast-check i huset: udtømmende over et gitter. For hver tilstand (hver søjle enten uden data
    // eller med et af NIVEAUER) og hver søjle uden data: tilføj den med hvert niveau og sammenlign.
    const NAVNE: SoejleNavn[] = ["likviditet", "indtjening", "vaekst", "disciplin"];
    const NIVEAUER = [0, 0.4, 37.5, 125, 158.33, 249.6, 250];
    const VALG: (number | null)[] = [null, ...NIVEAUER];
    const byg = (v: (number | null)[]) =>
      Object.fromEntries(NAVNE.map((n, i) => [n, v[i] === null ? mangler(n) : ok(n, v[i] as number)])) as Parameters<typeof samlet>[0];
    let sammenligninger = 0;
    const rek = (v: (number | null)[]): void => {
      if (v.length < NAVNE.length) {
        for (const x of VALG) rek([...v, x]);
        return;
      }
      const foer = samlet(byg(v)).score;
      v.forEach((x, i) => {
        if (x !== null) return;
        for (const p of NIVEAUER) {
          const efter = samlet(byg(v.map((y, j) => (j === i ? p : y)))).score;
          // null → tal er et løft (scoren opstår); tal → null kan ikke ske (flere søjler med data).
          const medDataEfter = v.filter((y) => y !== null).length + 1;
          if (medDataEfter >= MIN_SOEJLER_MED_DATA) expect(efter).not.toBeNull();
          if (foer !== null) expect(efter as number).toBeGreaterThanOrEqual(foer);
          sammenligninger++;
        }
      });
    };
    rek([]);
    expect(sammenligninger).toBeGreaterThan(1000);
  });
  it(`under ${MIN_SOEJLER_MED_DATA} søjler → null, aldrig et opdigtet tal`, () => {
    const s = samlet({ likviditet: mangler("likviditet"), indtjening: mangler("indtjening"), vaekst: mangler("vaekst"), disciplin: ok("disciplin", 250) });
    expect(s).toEqual({ score: null, daekning: 0.25, medData: 1 });
  });
});

describe("boardroomScore — det fulde grundlag", () => {
  const d = boardroomScore(FULD, NU);

  it("733: likviditet 158,3 (runway 3,33) + indtjening 200 (10 %) + vækst 125 (0 % år-mod-år) + disciplin 250", () => {
    expect(d.score).toBe(733);
    expect(d.daekning).toBe(1);
    expect(d.ikkeNokData).toBeNull();
    expect(d.soejler.vaekst.status === "ok" && d.soejler.vaekst.detaljer.sammenligning).toBe("aar_til_aar");
  });
  it("forrige regnes af de rækker, der var godkendt én måned tilbage — her det samme", () => {
    // 30/8: august (godkendt 5/9) var der ikke; maj–juli bærer tallene, vækst mod feb–apr (kvartal), disciplin feb–jul = 250.
    expect(d.forrige).toBe(733);
  });

  it("forrige ser ikke en måned, der først blev godkendt efter tidspunktet (rådets fund 4)", () => {
    // Juli med vild omsætning, men godkendt 15/9 — 30/8 fandtes den ikke, så forrige er regnet uden den.
    const rows = FULD.maaneder.map((m) => (m.key === "2026-07" ? sund(m.key, { revenue: 1_000_000, ebt: 900_000 }, { foersteGodkendtAt: "2026-09-15T09:00:00Z" }) : m));
    const d2 = boardroomScore(grundlag(rows), NU);
    expect(d2.score).toBeGreaterThan(733);
    const foer = new Date("2026-08-30T10:00:00Z");
    const forventet = boardroomScore(grundlag(rows.filter((m) => m.key !== "2026-07")), foer);
    expect(d2.forrige).toBe(forventet.score);
    expect(d2.forrige).not.toBe(d2.score);
  });

  it("grundlagPaa: rækker uden kendt godkendelse var der ikke", () => {
    const g = grundlag([sund("2026-07", {}, { foersteGodkendtAt: null }), sund("2026-08")]);
    expect(grundlagPaa(g, new Date("2026-09-30T00:00:00Z")).maaneder.map((m) => m.key)).toEqual(["2026-08"]);
    expect(grundlagPaa(g, new Date("2026-09-01T00:00:00Z")).maaneder).toEqual([]);
  });
  it("streaken: 15 måneder til tiden, aktiv (kontraktstart 1/1-2025 ligger før dem alle)", () => {
    expect(d.streak.laengde).toBe(15);
    expect(d.streak.status).toBe("aktiv");
  });
  it("uden kontraktstart tæller streaken fra måneden efter den tidligste godkendelse: juni 2025 godkendt 5/7 → fra august 2025 = 13", () => {
    const d2 = boardroomScore(grundlag([...FULD.maaneder], { kontraktStart: null }), NU);
    expect(d2.streak.laengde).toBe(13);
    expect(d2.score).toBe(733);
  });
  it("handlinger: én pr. søjle med gevinsten i samlet score", () => {
    const pr = Object.fromEntries(d.handlinger.map((h) => [h.soejle, h])) as Record<SoejleNavn, Handling>;
    // Godkend september: uden = 225 (rytme 125 + rettidig 50 + 25 + 25) → 708; med = 250 → 733.
    expect(pr.disciplin).toEqual({ soejle: "disciplin", tekst: "Upload og godkend september senest 20/10.", gevinst: 25, sti: "/reports" });
    // Runway 3,33 → 4,33: 183,3 − 158,3 = +25.
    expect(pr.likviditet.gevinst).toBe(25);
    expect(pr.likviditet.tekst).toBe("Én måneds omkostninger mere i banken (60.000 kr.).");
    // Margin 10 % → 11 %: 205 − 200 = +5.
    expect(pr.indtjening.gevinst).toBe(5);
    // Vækst 0 % → 5 %: 157,5 − 125 = +32,5 → 766 − 733 = 33.
    expect(pr.vaekst.gevinst).toBe(33);
    expect(d.loefterMest?.soejle).toBe("vaekst");
  });
});

describe("boardroomScore — kanter", () => {
  it("nyt medlem uden tal: score null, disciplin har data (fravær), handlingen er «Godkend september»", () => {
    const d = boardroomScore(grundlag([], { harBudgetForAaret: false, harMaal: false, kontraktStart: "2026-05-01" }), NU);
    expect(d.score).toBeNull();
    expect(d.ikkeNokData).toContain("likviditet, indtjening, vaekst");
    expect(d.soejler.disciplin.status === "ok" && d.soejler.disciplin.point).toBe(0);
    expect(d.streak.status).toBe("ingen");
    // Gevinsten kan ikke regnes, når scoren ikke findes på nogen side — men handlingen står.
    expect(d.loefterMest).toMatchObject({ soejle: "disciplin", tekst: "Upload og godkend september senest 20/10.", gevinst: null });
  });

  it("helt nyt medlem (kontraktstart i denne måned): alle fire søjler mangler, ingen NaN", () => {
    const d = boardroomScore(grundlag([], { kontraktStart: "2026-09-20" }), NU);
    expect(d.score).toBeNull();
    expect(d.daekning).toBe(0);
    expect(d.forrige).toBeNull();
    expect(Object.values(d.soejler).every((s) => s.status === "ikke_nok_data")).toBe(true);
  });

  it("to måneder: indtjening + disciplin bærer scoren, dækning 0,5 — de to andre giver 0", () => {
    const d = boardroomScore(grundlag([sund("2026-07", { cash: null }), sund("2026-08", { cash: null })]), NU);
    expect(d.daekning).toBe(0.5);
    // indtjening 200 + disciplin (2/6 målte: 50 + 50 + 25 + 25 = 150) + 0 + 0 = 350 (før 1/10: 350 / 500 × 1000 = 700).
    expect(d.score).toBe(350);
    expect(d.soejler.likviditet.status).toBe("ikke_nok_data");
    expect(d.soejler.vaekst.status).toBe("ikke_nok_data");
  });

  it("den åbne måned allerede godkendt: disciplin-handlingen bliver «måneden mangler» for et hul, ellers budget/mål", () => {
    const rows = [...keys("2026-03", 5).map((k) => sund(k)), sund("2026-09", {}, { foersteGodkendtAt: "2026-09-30T08:00:00Z" })];
    const d = boardroomScore(grundlag(rows), NU); // august mangler
    expect(d.handlinger.find((h) => h.soejle === "disciplin")?.tekst).toBe("Upload og godkend august — måneden mangler.");
    const d2 = boardroomScore(grundlag([...keys("2026-03", 6).map((k) => sund(k)), sund("2026-09")], { harBudgetForAaret: false }), NU);
    expect(d2.handlinger.find((h) => h.soejle === "disciplin")?.tekst).toBe("Læg et budget for 2026.");
    const d3 = boardroomScore(grundlag([...keys("2026-03", 6).map((k) => sund(k)), sund("2026-09")], { harMaal: false }), NU);
    expect(d3.handlinger.find((h) => h.soejle === "disciplin")).toMatchObject({ tekst: "Sæt et mål med en frist.", gevinst: 25, sti: "/milestones" });
    // Runde 2, fund 1: fylder de ubekræftede databasens pladser (3), afviser databasen «Sæt» — vejen er «Behold».
    const d3b = boardroomScore(grundlag([...keys("2026-03", 6).map((k) => sund(k)), sund("2026-09")], { harMaal: false, ubekraeftedeMaal: 3 }), NU);
    expect(d3b.handlinger.find((h) => h.soejle === "disciplin")).toMatchObject({ tekst: "Sig ja til et af jeres mål med en frist.", gevinst: 25, sti: "/milestones" });
    const d3c = boardroomScore(grundlag([...keys("2026-03", 6).map((k) => sund(k)), sund("2026-09")], { harMaal: false, ubekraeftedeMaal: 2 }), NU);
    expect(d3c.handlinger.find((h) => h.soejle === "disciplin")?.tekst).toBe("Sæt et mål med en frist.");
    const d4 = boardroomScore(grundlag([...keys("2026-03", 6).map((k) => sund(k)), sund("2026-09")]), NU);
    expect(d4.handlinger.find((h) => h.soejle === "disciplin")).toBeUndefined();
  });

  it("negative tal og nul: et tabsgivende selskab med negativ bank får 0 i likviditet og indtjening, aldrig NaN", () => {
    const rows = keys("2026-03", 6).map((k) => sund(k, { ebt: -50_000, gross_profit: 10_000, cash: -20_000 }));
    const d = boardroomScore(grundlag(rows), NU);
    expect(d.soejler.likviditet.status === "ok" && d.soejler.likviditet.point).toBe(0);
    expect(d.soejler.indtjening.status === "ok" && d.soejler.indtjening.point).toBe(0);
    expect(d.score).toBe(Math.round(((0 + 0 + 125 + 250) / 1000) * 1000));
    expect(Number.isFinite(d.score as number)).toBe(true);
  });

  it("ekstreme værdier mætter — scoren kan aldrig overstige 1000", () => {
    const rows = [...keys("2025-06", 3).map((k) => sund(k, { revenue: 10_000 })), ...keys("2025-09", 12).map((k) => sund(k, { revenue: 9_000_000, ebt: 8_000_000, cash: 1e12 }))];
    const d = boardroomScore(grundlag(rows), NU);
    expect(d.score).toBe(1000);
  });

  it("estimater påvirker intet: samme score med og uden årsregnskabets tolv estimerede rækker", () => {
    const med = grundlag([...keys("2025-01", 12).map((k) => sund(k, { revenue: 5 }, { basis: "estimated" })), ...keys("2026-03", 6).map((k) => sund(k))]);
    const uden = grundlag(keys("2026-03", 6).map((k) => sund(k)));
    expect(boardroomScore(med, NU).score).toBe(boardroomScore(uden, NU).score);
  });

  it("stabilitet: én vild måned flytter højst en tredjedel af vinduet", () => {
    const rolig = boardroomScore(FULD, NU).score as number;
    const vild = boardroomScore(grundlag(FULD.maaneder.map((m) => (m.key === "2026-08" ? sund(m.key, { revenue: 1_000_000, ebt: 900_000 }) : m))), NU).score as number;
    // Indtjening: (10.000 + 10.000 + 900.000) / 1.200.000 = 76 % → 250 (+50); vækst: 1,2 mio. mod 300.000 → 250 (+125). Aldrig mere.
    expect(vild - rolig).toBeLessThanOrEqual(175);
    expect(vild).toBeGreaterThan(rolig);
  });

  it("sæson: uden året før mærkes sammenligningen som kvartal-mod-kvartal", () => {
    const d = boardroomScore(grundlag(keys("2026-03", 6).map((k) => sund(k))), NU);
    expect(d.soejler.vaekst.status === "ok" && d.soejler.vaekst.detaljer.sammenligning).toBe("kvartal_til_kvartal");
  });
});

describe("vaelgLoefterMest", () => {
  const h = (soejle: SoejleNavn, gevinst: number | null): Handling => ({ soejle, tekst: soejle, gevinst, sti: null });
  it("størst gevinst vinder", () => {
    expect(vaelgLoefterMest([h("disciplin", 10), h("vaekst", 30)])?.soejle).toBe("vaekst");
  });
  it("ved lige: disciplin før likviditet før indtjening før vækst", () => {
    expect(vaelgLoefterMest([h("vaekst", 20), h("indtjening", 20), h("disciplin", 20)])?.soejle).toBe("disciplin");
    expect(vaelgLoefterMest([h("vaekst", 20), h("likviditet", 20)])?.soejle).toBe("likviditet");
  });
  it("ingen gevinst > 0: første handling uden data, ellers null", () => {
    expect(vaelgLoefterMest([h("disciplin", 0), h("likviditet", null)])?.soejle).toBe("likviditet");
    expect(vaelgLoefterMest([h("disciplin", 0)])).toBeNull();
    expect(vaelgLoefterMest([])).toBeNull();
  });
});

describe("hjælpere", () => {
  it("enMaanedTilbage holder klokkeslættet i dansk tid og klipper dagen", () => {
    expect(enMaanedTilbage(new Date("2026-09-30T10:00:00Z")).toISOString()).toBe("2026-08-30T10:00:00.000Z");
    // 31/3 kl. 12 dansk (CEST) → 28/2 kl. 12 dansk (CET) = 11:00Z.
    expect(enMaanedTilbage(new Date("2026-03-31T10:00:00Z")).toISOString()).toBe("2026-02-28T11:00:00.000Z");
  });
  it("krTekst: hele kroner, dansk tusindtal, uden fortegn", () => {
    expect(krTekst(60_000)).toBe("60.000");
    expect(krTekst(-1_234_567.8)).toBe("1.234.568");
    expect(krTekst(999)).toBe("999");
  });
});
