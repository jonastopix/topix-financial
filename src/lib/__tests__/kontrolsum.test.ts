import { describe, expect, it } from "vitest";
import {
  CANONICAL,
  DANSK,
  KONTROLSUM_KILDE,
  UDAEKKET_GRAENSE_KR,
  UDAEKKET_GRAENSE_PCT,
  kontrolsum,
  kontrolsumAf,
  udaekketErStort,
  udaekketKr,
  udaekketLinje,
  udaekketTekst,
} from "@/lib/omkostningsnoegler";
import { rimelighedstjek, rimelighedAdvarsler } from "@/lib/rimelighed";
import { kontrolsum as kontrolsumDeno } from "../../../supabase/functions/_shared/omkostningsnoegler.ts";
import { rimelighedstjek as rimelighedstjekDeno } from "../../../supabase/functions/_shared/rimelighed.ts";

/*
 * Kontrolsummen som ÉT tal pr. rapport (17/9-2026): udaekket = resultat − (omsætning + andre
 * driftsindtægter + finansielle indtægter − Σ|alle omkostningsgrupper|). Alle tal er SYNTETISKE
 * i de tre rapporters OPBYGNING (ingen kundedata):
 *   Floren Engros 2026-06 efter A2: alle grupper fanget → udækket 0.
 *   ANLA GLAS 2025-12 (e-conomic-XLSX-skabelonen på et Mamut-udtræk): ingen omkostningsgrupper
 *     fanget, kun afskrivninger, og «gross_profit» er Dækningsbidrag 2 (efter løn) → udækket −426.000
 *     (21 % af omsætningen: de grupper der ligger mellem DB2 og resultatet). Chattens skøn «≈ 2 mio.»
 *     var regnet fra omsætningen; kontrolsummen regner fra dækningsbidraget når vareforbruget ikke er
 *     målt (ellers ville vareforbrug og løn i DB2 tælle som «ikke fordelt»).
 *   Fjeldgaardshop 2025-10 efter C (saldobalance-XLSX): hver resultatkonto i en gruppe → 0.
 */

const finder = (a: ReturnType<typeof rimelighedstjek>, name: string) => a.find((x) => x.name === name)!;

/** Florens opbygning: omsætning 500.000, vareforbrug 300.000, løn 100.000, salg 1.000, autodrift 15.000,
    lokaler 20.000, admin 70.000, renteudgifter 5.000, renteindtægter 16.000 → resultat 5.000. */
const floren = { revenue: 500_000, cogs: 300_000, gross_profit: 200_000, payroll: 100_000, sales_costs: 1_000, vehicle_costs: 15_000, facility_costs: 20_000, admin_costs: 70_000, financial_costs: 5_000, financial_income: 16_000, ebit: -6_000, ebt: 5_000 };
/** ANLAs opbygning: omsætning 2.000.000, dækningsbidrag 2 (efter løn) 270.000, afskrivninger 60.000, ebt −216.000 — ingen grupper. */
const anla = { revenue: 2_000_000, gross_profit: 270_000, depreciation: 60_000, ebt: -216_000, net_result: -216_000 };
/** C's syntetiske saldobalance (omkostningsnoegler.test): alle konti i en gruppe, ebt 96.300. */
const fjeldgaard = { revenue: 198_500, gross_profit: 143_500, cogs: 55_000, payroll: 40_000, sales_costs: 8_000, facility_costs: 0, admin_costs: 10_200, other_costs: 3_600, other_operating_income: 15_500, depreciation: 0, financial_costs: 900, ebt: 96_300 };

