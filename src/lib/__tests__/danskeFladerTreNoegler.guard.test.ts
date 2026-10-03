import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CANONICAL, CANONICAL_DRIFT, DANSK, DANSK_DRIFT_NAVN, omkostningerIAlt, omkostningsnoegler, omkostningsparKanoniskTilDansk } from "@/lib/omkostningsnoegler";
import { CANONICAL_TO_DANISH as ADAPTER, factsToDanishMetrics, factsToDanishMetricsNullable } from "@/lib/factsAdapter";
import { KUN_I_TOTALEN, NAEVNTE_DANSKE, RAPPORTKORT_ANTAL, calcTotalExpenses, getCanonicalOrLegacyMetrics, getEffectiveKeyFigures, getEffectiveMetrics, rapportkortTal, type ReportData } from "@/lib/financialUtils";

/**
 * De danske flader taber tre omkostningsnøgler (3/10-2026, docs/OVERLEVERING.md DEL 2 «3. oktober»).
 *
 * Fundet: Dine tal, budget/BVA, CombinedBudgetWidget, rådgiverforsiden, periodeopgørelsen, CSV'en og
 * rapporteringen læser facts gennem factsToDanishMetrics → CANONICAL_TO_DANISH, og summerer med
 * calcTotalExpenses → omkostningsnoegler.DANSK. Begge lister var lokale og kendte ikke payroll_related,
 * other_staff_costs og vehicle_costs — kun den kanoniske vej (Score, kontrolsummen) talte dem.
 *
 * Reglen nu: de danske omkostningsnavne AFLEDES af omkostningsnoegler.ts (DANSK_DRIFT_NAVN), og enhver
 * kanonisk omkostningsnøgle har en dansk oversættelse, som calcTotalExpenses tæller — med ÉN bogført
 * undtagelse: finans (financial_costs), hvor DANSK.finans er null (åbent punkt, ikke rettet i denne skive).
 *
 * Fiktive tal — ingen kundedata.
 */

/** Den bogførte undtagelse: finans står under EBT, ikke i driften, og de danske flader har ingen nøgle til den. */
const KENDTE_UNDTAGELSER = new Set(["financial_costs"]);

/** Kanoniske omkostningsnøgler (og andre driftsindtægter), som en kanonisk→dansk-oversættelse IKKE kender,
    eller kender under et navn, DANSK ikke summerer. Ren — så værnet kan prøves på den gamle liste. */
function tabteNoegler(oversaettelse: Readonly<Record<string, string>>): string[] {
  const danskeSummerede = new Set([...omkostningsnoegler(DANSK, "alle"), DANSK.andreDriftsindtaegter]);
  return [...omkostningsnoegler(CANONICAL, "alle"), CANONICAL.andreDriftsindtaegter]
    .filter((k) => !KENDTE_UNDTAGELSER.has(k))
    .filter((k) => !oversaettelse[k] || !danskeSummerede.has(oversaettelse[k]));
}

/** factsAdapter.ts's lokale liste, ordret som den stod før 3/10-2026 (kun omkostningsdelen) — selvbeviset. */
const GAMMEL_ADAPTER: Record<string, string> = {
  payroll: "loenninger",
  cogs: "direkte_omkostninger",
  sales_costs: "salgsomkostninger",
  facility_costs: "lokaleomkostninger",
  admin_costs: "administrationsomkostninger",
  depreciation: "afskrivninger",
  other_costs: "oevrige_omkostninger",
  other_operating_income: "andre_driftsindtaegter",
};

