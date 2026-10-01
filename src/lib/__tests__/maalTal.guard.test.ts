/**
 * Kildeværn for «Dine mål»-motoren (1/10-2026, docs/dine-maal-design.md).
 * Fælder: (1) ordforrådet i motoren og CHECK'ene i migrationen glider fra
 * hinanden; (2) motoren bliver uren (React, Supabase, Date.now, new Date()
 * uden argument); (3) migrationens første linje er ikke husets «IKKE KØRT»;
 * (4) hentningen læser kolonner, typerne ikke kender; (5) motoren laver sin
 * egen omkostnings- eller tidszonelogik i stedet for husets.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MAAL_ARTER, MAAL_NOEGLER } from "@/lib/hjemmebane/maalTal";
import { MAAL_KOLONNER_NYE } from "@/hooks/dineMaalGrundlag";

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const MIGRATION = "supabase/migrations/20261001210000_maal_tal.sql";
const MOTOR = "src/lib/hjemmebane/maalTal.ts";

/** Kildeteksten uden kommentarer — værnene dømmer koden, ikke forklaringen. */
const udenKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function checkListe(sql: string, kolonne: string): string[] {
  const m = new RegExp(`CHECK \\(${kolonne} IN \\(([^)]*)\\)\\)`).exec(sql);
  if (!m) throw new Error(`CHECK for ${kolonne} ikke fundet`);
  return m[1].split(",").map((x) => x.trim().replace(/^'|'$/g, ""));
}

describe("maalTal.guard", () => {
  const sql = laes(MIGRATION);
  const krop = sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  it("dom 1: migrationens CHECK'e = MAAL_ARTER og MAAL_NOEGLER, ordret og i samme rækkefølge", () => {
    expect(checkListe(krop, "art")).toEqual([...MAAL_ARTER]);
    expect(checkListe(krop, "maal_noegle")).toEqual([...MAAL_NOEGLER]);
  });

  it("dom 2: migrationens første linje er husets «IKKE KØRT»-linje", () => {
    expect(sql.split("\n")[0]).toBe("-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).");
  });

  it("dom 3: migrationen er kun tilføjende — ingen policy, trigger, funktion, UPDATE eller DROP i kroppen", () => {
    expect(krop).not.toMatch(/\b(create|drop|alter)\s+policy\b/i);
    expect(krop).not.toMatch(/\bcreate\s+(or\s+replace\s+)?(trigger|function)\b/i);
    expect(krop).not.toMatch(/\bupdate\s+public\./i);
    expect(krop).not.toMatch(/\bdrop\b/i);
  });

  it("dom 4: motoren er ren — ingen React, Supabase, Date.now eller new Date() uden argument", () => {
    const kode = udenKommentarer(laes(MOTOR));
    expect(kode).not.toMatch(/from\s+["']react["']/);
    expect(kode).not.toMatch(/supabase/i);
    expect(kode).not.toMatch(/Date\.now/);
    expect(kode).not.toMatch(/new Date\(\s*\)/);
  });

  it("dom 5: motoren genbruger husets kilder — Score's søjler, omkostningsnøglerne og dansk tid", () => {
    const kode = udenKommentarer(laes(MOTOR));
    expect(kode).toMatch(/from "@\/lib\/boardroomScore"/);
    expect(kode).toMatch(/maalteAfsluttede\(/);
    expect(kode).toMatch(/aeldsteFriskeMaaned\(/);
    expect(kode).toMatch(/likviditet\(/);
    expect(kode).toMatch(/resultatAf\(/);
    expect(kode).toMatch(/CANONICAL\.daekningsbidrag/);
    expect(kode).toMatch(/from "@\/lib\/hverdage"/);
    // ingen egne nøglelister eller tidszone
    expect(kode).not.toMatch(/"gross_profit"|"revenue"|"cash"/);
    expect(kode).not.toMatch(/Europe\/Copenhagen|timeZone/);
  });

  it("dom 6: hentningens nye kolonner står i types.ts for milestones (Row)", () => {
    const typer = laes("src/integrations/supabase/types.ts");
    const blok = typer.slice(typer.indexOf("      milestones: {"), typer.indexOf("        Insert: {", typer.indexOf("      milestones: {")));
    for (const k of MAAL_KOLONNER_NYE.split(",").map((x) => x.trim())) expect(blok).toContain(`          ${k}:`);
  });

  it("dom 7: «nået» er aldrig motorens — maalTal skriver hverken status eller completed", () => {
    const kode = udenKommentarer(laes(MOTOR));
    expect(kode).not.toMatch(/status:\s*["']completed["']/);
    expect(laes("src/hooks/dineMaalGrundlag.ts")).not.toMatch(/status:\s*["']completed["']/);
  });
});
