import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for medlemmets forside PR 2 (17/9-2026) — JONAS (ordret: «A på
// alle») til analyse-medlemmets-forside.md §6.4. Fire ting låses:
//   1. TOPPEN er et to-kolonne-grid (md:grid-cols-12): venstre (md:col-span-7)
//      bærer nyheden («Fra os til dig» med StoryCard variant="main"), højre
//      (md:col-span-5) bærer «Din måned» FØR «Dit næste skridt» (kompakt) —
//      og venstre står før højre i DOM (mobil: nyheden først).
//   2. «Din måned» viser INGEN procent: hverken dommen (dinMaaned.ts) eller
//      kortet (DinMaaned i BoardroomView) skriver «%»; retningen er ord.
//   3. Sparklinen har INGEN nul-punkter: sparkline() filtrerer på `!= null`
//      og indsætter aldrig `?? 0`; tegningen tager punkterne som de er.
//   4. Hovedhistorien er STÅENDE (mediet øverst i fuld bredde, 16:9) — ingen
//      md:w-[42%]-spalte tilbage i MainStoryShell.
// Kildelæsning med selvbevis på kopier (dineMaal.guard-mønstret).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const FORSIDE = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const DOM = "src/lib/hjemmebane/dinMaaned.ts";

/** Blokken for én komponent: fra `const Navn = (` til næste top-level `const`/`function`/`export`. */
function blok(kode: string, navn: string): string {
  const fra = kode.indexOf(`const ${navn} = (`);
  if (fra === -1) return "";
  const rest = kode.slice(fra + 1);
  const m = rest.search(/\n(const|function|export) /);
  return m === -1 ? kode.slice(fra) : kode.slice(fra, fra + 1 + m);
}

/** Dom 1: toppen. */
export const toppenHolder = (forside: string): boolean => {
  const top = forside.indexOf("data-forside-top");
  const venstre = forside.indexOf("data-forside-venstre", top);
  const nyheden = forside.indexOf("data-forside-nyheden", venstre);
  const main = forside.indexOf('variant="main"', nyheden);
  const hoejre = forside.indexOf("data-forside-hoejre", venstre);
  const maaned = forside.indexOf("data-forside-din-maaned", hoejre);
  const skridt = forside.indexOf("data-forside-naeste-skridt", maaned);
  const topLinje = forside.slice(forside.lastIndexOf("\n", top), forside.indexOf("\n", top));
  return top > -1 && venstre > top && nyheden > venstre && main > nyheden && hoejre > main && maaned > hoejre && skridt > maaned &&
    /md:grid-cols-12/.test(topLinje) && /grid grid-cols-1/.test(topLinje) &&
    // Før (PR 2): /className="min-w-0 md:col-span-7" data-forside-venstre/ og
    // /"md:col-span-5" : "md:col-span-12"\)\} data-forside-hoejre/ — tiles lå i venstre kolonne.
    /className="min-w-0 md:col-span-7 md:col-start-1 md:row-start-1" data-forside-venstre/.test(forside) &&
    /"md:col-span-5 md:col-start-8 md:row-span-2 md:row-start-1" : "md:col-span-12"\)\} data-forside-hoejre/.test(forside) &&
    /<FocusCard\s+variant="kompakt"/.test(forside.slice(skridt)) &&
    /<DinMaaned dom=\{dinMaaned\} \/>/.test(forside.slice(maaned, skridt)) &&
    !/<TalStrip/.test(forside);
};

/** Dom 5 (PR 3, Jonas' skærm 17/9 11:28): MOBIL-RÆKKEFØLGEN. Tiles er ET
    grid-barn (data-forside-tiles) der står EFTER højre kolonne i DOM (mobil:
    nyheden → Din måned → Dit næste skridt → tiles) og på md får række 2 i
    venstre kolonne (md:col-start-1 md:row-start-2); ingen `order-*`, og
    side-tiles renderes præcis ÉN gang (ingen md:hidden-dublet). */
export const mobilRaekkefoelge = (forside: string): boolean => {
  const top = forside.indexOf("data-forside-top");
  const venstre = forside.indexOf("data-forside-venstre", top);
  const hoejre = forside.indexOf("data-forside-hoejre", venstre);
  const tiles = forside.indexOf("data-forside-tiles", hoejre);
  const slut = forside.indexOf('id="din-plan"', tiles);
  const topBlok = forside.slice(top, slut === -1 ? undefined : slut);
  return top > -1 && venstre > top && hoejre > venstre && tiles > hoejre &&
    /className="min-w-0 md:col-span-7 md:col-start-1 md:row-start-2" data-forside-tiles/.test(forside) &&
    !/\border-\d|md:order-|\bord[e]r-(first|last|none)\b/.test(topBlok) &&
    (topBlok.match(/variant="side"/g) ?? []).length === 1 &&
    !/md:hidden|hidden md:block/.test(topBlok) &&
    forside.indexOf('variant="side"', tiles) > tiles;
};

/** Dom 2: ingen procent i «Din måned». */
export const ingenProcent = (dom: string, forside: string): boolean => {
  const kort = blok(forside, "DinMaaned") + blok(forside, "Sparkline");
  return kort.length > 0 && !/%/.test(dom) && !/%/.test(kort) &&
    /return `højere end i \$\{navn\}`;/.test(dom) && /return `lavere end i \$\{navn\}`;/.test(dom) && /return `som i \$\{navn\}`;/.test(dom);
};