describe("paritet — hver kanonisk omkostningsnøgle har en dansk oversættelse, som calcTotalExpenses tæller", () => {
  it("selvbevis: værnet fælder den gamle lokale liste på præcis de tre nøgler", () => {
    expect(tabteNoegler(GAMMEL_ADAPTER)).toEqual(["payroll_related", "other_staff_costs", "vehicle_costs"]);
  });
  it("selvbevis: værnet fælder en ny kanonisk driftsnøgle uden dansk navn", () => {
    const udenAutodrift = Object.fromEntries(Object.entries(ADAPTER).filter(([k]) => k !== "vehicle_costs"));
    expect(tabteNoegler(udenAutodrift)).toEqual(["vehicle_costs"]);
  });
  it("factsAdapter taber ingen", () => {
    expect(tabteNoegler(ADAPTER)).toEqual([]);
  });
  it("reportOverrideHelpers (den manuelle formular, bundet til databasens seed): samme danske navne, og den mangler KUN de tre, som ingen formular har et felt for", () => {
    // Kildelæst — modulet trækker Supabase-klienten ind (se kanoniskeNoegler.guard).
    const k = readFileSync(resolve(process.cwd(), "src/lib/reportOverrideHelpers.ts"), "utf8");
    const start = k.indexOf("export const CANONICAL_TO_DANISH");
    const blok = k.slice(start, k.indexOf("};", start));
    const formular = Object.fromEntries([...blok.matchAll(/^\s+([a-z_]+): "([a-z_]+)",/gm)].map((m) => [m[1], m[2]]));
    expect(Object.keys(formular).length).toBeGreaterThanOrEqual(15);
    for (const [en, da] of Object.entries(omkostningsparKanoniskTilDansk())) {
      if (formular[en] !== undefined) expect(formular[en], en).toBe(da);
    }
    expect(tabteNoegler(formular)).toEqual(["payroll_related", "other_staff_costs", "vehicle_costs"]);
  });
  it("DANSK.drift er afledt af CANONICAL_DRIFT gennem DANSK_DRIFT_NAVN — samme længde, samme rækkefølge, ingen dubletter", () => {
    expect(DANSK.drift).toEqual(CANONICAL_DRIFT.map((k) => DANSK_DRIFT_NAVN[k]));
    expect(CANONICAL.drift).toEqual([...CANONICAL_DRIFT]);
    expect(new Set(DANSK.drift).size).toBe(CANONICAL.drift.length);
    expect(DANSK_DRIFT_NAVN.payroll_related).toBe("pensioner_sociale");
    expect(DANSK_DRIFT_NAVN.other_staff_costs).toBe("oevrige_personale");
    expect(DANSK_DRIFT_NAVN.vehicle_costs).toBe("autodrift");
  });
  it("parrene: præcis omkostningsnøglerne + andre driftsindtægter, finans udeladt (DANSK.finans er null)", () => {
    expect(omkostningsparKanoniskTilDansk()).toEqual({
      cogs: "direkte_omkostninger",
      payroll: "loenninger",
      payroll_related: "pensioner_sociale",
      other_staff_costs: "oevrige_personale",
      sales_costs: "salgsomkostninger",
      facility_costs: "lokaleomkostninger",
      admin_costs: "administrationsomkostninger",
      vehicle_costs: "autodrift",
      other_costs: "oevrige_omkostninger",
      depreciation: "afskrivninger",
      other_operating_income: "andre_driftsindtaegter",
    });
  });
  it("de danske navne støder ikke ind i en anden kanonisk nøgles danske navn i adapteren", () => {
    const navne = Object.values(ADAPTER).filter((v) => v !== "egenkapital"); // equity og equity_total deler bevidst navn
    expect(new Set(navne).size).toBe(navne.length);
  });
  it("calcTotalExpenses(factsToDanishMetrics(m)) = omkostningerIAlt(m, CANONICAL) − |finans| for en række med ALLE nøgler", () => {
    const m: Record<string, number> = {};
    omkostningsnoegler(CANONICAL, "alle").forEach((k, i) => { m[k] = (i + 1) * 1000; });
    // cogs 1.000 · payroll 2.000 · payroll_related 3.000 · other_staff_costs 4.000 · sales 5.000 · facility 6.000
    // · admin 7.000 · vehicle 8.000 · other 9.000 · depreciation 10.000 · financial_costs 11.000
    // kanonisk = 1.000 + … + 11.000 = 66.000; dansk = 66.000 − 11.000 (finans) = 55.000
    expect(omkostningerIAlt(m, CANONICAL)).toBe(66000);
    expect(calcTotalExpenses(factsToDanishMetrics(m))).toBe(55000);
  });
});

