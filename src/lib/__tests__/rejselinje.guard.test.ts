import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for anerkendelseslinjens fjerde del (udkast 28/9-2026). Tre
 * domme, hver bevist nedenfor på en kopi med fejlen indsat:
 *
 *   1. FLADEN REGNER IKKE SELV: BoardroomView bygger ikke linjen — ingen
 *      «Og rejsen kan ses», ingen parts.push, ingen refleksions-ord; journeyLine
 *      går gennem rejselinje(...) og giver refleksionerne ind fra forespørgslen.
 *   2. ANTALLET KOMMER FRA DATABASEN: forespørgslen tæller pulse_checkins for
 *      virksomheden med count/head og går gennem antalFraSvar — ingen .length
 *      på hentede rækker, ingen rækker over ledningen.
 *   3. HOOKEN FØR RETURN, OG FEJLEN SIGES: forespørgslen står før forsidens
 *      betingede return (React #310), og den er med i fejledeKilder — en fejl
 *      må ikke blive til en tavs linje uden refleksioner.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const FORSIDE = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const START = "const refleksionAntalQuery = useQuery({";

const antalBlok = (k: string): string => {
  const i = k.indexOf(START);
  if (i === -1) return "";
  const j = k.indexOf("});", i);
  return j === -1 ? "" : k.slice(i, j);
};

// ── 1 ──────────────────────────────────────────────────────────────────────
export const fladenRegnerIkkeSelv = (forside: string): boolean => {
  const f = udenKommentarer(forside);
  return (
    !f.includes("Og rejsen kan ses") &&
    !f.includes("parts.push") &&
    !/["'`]\s*\$?\{?[^"'`]*refleksion(er)?["'`]/.test(f.slice(f.indexOf("const journeyLine"), f.indexOf("const journeyLine") + 1500)) &&
    f.includes("return rejselinje({") &&
    f.includes("refleksioner: refleksionAntalQuery.data ?? 0,")
  );
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const antalletFraDatabasen = (forside: string): boolean => {
  const blok = antalBlok(udenKommentarer(forside));
  return (
    blok.includes('.from("pulse_checkins")') &&
    blok.includes('.select("id", { count: "exact", head: true })') &&
    blok.includes('.eq("company_id", companyId!)') &&
    blok.includes('return antalFraSvar("pulse_checkins", svar);') &&
    !blok.includes(".length")
  );
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const hookFoerReturnOgFejlSiges = (forside: string): boolean => {
  const f = udenKommentarer(forside);
  const hook = f.indexOf(START);
  const retur = f.indexOf("if (akademi.loading || factsLoading) {");
  const kilder = f.slice(f.indexOf("const fejledeKilder = ["), f.indexOf("const fejledeKilder = [") + 200);
  return hook !== -1 && retur !== -1 && hook < retur && kilder.includes("refleksionAntalQuery");
};

describe("anerkendelseslinjens fjerde del — kildeværn", () => {
  const forside = laes(FORSIDE);
  it("1. fladen regner ikke selv", () => expect(fladenRegnerIkkeSelv(forside)).toBe(true));
  it("2. antallet kommer fra databasen", () => expect(antalletFraDatabasen(forside)).toBe(true));
  it("3. hooken før return, og fejlen siges", () => expect(hookFoerReturnOgFejlSiges(forside)).toBe(true));
});

describe("anerkendelseslinjens fjerde del — værnet fælder (selvbevis på kopier)", () => {
  const forside = laes(FORSIDE);

  it("en linje bygget i fladen, et eget refleksions-ord, eller et tal fra et andet sted fælder dom 1", () => {
    expect(fladenRegnerIkkeSelv(forside.split("return rejselinje({").join("const parts: string[] = []; parts.push(\"x\"); return ({"))).toBe(false);
    expect(fladenRegnerIkkeSelv(forside.split("refleksioner: refleksionAntalQuery.data ?? 0,").join("refleksioner: 0,"))).toBe(false);
    expect(fladenRegnerIkkeSelv(forside.split("    return rejselinje({").join('    const ekstra = `${1} refleksioner`;\n    return rejselinje({'))).toBe(false);
  });

  it("rækker over ledningen, en optælling i fladen, en anden tabel eller uden antalFraSvar fælder dom 2", () => {
    expect(antalletFraDatabasen(forside.split('.select("id", { count: "exact", head: true })').join('.select("id")'))).toBe(false);
    expect(antalletFraDatabasen(forside.split('return antalFraSvar("pulse_checkins", svar);').join("return (svar.data ?? []).length;"))).toBe(false);
    const blok = forside.slice(forside.indexOf(START));
    const andenTabel = forside.slice(0, forside.indexOf(START)) + blok.replace('.from("pulse_checkins")', '.from("milestones")');
    expect(antalletFraDatabasen(andenTabel)).toBe(false);
  });

  it("en forespørgsel uden for fejledeKilder, eller efter return, fælder dom 3", () => {
    expect(hookFoerReturnOgFejlSiges(forside.split("pulseQuery, refleksionAntalQuery, leversQuery").join("pulseQuery, leversQuery"))).toBe(false);
    const uden = forside.split(START).join("const flyttet = useQuery({");
    expect(hookFoerReturnOgFejlSiges(uden)).toBe(false);
  });
});
