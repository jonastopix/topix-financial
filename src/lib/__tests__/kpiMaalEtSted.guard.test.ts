import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Driftværn (7/9): KPI-mål flettes ÉT sted — fletKpiMaal i src/lib/kpiMaal.ts,
// som er den eneste KODE der læser KPI_FALLBACK_TARGETS (appConfig.ts, hvor
// den er DEFINERET). Før flettede useKpiTargets og useVirksomhed hver sin
// kopi «ordret som den anden»: da oprindelsen (kilde «aftalt»/«standard»)
// kom til, fik den ene flade mærket og den anden ikke — rådgiverens
// virksomhedsside viste umarkerede standardtal, mens medlemmets nøgletal
// mærkede dem. To fletninger driver fra hinanden; én kan ikke.
// Kildelæsning (fornyelseSkrivevej.guard-mønstret): kommentarer strippes
// FØR målingen, så en forklarende omtale ikke tæller som brug.
// Samme værn låser at typen ResolvedTargets hentes fra lib/kpiMaal, ikke
// via hooken — typen bor hos den rene funktion.

const ROD = resolve(process.cwd(), "src");
const DEN_ENE_FLETNING = "src/lib/kpiMaal.ts";
const DEFINITIONEN = "src/lib/appConfig.ts";
const DE_TO_HENTNINGER = ["src/hooks/useKpiTargets.ts", "src/hooks/useVirksomhed.ts"];

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

describe("KPI-mål flettes ét sted — KPI_FALLBACK_TARGETS læses kun i lib/kpiMaal", () => {
  it("værnet ser kildefilerne (ikke et tomt træ)", () => {
    expect(filer.length).toBeGreaterThan(100);
    expect(filer).toContain(DEN_ENE_FLETNING);
    expect(filer).toContain(DEFINITIONEN);
    for (const h of DE_TO_HENTNINGER) expect(filer).toContain(h);
  });

  it(`${DEN_ENE_FLETNING}: læser KPI_FALLBACK_TARGETS i kode og eksporterer fletKpiMaal`, () => {
    const kode = udenKommentarer(laes(DEN_ENE_FLETNING));
    expect(kode).toContain("KPI_FALLBACK_TARGETS[");
    expect(kode).toContain("export function fletKpiMaal(");
  });

  for (const h of DE_TO_HENTNINGER) {
    it(`${h}: fletter gennem fletKpiMaal — ikke sin egen kopi`, () => {
      const kode = udenKommentarer(laes(h));
      expect(kode).toContain("fletKpiMaal(");
      expect(kode, "typen ResolvedTargets hentes fra lib/kpiMaal, ikke via hooken").not.toMatch(/import type \{ ResolvedTargets \} from "@\/hooks\/useKpiTargets"/);
    });
  }

  for (const fil of filer.filter((f) => f !== DEN_ENE_FLETNING && f !== DEFINITIONEN)) {
    const kode = udenKommentarer(laes(fil));
    if (!kode.includes("KPI_FALLBACK_TARGETS")) continue;
    it(`${fil}: rører ikke KPI_FALLBACK_TARGETS — fletningen bor i ${DEN_ENE_FLETNING}`, () => {
      const linjer = kode.split("\n").map((l, i) => ({ nr: i + 1, l })).filter(({ l }) => l.includes("KPI_FALLBACK_TARGETS"));
      expect(linjer, `KPI_FALLBACK_TARGETS uden om ${DEN_ENE_FLETNING}`).toEqual([]);
    });
  }
});