describe("factsToDanishMetrics og calcTotalExpenses — regnestykket skrevet ud", () => {
  // En måned med autodrift, pension og øvrige personale (fiktive tal, formet som en e-conomic-resultatopgørelse).
  const metrics = {
    revenue: 400000, gross_profit: 250000, cogs: 150000,
    payroll: 120000, payroll_related: 18000, other_staff_costs: 4000,
    sales_costs: 10000, facility_costs: 15000, admin_costs: 12000, vehicle_costs: 9000, other_costs: 1000,
    depreciation: 5000, financial_costs: 2000, financial_income: 0, ebt: 54000,
  };

  it("factsToDanishMetrics oversætter de tre nøgler", () => {
    const kf = factsToDanishMetrics(metrics);
    expect(kf.pensioner_sociale).toBe(18000);
    expect(kf.oevrige_personale).toBe(4000);
    expect(kf.autodrift).toBe(9000);
    // Resultatet før skat går uændret igennem — rettelsen rører det ikke.
    expect(kf.resultat_foer_skat).toBe(54000);
    // Finans har stadig ingen dansk nøgle (åbent punkt).
    expect(Object.keys(kf)).not.toContain("financial_costs");
  });

  it("factsToDanishMetricsNullable bærer null for de tre, når de er null", () => {
    const kf = factsToDanishMetricsNullable({ payroll_related: null, vehicle_costs: 0 });
    expect(kf).toEqual({ pensioner_sociale: null, autodrift: 0 });
  });

  it("calcTotalExpenses: med de tre nøgler (ny) mod uden (gammel)", () => {
    // gammel = cogs 150.000 + løn 120.000 + salg 10.000 + lokaler 15.000 + admin 12.000 + øvrige 1.000 + afskr. 5.000 = 313.000
    // ny     = 313.000 + pension 18.000 + øvrige personale 4.000 + autodrift 9.000                            = 344.000
    // Afstemning: dækningsbidrag 250.000 − drift (120+18+4+10+15+12+9+1 = 189.000) − afskr. 5.000 − finans 2.000 = 54.000 = ebt
    const kf = factsToDanishMetrics(metrics);
    const gammelKf = { ...kf };
    delete gammelKf.pensioner_sociale;
    delete gammelKf.oevrige_personale;
    delete gammelKf.autodrift;
    expect(calcTotalExpenses(gammelKf)).toBe(313000);
    expect(calcTotalExpenses(kf)).toBe(344000);
  });

  it("negativ konvention (før 7/9) tælles som |beløb| også for de tre", () => {
    expect(calcTotalExpenses({ pensioner_sociale: -18000, oevrige_personale: -4000, autodrift: -9000 })).toBe(31000);
  });

  it("getCanonicalOrLegacyMetrics og getEffectiveKeyFigures bærer de tre — de første nøgler står i samme rækkefølge som før", () => {
    const report: ReportData = { id: "r", report_period: "Marts 2026", extracted_data: null, status: "processed", normalized_data: { metrics } };
    const r = getCanonicalOrLegacyMetrics(report)!;
    expect(r.metrics.pensioner_sociale).toBe(18000);
    expect(r.metrics.oevrige_personale).toBe(4000);
    expect(r.metrics.autodrift).toBe(9000);
    expect(Object.keys(r.metrics).slice(0, 6)).toEqual(["omsaetning", "daekningsbidrag", "loenninger", "direkte_omkostninger", "salgsomkostninger", "lokaleomkostninger"]);
    // Ingen dansk omkostningsnøgle mangler i hjælperens svar.
    for (const da of Object.values(omkostningsparKanoniskTilDansk())) expect(Object.keys(r.metrics)).toContain(da);
    expect(calcTotalExpenses(getEffectiveKeyFigures(report)!)).toBe(344000);
  });
});