describe("kontrolsum — grænserne sagt højt og de tre rapporter", () => {
  it("5 % af omsætningen eller 10.000 kr.; kilden hedder grupper_mod_resultat", () => {
    expect(UDAEKKET_GRAENSE_PCT).toBe(0.05);
    expect(UDAEKKET_GRAENSE_KR).toBe(10_000);
    expect(KONTROLSUM_KILDE).toBe("grupper_mod_resultat");
  });
  it("Floren efter A2: udækket 0 (alle grupper fanget, renteindtægter tæller med)", () => {
    const k = kontrolsum(floren, CANONICAL)!;
    expect(k).toEqual({ udaekket: 0, udaekket_pct_af_omsaetning: 0, kilde: "grupper_mod_resultat", regnet: 5_000, grupper_fundet: 7 });
    expect(udaekketErStort(k)).toBe(false);
    expect(udaekketLinje(k)).toBeNull();
  });
  it("Floren FØR A2 (admin, autodrift, salg og renter ikke fanget): udækket −75.000 — der mangler omkostninger", () => {
    const foer = { revenue: 500_000, cogs: 300_000, gross_profit: 200_000, payroll: 100_000, facility_costs: 20_000, ebt: 5_000 };
    const k = kontrolsum(foer, CANONICAL)!;
    // regnet: 500.000 − 300.000 − 100.000 − 20.000 = 80.000 → 5.000 − 80.000 = −75.000
    expect(k.udaekket).toBe(-75_000);
    expect(k.udaekket_pct_af_omsaetning).toBeCloseTo(-0.15, 6);
    expect(udaekketErStort(k)).toBe(true);
    expect(udaekketTekst(k)).toBe("75.000 kr. af resultatet er ikke fordelt på grupperne — der mangler omkostninger for 75.000 kr. Omkostningsbilledet er ufuldstændigt; resultatet er rigtigt.");
    expect(udaekketLinje(k)).toBe("75.000 kr. af resultatet er ikke fordelt på grupperne — omkostningsbilledet er ufuldstændigt.");
  });
  it("ANLA GLAS 2025-12: udækket −426.000 = 21 % af omsætningen (kun afskrivningerne er fanget; basis er dækningsbidraget, da vareforbruget ikke er målt)", () => {
    const k = kontrolsum(anla, CANONICAL)!;
    expect(k.udaekket).toBe(-216_000 - (270_000 - 60_000)); // −426.000
    expect(k.udaekket_pct_af_omsaetning).toBeCloseTo(-0.213, 3);
    expect(k.grupper_fundet).toBe(1);
    expect(udaekketErStort(k)).toBe(true);
    expect(udaekketKr(k)).toBe("426.000");
    // Regnet fra omsætningen (uden dækningsbidrag) ville tallet være −2.156.000 — chattens skøn:
    expect(kontrolsum({ ...anla, gross_profit: null }, CANONICAL)!.udaekket).toBe(-2_156_000);
  });
  it("Fjeldgaardshop efter C: 0 — samme tal som skabelonens pnl_coverage (alle konti i en gruppe)", () => {
    expect(kontrolsum(fjeldgaard, CANONICAL)!.udaekket).toBe(0);
  });
  it("manglende indtægter siges med ord; små tal under begge grænser er ikke store; null uden resultat eller omsætning", () => {
    const k = kontrolsum({ revenue: 100_000, payroll: 20_000, ebt: 95_000 }, CANONICAL)!; // regnet 80.000 → +15.000
    expect(k.udaekket).toBe(15_000);
    expect(udaekketTekst(k)).toMatch(/der mangler indtægter for 15\.000 kr\./);
    expect(udaekketErStort(kontrolsum({ revenue: 400_000, payroll: 20_000, ebt: 371_000 }, CANONICAL))).toBe(false); // 9.000 = 2,25 %
    expect(udaekketErStort(kontrolsum({ revenue: 100_000, payroll: 20_000, ebt: 74_000 }, CANONICAL))).toBe(true); // 6.000 = 6 %
    expect(udaekketErStort(kontrolsum({ revenue: 400_000, payroll: 20_000, ebt: 369_000 }, CANONICAL))).toBe(true); // 11.000 = 2,75 % men > 10.000
    expect(kontrolsum({ revenue: 100_000 }, CANONICAL)).toBeNull();
    expect(kontrolsum({ ebt: 5 }, CANONICAL)).toBeNull();
    expect(udaekketErStort(null)).toBe(false);
  });
  it("dansk nøglesæt: samme regnestykke på kf-nøgler (omsaetning/resultat_foer_skat)", () => {
    const kf = { omsaetning: 500_000, direkte_omkostninger: 300_000, loenninger: 100_000, salgsomkostninger: 1_000, lokaleomkostninger: 20_000, administrationsomkostninger: 85_000, afskrivninger: 0, finansielle_indtaegter: 16_000, resultat_foer_skat: 10_000 };
    expect(kontrolsum(kf, DANSK)!.udaekket).toBe(0);
  });
  it("kontrolsumAf læser quality_signals.udaekket; alt andet giver null", () => {
    expect(kontrolsumAf({ udaekket: { udaekket: -75_000, udaekket_pct_af_omsaetning: -0.15, kilde: "grupper_mod_resultat", regnet: 80_000, grupper_fundet: 3 } })).toEqual({ udaekket: -75_000, udaekket_pct_af_omsaetning: -0.15, kilde: "grupper_mod_resultat", regnet: 80_000, grupper_fundet: 3 });
    expect(kontrolsumAf({ udaekket: null })).toBeNull();
    expect(kontrolsumAf(null)).toBeNull();
    expect(kontrolsumAf({ canonical_checks: [] })).toBeNull();
  });
  it("paritet: Deno-kopien regner det samme", () => {
    for (const m of [floren, anla, fjeldgaard]) expect(kontrolsumDeno(m, CANONICAL)).toEqual(kontrolsum(m, CANONICAL));
  });
});

