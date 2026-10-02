import { describe, expect, it } from "vitest";
import type { ScoreMaaned } from "@/lib/boardroomScore";
import { maalKort, MAAL_NOEGLER, tidslinje, type MaalMedTal, type SkridtTilMaal } from "../maalTal";
import {
  bane,
  chipTone,
  danskTal,
  danskTalDom,
  danskTalTilFelt,
  eyebrowTekst,
  flereSkridtTekst,
  guideKort,
  hovedLinje,
  TAG_STILLING_TEKST,
  kraeverTekst,
  skridtFremdrift,
  statusChips,
  stregTekst,
  talUndertekst,
  TAL_KUN_TALLET,
  TAL_MIO_TVETYDIG,
  TASTET_TEKST,
  tidslinjeTegning,
} from "../dineMaalFlade";

const NU = new Date("2026-10-01T10:00:00Z");
const m = (key: string, metrics: Record<string, number | null>): ScoreMaaned => ({ key, basis: "measured", foersteGodkendtAt: null, metrics });
const TRE = [m("2026-07", { revenue: 100_000 }), m("2026-08", { revenue: 120_000 }), m("2026-09", { revenue: 140_000 })];

const maal = (over: Partial<MaalMedTal> = {}): MaalMedTal => ({
  id: "m1",
  title: "Omsætning på 2 mio. kr. i årstakt",
  status: "active",
  deadline: "2027-04-01",
  created_at: "2026-04-01T08:00:00Z",
  target_value: 2_000_000,
  current_value: null,
  unit: null,
  art: "tal",
  maal_noegle: "omsaetning_aarstakt",
  udgangspunkt: 1_000_000,
  udgangspunkt_dato: "2026-04-01",
  ...over,
});

describe("hovedet", () => {
  it("eyebrow bærer måneden i dansk tid", () => {
    expect(eyebrowTekst(NU)).toBe("Dine mål · oktober 2026");
    expect(eyebrowTekst(new Date("2026-12-31T23:30:00Z"))).toBe("Dine mål · januar 2027");
  });
  it("hovedlinjen: mål og plads", () => {
    expect(hovedLinje(0)).toBe("Ingen mål endnu · 3 pladser ledige");
    expect(hovedLinje(1)).toBe("1 mål for de næste 12 måneder · 2 pladser ledige");
    expect(hovedLinje(2)).toBe("2 mål for de næste 12 måneder · 1 plads ledig");
    expect(hovedLinje(3)).toBe("3 mål for de næste 12 måneder · ingen plads ledig");
    expect(hovedLinje(5)).toBe("5 mål for de næste 12 måneder · flere end de 3, der er plads til");
  });
  it("hovedlinjen med ubekræftede (skive 3, fund 3): «N venter på jeres ja», pladsen er databasens, og fyldte pladser lover ingen plads", () => {
    expect(hovedLinje(1, 1)).toBe("1 mål for de næste 12 måneder · 1 venter på jeres ja · 1 plads ledig");
    expect(hovedLinje(0, 2)).toBe("Ingen mål endnu · 2 venter på jeres ja · 1 plads ledig");
    expect(hovedLinje(0, 3)).toBe(`Ingen mål endnu · 3 venter på jeres ja · ${TAG_STILLING_TEKST}`);
    expect(hovedLinje(2, 1)).toBe(`2 mål for de næste 12 måneder · 1 venter på jeres ja · ${TAG_STILLING_TEKST}`);
    expect(hovedLinje(3, 0)).toBe("3 mål for de næste 12 måneder · ingen plads ledig");
    expect(hovedLinje(2, 2)).toBe("2 mål for de næste 12 måneder · 2 venter på jeres ja · flere end de 3, der er plads til");
    expect(hovedLinje(1, 0)).toBe(hovedLinje(1));
  });
  it("chips: én pr. status blandt TAL-målene, bagud først, motorens ord med lille forbogstav", () => {
    const paaSporet = maalKort(maal(), [], TRE, NU); // 1,44 mio. af vejen 1 → 2 mio., forventet ≈ 0,5 → på sporet
    const bagud = maalKort(maal({ id: "m2", udgangspunkt: 1_400_000, target_value: 3_000_000 }), [], TRE, NU); // 0 af vejen
    const begivenhed = maalKort(maal({ id: "m3", art: "begivenhed", maal_noegle: null }), [], TRE, NU);
    const gammelt = maalKort(maal({ id: "m4", art: null }), [], TRE, NU);
    expect(paaSporet.sporet.status).toBe("paa_sporet");
    expect(bagud.sporet.status).toBe("bagud");
    expect(statusChips([paaSporet, bagud, begivenhed, gammelt])).toEqual([
      { status: "bagud", antal: 1, tekst: "1 bagud" },
      { status: "paa_sporet", antal: 1, tekst: "1 på sporet" },
    ]);
    expect(statusChips([])).toEqual([]);
  });
  it("chip-tonen", () => {
    expect(chipTone("bagud")).toBe("advarsel");
    expect(chipTone("paa_sporet")).toBe("god");
    expect(chipTone("foran")).toBe("god");
    expect(chipTone("naaet_i_tal")).toBe("god");
    expect(chipTone("kan_ikke_afgoeres")).toBe("neutral");
  });
});

