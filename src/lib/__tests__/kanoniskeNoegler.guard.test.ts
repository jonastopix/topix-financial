import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
// reportOverrideHelpers importeres IKKE som modul: den trækker Supabase-klienten ind, hvis auth-refresh i jsdom
// giver en «Unhandled Rejection» (storage.getItem) og lader hele suiten ende med exit 1 trods grønne tests.
// Kildelæsende i stedet — som de øvrige værn.

// ÉN fælles liste over kanoniske nøgler (17/9-2026, Jonas: valg B): koden (canonicalTypes.CanonicalMetrics)
// og databasen (public.kanoniske_noegler, seedet i migrationen) SKAL kende de samme nøgler — ellers
// falder tal bort i stilhed ved commit, som vehicle_costs, financial_costs, payroll_related,
// other_staff_costs og extraordinary_items gjorde i 19-nøgle-listen (recon-resultat-alle-skabeloner.md).
// Værnet læser begge kilder og fejler ved en nøgle den ene har og den anden ikke. SELVBEVIS: hver
// parser tjekker først at den fandt noget.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
/** SQL uden «-- …»-kommentarer — filhovedet nævner de gamle mønstre med ord, og det må værnet ikke falde for. */
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");
const MIGRATION = "supabase/migrations/20260918170000_kanoniske_noegler_faelles_liste.sql";
/** Senere migrationer der FØJER nøgler til listen (A2, 18/9-2026: financial_income) — alle filer med «kanoniske_noegler» i navnet. */
const SEED_MIGRATIONER = (): string[] =>
  readdirSync(resolve(process.cwd(), "supabase/migrations")).filter((f) => f.includes("kanoniske_noegler") && f.endsWith(".sql")).sort().map((f) => `supabase/migrations/${f}`);

/** De to AFLEDTE procenter regnes af læserne af de gemte tal og er ALDRIG committet — bevidst uden for listen. */
const AFLEDTE_PROCENTER = new Set(["gross_margin_pct", "equity_ratio_pct"]);

function noeglerITypen(): string[] {
  const k = laes("supabase/functions/_shared/canonicalTypes.ts");
  const start = k.indexOf("export interface CanonicalMetrics {");
  expect(start, "CanonicalMetrics findes ikke").toBeGreaterThan(-1);
  const krop = k.slice(start, k.indexOf("\n}", start));
  const noegler = [...krop.matchAll(/^\s+([a-z_]+): number \| null;/gm)].map((m) => m[1]);
  expect(noegler.length, "typen har for få nøgler — parseren ramte ved siden af").toBeGreaterThanOrEqual(30);
  return noegler;
}

interface SeedRaekke { noegle: string; dansk: string | null; gruppe: string; label: string; aliaser: string[] }

function seedIMigrationen(): SeedRaekke[] {
  const filer = SEED_MIGRATIONER();
  expect(filer, "grundmigrationen mangler i listen").toContain(MIGRATION);
  const raekker: SeedRaekke[] = [];
  for (const fil of filer) raekker.push(...seedIFilen(laes(fil)));
  expect(raekker.length, "seeden har for få rækker — parseren ramte ved siden af").toBeGreaterThanOrEqual(30);
  return raekker;
}

function seedIFilen(k: string): SeedRaekke[] {
  const start = k.indexOf("INSERT INTO public.kanoniske_noegler");
  expect(start, "seeden findes ikke").toBeGreaterThan(-1);
  const blok = k.slice(start, k.indexOf("ON CONFLICT", start));
  const raekker = [...blok.matchAll(/\(\s*'([a-z_]+)',\s*(NULL|'[a-z_]+'),\s*'([a-z]+)',\s*'((?:[^']|'')*)',\s*ARRAY\[([^\]]*)\]::text\[\]\)/g)].map((m) => ({
    noegle: m[1],
    dansk: m[2] === "NULL" ? null : m[2].slice(1, -1),
    gruppe: m[3],
    label: m[4].replace(/''/g, "'"),
    aliaser: [...m[5].matchAll(/'([a-z_]+)'/g)].map((a) => a[1]),
  }));
  expect(raekker.length, "filen har ingen seed-rækker — parseren ramte ved siden af").toBeGreaterThanOrEqual(1);
  return raekker;
}

