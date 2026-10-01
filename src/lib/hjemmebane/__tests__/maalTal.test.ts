import { describe, expect, it } from "vitest";
import { likviditet, type ScoreMaaned } from "@/lib/boardroomScore";
import {
  dageMellem,
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

const ok = (vaerdi: number): TalDom => ({ status: "ok", vaerdi, prMaaned: "2026-09", grundlag: 3, forklaring: "", enhed: "kr" });

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

  it("en måned uden tallet tæller ikke med (manglende nøgle er umålt, aldrig 0)", () => {
    const d = nuvaerendeTal("omsaetning_aarstakt", [m("2026-06", { revenue: 60_000 }), m("2026-07", { revenue: 100_000 }), m("2026-08", { ebt: 5 }), m("2026-09", { revenue: 140_000 })], NU);
    expect(d.status === "ok" && d.vaerdi).toBe(((60_000 + 100_000 + 140_000) / 3) * 12);
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

describe("sporet", () => {
  // start 1/4-2026, frist 1/4-2027 (365 dage), i dag 1/10-2026 (183 dage) → forventet 183/365.
  const forventet = 183 / 365;

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
    // created_at 30/6 22:30Z = 1/7 dansk; frist 11/7; i dag 6/7 → 5/10 (med UTC-datoen ville det være 6/11)
    const mm = maal({ udgangspunkt_dato: null, created_at: "2026-06-30T22:30:00Z", deadline: "2026-07-11" });
    expect(sporet(mm, ok(1_500_000), new Date("2026-07-06T10:00:00Z")).forventetAndel).toBeCloseTo(0.5, 10);
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
    // 0,44 af vejen mod forventet 183/365 ≈ 0,501 → på sporet (≥ 0,401)
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

  it("doemNytMaal: tal-mål", () => {
    const d = doemNytMaal({ titel: "  Omsætning 2 mio.  ", art: "tal", noegle: "omsaetning_aarstakt", maaltal: 2_000_000, udgangspunkt: 1_440_000, frist: "2027-10-01" }, NU);
    expect(d).toEqual({
      ok: true,
      felter: { title: "Omsætning 2 mio.", art: "tal", maal_noegle: "omsaetning_aarstakt", target_value: 2_000_000, udgangspunkt: 1_440_000, udgangspunkt_dato: "2026-10-01", current_value: null, unit: "kr.", deadline: "2027-10-01" },
    });
  });

  it("doemNytMaal: andet_tal gemmer udgangspunktet som current_value og kræver en enhed", () => {
    expect(doemNytMaal({ titel: "Flere kunder", art: "tal", noegle: "andet_tal", maaltal: 100, udgangspunkt: 60, frist: "2027-10-01" }, NU)).toEqual({ ok: false, grund: "Skriv hvad tallet tæller (fx kunder)" });
    const d = doemNytMaal({ titel: "Flere kunder", art: "tal", noegle: "andet_tal", maaltal: 100, udgangspunkt: 60, enhed: "kunder", frist: "2027-10-01" }, NU);
    expect(d.ok && d.felter).toMatchObject({ current_value: 60, unit: "kunder", maal_noegle: "andet_tal" });
  });

  it("doemNytMaal: begivenhed = måltal 1, udgangspunkt 0", () => {
    const d = doemNytMaal({ titel: "Første ansatte", art: "begivenhed", frist: "2027-03-01" }, NU);
    expect(d.ok && d.felter).toMatchObject({ art: "begivenhed", maal_noegle: null, target_value: 1, udgangspunkt: 0, current_value: 0, unit: null });
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
    [{ titel: "x", art: "tal", noegle: "db_grad", maaltal: 40, frist: "2027-01-01" }, "Udgangspunktet mangler"],
    [{ titel: "x", art: "tal", noegle: "db_grad", maaltal: 40, udgangspunkt: 40, frist: "2027-01-01" }, "Måltallet er det samme som udgangspunktet"],
  ])("doemNytMaal afviser %o", (input, grund) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(doemNytMaal(input as any, NU)).toEqual({ ok: false, grund });
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
});
