/** Motor-tests for opgoerPeriode — faste data. Definitionerne genbruger
    VALUE_EXTRACTORS (kpiDefs), så måned og periode beviseligt deler formel. */
import { describe, expect, it } from "vitest";
import { opgoerPeriode, type PeriodeDefinition } from "@/lib/periodeOpgoerelse";
import { VALUE_EXTRACTORS } from "@/lib/kpiDefs";
import type { CompanyFact } from "@/hooks/useCompanyFacts";
import type { DataBasis } from "@/lib/dataGrundlag";

/** Fact-builder: metrics i canonical engelske nøgler (som i databasen) —
    motoren konverterer selv via factsToDanishMetrics. */
const fact = (
  periodKey: string,
  basis: DataBasis,
  metrics: Record<string, number>,
): CompanyFact => ({
  id: `f-${periodKey}`,
  period_key: periodKey,
  period_label: periodKey,
  source_report_id: "r1",
  source_type: basis === "estimated" ? "annual_report" : "canonical_v2",
  data_basis: basis,
  metrics,
  committed_at: "2026-08-27T00:00:00Z",
});

const DEFS: PeriodeDefinition[] = [
  { key: "omsaetning", art: "flow", udtraek: VALUE_EXTRACTORS.omsaetning },
  { key: "resultat", art: "flow", udtraek: VALUE_EXTRACTORS.resultat },
  { key: "db_margin", art: "forhold", udtraek: VALUE_EXTRACTORS.db_margin },
  { key: "bank", art: "beholdning", udtraek: (kf) => kf.bank_balance ?? null },
];

/** Årsrapport-månedsrække som extract-annual-report skriver den:
    flows = Math.round(årstal/12), balance rå. */
const AARSTAL_2025 = 575_997; // deler ikke med 12 — afrundingstesten er ægte
const MDR_REV_2025 = Math.round(AARSTAL_2025 / 12); // 48.000

const estimatMaaned = (periodKey: string): CompanyFact =>
  fact(periodKey, "estimated", {
    revenue: MDR_REV_2025,
    gross_profit: Math.round(MDR_REV_2025 / 2),
    ebt: 4_000,
    cash: 42_000,
  });

const heleEstimatAar2025 = Array.from({ length: 12 }, (_, i) =>
  estimatMaaned(`2025-${String(i + 1).padStart(2, "0")}`),
);