describe("banen", () => {
  it("fyldt = andelAfVejen klippet 0–1, stregen = forventetAndel", () => {
    const k = maalKort(maal(), [], TRE, NU);
    const b = bane(k);
    expect(b.fyldt).toBeCloseTo(0.44, 5);
    expect(b.fyldtPct).toBe(44);
    expect(b.streg).toBeCloseTo(182 / 365, 5);
    expect(b.stregPct).toBe(49.9);
    expect(stregTekst(k)).toBe("hvor I burde være pr. september");
  });
  it("en negativ andel tegnes tom, over 1 tegnes fuld; uden tal ingen streg", () => {
    expect(bane({ sporet: { andelAfVejen: -0.3, forventetAndel: 0.2 } } as never).fyldtPct).toBe(0);
    expect(bane({ sporet: { andelAfVejen: 1.4, forventetAndel: 0.2 } } as never).fyldtPct).toBe(100);
    expect(bane({ sporet: { andelAfVejen: null, forventetAndel: null } } as never)).toEqual({ fyldt: 0, streg: null, fyldtPct: 0, stregPct: null });
  });
  it("underteksten: «pr. … (godkendt)» for et læst tal, «tastet» for andet_tal, null uden tal", () => {
    expect(talUndertekst(maalKort(maal(), [], TRE, NU))).toBe("pr. september (godkendt)");
    expect(talUndertekst(maalKort(maal({ maal_noegle: "andet_tal", current_value: 12, unit: "kunder", udgangspunkt: 10, target_value: 20 }), [], TRE, NU))).toBe(TASTET_TEKST);
    expect(talUndertekst(maalKort(maal(), [], null, NU))).toBeNull();
  });
});

describe("skridtene", () => {
  const sk = (over: Partial<SkridtTilMaal>): SkridtTilMaal => ({ id: "s", title: "Ring til kunden", status: "active", due_date: "2026-10-10", maal_id: "m1", created_at: "2026-09-01T00:00:00Z", ...over });
  it("et begivenhedsmåls fremdrift i skridt — ingen procent", () => {
    const k = maalKort(maal({ art: "begivenhed", maal_noegle: null }), [sk({ id: "a", status: "done", closed_at: "2026-09-10T00:00:00Z" }), sk({ id: "b" }), sk({ id: "c", status: "proposed", due_date: null })], null, NU);
    expect(skridtFremdrift(k)).toEqual({ gjorte: 1, alle: 3, andel: 1 / 3, tekst: "1 af 3 skridt gjort" });
    expect(skridtFremdrift(maalKort(maal({ art: "begivenhed", maal_noegle: null }), [], null, NU)).tekst).toBe("Ingen skridt endnu");
  });
  it("«N skridt mere · M gjort» — null uden flere", () => {
    const k = maalKort(maal(), [sk({ id: "a", status: "done" }), sk({ id: "b" }), sk({ id: "c", due_date: "2026-10-20" }), sk({ id: "d", due_date: "2026-11-01" })], TRE, NU);
    expect(flereSkridtTekst(k)).toBe("2 skridt mere · 1 gjort");
    expect(flereSkridtTekst(maalKort(maal(), [sk({ id: "b" })], TRE, NU))).toBeNull();
    expect(flereSkridtTekst(maalKort(maal(), [sk({ id: "a", status: "done" })], TRE, NU))).toBe("1 gjort");
  });
});

