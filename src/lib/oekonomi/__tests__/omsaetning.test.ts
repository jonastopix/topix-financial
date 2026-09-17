import { describe, expect, it } from "vitest";
import {
  aktivPaaDag,
  broSum,
  dageIMaaned,
  danskMaaned,
  FORNYELSES_AFSTAND_DAGE,
  kr,
  laengdeIMaaneder,
  maanederFraTil,
  mrrBro,
  mrrForKontrakt,
  periodiser,
  periodiserKontrakt,
  type Betaling,
  type Kontrakt,
} from "@/lib/oekonomi/omsaetning";

/* Den periodiserede omsætningsdom (Ø1, 18/9-2026). Jonas 17/9: «alle
   medlemskaber, også dem der betaler fuld pris med det samme, skal
   periodiseres over 12 mdr.» Alt i øre ekskl. moms. */

const k = (over: Partial<Kontrakt> & { id: string }): Kontrakt => ({
  company_id: "c1",
  periode_start: "2026-01-01",
  periode_slut: "2027-01-01",
  pris_eks_moms_oere: 5_000_000,
  betalingsmodel: "fuld",
  kilde: "backfill",
  ...over,
});
const sum = (xs: { anerkendt_oere: number }[]) => xs.reduce((s, x) => s + x.anerkendt_oere, 0);

