import { describe, expect, it } from "vitest";
import { likviditet, type ScoreMaaned } from "@/lib/boardroomScore";
import {
  dageMellem,
  doemMaalFrist,
  doemNytMaal,
  fristTekst,
  kraeverPrMaanedFor,
  laesArt,
  laesNoegle,
  MAAL_ORD,
  maalKort,
  naesteSkridt,
  nuvaerendeTal,
  nytMaalForslag,
  prTekst,
  sporet,
  startDato,
  tidslinje,
  tidslinjeStart,
  vaerdiTekst,
  DAGE_PR_MAANED,
  erSammenhaengende,
  gammelTalvisning,
  periodeTekst,
  sidsteDagIMaaned,
  skarptForslag,
  skridtKilde,
  foreslaaTitel,
  talDato,
  type MaalMedTal,
  type SkridtTilMaal,
  type TalDom,
} from "../maalTal";

// 1/10-2026 kl. 12 dansk: september er afsluttet; seneste passerede frist er
// august (fristen den 20. sep.); de friske måneder er marts–september.
const NU = new Date("2026-10-01T10:00:00Z");

const m = (key: string, metrics: Record<string, number | null>, basis: "measured" | "estimated" = "measured"): ScoreMaaned => ({
  key,
  basis,
  foersteGodkendtAt: null,
  metrics,
});

const maal = (over: Partial<MaalMedTal> = {}): MaalMedTal => ({
  id: "m1",
  title: "Omsætning på 2 mio. om året",
  status: "active",
  deadline: "2027-04-01",
  created_at: "2026-04-01T08:00:00Z",
  target_value: 2_000_000,
  current_value: null,
  unit: "kr.",
  art: "tal",
  maal_noegle: "omsaetning_aarstakt",
  udgangspunkt: 1_000_000,
  udgangspunkt_dato: "2026-04-01",
  ...over,
});

/** Et LÆST tal pr. september — datoen bag tallet er 30/9 (fund 1). */
const ok = (vaerdi: number): TalDom => ({ status: "ok", vaerdi, prMaaned: "2026-09", grundlag: 3, forklaring: "", enhed: "kr" });
/** Et TASTET tal (andet_tal) — datoen bag tallet er i dag. */
const tastet = (vaerdi: number): TalDom => ({ status: "ok", vaerdi, prMaaned: null, grundlag: 0, forklaring: "", enhed: "egen" });

describe("laesArt / laesNoegle — et felt fra databasen er en observation", () => {
  it("kender kun ordforrådet", () => {
    expect(laesArt("tal")).toBe("tal");
    expect(laesArt("begivenhed")).toBe("begivenhed");
    expect(laesArt("Tal")).toBeNull();
    expect(laesArt(null)).toBeNull();
    expect(laesNoegle("db_grad")).toBe("db_grad");
    expect(laesNoegle("omsaetning")).toBeNull();
  });
});

