/**
 * Spænd-dommen (recon-to-maaneder §2b/§5, 10/9-2026): en fil der dækker mere
 * end én måned må ikke bogføres som én. Én måned går igennem; to måneder
 * afvises med en klar besked; en fil uden læsbar periode opfører sig som i
 * dag (ingen dom). Værnene nederst læser kilden og låser at dommen SIDDER i
 * extract-financial-data — både i resolveren og før no_match-svaret — og at
 * klienten viser serverens tekst uændret.
 *
 * IMPORTSTIEN (rettet 10/9): testen importerer KUN periodeSpaend.ts, som selv
 * intet importerer. reportUploadEngine.ts importeres bevidst IKKE — den
 * trækker `@/integrations/supabase/client` med, som opretter en klient ved
 * import og lader auth-js læse en session fra localStorage, der ikke findes i
 * testmiljøet (unhandled rejection «storage.getItem is not a function», exit 1
 * trods grønne tests). Klientens del efterprøves kildelæsende, som husets
 * øvrige paritetstests gør det.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  afgoerPeriodeSpaend,
  findPeriodeITekst,
  maanederImellem,
  parsePeriodeDato,
  spaendAfvisningTekst,
  spaendKendtKildeTekst,
} from "../../../supabase/functions/_shared/periodeSpaend.ts";

describe("parsePeriodeDato — de fire formater skabelonerne skriver", () => {
  it("læser dd-mm-yyyy, dd.mm.yy, dd.mm.yyyy, dd/mm-yyyy og yyyy-mm-dd", () => {
    expect(parsePeriodeDato("30-06-2026")).toEqual({ aar: 2026, maaned: 6 });
    expect(parsePeriodeDato("30.06.26")).toEqual({ aar: 2026, maaned: 6 });
    expect(parsePeriodeDato("30.06.2026")).toEqual({ aar: 2026, maaned: 6 });
    expect(parsePeriodeDato("30/06-2026")).toEqual({ aar: 2026, maaned: 6 });
    expect(parsePeriodeDato("2026-06-30")).toEqual({ aar: 2026, maaned: 6 });
  });
  it("alt andet er null — også måned 13 og tomt", () => {
    expect(parsePeriodeDato("Juni 2026")).toBeNull();
    expect(parsePeriodeDato("30-13-2026")).toBeNull();
    expect(parsePeriodeDato("")).toBeNull();
    expect(parsePeriodeDato(null)).toBeNull();
    expect(parsePeriodeDato(undefined)).toBeNull();
  });
});

describe("afgoerPeriodeSpaend — én måned, flere måneder, ukendt", () => {
  it("én måned går igennem (e-conomic-fixturens form 01.04.25 - 30.04.25)", () => {
    expect(afgoerPeriodeSpaend({ period_start: "01-04-2025", period_end: "30-04-2025" })).toMatchObject({ dom: "een_maaned", maaneder: 1 });
    expect(afgoerPeriodeSpaend({ period_start: "01/01-2026", period_end: "31/01-2026" }).dom).toBe("een_maaned");
  });

  it("PHILBERTs 01.05.26 - 30.06.26 er to måneder → flere_maaneder", () => {
    const dom = afgoerPeriodeSpaend({ period_start: "01-05-2026", period_end: "30-06-2026" });
    expect(dom).toMatchObject({ dom: "flere_maaneder", maaneder: 2 });
  });

  it("årsskifte tælles rigtigt: december 2025 – januar 2026 = 2; januar – juni = 6", () => {
    expect(afgoerPeriodeSpaend({ period_start: "01.12.25", period_end: "31.01.26" })).toMatchObject({ dom: "flere_maaneder", maaneder: 2 });
    expect(afgoerPeriodeSpaend({ period_start: "01-01-2026", period_end: "30-06-2026" })).toMatchObject({ dom: "flere_maaneder", maaneder: 6 });
  });

  it("uden læsbar periode → ukendt (ingen dom — som i dag): mangler, ulæselig, eller slut før start", () => {
    expect(afgoerPeriodeSpaend({})).toEqual({ dom: "ukendt", maaneder: null });
    expect(afgoerPeriodeSpaend({ period_start: null, period_end: "30-06-2026" })).toEqual({ dom: "ukendt", maaneder: null });
    expect(afgoerPeriodeSpaend({ period_start: "Maj 2026", period_end: "Juni 2026" })).toEqual({ dom: "ukendt", maaneder: null });
    expect(afgoerPeriodeSpaend({ period_start: "01-07-2026", period_end: "30-06-2026" })).toEqual({ dom: "ukendt", maaneder: null });
    expect(maanederImellem({ aar: 2026, maaned: 7 }, { aar: 2026, maaned: 6 })).toBeNull();
  });
});

describe("findPeriodeITekst — perioden læses af råteksten før no_match", () => {
  it("dot-format (e-conomic PDF/XLSX-header)", () => {
    expect(findPeriodeITekst("PHILBERT ApS\nSaldobalance for perioden 01.05.26 - 30.06.26\nNr Navn Perioden År til dato")).toEqual({ period_start: "01.05.26", period_end: "30.06.26" });
  });
  it("slash-format (semantisk PDF-metadata) og «til»-format (XLSX)", () => {
    expect(findPeriodeITekst("Resultatopgørelse 01/05-2026 - 30/06-2026")).toEqual({ period_start: "01/05-2026", period_end: "30/06-2026" });
    expect(findPeriodeITekst("Periode 01-05-2026 til 30-06-2026")).toEqual({ period_start: "01-05-2026", period_end: "30-06-2026" });
  });
  it("intet fund → null, og dommen på det er ukendt", () => {
    expect(findPeriodeITekst("Konto;Kontonavn;Beløb\n1010;Salg;-100")).toBeNull();
    expect(findPeriodeITekst(null)).toBeNull();
    expect(afgoerPeriodeSpaend(findPeriodeITekst("ingen dato") ?? {}).dom).toBe("ukendt");
  });
  it("fundet periode kan dømmes direkte", () => {
    expect(afgoerPeriodeSpaend(findPeriodeITekst("Saldobalance for perioden 01.05.26 - 30.06.26")!)).toMatchObject({ dom: "flere_maaneder", maaneder: 2 });
    expect(afgoerPeriodeSpaend(findPeriodeITekst("Saldobalance for perioden 01.04.25 - 30.04.25")!).dom).toBe("een_maaned");
  });
});

describe("teksterne — rolige, siger hvad filen dækker og hvad man gør", () => {
  const dom = afgoerPeriodeSpaend({ period_start: "01-05-2026", period_end: "30-06-2026" });
  if (dom.dom !== "flere_maaneder") throw new Error("testopsætning");

  it("afvisning i resolveren", () => {
    const t = spaendAfvisningTekst(dom);
    expect(t).toBe("Filen dækker 2 måneder (maj–juni 2026). Vi kan kun læse én måned ad gangen — eksportér én måned pr. fil og upload dem hver for sig.");
    expect(t).not.toMatch(/!|fejl|error|_/i);
  });

  it("kendt kilde uden skabelon — siger måneder frem for «formatet understøttes ikke»", () => {
    const t = spaendKendtKildeTekst("e-conomic", dom);
    expect(t).toMatch(/^Filen er genkendt som en rapport fra e-conomic, men den dækker 2 måneder \(maj–juni 2026\)/);
    expect(t).toMatch(/én måned ad gangen/);
    expect(t).not.toMatch(/understøttes ikke/);
  });

  it("årsskifte i label", () => {
    const d = afgoerPeriodeSpaend({ period_start: "01-12-2025", period_end: "31-01-2026" });
    if (d.dom !== "flere_maaneder") throw new Error("testopsætning");
    expect(spaendAfvisningTekst(d)).toMatch(/december 2025–januar 2026/);
  });

});

describe("værn — dommen sidder i extract-financial-data", () => {
  const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
  const kilde = laes("supabase/functions/extract-financial-data/index.ts");

  it("resolveren afviser flere måneder med status period_span_rejected og status error på rækken", () => {
    const gate = kilde.indexOf('routing_branch: "period_span_rejected"');
    expect(gate).toBeGreaterThan(0);
    expect(kilde).toMatch(/afgoerPeriodeSpaend\(\{\s*period_start: canonical\.period_start/);
    expect(kilde).toMatch(/status: "period_span_rejected"/);
    // gaten står FØR periode-gaten (igangværende måned), så en to-måneders fil aldrig når «processed»
    expect(gate).toBeLessThan(kilde.indexOf("[PeriodGate] Rejecting non-completed month"));
  });

  it("klienten viser serverens spænd-tekst uændret i zonen (getFriendlyErrorMessage, kildelæsende)", () => {
    const engine = laes("src/lib/reportUploadEngine.ts");
    const fn = engine.slice(engine.indexOf("export function getFriendlyErrorMessage"));
    expect(fn).toMatch(/status === "period_span_rejected"/);
    // passthrough'en står FØR den generiske default
    expect(fn.indexOf('"period_span_rejected"')).toBeLessThan(fn.indexOf("kunne ikke behandles automatisk"));
  });

  it("no_match for kendt kilde læser spændet af teksten før beskeden vælges", () => {
    const noMatch = kilde.indexOf('routingTrace.branch = "known_source_unsupported_variant"');
    const besked = kilde.indexOf("const besked = spaendVedNoMatch.dom === \"flere_maaneder\"");
    expect(noMatch).toBeGreaterThan(0);
    expect(besked).toBeGreaterThan(noMatch);
    expect(kilde.slice(noMatch, besked)).toMatch(/findPeriodeITekst\(fileContent\)/);
  });
});