describe("periodiserKontrakt — kontraktåret", () => {
  it("12 måneder fra den 1.: tolv gange pris/12, summen præcis prisen", () => {
    const m = periodiserKontrakt(k({ id: "a" }));
    expect(m.map((x) => x.key)).toEqual(maanederFraTil("2026-01", "2026-12"));
    expect(m.every((x) => x.vaegt === 1)).toBe(true);
    expect(m.slice(0, 11).every((x) => x.anerkendt_oere === 416_667)).toBe(true);
    expect(m[11].anerkendt_oere).toBe(5_000_000 - 11 * 416_667); // resten på den sidste
    expect(sum(m)).toBe(5_000_000);
  });
  it("start midt i måneden: 13 måneder, de hele er pris/12, start og slut vejer dage/dage-i-måneden", () => {
    const m = periodiserKontrakt(k({ id: "b", periode_start: "2026-03-15", periode_slut: "2027-03-15" }));
    expect(m).toHaveLength(13);
    expect(m[0].vaegt).toBeCloseTo(17 / 31, 10); // 15.–31. marts
    expect(m[12].vaegt).toBeCloseTo(14 / 31, 10); // 1.–14. marts året efter
    expect(m[1].anerkendt_oere).toBe(416_667);
    expect(m[0].anerkendt_oere).toBe(Math.round((5_000_000 * (17 / 31)) / 12));
    expect(sum(m)).toBe(5_000_000);
    expect(laengdeIMaaneder(k({ id: "b", periode_start: "2026-03-15", periode_slut: "2027-03-15" }))).toBeCloseTo(12, 10);
  });
  it("kontrakt der starter den 31.: én dag i januar, 30 dage i januar året efter — februar er en hel måned", () => {
    const m = periodiserKontrakt(k({ id: "c", periode_start: "2026-01-31", periode_slut: "2027-01-31" }));
    expect(m[0].key).toBe("2026-01");
    expect(m[0].vaegt).toBeCloseTo(1 / 31, 10);
    expect(m[1]).toMatchObject({ key: "2026-02", vaegt: 1, anerkendt_oere: 416_667 });
    expect(m[12].key).toBe("2027-01");
    expect(m[12].vaegt).toBeCloseTo(30 / 31, 10);
    expect(sum(m)).toBe(5_000_000);
    expect(laengdeIMaaneder(k({ id: "c", periode_start: "2026-01-31", periode_slut: "2027-01-31" }))).toBeCloseTo(12, 10);
  });
  it("skudår: 15/2-2027 → 15/2-2028 vejer 14/28 + 14/29 i endemånederne; summen er stadig prisen", () => {
    const kk = k({ id: "d", periode_start: "2027-02-15", periode_slut: "2028-02-15" });
    const m = periodiserKontrakt(kk);
    expect(dageIMaaned(2028, 2)).toBe(29);
    expect(dageIMaaned(2027, 2)).toBe(28);
    expect(m[0].vaegt).toBeCloseTo(14 / 28, 10);
    expect(m[12].vaegt).toBeCloseTo(14 / 29, 10);
    expect(laengdeIMaaneder(kk)).toBeCloseTo(11 + 14 / 28 + 14 / 29, 10);
    expect(m[1].anerkendt_oere).toBe(Math.round(5_000_000 / (11 + 14 / 28 + 14 / 29))); // en anelse over pris/12
    expect(sum(m)).toBe(5_000_000);
  });
  it("to år i én række fordeles over 24 måneder; én måned (maanedlig) får hele prisen", () => {
    const to = periodiserKontrakt(k({ id: "e", periode_slut: "2028-01-01", pris_eks_moms_oere: 6_000_000 }));
    expect(to).toHaveLength(24);
    expect(to[0].anerkendt_oere).toBe(250_000);
    expect(sum(to)).toBe(6_000_000);
    const en = periodiserKontrakt(k({ id: "f", periode_start: "2026-05-01", periode_slut: "2026-06-01", pris_eks_moms_oere: 437_500, betalingsmodel: "maanedlig" }));
    expect(en).toEqual([{ key: "2026-05", vaegt: 1, anerkendt_oere: 437_500 }]);
    expect(mrrForKontrakt(k({ id: "f", periode_start: "2026-05-01", periode_slut: "2026-06-01", pris_eks_moms_oere: 437_500 }))).toBe(437_500);
  });
  it("gratis (pris 0): nul i alle måneder, men perioden findes", () => {
    const m = periodiserKontrakt(k({ id: "g", pris_eks_moms_oere: 0, betalingsmodel: "gratis" }));
    expect(m).toHaveLength(12);
    expect(sum(m)).toBe(0);
    expect(mrrForKontrakt(k({ id: "g", pris_eks_moms_oere: 0 }))).toBe(0);
  });
  it("slutdatoen er eksklusiv; ulæselig dato eller slut ≤ start kaster", () => {
    const kk = k({ id: "h" });
    expect(aktivPaaDag(kk, "2026-12-31")).toBe(true);
    expect(aktivPaaDag(kk, "2027-01-01")).toBe(false);
    expect(aktivPaaDag(kk, "2025-12-31")).toBe(false);
    expect(() => periodiserKontrakt(k({ id: "i", periode_start: "1/1-2026" }))).toThrow(/ulæselig dato/);
    expect(() => periodiserKontrakt(k({ id: "j", periode_slut: "2026-01-01" }))).toThrow(/slutter ikke efter start/);
  });
});

