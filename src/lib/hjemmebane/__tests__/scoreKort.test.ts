import { describe, expect, it } from "vitest";
import { boardroomScore } from "@/lib/boardroomScore/score";
import { naesteMaaned } from "@/lib/boardroomScore/streak";
import { loefterMitTal } from "@/lib/boardroomScore/loefter";
import type { ScoreGrundlag, ScoreMaaned, StreakDom } from "@/lib/boardroomScore/typer";
import {
  daekningTekst,
  EFFEKT_FOERSTE_SCORE,
  EFFEKT_GIVER_SCORE,
  EFFEKT_LAASER_OP,
  effektTekst,
  ikkeNokDataTekst,
  loefterLinjer,
  retningTekst,
  retningVises,
  RETNING_VISES_FRA,
  RING_RADIUS,
  ringBue,
  soejleLinjer,
  streakKortLinje,
  streakLinjer,
  TAEL_OP_MS,
  taelOpVaerdi,
} from "@/lib/hjemmebane/scoreKort";

/* Ordene på Score-kortet (scoreKort.ts): ren oversættelse af motorens dom —
   ingen procent, retning i ord, handlingerne ordret fra motoren. */

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
const FULD = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k))), NU);
/** Rådets scenarie (30/9): kontraktstart 20/8, august uploadet 3/9 → første tællende måned september. */
const NYT_AUGUST = boardroomScore(grundlag([sund("2026-08", {}, { foersteGodkendtAt: "2026-09-03T09:00:00Z" })], { kontraktStart: "2026-08-20", harBudgetForAaret: false, harMaal: false }), NU);
/** Intet uploadet, kontraktstart 1/1: disciplin har data (0 godkendt), de tre tal-søjler ikke. */
const TOM = boardroomScore(grundlag([], { kontraktStart: "2026-01-01" }), NU);
/** Én måned uden omkostninger og uden kontraktstart: ingen søjle har data. */
const EN_UDEN_START = boardroomScore(grundlag([sund("2026-08", { gross_profit: null, payroll: null, admin_costs: null }, { foersteGodkendtAt: "2026-09-03T09:00:00Z" })], { kontraktStart: null }), NU);

describe("retningVises — først når scoren har fandtes en måned (designgennemsynet 1/10 fund 3)", () => {
  it("skjult til 30/10-2026 00:00 UTC, vist fra da", () => {
    expect(RETNING_VISES_FRA.toISOString()).toBe("2026-10-30T00:00:00.000Z");
    expect(retningVises(new Date("2026-10-01T09:00:00Z"))).toBe(false);
    expect(retningVises(new Date("2026-10-29T23:59:59Z"))).toBe(false);
    expect(retningVises(new Date("2026-10-30T00:00:00Z"))).toBe(true);
  });
});

describe("retningTekst — i ord, aldrig procent", () => {
  it("op, ned, samme, ukendt", () => {
    expect(retningTekst(733, 612)).toBe("Op fra 612 for en måned siden");
    expect(retningTekst(600, 612)).toBe("Ned fra 612 for en måned siden");
    expect(retningTekst(612, 612)).toBe("Samme som for en måned siden");
    expect(retningTekst(null, 612)).toBeNull();
    expect(retningTekst(612, null)).toBeNull();
  });
  it("ingen «%» i nogen retning", () => {
    for (const t of [retningTekst(900, 100), retningTekst(100, 900), retningTekst(5, 5)]) expect(t).not.toMatch(/%/);
  });
});

describe("daekningTekst", () => {
  it("fire søjler: ingen linje", () => {
    expect(daekningTekst(FULD)).toBeNull();
  });
  it("uden bank: «Bygget på 3 af 4 søjler»", () => {
    const d = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k, { cash: null }))), NU);
    expect(d.score).not.toBeNull();
    expect(daekningTekst(d)).toBe("Bygget på 3 af 4 søjler");
  });
  it("uden opskalering (1/10-2026): scoren er summen af søjlernes point — likviditet uden data giver 0, ikke de andres gennemsnit", () => {
    const med = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k))), NU);
    const uden = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k, { cash: null }))), NU);
    const sum = (d: typeof uden) => soejleLinjer(d).reduce((a, l) => a + (l.point ?? 0), 0);
    expect(Math.abs((uden.score as number) - sum(uden))).toBeLessThanOrEqual(2);
    expect(soejleLinjer(uden).find((l) => l.navn === "likviditet")).toMatchObject({ point: null, andel: 0 });
    // At lægge banktallet ind kan kun løfte tallet.
    expect(med.score as number).toBeGreaterThanOrEqual(uden.score as number);
    // Handlingen, der låser likviditeten op, har ingen regnet gevinst (bankbeløbet er ukendt, kurven starter i 0).
    const laas = uden.handlinger.find((h) => h.soejle === "likviditet")!;
    expect(laas.gevinst).toBeNull();
    expect(effektTekst(laas, uden)).toBe(EFFEKT_LAASER_OP);
  });
});

