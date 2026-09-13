import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Driftværn (7/9, vendt 13/9 med kort 40): KPI-mål flettes ÉT sted — fletKpiMaal
// i src/lib/kpiMaal.ts — og der FINDES INTET FALLBACK-MÅL. Før flettede
// useKpiTargets og useVirksomhed hver sin kopi «ordret som den anden»: da
// oprindelsen (kilde) kom til, fik den ene flade mærket og den anden ikke.
// To fletninger driver fra hinanden; én kan ikke. Fra 7/9 låste værnet at
// KPI_FALLBACK_TARGETS (appConfig.ts) kun blev læst i kpiMaal.ts. 11/9
// besluttede Jonas at fjerne fallbacken helt: et mål er noget der er AFTALT;
// husets seks tal var ikke aftalt med nogen og dømte engros som «under» og
// konsulent som «rammer». Værnet låser nu at konstanten ikke kommer tilbage —
// hverken i appConfig.ts, kpiMaal.ts eller nogen anden kildefil under src/ —
// og at kpiMaal.ts ikke importerer noget fra appConfig.
// Kildelæsning (fornyelseSkrivevej.guard-mønstret): kommentarer strippes
// FØR målingen, så en forklarende omtale (historik) ikke tæller som brug.
// Samme værn låser at typen ResolvedTargets hentes fra lib/kpiMaal, ikke
// via hooken — typen bor hos den rene funktion.

const ROD = resolve(process.cwd(), "src");
const DEN_ENE_FLETNING = "src/lib/kpiMaal.ts";
const DEN_GAMLE_DEFINITION = "src/lib/appConfig.ts";
const DE_TO_HENTNINGER = ["src/hooks/useKpiTargets.ts", "src/hooks/useVirksomhed.ts"];
const FALLBACKEN = "KPI_FALLBACK_TARGETS";

function alleKildefiler(mappe: string): string[] {
  return readdirSync(mappe).flatMap((navn) => {
    const sti = join(mappe, navn);
    if (statSync(sti).isDirectory()) return navn === "__tests__" || navn === "node_modules" ? [] : alleKildefiler(sti);
    return /\.(ts|tsx)$/.test(navn) && !/\.test\.tsx?$/.test(navn) ? [sti] : [];
  });
}

/** Blok- og linjekommentarer væk — kun kode måles. */
function udenKommentarer(kilde: string): string {
  return kilde.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const filer = alleKildefiler(ROD).map((sti) => relative(process.cwd(), sti));
const laes = (fil: string) => readFileSync(resolve(process.cwd(), fil), "utf8");

describe("KPI-mål flettes ét sted, og der findes intet fallback-mål (kort 40)", () => {
  it("værnet ser kildefilerne (ikke et tomt træ)", () => {
    expect(filer.length).toBeGreaterThan(100);
    expect(filer).toContain(DEN_ENE_FLETNING);
    expect(filer).toContain(DEN_GAMLE_DEFINITION);
    for (const h of DE_TO_HENTNINGER) expect(filer).toContain(h);
  });

  it(`${DEN_ENE_FLETNING}: eksporterer fletKpiMaal og importerer intet fra appConfig`, () => {
    const kode = udenKommentarer(laes(DEN_ENE_FLETNING));
    expect(kode).toContain("export function fletKpiMaal(");
    expect(kode, "fallbacken boede i appConfig — fletningen må ikke hente noget derfra").not.toMatch(/from "@\/lib\/appConfig"/);
  });

  it(`${DEN_GAMLE_DEFINITION}: definerer ikke længere ${FALLBACKEN}`, () => {
    expect(udenKommentarer(laes(DEN_GAMLE_DEFINITION))).not.toContain(FALLBACKEN);
  });

  for (const h of DE_TO_HENTNINGER) {
    it(`${h}: fletter gennem fletKpiMaal — ikke sin egen kopi`, () => {
      const kode = udenKommentarer(laes(h));
      expect(kode).toContain("fletKpiMaal(");
      expect(kode, "typen ResolvedTargets hentes fra lib/kpiMaal, ikke via hooken").not.toMatch(/import type \{ ResolvedTargets \} from "@\/hooks\/useKpiTargets"/);
    });
  }

  it(`ingen kildefil under src/ nævner ${FALLBACKEN} i kode — fallbacken kommer ikke tilbage`, () => {
    const brud = filer
      .map((fil) => ({ fil, linjer: udenKommentarer(laes(fil)).split("\n").map((l, i) => ({ nr: i + 1, l })).filter(({ l }) => l.includes(FALLBACKEN)) }))
      .filter(({ linjer }) => linjer.length > 0);
    expect(brud, `${FALLBACKEN} i kode:\n${JSON.stringify(brud, null, 2)}`).toEqual([]);
  });
});