describe("nuvaerendeTal", () => {
  const tre = [m("2026-07", { revenue: 100_000 }), m("2026-08", { revenue: 120_000 }), m("2026-09", { revenue: 140_000 })];

  it("omsætningens årstakt = gennemsnit af de seneste 3 målte måneder × 12", () => {
    const d = nuvaerendeTal("omsaetning_aarstakt", tre, NU);
    expect(d).toMatchObject({ status: "ok", vaerdi: 120_000 * 12, prMaaned: "2026-09", grundlag: 3, enhed: "kr" });
  });

  it("tager kun de 3 seneste, springer estimater og den åbne måned over", () => {
    const d = nuvaerendeTal(
      "omsaetning_aarstakt",
      [m("2026-05", { revenue: 1 }), ...tre, m("2026-10", { revenue: 9_999_999 }), m("2026-06", { revenue: 9_999_999 }, "estimated")],
      NU,
    );
    expect(d.status === "ok" && d.vaerdi).toBe(1_440_000);
  });

  it.each([0, 1, 2])("%i målte måneder → mangler («for få godkendte måneder»)", (n) => {
    const d = nuvaerendeTal("omsaetning_aarstakt", tre.slice(0, n), NU);
    expect(d.status).toBe("mangler");
    expect(d.status === "mangler" && d.grund).toBe(MAAL_ORD.forFaaMaaneder(n));
  });

  it("en måned uden tallet tæller ikke med (manglende nøgle er umålt, aldrig 0) — og bryder rækken (fund 2)", () => {
    // juni, juli, (august uden omsætning), september → de tre seneste med tallet hænger ikke sammen
    const d = nuvaerendeTal("omsaetning_aarstakt", [m("2026-06", { revenue: 60_000 }), m("2026-07", { revenue: 100_000 }), m("2026-08", { ebt: 5 }), m("2026-09", { revenue: 140_000 })], NU);
    expect(d).toEqual({ status: "mangler", grund: MAAL_ORD.ikkeSammenhaengende });
    // en ÆLDRE måned uden tallet rører ikke de tre seneste
    const ok3 = nuvaerendeTal("omsaetning_aarstakt", [m("2026-06", { ebt: 5 }), m("2026-07", { revenue: 100_000 }), m("2026-08", { revenue: 120_000 }), m("2026-09", { revenue: 140_000 })], NU);
    expect(ok3.status === "ok" && ok3.vaerdi).toBe(1_440_000);
  });

  describe("tre SAMMENHÆNGENDE måneder (fund 2)", () => {
    it.each([
      ["omsaetning_aarstakt", { revenue: 100_000 }],
      ["resultat_aarstakt", { ebt: 10_000 }],
      ["db_grad", { revenue: 100_000, gross_profit: 40_000 }],
    ] as const)("%s: et hul (juni, juli, september) → mangler", (noegle, met) => {
      const d = nuvaerendeTal(noegle, [m("2026-06", met), m("2026-07", met), m("2026-09", met)], NU);
      expect(d).toEqual({ status: "mangler", grund: MAAL_ORD.ikkeSammenhaengende });
    });
    it.each([
      ["omsaetning_aarstakt", { revenue: 100_000 }],
      ["resultat_aarstakt", { ebt: 10_000 }],
      ["db_grad", { revenue: 100_000, gross_profit: 40_000 }],
    ] as const)("%s: gammel + ny (september 2025, august og september 2026) → mangler", (noegle, met) => {
      const d = nuvaerendeTal(noegle, [m("2025-09", met), m("2026-08", met), m("2026-09", met)], NU);
      expect(d).toEqual({ status: "mangler", grund: MAAL_ORD.ikkeSammenhaengende });
    });
    it("over et årsskifte hænger november–december–januar sammen", () => {
      const nu = new Date("2026-02-25T10:00:00Z"); // januar afsluttet og fristen (20/2) passeret
      const d = nuvaerendeTal("omsaetning_aarstakt", [m("2025-11", { revenue: 30_000 }), m("2025-12", { revenue: 30_000 }), m("2026-01", { revenue: 30_000 })], nu);
      expect(d).toMatchObject({ status: "ok", vaerdi: 360_000, prMaaned: "2026-01" });
      expect(d.status === "ok" && d.forklaring).toBe("Gennemsnittet af november 2025 – januar 2026 gange 12.");
    });
    it("periodeTekst passer til perioden; erSammenhaengende", () => {
      expect(periodeTekst(["2026-07", "2026-08", "2026-09"])).toBe("juli – september 2026");
      expect(periodeTekst(["2025-11", "2025-12", "2026-01"])).toBe("november 2025 – januar 2026");
      expect(periodeTekst(["2026-09"])).toBe("september 2026");
      expect(erSammenhaengende(["2025-12", "2026-01", "2026-02"])).toBe(true);
      expect(erSammenhaengende(["2026-07", "2026-09"])).toBe(false);
      const d = nuvaerendeTal("db_grad", [m("2026-07", { revenue: 100_000, gross_profit: 40_000 }), m("2026-08", { revenue: 100_000, gross_profit: 40_000 }), m("2026-09", { revenue: 100_000, gross_profit: 40_000 })], NU);
      expect(d.status === "ok" && d.forklaring).toBe("Dækningsbidraget delt med omsætningen for juli – september 2026.");
    });
  });

  it("friskhed: et tal ældre end Score's friske vindue er «mangler» med grunden", () => {
    const gamle = [m("2025-12", { revenue: 1 }), m("2026-01", { revenue: 1 }), m("2026-02", { revenue: 1 })];
    const d = nuvaerendeTal("omsaetning_aarstakt", gamle, NU);
    expect(d.status).toBe("mangler");
    expect(d.status === "mangler" && d.grund).toContain("februar 2026");
    // marts er den ældste friske måned 1/10 → ok
    expect(nuvaerendeTal("omsaetning_aarstakt", [m("2026-01", { revenue: 1 }), m("2026-02", { revenue: 1 }), m("2026-03", { revenue: 1 })], NU).status).toBe("ok");
  });

  it("resultatets årstakt bruger ebt, ellers ebtRegnet af posterne (Score's resultatAf)", () => {
    const d = nuvaerendeTal(
      "resultat_aarstakt",
      [m("2026-07", { ebt: 10_000 }), m("2026-08", { ebt: -4_000 }), m("2026-09", { gross_profit: 50_000, payroll: 30_000, depreciation: 1_000 })],
      NU,
    );
    // sep: 50.000 − 30.000 − 1.000 = 19.000
    expect(d.status === "ok" && d.vaerdi).toBe(((10_000 - 4_000 + 19_000) / 3) * 12);
  });

  it("dækningsgraden = 100 × Σ dækningsbidrag ÷ Σ omsætning (vægtet, ikke gennemsnit af procenter)", () => {
    const d = nuvaerendeTal(
      "db_grad",
      [m("2026-07", { revenue: 100_000, gross_profit: 50_000 }), m("2026-08", { revenue: 300_000, gross_profit: 90_000 }), m("2026-09", { revenue: 100_000, gross_profit: 40_000 })],
      NU,
    );
    expect(d).toMatchObject({ status: "ok", enhed: "pct", prMaaned: "2026-09" });
    expect(d.status === "ok" && d.vaerdi).toBeCloseTo(36, 10); // 180.000 / 500.000
  });

  it("dækningsgraden: omsætning ≤ 0 → mangler", () => {
    const d = nuvaerendeTal("db_grad", [m("2026-07", { revenue: 0, gross_profit: 0 }), m("2026-08", { revenue: 0, gross_profit: 0 }), m("2026-09", { revenue: 0, gross_profit: 0 })], NU);
    expect(d).toEqual({ status: "mangler", grund: MAAL_ORD.ingenOmsaetning });
  });

  it("likviditeten er Score's runway — samme tal", () => {
    const mdr = [m("2026-08", { cash: 300_000, payroll: 80_000, cogs: 20_000 }), m("2026-09", { cash: 400_000, payroll: 80_000, cogs: 20_000 })];
    const score = likviditet({ maaneder: mdr, kontraktStart: null, harBudgetForAaret: false, harMaal: false }, NU);
    const d = nuvaerendeTal("likviditet_mdr", mdr, NU);
    expect(score.status).toBe("ok");
    expect(d).toMatchObject({ status: "ok", vaerdi: score.status === "ok" ? score.detaljer.runwayMaaneder : NaN, prMaaned: "2026-09", grundlag: 2, enhed: "mdr" });
    expect(d.status === "ok" && d.vaerdi).toBe(4); // 400.000 / 100.000
  });

  it("likviditeten uden banktal → mangler med Score's grund", () => {
    expect(nuvaerendeTal("likviditet_mdr", [m("2026-09", { payroll: 1 })], NU)).toEqual({ status: "mangler", grund: "Ingen målt måned har et banktal." });
  });

  it("andet_tal er rækkens tastede tal", () => {
    expect(nuvaerendeTal("andet_tal", [], NU, 42)).toMatchObject({ status: "ok", vaerdi: 42, prMaaned: null, grundlag: 0, enhed: "egen" });
    expect(nuvaerendeTal("andet_tal", [], NU, null)).toEqual({ status: "mangler", grund: MAAL_ORD.tastTallet });
  });
});

describe("startDato — dansk dato af created_at", () => {
  it("sommertid: 30/6 22:30Z er 1/7 i Danmark", () => {
    expect(startDato({ udgangspunkt_dato: null, created_at: "2026-06-30T22:30:00Z" })).toBe("2026-07-01");
    expect(startDato({ udgangspunkt_dato: null, created_at: "2026-06-30T21:30:00Z" })).toBe("2026-06-30");
  });
  it("vintertid: 31/12 23:30Z er 1/1 i Danmark; 22:59Z er stadig 31/12", () => {
    expect(startDato({ udgangspunkt_dato: null, created_at: "2026-12-31T23:30:00Z" })).toBe("2027-01-01");
    expect(startDato({ udgangspunkt_dato: null, created_at: "2026-12-31T22:59:00Z" })).toBe("2026-12-31");
  });
  it("udgangspunkt_dato har forrang", () => {
    expect(startDato({ udgangspunkt_dato: "2026-05-05", created_at: "2026-06-30T22:30:00Z" })).toBe("2026-05-05");
  });
});

