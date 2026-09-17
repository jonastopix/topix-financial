import { describe, expect, it } from "vitest";
import {
  broFor,
  danskDag,
  dashboardDom,
  datoKort,
  koncentrationFor,
  krMedFortegn,
  kurveFor,
  kurveKoordinater,
  laegMaanederTil,
  maanedsLabel,
  maanedsNavn,
  noegletalFor,
  OEKONOMI_TOM_TEKST,
  pct,
  prisudviklingFor,
  radarFor,
  udestaaendeFor,
} from "@/lib/oekonomi/dashboard";
import { periodiser, type Kontrakt } from "@/lib/oekonomi/omsaetning";
import { betalingerTilMotor, type Overblik, type OverblikBetaling } from "@/lib/oekonomi/overblik";
import facit from "./fixtures/kontrakter-facit.json";
import betalingerKopi from "./fixtures/betalinger-lokal-kopi-16-9.json";

/* Dommen bag /oekonomi (Ø3, 18/9). Jonas 17/9: «Vi elsker tal og data.» */

const NU = new Date("2026-09-17T10:00:00Z");

const k = (over: Partial<Kontrakt> & { id: string; company_id: string }): Kontrakt => ({
  periode_start: "2026-01-01",
  periode_slut: "2027-01-01",
  pris_eks_moms_oere: 4_200_000,
  grundpris_oere: 4_000_000,
  betalingsmodel: "rate12",
  kilde: "backfill",
  ...over,
});
const b = (over: Partial<OverblikBetaling> & { id: string; company_id: string; betalt_at: string; beloeb_eks_moms_oere: number }): OverblikBetaling => ({
  status: "betalt", kilde: "stripe_abonnement", art: null, faktura_nummer: null, beloeb_oere: Math.round(over.beloeb_eks_moms_oere * 1.25), moms_oere: Math.round(over.beloeb_eks_moms_oere * 0.25), ...over,
});
const overblik = (kontrakter: Kontrakt[], betalinger: OverblikBetaling[] = [], fornyelser?: Overblik["fornyelser"]): Overblik => ({
  kontrakter,
  betalinger,
  virksomheder: [
    { id: "a", name: "Alfa ApS", status: "active", contract_start_date: null, contract_end_date: null, er_kunde: true, is_legat: false },
    { id: "b", name: "Beta ApS", status: "active", contract_start_date: null, contract_end_date: null, er_kunde: true, is_legat: false },
    { id: "c", name: "Gamma ApS", status: "active", contract_start_date: null, contract_end_date: null, er_kunde: true, is_legat: false },
  ],
  fornyelser,
  hentet_at: "2026-09-17T10:00:00+00:00",
});

describe("kalender og formatering", () => {
  it("laegMaanederTil går over årsskiftet begge veje; labels og datoer er danske", () => {
    expect(laegMaanederTil("2026-09", 4)).toBe("2027-01");
    expect(laegMaanederTil("2026-01", -1)).toBe("2025-12");
    expect(laegMaanederTil("2026-09", 12)).toBe("2027-09");
    expect(maanedsLabel("2026-09")).toBe("sep 26");
    expect(maanedsNavn("2026-09")).toBe("september 2026");
    expect(datoKort("2027-03-14")).toBe("14/3-2027");
    expect(pct(0.384)).toBe("38 %");
    expect(krMedFortegn(416_667)).toBe("+4.167");
    expect(krMedFortegn(-350_000)).toBe("−3.500");
    expect(krMedFortegn(0)).toBe("0");
    expect(danskDag(new Date("2026-08-31T22:30:00Z"))).toBe("2026-09-01");
  });
});

