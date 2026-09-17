import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for Ø3c (17/9-2026 — Jonas' skærmbillede 18:08 og «hvad dækker de sidste 4k?»).
// To domme, læst i kilden:
//   1. AKSEN: hver etiket bærer sit anker (akseAnker: start/middle/end) fra
//      dommen, og fladen bruger det som textAnchor og som forskydning af
//      tallet under aksen — intet fast «middle» længere.
//   2. FORKLARINGEN: dashboardDom bærer anerkendtModMrr (anerkendtModMrrFor —
//      stoppede, startede, rest med identiteten forskel = Σ stoppede − Σ
//      startede + rest), og fladen viser anerkendtModMrrTekst i en fold under
//      kortet «Anerkendt denne måned», kun når forskellen ikke er 0; fladen
//      regner intet selv (ingen egen deling).
// Selvbevis («VÆRNET VIRKER») kører hver dom på kopier med fejlen indsat.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");

const DOM = "src/lib/oekonomi/dashboard.ts";
const VIEW = "src/components/hjemmebane/oekonomi/OekonomiView.tsx";

/** Dom 1. */
export const aksenHarAnker = (dom: string, view: string): boolean =>
  dom.includes('if (x <= 0) return "start";') &&
  dom.includes('if (x >= 1) return "end";') &&
  dom.includes("anker: akseAnker(x(i)) }));") &&
  view.includes("textAnchor={a.anker}") &&
  !view.includes('textAnchor="middle"') &&
  view.includes('a.anker === "middle" && "-translate-x-1/2", a.anker === "end" && "-translate-x-full"');

/** Dom 2. */
export const forklaringenBaeresAfDommen = (dom: string, view: string): boolean => {
  const fn = dom.slice(dom.indexOf("export function anerkendtModMrrFor("), dom.indexOf("export function anerkendtModMrrTekst("));
  const fold = view.slice(view.indexOf("const AnerkendtModMrr = ("), view.indexOf("const Noegletal = ("));
  return (
    fn.includes("if (v.mrr === 0 && v.anerkendt > 0) {") &&
    fn.includes("} else if (v.startDag !== null && !v.aktivFoerste && diff < 0) {") &&
    fn.includes("rest += diff;") &&
    fn.includes("forskel_oere: anerkendt - mrr,") &&
    dom.includes("anerkendtModMrr: anerkendtModMrrFor(overblik, nuKey),") &&
    fold.includes("if (f.forskel_oere === 0) return null;") &&
    fold.includes("<details className=") &&
    fold.includes("{anerkendtModMrrTekst(f)}") &&
    !/\.filter\(|periodiser|\/ 12/.test(fold) &&
    view.includes('fold={<AnerkendtModMrr dom={dom} />}')
  );
};

describe("oekonomiOe3c.guard — aksens ankre og forklaringen anerkendt mod MRR", () => {
  const dom = udenKommentarer(laes(DOM));
  const view = udenKommentarer(laes(VIEW));
  it("1. aksen: ankeret regnes i dommen og bruges af fladen — intet fast «middle»", () => {
    expect(aksenHarAnker(dom, view)).toBe(true);
  });
  it("2. forklaringen: dommen deler forskellen; fladen folder den under kortet, kun når den ikke er 0, og regner intet selv", () => {
    expect(forklaringenBaeresAfDommen(dom, view)).toBe(true);
  });
});

describe("oekonomiOe3c.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const dom = udenKommentarer(laes(DOM));
  const view = udenKommentarer(laes(VIEW));
  it("1. det gamle faste «middle» i fladen, eller en dom uden anker, falder", () => {
    // Før Ø3c ordret: `textAnchor="middle"`.
    expect(aksenHarAnker(dom, view.replace("textAnchor={a.anker}", 'textAnchor="middle"'))).toBe(false);
    expect(aksenHarAnker(dom.replace("anker: akseAnker(x(i)) }));", "}));"), view)).toBe(false);
  });
  it("2. en fold der også vises ved forskel 0, en flade der selv regner, eller en dom uden rest, falder", () => {
    expect(forklaringenBaeresAfDommen(dom, view.replace("if (f.forskel_oere === 0) return null;", ""))).toBe(false);
    expect(forklaringenBaeresAfDommen(dom, view.replace("{anerkendtModMrrTekst(f)}", "{`${krMedFortegn(f.anerkendt_oere - f.mrr_oere)} — regnet her`}").replace("const AnerkendtModMrr = (", "const AnerkendtModMrr = (/* pris / 12 */"))).toBe(false);
    expect(forklaringenBaeresAfDommen(dom.replace("rest += diff;", "void diff;"), view)).toBe(false);
  });
});
