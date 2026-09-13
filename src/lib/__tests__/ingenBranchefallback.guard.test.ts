import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 13/9 (Jonas, set på ANLA GLAS A/S, /kpis): kortet for omsætning skrev
// «1.388.412 · branche 150K · −31,5 %». Tre fejl i én linje: «branche 150K»
// var KPI_DEFAULT_BENCHMARKS (appConfig) — seks tal for ALLE virksomheder,
// source «Estimat, The Boardroom», ikke nogen branche; brancheafsnittet
// nederst brugte samtidig virksomhedens FAKTISKE branche (industry_benchmarks);
// og −31,5 % var M/M-ændringen, limet på så den læstes som afvigelse fra
// branchen. Beslutning: estimatet ud, og kortet sammenligner med forrige
// måneds EGET tal — mærket «M/M» som FINANSIEL UDVIKLING og chattens skuffe.
// Uden gyldig forrige måned (changePct null) vises ingen linje.
//
// Værnet er kildelæsning (som kpiMaalEtSted.guard for målene): hooken er
// bundet til supabase og har ingen enhedstest.

const laes = (fil: string) => readFileSync(resolve(process.cwd(), fil), "utf8");
const udenKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const FALLBACKEN = "KPI_DEFAULT_BENCHMARKS";
const HOOKEN = "src/hooks/useKpiBenchmarks.ts";
const KORTET = "src/components/hjemmebane/noegletal/NoegletalView.tsx";

describe("husets branche-estimat er væk", () => {
  it("appConfig definerer ikke længere KPI_DEFAULT_BENCHMARKS", () => {
    expect(udenKommentarer(laes("src/lib/appConfig.ts"))).not.toContain(FALLBACKEN);
  });

  it("useKpiBenchmarks importerer intet fra appConfig og opfinder ingen række", () => {
    const kode = udenKommentarer(laes(HOOKEN));
    expect(kode).not.toMatch(/from "@\/lib\/appConfig"/);
    expect(kode).not.toContain(FALLBACKEN);
    // Nøgler uden række udelades — ikke 0 med en etiket.
    expect(kode).not.toContain('{ value: 0, label: "—", source: "" }');
    expect(kode).toContain("if (ub) merged[def.key] =");
  });
});

describe("KPI-kortets linje under tallet", () => {
  const kode = udenKommentarer(laes(KORTET));

  it("M/M-ændringen bærer husets ord «M/M», og vises kun med gyldigt grundlag", () => {
    expect(kode).toContain("const harMoM = metric.changePct != null;");
    expect(kode).toMatch(/\{harMoM && \(\s*<span[^>]*>\s*\{harMaal \|\| benchLabel \? " · " : ""\}\s*\{metric\.change\} M\/M/);
    // Den gamle form skrev metric.change uden mærke, også når den var «—».
    expect(kode).not.toMatch(/\{metric\.change\}\s*<\/span>/);
  });

  it("intet at vise → ingen linje (mål, benchmark og M/M alle fraværende)", () => {
    expect(kode).toMatch(/\{\(harMaal \|\| benchLabel \|\| harMoM\) && \(\s*<p className="mt-0\.5 text-xs">/);
  });

  it("brancheafsnittet nederst henter stadig virksomhedens faktiske branche — ikke gennem hooken", () => {
    expect(kode).toContain('from("industry_benchmarks")');
    expect(kode).toContain("useKpiBenchmarks(companyId ?? undefined)");
  });
});