describe("soejleLinjer", () => {
  it("fire søjler i fast orden, afrundede point, andel 0–1, detalje i ord uden «%»", () => {
    const l = soejleLinjer(FULD);
    expect(l.map((x) => x.navn)).toEqual(["likviditet", "indtjening", "vaekst", "disciplin"]);
    for (const x of l) {
      expect(x.point).not.toBeNull();
      expect(Number.isInteger(x.point)).toBe(true);
      expect(x.andel).toBeGreaterThanOrEqual(0);
      expect(x.andel).toBeLessThanOrEqual(1);
      expect(x.detalje).not.toMatch(/%/);
      expect(x.detalje.length).toBeGreaterThan(0);
    }
    expect(l[0].detalje).toMatch(/måneders omkostninger i banken \(bank pr\. august\)$/);
    expect(l[3].detalje).toBe("6 af 6 måneder godkendt, 6 til tiden");
  });
  it("uden score: disciplinens «0 af 6 måneder godkendt, 0 til tiden» vises ikke (rådets fund 5); med score står den", () => {
    expect(TOM.score).toBeNull();
    expect(TOM.soejler.disciplin.status).toBe("ok");
    const disciplin = soejleLinjer(TOM).find((x) => x.navn === "disciplin")!;
    expect(disciplin.detalje).toBe("");
    expect(disciplin.point).not.toBeNull();
    expect(soejleLinjer(FULD)[3].detalje).toBe("6 af 6 måneder godkendt, 6 til tiden");
  });
  it("med score og 0 godkendte måneder: rolig tekst, aldrig «0 af 6 … 0 til tiden» (designgennemsynet 1/10 fund 4)", () => {
    const d = FULD.soejler.disciplin;
    if (d.status !== "ok") throw new Error("fixture");
    const dom = { ...FULD, soejler: { ...FULD.soejler, disciplin: { ...d, detaljer: { ...d.detaljer, maalte: 0, rettidige: 0 } } } };
    const linje = soejleLinjer(dom).find((x) => x.navn === "disciplin")!;
    expect(linje.detalje).toBe(`Ingen godkendte måneder i de seneste ${d.detaljer.vindue.length} endnu`);
    expect(linje.detalje).not.toMatch(/0 af|0 til tiden/);
  });
  it("uden data: point null, andel 0, motorens egen grund", () => {
    const d = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k, { cash: null }))), NU);
    const likv = soejleLinjer(d)[0];
    expect(likv).toMatchObject({ point: null, andel: 0 });
    expect(likv.detalje).toBe(d.soejler.likviditet.status === "ikke_nok_data" ? d.soejler.likviditet.grund : "");
  });
});