describe("periodiser — månederne, MRR, kontraheret, kontant mod periodiseret", () => {
  it("fuld pris forud (Jonas: periodiseres over 12 mdr.): kontant i én måned, anerkendt pris/12, forudbetalt falder måned for måned", () => {
    const kontrakter = [k({ id: "a", periode_start: "2026-05-11", periode_slut: "2027-05-11" })];
    const betalinger: Betaling[] = [{ company_id: "c1", betalt_at: "2026-05-11T10:00:00+02:00", beloeb_eks_moms_oere: 5_000_000 }];
    const t = periodiser({ kontrakter, betalinger, fra: "2026-04", til: "2027-06" });
    const maj = t.find((x) => x.key === "2026-05")!;
    const jun = t.find((x) => x.key === "2026-06")!;
    const apr = t.find((x) => x.key === "2026-04")!;
    expect(apr).toMatchObject({ anerkendt_oere: 0, mrr_oere: 0, aktive: 0, kontant_oere: 0 });
    expect(maj.kontant_oere).toBe(5_000_000);
    expect(maj.anerkendt_oere).toBe(Math.round((5_000_000 * (21 / 31)) / 12));
    expect(maj.forudbetalt_oere).toBe(5_000_000 - maj.anerkendt_oere);
    expect(maj.mrr_oere).toBe(416_667);
    expect(maj.arr_oere).toBe(5_000_004);
    expect(jun.anerkendt_oere).toBe(416_667);
    expect(jun.forudbetalt_oere).toBe(5_000_000 - maj.anerkendt_oere - 416_667);
    expect(jun.kontraheret_frem_oere).toBe(5_000_000 - maj.anerkendt_oere - 416_667);
    expect(t.find((x) => x.key === "2027-05")!.forudbetalt_oere).toBe(0);
    expect(t.find((x) => x.key === "2027-06")).toMatchObject({ anerkendt_oere: 0, mrr_oere: 0, aktive: 0, kontraheret_frem_oere: 0 });
    expect(t.reduce((s, x) => s + x.anerkendt_oere, 0)).toBe(5_000_000);
  });
  it("rate 2 (Nordic By Hand: 40.000 i to rater à 20.000, rate 2 den 1/11): forudbetalt i september, udestående når anerkendt overhaler rate 1", () => {
    const kontrakter = [k({ id: "n", company_id: "nordic", periode_start: "2026-09-14", periode_slut: "2027-09-14", pris_eks_moms_oere: 4_000_000, betalingsmodel: "rate2" })];
    const betalinger: Betaling[] = [
      { company_id: "nordic", betalt_at: "2026-08-31T12:00:00+02:00", beloeb_eks_moms_oere: 2_000_000 },
      { company_id: "nordic", betalt_at: "2026-11-01T12:00:00+01:00", beloeb_eks_moms_oere: 2_000_000 },
    ];
    const t = periodiser({ kontrakter, betalinger, fra: "2026-08", til: "2027-09" });
    const aug = t.find((x) => x.key === "2026-08")!;
    const sep = t.find((x) => x.key === "2026-09")!;
    const okt = t.find((x) => x.key === "2026-10")!;
    const nov = t.find((x) => x.key === "2026-11")!;
    expect(aug).toMatchObject({ kontant_oere: 2_000_000, anerkendt_oere: 0, forudbetalt_oere: 2_000_000, mrr_oere: 0 });
    expect(sep.anerkendt_oere).toBe(Math.round((4_000_000 * (17 / 30)) / 12));
    expect(sep.forudbetalt_oere).toBe(2_000_000 - sep.anerkendt_oere);
    expect(sep.mrr_oere).toBe(333_333);
    expect(okt.udestaaende_oere).toBe(0);
    expect(nov.kontant_oere).toBe(2_000_000);
    // Uden rate 2: udestående fra den måned anerkendt overhaler 20.000 (marts 2027).
    const uden = periodiser({ kontrakter, betalinger: betalinger.slice(0, 1), fra: "2026-08", til: "2027-09" });
    expect(uden.find((x) => x.key === "2027-02")!.udestaaende_oere).toBe(0);
    expect(uden.find((x) => x.key === "2027-03")!.udestaaende_oere).toBeGreaterThan(0);
    expect(uden.find((x) => x.key === "2027-09")!.udestaaende_oere).toBe(2_000_000);
  });
  it("overlap mellem to kontraktår hos samme virksomhed: begge anerkendes, MRR tæller kun det aktive ved månedens slutning", () => {
    const kontrakter = [
      k({ id: "aar1", company_id: "w", periode_start: "2025-06-26", periode_slut: "2026-06-26", pris_eks_moms_oere: 4_000_000 }),
      k({ id: "aar2", company_id: "w", periode_start: "2026-06-16", periode_slut: "2027-06-16", pris_eks_moms_oere: 1_500_000 }), // starter 10 dage før år 1 slutter
    ];
    const t = periodiser({ kontrakter, fra: "2026-05", til: "2026-07" });
    const jun = t.find((x) => x.key === "2026-06")!;
    const aar1Juni = periodiserKontrakt(kontrakter[0]).find((x) => x.key === "2026-06")!.anerkendt_oere;
    const aar2Juni = periodiserKontrakt(kontrakter[1]).find((x) => x.key === "2026-06")!.anerkendt_oere;
    expect(jun.anerkendt_oere).toBe(aar1Juni + aar2Juni);
    expect(jun.mrr_oere).toBe(125_000); // kun år 2 er aktivt 30/6
    expect(jun.aktive).toBe(1);
    expect(t.find((x) => x.key === "2026-05")!.mrr_oere).toBe(333_333);
  });
  it("gratis kontrakt (Bastant): tælles i gratis_aktive og i broens gratis, aldrig i MRR", () => {
    const kontrakter = [k({ id: "b", company_id: "bastant", periode_start: "2026-03-01", periode_slut: "2027-12-31", pris_eks_moms_oere: 0, betalingsmodel: "gratis" })];
    const t = periodiser({ kontrakter, fra: "2026-02", til: "2026-04" });
    expect(t.find((x) => x.key === "2026-03")).toMatchObject({ aktive: 0, gratis_aktive: 1, mrr_oere: 0, anerkendt_oere: 0 });
    expect(t.find((x) => x.key === "2026-03")!.bro.gratis).toEqual({ antal: 1, oere: 0 });
    expect(t.find((x) => x.key === "2026-04")!.bro.gratis).toEqual({ antal: 0, oere: 0 });
  });
  it("dansk måned: en betaling 31/8 kl. 23:30 dansk tid (21:30Z) er august, én kl. 22:30Z er september", () => {
    expect(danskMaaned("2026-08-31T21:30:00Z")).toBe("2026-08");
    expect(danskMaaned("2026-08-31T22:30:00Z")).toBe("2026-09");
    expect(danskMaaned("2026-12-31T23:30:00Z")).toBe("2027-01");
    expect(() => danskMaaned("i går")).toThrow(/ulæseligt tidspunkt/);
    const t = periodiser({ kontrakter: [], betalinger: [{ company_id: "x", betalt_at: "2026-08-31T22:30:00Z", beloeb_eks_moms_oere: 100 }], fra: "2026-08", til: "2026-09" });
    expect(t[0].kontant_oere).toBe(0);
    expect(t[1].kontant_oere).toBe(100);
  });
  it("vinduet fra/til: kun de bestilte måneder, i rækkefølge; kontrakter uden for vinduet tæller i kontraheret frem", () => {
    const t = periodiser({ kontrakter: [k({ id: "a", periode_start: "2027-01-01", periode_slut: "2028-01-01" })], fra: "2026-11", til: "2026-12" });
    expect(t.map((x) => x.key)).toEqual(["2026-11", "2026-12"]);
    expect(t[1]).toMatchObject({ anerkendt_oere: 0, mrr_oere: 0, kontraheret_frem_oere: 5_000_000 });
    expect(maanederFraTil("2026-12", "2027-02")).toEqual(["2026-12", "2027-01", "2027-02"]);
    expect(maanederFraTil("2027-02", "2026-12")).toEqual([]);
  });
});

