import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BarChart3 } from "lucide-react";
import { getTargetStatus, type KpiMetric } from "@/lib/kpiDefs";

// Kort 40 (Jonas 11/9): uden aftalt mål dømmes ikke. Fallbacken er væk, så
// «intet mål» er nu det normale (prod 11/9: 26 af 30 aktive virksomheder har
// ingen række i kpi_targets). To steder gjorde «intet mål» til noget andet:
//  1. Chattens «Se tal»-skuffe: getTargetStatus gav hit:false uden mål, og
//     CompanyChatPane satte afviger = !status.hit → rust-ramme UDEN mål-tekst.
//  2. Brancheskiftet i Indstillinger upsertede branchetal som kpi_targets
//     (toast «KPI-mål opdateret fra branchestandard») — standardmålet kom ind
//     ad bagdøren under navnet «aftalt».
// Værnet låser dommen (enhedstest) og de to kaldesteder (kildelæsning).

const metric = (over: Partial<KpiMetric>): KpiMetric => ({
  key: "omsaetning", label: "Omsætning", value: "50.000", numValue: 50_000,
  target: "—", targetNum: 0, maalKilde: null,
  change: "—", changePct: null, changeArt: "relativ", trend: "neutral",
  unit: "DKK", icon: BarChart3, description: "", lowerIsBetter: false,
  history: [], benchmark: { value: 0, label: "—", source: "" },
  ...over,
});

const laes = (fil: string) => readFileSync(resolve(process.cwd(), fil), "utf8");
const udenKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("getTargetStatus — uden mål er der ingen dom", () => {
  it("intet mål (targetNum 0): hit er null — hverken nået eller ikke nået", () => {
    expect(getTargetStatus(metric({ targetNum: 0 }))).toEqual({ hit: null, pct: 0 });
    expect(getTargetStatus(metric({ targetNum: 0, numValue: 0 }))).toEqual({ hit: null, pct: 0 });
    expect(getTargetStatus(metric({ targetNum: -5 })).hit).toBeNull();
  });

  it("aftalt mål: dømmer som før — nået/ikke nået i begge retninger", () => {
    expect(getTargetStatus(metric({ targetNum: 40_000, numValue: 50_000 })).hit).toBe(true);
    expect(getTargetStatus(metric({ targetNum: 80_000, numValue: 50_000 })).hit).toBe(false);
    expect(getTargetStatus(metric({ targetNum: 80_000, numValue: 106_096, lowerIsBetter: true })).hit).toBe(false);
    expect(getTargetStatus(metric({ targetNum: 80_000, numValue: 60_000, lowerIsBetter: true })).hit).toBe(true);
  });

  it("den gamle læsning `!hit` ville dømme «intet mål» som afvigelse — den nye `hit === false` gør ikke", () => {
    const uden = getTargetStatus(metric({ targetNum: 0 }));
    expect(!uden.hit).toBe(true); // derfor var skuffen rust før
    expect(uden.hit === false).toBe(false);
  });
});

describe("chattens «Se tal»-skuffe tegner kun rust ved et mål der ikke er nået", () => {
  const kode = udenKommentarer(laes("src/components/CompanyChatPane.tsx"));
  it("hvert SkuffeKpiKort får afviger fra `status.hit === false` — aldrig `!status.hit`", () => {
    const kald = kode.match(/<SkuffeKpiKort[^>]*afviger=\{[^}]*\}/g) ?? [];
    expect(kald.length, "antal SkuffeKpiKort-kald har ændret sig — opdatér værnet bevidst").toBe(2);
    for (const k of kald) expect(k).toContain("afviger={status.hit === false}");
    expect(kode).not.toMatch(/afviger=\{!status\.hit\}/);
  });
});

describe("brancheskiftet skriver ikke mål", () => {
  const kode = udenKommentarer(laes("src/components/hjemmebane/indstillinger/IndstillingerView.tsx"));
  it("IndstillingerView rører ikke kpi_targets og lover ikke «KPI-mål opdateret fra branchestandard»", () => {
    expect(kode).not.toContain('from("kpi_targets")');
    expect(kode).not.toContain("kpi_targets");
    expect(kode).not.toContain("branchestandard");
  });
  it("branchesammenligningen (kpi_benchmarks fra industry_benchmarks) synkes stadig", () => {
    expect(kode).toContain('from("industry_benchmarks")');
    expect(kode).toContain('from("kpi_benchmarks").upsert(');
  });
});