describe("streakLinjer", () => {
  const base: StreakDom = { laengde: 7, status: "aktiv", bedste: 7, aabenMaanedGodkendt: false, naesteFrist: { key: "2026-09", tidspunkt: new Date(), hverdageTil: 14 } };
  it("aktiv: tallet, enheden og fristen med dansk dato (20/10-2026 er en tirsdag → 20/10)", () => {
    const s = streakLinjer(base);
    expect(s.laengde).toBe(7);
    expect(s.enhed).toBe("måneder i træk");
    expect(s.frist).toBe("Næste frist: september senest 20/10 (14 hverdage)");
    expect(s.bedste).toBeNull();
  });
  it("én måned, én hverdag, fristen i dag", () => {
    expect(streakLinjer({ ...base, laengde: 1 }).enhed).toBe("måned i træk");
    expect(streakLinjer({ ...base, naesteFrist: { ...base.naesteFrist, hverdageTil: 1 } }).frist).toMatch(/\(1 hverdag\)$/);
    expect(streakLinjer({ ...base, naesteFrist: { ...base.naesteFrist, hverdageTil: 0 } }).frist).toMatch(/\(i dag\)$/);
  });
  it("brudt med en bedre fortid: «Din bedste: 7»", () => {
    const s = streakLinjer({ ...base, laengde: 0, status: "brudt" });
    expect(s.status).toMatch(/brudt/);
    expect(s.bedste).toBe("Din bedste: 7");
  });
  it("den åbne måned i hus: fristen er den følgende, og den åbne nævnes", () => {
    const s = streakLinjer({ ...base, aabenMaanedGodkendt: true, naesteFrist: { ...base.naesteFrist, key: "2026-10" } });
    expect(s.frist).toMatch(/^Næste frist: oktober senest /);
    expect(s.frist).toMatch(/September er allerede i hus\.$/);
  });
  it("mod motoren 30/9-2026: fristen for september er 20/10 om 14 hverdage", () => {
    expect(streakLinjer(FULD.streak).frist).toBe("Næste frist: september senest 20/10 (14 hverdage)");
  });
  it("en weekend-frist står som den rykkede hverdag: august 2026 (20/9 er søndag) → 21/9", () => {
    expect(streakLinjer({ ...base, naesteFrist: { ...base.naesteFrist, key: "2026-08", hverdageTil: 3 } }).frist).toBe("Næste frist: august senest 21/9 (3 hverdage)");
  });
  it("status uden streak er rolig — fristen (den 20.) står i fristlinjen, handlingen i løfteren (designgennemsynet 1/10)", () => {
    const l = streakLinjer({ ...base, laengde: 0, status: "ingen" });
    expect(l.status).toBe("Ingen streak endnu");
    expect(l.frist).toMatch(/senest 20\/10/);
  });
  it("streakKortLinje: tallet med enhed og fristen på én linje", () => {
    expect(streakKortLinje(base)).toEqual({ tal: "7 måneder i træk", frist: "Næste frist: september senest 20/10 (14 hverdage)", erStatus: false });
    expect(streakKortLinje({ ...base, laengde: 1 }).tal).toBe("1 måned i træk");
  });
  it("streakKortLinje uden streak (status «ingen»): statussen er linjen — aldrig «0 måneder i træk» — og fristen står stadig", () => {
    const l = streakKortLinje({ ...base, laengde: 0, bedste: 0, status: "ingen" });
    expect(l).toEqual({
      tal: "Ingen streak endnu",
      frist: "Næste frist: september senest 20/10 (14 hverdage)",
      erStatus: true,
    });
    expect(l.tal).not.toMatch(/0 måneder/);
  });
  it("streakKortLinje med brudt streak: «Streaken er brudt — næste frist starter en ny» + fristen", () => {
    const l = streakKortLinje({ ...base, laengde: 0, status: "brudt" });
    expect(l).toEqual({
      tal: "Streaken er brudt — næste frist starter en ny",
      frist: "Næste frist: september senest 20/10 (14 hverdage)",
      erStatus: true,
    });
  });
});

describe("ringBue — buen i skala 0–1000", () => {
  it("omkreds = 2π × 54 = 339,29; 733 → 339,29 × 0,733 = 248,70", () => {
    const b = ringBue(733);
    expect(b.omkreds).toBeCloseTo(2 * Math.PI * RING_RADIUS, 6);
    expect(b.omkreds).toBeCloseTo(339.29, 2);
    expect(b.laengde).toBeCloseTo(248.70, 2);
  });
  it("0 og 1000 er kanterne; over/under klemmes; null/NaN/max 0 → ingen bue", () => {
    expect(ringBue(0).laengde).toBe(0);
    expect(ringBue(1000).laengde).toBeCloseTo(ringBue(1000).omkreds, 9);
    expect(ringBue(1500).laengde).toBeCloseTo(ringBue(1000).omkreds, 9);
    expect(ringBue(-5).laengde).toBe(0);
    expect(ringBue(null).laengde).toBe(0);
    expect(ringBue(Number.NaN).laengde).toBe(0);
    expect(ringBue(500, 0).laengde).toBe(0);
  });
});

