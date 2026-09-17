import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (17/9-2026): extract-financial-datas YDERSTE catch («Best-effort: try to mark report as
// needs_manual_entry») skal kunne se rapportens id. Siden #785 (10/9) stod der `reportId` — destruktureret
// med const INDE i try-blokken (:312) og dermed usynlig i catch: deno check gav 3 × TS2304 «Cannot find name
// 'reportId'», og i drift kastede best-effort-opdateringen selv, så en rapport hvis udtræk fejlede blev
// hængende uden spor og medlemmet fik intet at vide. Rettelsen: `let rapportId` erklæret FØR try, sat lige
// efter body-parsingen, brugt de tre steder i catch. Værnet læser kilden og beviser scopet: deklarationen
// står før `try {`, tildelingen står efter destruktureringen, og catch bruger KUN det løftede navn.
// SELVBEVIS: værnet falder når catch igen bruger `reportId`, og når deklarationen fjernes eller flyttes ind i try.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");
const FIL = "supabase/functions/extract-financial-data/index.ts";

/** Dommen: catch'en kan markere rapporten. */
export const catchKanMarkereRapporten = (kilde: string): boolean => {
  const k = udenKommentarer(kilde);
  const serve = k.indexOf("serve(async (req) => {");
  const dekl = k.indexOf("let rapportId: string | null = null;");
  const ydersteTry = k.indexOf("\n  try {\n", serve);
  const destrukt = k.indexOf("const { reportId, fileContent, pageImages, fileName, overwrite, knownCompanyName, excelBase64, pdfStructural } = body;");
  const tildeling = k.indexOf('rapportId = typeof reportId === "string" && reportId ? reportId : null;');
  const catchStart = k.indexOf('\n  } catch (error) {\n    console.error("extract-financial-data error:", error);');
  const catchSlut = k.indexOf("\n    } catch (fallbackErr) {", catchStart);
  if ([serve, dekl, ydersteTry, destrukt, tildeling, catchStart, catchSlut].some((i) => i < 0)) return false;
  const catchen = k.slice(catchStart, catchSlut);
  return (
    serve < dekl && dekl < ydersteTry && // erklæret i handlerens scope, FØR try — det catch kan se
    destrukt < tildeling && tildeling - destrukt < 200 && // sat lige efter body-parsingen
    catchen.includes('if (typeof rapportId === "string" && rapportId) {') &&
    catchen.includes('.eq("id", rapportId);') &&
    !/\breportId\b/.test(catchen) // ingen reference til det blokskopede navn i catch
  );
};

describe("reportIdFallback.guard — den yderste catch kan markere rapporten til manuel indtastning", () => {
  const kilde = laes(FIL);
  it("id'et er løftet ud af try (let før try, sat efter body-parsingen) og catch bruger kun det", () => {
    expect(catchKanMarkereRapporten(kilde)).toBe(true);
  });
  it("selvbevis: catch med det gamle blokskopede navn falder", () => {
    const gammel = kilde
      .replace('if (typeof rapportId === "string" && rapportId) {', 'if (typeof reportId === "string" && reportId) {')
      .replace('.eq("id", rapportId);', '.eq("id", reportId);');
    expect(catchKanMarkereRapporten(gammel)).toBe(false);
  });
  it("selvbevis: deklarationen fjernet, eller flyttet ind i try, falder", () => {
    expect(catchKanMarkereRapporten(kilde.replace("  let rapportId: string | null = null;\n", ""))).toBe(false);
    const indIVTry = kilde
      .replace("  let rapportId: string | null = null;\n", "")
      .replace('    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;\n\n    // Validate auth', '    let rapportId: string | null = null;\n    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;\n\n    // Validate auth');
    expect(catchKanMarkereRapporten(indIVTry)).toBe(false);
  });
});