describe("nøgletal og kurve", () => {
  const kontrakter = [k({ id: "a1", company_id: "a", periode_start: "2026-05-11", periode_slut: "2027-05-11", pris_eks_moms_oere: 5_000_000, grundpris_oere: 5_000_000, betalingsmodel: "fuld" })];
  const betalinger = [b({ id: "t1", company_id: "a", betalt_at: "2026-05-11T10:00:00+02:00", beloeb_eks_moms_oere: 5_000_000 })];
  const maaneder = periodiser({ kontrakter, betalinger: betalingerTilMotor(betalinger), fra: "2026-05", til: "2027-09" });
  it("september: MRR/ARR, anerkendt, kontant 0, kontraheret de næste 12 = resten af kontrakten, forudbetalt = betalt − anerkendt til dato", () => {
    const n = noegletalFor(maaneder, "2026-09");
    expect(n.mrr_oere).toBe(416_667);
    expect(n.arr_oere).toBe(5_000_004);
    expect(n.anerkendt_oere).toBe(416_667);
    expect(n.kontant_oere).toBe(0);
    const tilDato = maaneder.filter((m) => m.key <= "2026-09").reduce((s, m) => s + m.anerkendt_oere, 0);
    expect(n.kontraheret_12_oere).toBe(5_000_000 - tilDato);
    expect(n.forudbetalt_oere).toBe(5_000_000 - tilDato);
    expect(n.udestaaende_oere).toBe(0);
    expect(n.aktive).toBe(1);
  });
  it("kurven: MRR ultimo og betalende pr. punkt; til og med i dag «tjent», derefter «frem»; koordinaterne deler dagens punkt og skalerer til max", () => {
    const kurve = kurveFor(maaneder, "2026-09");
    expect(kurve[0].key).toBe("2026-05");
    expect(kurve.find((p) => p.key === "2026-09")).toMatchObject({ frem: false, mrr_oere: 416_667, betalende: 1, anerkendt_oere: 416_667 });
    expect(kurve.find((p) => p.key === "2026-10")?.frem).toBe(true);
    expect(kurve.find((p) => p.key === "2027-06")).toMatchObject({ mrr_oere: 0, betalende: 0 });
    const ko = kurveKoordinater(kurve);
    expect(ko.max_oere).toBe(5_000_000); // kontant i maj er det største
    expect(ko.tjent.length).toBe(5); // maj–sep
    expect(ko.mrr.length).toBe(5);
    expect(ko.mrr[1].y).toBeCloseTo(1 - 416_667 / 5_000_000, 10);
    expect(ko.kontraheret[0]).toEqual(ko.tjent[ko.tjent.length - 1]); // dagens punkt deles
    expect(ko.mrr_kontraheret[0]).toEqual(ko.mrr[ko.mrr.length - 1]);
    expect(ko.kontraheret.length).toBe(kurve.length - 5 + 1);
    expect(ko.soejler[0].hoejde).toBe(1);
    expect(ko.soejler[1].hoejde).toBe(0);
    expect(ko.akse[0]).toEqual({ x: 0, label: "maj 26", betalende: 1 });
    expect(ko.akse[ko.akse.length - 1].label).toBe("sep 27");
    expect(kurveKoordinater([])).toEqual({ mrr: [], mrr_kontraheret: [], tjent: [], kontraheret: [], soejler: [], max_oere: 0, akse: [] });
  });
  it("kurven klipper til KURVE_FRA (maj 2025) — tidligere måneder tæller i tallene, men tegnes ikke", () => {
    const tidlig = periodiser({ kontrakter: [k({ id: "kj", company_id: "kj", periode_start: "2025-03-11", periode_slut: "2026-03-11", pris_eks_moms_oere: 2_236_672 })], fra: "2025-03", til: "2025-06" });
    const kurve = kurveFor(tidlig, "2026-09");
    expect(tidlig[0].key).toBe("2025-03");
    expect(kurve.map((p) => p.key)).toEqual(["2025-05", "2025-06"]);
  });
});

