import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

/**
 * Værn: den manuelle rettelse bevarer nøgler, formularen ikke kan udtrykke (3/10-2026, kort
 * g03-manuel-rettelse-taber-noegler). Migrationen 20261003221500 og datafilen
 * docs/sql/20261003-genskab-manuelle-noegler.sql er IKKE kørt — værnet holder dem på reglen.
 *
 * Hver dom er en ren funktion over teksten, prøvet på den rigtige fil OG på en mutation (selvbevis).
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const MIGRATION = "supabase/migrations/20261003221500_manuel_rettelse_bevarer_noegler.sql";
const FIXTURE = "src/lib/__tests__/fixtures/resolve_report_commit_candidate.prod-2026-10-03.sql";
const DATAFIL = "docs/sql/20261003-genskab-manuelle-noegler.sql";
const PROD_MD5 = "eaf5feab333dd6a6bd3a695b8a6bd932";
const ANKER = "    _out.metrics_preview := _mapped;\n    _out.period_key := _r.manual_report_period_key;";
const BLOK_START = "    -- BEVAR NØGLER, FORMULAREN IKKE KAN UDTRYKKE";
const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");

/** CREATE OR REPLACE-sætningen i migrationen (uden det afsluttende «;»), som pg_get_functiondef vil gengive den. */
function funktionIMigrationen(mig: string): string {
  const start = mig.indexOf("CREATE OR REPLACE FUNCTION public.resolve_report_commit_candidate");
  if (start < 0) return "";
  const slut = mig.indexOf("$function$;", start);
  if (slut < 0) return "";
  return mig.slice(start, slut) + "$function$\n";
}

/** Blokken (fra dens første kommentarlinje til ankeret) — tom, hvis den ikke står lige før ankeret. */
function blokken(fn: string): string {
  const a = fn.indexOf(ANKER);
  const b = fn.indexOf(BLOK_START);
  if (a < 0 || b < 0 || b > a) return "";
  return fn.slice(b, a);
}

/** Dom 1: funktionen = prod-fixturen med PRÆCIS blokken indsat foran ankeret — intet andet ændret. */
function dom1KunBlokken(fn: string, fixture: string): string[] {
  const fejl: string[] = [];
  const blok = blokken(fn);
  if (!blok) return ["blokken står ikke lige før den manuelle grens metrics_preview"];
  if (fn.replace(blok, "") !== fixture) fejl.push("funktionen afviger fra prod-fixturen ud over blokken");
  if (fn.split(BLOK_START).length - 1 !== 1) fejl.push("blokken står mere end én gang");
  return fejl;
}

/** Dom 2: blokkens betingelser — kilden er rapportens normalized_data, kun uudtrykkelige nøgler, formularen vinder, _has_any røres ikke. */
function dom2Betingelser(blok: string): string[] {
  const kode = blok.replace(/--[^\n]*/g, "");
  const krav: [RegExp, string][] = [
    [/IF jsonb_typeof\(_r\.normalized_data -> 'metrics'\) = 'object' THEN/, "kilden skal være rapportens normalized_data.metrics som objekt"],
    [/FROM jsonb_each_text\(_r\.normalized_data -> 'metrics'\) e/, "nøglerne læses af normalized_data.metrics"],
    [/JOIN public\.kanoniske_noegler kn ON kn\.noegle = e\.key/, "kun kanoniske nøgler"],
    [/WHERE kn\.dansk_noegle IS NULL/, "kun nøgler uden dansk_noegle"],
    [/AND COALESCE\(cardinality\(kn\.danske_aliaser\), 0\) = 0/, "kun nøgler uden aliaser"],
    [/AND e\.value IS NOT NULL AND e\.value ~ '\^-\?\[0-9\]'/, "samme talbetingelse som grenene"],
    [/IF NOT \(_mapped \? _k\) THEN/, "formularens tal skal vinde"],
  ];
  const fejl = krav.filter(([re]) => !re.test(kode)).map(([, hvad]) => hvad);
  if (/_has_any/.test(kode)) fejl.push("blokken må ikke sætte _has_any (en rettelse uden formulartal er stadig ikke-mappable)");
  if (/manual_normalized_data/.test(kode)) fejl.push("blokken må ikke læse den manuelle kilde");
  if (/\b(INSERT|UPDATE|DELETE)\b/.test(kode)) fejl.push("blokken må ikke skrive");
  return fejl;
}

