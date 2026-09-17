import { describe, expect, it } from "vitest";
import { betalingerTilMotor, laesOverblik, regnOverblik } from "@/lib/oekonomi/overblik";

/* Læsningen af hent_oekonomi_overblik()'s svar (Ø2, 18/9): formen holdes,
   ellers kastes HentningsFejl (aldrig «0 kr.» af en fejl); fejlede træk
   når ikke motoren; periodiseringen er motorens. */

const svar = {
  kontrakter: [
    { id: "k1", company_id: "c1", periode_start: "2026-01-01", periode_slut: "2027-01-01", grundpris_oere: 5_000_000, pris_eks_moms_oere: 5_000_000, betalingsmodel: "fuld", kilde: "backfill", periode_id: null, note: null, created_at: "2026-09-18T10:00:00+00:00" },
  ],
  betalinger: [
    { id: "t1", company_id: "c1", betalt_at: "2026-01-05T10:00:00+00:00", status: "betalt", kilde: "stripe_engang", art: "indgang", faktura_nummer: "X-1", beloeb_oere: 6_250_000, moms_oere: 1_250_000, beloeb_eks_moms_oere: 5_000_000, periode_start: null, periode_slut: null },
    { id: "t2", company_id: "c1", betalt_at: null, status: "fejlet", kilde: "stripe_abonnement", art: null, faktura_nummer: null, beloeb_oere: 437_500, moms_oere: null, beloeb_eks_moms_oere: 437_500, periode_start: null, periode_slut: null },
  ],
  virksomheder: [{ id: "c1", name: "Test ApS", status: "active", contract_start_date: "2026-01-01", contract_end_date: "2027-01-01", er_kunde: true, is_legat: false }],
  hentet_at: "2026-09-18T10:00:01+00:00",
};

describe("laesOverblik", () => {
  it("læser kontrakter, betalinger og virksomheder til motorens typer", () => {
    const o = laesOverblik(svar);
    expect(o.kontrakter).toEqual([{ id: "k1", company_id: "c1", periode_start: "2026-01-01", periode_slut: "2027-01-01", pris_eks_moms_oere: 5_000_000, betalingsmodel: "fuld", kilde: "backfill" }]);
    expect(o.betalinger).toHaveLength(2);
    expect(o.betalinger[0]).toMatchObject({ id: "t1", beloeb_eks_moms_oere: 5_000_000, moms_oere: 1_250_000, status: "betalt" });
    expect(o.betalinger[1]).toMatchObject({ id: "t2", betalt_at: "", moms_oere: null, status: "fejlet" });
    expect(o.virksomheder[0]).toMatchObject({ name: "Test ApS", er_kunde: true, is_legat: false });
    expect(o.hentet_at).toBe("2026-09-18T10:00:01+00:00");
  });
  it("kaster HentningsFejl med kildens navn når formen ikke holder — aldrig et tomt overblik", () => {
    expect(() => laesOverblik(null)).toThrow(/hent_oekonomi_overblik/);
    expect(() => laesOverblik({ kontrakter: "nej", betalinger: [], virksomheder: [] })).toThrow(/kontrakter er ikke en liste/);
    expect(() => laesOverblik({ ...svar, kontrakter: [{ ...svar.kontrakter[0], pris_eks_moms_oere: "50000" }] })).toThrow(/pris_eks_moms_oere er ikke et tal/);
    expect(() => laesOverblik({ ...svar, betalinger: [{ ...svar.betalinger[0], company_id: "" }] })).toThrow(/betalinger.company_id mangler/);
  });
  it("tomme lister er et gyldigt (tomt) overblik", () => {
    const o = laesOverblik({ kontrakter: [], betalinger: [], virksomheder: [], hentet_at: "x" });
    expect(o.kontrakter).toEqual([]);
    expect(regnOverblik(o, "2026-09", "2026-09")[0].anerkendt_oere).toBe(0);
  });
});

describe("betalingerTilMotor og regnOverblik", () => {
  it("kun betalte rækker med tidspunkt når motoren; periodiseringen er motorens", () => {
    const o = laesOverblik(svar);
    expect(betalingerTilMotor(o.betalinger)).toEqual([{ company_id: "c1", betalt_at: "2026-01-05T10:00:00+00:00", beloeb_eks_moms_oere: 5_000_000 }]);
    const t = regnOverblik(o, "2026-01", "2026-02");
    expect(t.map((m) => m.key)).toEqual(["2026-01", "2026-02"]);
    expect(t[0]).toMatchObject({ anerkendt_oere: 416_667, kontant_oere: 5_000_000, mrr_oere: 416_667 });
    expect(t[1]).toMatchObject({ anerkendt_oere: 416_667, kontant_oere: 0 });
  });
});