describe("broen med navne", () => {
  const kontrakter = [
    k({ id: "a1", company_id: "a", periode_start: "2025-08-20", periode_slut: "2026-08-20", pris_eks_moms_oere: 4_000_000 }),
    k({ id: "a2", company_id: "a", periode_start: "2026-08-20", periode_slut: "2027-08-20", pris_eks_moms_oere: 2_000_000, grundpris_oere: 2_000_000 }), // fornyet ned
    k({ id: "b1", company_id: "b", periode_start: "2025-09-05", periode_slut: "2026-09-05" }), // tabt i september
    k({ id: "c1", company_id: "c", periode_start: "2026-09-15", periode_slut: "2027-09-15", pris_eks_moms_oere: 5_250_000, grundpris_oere: 5_000_000 }), // ny
  ];
  const o = overblik(kontrakter);
  const maaneder = periodiser({ kontrakter, fra: "2025-08", til: "2027-09" });
  const bro = broFor(o, maaneder, "2026-09");
  it("12 måneder, sidste er indeværende; start = forrige måneds MRR, slut = denne; posterne bærer navne", () => {
    expect(bro).toHaveLength(12);
    expect(bro[0].key).toBe("2025-10");
    expect(bro[11].key).toBe("2026-09");
    const sep = bro[11];
    expect(sep.start_oere).toBe(maaneder.find((m) => m.key === "2026-08")!.mrr_oere);
    expect(sep.slut_oere).toBe(maaneder.find((m) => m.key === "2026-09")!.mrr_oere);
    expect(sep.ny_oere).toBe(437_500);
    expect(sep.tabt_oere).toBe(-350_000);
    expect(sep.poster.map((p) => [p.slags, p.navn])).toEqual([["ny", "Gamma ApS"], ["tabt", "Beta ApS"]]);
    expect(sep.start_oere + sep.ny_oere + sep.fornyet_op_oere + sep.fornyet_ned_oere + sep.tabt_oere).toBe(sep.slut_oere);
    const aug = bro[10];
    expect(aug.fornyet_ned_oere).toBe(166_667 - 333_333);
    expect(aug.poster[0]).toMatchObject({ slags: "fornyet_ned", navn: "Alfa ApS" });
  });
  it("hver måned afstemmer: start + poster = slut", () => {
    for (const m of bro) expect(m.start_oere + m.ny_oere + m.fornyet_op_oere + m.fornyet_ned_oere + m.tabt_oere).toBe(m.slut_oere);
  });
});

describe("fornyelsesradaren", () => {
  const kontrakter = [
    k({ id: "a1", company_id: "a", periode_start: "2025-10-13", periode_slut: "2026-10-13" }), // 26 dage
    k({ id: "b1", company_id: "b", periode_start: "2025-12-16", periode_slut: "2026-12-16" }), // 90 dage
    k({ id: "c1", company_id: "c", periode_start: "2025-08-20", periode_slut: "2026-09-20", pris_eks_moms_oere: 4_000_000 }),
    k({ id: "c2", company_id: "c", periode_start: "2026-09-20", periode_slut: "2027-09-20", pris_eks_moms_oere: 2_000_000, grundpris_oere: 2_000_000 }), // allerede fornyet
    k({ id: "d1", company_id: "d", periode_start: "2026-01-01", periode_slut: "2026-12-17" }), // 91 dage: udenfor
    k({ id: "e1", company_id: "e", periode_start: "2025-09-05", periode_slut: "2026-09-05" }), // udløbet: udenfor
  ];
  it("vinduet er (i dag, i dag + 90]; sorteret efter dage; «fornyet» når et nyt kontraktår findes; ukendt uden RPC-nøglen", () => {
    const r = radarFor(overblik(kontrakter), "2026-09-17");
    expect(r.ukendt).toBe(true);
    expect(r.raekker.map((x) => [x.navn, x.dage, x.beslutning])).toEqual([
      ["Gamma ApS", 3, "fornyet"],
      ["Alfa ApS", 26, "ukendt"],
      ["Beta ApS", 90, "ukendt"],
    ]);
    expect(r.i_spil_oere).toBe(4_200_000 * 2); // Gamma er fornyet og tæller ikke
    expect(r.raekker[1].grundpris_oere).toBe(4_000_000);
  });
  it("med fornyelser: seneste beslutning pr. virksomhed; «ingen» uden række", () => {
    const r = radarFor(overblik(kontrakter, [], [
      { company_id: "a", beslutning: "tilbyd_ikke", besluttet_at: "2026-09-10T08:00:00+00:00", note: "på vej ud" },
      { company_id: "a", beslutning: "tilbyd", besluttet_at: "2026-08-01T08:00:00+00:00", note: null },
    ]), "2026-09-17");
    expect(r.ukendt).toBe(false);
    expect(r.raekker.find((x) => x.navn === "Alfa ApS")).toMatchObject({ beslutning: "tilbyd_ikke", note: "på vej ud" });
    expect(r.raekker.find((x) => x.navn === "Beta ApS")?.beslutning).toBe("ingen");
  });
});