describe("kanoniske_noegler — koden og databasen kender de samme nøgler", () => {
  it("hver nøgle i CanonicalMetrics (undtagen de to afledte procenter) står i seeden — og omvendt", () => {
    const typen = new Set(noeglerITypen().filter((n) => !AFLEDTE_PROCENTER.has(n)));
    const seed = new Set(seedIMigrationen().map((r) => r.noegle));
    const kunIKoden = [...typen].filter((n) => !seed.has(n));
    const kunISeeden = [...seed].filter((n) => !typen.has(n));
    expect(kunIKoden, "koden kender nøgler seeden ikke har — de ville falde bort ved commit").toEqual([]);
    expect(kunISeeden, "seeden har nøgler koden ikke kender").toEqual([]);
    // Undtagelsen er selvudløbende: står nøglen i typen, er undtagelsen død og SKAL fjernes.
    // A (18/9-2026) landede: financial_income står nu i typen — undtagelsen KOMMER_MED_A er slettet, som den bad om.
    expect(typen.has("financial_income")).toBe(true);
    // De to procenter er BEVIDST udeladt — og de findes faktisk i typen (ellers er undtagelsen død).
    for (const p of AFLEDTE_PROCENTER) expect(noeglerITypen()).toContain(p);
    expect(seed.has("gross_margin_pct")).toBe(false);
    // Den gamle listes 'trade_payables' er ude — ingen kode skriver den.
    expect(seed.has("trade_payables")).toBe(false);
  });

  it("de fem nøgler der før faldt bort i stilhed er med", () => {
    const seed = new Set(seedIMigrationen().map((r) => r.noegle));
    for (const n of ["vehicle_costs", "financial_costs", "payroll_related", "other_staff_costs", "extraordinary_items", "other_costs", "other_operating_income"]) {
      expect(seed.has(n), n).toBe(true);
    }
  });

  it("gruppe er en af de fire, label er udfyldt, dansk_noegle er unik", () => {
    const seed = seedIMigrationen();
    for (const r of seed) {
      expect(["resultat", "omkostning", "indtaegt", "balance"]).toContain(r.gruppe);
      expect(r.label.length).toBeGreaterThan(1);
    }
    const danske = seed.map((r) => r.dansk).filter((d): d is string => d !== null);
    expect(new Set(danske).size).toBe(danske.length);
  });

  it("migrationen bærer ingen fast nøgleliste og ingen fast CASE længere — opslagene går i tabellen", () => {
    const k = udenSqlKommentarer(laes(MIGRATION));
    expect(k).not.toMatch(/IN \('revenue','gross_profit'/);
    expect(k).not.toMatch(/CASE _k\b/);
    expect(k.match(/EXISTS \(SELECT 1 FROM public\.kanoniske_noegler kn WHERE kn\.noegle = _k\)/g)?.length, "V2 og V1 skal begge slå op").toBe(2);
    expect(k).toMatch(/WHERE kn\.dansk_noegle = _k OR _k = ANY\(kn\.danske_aliaser\)/);
    expect(k).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(k).toMatch(/FOR SELECT\s+TO authenticated/);
    expect(k).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
  });
});

describe("kanoniske_noegler — de danske nøgler er de samme som adapterens og formularens", () => {
  function adapterensDanske(): Record<string, string> {
    const k = laes("src/lib/factsAdapter.ts");
    const start = k.indexOf("const CANONICAL_TO_DANISH");
    expect(start).toBeGreaterThan(-1);
    const blok = k.slice(start, k.indexOf("};", start));
    const par = [...blok.matchAll(/^\s+([a-z_]+): "([a-z_]+)",/gm)].map((m) => [m[1], m[2]] as const);
    expect(par.length).toBeGreaterThanOrEqual(15);
    return Object.fromEntries(par);
  }

  it("factsAdapter.CANONICAL_TO_DANISH = seedens (noegle → dansk_noegle), bortset fra årsrapportens `equity`-alias", () => {
    const adapter = adapterensDanske();
    // `equity` er årsrapportens rå nøgle (extract-annual-report), ikke en canonical nøgle — den er en adapter-undtagelse, ikke en listenøgle.
    expect(adapter.equity, "adapterens equity-undtagelse er væk — så skal denne linje væk").toBe("egenkapital");
    delete adapter.equity;
    const seedDansk = Object.fromEntries(seedIMigrationen().filter((r) => r.dansk !== null).map((r) => [r.noegle, r.dansk as string]));
    expect(adapter).toEqual(seedDansk);
  });

  it("reportOverrideHelpers.CANONICAL_TO_DANISH ⊆ seedens danske nøgler (formularen må ikke kende et dansk navn databasen ikke mapper)", () => {
    const k = laes("src/lib/reportOverrideHelpers.ts");
    const start = k.indexOf("export const CANONICAL_TO_DANISH");
    expect(start, "CANONICAL_TO_DANISH findes ikke i reportOverrideHelpers").toBeGreaterThan(-1);
    const blok = k.slice(start, k.indexOf("};", start));
    const formular = [...blok.matchAll(/^\s+([a-z_]+): "([a-z_]+)",/gm)].map((m) => [m[1], m[2]] as const);
    expect(formular.length, "formularens map har for få par — parseren ramte ved siden af").toBeGreaterThanOrEqual(15);
    const seedDansk = Object.fromEntries(seedIMigrationen().filter((r) => r.dansk !== null).map((r) => [r.noegle, r.dansk as string]));
    for (const [en, da] of formular) {
      expect(seedDansk[en], `${en} → ${da}`).toBe(da);
    }
  });

  it("den gamle CASE's aliaser (bruttofortjeneste, likvider, resultat_foer_afskrivninger) lever videre som danske_aliaser", () => {
    const seed = seedIMigrationen();
    const alias = (a: string) => seed.find((r) => r.aliaser.includes(a))?.noegle;
    expect(alias("bruttofortjeneste")).toBe("gross_profit");
    expect(alias("likvider")).toBe("cash");
    expect(alias("resultat_foer_afskrivninger")).toBe("ebitda");
    // Et alias må aldrig også være en dansk_noegle (så ville opslaget være tvetydigt).
    const danske = new Set(seed.map((r) => r.dansk));
    for (const r of seed) for (const a of r.aliaser) expect(danske.has(a), a).toBe(false);
  });
});

describe("kanoniske_noegler — INGEN skabelon må udstede en kanonisk nøgle databasen ikke kender", () => {
  // Det var netop hullet: skabelonerne læste vehicle_costs, financial_costs, payroll_related, other_staff_costs
  // og extraordinary_items (feltkort → source_field_id → SEMANTIC_TO_CANONICAL / KF_TO_CANONICAL), men
  // resolverens liste kendte dem ikke — tallene forsvandt i stilhed ved commit. Værnet samler HVER kanonisk
  // nøgle nogen skabelon eller motor-map kan udstede, og kræver at den står i seeden.

  /** Værdierne i et `const NAVN: Record<string, keyof CanonicalMetrics> = { a: "x", ... };`-map. */
  function mapVaerdier(kilde: string, navn: string): string[] {
    const start = kilde.indexOf(`const ${navn}`);
    expect(start, `${navn} findes ikke`).toBeGreaterThan(-1);
    const blok = kilde.slice(start, kilde.indexOf("\n};", start));
    // Nøglerne til venstre er danske (små) eller line_item-klasser (STORE, fx FIN_EXPENSE) — værdien er altid canonical.
    const v = [...blok.matchAll(/^\s+[A-Za-z_]+:\s*"([a-z_]+)",/gm)].map((m) => m[1]);
    expect(v.length, `${navn} gav for få værdier — parseren ramte ved siden af`).toBeGreaterThanOrEqual(5);
    return v;
  }

  function udstedteNoegler(): { noegle: string; kilde: string }[] {
    const ud: { noegle: string; kilde: string }[] = [];
    const motor = laes("supabase/functions/_shared/canonicalEngine.ts");
    for (const navn of ["KF_TO_CANONICAL", "CLASS_TO_CANONICAL", "SEMANTIC_TO_CANONICAL"]) {
      for (const n of mapVaerdier(motor, navn)) ud.push({ noegle: n, kilde: `canonicalEngine.${navn}` });
    }
    // Skabelonernes egne hints/mål: canonical_hint / proposed_canonical_target / canonical_key: "x"
    const mappe = resolve(process.cwd(), "supabase/functions/_shared/templates");
    const filer = readdirSync(mappe).filter((f) => f.endsWith(".ts"));
    expect(filer.length, "ingen skabeloner fundet").toBeGreaterThanOrEqual(5);
    let hits = 0;
    for (const f of filer) {
      const k = readFileSync(resolve(mappe, f), "utf8");
      for (const m of k.matchAll(/(?:canonical_hint|proposed_canonical_target|canonical_key)\s*:\s*"([a-z_]+)"/g)) {
        ud.push({ noegle: m[1], kilde: `templates/${f}` });
        hits++;
      }
    }
    expect(hits, "ingen canonical_hint/proposed_canonical_target fundet i skabelonerne — parseren ramte ved siden af").toBeGreaterThanOrEqual(10);
    return ud;
  }

  it("hver kanonisk nøgle som motorens tre maps eller nogen skabelon kan udstede, står i seeden (de to afledte procenter undtaget)", () => {
    const seed = new Set(seedIMigrationen().map((r) => r.noegle));
    const udstedte = udstedteNoegler();
    // Selvbevis: de fem der før forsvandt ER blandt de udstedte — ellers måler værnet ikke det det skal.
    const alle = new Set(udstedte.map((u) => u.noegle));
    for (const n of ["vehicle_costs", "financial_costs", "payroll_related", "other_staff_costs", "extraordinary_items", "other_costs", "other_operating_income"]) {
      expect(alle.has(n), `${n} udstedes ikke af nogen skabelon/map — værnet ser ikke det det skal`).toBe(true);
    }
    const huller = udstedte.filter((u) => !seed.has(u.noegle) && !AFLEDTE_PROCENTER.has(u.noegle)).map((u) => `${u.noegle} (${u.kilde})`);
    expect(huller, "en skabelon udsteder en kanonisk nøgle databasen ikke kender — tallet ville falde bort ved commit").toEqual([]);
  });

  it("alt en skabelon udsteder er også en nøgle i CanonicalMetrics (ellers når det aldrig metrics)", () => {
    const typen = new Set(noeglerITypen());
    const huller = udstedteNoegler().filter((u) => !typen.has(u.noegle)).map((u) => `${u.noegle} (${u.kilde})`);
    expect(huller).toEqual([]);
  });
});
