/**
 * Pakke B skive 1 «Tallene rigtige» (3/10-2026, m17-ai-skema-grupper): en AI-udtrækning med de fem nye
 * key_figures-felter giver de rigtige metrics, og omkostningsnoegler.ts' regnestykker tæller de fire
 * driftsgrupper med. Ekstraordinære poster lander i extraordinary_items, som regnestykkerne IKKE tæller
 * (regnestykket i _shared/aiSkema.ts) — testen låser det, så en ændring er et bevidst valg.
 */
import { describe, expect, it } from "vitest";
import {
  DOBBELT_MIN_BELOEB,
  aiDriftsSignaler,
  buildCanonicalOutput,
} from "../../../supabase/functions/_shared/canonicalEngine.ts";
import {
  CANONICAL,
  ebitdaRegnet,
  ebtRegnet,
  kontrolsum,
  omkostningerIAlt,
} from "../../../supabase/functions/_shared/omkostningsnoegler.ts";

/** En resultatopgørelse som AI'en returnerer den med det nye skema (omkostninger POSITIVE). */
const kfMedNyeFelter = {
  omsaetning: 500_000,
  direkte_omkostninger: 200_000,
  daekningsbidrag: 300_000,
  loenninger: 100_000,
  pensioner_sociale: 12_000,
  oevrige_personale: 5_000,
  marketing: 20_000,
  lokaler: 25_000,
  admin: 15_000,
  autodrift: 8_000,
  oevrige_omkostninger: 30_000,
  afskrivninger: 10_000,
  finansielle_omkostninger: 2_000,
  ekstraordinaere_poster: 4_000,
  // Dokumentets egen linje, aflæst EFTER de ekstraordinære poster (regnestykket nedenfor).
  resultat_foer_skat: 69_000,
};

function udtraek(kf: Record<string, number>, reportType = "resultatopgørelse") {
  return buildCanonicalOutput(
    { report_type: reportType, report_period: "September 2026", key_figures: kf, line_items: [], validation: { status: "PASS", checks: [] } },
    null,
    "ai_extraction",
  );
}

