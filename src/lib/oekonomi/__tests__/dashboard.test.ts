import { describe, expect, it } from "vitest";
import {
  AKSE_MIN_AFSTAND,
  akseIndeks,
  broFor,
  danskDag,
  dashboardDom,
  datoKort,
  erAktivKunde,
  forfaldentFor,
  krMedFortegn,
  kundevaerdiFor,
  kundevaerdiTekst,
  KUNDEVAERDI_ANTAL,
  kurveFor,
  kurveKoordinater,
  laegMaanederTil,
  laegMaanederTilDag,
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
    // Ø3b: 17 punkter (maj 26 … sep 27): hver 3. er 0,3,6,9,12,15 + sidste 16 — 15 ligger 1/16 = 6,25 % fra 16 og består (≥ 6 %).
    expect(ko.akse.map((a) => a.label)).toEqual(["maj 26", "aug 26", "nov 26", "feb 27", "maj 27", "aug 27", "sep 27"]);
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
  it("Ø3b (Jonas' skærmbillede 17/9 17:27): Pro-Vision ApS (21/9, 42.000 / 40.000) og E-skilte ApS (29/10, 40.000 / 40.000) er «tidligere» — ude af radaren og af «i spil» (208.000 → 126.000)", () => {
    const o = overblik([
      ...kontrakter,
      k({ id: "pv1", company_id: "pv", periode_start: "2025-09-21", periode_slut: "2026-09-21", pris_eks_moms_oere: 4_200_000, grundpris_oere: 4_000_000 }),
      k({ id: "es1", company_id: "es", periode_start: "2025-10-29", periode_slut: "2026-10-29", pris_eks_moms_oere: 4_000_000, grundpris_oere: 4_000_000 }),
    ]);
    o.virksomheder.push(
      { id: "pv", name: "Pro-Vision ApS", status: "tidligere", contract_start_date: null, contract_end_date: null, er_kunde: true, is_legat: false },
      { id: "es", name: "E-skilte ApS", status: "tidligere", contract_start_date: null, contract_end_date: null, er_kunde: true, is_legat: false },
    );
    const r = radarFor(o, "2026-09-17");
    expect(r.raekker.map((x) => x.navn)).toEqual(["Gamma ApS", "Alfa ApS", "Beta ApS"]);
    expect(r.raekker.map((x) => x.navn)).not.toContain("Pro-Vision ApS");
    expect(r.i_spil_oere).toBe(4_200_000 * 2); // 8.400.000 øre = «126.000» i skærmbilledets skala er Alfa + Beta her; Pro-Vision og E-skilte tæller ikke
    // Som skærmbilledet: de to alene ville have lagt 42.000 + 40.000 = 82.000 til (208.000 − 126.000).
    const kunDeTo = radarFor({ ...o, kontrakter: o.kontrakter.filter((x) => x.company_id === "pv" || x.company_id === "es") }, "2026-09-17");
    expect(kunDeTo.raekker).toEqual([]);
    expect(kunDeTo.i_spil_oere).toBe(0);
    // Med status active ville de have stået — det er status, ikke datoen, der holder dem ude.
    const somAktive = { ...o, virksomheder: o.virksomheder.map((v) => ({ ...v, status: "active" })) };
    expect(radarFor(somAktive, "2026-09-17").i_spil_oere).toBe(4_200_000 * 2 + 4_200_000 + 4_000_000);
    expect(erAktivKunde({ status: "active", er_kunde: true })).toBe(true);
    expect(erAktivKunde({ status: "tidligere", er_kunde: true })).toBe(false);
    expect(erAktivKunde({ status: "active", er_kunde: false })).toBe(false);
    expect(erAktivKunde({ status: null, er_kunde: true })).toBe(false);
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

describe("aksen (Ø3b) — «augsep» yderst til højre", () => {
  it("hver 3. + den sidste; en etiket under AKSE_MIN_AFSTAND fra den sidste udelades — den sidste vinder", () => {
    expect(AKSE_MIN_AFSTAND).toBe(0.06);
    // Kurven i drift 17/9: maj 2025 … sep 2027 = 29 punkter. Før: 0,3,…,27 + 28 — «aug 27» (27) og «sep 27» (28) 3,6 % fra hinanden.
    expect(akseIndeks(29)).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24, 28]);
    expect(akseIndeks(29)).not.toContain(27);
    // 28 punkter: 27 ER den sidste — ingen kollision.
    expect(akseIndeks(28)).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24, 27]);
    // 30 punkter: 27 ligger 2/29 = 6,9 % fra 29 og består.
    expect(akseIndeks(30)).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 29]);
    expect(akseIndeks(1)).toEqual([0]);
    expect(akseIndeks(2)).toEqual([0, 1]); // 1/1 = 100 % fra hinanden
    expect(akseIndeks(0)).toEqual([]);
    // Grænsen er et valg: med 10 % ville 27 også ryge ved 30 punkter.
    expect(akseIndeks(30, 0.1)).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24, 29]);
    // Kurvens akse bruger den samme dom.
    const kurve = Array.from({ length: 29 }, (_, i) => ({ key: laegMaanederTil("2025-05", i), anerkendt_oere: 1, mrr_oere: 1, betalende: 1, kontant_oere: 0, frem: i > 16 }));
    expect(kurveKoordinater(kurve).akse.map((a) => a.label).slice(-3)).toEqual(["feb 27", "maj 27", "sep 27"]);
  });
});