describe("datoen bag tallet (fund 1)", () => {
  it("sidsteDagIMaaned", () => {
    expect(sidsteDagIMaaned("2026-08")).toBe("2026-08-31");
    expect(sidsteDagIMaaned("2026-09")).toBe("2026-09-30");
    expect(sidsteDagIMaaned("2028-02")).toBe("2028-02-29");
    expect(sidsteDagIMaaned("2027-02")).toBe("2027-02-28");
    expect(sidsteDagIMaaned("2026-13")).toBeNull();
    expect(sidsteDagIMaaned("x")).toBeNull();
  });
  it("talDato: læst tal → sidste dag i måneden; tastet eller intet tal → dansk i dag", () => {
    expect(talDato(ok(1), NU)).toBe("2026-09-30");
    expect(talDato(tastet(1), NU)).toBe("2026-10-01");
    expect(talDato(null, NU)).toBe("2026-10-01");
    expect(talDato({ status: "mangler", grund: "x" }, NU)).toBe("2026-10-01");
  });
  it("eksemplet: mål 1/10, tal pr. august, frist 1/1 — en måned senere er målet IKKE bagud", () => {
    // udgangspunkt = årstakten pr. august (1,2 mio.); i dag 31/10; september godkendes først ~20/11.
    const kort = maal({ udgangspunkt: 1_200_000, target_value: 1_500_000, udgangspunkt_dato: "2026-10-01", created_at: "2026-10-01T08:00:00Z", deadline: "2027-01-01" });
    const prAugust: TalDom = { status: "ok", vaerdi: 1_200_000, prMaaned: "2026-08", grundlag: 3, forklaring: "", enhed: "kr" };
    const s = sporet(kort, prAugust, new Date("2026-10-31T10:00:00Z"));
    // forventet = clamp((31/8 − 1/10) ÷ (1/1 − 1/10)) = clamp(−31 ÷ 92) = 0
    expect(s.forventetPr).toBe("2026-08-31");
    expect(s.forventetAndel).toBe(0);
    expect(s.andelAfVejen).toBe(0);
    expect(s.status).toBe("paa_sporet");
    // med «i dag» ville forventet være 30/92 ≈ 0,326 og andelen 0 < 0,226 → bagud
    expect(0 < 30 / 92 - 0.1).toBe(true);
    // og et TASTET tal holdes stadig op mod i dag: 30/92 → bagud
    const tastetMaal = { ...kort, maal_noegle: "andet_tal" };
    expect(sporet(tastetMaal, tastet(1_200_000), new Date("2026-10-31T10:00:00Z")).status).toBe("bagud");
  });
  it("når september er godkendt, regnes forventningen pr. 30/9", () => {
    const s = sporet(maal(), ok(1_500_000), NU);
    expect(s.forventetPr).toBe("2026-09-30");
    expect(s.forventetAndel).toBeCloseTo(182 / 365, 10); // 1/4 → 30/9 = 182 dage af 365
  });
});

describe("sporet", () => {
  // start 1/4-2026, frist 1/4-2027 (365 dage); tallet er pr. september → datoen bag tallet
  // 30/9-2026 (182 dage) → forventet 182/365 (fund 1 — ikke «i dag» 1/10, 183/365).
  const forventet = 182 / 365;

  it("forventetAndel og dageTilbage", () => {
    const s = sporet(maal(), ok(1_500_000), NU);
    expect(s.forventetAndel).toBeCloseTo(forventet, 10);
    expect(s.dageTilbage).toBe(182);
  });

  it("på sporet: andel = forventet", () => {
    const s = sporet(maal(), ok(1_000_000 + forventet * 1_000_000), NU);
    expect(s.status).toBe("paa_sporet");
    expect(s.andelAfVejen).toBeCloseTo(forventet, 10);
  });

  it("grænserne: + 0,15 = foran; − 0,10 = på sporet; under = bagud", () => {
    expect(sporet(maal(), ok(1_000_000 + (forventet + 0.15) * 1_000_000 + 1), NU).status).toBe("foran");
    expect(sporet(maal(), ok(1_000_000 + (forventet + 0.15) * 1_000_000 - 100), NU).status).toBe("paa_sporet");
    expect(sporet(maal(), ok(1_000_000 + (forventet - 0.1) * 1_000_000 + 1), NU).status).toBe("paa_sporet");
    expect(sporet(maal(), ok(1_000_000 + (forventet - 0.1) * 1_000_000 - 100), NU).status).toBe("bagud");
    expect(sporet(maal(), ok(900_000), NU).status).toBe("bagud");
  });

  it("måltallet nået i tal → naaet_i_tal (aldrig et lukket mål), ingen «kræver»", () => {
    const s = sporet(maal(), ok(2_000_000), NU);
    expect(s.status).toBe("naaet_i_tal");
    expect(s.kraeverPrMaaned).toBeNull();
  });

  it("sænk-mål: fra 60 mod 30 — 45 er halvvejs; 30 er nået; 70 er bagud", () => {
    const saenk = maal({ maal_noegle: "andet_tal", udgangspunkt: 60, target_value: 30 });
    const halv = sporet(saenk, ok(45), NU);
    expect(halv.saenk).toBe(true);
    expect(halv.andelAfVejen).toBeCloseTo(0.5, 10);
    expect(halv.status).toBe("paa_sporet");
    expect(sporet(saenk, ok(30), NU).status).toBe("naaet_i_tal");
    expect(sporet(saenk, ok(25), NU).status).toBe("naaet_i_tal");
    expect(sporet(saenk, ok(70), NU).status).toBe("bagud");
    // kræver: (30 − 45) ÷ (182 / 30,4375) — negativ: tallet skal NED
    expect(halv.kraeverPrMaaned).toBeCloseTo(-15 / (182 / DAGE_PR_MAANED), 10);
  });

  it("kraeverPrMaaned = (mål − tal) ÷ (dageTilbage ÷ 30,4375)", () => {
    const s = sporet(maal(), ok(1_400_000), NU);
    expect(s.kraeverPrMaaned).toBeCloseTo(600_000 / (182 / DAGE_PR_MAANED), 6);
  });

  it("frist passeret → kræver er null; forventet = 1", () => {
    const s = sporet(maal({ deadline: "2026-09-30" }), ok(1_500_000), NU);
    expect(s.dageTilbage).toBe(-1);
    expect(s.kraeverPrMaaned).toBeNull();
    expect(s.forventetAndel).toBe(1);
    expect(s.status).toBe("bagud");
  });

  it.each([
    ["gammelt mål (art null)", maal({ art: null }), ok(1), "gammelt_maal"],
    ["begivenhed", maal({ art: "begivenhed" }), ok(1), "begivenhed"],
    ["uden tal", maal(), null, "intet_tal"],
    ["tallet mangler", maal(), { status: "mangler", grund: "x" } as TalDom, "intet_tal"],
    ["uden udgangspunkt", maal({ udgangspunkt: null }), ok(1), "intet_udgangspunkt"],
    ["uden måltal", maal({ target_value: null }), ok(1), "intet_maaltal"],
    ["uden frist", maal({ deadline: null }), ok(1), "ingen_frist"],
    ["udgangspunkt = mål", maal({ udgangspunkt: 2_000_000 }), ok(1), "udgangspunkt_er_maal"],
    ["frist før start", maal({ deadline: "2026-03-01" }), ok(1), "frist_foer_start"],
  ] as const)("kan ikke afgøres: %s", (_navn, mm, t, grund) => {
    const s = sporet(mm, t, NU);
    expect(s.status).toBe("kan_ikke_afgoeres");
    expect(s.grund).toBe(grund);
  });

  it("uden frist: dageTilbage og kræver er null", () => {
    const s = sporet(maal({ deadline: null }), ok(1_500_000), NU);
    expect(s.dageTilbage).toBeNull();
    expect(s.kraeverPrMaaned).toBeNull();
    expect(s.forventetAndel).toBeNull();
  });

  it("start fra created_at på den danske dato omkring midnat (sommertid)", () => {
    // created_at 30/6 22:30Z = 1/7 dansk; frist 11/7; i dag 6/7 → 5/10 (med UTC-datoen ville det være 6/11).
    // Et TASTET tal (datoen bag tallet = i dag).
    const mm = maal({ udgangspunkt_dato: null, created_at: "2026-06-30T22:30:00Z", deadline: "2026-07-11", maal_noegle: "andet_tal" });
    expect(sporet(mm, tastet(1_500_000), new Date("2026-07-06T10:00:00Z")).forventetAndel).toBeCloseTo(0.5, 10);
  });

  it("«i dag» er dansk: 31/10 23:30Z (vintertid) er 1/11", () => {
    const s = sporet(maal({ deadline: "2026-11-02" }), ok(1_500_000), new Date("2026-10-31T23:30:00Z"));
    expect(s.dageTilbage).toBe(1);
    // og 22:59Z er stadig 31/10
    expect(sporet(maal({ deadline: "2026-11-02" }), ok(1_500_000), new Date("2026-10-31T22:59:00Z")).dageTilbage).toBe(2);
  });
});

