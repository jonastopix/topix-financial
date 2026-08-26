/**
 * Kildeværn: alle skrivere til financial_report_facts skal sætte data_basis
 * EKSPLICIT ('measured' | 'estimated'). Kolonnens default ('measured') findes
 * for at beskytte prod mod en OVERSET skriver — den er ikke den normale vej.
 * Skelnen (source_type = HVEM skrev; data_basis = HVAD rækken er) er
 * dokumenteret i docs/data-basis-kontrakt.md og migration 20260826120000.
 *
 * To lag:
 *  1) TypeScript (edge functions + frontend): en fil der kalder
 *     .insert(...)/.upsert(...) i kæde med .from("financial_report_facts")
 *     skal nævne data_basis. Fil-niveau-check: rækkeobjekterne bygges typisk
 *     i en variabel før kaldet, så et udtryks-niveau-check ville give falske
 *     alarmer. Præcist nok: en skriver-fil uden data_basis fejler.
 *  2) SQL-migrationer fra og med 20260826120000 (kolonnens fødsel): hvert
 *     INSERT INTO financial_report_facts skal have data_basis i kolonnelisten.
 *     Ældre migrationer er historik fra før kolonnen og fritages — de må
 *     alligevel aldrig redigeres.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DATA_BASIS_MIGRATION = "20260826120000";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "_test_fixtures") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Er filen en TS-skriver mod facts-tabellen? Kig i et vindue efter hver
    forekomst af tabelnavnet — kædekald som `.from("financial_report_facts")
    .insert(rows)` (evt. med `as any`-casts imellem) fanges her. */
function isFactsWriter(content: string): boolean {
  const needle = "financial_report_facts";
  let idx = content.indexOf(needle);
  while (idx !== -1) {
    const window = content.slice(idx, idx + 250);
    if (/\.\s*(insert|upsert)\s*\(/.test(window)) return true;
    idx = content.indexOf(needle, idx + needle.length);
  }
  return false;
}

/** Fjern //- og /* *\/-kommentarer, så et data_basis-omtalende kommentarspor
    aldrig kan tilfredsstille værnet — kun rigtig kode tæller. Bevidst simpel
    (rører ikke strenge), rigeligt til dette check. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Sætter koden data_basis som objektnøgle? (`data_basis: ...` eller
    `"data_basis": ...`) — omtale i tekst er ikke nok. */
function setsDataBasis(content: string): boolean {
  return /["']?\bdata_basis\b["']?\s*:/.test(stripComments(content));
}

describe("data_basis-kildeværn for financial_report_facts", () => {
  it("hver TypeScript-skriver (edge functions + src) sætter data_basis eksplicit", () => {
    const files = [
      ...walk(join(ROOT, "supabase", "functions")),
      ...walk(join(ROOT, "src")),
    ].filter(
      (f) =>
        (f.endsWith(".ts") || f.endsWith(".tsx")) &&
        !/[._]test\.tsx?$/.test(f) &&
        !f.includes(join("src", "test")),
    );

    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      if (isFactsWriter(content) && !setsDataBasis(content)) {
        offenders.push(relative(ROOT, file));
      }
    }

    expect(
      offenders,
      `Disse filer skriver til financial_report_facts uden at sætte data_basis eksplicit ` +
        `('measured' | 'estimated'). Default'en er et værn, ikke en skrivevej: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("hvert SQL-INSERT i migrationer ≥ kolonnens fødsel har data_basis i kolonnelisten", () => {
    const migrations = walk(join(ROOT, "supabase", "migrations")).filter((f) => {
      if (!f.endsWith(".sql")) return false;
      const stamp = relative(ROOT, f).match(/(\d{14})_/)?.[1];
      return stamp != null && stamp >= DATA_BASIS_MIGRATION;
    });

    // Sanity: selve fødsels-migrationen skal være i spil, ellers checker vi ingenting.
    expect(
      migrations.some((f) => f.includes(DATA_BASIS_MIGRATION)),
      `Migration ${DATA_BASIS_MIGRATION}_data_basis_paa_facts.sql mangler`,
    ).toBe(true);

    const offenders: string[] = [];
    for (const file of migrations) {
      const content = readFileSync(file, "utf8");
      const inserts = content.matchAll(
        /INSERT\s+INTO\s+(?:public\.)?financial_report_facts\s*\(([^)]*)\)/gi,
      );
      for (const m of inserts) {
        if (!/\bdata_basis\b/.test(m[1])) {
          offenders.push(`${relative(ROOT, file)}: INSERT uden data_basis`);
        }
      }
    }

    expect(
      offenders,
      `SQL-inserts i financial_report_facts skal sætte data_basis eksplicit: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