describe("AI-skemaets fem grupper → metrics → omkostningsnoegler", () => {
  it("de fem felter lander på de kanoniske nøgler", () => {
    const { metrics } = udtraek(kfMedNyeFelter);
    expect(metrics.payroll).toBe(100_000);
    expect(metrics.payroll_related).toBe(12_000);
    expect(metrics.other_staff_costs).toBe(5_000);
    expect(metrics.vehicle_costs).toBe(8_000);
    expect(metrics.other_costs).toBe(30_000);
    expect(metrics.extraordinary_items).toBe(4_000);
  });

  it("omkostningerIAlt og ebitdaRegnet tæller de fire driftsgrupper med", () => {
    const { metrics } = udtraek(kfMedNyeFelter);
    // Σ drift = løn 100.000 + pension 12.000 + personale 5.000 + salg 20.000 + lokaler 25.000 + admin 15.000
    //         + auto 8.000 + andre eksterne 30.000 = 215.000
    // omkostningerIAlt = vareforbrug 200.000 + Σ drift 215.000 + afskrivninger 10.000 + finans 2.000 = 427.000
    expect(omkostningerIAlt(metrics, CANONICAL)).toBe(427_000);
    // ebitda = dækningsbidrag 300.000 − Σ drift 215.000 + andre driftsindtægter 0 = 85.000
    expect(ebitdaRegnet(metrics.gross_profit, metrics, CANONICAL)).toBe(85_000);
    expect(metrics.ebitda).toBe(85_000);
    // ebtRegnet = 85.000 − afskrivninger 10.000 − finans 2.000 + finansielle indtægter 0 = 73.000 (UDEN ekstraordinære)
    expect(ebtRegnet(metrics.gross_profit, metrics, CANONICAL)).toBe(73_000);
  });

  it("kontrolsummen: udækket falder fra −59.000 til −4.000 = de ekstraordinære poster", () => {
    const med = udtraek(kfMedNyeFelter).metrics;
    // regnet = (omsætning 500.000 − vareforbrug 200.000) − Σ drift og afskrivninger 225.000 − finans 2.000 = 73.000
    // udaekket = resultat 69.000 − 73.000 = −4.000 → præcis −ekstraordinære poster, som ingen regnestykker tæller
    expect(kontrolsum(med, CANONICAL)?.udaekket).toBe(-4_000);

    // FØR skive 1 kunne skemaet ikke bære de fem felter:
    const { pensioner_sociale, oevrige_personale, autodrift, oevrige_omkostninger, ekstraordinaere_poster, ...gammelt } = kfMedNyeFelter;
    void pensioner_sociale; void oevrige_personale; void autodrift; void oevrige_omkostninger; void ekstraordinaere_poster;
    const foer = udtraek(gammelt).metrics;
    // regnet = 300.000 − (løn 100.000 + salg 20.000 + lokaler 25.000 + admin 15.000 + afskr. 10.000 = 170.000) − 2.000 = 128.000
    // udaekket = 69.000 − 128.000 = −59.000 (= 12.000 + 5.000 + 8.000 + 30.000 + 4.000)
    expect(kontrolsum(foer, CANONICAL)?.udaekket).toBe(-59_000);
  });

  it("en negativ driftsgruppe vendes positiv (omkostninger er POSITIVE, 7/9); ekstraordinære bærer fortegn", () => {
    const { metrics, correction_log } = udtraek({ ...kfMedNyeFelter, pensioner_sociale: -12_000, autodrift: -8_000, ekstraordinaere_poster: -3_000 });
    expect(metrics.payroll_related).toBe(12_000);
    expect(metrics.vehicle_costs).toBe(8_000);
    expect(correction_log.some((c) => c.field === "pensioner_sociale" && c.rule === "expense_must_be_positive")).toBe(true);
    // −3.000 = en nettoindtægt; den står som aflæst.
    expect(metrics.extraordinary_items).toBe(-3_000);
  });

  it("resultatets fortegnsdom regner de nye grupper med", () => {
    // Et rigtigt overskud vendes ikke: gp 300.000 − (løn, salg, lokaler, admin, afskr. 170.000 + de fire 55.000) = 75.000,
    // samme fortegn som 69.000.
    const rigtig = udtraek(kfMedNyeFelter);
    expect(rigtig.metrics.ebt).toBe(69_000);
    expect(rigtig.correction_log.some((c) => c.rule === "ai_result_sign_inverted")).toBe(false);

    // Kreditformatet glemt (resultatet −73.000, ingen ekstraordinære): varianten «finans fra key_figures» giver
    // 300.000 − 225.000 − 2.000 = 73.000 — samme tal, modsat fortegn → vendes. Uden de fire grupper i dommen ville
    // forventet være 300.000 − 170.000 − 2.000 = 128.000, afvigelse 55.000 > 5 % — og underskuddet stod som gemt.
    const { ekstraordinaere_poster, ...udenEkstra } = kfMedNyeFelter;
    void ekstraordinaere_poster;
    const vendt = udtraek({ ...udenEkstra, resultat_foer_skat: -73_000 });
    expect(vendt.metrics.ebt).toBe(73_000);
    expect(vendt.correction_log.some((c) => c.rule === "ai_result_sign_inverted")).toBe(true);
  });

  // ── CTO-fund 5 (3/10): de to udvidede krydstjek må ikke falde tilbage til de gamle fem poster ──
  it("fund 5a: saldobalancens resultatvending regner de fire nye grupper med", () => {
    // Saldobalance, AI-vejen, resultatet allerede i normal konvention (et TAB):
    //   ny dom:   |gp| 300.000 − (løn 100.000 + salg 20.000 + lokaler 25.000 + admin 15.000 + afskr. 10.000
    //             + pension 40.000 + personale 15.000 + auto 30.000 + andre eksterne 70.000 = 325.000) = −25.000
    //             → samme fortegn som −25.000 → BEHOLD
    //   gammel:   300.000 − 170.000 = +130.000 → modsat fortegn → vend til +25.000 (et tab gemt som overskud)
    const kf = {
      omsaetning: 500_000, direkte_omkostninger: 200_000, daekningsbidrag: 300_000,
      loenninger: 100_000, marketing: 20_000, lokaler: 25_000, admin: 15_000, afskrivninger: 10_000,
      pensioner_sociale: 40_000, oevrige_personale: 15_000, autodrift: 30_000, oevrige_omkostninger: 70_000,
      resultat_foer_skat: -25_000,
    };
    const { metrics, correction_log } = udtraek(kf, "saldobalance");
    expect(metrics.ebt).toBe(-25_000);
    expect(correction_log.some((c) => c.rule === "saldobalance_result_sign_inverted")).toBe(false);
  });

  it("fund 5b: tech_software-folden afstemmer mod ALLE driftsposter (OMK.drift)", () => {
    // gp 300.000; løn 100.000 + pension 50.000 + admin 20.000 (tech 10.000 ligger ALLEREDE i admin); resultat 130.000.
    //   ny:     uden tech = 300.000 − 170.000 = 130.000 (Δ 0); med tech = 120.000 (Δ 10.000) → SPRING folden over
    //   gammel: uden tech = 300.000 − 120.000 = 180.000 (Δ 50.000); med = 170.000 (Δ 40.000) → fold (dobbelttælling)
    const kf = {
      omsaetning: 500_000, direkte_omkostninger: 200_000, daekningsbidrag: 300_000,
      loenninger: 100_000, pensioner_sociale: 50_000, admin: 20_000, tech_software: 10_000,
      resultat_foer_skat: 130_000,
    };
    const { metrics, correction_log } = udtraek(kf);
    expect(metrics.admin_costs).toBe(20_000);
    expect(correction_log.some((c) => c.rule === "tech_software_merge_skipped_double_count")).toBe(true);
  });

  // ── CTO-fund 2 (3/10): en negativ driftsgruppe vendes, men sporet bliver ──
  it("fund 2: negativ_driftsgruppe bærer feltet og det oprindelige beløb", () => {
    const out = udtraek({ ...kfMedNyeFelter, autodrift: -8_000 });
    const s = aiDriftsSignaler(out.metrics, out.correction_log, out.kontrolsum?.udaekket);
    expect(s.negativ_driftsgruppe).toEqual([{ felt: "autodrift", noegle: "vehicle_costs", oprindeligt: -8_000, gemt: 8_000 }]);
    // Uden negative grupper: intet felt.
    const ren = udtraek(kfMedNyeFelter);
    expect(aiDriftsSignaler(ren.metrics, ren.correction_log, ren.kontrolsum?.udaekket).negativ_driftsgruppe).toBeUndefined();
  });

  // ── CTO-fund 3 (3/10): mulig dobbelttælling ──
  it("fund 3: pension talt både i lønnen og i sit eget felt giver mulig_dobbelttaelling", () => {
    // Dokumentet: løn 100.000 HERAF pension 12.000; AI'en lægger 112.000 i loenninger OG 12.000 i pensioner_sociale.
    // Ingen ekstraordinære; resultatet 73.000 er rigtigt (= 300.000 − 225.000 − 2.000, se testen ovenfor).
    // regnet = 300.000 − (227.000 drift + 10.000 afskr.) − 2.000 = 61.000 → udaekket = 73.000 − 61.000 = +12.000 = X
    // tolerance = max(1 % × 12.000, 50) = 120 → |12.000 − 12.000| = 0 ≤ 120 → signal
    const { ekstraordinaere_poster, ...udenEkstra } = kfMedNyeFelter;
    void ekstraordinaere_poster;
    const out = udtraek({ ...udenEkstra, loenninger: 112_000, resultat_foer_skat: 73_000 });
    expect(out.kontrolsum?.udaekket).toBe(12_000);
    expect(aiDriftsSignaler(out.metrics, out.correction_log, out.kontrolsum?.udaekket).mulig_dobbelttaelling).toEqual([
      { noegle: "payroll_related", beloeb: 12_000, udaekket: 12_000, tolerance: 120 },
    ]);
  });

  it("fund 3: grænserne — fortegn, tolerance og gulv", () => {
    const m = udtraek(kfMedNyeFelter).metrics; // payroll_related 12.000, other_staff_costs 5.000, vehicle 8.000, other 30.000
    const sig = (u: number) => aiDriftsSignaler(m, [], u).mulig_dobbelttaelling?.map((d) => d.noegle) ?? [];
    expect(sig(12_120)).toEqual(["payroll_related"]); // præcis på tolerancen (120)
    expect(sig(12_121)).toEqual([]); // lige over
    expect(sig(-12_000)).toEqual([]); // manglende omkostninger er IKKE en dobbelttælling
    expect(sig(5_000)).toEqual(["other_staff_costs"]); // tolerance max(50, 50) = 50
    // CTO runde 2 fund 2: overgruppen «Personaleomkostninger i alt» i loenninger OG begge underposter i egne felter
    // → udækket = 12.000 + 5.000 = 17.000; ingen enkelt nøgle rammer, summen gør (tolerance max(170, 50) = 170).
    expect(sig(17_000)).toEqual(["payroll_related+other_staff_costs"]);
    expect(sig(17_171)).toEqual([]); // lige over summens tolerance
    const lille = { ...m, payroll_related: DOBBELT_MIN_BELOEB - 1 };
    expect(aiDriftsSignaler(lille, [], DOBBELT_MIN_BELOEB - 1).mulig_dobbelttaelling).toBeUndefined(); // under gulvet
  });
});

// CTO runde 2 fund 1 (3/10): feltbeskrivelsen skal være BETINGET som prompten — «Fremmed arbejde» under
// dækningsbidraget følger dokumentets gruppe; ellers bliver ebitdaRegnet X for høj, uden at kontrolsummen ser det.
import { readFileSync as laesFil } from "node:fs";
describe("oevrige_omkostninger-beskrivelsen er betinget", () => {
  it("nævner fremmed arbejde kun med betingelsen om dækningsbidraget", () => {
    const kilde = laesFil("supabase/functions/_shared/aiSkema.ts", "utf8");
    expect(kilde).not.toMatch(/Underleverandører» hører IKKE her/);
    expect(kilde).toMatch(/hører i direkte_omkostninger, når de står over dækningsbidraget/);
  });
});