describe("naesteSkridt", () => {
  const sk = (over: Partial<SkridtTilMaal>): SkridtTilMaal => ({ id: "s", title: "t", status: "active", due_date: "2026-10-10", maal_id: "m1", closed_at: null, created_at: "2026-09-01T00:00:00Z", ...over });

  it("det aktive skridt med nærmeste frist — også et forfaldent", () => {
    const d = naesteSkridt(
      "m1",
      [sk({ id: "a", due_date: "2026-10-20" }), sk({ id: "b", due_date: "2026-09-28" }), sk({ id: "c", status: "proposed", due_date: null }), sk({ id: "d", status: "done" })],
      NU,
    );
    expect(d.skridt).toMatchObject({ id: "b", status: "active", frist: "2026-09-28", forfalden: true });
    expect(d.oevrigeAabne).toBe(2);
    expect(d.gjorte).toBe(1);
  });

  it("fristen i dag er ikke forfalden", () => {
    expect(naesteSkridt("m1", [sk({ due_date: "2026-10-01" })], NU).skridt?.forfalden).toBe(false);
  });

  it("lige frister: ældste created_at", () => {
    const d = naesteSkridt("m1", [sk({ id: "ny", created_at: "2026-09-10T00:00:00Z" }), sk({ id: "gl", created_at: "2026-09-02T00:00:00Z" })], NU);
    expect(d.skridt?.id).toBe("gl");
  });

  it("uden aktive: det NYESTE ventende forslag", () => {
    const d = naesteSkridt(
      "m1",
      [sk({ id: "p1", status: "proposed", created_at: "2026-09-02T00:00:00Z" }), sk({ id: "p2", status: "proposed", created_at: "2026-09-20T00:00:00Z" }), sk({ id: "x", status: "dismissed" })],
      NU,
    );
    expect(d.skridt).toMatchObject({ id: "p2", status: "proposed", forfalden: false });
    expect(d.oevrigeAabne).toBe(1);
  });

  it("uden stempler: det seneste ventende i listen", () => {
    const d = naesteSkridt("m1", [sk({ id: "p1", status: "proposed", created_at: null }), sk({ id: "p2", status: "proposed", created_at: null })], NU);
    expect(d.skridt?.id).toBe("p2");
  });

  it("udløbne forslag er ikke et næste skridt og tæller ikke som åbne (fund 6)", () => {
    const d = naesteSkridt(
      "m1",
      [
        sk({ id: "udloebet", status: "proposed", created_at: "2026-09-20T00:00:00Z", expires_at: "2026-09-30T10:00:00Z" }),
        sk({ id: "frisk", status: "proposed", created_at: "2026-09-02T00:00:00Z", expires_at: "2026-10-10T10:00:00Z" }),
        sk({ id: "uden", status: "proposed", created_at: "2026-09-01T00:00:00Z", expires_at: null }),
      ],
      NU,
    );
    expect(d.skridt?.id).toBe("frisk");
    expect(d.oevrigeAabne).toBe(1);
    // grænsen er forsidens: udløbet først EFTER expires_at (nu === expires_at er stadig åbent)
    expect(naesteSkridt("m1", [sk({ id: "p", status: "proposed", expires_at: NU.toISOString() })], NU).skridt?.id).toBe("p");
    expect(naesteSkridt("m1", [sk({ id: "p", status: "proposed", expires_at: "2026-10-01T09:59:59Z" })], NU)).toEqual({ skridt: null, oevrigeAabne: 0, gjorte: 0 });
    // et AKTIVT skridt med expires_at sorteres aldrig fra
    expect(naesteSkridt("m1", [sk({ id: "a", status: "active", expires_at: "2026-01-01T00:00:00Z" })], NU).skridt?.id).toBe("a");
  });

  it("andre måls skridt og lukkede forslag tæller ikke", () => {
    const d = naesteSkridt("m1", [sk({ maal_id: "m2" }), sk({ status: "expired" }), sk({ status: "done" })], NU);
    expect(d).toEqual({ skridt: null, oevrigeAabne: 0, gjorte: 1 });
  });
});

describe("fristTekst", () => {
  it.each([
    [null, "Ingen frist"],
    ["2026-10-01", "i dag"],
    ["2026-10-02", "i morgen"],
    ["2026-09-30", "overskredet i går"],
    ["2026-09-27", "overskredet for 4 dage siden"],
    ["2026-10-08", "om 7 dage"],
    ["2026-10-15", "om 2 uger"],
    ["2026-11-30", "om 8 uger"],
    ["2026-12-01", "om 2 mdr."],
    ["2027-04-01", "om 6 mdr."],
    ["2027-03-31", "om 5 mdr."],
  ])("%s → %s", (frist, tekst) => {
    expect(fristTekst(frist, NU)).toBe(tekst);
  });
});