/** Dom 3: filhovedet — første linje, grønt lys, FØR-vagten på prod-md5, EFTER-md5 = den nye funktion, transaktion. */
function dom3Hoved(mig: string, nyMd5: string): string[] {
  const fejl: string[] = [];
  if (!mig.startsWith("-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).\n")) fejl.push("første linje");
  if (!/^-- KRÆVER GRØNT LYS/m.test(mig)) fejl.push("KRÆVER GRØNT LYS mangler");
  if (!new RegExp(`IF md5\\(pg_get_functiondef\\('public\\.resolve_report_commit_candidate\\(uuid\\)'::regprocedure\\)\\) <> '${PROD_MD5}' THEN\\s+RAISE EXCEPTION`).test(mig)) fejl.push("FØR-vagten på prod-md5 mangler");
  if (!mig.includes(`Forventet: md5 = ${nyMd5}`)) fejl.push("EFTER-md5 i filhovedet er ikke den nye funktions");
  if (!/^BEGIN;$/m.test(mig) || !/^COMMIT;$/m.test(mig)) fejl.push("ikke i én transaktion");
  if (/CREATE OR REPLACE FUNCTION public\.commit_report_facts/.test(mig)) fejl.push("commit_report_facts må ikke røres");
  return fejl;
}

/** De `tabt`-CTE'er, datafilen bruger (trin 1 og trin 2). */
function tabtCteer(data: string): string[] {
  return [...data.matchAll(/tabt AS \(([\s\S]*?)\n\)/g)].map((m) => m[1]);
}