describe("opgoerPeriode", () => {
  it("tom periode: nul-grundlag, ingen totaler, basis null", () => {
    const r = opgoerPeriode([], DEFS);
    expect(r.grundlag).toEqual({ maalte: 0, estimerede: 0, samlet: 0 });
    expect(r.heleEstimatAar).toBe(false);
    for (const key of Object.keys(r.vaerdier)) {
      expect(r.vaerdier[key].total).toBeNull();
      expect(r.vaerdier[key].basis).toBeNull();
      expect(r.vaerdier[key].daekning).toBe(0);
    }
  });

  it("nøgle uden dækning: total null, daekning 0, basis null — andre nøgler upåvirket", () => {
    const facts = [fact("2026-01", "measured", { revenue: 100 })]; // ingen cash
    const r = opgoerPeriode(facts, DEFS);
    expect(r.vaerdier.bank).toMatchObject({ total: null, basis: null, daekning: 0 });
    expect(r.vaerdier.omsaetning).toMatchObject({ total: 100, basis: "measured", daekning: 1 });
  });

  it("forhold hvor Σomsætning er 0: total null (formlen kan ikke dømme)", () => {
    const facts = [
      fact("2026-01", "measured", { revenue: 100, gross_profit: 50 }),
      fact("2026-02", "measured", { revenue: -100, gross_profit: 50 }),
    ];
    const r = opgoerPeriode(facts, DEFS);
    expect(r.vaerdier.db_margin.total).toBeNull();
    expect(r.vaerdier.db_margin.daekning).toBe(2); // månederne kunne hver især
  });

  it("kun målt: sum, basis measured, estimatAndel 0", () => {
    const facts = [
      fact("2026-01", "measured", { revenue: 100_000 }),
      fact("2026-02", "measured", { revenue: 200_000 }),
      fact("2026-03", "measured", { revenue: 300_000 }),
    ];
    const r = opgoerPeriode(facts, DEFS);
    expect(r.vaerdier.omsaetning).toMatchObject({
      total: 600_000,
      basis: "measured",
      estimatAndel: 0,
      daekning: 3,
    });
    expect(r.heleEstimatAar).toBe(false);
  });

  it("kun estimeret som HELT kalenderår: heleEstimatAar sand, estimatAndel = total", () => {
    const r = opgoerPeriode(heleEstimatAar2025, DEFS);
    expect(r.heleEstimatAar).toBe(true);
    expect(r.grundlag).toEqual({ maalte: 0, estimerede: 12, samlet: 12 });
    expect(r.vaerdier.omsaetning.basis).toBe("estimated");
    expect(r.vaerdier.omsaetning.estimatAndel).toBe(r.vaerdier.omsaetning.total);
  });

  it("summen over tolv estimatmåneder rammer årstallet på nær afrunding — hele begrundelsen for undtagelsen", () => {
    const r = opgoerPeriode(heleEstimatAar2025, DEFS);
    const total = r.vaerdier.omsaetning.total!;
    // 12 × round(årstal/12): afvigelsen er højst 6 kr — den enkelte måned
    // er fiktion, men summen over det hele år er årsrapportens tal.
    expect(Math.abs(total - AARSTAL_2025)).toBeLessThanOrEqual(6);
    expect(total).not.toBe(AARSTAL_2025); // afrundingen ER der (575.997 → 576.000)
  });

  it("kun estimeret som DELÅR: heleEstimatAar falsk — jævnhedsantagelse, ikke årstal", () => {
    const halvtAar = heleEstimatAar2025.slice(6); // jul–dec 2025
    const r = opgoerPeriode(halvtAar, DEFS);
    expect(r.heleEstimatAar).toBe(false);
    expect(r.vaerdier.omsaetning.total).toBe(6 * MDR_REV_2025); // præcis halvt årstal — antagelsen
  });

  it("blandet 6+6 som Topix: total, estimatAndel og forhold af summerne", () => {
    const maalte = Array.from({ length: 6 }, (_, i) =>
      fact(`2026-${String(i + 1).padStart(2, "0")}`, "measured", {
        revenue: 100_000 + i * 10_000, // 100k…150k → 750.000
        gross_profit: (100_000 + i * 10_000) / 2,
      }),
    );
    const facts = [...heleEstimatAar2025.slice(6), ...maalte]; // jul25–jun26
    const r = opgoerPeriode(facts, DEFS);

    expect(r.grundlag).toEqual({ maalte: 6, estimerede: 6, samlet: 12 });
    expect(r.heleEstimatAar).toBe(false); // 2025 er kun halvt med
    expect(r.vaerdier.omsaetning).toMatchObject({
      total: 6 * MDR_REV_2025 + 750_000, // 288.000 + 750.000
      estimatAndel: 6 * MDR_REV_2025,
      basis: "blandet",
      daekning: 12,
    });
    // Forholdet beregnes af SUMMERNE (gp overalt = revenue/2 → 50 %) — ikke
    // som gennemsnit af månedsprocenter.
    expect(r.vaerdier.db_margin.total).toBeCloseTo(50, 5);
    expect(r.vaerdier.db_margin.estimatAndel).toBeNull();
  });

  it("helt estimatår + målte måneder: heleEstimatAar sand selv om perioden er blandet", () => {
    const facts = [
      ...heleEstimatAar2025,
      fact("2026-01", "measured", { revenue: 100_000 }),
    ];
    const r = opgoerPeriode(facts, DEFS);
    expect(r.heleEstimatAar).toBe(true);
    expect(r.vaerdier.omsaetning.basis).toBe("blandet");
  });

  it("bank (beholdning): ultimo fra seneste måned MED værdi, og basis er kilderækkens egen", () => {
    const facts = [
      estimatMaaned("2025-12"), // cash 42.000, estimat
      fact("2026-01", "measured", { revenue: 100_000 }), // ingen cash
    ];
    const r = opgoerPeriode(facts, DEFS);
    // Periodens sidste måned mangler bank — ultimo kommer fra estimatrækken,
    // og basis siger det (TalStrip-læren: bank kan komme fra en ældre række).
    expect(r.vaerdier.bank).toMatchObject({
      total: 42_000,
      basis: "estimated",
      estimatAndel: null,
      daekning: 1,
    });
    // Med bank i seneste målte måned vinder den — og basis følger med.
    const r2 = opgoerPeriode(
      [estimatMaaned("2025-12"), fact("2026-01", "measured", { revenue: 1, cash: 99_000 })],
      DEFS,
    );
    expect(r2.vaerdier.bank).toMatchObject({ total: 99_000, basis: "measured", daekning: 2 });
  });
});