describe("tal i ord", () => {
  it("vaerdiTekst", () => {
    expect(vaerdiTekst(1_580_000, "kr")).toBe("1,58 mio. kr.");
    expect(vaerdiTekst(12_400_000, "kr")).toBe("12,4 mio. kr.");
    expect(vaerdiTekst(620_400, "kr")).toBe("620.000 kr.");
    expect(vaerdiTekst(-250_000, "kr")).toBe("-250.000 kr.");
    expect(vaerdiTekst(4.25, "mdr")).toBe("4,3 mdr.");
    expect(vaerdiTekst(36, "pct")).toBe("36 %");
    expect(vaerdiTekst(12, "egen", "kunder")).toBe("12 kunder");
    expect(vaerdiTekst(12, "egen", null)).toBe("12");
  });
  it("prTekst: året kun når det ikke er i år", () => {
    expect(prTekst("2026-08", NU)).toBe("pr. august (godkendt)");
    expect(prTekst("2025-12", NU)).toBe("pr. december 2025 (godkendt)");
    expect(prTekst(null, NU)).toBeNull();
  });
});

describe("maalKort", () => {
  const mdr = [m("2026-07", { revenue: 100_000 }), m("2026-08", { revenue: 120_000 }), m("2026-09", { revenue: 140_000 })];

  it("tal-mål: det store tal, pr.-teksten, måltal, sporet og fristen", () => {
    const k = maalKort(maal(), [], mdr, NU);
    expect(k).toMatchObject({
      art: "tal",
      noegle: "omsaetning_aarstakt",
      goerSkarpt: false,
      talTekst: "1,44 mio. kr.",
      prTekst: "pr. september (godkendt)",
      maaltalTekst: "2 mio. kr.",
      udgangspunktTekst: "1 mio. kr.",
      fristTekst: "om 6 mdr.",
      fristDato: "1. apr. 2027",
    });
    // 0,44 af vejen mod forventet 182/365 ≈ 0,499 (pr. 30/9, fund 1) → på sporet (≥ 0,399)
    expect(k.sporet.status).toBe("paa_sporet");
    expect(k.statusOrd).toBe("På sporet");
    expect(k.grundTekst).toBeNull();
  });

  it("gammelt mål (art null): «Gør målet skarpt», intet tal", () => {
    const k = maalKort(maal({ art: null, maal_noegle: null, udgangspunkt: null }), [], mdr, NU);
    expect(k.goerSkarpt).toBe(true);
    expect(k.tal).toBeNull();
    expect(k.talTekst).toBeNull();
    expect(k.statusOrd).toBe("Kan ikke afgøres endnu");
    expect(k.grundTekst).toBe(MAAL_ORD.grund.gammelt_maal);
  });

  it("begivenhed: intet tal, næste skridt bærer kortet", () => {
    const k = maalKort(
      maal({ art: "begivenhed", maal_noegle: null, target_value: 1, udgangspunkt: 0 }),
      [{ id: "s1", title: "Ring til revisor", status: "active", due_date: "2026-10-05", maal_id: "m1" }],
      mdr,
      NU,
    );
    expect(k.tal).toBeNull();
    expect(k.maaltalTekst).toBeNull();
    expect(k.sporet.grund).toBe("begivenhed");
    expect(k.naeste.skridt?.titel).toBe("Ring til revisor");
  });

  it("tal-mål uden nøgle læses som tastet tal (andet_tal)", () => {
    const k = maalKort(maal({ maal_noegle: null, current_value: 1_200_000, unit: "kr." }), [], mdr, NU);
    expect(k.noegle).toBe("andet_tal");
    expect(k.talTekst).toBe("1.200.000 kr.");
    expect(k.prTekst).toBeNull();
  });

  it("månederne kan ikke læses (Score afventer sin migration) → «Tallet kan ikke læses endnu»", () => {
    const k = maalKort(maal(), [], null, NU);
    expect(k.tal).toEqual({ status: "mangler", grund: MAAL_ORD.grund.intet_tal });
    expect(k.sporet.grund).toBe("intet_tal");
  });
});