describe("loefterLinjer — handlingerne ORDRET fra motoren", () => {
  it("tekst og rækkefølge = loefterMitTal; effekt «+N point» eller «Låser en søjle op»", () => {
    const d = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k)), { harBudgetForAaret: false, harMaal: false }), NU);
    const l = loefterLinjer(d);
    expect(l.map((x) => x.tekst)).toEqual(loefterMitTal(d).map((h) => h.tekst));
    for (const x of l) expect(x.effekt).toMatch(/^\+\d+ point$/);
  });
  it("intet uploadet: højst én linje, og den lover aldrig point", () => {
    const l = loefterLinjer(TOM);
    expect(l.length).toBeLessThanOrEqual(1);
    for (const x of l) expect(x.effekt).not.toMatch(/point/);
  });
  it("rådets fund 2: score null men regnet gevinst → «Giver dig din første score», aldrig «+N point»", () => {
    expect(NYT_AUGUST.score).toBeNull();
    const l = loefterLinjer(NYT_AUGUST);
    expect(loefterMitTal(NYT_AUGUST)[0].gevinst).toBeGreaterThan(0);
    expect(l[0].effekt).toBe(EFFEKT_FOERSTE_SCORE);
    for (const x of l) expect(x.effekt).not.toMatch(/point/);
  });
  it("rådets fund 3: uden regnet gevinst skelnes søjle med data («Tæller med i din score») fra søjle uden («Låser en søjle op»)", () => {
    // TOM: disciplin HAR data (0 godkendt) — der er intet at låse op.
    const tom = loefterLinjer(TOM);
    expect(tom).toHaveLength(1);
    expect(tom[0].soejle).toBe("disciplin");
    expect(TOM.soejler.disciplin.status).toBe("ok");
    expect(tom[0].effekt).toBe(EFFEKT_GIVER_SCORE);
    // EN_UDEN_START: ingen søjle har data — handlingen låser en søjle op.
    const en = loefterLinjer(EN_UDEN_START);
    expect(en).toHaveLength(1);
    expect(EN_UDEN_START.soejler[en[0].soejle].status).not.toBe("ok");
    expect(en[0].effekt).toBe(EFFEKT_LAASER_OP);
  });
  it("effektTekst: alle fire grene", () => {
    const med = { score: 600, soejler: FULD.soejler };
    const uden = { score: null, soejler: TOM.soejler };
    expect(effektTekst({ soejle: "vaekst", gevinst: 17.6 }, med)).toBe("+18 point");
    expect(effektTekst({ soejle: "vaekst", gevinst: 400 }, uden)).toBe(EFFEKT_FOERSTE_SCORE);
    expect(effektTekst({ soejle: "likviditet", gevinst: null }, uden)).toBe(EFFEKT_LAASER_OP);
    expect(effektTekst({ soejle: "disciplin", gevinst: null }, uden)).toBe(EFFEKT_GIVER_SCORE);
  });
  it("rådets fund 6: en linje uden link er et «maal», med link en «handling» — rækkefølgen er stadig motorens", () => {
    const d = boardroomScore(grundlag(keys("2025-06", 15).map((k) => sund(k)), { harBudgetForAaret: false, harMaal: false }), NU);
    const l = loefterLinjer(d);
    expect(l[0].tekst).toBe(d.loefterMest!.tekst);
    for (const x of l) expect(x.art).toBe(x.sti ? "handling" : "maal");
  });
});

describe("ikkeNokDataTekst", () => {
  it("med score: null", () => {
    expect(ikkeNokDataTekst(FULD)).toBeNull();
  });
  it("uden score: de manglende søjler i medlemmets ord", () => {
    const d = boardroomScore(grundlag([], { kontraktStart: "2026-01-01" }), NU);
    expect(d.score).toBeNull();
    expect(ikkeNokDataTekst(d)).toBe("Scoren kræver tal i mindst to af de fire søjler. Der mangler endnu tal til likviditet, indtjening og vækst.");
  });
});

describe("taelOpVaerdi — ease-out, præcis landing", () => {
  it("start, slut og ud over slut", () => {
    expect(taelOpVaerdi(0, 733, 0)).toBe(0);
    expect(taelOpVaerdi(0, 733, -5)).toBe(0);
    expect(taelOpVaerdi(0, 733, TAEL_OP_MS)).toBe(733);
    expect(taelOpVaerdi(0, 733, TAEL_OP_MS * 3)).toBe(733);
  });
  it("halvvejs i tid er mere end halvvejs i tal (1 − 0,5³ = 0,875)", () => {
    expect(taelOpVaerdi(0, 800, TAEL_OP_MS / 2)).toBe(700);
  });
  it("monoton og aldrig forbi målet — også nedad", () => {
    let sidste = 612;
    for (let t = 0; t <= TAEL_OP_MS; t += 30) {
      const v = taelOpVaerdi(612, 540, t);
      expect(v).toBeLessThanOrEqual(sidste);
      expect(v).toBeGreaterThanOrEqual(540);
      sidste = v;
    }
  });
  it("varighed 0 → straks målet", () => {
    expect(taelOpVaerdi(0, 500, 0, 0)).toBe(500);
  });
});