describe("prisudvikling, kundeværdi, udestående", () => {
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
  it("kundeværdi (Ø3b): de 10 største efter samlet betalt siden første betaling; andel, kontraktår, status; teksten", () => {
    // Før (koncentrationFor): «de fem største af MRR ved månedens slutning» — fem kunder på 4.375 · 5 %.
    const kontrakter = ["a", "b", "c"].map((id) => k({ id: `${id}1`, company_id: id }));
    kontrakter.push(k({ id: "b2", company_id: "b", periode_start: "2027-01-01", periode_slut: "2028-01-01" }));
    const betalinger = [
      b({ id: "a1", company_id: "a", betalt_at: "2025-03-11T10:00:00+01:00", beloeb_eks_moms_oere: 1_000_000 }),
      b({ id: "a2", company_id: "a", betalt_at: "2026-05-11T10:00:00+02:00", beloeb_eks_moms_oere: 500_000 }),
      b({ id: "b1", company_id: "b", betalt_at: "2026-06-01T10:00:00+02:00", beloeb_eks_moms_oere: 2_000_000 }),
      b({ id: "c1", company_id: "c", betalt_at: "2026-07-01T10:00:00+02:00", beloeb_eks_moms_oere: 500_000 }),
      b({ id: "x1", company_id: "x", betalt_at: "2026-07-01T10:00:00+02:00", beloeb_eks_moms_oere: 250_000 }), // tidligere kunde uden kontraktår i data
      b({ id: "cf", company_id: "c", betalt_at: "", beloeb_eks_moms_oere: 9_000_000, status: "fejlet" }), // tæller ikke
    ];
    const o = overblik(kontrakter, betalinger);
    o.virksomheder.push({ id: "x", name: "Xi ApS", status: "tidligere", contract_start_date: null, contract_end_date: null, er_kunde: true, is_legat: false });
    const kv = kundevaerdiFor(o);
    expect(KUNDEVAERDI_ANTAL).toBe(10);
    expect(kv.betalt_i_alt_oere).toBe(4_250_000);
    expect(kv.kunder).toBe(4);
    expect(kv.siden).toBe("2025-03");
    expect(kv.top.map((r) => [r.navn, r.betalt_oere, r.kontraktaar, r.status])).toEqual([
      ["Beta ApS", 2_000_000, 2, "aktiv"],
      ["Alfa ApS", 1_500_000, 1, "aktiv"],
      ["Gamma ApS", 500_000, 1, "aktiv"],
      ["Xi ApS", 250_000, 0, "tidligere"],
    ]);
    expect(kv.top[0].andel).toBeCloseTo(2_000_000 / 4_250_000, 10);
    expect(kv.top_andel).toBeCloseTo(1, 10);
    expect(kundevaerdiTekst(kv)).toBe("De 4 største har betalt 100 % af alt siden marts 2025");
    expect(kundevaerdiFor(overblik(kontrakter))).toEqual({ top: [], top_andel: 0, betalt_i_alt_oere: 0, kunder: 0, siden: null });
  });
  it("forfaldentFor (Ø3b): rater på trækdatoen, dagen klippet; pauser i et langt kontraktår; rate 2 efter 6 måneder; fuld/e-conomic ved start", () => {
    const rate12 = k({ id: "r", company_id: "r", periode_start: "2026-03-18", periode_slut: "2027-03-18", pris_eks_moms_oere: 4_200_000 }); // Fjeldgaardshop
    expect(forfaldentFor(rate12, "2026-09-17")).toBe(6 * 350_000); // 18/3 … 18/8 — september trækkes først den 18.
    expect(forfaldentFor(rate12, "2026-09-18")).toBe(7 * 350_000);
    expect(forfaldentFor(rate12, "2026-03-17")).toBe(0);
    expect(forfaldentFor(rate12, "2028-01-01")).toBe(4_200_000); // aldrig mere end prisen
    const den31 = k({ id: "d", company_id: "d", periode_start: "2026-01-31", periode_slut: "2027-01-31" });
    expect(laegMaanederTilDag("2026-01-31", 1)).toBe("2026-02-28");
    expect(forfaldentFor(den31, "2026-02-28")).toBe(2 * 350_000);
    // Livja: 12 rater over 15 måneder — tre pauser er ikke gæld.
    const livja = k({ id: "l", company_id: "l", periode_start: "2025-09-16", periode_slut: "2026-12-16", pris_eks_moms_oere: 4_200_000 });
    expect(forfaldentFor(livja, "2026-09-17")).toBe(10 * 350_000); // 13 trækdatoer passeret − 3 pauser
    const maanedlig = k({ id: "m", company_id: "m", periode_start: "2026-08-01", periode_slut: "2026-09-01", pris_eks_moms_oere: 350_000, betalingsmodel: "maanedlig" });
    expect(forfaldentFor(maanedlig, "2026-08-01")).toBe(350_000);
    expect(forfaldentFor(maanedlig, "2026-07-31")).toBe(0);
    const rate2 = k({ id: "n", company_id: "n", periode_start: "2026-09-14", periode_slut: "2027-09-14", pris_eks_moms_oere: 4_000_000, betalingsmodel: "rate2" }); // Nordic By Hand
    expect(forfaldentFor(rate2, "2026-09-17")).toBe(2_000_000);
    expect(forfaldentFor(rate2, "2027-03-13")).toBe(2_000_000);
    expect(forfaldentFor(rate2, "2027-03-14")).toBe(4_000_000);
    const fuld = k({ id: "f", company_id: "f", periode_start: "2026-05-11", periode_slut: "2027-05-11", pris_eks_moms_oere: 5_000_000, betalingsmodel: "fuld" });
    expect(forfaldentFor(fuld, "2026-05-10")).toBe(0);
    expect(forfaldentFor(fuld, "2026-05-11")).toBe(5_000_000);
    expect(forfaldentFor(k({ id: "e", company_id: "e", betalingsmodel: "e-conomic", periode_start: "2026-06-19", periode_slut: "2027-06-19" }), "2026-09-17")).toBe(4_200_000);
    expect(forfaldentFor(k({ id: "g", company_id: "g", pris_eks_moms_oere: 0, betalingsmodel: "gratis" }), "2026-09-17")).toBe(0);
  });
  it("udestående (Ø3b): forfaldne betalinger der ikke er kommet — Fjeldgaardshop den 17. er timing (0), en manglende juni-rate er gæld; fejlede træk som før", () => {
    // Før: «kun negative forskelle» (betalt til dato − anerkendt til månedens udgang) — Alfa stod med −1.581-klassen den 17.
    const kontrakter = [
      k({ id: "a1", company_id: "a", periode_start: "2026-03-18", periode_slut: "2027-03-18", pris_eks_moms_oere: 4_200_000 }), // som Fjeldgaardshop
      k({ id: "b1", company_id: "b", periode_start: "2026-04-29", periode_slut: "2027-04-29", pris_eks_moms_oere: 5_250_000 }), // som YKRG
      k({ id: "c1", company_id: "c", periode_start: "2026-05-11", periode_slut: "2027-05-11", pris_eks_moms_oere: 5_000_000, betalingsmodel: "fuld" }),
    ];
    const betalinger = [
      ...[3, 4, 5, 6, 7, 8].map((m) => b({ id: `a${m}`, company_id: "a", betalt_at: `2026-0${m}-18T10:00:00+02:00`, beloeb_eks_moms_oere: 350_000 })),
      ...["2026-04-29", "2026-05-31", "2026-08-10", "2026-09-10"].map((d, i) => b({ id: `b${i}`, company_id: "b", betalt_at: `${d}T10:00:00+02:00`, beloeb_eks_moms_oere: 437_500 })),
      b({ id: "c0", company_id: "c", betalt_at: "2026-05-11T10:00:00+02:00", beloeb_eks_moms_oere: 5_000_000 }),
      b({ id: "af", company_id: "a", betalt_at: "", beloeb_eks_moms_oere: 350_000, status: "fejlet", faktura_nummer: "TBR-0009" }),
    ];
    const u = udestaaendeFor(overblik(kontrakter, betalinger), "2026-09-17");
    expect(u.raekker).toEqual([{ company_id: "b", navn: "Beta ApS", forfaldent_oere: 5 * 437_500, betalt_oere: 4 * 437_500, udestaaende_oere: 437_500 }]);
    expect(u.i_alt_oere).toBe(437_500);
    // Den 18. er Fjeldgaardshops septemberrate forfalden — og indtil den trækkes, står den.
    expect(udestaaendeFor(overblik(kontrakter, betalinger), "2026-09-18").raekker.map((r) => r.navn)).toEqual(["Beta ApS", "Alfa ApS"]); // største udestående først
    expect(u.fejlede).toEqual([{ company_id: "a", navn: "Alfa ApS", faktura_nummer: "TBR-0009", kilde: "stripe_abonnement", beloeb_eks_moms_oere: 350_000 }]);
    expect(u.fejlede_i_alt_oere).toBe(350_000);
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
    // Ø3b — kundeværdien af kopien 16/9 (aktive kunders betalinger): 28 kunder, 942.877 i alt, de 10 største 52,5 %.
    expect(dom.kundevaerdi.top).toHaveLength(10);
    expect(dom.kundevaerdi.kunder).toBe(28);
    expect(Math.round(dom.kundevaerdi.betalt_i_alt_oere / 100)).toBe(942_877);
    expect(dom.kundevaerdi.siden).toBe("2025-03"); // KJ AUTO 11/3-2025
    expect(dom.kundevaerdi.top.slice(0, 3).map((r) => [r.navn, r.betalt_oere, r.kontraktaar, r.status])).toEqual([
      ["Capture IT A/S", 6_200_000, 2, "aktiv"],
      ["BRILLEVÆRK", 6_000_000, 2, "aktiv"],
      ["Warburg VVS & Kloak Ekspres ApS", 5_500_000, 2, "aktiv"],
    ]);
    expect(pct(dom.kundevaerdi.top_andel)).toBe("52 %");
    expect(kundevaerdiTekst(dom.kundevaerdi)).toBe("De 10 største har betalt 52 % af alt siden marts 2025");
    // Ø3b — udestående pr. 17/9 (Jonas: «Det burde vi ikke have udover YKRG»): KUN YKRG, juni-raten 4.375 ekskl. moms.
    // Før: −9.200 med YKRG −4.667 · Homie −1.694 · Fjeldgaardshop −1.581 · KJ AUTO −508 · Two Socks −375 · WESDEX −339 · Livja −38.
    expect(dom.udestaaende.raekker.map((r) => [r.navn, r.udestaaende_oere])).toEqual([["YKRG APS", 437_500]]);
    expect(dom.udestaaende.raekker[0]).toMatchObject({ forfaldent_oere: 5 * 437_500, betalt_oere: 4 * 437_500 });
    expect(dom.udestaaende.i_alt_oere).toBe(437_500);
    expect(dom.noegletal.udestaaende_oere).toBe(437_500); // kortet siger det samme som sektionen
    for (const navn of ["Fjeldgaardshop.dk", "Homie Håndværkerservice ApS", "KJ AUTO OG MIKROMAKKER", "Two Socks ApS", "WESDEX ApS", "Livja", "Nordic By Hand ApS"]) {
      expect(dom.udestaaende.raekker.map((r) => r.navn)).not.toContain(navn);
    }
  });
});