describe("prisudvikling, koncentration, udestående", () => {
  it("prisudvikling: kun virksomheder med to kontraktår; år 1 → år 2 for grundpris og pris; samlet", () => {
    const p = prisudviklingFor(overblik([
      k({ id: "a1", company_id: "a", periode_start: "2025-08-20", periode_slut: "2026-08-20", pris_eks_moms_oere: 4_000_000, betalingsmodel: "fuld" }),
      k({ id: "a2", company_id: "a", periode_start: "2026-08-20", periode_slut: "2027-08-20", pris_eks_moms_oere: 2_000_000, grundpris_oere: 2_000_000 }),
      k({ id: "b1", company_id: "b" }),
      k({ id: "c1", company_id: "c", periode_start: "2025-03-11", periode_slut: "2026-03-11", pris_eks_moms_oere: 2_236_672, grundpris_oere: 3_000_000 }),
      k({ id: "c2", company_id: "c", periode_start: "2026-05-20", periode_slut: "2027-05-20", pris_eks_moms_oere: 1_575_000, grundpris_oere: 1_500_000 }),
    ]));
    expect(p.raekker.map((r) => r.navn)).toEqual(["Alfa ApS", "Gamma ApS"]);
    expect(p.raekker[0]).toMatchObject({ delta_pris_oere: -2_000_000, delta_grundpris_oere: -2_000_000 });
    expect(p.raekker[1]).toMatchObject({ delta_pris_oere: 1_575_000 - 2_236_672, delta_grundpris_oere: -1_500_000 });
    expect(p.samlet).toEqual({ grundpris_aar1: 7_000_000, grundpris_aar2: 3_500_000, pris_aar1: 6_236_672, pris_aar2: 3_575_000 });
  });
  it("koncentration: de fem største af MRR ved månedens slutning; gratis tæller ikke", () => {
    const kontrakter = ["a", "b", "c", "d", "e", "f"].map((id, i) => k({ id: `${id}1`, company_id: id, pris_eks_moms_oere: (i + 1) * 1_200_000, grundpris_oere: (i + 1) * 1_200_000 }));
    kontrakter.push(k({ id: "g1", company_id: "g", pris_eks_moms_oere: 0, grundpris_oere: 0, betalingsmodel: "gratis" }));
    const c = koncentrationFor(overblik(kontrakter), "2026-09");
    expect(c.betalende).toBe(6);
    expect(c.top.map((r) => r.mrr_oere)).toEqual([600_000, 500_000, 400_000, 300_000, 200_000]);
    expect(c.mrr_i_alt_oere).toBe(2_100_000);
    expect(c.top_andel).toBeCloseTo(2_000_000 / 2_100_000, 10);
    expect(c.top[0].navn).toBe("virksomhed f"); // ukendt id → kort navn
  });
  it("udestående: kun negative forskelle; fejlede træk listes med beløb ekskl. moms", () => {
    const kontrakter = [
      k({ id: "a1", company_id: "a", periode_start: "2026-05-20", periode_slut: "2027-05-20", pris_eks_moms_oere: 5_250_000, grundpris_oere: 5_000_000 }),
      k({ id: "b1", company_id: "b", periode_start: "2026-05-11", periode_slut: "2027-05-11", pris_eks_moms_oere: 5_000_000, grundpris_oere: 5_000_000, betalingsmodel: "fuld" }),
    ];
    const betalinger = [
      ...[5, 6, 7, 8].map((m) => b({ id: `a${m}`, company_id: "a", betalt_at: `2026-0${m}-20T10:00:00+02:00`, beloeb_eks_moms_oere: 437_500 })),
      b({ id: "b0", company_id: "b", betalt_at: "2026-05-11T10:00:00+02:00", beloeb_eks_moms_oere: 5_000_000 }),
      b({ id: "af", company_id: "a", betalt_at: "", beloeb_eks_moms_oere: 437_500, status: "fejlet", faktura_nummer: "TBR-0009" }),
    ];
    const u = udestaaendeFor(overblik(kontrakter, betalinger), "2026-09");
    expect(u.raekker.map((r) => r.navn)).toEqual(["Alfa ApS"]); // Beta er forudbetalt
    const anerkendtA = periodiser({ kontrakter: [kontrakter[0]], fra: "2026-05", til: "2026-09" }).reduce((s, m) => s + m.anerkendt_oere, 0);
    expect(u.raekker[0].forskel_oere).toBe(4 * 437_500 - anerkendtA);
    expect(u.i_alt_oere).toBe(u.raekker[0].forskel_oere);
    expect(u.fejlede).toEqual([{ company_id: "a", navn: "Alfa ApS", faktura_nummer: "TBR-0009", kilde: "stripe_abonnement", beloeb_eks_moms_oere: 437_500 }]);
    expect(u.fejlede_i_alt_oere).toBe(437_500);
  });
});

