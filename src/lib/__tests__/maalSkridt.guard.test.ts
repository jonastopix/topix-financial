import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for de to rettelser 1/10-2026 i «Dine mål» (Jonas):
//   1. «Når jeg har et skridt på et mål, og klikker gjort på et skridt, så
//      lukker målet.» — et mål bliver ALDRIG nået af sig selv, fordi alle
//      skridt er gjort. Dommen (milepaelDom) dømmer nået KUN på status =
//      'completed' (erMarkeretNaaet); opgave-luk skriver KUN progress, aldrig
//      status, og kalder aldrig skyderens skriveregel (statusEfterFremgang).
//   2. «Det er heller ikke smart, at et skridt kan have en deadline længere
//      ude i fremtiden end selve målet.» — skridt-tilfoej henter målets frist
//      og dømmer doemFristModMaal FØR insert (samme dom som formularen) —
//      og svarer dommens kode (rådets fund L1): 400 for efter_maalets_frist
//      og maalets_frist_passeret, 500 for maalets_frist_ulaeselig.
// Selvbevis på kopier: hver regel falder, når kilden ændres tilbage.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const OPGAVE_LUK = "supabase/functions/opgave-luk/index.ts";
const SKRIDT_TILFOEJ = "supabase/functions/skridt-tilfoej/index.ts";
const DOMMEN = ["src/lib/milepaelDom.ts", "supabase/functions/_shared/milepaelDom.ts"];

/** Dom 1: nået er KUN et menneskes klik. */
export const naaetKunVedKlik = (opgaveLuk: string, domme: string[]): boolean => {
  const luk = udenKommentarer(opgaveLuk);
  const milestoneSkriv = luk.slice(luk.indexOf("async function rykMaalFremdrift"));
  return (
    /\.from\("milestones"\)\s*\.update\(\{ progress: ny \}\)/.test(milestoneSkriv) &&
    !/status:\s*["']completed["']/.test(luk) &&
    !luk.includes("statusEfterFremgang") &&
    domme.every((d) => {
      const k = udenKommentarer(d);
      return k.includes("const faerdig = !parkeret && erMarkeretNaaet(input.status);") && k.includes('return status === "completed";') && !/progress\s*>=\s*100\s*\)/.test(k.slice(k.indexOf("export function afgoerMilepael"), k.indexOf("export function statusEfterFremgang")));
    })
  );
};

/** Dom 2: skridt-tilfoej dømmer skridtets frist mod målets FØR insert. */
export const fristModMaalHolder = (tilfoej: string): boolean => {
  const k = udenKommentarer(tilfoej);
  const dom = k.indexOf("doemFristModMaal(fristDom.dato,");
  const insert = k.indexOf(".insert(");
  return (
    /\.select\("id, status, deadline"\)/.test(k) &&
    dom > 0 && insert > dom &&
    /if \(!modMaal\.ok\) \{\s*if \(modMaal\.kode === "maalets_frist_ulaeselig"\) \{[\s\S]*?return jsonResponse\(\{ error: modMaal\.grund, grund: modMaal\.kode \}, 500\);\s*\}\s*return jsonResponse\(\{ error: modMaal\.grund, grund: modMaal\.kode \}, 400\);/.test(k)
  );
};

describe("mål og skridt (1/10-2026)", () => {
  const luk = laes(OPGAVE_LUK);
  const domme = DOMMEN.map(laes);
  const tilfoej = laes(SKRIDT_TILFOEJ);

  it("dom 1: nået er KUN status 'completed'; opgave-luk skriver kun progress", () => {
    expect(naaetKunVedKlik(luk, domme)).toBe(true);
  });
  it("selvbevis 1: den gamle dom (progress >= 100), eller en opgave-luk der skriver status, falder", () => {
    const gammel = domme.map((d) => d.replace("const faerdig = !parkeret && erMarkeretNaaet(input.status);", 'const faerdig = !parkeret && (input.status === "completed" || progress >= 100);'));
    expect(naaetKunVedKlik(luk, gammel)).toBe(false);
    expect(naaetKunVedKlik(luk.replace(".update({ progress: ny })", '.update({ progress: ny, status: ny >= 100 ? "completed" : "active" })'), domme)).toBe(false);
  });
  it("dom 2: skridt-tilfoej dømmer fristen mod målets før insert", () => {
    expect(fristModMaalHolder(tilfoej)).toBe(true);
  });
  it("selvbevis 2: uden målets frist i opslaget, eller uden dommen, falder", () => {
    expect(fristModMaalHolder(tilfoej.replace('.select("id, status, deadline")', '.select("id, status")'))).toBe(false);
    expect(fristModMaalHolder(tilfoej.replace("doemFristModMaal(fristDom.dato,", "ingenDom(fristDom.dato,"))).toBe(false);
    // L1: én fast grund for alle tre afvisninger (før rettelsen) falder.
    expect(fristModMaalHolder(tilfoej.replace("grund: modMaal.kode }, 400)", 'grund: "efter_maalets_frist" }, 400)'))).toBe(false);
    expect(fristModMaalHolder(tilfoej.replace("grund: modMaal.kode }, 500)", "grund: modMaal.kode }, 400)"))).toBe(false);
  });
});
