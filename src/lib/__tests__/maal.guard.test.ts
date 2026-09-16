import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Kildeværn for «Én plan» fase 1 (16/9-2026). Fire ting låses:
//   1. Migrationen: maal_id uuid → milestones ON DELETE SET NULL, det
//      partielle indeks, milestones.completed_at, triggeren — og INGEN
//      politik (RLS er fase 2 og kræver grønt lys).
//   2. maal_id skrives KUN af de planlagte skrivere: i dag foreslaa-opgave
//      (insert). Ingen anden fil i supabase/functions eller src skriver
//      `maal_id:` i en insert/update. opgave-luk LÆSER den (select) og
//      skriver den aldrig.
//   3. Fremdriften regnes KUN af motoren: opgave-luk's eneste skrivning til
//      milestones er `.update({ progress: ny })` hvor `ny` kommer fra
//      `maalFremdrift(`; ingen ny fil regner `done /` selv; opgave-luk
//      rører aldrig milestones.status.
//   4. Pariteten: maalParitet.test.ts findes og sammenligner både funktioner
//      og kildetekst (selve pariteten kører i den test).
// Kildelæsning (forsidenKaster.guard-mønstret) med selvbevis på kopier.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");

const MIGRATION = "supabase/migrations/20260917140000_maal_og_skridt.sql";
const LUK = "supabase/functions/opgave-luk/index.ts";
const FORESLAA = "supabase/functions/foreslaa-opgave/index.ts";
const MOTOR_DENO = "supabase/functions/_shared/maal.ts";
const MOTOR_SRC = "src/lib/hjemmebane/maal.ts";
const PARITET = "src/lib/__tests__/maalParitet.test.ts";

/** Alle .ts/.tsx under en rod (uden node_modules), relative stier. */
function alleFiler(rod: string): string[] {
  const ud: string[] = [];
  const gaa = (dir: string) => {
    for (const navn of readdirSync(dir)) {
      if (navn === "node_modules" || navn.startsWith(".")) continue;
      const sti = join(dir, navn);
      if (statSync(sti).isDirectory()) gaa(sti);
      else if (/\.tsx?$/.test(navn)) ud.push(sti);
    }
  };
  gaa(resolve(process.cwd(), rod));
  return ud.map((s) => s.slice(resolve(process.cwd()).length + 1));
}

/** Dom 1: migrationen. */
export const migrationenHolder = (sql: string): boolean =>
  /add column if not exists maal_id uuid references public\.milestones\(id\) on delete set null;/.test(sql) &&
  /create index if not exists idx_company_actions_maal\s+on public\.company_actions \(maal_id\) where maal_id is not null;/.test(sql) &&
  /alter table public\.milestones\s+add column if not exists completed_at timestamptz;/.test(sql) &&
  /create trigger milestone_completed_at\s+before update on public\.milestones/.test(sql) &&
  /language plpgsql set search_path = public;/.test(sql) &&
  !/security definer/i.test(sql) &&
  !/create policy|drop policy|alter policy/i.test(sql) &&
  !/on delete cascade/.test(sql);

/** Dom 2: hvem skriver maal_id. Skrivning = `maal_id:` som nøgle i et objekt
    (insert/update) med en VÆRDI — ikke en typeerklæring (`maal_id: string | null`
    i types.ts eller et interface). */
export const skriverAfMaalId = (kode: string): boolean => /^\s*maal_id\??:\s(?!string\b|number\b|null\b\s*$)/m.test(kode);