describe("MRR-broen — ny · fornyet op · fornyet ned · tabt · gratis", () => {
  const kontrakter: Kontrakt[] = [
    k({ id: "a1", company_id: "a", periode_start: "2025-08-20", periode_slut: "2026-08-20", pris_eks_moms_oere: 4_000_000 }), // BRILLEVÆRK år 1
    k({ id: "a2", company_id: "a", periode_start: "2026-08-20", periode_slut: "2027-08-20", pris_eks_moms_oere: 2_000_000 }), // år 2: fornyet ned
    k({ id: "b1", company_id: "b", periode_start: "2025-09-05", periode_slut: "2026-09-05", pris_eks_moms_oere: 4_200_000 }), // Studio Mini: tabt i september
    k({ id: "c1", company_id: "c", periode_start: "2026-09-15", periode_slut: "2027-09-15", pris_eks_moms_oere: 5_250_000 }), // Din Forsikringsret: ny
    k({ id: "d1", company_id: "d", periode_start: "2025-06-01", periode_slut: "2026-06-01", pris_eks_moms_oere: 4_000_000 }),
    k({ id: "d2", company_id: "d", periode_start: "2026-06-01", periode_slut: "2027-06-01", pris_eks_moms_oere: 5_000_000 }), // fornyet op
    k({ id: "e1", company_id: "e", periode_start: "2026-09-01", periode_slut: "2027-09-01", pris_eks_moms_oere: 0, betalingsmodel: "gratis" }),
  ];
  it("august 2026: BRILLEVÆRK fornyet ned (40.000 → 20.000: MRR −166.667)", () => {
    const bro = mrrBro(kontrakter, "2026-08", "2026-07");
    expect(bro.fornyet_ned).toEqual({ antal: 1, oere: 166_667 - 333_333 });
    expect(bro.ny.antal + bro.tabt.antal + bro.fornyet_op.antal).toBe(0);
  });
  it("juni 2026: fornyet op (40.000 → 50.000: +83.333)", () => {
    const bro = mrrBro(kontrakter, "2026-06", "2026-05");
    expect(bro.fornyet_op).toEqual({ antal: 1, oere: 416_667 - 333_333 });
  });
  it("september 2026: Studio Mini tabt, Din Forsikringsret ny, den gratis tælles uden øre", () => {
    const bro = mrrBro(kontrakter, "2026-09", "2026-08");
    expect(bro.tabt).toEqual({ antal: 1, oere: -350_000 });
    expect(bro.ny).toEqual({ antal: 1, oere: 437_500 });
    expect(bro.gratis).toEqual({ antal: 1, oere: 0 });
    expect(bro.fornyet_op.antal + bro.fornyet_ned.antal + bro.fornyet_uaendret.antal).toBe(0);
  });
  it("en ny kontrakt mere end 92 dage efter den gamle sluttede er «ny», ikke fornyet; inden for er den fornyet", () => {
    expect(FORNYELSES_AFSTAND_DAGE).toBe(92);
    const sen = [
      k({ id: "x1", company_id: "x", periode_start: "2025-01-01", periode_slut: "2026-01-01" }),
      k({ id: "x2", company_id: "x", periode_start: "2026-04-15", periode_slut: "2027-04-15" }), // 104 dage efter
    ];
    expect(mrrBro(sen, "2026-04", "2026-03").ny).toEqual({ antal: 1, oere: 416_667 });
    const taet = [sen[0], k({ id: "x3", company_id: "x", periode_start: "2026-03-01", periode_slut: "2027-03-01" })]; // 59 dage efter
    expect(mrrBro(taet, "2026-03", "2026-02").fornyet_uaendret).toEqual({ antal: 1, oere: 416_667 });
    expect(mrrBro(sen, "2026-01", "2025-12").tabt).toEqual({ antal: 1, oere: -416_667 });
  });
  it("afstemning: summen af broens øre fra første måned er præcis MRR ved slutningen", () => {
    const t = periodiser({ kontrakter, fra: "2025-05", til: "2027-12" });
    let akk = 0;
    for (const m of t) {
      akk += broSum(m.bro);
      expect(akk).toBe(m.mrr_oere);
    }
    expect(t[0].bro.ny.antal).toBe(0); // maj 2025: intet aktivt endnu
    expect(t.find((x) => x.key === "2025-06")!.bro.ny).toEqual({ antal: 1, oere: 333_333 });
  });
});

describe("kr — visning", () => {
  it("dansk tusindtal uden ører; negative med minus", () => {
    expect(kr(5_250_000)).toBe("52.500");
    expect(kr(416_667)).toBe("4.167");
    expect(kr(-350_000)).toBe("−3.500");
    expect(kr(0)).toBe("0");
  });
});