describe("guiden", () => {
  it("seks kort: motorens fem nøgler i rækkefølge, så begivenheden", () => {
    const k = guideKort();
    expect(k.map((x) => x.valg)).toEqual([...MAAL_NOEGLER, "begivenhed"]);
    expect(k[0].titel).toBe("Omsætning (årstakt)");
    expect(k[5].titel).toBe("Noget der skal ske");
  });
  it("«Det kræver ca. X pr. måned» — ned, når tallet skal ned; null uden tal eller ved 0", () => {
    const kr = (v: number) => `${Math.round(v)} kr.`;
    expect(kraeverTekst(83_333.3, kr)).toBe("Det kræver ca. 83333 kr. pr. måned");
    expect(kraeverTekst(-2, (v) => `${v} mdr.`)).toBe("Tallet skal ned med ca. 2 mdr. pr. måned");
    expect(kraeverTekst(null, kr)).toBeNull();
    expect(kraeverTekst(0, kr)).toBeNull();
    expect(kraeverTekst(Number.NaN, kr)).toBeNull();
  });
});

describe("rejsen", () => {
  it("positioner 0–1 i kalenderdage; aksen, skridtene og fristerne hver for sig", () => {
    const t = tidslinje([maal({ deadline: "2027-01-01" })], [{ id: "s", title: "Gjort", status: "done", due_date: null, maal_id: "m1", closed_at: "2026-07-01T10:00:00Z" }], "2026-04-01", NU);
    const tegn = tidslinjeTegning(t);
    expect(tegn.akse.map((a) => a.punkt.art)).toEqual(["start", "kvartal", "kvartal", "kvartal", "slut"]);
    expect(tegn.akse[0].x).toBe(0);
    expect(tegn.akse[4].x).toBe(1);
    expect(tegn.skridt).toHaveLength(1);
    expect(tegn.skridt[0].x).toBeCloseTo(91 / 365, 5);
    expect(tegn.skridt[0].dato).toBe("1. jul.");
    expect(tegn.frister[0].x).toBeCloseTo(275 / 365, 5);
    expect(tegn.nuX).toBeCloseTo(183 / 365, 5);
    expect(tegn.tom).toBe(false);
  });
  it("tom uden skridt og frister", () => {
    const t = tidslinje([], [], "2026-04-01", NU);
    expect(tidslinjeTegning(t).tom).toBe(true);
  });
});