describe("dashboardDom — hele dommen", () => {
  it("uden kontrakter: tom med teksten", () => {
    expect(dashboardDom(overblik([]), NU)).toEqual({ tom: true, tekst: OEKONOMI_TOM_TEKST });
  });
  it("Ø1's facit og betalinger (lokal kopi 16/9): september 2026 ≈ 85.283 anerkendt, MRR 83.882, 25 betalende + 1 gratis", () => {
    const raekker = (facit as { raekker: { navn: string; company_id: string; start: string; slut: string; grundpris: number; pris: number; model: string }[] }).raekker;
    const kontrakter: Kontrakt[] = raekker.map((r, i) => ({
      id: `f${i}`, company_id: r.company_id, periode_start: r.start === "created_at" ? "2026-01-01" : r.start, periode_slut: r.slut,
      pris_eks_moms_oere: r.pris, grundpris_oere: r.grundpris, betalingsmodel: r.model, kilde: "backfill",
    }));
    const bet = (betalingerKopi as { raekker: { company_id: string; kilde: string; ref: string; betalt_at: string; beloeb_oere: number; eks_moms_oere: number }[] }).raekker;
    const aktive = new Set(kontrakter.map((x) => x.company_id));
    const betalinger: OverblikBetaling[] = bet.filter((x) => aktive.has(x.company_id)).map((x, i) => ({
      id: `b${i}`, company_id: x.company_id, betalt_at: x.betalt_at, status: "betalt", kilde: x.kilde, art: null, faktura_nummer: x.ref,
      beloeb_oere: x.beloeb_oere, moms_oere: x.beloeb_oere - x.eks_moms_oere, beloeb_eks_moms_oere: x.eks_moms_oere,
    }));
    const navne = new Map(raekker.map((r) => [r.company_id, r.navn]));
    const o: Overblik = {
      kontrakter, betalinger,
      virksomheder: [...aktive].map((id) => ({ id, name: navne.get(id) ?? id, status: "active", contract_start_date: null, contract_end_date: null, er_kunde: true, is_legat: false })),
      hentet_at: "2026-09-17T10:00:00+00:00",
    };
    const dom = dashboardDom(o, NU);
    if (dom.tom === true) throw new Error("tom");
    expect(dom.nuKey).toBe("2026-09");
    expect(Math.round(dom.noegletal.anerkendt_oere / 100)).toBe(85_283);
    expect(Math.round(dom.noegletal.mrr_oere / 100)).toBe(83_882);
    expect(dom.noegletal.aktive).toBe(25);
    expect(dom.noegletal.gratis_aktive).toBe(1);
    expect(Math.round(dom.noegletal.kontant_oere / 100)).toBe(38_500);
    expect(dom.kurve[0].key).toBe("2025-05"); // KURVE_FRA — KJ AUTO år 1 (11/3-2025) tæller, men tegnes fra maj
    expect(dom.maaneder[0].key).toBe("2025-03");
    expect(dom.kurve.find((p) => p.key === "2026-09")).toMatchObject({ betalende: 25 });
    expect(Math.round(dom.kurve.find((p) => p.key === "2026-09")!.mrr_oere / 100)).toBe(83_882);
    expect(dom.kurve[dom.kurve.length - 1].key).toBe("2027-09");
    expect(dom.bro[11].key).toBe("2026-09");
    expect(dom.bro[11].poster.map((p) => p.slags).sort()).toEqual(["ny", "ny", "tabt", "tabt", "tabt"]);
    expect(dom.radar.raekker.map((r) => r.navn)).toEqual(["PHILBERT ApS", "Doggybed", "Livja"]); // 29/9, 13/10, 16/12 (90 dage)
    expect(dom.radar.ukendt).toBe(true);
    expect(dom.prisudvikling.raekker.map((r) => r.navn)).toEqual(["BRILLEVÆRK", "Capture IT A/S", "KJ AUTO OG MIKROMAKKER", "Warburg VVS & Kloak Ekspres ApS"]);
    expect(dom.koncentration.top).toHaveLength(5);
    expect(dom.koncentration.betalende).toBe(25);
    expect(dom.udestaaende.raekker.length).toBeGreaterThan(0);
    expect(Math.round(dom.udestaaende.i_alt_oere / 100)).toBe(-9_200);
  });
});