describe("guiden", () => {
  const mdr = [m("2026-07", { revenue: 100_000 }), m("2026-08", { revenue: 120_000 }), m("2026-09", { revenue: 140_000 })];

  it("nytMaalForslag: udgangspunkt = nuværende tal, frist 12 mdr. frem, kræver pr. måned", () => {
    const f = nytMaalForslag("omsaetning_aarstakt", mdr, NU, { maaltal: 2_000_000 });
    expect(f.udgangspunkt).toMatchObject({ status: "ok", vaerdi: 1_440_000 });
    expect(f.udgangspunktDato).toBe("2026-10-01");
    expect(f.foreslaaetFrist).toBe("2027-10-01");
    expect(f.enhed).toBe("kr");
    expect(f.kraeverPrMaaned).toBeCloseTo(560_000 / (365 / DAGE_PR_MAANED), 6);
  });

  it("nytMaalForslag med egen frist; uden måltal: kræver er null", () => {
    expect(nytMaalForslag("omsaetning_aarstakt", mdr, NU, { maaltal: 2_000_000, frist: "2027-04-01" }).kraeverPrMaaned).toBeCloseTo(560_000 / (182 / DAGE_PR_MAANED), 6);
    expect(nytMaalForslag("omsaetning_aarstakt", mdr, NU).kraeverPrMaaned).toBeNull();
    expect(nytMaalForslag("db_grad", [], NU).udgangspunkt.status).toBe("mangler");
  });

  it("nytMaalForslag: den 31. + 12 mdr. klippes ikke forkert (31/1 → 31/1)", () => {
    expect(nytMaalForslag("andet_tal", [], new Date("2026-01-31T10:00:00Z"), { tastet: 5 }).foreslaaetFrist).toBe("2027-01-31");
  });

  it("kraeverPrMaanedFor: frist i dag eller før → null", () => {
    expect(kraeverPrMaanedFor(1, 2, "2026-10-01", "2026-10-01")).toBeNull();
    expect(kraeverPrMaanedFor(1, 2, "2026-10-01", "2026-09-01")).toBeNull();
  });

  it("doemNytMaal: tal-mål — udgangspunktet ER det nuværende tal; ingen unit, ingen current_value (fund 5, 15)", () => {
    const nuv = nuvaerendeTal("omsaetning_aarstakt", mdr, NU);
    const d = doemNytMaal({ titel: "  Omsætning 2 mio.  ", art: "tal", noegle: "omsaetning_aarstakt", maaltal: 2_000_000, udgangspunkt: 1_440_000, frist: "2027-10-01" }, NU, nuv);
    expect(d).toEqual({
      ok: true,
      felter: { title: "Omsætning 2 mio.", art: "tal", maal_noegle: "omsaetning_aarstakt", target_value: 2_000_000, udgangspunkt: 1_440_000, udgangspunkt_dato: "2026-10-01", deadline: "2027-10-01" },
    });
    expect(d.ok && "unit" in d.felter).toBe(false);
    expect(d.ok && "current_value" in d.felter).toBe(false);
    // uden medsendt udgangspunkt bruges tallet
    const u = doemNytMaal({ titel: "x", art: "tal", noegle: "omsaetning_aarstakt", maaltal: 2_000_000, frist: "2027-10-01" }, NU, nuv);
    expect(u.ok && u.felter.udgangspunkt).toBe(1_440_000);
  });

  it("doemNytMaal: et udgangspunkt, der afviger fra det læste tal, afvises — klienten kan ikke opfinde det (fund 15)", () => {
    const nuv = nuvaerendeTal("omsaetning_aarstakt", mdr, NU);
    expect(doemNytMaal({ titel: "x", art: "tal", noegle: "omsaetning_aarstakt", maaltal: 2_000_000, udgangspunkt: 1_000_000, frist: "2027-10-01" }, NU, nuv)).toEqual({
      ok: false,
      grund: "Udgangspunktet skal være det nuværende tal — det læses af de godkendte måneder",
    });
    // 1 kr. ved siden af 1,44 mio. er stadig en afvigelse (tolerancen er 1e-9 relativt ≈ 0,0014 kr.)
    expect(doemNytMaal({ titel: "x", art: "tal", noegle: "omsaetning_aarstakt", maaltal: 2_000_000, udgangspunkt: 1_440_001, frist: "2027-10-01" }, NU, nuv).ok).toBe(false);
    // uden tal (eller med et «mangler») afvises en husnøgle med tallets egen grund
    expect(doemNytMaal({ titel: "x", art: "tal", noegle: "omsaetning_aarstakt", maaltal: 2_000_000, udgangspunkt: 1_440_000, frist: "2027-10-01" }, NU, null)).toEqual({ ok: false, grund: MAAL_ORD.grund.intet_tal });
    expect(doemNytMaal({ titel: "x", art: "tal", noegle: "omsaetning_aarstakt", maaltal: 2_000_000, frist: "2027-10-01" }, NU, nuvaerendeTal("omsaetning_aarstakt", mdr.slice(0, 2), NU))).toEqual({ ok: false, grund: MAAL_ORD.forFaaMaaneder(2) });
    // et tal for en ANDEN nøgle (forkert enhed) afvises
    expect(doemNytMaal({ titel: "x", art: "tal", noegle: "db_grad", maaltal: 40, frist: "2027-10-01" }, NU, nuv)).toEqual({ ok: false, grund: MAAL_ORD.grund.intet_tal });
  });

  it("doemNytMaal: fristen højst 36 måneder frem (dansk dato, inklusive)", () => {
    expect(doemNytMaal({ titel: "x", art: "begivenhed", frist: "2029-10-01" }, NU).ok).toBe(true);
    expect(doemNytMaal({ titel: "x", art: "begivenhed", frist: "2029-10-02" }, NU)).toEqual({ ok: false, grund: "Fristen kan højst ligge 36 måneder frem (senest 1. okt. 2029)" });
    // dansk dato: 30/9 22:30Z er 1/10 → grænsen er 1/10-2029
    expect(doemNytMaal({ titel: "x", art: "begivenhed", frist: "2029-10-01" }, new Date("2026-09-30T22:30:00Z")).ok).toBe(true);
    expect(doemNytMaal({ titel: "x", art: "begivenhed", frist: "2029-10-01" }, new Date("2026-09-30T21:30:00Z")).ok).toBe(false);
  });

  it("doemNytMaal: dækningsgraden 0–100 og likviditeten ≥ 0 (måltallet)", () => {
    const db = nuvaerendeTal("db_grad", [m("2026-07", { revenue: 100, gross_profit: 30 }), m("2026-08", { revenue: 100, gross_profit: 30 }), m("2026-09", { revenue: 100, gross_profit: 30 })], NU);
    const ind = (maaltal: number) => ({ titel: "x", art: "tal" as const, noegle: "db_grad" as const, maaltal, frist: "2027-10-01" });
    expect(doemNytMaal(ind(0), NU, db).ok).toBe(true);
    expect(doemNytMaal(ind(100), NU, db).ok).toBe(true);
    expect(doemNytMaal(ind(-0.1), NU, db)).toEqual({ ok: false, grund: "Dækningsgraden skal ligge mellem 0 og 100 %" });
    expect(doemNytMaal(ind(100.1), NU, db)).toEqual({ ok: false, grund: "Dækningsgraden skal ligge mellem 0 og 100 %" });
    const lik = nuvaerendeTal("likviditet_mdr", [m("2026-09", { cash: 400_000, payroll: 80_000, cogs: 20_000 })], NU);
    const lind = (maaltal: number) => ({ titel: "x", art: "tal" as const, noegle: "likviditet_mdr" as const, maaltal, frist: "2027-10-01" });
    expect(doemNytMaal(lind(0), NU, lik).ok).toBe(true);
    expect(doemNytMaal(lind(-1), NU, lik)).toEqual({ ok: false, grund: "Likviditeten kan ikke være under 0 måneder" });
  });

  it("doemNytMaal (runde 2, fund 9): omsætningens måltal ≥ 0 — resultatet må stadig være negativt", () => {
    const TRE = [m("2026-07", { revenue: 100_000 }), m("2026-08", { revenue: 120_000 }), m("2026-09", { revenue: 140_000 })];
    const oms = nuvaerendeTal("omsaetning_aarstakt", TRE, NU);
    const oind = (maaltal: number) => ({ titel: "x", art: "tal" as const, noegle: "omsaetning_aarstakt" as const, maaltal, frist: "2027-10-01" });
    expect(doemNytMaal(oind(0), NU, oms).ok).toBe(true);
    expect(doemNytMaal(oind(2_000_000), NU, oms).ok).toBe(true);
    expect(doemNytMaal(oind(-1), NU, oms)).toEqual({ ok: false, grund: "Omsætningen kan ikke være under 0 kr." });
    const res = nuvaerendeTal("resultat_aarstakt", [m("2026-07", { ebt: 10_000 }), m("2026-08", { ebt: 10_000 }), m("2026-09", { ebt: 10_000 })], NU);
    expect(doemNytMaal({ titel: "x", art: "tal", noegle: "resultat_aarstakt", maaltal: -100_000, frist: "2027-10-01" }, NU, res).ok).toBe(true);
  });

  it("doemNytMaal: andet_tal gemmer udgangspunktet som current_value og kræver en enhed", () => {
    expect(doemNytMaal({ titel: "Flere kunder", art: "tal", noegle: "andet_tal", maaltal: 100, udgangspunkt: 60, frist: "2027-10-01" }, NU)).toEqual({ ok: false, grund: "Skriv hvad tallet tæller (fx kunder)" });
    const d = doemNytMaal({ titel: "Flere kunder", art: "tal", noegle: "andet_tal", maaltal: 100, udgangspunkt: 60, enhed: "kunder", frist: "2027-10-01" }, NU);
    expect(d.ok && d.felter).toMatchObject({ current_value: 60, unit: "kunder", maal_noegle: "andet_tal" });
  });

  it("doemNytMaal: begivenhed = måltal 1, udgangspunkt 0, ingen nøgle og ingen unit", () => {
    const d = doemNytMaal({ titel: "Første ansatte", art: "begivenhed", frist: "2027-03-01" }, NU);
    expect(d.ok && d.felter).toMatchObject({ art: "begivenhed", maal_noegle: null, target_value: 1, udgangspunkt: 0, current_value: 0 });
    expect(d.ok && "unit" in d.felter).toBe(false);
    // CHECK milestones_art_noegle_check: et begivenhedsmål med en nøgle afvises allerede her
    expect(doemNytMaal({ titel: "x", art: "begivenhed", noegle: "db_grad", frist: "2027-03-01" }, NU)).toEqual({ ok: false, grund: "Et begivenhedsmål har intet tal at følge" });
  });

  it.each([
    [{ titel: "", art: "tal", frist: "2027-01-01" }, "Skriv målet som én sætning"],
    [{ titel: "x".repeat(121), art: "tal", frist: "2027-01-01" }, "Målet er for langt (højst 120 tegn)"],
    [{ titel: "x", art: "noget", frist: "2027-01-01" }, "Vælg om målet er et tal eller en begivenhed"],
    [{ titel: "x", art: "begivenhed", frist: "" }, "Vælg en frist"],
    [{ titel: "x", art: "begivenhed", frist: "2027-02-30" }, "Vælg en frist"],
    [{ titel: "x", art: "begivenhed", frist: "2026-10-01" }, "Fristen skal ligge efter i dag"],
    [{ titel: "x", art: "tal", frist: "2027-01-01" }, "Vælg hvilket tal målet handler om"],
    [{ titel: "x", art: "tal", noegle: "db_grad", frist: "2027-01-01" }, "Skriv måltallet"],
    [{ titel: "x", art: "tal", noegle: "andet_tal", maaltal: 40, enhed: "kunder", frist: "2027-01-01" }, "Udgangspunktet mangler"],
    [{ titel: "x", art: "tal", noegle: "andet_tal", maaltal: 40, udgangspunkt: 40, enhed: "kunder", frist: "2027-01-01" }, "Måltallet er det samme som udgangspunktet"],
  ])("doemNytMaal afviser %o", (input, grund) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(doemNytMaal(input as any, NU)).toEqual({ ok: false, grund });
  });

  it("doemNytMaal: en husnøgle, hvis måltal er det nuværende tal, afvises", () => {
    const nuv = nuvaerendeTal("omsaetning_aarstakt", mdr, NU);
    expect(doemNytMaal({ titel: "x", art: "tal", noegle: "omsaetning_aarstakt", maaltal: 1_440_000, frist: "2027-10-01" }, NU, nuv)).toEqual({ ok: false, grund: "Måltallet er det samme som udgangspunktet" });
  });

  it("skarptForslag: de gamle tal er forslag, ikke nulstillet (fund 4)", () => {
    expect(skarptForslag({ target_value: 25, current_value: 12, unit: " kunder " })).toEqual({ maaltal: 25, udgangspunkt: 12, enhed: "kunder" });
    expect(skarptForslag({ target_value: null, current_value: null, unit: "  " })).toEqual({ maaltal: null, udgangspunkt: null, enhed: null });
  });

  it("gammelTalvisning: kun mål uden art med måltal og enhed (fund 5)", () => {
    expect(gammelTalvisning({ art: null, target_value: 25, unit: "kunder" })).toBe(true);
    expect(gammelTalvisning({ target_value: 25, unit: "kunder" })).toBe(true); // før migrationen: art findes ikke
    expect(gammelTalvisning({ art: "tal", target_value: 2_000_000, unit: "kr." })).toBe(false);
    expect(gammelTalvisning({ art: "begivenhed", target_value: 1, unit: null })).toBe(false);
    expect(gammelTalvisning({ art: null, target_value: 25, unit: null })).toBe(false);
    expect(gammelTalvisning({ art: null, target_value: 0, unit: "kunder" })).toBe(false);
  });

  it("doemNytMaal: «i dag» er dansk — 30/9 22:30Z er 1/10, så fristen 1/10 afvises", () => {
    expect(doemNytMaal({ titel: "x", art: "begivenhed", frist: "2026-10-01" }, new Date("2026-09-30T22:30:00Z"))).toEqual({ ok: false, grund: "Fristen skal ligge efter i dag" });
    expect(doemNytMaal({ titel: "x", art: "begivenhed", frist: "2026-10-01" }, new Date("2026-09-30T21:30:00Z")).ok).toBe(true);
  });
});