/** Dom 3: sparkline uden nul-punkter. */
export const ingenNulPunkter = (dom: string): boolean => {
  const fra = dom.indexOf("export function sparkline(");
  if (fra === -1) return false;
  // KUN sparkline-funktionen — næste top-level function (eksporteret eller ej) afgrænser.
  const rest = dom.slice(fra + 1);
  const m = rest.search(/\n(export )?function /);
  const fn = dom.slice(fra, m === -1 ? undefined : fra + 1 + m);
  return fn.length > 0 && /\.filter\(\(r\) => r\[felt\] != null\)/.test(fn) && !/\?\? 0/.test(fn) && !/: 0\b/.test(fn) && !/\|\| 0/.test(fn);
};

/** Dom 4: stående hovedhistorie. */
export const staaende = (forside: string): boolean => {
  const shell = blok(forside, "MainStoryShell");
  return shell.length > 0 && /data-hovedhistorie="staaende"/.test(shell) && /relative aspect-video w-full/.test(shell) && !/md:w-\[42%\]/.test(shell) && !/md:flex/.test(shell);
};

describe("forsideTop.guard — PR 2: to kolonner, Din måned uden procent, sparkline uden nul, stående nyhed", () => {
  const forside = udenKommentarer(laes(FORSIDE));
  const dom = udenKommentarer(laes(DOM));

  it("dom 1: toppen er md:grid-cols-12 — nyheden venstre (7), Din måned før Dit næste skridt højre (5); tal-strippen er væk", () => {
    expect(toppenHolder(forside)).toBe(true);
  });
  it("dom 2: ingen procent i Din måned — retningen er ord", () => {
    expect(ingenProcent(dom, forside)).toBe(true);
  });
  it("dom 3: sparklinen filtrerer null og indsætter aldrig nul", () => {
    expect(ingenNulPunkter(dom)).toBe(true);
  });
  it("dom 4: hovedhistorien er stående — ingen 42 %-spalte", () => {
    expect(staaende(forside)).toBe(true);
  });
  it("dom 5 (PR 3): mobil-rækkefølgen — tiles EFTER højre kolonne i DOM, række 2 venstre på md, ingen order-*, tiles renderet én gang", () => {
    expect(mobilRaekkefoelge(forside)).toBe(true);
  });

  it("selvbevis 1: højre før venstre, Dit næste skridt før Din måned, en fuld FocusCard i toppen, eller tal-strippen tilbage falder", () => {
    const v = forside.indexOf("data-forside-venstre");
    const h = forside.indexOf("data-forside-hoejre");
    const byttet = forside.slice(0, v) + forside.slice(h).replace("data-forside-hoejre", "data-forside-venstre-x") + forside.slice(v, h);
    expect(toppenHolder(byttet)).toBe(false);
    expect(toppenHolder(forside.replace('<FocusCard\n              variant="kompakt"', '<FocusCard\n              variant="fuld"'))).toBe(false);
    expect(toppenHolder(forside + "\n<TalStrip hasFacts={false} />")).toBe(false);
    expect(toppenHolder(forside.replace("data-forside-din-maaned", "x").replace("data-forside-naeste-skridt", "data-forside-din-maaned"))).toBe(false);
  });
  it("selvbevis 2: en procent i dommen eller i kortet falder", () => {
    expect(ingenProcent(dom.replace("return `højere end i ${navn}`;", "return `${Math.round(100 * (nu - foer) / foer)} % højere end i ${navn}`;"), forside)).toBe(false);
    expect(ingenProcent(dom, forside.replace("<Sparkline dom={dom} />", "<Sparkline dom={dom} /><p>+12 %</p>"))).toBe(false);
  });
  it("selvbevis 3: en sparkline der fylder nul ind for manglende måneder falder", () => {
    expect(ingenNulPunkter(dom.replace(".filter((r) => r[felt] != null)", ""))).toBe(false);
    expect(ingenNulPunkter(dom.replace(".map((r) => ({ key: r.key, value: r[felt] as number }))", ".map((r) => ({ key: r.key, value: r[felt] ?? 0 }))"))).toBe(false);
  });
  it("selvbevis 5: tiles tilbage i venstre kolonne (før højre), en order-klasse, eller tiles renderet to gange falder", () => {
    const t = forside.indexOf("data-forside-tiles");
    const h = forside.indexOf("data-forside-hoejre");
    // Tiles-blokken flyttet op FØR højre kolonne.
    const tilesBlokStart = forside.lastIndexOf("{hasBand && (band.side.length", t);
    const tilesBlokSlut = forside.indexOf('id="din-plan"', t);
    const tilesBlok = forside.slice(tilesBlokStart, forside.lastIndexOf("</div>", tilesBlokSlut));
    const hoejreStart = forside.lastIndexOf("<div className={cn(\"min-w-0 space-y-8\"", h);
    const flyttet = forside.slice(0, hoejreStart) + tilesBlok + "\n" + forside.slice(hoejreStart, tilesBlokStart) + forside.slice(forside.lastIndexOf("</div>", tilesBlokSlut));
    expect(mobilRaekkefoelge(flyttet)).toBe(false);
    expect(mobilRaekkefoelge(forside.replace('md:col-start-1 md:row-start-2" data-forside-tiles', 'order-3 md:order-none" data-forside-tiles'))).toBe(false);
    expect(mobilRaekkefoelge(forside.replace("data-forside-tiles>", 'data-forside-tiles>{band.side.map((story) => <StoryCard key={story.kind} story={story} variant="side" pushSender={null} pushCoverUrl={null} />)}'))).toBe(false);
  });
  it("selvbevis 4: 42 %-spalten tilbage i MainStoryShell falder", () => {
    expect(staaende(forside.replace('<div className="relative aspect-video w-full">', '<div className="relative aspect-[3/2] md:aspect-auto md:w-[42%] md:shrink-0">'))).toBe(false);
  });
});