/** Dom 3: opgave-luk regner ikke selv og rører ikke status. */
export const lukHolder = (kode: string): boolean => {
  const fremdrift = kode.slice(kode.indexOf("async function rykMaalFremdrift("));
  return fremdrift.length > 0 &&
    kode.includes('import { maalFremdrift, TAELLENDE_SKRIDT } from "../_shared/maal.ts";') &&
    kode.includes("select(`${OPGAVE_KOLONNER}, maal_id`)") &&
    /const ny = maalFremdrift\(\(skridt \?\? \[\]\) as \{ status: string \}\[\], nuvaerende\);/.test(fremdrift) &&
    /\.from\("milestones"\)\s*\.update\(\{ progress: ny \}\)/.test(fremdrift) &&
    (fremdrift.match(/\.update\(/g) ?? []).length === 1 &&
    !/status:/.test(fremdrift.slice(fremdrift.indexOf(".update("))) &&
    !/[/]\s*\(|Math\.round\(/.test(fremdrift) &&
    !skriverAfMaalId(kode);
};

/** Dom 2 for foreslaa-opgave: værnet (opslaget på milestones med id OG
    company_id, og kravet om aktivt mål) står FØR insert'en med maal_id. */
export const foreslaaHolder = (kode: string): boolean => {
  const fra = kode.indexOf('.from("milestones")');
  if (fra === -1) return false;
  const opslag = kode.slice(fra, kode.indexOf(".maybeSingle()", fra));
  return opslag.includes('.eq("id", oensketMaalId)') &&
    opslag.includes('.eq("company_id", companyId)') &&
    fra < kode.indexOf("maal_id: oensketMaalId,") &&
    /status !== "active"/.test(kode.slice(fra)) &&
    (kode.match(/^\s*maal_id:\s/gm) ?? []).length === 1;
};

describe("maal.guard — fase 1: maal_id, fremdrift og paritet", () => {
  it("dom 1: migrationen er additiv — FK ON DELETE SET NULL, partielt indeks, completed_at + trigger, ingen politik, ingen DEFINER", () => {
    expect(migrationenHolder(udenSqlKommentarer(laes(MIGRATION)))).toBe(true);
  });
  it("dom 2: maal_id skrives kun af foreslaa-opgave — ingen anden fil under supabase/functions eller src", () => {
    const skrivere = [...alleFiler("supabase/functions"), ...alleFiler("src")]
      .filter((f) => !f.includes("__tests__") && !f.endsWith(".test.ts"))
      .filter((f) => skriverAfMaalId(udenKommentarer(laes(f))));
    expect(skrivere).toEqual([FORESLAA]);
    expect(foreslaaHolder(udenKommentarer(laes(FORESLAA)))).toBe(true);
  });
  it("dom 3: opgave-luk læser maal_id, lader motoren regne og skriver kun progress", () => {
    expect(lukHolder(udenKommentarer(laes(LUK)))).toBe(true);
  });
  it("dom 4: pariteten findes og låser både funktioner og kildetekst; motoren har ingen imports", () => {
    const p = laes(PARITET);
    expect(p).toContain('krop("supabase/functions/_shared/maal.ts")');
    expect(p).toContain('krop("src/lib/hjemmebane/maal.ts")');
    expect(p).toContain("web.maalFremdrift(skridt, n)).toBe(deno.maalFremdrift(skridt, n))");
    for (const m of [MOTOR_DENO, MOTOR_SRC]) expect(udenKommentarer(laes(m)).match(/^import /gm) ?? []).toHaveLength(0);
  });

  // Selvbevis: dommene falder på kopier med fejlen sat ind.
  it("selvbevis 1: CASCADE, en politik eller DEFINER i migrationen falder", () => {
    const sql = udenSqlKommentarer(laes(MIGRATION));
    expect(migrationenHolder(sql.replace("on delete set null", "on delete cascade"))).toBe(false);
    expect(migrationenHolder(sql + "\ncreate policy x on public.milestones for update using (true);")).toBe(false);
    expect(migrationenHolder(sql.replace("language plpgsql set search_path = public;", "language plpgsql security definer set search_path = public;"))).toBe(false);
  });
  it("selvbevis 2: en anden fil der skriver maal_id, eller foreslaa-opgave uden company-værn, falder", () => {
    expect(skriverAfMaalId('await c.from("company_actions").update({\n  maal_id: id,\n})')).toBe(true);
    expect(skriverAfMaalId('.select("id, maal_id")')).toBe(false);
    expect(skriverAfMaalId("          maal_id: string | null\n")).toBe(false);
    expect(skriverAfMaalId("          maal_id?: string | null\n")).toBe(false);
    expect(skriverAfMaalId("  maal_id: oensketMaalId,\n")).toBe(true);
    const f = udenKommentarer(laes(FORESLAA));
    expect(foreslaaHolder(f.replace('.eq("company_id", companyId)\n      .maybeSingle();', ".maybeSingle();"))).toBe(false);
    expect(foreslaaHolder(f.replace('status !== "active"', 'status === "parked"'))).toBe(false);
  });
  it("selvbevis 3: opgave-luk der regner selv, skriver status eller skriver maal_id falder", () => {
    const luk = udenKommentarer(laes(LUK));
    expect(lukHolder(luk.replace("const ny = maalFremdrift((skridt ?? []) as { status: string }[], nuvaerende);", "const ny = Math.round((100 * gjort) / (skridt ?? []).length);"))).toBe(false);
    expect(lukHolder(luk.replace(".update({ progress: ny })", '.update({ progress: ny, status: "completed" })'))).toBe(false);
    expect(lukHolder(luk.replace(".update({ progress: ny })", ".update({ progress: ny, maal_id: null })"))).toBe(false);
    expect(lukHolder(luk.replace("select(`${OPGAVE_KOLONNER}, maal_id`)", "select(OPGAVE_KOLONNER)"))).toBe(false);
  });
});
