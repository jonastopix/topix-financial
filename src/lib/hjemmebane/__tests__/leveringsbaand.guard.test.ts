import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for «Levering <år>» på /reports (2/10-2026: «2 af 9 måneder
// godkendt» for et medlem startet 29/9). Fladen må kun tælle gennem dommen
// leveringsbaandDom, og dommen må kun afgrænse med Score's EGNE domme
// (foersteTaellendeMaaned, senesteMaanedMedPasseretFrist, fristDato i
// lib/boardroomScore/streak.ts) — ingen ny regel, ingen egen fristdag.
// Værnet beviser sig selv på en KOPI med fejlen indsat (forloeb.guard-formen).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const VIEW = "src/components/hjemmebane/rapportering/RapporteringView.tsx";
const DOM = "src/lib/hjemmebane/leveringsbaand.ts";

/** Dom 1: fladen tæller gennem dommen med Score's første tællende måned — aldrig årsgruppens delivered/total. */
export const fladenTaellerGennemDommen = (view: string): boolean =>
  view.includes('import { foersteTaellendeMaaned } from "@/lib/boardroomScore/streak";') &&
  view.includes('import { leveringsbaandDom } from "@/lib/hjemmebane/leveringsbaand";') &&
  /foersteTaellendeMaaned\(scoreGrundlag\.kontraktStart, scoreGrundlag\.maaneder\)/.test(view) &&
  /foerste: foersteTaellende,/.test(view) &&
  view.includes("{levering.linje &&") &&
  !/currentYearGroup\.(delivered|total)/.test(view) &&
  // «måneder godkendt» må kun stå i en kommentar (JSX-kommentaren over båndet), aldrig i koden.
  !/måneder godkendt/.test(view.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, ""));

/** Dom 2: hooks (useBoardroomScore, useMemo) FØR den betingede return (React #310). */
export const hooksFoerReturn = (view: string): boolean => {
  const ret = view.indexOf("if (isAdvisor && !companyId) {");
  const score = view.indexOf("useBoardroomScore()");
  const memo = view.indexOf("const levering = useMemo(");
  return ret > -1 && score > -1 && memo > -1 && score < ret && memo < ret;
};

/** Dom 3: dommen låner fristen og «seneste passerede frist» fra Score og har ingen egen fristdag eller egen første-måned-regel. */
const udenKommentarer = (kilde: string) => kilde.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
export const dommenGenbrugerScore = (dom: string): boolean =>
  dom.includes('import { fristDato, senesteMaanedMedPasseretFrist } from "@/lib/boardroomScore/streak";') &&
  !/function\s+foersteTaellendeMaaned|STREAK_FRIST_DAG\s*=|isCompletedMonth|contract_start_date|kontraktStart/.test(udenKommentarer(dom));

/** Dom 4: måneder før medlemskabet dæmpes med en SYNLIG note og en aria-label — tooltip alene virker ikke på touch. */
export const daempetMedNote = (view: string): boolean =>
  /plads\.foerMedlemskab && "opacity-40"/.test(view) &&
  /aria-label=\{plads\.etiket\}/.test(view) &&
  view.includes("{levering.note && <p");

describe("leveringsbaand.guard", () => {
  const view = laes(VIEW);
  const dom = laes(DOM);

  it("dom 1–4 holder på kilden", () => {
    expect(fladenTaellerGennemDommen(view)).toBe(true);
    expect(hooksFoerReturn(view)).toBe(true);
    expect(dommenGenbrugerScore(dom)).toBe(true);
    expect(daempetMedNote(view)).toBe(true);
  });

  it("selvbevis 1: den gamle tæller tilbage, eller første måned uden Score's dom, falder", () => {
    expect(fladenTaellerGennemDommen(view.replace("{levering.linje &&", "{currentYearGroup.delivered} af {currentYearGroup.total} måneder godkendt {levering.linje &&"))).toBe(false);
    expect(fladenTaellerGennemDommen(view.replace("foersteTaellendeMaaned(scoreGrundlag.kontraktStart, scoreGrundlag.maaneder)", "null"))).toBe(false);
  });

  it("selvbevis 2: useBoardroomScore efter den betingede return falder", () => {
    const flyttet = view.replace("useBoardroomScore()", "null").replace("if (isAdvisor && !companyId) {", "if (isAdvisor && !companyId) { useBoardroomScore();");
    expect(hooksFoerReturn(flyttet)).toBe(false);
  });

  it("selvbevis 3: en egen fristdag eller kontraktstart-regel i dommen falder", () => {
    expect(dommenGenbrugerScore(dom + "\nconst STREAK_FRIST_DAG = 10;")).toBe(false);
    expect(dommenGenbrugerScore(dom + "\nconst x = (kontraktStart: string) => kontraktStart;")).toBe(false);
    expect(dommenGenbrugerScore(dom.replace('import { fristDato, senesteMaanedMedPasseretFrist } from "@/lib/boardroomScore/streak";', ""))).toBe(false);
  });

  it("selvbevis 4: dæmpning uden synlig note falder", () => {
    expect(daempetMedNote(view.replace("{levering.note && <p", "{false && <p"))).toBe(false);
  });
});
