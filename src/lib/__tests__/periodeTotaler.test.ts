import { describe, expect, it } from "vitest";
import {
  bygPeriodeTotaler,
  estimatTekst,
  maanederISpaend,
  PERIODE_DEFINITIONER,
  periodeTekst,
  ufuldstaendigTekst,
} from "@/lib/periodeTotaler";
import type { CompanyFact } from "@/hooks/useCompanyFacts";

const fact = (key: string, metrics: Record<string, number>, basis: "measured" | "estimated" = "measured"): CompanyFact => ({
  id: `f-${key}`,
  period_key: key,
  period_label: key,
  source_report_id: `r-${key}`,
  source_type: basis === "measured" ? "canonical" : "annual_report",
  data_basis: basis,
  metrics,
  committed_at: "2026-09-01T00:00:00Z",
});

const maaned = (key: string, rev: number, basis: "measured" | "estimated" = "measured") =>
  fact(key, { revenue: rev, gross_profit: rev * 0.4, payroll: rev * 0.2, ebt: rev * 0.1, cash: 100 + rev }, basis);

const linje = (t: ReturnType<typeof bygPeriodeTotaler>, key: string) => t.linjer.find((l) => l.key === key)!;

describe("hvad der summeres, hvad der er forhold, og hvad der er ultimo", () => {
  const facts = ["2026-01", "2026-02", "2026-03"].map((k, i) => maaned(k, 100_000 * (i + 1)));
  const t = bygPeriodeTotaler(facts);
  it("flows summeres", () => {
    expect(linje(t, "omsaetning")).toMatchObject({ art: "flow", total: 600_000, daekning: 3, spaend: 3, ufuldstaendig: false, medEstimat: false });
    expect(linje(t, "daekningsbidrag").total).toBeCloseTo(240_000);
    expect(linje(t, "loenninger").total).toBeCloseTo(120_000);
    expect(linje(t, "resultat_foer_skat").total).toBeCloseTo(60_000);
  });
  it("forhold regnes på summerne — ikke som gennemsnit af månedsprocenter", () => {
    expect(linje(t, "db_margin")).toMatchObject({ art: "forhold", total: 40 });
    expect(linje(t, "resultat_margin").total).toBeCloseTo(10);
  });
  it("bank er ultimo — seneste måned, aldrig en sum", () => {
    expect(linje(t, "bank_balance")).toMatchObject({ art: "beholdning", total: 300_100 });
  });
  it("Omk. total, M/M og mål er bevidst ikke med", () => {
    expect(PERIODE_DEFINITIONER.map((d) => d.key)).not.toContain("omkostninger");
    expect(t.tekst).toBe("Jan 2026 – Mar 2026 · 3 måneder");
  });
});

describe("huller — et manglende tal er ikke nul (#786)", () => {
  it("en måned mangler midt i spændet: summen siges ufuldstændig med N af M", () => {
    const facts = [maaned("2026-01", 100_000), maaned("2026-03", 100_000)];
    const t = bygPeriodeTotaler(facts);
    expect(t.spaend).toBe(3);
    expect(t.tekst).toBe("Jan 2026 – Mar 2026 · 2 måneder af 3");
    const oms = linje(t, "omsaetning");
    expect(oms).toMatchObject({ total: 200_000, daekning: 2, spaend: 3, ufuldstaendig: true });
    expect(ufuldstaendigTekst(oms)).toBe("ufuldstændig · 2 af 3 måneder");
  });
  it("en nøgle der mangler i én af månederne (lønninger ikke læst): den nøgle er ufuldstændig, de andre ikke", () => {
    const facts = [
      maaned("2026-01", 100_000),
      fact("2026-02", { revenue: 100_000, gross_profit: 40_000, ebt: 10_000 }), // ingen payroll
      maaned("2026-03", 100_000),
    ];
    const t = bygPeriodeTotaler(facts);
    expect(linje(t, "loenninger")).toMatchObject({ total: 40_000, daekning: 2, ufuldstaendig: true });
    expect(linje(t, "omsaetning")).toMatchObject({ total: 300_000, ufuldstaendig: false });
    expect(ufuldstaendigTekst(linje(t, "omsaetning"))).toBeNull();
  });
  it("en nøgle ingen måned bærer: total null, ikke 0, og ikke «ufuldstændig»", () => {
    const facts = [fact("2026-01", { revenue: 1 }), fact("2026-02", { revenue: 2 })];
    const t = bygPeriodeTotaler(facts);
    expect(linje(t, "loenninger")).toMatchObject({ total: null, daekning: 0, ufuldstaendig: false });
    expect(linje(t, "bank_balance").total).toBeNull();
    expect(linje(t, "db_margin").total).toBeNull();
  });
  it("tom periode", () => {
    const t = bygPeriodeTotaler([]);
    expect(t.tekst).toBe("Ingen måneder i perioden");
    expect(t.linjer.every((l) => l.total === null && !l.ufuldstaendig)).toBe(true);
  });
});

describe("estimater — siges, ikke skjules", () => {
  it("blandet: heraf estimeret X, med delårsnote når estimatåret ikke er helt", () => {
    const facts = [maaned("2026-01", 100_000, "estimated"), maaned("2026-02", 100_000)];
    const t = bygPeriodeTotaler(facts);
    const oms = linje(t, "omsaetning");
    expect(oms).toMatchObject({ total: 200_000, medEstimat: true, estimatAndel: 100_000 });
    expect(estimatTekst(t, oms, (n) => `${n} kr.`)).toBe("heraf estimeret 100000 kr. (delår, jævnt fordelt)");
    expect(estimatTekst(t, linje(t, "db_margin"), (n) => `${n}`)).toBe("på delvist estimerede tal");
    expect(estimatTekst(t, linje(t, "bank_balance"), (n) => `${n}`)).toBeNull(); // ultimo er den målte februar
  });
  it("helt estimatår: summen er årsrapportens årstal", () => {
    const facts = Array.from({ length: 12 }, (_, i) => maaned(`2025-${String(i + 1).padStart(2, "0")}`, 10_000, "estimated"));
    const t = bygPeriodeTotaler(facts);
    expect(t.heleEstimatAar).toBe(true);
    expect(estimatTekst(t, linje(t, "omsaetning"), (n) => `${n}`)).toBe("estimat — årsrapportens årstal");
    expect(estimatTekst(t, linje(t, "bank_balance"), (n) => `${n}`)).toBe("estimat");
  });
  it("kun målt: ingen estimattekst", () => {
    const t = bygPeriodeTotaler([maaned("2026-01", 1), maaned("2026-02", 1)]);
    expect(estimatTekst(t, linje(t, "omsaetning"), (n) => `${n}`)).toBeNull();
  });
});

describe("spænd og tekst", () => {
  it("spændet tæller kalendermåneder hen over et årsskifte", () => {
    expect(maanederISpaend(["2025-11", "2026-02"])).toBe(4);
    expect(maanederISpaend(["2026-05"])).toBe(1);
    expect(maanederISpaend([])).toBe(0);
  });
  it("én måned siges som én", () => {
    expect(periodeTekst(["2026-05"])).toBe("Maj 2026 · 1 måned");
  });
});