describe("tidslinjen", () => {
  it("tidslinjeStart: kontraktstarten rullet frem i hele år til det indeværende medlemsår", () => {
    expect(tidslinjeStart("2026-05-15", [], NU)).toBe("2026-05-15");
    expect(tidslinjeStart("2024-11-01", [], NU)).toBe("2025-11-01");
    expect(tidslinjeStart("2025-10-01", [], NU)).toBe("2026-10-01");
    expect(tidslinjeStart("2025-10-02", [], NU)).toBe("2025-10-02");
  });

  it("tidslinjeStart uden kontrakt: tidligste ikke-parkerede måls start, ellers i dag", () => {
    expect(tidslinjeStart(null, [maal({ udgangspunkt_dato: "2026-06-01" }), maal({ udgangspunkt_dato: "2026-02-01", status: "parked" })], NU)).toBe("2026-06-01");
    expect(tidslinjeStart(null, [], NU)).toBe("2026-10-01");
  });

  it("tidslinjeStart uden kontrakt rulles frem i hele år som kontraktstarten (fund 11)", () => {
    // et mål fra 1/8-2025 (14 mdr. siden) → 1/8-2026; ellers sluttede linjen 1/8-2026, før i dag
    expect(tidslinjeStart(null, [maal({ udgangspunkt_dato: "2025-08-01" })], NU)).toBe("2026-08-01");
    expect(tidslinjeStart(null, [maal({ udgangspunkt_dato: "2023-10-02" })], NU)).toBe("2025-10-02");
    expect(tidslinjeStart(null, [maal({ udgangspunkt_dato: "2025-10-01" })], NU)).toBe("2026-10-01");
    // et mål med start i fremtiden → i dag
    expect(tidslinjeStart(null, [maal({ udgangspunkt_dato: "2026-12-01" })], NU)).toBe("2026-10-01");
  });

  it("punkterne: start, tre kvartaler, slut, gjorte skridt og målfrister i vinduet", () => {
    const t = tidslinje(
      [maal({ id: "m1", deadline: "2027-04-01" }), maal({ id: "m2", title: "Nået", status: "completed", deadline: "2026-09-01" }), maal({ id: "m3", status: "parked", deadline: "2026-12-01" }), maal({ id: "m4", deadline: "2028-01-01" })],
      [
        { id: "s1", title: "Gjort", status: "done", due_date: null, maal_id: "m1", closed_at: "2026-08-31T22:30:00Z" },
        { id: "s2", title: "Aktiv", status: "active", due_date: "2026-10-10", maal_id: "m1" },
        { id: "s3", title: "Fremmed", status: "done", due_date: null, maal_id: "andet", closed_at: "2026-08-15T10:00:00Z" },
        { id: "s4", title: "Før start", status: "done", due_date: null, maal_id: "m1", closed_at: "2026-04-01T10:00:00Z" },
      ],
      "2026-05-15",
      NU,
    );
    expect(t.start).toBe("2026-05-15");
    expect(t.slut).toBe("2027-05-15");
    expect(t.punkter.map((p) => [p.dato, p.art, p.maalId])).toEqual([
      ["2026-05-15", "start", null],
      ["2026-08-15", "kvartal", null],
      ["2026-09-01", "skridt_gjort", "m1"], // 31/8 22:30Z = 1/9 dansk
      ["2026-09-01", "maal_frist", "m2"],
      ["2026-11-15", "kvartal", null],
      ["2027-02-15", "kvartal", null],
      ["2027-04-01", "maal_frist", "m1"],
      ["2027-05-15", "slut", null],
    ]);
    expect(t.punkter.find((p) => p.maalId === "m2")?.naaet).toBe(true);
    expect(t.nuAndel).toBeCloseTo(dageMellem("2026-05-15", "2026-10-01") / 365, 10);
  });

  it("skive 3 (runde 2, fund 4): et UBEKRÆFTET måls frist står ikke på Rejsen — ulæst kolonne (undefined) som i dag", () => {
    const frister = (bekraeftet_at: string | null | undefined) =>
      tidslinje([maal({ id: "m1", deadline: "2027-04-01", bekraeftet_at })], [], "2026-05-15", NU).punkter.filter((p) => p.art === "maal_frist").map((p) => p.maalId);
    expect(frister(null)).toEqual([]);
    expect(frister("2026-09-01T00:00:00Z")).toEqual(["m1"]);
    expect(frister(undefined)).toEqual(["m1"]);
  });
});