describe("danskTal — ét dansk tal fra et inputfelt (fund 4)", () => {
  it("tusindtalspunktum og decimalkomma", () => {
    expect(danskTal("1.500")).toBe(1500);
    expect(danskTal("1.500,5")).toBe(1500.5);
    expect(danskTal("2.000.000")).toBe(2_000_000);
    expect(danskTal("1500")).toBe(1500);
    expect(danskTal("1,5")).toBe(1.5);
    expect(danskTal("-200.000")).toBe(-200_000);
    expect(danskTal("+40")).toBe(40);
    expect(danskTal(" 1 500 ")).toBe(1500);
    expect(danskTal("1\u00a0500,25")).toBe(1500.25);
    expect(danskTal("0,5")).toBe(0.5);
  });
  it("det tvetydige «1.5» (ét punktum, ikke tre cifre efter) læses som decimal — «1.500» er altid 1500", () => {
    expect(danskTal("1.5")).toBe(1.5);
    expect(danskTal("1.25")).toBe(1.25);
    expect(danskTal("12.5")).toBe(12.5);
    expect(danskTal("1.500")).toBe(1500);
  });
  it("tomt og ugyldigt → null", () => {
    expect(danskTal("")).toBeNull();
    expect(danskTal("   ")).toBeNull();
    expect(danskTal("abc")).toBeNull();
    expect(danskTal("1,5,5")).toBeNull();
    expect(danskTal("1.50,5")).toBeNull();
    expect(danskTal("1.")).toBeNull();
    expect(danskTal(".5")).toBeNull();
    expect(danskTal("1.5.000")).toBeNull();
    expect(danskTal("1.500.00")).toBeNull();
    expect(danskTal("1e5")).toBeNull();
  });

  it("runde 2, fund 6: kendte suffikser fjernes — kr., kr, %, mdr., mdr", () => {
    expect(danskTal("1.500 kr.")).toBe(1500);
    expect(danskTal("1.500kr")).toBe(1500);
    expect(danskTal("2.000.000 KR.")).toBe(2_000_000);
    expect(danskTal("40 %")).toBe(40);
    expect(danskTal("40%")).toBe(40);
    expect(danskTal("6 mdr.")).toBe(6);
    expect(danskTal("6 mdr")).toBe(6);
    expect(danskTal("1,5 mio.")).toBe(1_500_000);
    expect(danskTal("2 mio")).toBe(2_000_000);
    expect(danskTal("1,5 mio. kr.")).toBe(1_500_000);
    expect(danskTal("1,5 mio. kr")).toBe(1_500_000);
    expect(danskTal("-2 mio. kr.")).toBe(-2_000_000);
  });
  it("runde 2, fund 6: mio. kun når tallet er entydigt (uden punktum) — ellers afvist med grund", () => {
    expect(danskTalDom("1.500 mio.")).toEqual({ vaerdi: null, grund: TAL_MIO_TVETYDIG });
    expect(danskTalDom("1.5 mio.")).toEqual({ vaerdi: null, grund: TAL_MIO_TVETYDIG });
    expect(danskTalDom("2 mio. mio.")).toEqual({ vaerdi: null, grund: TAL_KUN_TALLET });
  });
  it("runde 2, fund 6: unicode-minus «−» læses som minus", () => {
    expect(danskTal("\u2212200.000")).toBe(-200_000);
    expect(danskTal("\u2212 1,5 mio.")).toBe(-1_500_000);
  });
  it("runde 2, fund 6: tekst, der ikke er et tal, får sin egen grund; en formfejl og et tomt felt har ingen (kalderens tekst)", () => {
    expect(danskTalDom("100 kunder")).toEqual({ vaerdi: null, grund: TAL_KUN_TALLET });
    expect(danskTalDom("ca. 40")).toEqual({ vaerdi: null, grund: TAL_KUN_TALLET });
    expect(danskTalDom("kr.")).toEqual({ vaerdi: null, grund: TAL_KUN_TALLET });
    expect(danskTalDom("1.500 mia.")).toEqual({ vaerdi: null, grund: TAL_KUN_TALLET });
    expect(danskTalDom("1,5,5")).toEqual({ vaerdi: null, grund: null });
    expect(danskTalDom("")).toEqual({ vaerdi: null, grund: null });
    expect(danskTalDom("1.500")).toEqual({ vaerdi: 1500, grund: null });
  });
});

describe("danskTalTilFelt — et tal til et felt, så danskTal læser det uændret (runde 2, fund 1)", () => {
  it("komma som decimaltegn, ingen gruppering", () => {
    expect(danskTalTilFelt(2.125)).toBe("2,125");
    expect(danskTalTilFelt(1500)).toBe("1500");
    expect(danskTalTilFelt(-200_000)).toBe("-200000");
    expect(danskTalTilFelt(1_000_000.25)).toBe("1000000,25");
    expect(danskTalTilFelt(0.001)).toBe("0,001");
    expect(danskTalTilFelt(null)).toBe("");
    expect(danskTalTilFelt(undefined)).toBe("");
    expect(danskTalTilFelt(Number.NaN)).toBe("");
  });
  it("rundturen danskTal(danskTalTilFelt(v)) === v", () => {
    for (const v of [2.125, 0.001, 1500, -200_000, 1_000_000.25, 12.5, 0, 1e21, 1e-7]) {
      expect(danskTal(danskTalTilFelt(v))).toBe(v);
    }
    // Det gamle String(2.125) = «2.125» læste danskTal som 2125 — fejlen, fund 1 fandt.
    expect(danskTal(String(2.125))).toBe(2125);
  });
});