/** Dom 4: datafilen — samme regel som blokken, kun manuelle rækker, vagt i UPDATE og i tilbagerulningen, intet slettes. */
function dom4Datafil(data: string): string[] {
  const fejl: string[] = [];
  if (!data.startsWith("-- IKKE KØRT. DATAFIL")) fejl.push("første linje");
  if (!/KRÆVER JONAS' JA/.test(data)) fejl.push("KRÆVER JONAS' JA mangler");
  const cteer = tabtCteer(data);
  if (cteer.length !== 2) fejl.push(`forventede 2 tabt-CTE'er, fandt ${cteer.length}`);
  for (const c of cteer) {
    for (const [re, hvad] of [
      [/WHERE f\.source_type = 'manual'/, "kun manuelle facts"],
      [/JOIN public\.financial_reports r ON r\.id = f\.source_report_id/, "kilden er facts-rækkens egen rapport"],
      [/r\.normalized_data -> 'metrics'/, "nøglerne fra normalized_data.metrics"],
      [/AND kn\.dansk_noegle IS NULL/, "kun uden dansk_noegle"],
      [/AND COALESCE\(cardinality\(kn\.danske_aliaser\), 0\) = 0/, "kun uden aliaser"],
      [/AND e\.value IS NOT NULL AND e\.value ~ '\^-\?\[0-9\]'/, "talbetingelsen"],
      [/AND NOT \(f\.metrics \? e\.key\)/, "kun nøgler, facts mangler"],
    ] as [RegExp, string][]) {
      if (!re.test(c)) fejl.push(`tabt-CTE: ${hvad}`);
    }
  }
  const update = data.match(/^UPDATE public\.financial_report_facts f\n[\s\S]*?;$/m)?.[0] ?? "";
  if (!update) fejl.push("UPDATE'en findes ikke");
  if (!/AND f\.metrics = s\.metrics_foer/.test(update)) fejl.push("UPDATE'en er ikke guardet på snapshottet");
  if (!/AND NOT \(f\.metrics \?\| ARRAY\(SELECT jsonb_object_keys\(s\.tilfoejet\)\)\)/.test(update)) fejl.push("UPDATE'en er ikke guardet på, at nøglen stadig mangler");
  if (!/SET metrics = f\.metrics \|\| s\.tilfoejet/.test(update)) fejl.push("UPDATE'en lægger ikke kun til");
  if (!/--\s+AND f\.metrics = s\.metrics_foer \|\| s\.tilfoejet;/.test(data)) fejl.push("tilbagerulningen er ikke guardet");
  if (!/CREATE TABLE ops\.genskab_manuelle_noegler_20261003 AS/.test(data)) fejl.push("snapshottet mangler");
  if (/^\s*DELETE\b/im.test(data.replace(/^--.*$/gm, ""))) fejl.push("datafilen må ikke slette");
  return fejl;
}

describe("manuel rettelse bevarer nøgler — migrationen", () => {
  const mig = laes(MIGRATION);
  const fixture = laes(FIXTURE);
  const fn = funktionIMigrationen(mig);

  it("fixturen er prod-definitionen 3/10 (md5 som målt med pg_get_functiondef)", () => {
    expect(md5(fixture)).toBe(PROD_MD5);
    expect(fixture).toContain("SECURITY DEFINER");
  });

  it("dom 1: funktionen er fixturen + blokken, intet andet", () => {
    expect(fn.length, "parseren fandt ikke funktionen").toBeGreaterThan(1000);
    expect(dom1KunBlokken(fn, fixture)).toEqual([]);
    // Selvbevis: en ændring uden for blokken, og en manglende blok, fælder.
    expect(dom1KunBlokken(fn.replace("'Rapport ikke fundet'", "'Rapport væk'"), fixture)).not.toEqual([]);
    expect(dom1KunBlokken(fixture, fixture)).not.toEqual([]);
    // Blokken skal stå i den MANUELLE gren — ikke i V2/V1.
    const manuel = fn.indexOf("MANUAL OVERRIDE");
    const v2 = fn.indexOf("V2 BRANCH");
    const b = fn.indexOf(BLOK_START);
    expect(manuel).toBeLessThan(b);
    expect(b).toBeLessThan(v2);
  });

  it("dom 2: blokkens betingelser", () => {
    const blok = blokken(fn);
    expect(dom2Betingelser(blok)).toEqual([]);
    // Selvbevis
    expect(dom2Betingelser(blok.replace("IF NOT (_mapped ? _k) THEN", "IF true THEN"))).toContain("formularens tal skal vinde");
    expect(dom2Betingelser(blok.replace("WHERE kn.dansk_noegle IS NULL", "WHERE true"))).toContain("kun nøgler uden dansk_noegle");
    expect(dom2Betingelser(blok.replace("END IF;\n      END LOOP;", "_has_any := true;\n        END IF;\n      END LOOP;"))).toContain(
      "blokken må ikke sætte _has_any (en rettelse uden formulartal er stadig ikke-mappable)",
    );
    expect(dom2Betingelser(blok.split("_r.normalized_data").join("_r.manual_normalized_data")).length).toBeGreaterThan(0);
  });

  it("dom 3: filhovedet, vagten og EFTER-md5", () => {
    const nyMd5 = md5(fn);
    expect(dom3Hoved(mig, nyMd5)).toEqual([]);
    expect(dom3Hoved(mig.split(PROD_MD5).join("0".repeat(32)), nyMd5)).toContain("FØR-vagten på prod-md5 mangler");
    expect(dom3Hoved(mig, md5(fixture))).toContain("EFTER-md5 i filhovedet er ikke den nye funktions");
    expect(dom3Hoved(mig.replace("-- IKKE KØRT.", "-- KØRT."), nyMd5)).toContain("første linje");
  });

  it("migrationsnavnet er unikt i mappen", () => {
    const filer = readdirSync(resolve(process.cwd(), "supabase/migrations")).filter((f) => f.startsWith("20261003221500"));
    expect(filer).toEqual(["20261003221500_manuel_rettelse_bevarer_noegler.sql"]);
  });
});

describe("manuel rettelse bevarer nøgler — seeden og formularen", () => {
  it("ingen nøgle, formularen KAN sende, regnes som uudtrykkelig (formularens map ∩ seedens NULL-nøgler = ∅)", () => {
    const helpers = laes("src/lib/reportOverrideHelpers.ts");
    const start = helpers.indexOf("export const CANONICAL_TO_DANISH");
    const blok = helpers.slice(start, helpers.indexOf("};", start));
    const formular = [...blok.matchAll(/^\s+([a-z_]+): "([a-z_]+)",/gm)].map((m) => m[1]);
    expect(formular.length).toBeGreaterThanOrEqual(15);
    const seed = readdirSync(resolve(process.cwd(), "supabase/migrations"))
      .filter((f) => f.includes("kanoniske_noegler") && f.endsWith(".sql"))
      .map((f) => laes(`supabase/migrations/${f}`))
      .join("\n");
    const udenNavn = [...seed.matchAll(/\(\s*'([a-z_]+)',\s*NULL,\s*'[a-z]+',\s*'(?:[^']|'')*',\s*ARRAY\[\]::text\[\]\)/g)].map((m) => m[1]);
    expect(udenNavn, "parseren fandt for få nøgler uden dansk navn").toEqual(expect.arrayContaining(["vehicle_costs", "financial_costs", "payroll_related"]));
    expect(formular.filter((n) => udenNavn.includes(n))).toEqual([]);
  });
});

describe("manuel rettelse bevarer nøgler — datafilen (genskabelsen)", () => {
  const data = laes(DATAFIL);

  it("dom 4: samme regel som blokken, vagter i UPDATE og tilbagerulning, intet slettes", () => {
    expect(dom4Datafil(data)).toEqual([]);
    // Selvbevis
    expect(dom4Datafil(data.replace("  AND f.metrics = s.metrics_foer\n", "\n"))).toContain("UPDATE'en er ikke guardet på snapshottet");
    expect(dom4Datafil(data.replace(/AND NOT \(f\.metrics \? e\.key\)/, "AND true"))).toContain("tabt-CTE: kun nøgler, facts mangler");
    expect(dom4Datafil(data.replace("--   AND f.metrics = s.metrics_foer || s.tilfoejet;", "-- ;"))).toContain("tilbagerulningen er ikke guardet");
    expect(dom4Datafil(data + "\nDELETE FROM public.financial_report_facts;\n")).toContain("datafilen må ikke slette");
  });

  it("datafilen ligger IKKE i migrationsmappen (den må ikke køres som migration)", () => {
    const filer = readdirSync(resolve(process.cwd(), "supabase/migrations"));
    expect(filer.some((f) => f.includes("genskab_manuelle"))).toBe(false);
  });
});