describe("kontrolsum — det fjerde rimelighedstjek (resultat_udaekket)", () => {
  it("Floren: PASS, ingen advarsler", () => {
    const a = rimelighedstjek(floren, "pnl");
    expect(finder(a, "resultat_udaekket").result).toBe("PASS");
    expect(rimelighedAdvarsler(floren, "pnl")).toEqual([]);
  });
  it("ANLA: ÉN advarsel til medlemmet — kontrolsummens tekst (ebt_reconciles har ingen driftsposter at regne på → SKIP)", () => {
    const a = rimelighedstjek(anla, "pnl");
    const u = finder(a, "resultat_udaekket");
    expect(u.result).toBe("WARN");
    expect(u.tekst).toBe("426.000 kr. af resultatet er ikke fordelt på grupperne — der mangler omkostninger for 426.000 kr. Omkostningsbilledet er ufuldstændigt; resultatet er rigtigt.");
    expect(u.felter).toEqual(["ebt"]);
    expect(finder(a, "ebt_reconciles").result).toBe("SKIP");
    expect(rimelighedAdvarsler(anla, "pnl").map((x) => x.name)).toEqual(["resultat_udaekket"]);
  });
  it("Floren FØR A2 (løn og lokaler fanget, resten ikke): ebt_reconciles WARN beholder loggen men ikke teksten — kontrolsummen bærer den ene tekst", () => {
    const foer = { revenue: 500_000, cogs: 300_000, gross_profit: 200_000, payroll: 100_000, facility_costs: 20_000, ebt: 5_000 };
    const a = rimelighedstjek(foer, "pnl");
    const e = finder(a, "ebt_reconciles");
    expect(e.result).toBe("WARN");
    expect(e.details).toMatch(/see resultat_udaekket/);
    expect(e.details).not.toMatch(/opposite sign/);
    expect(e.tekst).toBe(""); // før: «Resultatet før skat står som 5.000 kr., men dækningsbidraget minus omkostningerne giver 80.000 kr. Er resultatet læst fra en anden kolonne (fx år til dato) end omkostningerne?»
    expect(rimelighedAdvarsler(foer, "pnl").map((x) => [x.name, x.tekst])).toEqual([["resultat_udaekket", "75.000 kr. af resultatet er ikke fordelt på grupperne — der mangler omkostninger for 75.000 kr. Omkostningsbilledet er ufuldstændigt; resultatet er rigtigt."]]);
  });
  it("årsrapport uden vareforbrug (Booking Innovation-klassen): regnes fra dækningsbidraget — vareforbruget tæller ikke som «ikke fordelt»", () => {
    const k = kontrolsum({ revenue: 83_665, gross_profit: 17_047, payroll: 46, ebt: 16_978 }, CANONICAL)!;
    expect(k.udaekket).toBe(-23);
    expect(udaekketErStort(k)).toBe(false);
  });
  it("vendt fortegn (Fjeldgaardshop 2025-10-mønstret, to driftsgrupper): ebt_reconciles bærer teksten, kontrolsummen SKIP", () => {
    const vendt = { revenue: 241_596, gross_profit: 198_587, cogs: 43_009, payroll: 6_328, admin_costs: 434_072, ebt: 241_813 };
    const a = rimelighedstjek(vendt, "trial_balance");
    expect(finder(a, "ebt_reconciles").tekst).toMatch(/samme tal med modsat fortegn/);
    const u = finder(a, "resultat_udaekket");
    expect(u.result).toBe("SKIP");
    expect(u.details).toMatch(/sign inverted/);
  });
  it("et lille hul under grænsen: ebt_reconciles PASS (5 %/500) og kontrolsummen PASS", () => {
    const a = rimelighedstjek({ ...floren, ebt: 5_400 }, "pnl"); // 400 kr.
    expect(finder(a, "ebt_reconciles").result).toBe("PASS");
    expect(finder(a, "resultat_udaekket").result).toBe("PASS");
  });
  it("balance: SKIP; paritet mellem spejlene", () => {
    expect(finder(rimelighedstjek({ revenue: 100, ebt: 10 }, "balance"), "resultat_udaekket").result).toBe("SKIP");
    for (const m of [floren, anla, fjeldgaard]) expect(rimelighedstjekDeno(m, "pnl")).toEqual(rimelighedstjek(m, "pnl"));
  });
});
