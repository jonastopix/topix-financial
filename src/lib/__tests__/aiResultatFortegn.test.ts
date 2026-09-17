import { describe, expect, it } from "vitest";
import {
  AI_RESULTAT_TOLERANCE_MIN_KR,
  AI_RESULTAT_TOLERANCE_PCT,
  aiResultatFortegnsdom,
  normalizeToCanonical,
} from "../../../supabase/functions/_shared/canonicalEngine.ts";

/*
 * C (18/9-2026) — resultatets fortegn på AI-vejen krydstjekkes ALTID.
 *
 * Prod 17/9 18:14 (Rezycl 2026-02, ai_extraction): egen linje «RESULTAT FØR
 * SKAT = 45.635,14», ebt gemt 45.635,14, regnet −45.635,14 — e-conomics
 * kreditformat, hvor et underskud står positivt, og prompten sagde «aflæs
 * direkte». Motoren vendte kun fortegn for saldobalancer. Tallene her er
 * SYNTETISKE i Rezycl-mønstret: |dækningsbidrag| − omkostninger = −45.635,
 * AI'en afleverer +45.635.
 */

const rezyclMoenster = (resultat: number, ekstra: Record<string, number> = {}, report_type = "resultatopgørelse", line_items: unknown[] = []) => ({
  report_type,
  key_figures: { omsaetning: 120_000, direkte_omkostninger: 40_000, daekningsbidrag: 80_000, loenninger: 90_000, lokaler: 10_000, admin: 25_635, resultat_foer_skat: resultat, ...ekstra },
  line_items,
});

const koer = (data: ReturnType<typeof rezyclMoenster>, metode = "ai_extraction") => {
  const { metrics, correction_log } = normalizeToCanonical(data, metode);
  return { ebt: metrics.ebt, log: correction_log.find((c) => c.field === "resultat_foer_skat") };
};

describe("C: ai_result_sign_inverted", () => {
  it("grænserne sagt højt: 5 % af det største tal, mindst 500 kr.", () => {
    expect(AI_RESULTAT_TOLERANCE_PCT).toBe(0.05);
    expect(AI_RESULTAT_TOLERANCE_MIN_KR).toBe(500);
  });
  it("Rezycl-mønstret: +45.635 mod regnet −45.635 → vendt til −45.635 med correction-log-post", () => {
    const { ebt, log } = koer(rezyclMoenster(45_635));
    expect(ebt).toBe(-45_635);
    expect(log?.rule).toBe("ai_result_sign_inverted");
    expect(log?.raw_value).toBe(45_635);
    expect(log?.normalized_value).toBe(-45_635);
    expect(log?.reason).toBe("AI result sign inverted (cross-validated, uden tech, uden finans): 45635 → -45635; |gross_profit| − costs = -45635.00 (diff 0.00)");
  });
  it("et rigtigt underskud (−45.635) røres ikke; et rigtigt overskud med samme fortegn som regnestykket røres ikke", () => {
    expect(koer(rezyclMoenster(-45_635))).toEqual({ ebt: -45_635, log: undefined });
    // 80.000 − (50.000 + 5.000 + 5.000) = +20.000 — samme fortegn som AI'ens +20.000 → intet
    expect(koer(rezyclMoenster(20_000, { loenninger: 50_000, lokaler: 5_000, admin: 5_000 }))).toEqual({ ebt: 20_000, log: undefined });
  });
  it("modsat fortegn men ANDEN størrelse: rør ikke (D's ebt_reconciles viser advarslen)", () => {
    // regnet −45.635, AI +20.000 → 25.635 fra hinanden → ingen dom
    expect(koer(rezyclMoenster(20_000))).toEqual({ ebt: 20_000, log: undefined });
  });
  it("tolerancen: 4 % fra → vendt; 5,2 % fra (Rezycl 2026-05: +70.522 mod −66.834) → IKKE vendt, står som advarsel", () => {
    expect(koer(rezyclMoenster(47_400)).ebt).toBe(-47_400); // 3,7 % af 47.400
    const r = koer(rezyclMoenster(70_522, { admin: 46_834 })); // regnet 80.000 − 146.834 = −66.834
    expect(r.ebt).toBe(70_522);
    expect(r.log).toBeUndefined();
  });
  it("tech_software der sidder inde i admin: varianten «uden tech» rammer", () => {
    const { ebt, log } = koer(rezyclMoenster(45_635, { tech_software: 5_000 }));
    expect(ebt).toBe(-45_635);
    expect(log?.reason).toContain("uden tech, uden finans");
  });
  it("finansielle poster fra key_figures (nye felter) og fra line_items (class FIN_EXPENSE) tæller med", () => {
    const kf = koer(rezyclMoenster(48_635, { finansielle_omkostninger: 3_000 }));
    expect(kf.ebt).toBe(-48_635);
    expect(kf.log?.reason).toContain("finans fra key_figures");
    const li = koer(rezyclMoenster(48_635, {}, "resultatopgørelse", [{ name: "Renteudgifter", period_amount: -3_000, class: "FIN_EXPENSE" }]));
    expect(li.ebt).toBe(-48_635);
    expect(li.log?.reason).toContain("finans fra line_items");
  });
  it("resultat_efter_skat dømmes på samme måde", () => {
    const d = rezyclMoenster(45_635);
    (d.key_figures as Record<string, number>).resultat_efter_skat = 45_635;
    const { metrics, correction_log } = normalizeToCanonical(d, "ai_extraction");
    expect(metrics.net_result).toBe(-45_635);
    expect(correction_log.filter((c) => c.rule === "ai_result_sign_inverted").map((c) => c.field)).toEqual(["resultat_foer_skat", "resultat_efter_skat"]);
  });
  it("deterministiske skabeloner røres ikke; saldobalancer beholder deres egen regel (saldobalance_result_sign_inverted)", () => {
    expect(koer(rezyclMoenster(45_635), "deterministic_template")).toEqual({ ebt: 45_635, log: undefined });
    const s = koer(rezyclMoenster(45_635, {}, "saldobalance"));
    expect(s.ebt).toBe(-45_635);
    expect(s.log?.rule).toBe("saldobalance_result_sign_inverted");
  });
  it("uden dækningsbidrag og uden omsætning/direkte: ingen dom", () => {
    expect(aiResultatFortegnsdom({ loenninger: 90_000, resultat_foer_skat: 45_635 }, [], 45_635)).toMatchObject({ vend: false, forventet: null });
    // omsætning − direkte omkostninger som erstatning for dækningsbidrag
    expect(aiResultatFortegnsdom({ omsaetning: 120_000, direkte_omkostninger: 40_000, loenninger: 90_000, lokaler: 10_000, admin: 25_635 }, [], 45_635)).toMatchObject({ vend: true, forventet: -45_635 });
  });
});