describe("«Måltallet er nået» opfordrer kun (fund 16)", () => {
  it("teksten foreslår at overveje klikket — den siger ikke, at målet er nået", () => {
    expect(MAAL_ORD.maaltalNaaetSpoergsmaal).toBe("Måltallet er nået. Overvej at markere målet som nået.");
    expect(MAAL_ORD.status.naaet_i_tal).toBe("Måltallet er nået");
  });
});

// ── Fladen 1/10-2026: skridtets kilde og guidens titelforslag ──────────────

describe("skridtKilde — company_actions.source_type er en observation", () => {
  it("manual → jer selv, advisor → din rådgiver, maskinens ord → AI, alt andet → null", () => {
    expect(skridtKilde("manual")).toBe("medlem");
    expect(skridtKilde("advisor")).toBe("raadgiver");
    for (const s of ["ai_weekly", "agent", "reflection", "deterministic_template", "ai_extraction"]) expect(skridtKilde(s)).toBe("ai");
    expect(skridtKilde("manual_baseline")).toBeNull();
    expect(skridtKilde(null)).toBeNull();
    expect(skridtKilde(undefined)).toBeNull();
  });
  it("naesteSkridt bærer «foreslået af …» i ord — og null uden kilde", () => {
    const sk = (over: Partial<SkridtTilMaal>): SkridtTilMaal => ({ id: "s", title: "Ring", status: "active", due_date: "2026-10-10", maal_id: "m1", ...over });
    expect(naesteSkridt("m1", [sk({ source_type: "advisor" })], NU).skridt?.foreslaaetAf).toBe("din rådgiver");
    expect(naesteSkridt("m1", [sk({ source_type: "manual" })], NU).skridt?.foreslaaetAf).toBe("jer selv");
    expect(naesteSkridt("m1", [sk({ source_type: "ai_weekly" })], NU).skridt?.foreslaaetAf).toBe("AI");
    expect(naesteSkridt("m1", [sk({})], NU).skridt?.foreslaaetAf).toBeNull();
  });
});

describe("foreslaaTitel — guidens titel af nøglen og måltallet", () => {
  it("husnøglerne i ord", () => {
    expect(foreslaaTitel("omsaetning_aarstakt", 2_000_000)).toBe("Omsætning på 2 mio. kr. i årstakt");
    expect(foreslaaTitel("resultat_aarstakt", 620_000)).toBe("Resultat før skat på 620.000 kr. i årstakt");
    expect(foreslaaTitel("likviditet_mdr", 4)).toBe("4 mdr. drift i banken");
    expect(foreslaaTitel("db_grad", 42.5)).toBe("Dækningsgrad på 42,5 %");
  });
  it("andet_tal kræver en enhed; uden måltal intet forslag", () => {
    expect(foreslaaTitel("andet_tal", 12, "kunder")).toBe("12 kunder");
    expect(foreslaaTitel("andet_tal", 12, "")).toBeNull();
    expect(foreslaaTitel("omsaetning_aarstakt", null)).toBeNull();
  });
});

describe("doemMaalFrist — én fristdom for guiden og «Redigér» (fund 5)", () => {
  const nu = new Date("2026-10-01T10:00:00Z");
  it("efter i dag og højst 36 måneder frem (inklusive)", () => {
    expect(doemMaalFrist("2026-10-02", nu)).toEqual({ ok: true, dato: "2026-10-02" });
    expect(doemMaalFrist("2029-10-01", nu)).toEqual({ ok: true, dato: "2029-10-01" });
    expect(doemMaalFrist("2026-10-01", nu)).toEqual({ ok: false, grund: "Fristen skal ligge efter i dag" });
    expect(doemMaalFrist("2026-09-30", nu)).toEqual({ ok: false, grund: "Fristen skal ligge efter i dag" });
    expect(doemMaalFrist("2029-10-02", nu).ok).toBe(false);
  });
  it("tom, null eller ikke en dato → «Vælg en frist»", () => {
    expect(doemMaalFrist("", nu)).toEqual({ ok: false, grund: "Vælg en frist" });
    expect(doemMaalFrist(null, nu)).toEqual({ ok: false, grund: "Vælg en frist" });
    expect(doemMaalFrist("2026-13-45", nu)).toEqual({ ok: false, grund: "Vælg en frist" });
  });
  it("doemNytMaal dømmer fristen med den samme dom", () => {
    expect(doemNytMaal({ titel: "Ansat", art: "begivenhed", frist: "2026-10-01" }, nu)).toEqual({ ok: false, grund: "Fristen skal ligge efter i dag" });
  });
});