describe("kildeværn — ingen lokal kanonisk→dansk-liste for omkostningerne", () => {
  const laes = (fil: string) => readFileSync(resolve(process.cwd(), fil), "utf8");
  // En linje som `cogs: "direkte_omkostninger"` eller `vehicle_costs: "autodrift"` er en lokal oversættelse.
  const lokalOmkostningslinje = new RegExp(
    `^\\s*(${[...omkostningsnoegler(CANONICAL, "alle"), CANONICAL.andreDriftsindtaegter].join("|")}):\\s*"[a-z_]+"`,
    "m",
  );
  it("selvbevis: mønstret fanger den gamle adapterlinje", () => {
    expect('  other_costs: "oevrige_omkostninger",\n').toMatch(lokalOmkostningslinje);
    expect('  vehicle_costs: "autodrift",\n').toMatch(lokalOmkostningslinje);
  });
  it("src/lib/factsAdapter.ts afleder parrene og har ingen lokal omkostningslinje", () => {
    const k = laes("src/lib/factsAdapter.ts");
    expect(k).toMatch(/\.\.\.omkostningsparKanoniskTilDansk\(\)/);
    expect(k).not.toMatch(lokalOmkostningslinje);
  });
  it("src/lib/financialUtils.ts lægger de unævnte omkostningsnøgler til i begge grene", () => {
    const k = laes("src/lib/financialUtils.ts");
    expect(k.match(/\.\.\.manglendeOmkostninger\(/g)?.length).toBe(2);
  });
  it("omkostningsnoegler.ts: DANSK.drift er afledt, ikke en håndskrevet liste", () => {
    const k = laes("src/lib/omkostningsnoegler.ts");
    expect(k).toMatch(/drift: CANONICAL_DRIFT\.map\(\(k\) => DANSK_DRIFT_NAVN\[k\]\)/);
    expect(k).not.toMatch(/drift: \["loenninger"/);
  });
});

describe("getEffectiveMetrics — den manuelle gren læser de DANSKE navne", () => {
  // Formularen gemmer danske nøgler i manual_normalized_data.metrics. Grenen skal derfor slå `da` op — en
  // mutation til `(en) => mnd.metrics[en]` ville læse det kanoniske navn og fælder her.
  const manuel = (metrics: Record<string, number>): ReportData => ({
    id: "m", report_period: "Marts 2026", extracted_data: null, status: "processed",
    normalized_data: { metrics: { vehicle_costs: 1, payroll_related: 1, other_staff_costs: 1 } },
    manual_override_status: "applied",
    manual_normalized_data: { metrics },
  });

  it("de tre danske nøgler fra den manuelle rettelse bæres med; de kanoniske navne i samme objekt ignoreres", () => {
    const r = getEffectiveMetrics(manuel({ loenninger: 120000, autodrift: 9000, pensioner_sociale: 18000, oevrige_personale: 4000, vehicle_costs: 777 }))!;
    expect(r.source).toBe("manual");
    expect(r.metrics.autodrift).toBe(9000);
    expect(r.metrics.pensioner_sociale).toBe(18000);
    expect(r.metrics.oevrige_personale).toBe(4000);
    // Regnestykket: 120.000 + 9.000 + 18.000 + 4.000 = 151.000 (normalized_data's 1-taller er IKKE med — rettelsen vinder).
    expect(calcTotalExpenses(r.metrics)).toBe(151000);
  });
  it("uden de tre i rettelsen er de null — og falder IKKE tilbage på normalized_data (som databasens manuelle gren)", () => {
    const r = getEffectiveMetrics(manuel({ loenninger: 120000 }))!;
    expect(r.metrics.autodrift).toBeNull();
    expect(r.metrics.pensioner_sociale).toBeNull();
    expect(r.metrics.oevrige_personale).toBeNull();
  });
});

describe("NAEVNTE_DANSKE er låst mod listerne i begge grene", () => {
  const kilde = readFileSync(resolve(process.cwd(), "src/lib/financialUtils.ts"), "utf8");
  const omkostningsnavne = new Set(Object.values(omkostningsparKanoniskTilDansk()));

  /** De danske omkostningsnavne, en grens håndskrevne liste nævner. Grenen findes mellem `start` og `slut`. */
  function naevnteI(k: string, start: string, slut: string, linje: RegExp): Set<string> {
    const a = k.indexOf(start);
    const b = k.indexOf(slut, a);
    expect(a, start).toBeGreaterThan(-1);
    expect(b, slut).toBeGreaterThan(a);
    const navne = [...k.slice(a, b).matchAll(linje)].map((m) => m[1]);
    expect(navne.length, "parseren ramte ved siden af").toBeGreaterThanOrEqual(15);
    return new Set(navne.filter((n) => omkostningsnavne.has(n)));
  }
  const kanoniskGren = (k: string) => naevnteI(k, "export function getCanonicalOrLegacyMetrics", "// Legacy fallback", /^\s+([a-z_]+): m\.[a-z_]+ \?\? null,/gm);
  const manuelGren = (k: string) => naevnteI(k, 'source: "manual"', "...manglendeOmkostninger((_en, da)", /^\s+([a-z_]+): mnd\.metrics\.[a-z_]+ \?\? null,/gm);
  const laast = (k: string) => {
    const n = JSON.stringify([...NAEVNTE_DANSKE].sort());
    return JSON.stringify([...kanoniskGren(k)].sort()) === n && JSON.stringify([...manuelGren(k)].sort()) === n;
  };

  it("begge grene nævner præcis NAEVNTE_DANSKE, og resten af omkostningsnavnene er KUN_I_TOTALEN", () => {
    expect(laast(kilde)).toBe(true);
    expect([...KUN_I_TOTALEN].sort()).toEqual(["autodrift", "oevrige_personale", "pensioner_sociale"]);
    for (const n of omkostningsnavne) expect(NAEVNTE_DANSKE.has(n) !== KUN_I_TOTALEN.has(n), n).toBe(true);
  });
  it("selvbevis: en ny linje i den kanoniske gren (uden at ændre sættet) fælder", () => {
    const muteret = kilde.replace("        kreditorer: m.current_liabilities ?? null,\n", "        kreditorer: m.current_liabilities ?? null,\n        autodrift: m.vehicle_costs ?? null,\n");
    expect(muteret).not.toBe(kilde);
    expect(laast(muteret)).toBe(false);
  });
  it("selvbevis: en fjernet linje i den manuelle gren fælder", () => {
    const muteret = kilde.replace("          oevrige_omkostninger: mnd.metrics.oevrige_omkostninger ?? null,\n", "");
    expect(muteret).not.toBe(kilde);
    expect(laast(muteret)).toBe(false);
  });
});

describe("rapportkortet — de tre nøgler er aldrig blandt de seks tal", () => {
  it("en tynd række (< 6 tal): de tre vises ikke, og de andre står i hjælperens rækkefølge", () => {
    const report: ReportData = {
      id: "t", report_period: "Marts 2026", extracted_data: null, status: "processed",
      normalized_data: { metrics: { revenue: 100000, payroll: 30000, vehicle_costs: 9000, payroll_related: 4000, other_staff_costs: 1000, ebt: 20000 } },
    };
    const kf = getEffectiveKeyFigures(report)!;
    // Hjælperen bærer dem (totalen tæller dem) …
    expect(kf.autodrift).toBe(9000);
    // … men kortet viser kun de tre tal, der var der før 3/10.
    expect(rapportkortTal(kf)).toEqual([["omsaetning", 100000], ["loenninger", 30000], ["resultat_foer_skat", 20000]]);
  });
  it("en fuld række: højst seks, ingen af de tre", () => {
    const kf = { omsaetning: 1, autodrift: 2, daekningsbidrag: 3, pensioner_sociale: 4, loenninger: 5, direkte_omkostninger: 6, oevrige_personale: 7, salgsomkostninger: 8, lokaleomkostninger: 9, administrationsomkostninger: 10 };
    const tal = rapportkortTal(kf);
    expect(tal.length).toBe(RAPPORTKORT_ANTAL);
    expect(tal.map(([n]) => n)).toEqual(["omsaetning", "daekningsbidrag", "loenninger", "direkte_omkostninger", "salgsomkostninger", "lokaleomkostninger"]);
  });
  it("RapporteringView bruger rapportkortTal og skærer ikke selv", () => {
    const k = readFileSync(resolve(process.cwd(), "src/components/hjemmebane/rapportering/RapporteringView.tsx"), "utf8");
    expect(k).toMatch(/const figureEntries = rapportkortTal\(keyFigures\);/);
    expect(k).not.toMatch(/figureEntries\.slice\(/);
  });
});
