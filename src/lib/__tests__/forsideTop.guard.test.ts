import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for medlemmets forside PR 2 (17/9-2026) — JONAS (ordret: «A på
// alle») til analyse-medlemmets-forside.md §6.4. Fire ting låses:
//   1. TOPPEN — OMSKREVET 2/10-2026 (seks steder, seksSteder.guard; Jonas 1/10
//      22:50 «Det var fyld»): båndet «Fra os til dig», tiles og «Se tidligere»
//      er taget af forsiden. Toppen er nu ÉN kolonne (grid grid-cols-1, ingen
//      md:grid-cols-12, ingen data-forside-venstre/-nyheden/-tiles) med
//      «Dit næste skridt» (kompakt) ALENE i data-forside-hoejre — og intet
//      StoryCard tegnes i BoardroomView. SKRIDT 2 (2/10, Jonas' ja): «Din
//      måned» har forladt forsiden (intet data-forside-din-maaned, ingen
//      <DinMaaned i BoardroomView) og tegnes øverst på /reports
//      (RapporteringView, data-rapportering-din-maaned) — SAMME komponent,
//      nu i boardroom/DinMaaned.tsx. Var (17/9–2/10 nat): to kolonner,
//      venstre (md:col-span-7) nyheden, højre (md:col-span-5) Din måned/skridt;
//      2/10 nat–2/10: én kolonne, Din måned før Dit næste skridt.
//   2. «Din måned» viser INGEN procent: hverken dommen (dinMaaned.ts) eller
//      kortet (DinMaaned.tsx) skriver «%»; retningen er ord.
//   3. Sparklinen har INGEN nul-punkter: sparkline() filtrerer på `!= null`
//      og indsætter aldrig `?? 0`; tegningen tager punkterne som de er.
//      Og KUN MÅLTE måneder (17/9, Jonas «Vi går med dine anbefalinger» —
//      valg A): sparkline() filtrerer på `basis === "measured"`, så
//      årsregnskabet delt på 12 aldrig tegnes som en flad start.
//   4. Hovedhistorien er STÅENDE (mediet øverst i fuld bredde, 16:9) — ingen
//      md:w-[42%]-spalte tilbage i MainStoryShell.
// Kildelæsning med selvbevis på kopier (dineMaal.guard-mønstret).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const FORSIDE = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const DOM = "src/lib/hjemmebane/dinMaaned.ts";
const KORT = "src/components/hjemmebane/boardroom/DinMaaned.tsx";
const RAPPORTERING = "src/components/hjemmebane/rapportering/RapporteringView.tsx";

/** Blokken for én komponent: fra `const Navn = (` til næste top-level `const`/`function`/`export`. */
function blok(kode: string, navn: string): string {
  const fra = kode.indexOf(`const ${navn} = (`);
  if (fra === -1) return "";
  const rest = kode.slice(fra + 1);
  const m = rest.search(/\n(const|function|export) /);
  return m === -1 ? kode.slice(fra) : kode.slice(fra, fra + 1 + m);
}

/** Dom 1 (FORSIDE V3, 2/10-2026 aften — docs/forside-v3.md, mockup v3 godkendt 20:41; Jonas 20:05: «er det med
    vilje man ikke lige ser sine nyeste tal i en kolonne i toppen som på den gamle?»): felterne står i ÉN
    pakning (Pakning/Felt — to kolonner fra xl, DOM-orden = prioritet); FØRST «Det vigtigste lige nu»
    (VigtigstKort i data-forside-naeste-skridt), og «Din måned» er TILBAGE på forsiden i «Sådan har I det» med
    SAMME kort og SAMME dom som /reports (DinMaaned + dinMaanedDom). Stadig ingen nyhed/tiles/StoryCard,
    ingen tal-strip, ingen FocusCard. Var (2/10 nat–aften): én kolonne, «Dit næste skridt» alene, Din måned
    kun på /reports. */
export const toppenHolder = (forside: string): boolean => {
  const krop = forside.slice(forside.indexOf("export const BoardroomView = () => {"));
  const pakning = krop.indexOf("<Pakning>");
  const vigtigst = krop.indexOf('data-felt="vigtigst"', pakning);
  const skridt = krop.indexOf("data-forside-naeste-skridt", vigtigst);
  const kort = krop.indexOf("<VigtigstKort", skridt);
  const tal = krop.indexOf('data-felt="tal-og-score"', kort);
  const din = krop.indexOf("<TalOgScore dinMaaned={dinMaaned} alder={talAlder}>", tal);
  return krop.length > 0 && pakning > -1 && vigtigst > pakning && skridt > vigtigst && kort > skridt && tal > kort && din > tal &&
    /dinMaanedDom\(dinMaanedRaekker, /.test(krop) &&
    !/data-forside-venstre|data-forside-nyheden|data-forside-tiles/.test(forside) &&
    !/<StoryCard\b|variant="main"|variant="side"|hasBand|band\.main|band\.side|redaktioneltHistory|historikOpen/.test(krop) &&
    !/"Fra os til dig"|Se tidligere|Skjul tidligere/.test(krop) &&
    !/<FocusCard\b/.test(krop) &&
    !/<TalStrip/.test(forside);
};

/** Dom 6 (skridt 2, 2/10): «Din måned» bor øverst på /reports — SAMME kort
    (DinMaaned.tsx eksporterer det, RapporteringView tegner det med dommen
    dinMaanedDom over facts), i en HbSection «Din måned» FØR leveringsbåndet
    og KUN når godkendelsen ikke er ukendt (facts tomme af en fejl må ikke
    tegne «Din måned står her»). Kortet ligger ét sted: ingen anden flade
    definerer `const DinMaaned`. */
export const dinMaanedPaaRapportering = (rapportering: string, kort: string, forside: string): boolean => {
  const sektion = rapportering.indexOf("data-rapportering-din-maaned");
  const baand = rapportering.indexOf("Levering {currentYearGroup.year}");
  return kort.includes("export const DinMaaned = (") && /const Sparkline = \(/.test(kort) &&
    rapportering.includes('import { DinMaaned } from "../boardroom/DinMaaned";') &&
    rapportering.includes("return dinMaanedDom(raekker, processing);") &&
    sektion > -1 && baand > sektion &&
    /<HbSection eyebrow="Din måned" hairline linkLabel="Se dine tal" linkTo="\/kpis"[^>]*data-rapportering-din-maaned>/.test(rapportering) &&
    rapportering.includes("{companyId && !godkendelseUkendt && (") &&
    /<DinMaaned dom=\{dinMaaned\} udenCta \/>/.test(rapportering) &&
    // Hook (useMemo) FØR den betingede return (React #310).
    rapportering.indexOf("const dinMaaned = useMemo(") < rapportering.indexOf("if (isAdvisor && !companyId) {") &&
    !/const DinMaaned = \(/.test(forside);
};

/** Dom 5 (FORSIDE V3): DOM-ordenen ER mobil-ordenen og skærmlæserens: hilsen → stedsætningen (kun de første
    30 døgn) → (fornyelsen) → pakningen med felterne vigtigst → til-gode → tal-og-score (Score inde i) → plan
    → raadgiver → netvaerk. Kolonnerne fra xl er EKSPLICITTE (xl:col-start) i Felt — ingen `order-*`, ingen
    md:hidden-dublet, Score og stedsætningen hver ÉN gang. */
export const FELT_ORDEN = ["vigtigst", "til-gode", "tal-og-score", "plan", "raadgiver", "netvaerk"];
export const mobilRaekkefoelge = (forside: string): boolean => {
  const hilsen = forside.indexOf("<PageHeader");
  const sted = forside.indexOf('<HbStedsSaetning sti="/"', hilsen);
  const pakning = forside.indexOf("<Pakning>", sted);
  const slut = forside.indexOf("</Pakning>", pakning);
  const blokP = forside.slice(pakning, slut);
  const pos = FELT_ORDEN.map((f) => blokP.indexOf(`data-felt="${f}"`));
  const score = blokP.indexOf("data-forside-score");
  return hilsen > -1 && sted > hilsen && pakning > sted && slut > pakning &&
    pos.every((p, i) => p > -1 && (i === 0 || p > pos[i - 1]!)) &&
    score > pos[2]! && score < pos[3]! &&
    (forside.match(/data-forside-score/g) ?? []).length === 1 &&
    (forside.match(/<HbStedsSaetning sti="\/"/g) ?? []).length === 1 &&
    /\{visStedsSaetningHer && <HbStedsSaetning sti="\/"/.test(forside) &&
    !/\border-\d|md:order-|\bord[e]r-(first|last|none)\b/.test(blokP) &&
    !/md:hidden|hidden md:block/.test(blokP);
};

/** Dom 7 (FORSIDE V3, docs/forside-v3.md §0): pakningen bruger EKSPLICITTE kolonner (xl:col-start) og
    målte rækker (--span) — aldrig `order-*` eller `display: contents` (begge bryder skærmlæserens orden). */
export const PAKNING = "src/components/hjemmebane/boardroom/forsideV3.tsx";
export const pakningenHolder = (v3: string): boolean => {
  const felt = v3.slice(v3.indexOf("export const Felt = ("), v3.indexOf("export const Pakning"));
  const pakning = v3.slice(v3.indexOf("export const Pakning"), v3.indexOf("/* ── TIL GODE"));
  return felt.includes('kol === 1 ? "xl:col-start-1" : "xl:col-start-2"') &&
    felt.includes("Math.ceil((el.getBoundingClientRect().height + MELLEM_PX) / RAEKKE_PX)") &&
    felt.includes("self-start") &&
    pakning.includes("xl:grid-flow-dense") && pakning.includes("xl:[&>div]:[grid-row-end:var(--span)]") &&
    !/\bcontents\b|\border-\d|md:order-|xl:order-/.test(felt + pakning);
};

/** Dom 2: ingen procent i «Din måned» — kortet læses af DinMaaned.tsx (skridt 2). */
export const ingenProcent = (dom: string, kortfil: string): boolean => {
  const kort = blok(kortfil, "DinMaaned") + blok(kortfil, "Sparkline");
  return kort.length > 0 && !/%/.test(dom) && !/%/.test(kort) &&
    /return `højere end i \$\{navn\}`;/.test(dom) && /return `lavere end i \$\{navn\}`;/.test(dom) && /return `som i \$\{navn\}`;/.test(dom);
};

/** Dom 3: sparkline uden nul-punkter — og kun målte måneder. */
export const ingenNulPunkter = (dom: string): boolean => {
  const fra = dom.indexOf("export function sparkline(");
  if (fra === -1) return false;
  // KUN sparkline-funktionen — næste top-level function (eksporteret eller ej) afgrænser.
  const rest = dom.slice(fra + 1);
  const m = rest.search(/\n(export )?function /);
  const fn = dom.slice(fra, m === -1 ? undefined : fra + 1 + m);
  return fn.length > 0 && /\.filter\(\(r\) => r\[felt\] != null\)/.test(fn) && !/\?\? 0/.test(fn) && !/: 0\b/.test(fn) && !/\|\| 0/.test(fn) &&
    /\.filter\(\(r\) => r\.basis === "measured"\)/.test(fn);
};

/** Dom 4: stående hovedhistorie. */
export const staaende = (forside: string): boolean => {
  const shell = blok(forside, "MainStoryShell");
  return shell.length > 0 && /data-hovedhistorie="staaende"/.test(shell) && /relative aspect-video w-full/.test(shell) && !/md:w-\[42%\]/.test(shell) && !/md:flex/.test(shell);
};

describe("forsideTop.guard — PR 2 (omskrevet 2/10): toppen, Din måned (på /reports) uden procent, sparkline uden nul, stående nyhed", () => {
  const forside = udenKommentarer(laes(FORSIDE));
  const dom = udenKommentarer(laes(DOM));
  const kort = udenKommentarer(laes(KORT));
  const rapportering = udenKommentarer(laes(RAPPORTERING));

  it("dom 1 (v3): pakningen — Det vigtigste først, Din måned tilbage i «Sådan har I det» (samme kort og dom som /reports); intet StoryCard, ingen tiles, ingen FocusCard, ingen tal-strip", () => {
    expect(toppenHolder(forside)).toBe(true);
  });
  it("dom 6 (skridt 2): Din måned bor øverst på /reports — samme kort, før leveringsbåndet, kun når godkendelsen er kendt, hook før return", () => {
    expect(dinMaanedPaaRapportering(rapportering, kort, forside)).toBe(true);
  });
  it("dom 2: ingen procent i Din måned — retningen er ord", () => {
    expect(ingenProcent(dom, kort)).toBe(true);
  });
  it("dom 3: sparklinen filtrerer null, indsætter aldrig nul — og tager kun målte måneder", () => {
    expect(ingenNulPunkter(dom)).toBe(true);
  });
  it("dom 4: hovedhistorien er stående — ingen 42 %-spalte", () => {
    expect(staaende(forside)).toBe(true);
  });
  it("dom 5 (v3): mobil-rækkefølgen — hilsen → stedsætning → vigtigst → til-gode → tal-og-score (Score) → plan → raadgiver → netvaerk; ingen order-*, ingen dublet", () => {
    expect(mobilRaekkefoelge(forside)).toBe(true);
  });

  it("selvbevis 1: båndet tilbage, FocusCard tilbage, Din måned væk fra forsiden, eller tal-strippen tilbage falder", () => {
    expect(toppenHolder(forside.replace("<Pakning>", '<Pakning><div data-forside-venstre><StoryCard story={band.main} variant="main" /></div>'))).toBe(false);
    expect(toppenHolder(forside.replace("<VigtigstKort", "<FocusCard"))).toBe(false);
    expect(toppenHolder(forside.replace("<TalOgScore dinMaaned={dinMaaned} alder={talAlder}>", "<TalOgScoreUden>"))).toBe(false);
    expect(toppenHolder(forside.replace("dinMaanedDom(dinMaanedRaekker, ", "egenDom(dinMaanedRaekker, "))).toBe(false);
    expect(toppenHolder(forside + "\n<TalStrip hasFacts={false} />")).toBe(false);
  });
  it("selvbevis 6: Din måned efter leveringsbåndet, uden godkendelses-gaten, med CTA, eller kortet defineret på forsiden igen, falder", () => {
    const sektion = rapportering.slice(rapportering.indexOf("{companyId && !godkendelseUkendt && ("), rapportering.indexOf("Levering {currentYearGroup.year}"));
    expect(sektion.length).toBeGreaterThan(0);
    expect(dinMaanedPaaRapportering(rapportering.replace(sektion, "") + sektion, kort, forside)).toBe(false);
    expect(dinMaanedPaaRapportering(rapportering.replace("{companyId && !godkendelseUkendt && (", "{companyId && ("), kort, forside)).toBe(false);
    expect(dinMaanedPaaRapportering(rapportering.replace("<DinMaaned dom={dinMaaned} udenCta />", "<DinMaaned dom={dinMaaned} />"), kort, forside)).toBe(false);
    expect(dinMaanedPaaRapportering(rapportering, kort, forside + "\nconst DinMaaned = () => null;")).toBe(false);
  });
  it("selvbevis 2: en procent i dommen eller i kortet falder", () => {
    expect(ingenProcent(dom.replace("return `højere end i ${navn}`;", "return `${Math.round(100 * (nu - foer) / foer)} % højere end i ${navn}`;"), kort)).toBe(false);
    expect(ingenProcent(dom, kort.replace("<Sparkline dom={dom} />", "<Sparkline dom={dom} /><p>+12 %</p>"))).toBe(false);
  });
  it("selvbevis 3: en sparkline der fylder nul ind for manglende måneder, eller tegner estimater med, falder", () => {
    expect(ingenNulPunkter(dom.replace(".filter((r) => r[felt] != null)", ""))).toBe(false);
    expect(ingenNulPunkter(dom.replace('.filter((r) => r.basis === "measured")', ""))).toBe(false);
    expect(ingenNulPunkter(dom.replace('.filter((r) => r.basis === "measured")', '.filter((r) => r.basis === "measured" || r.basis === "estimated")'))).toBe(false);
    expect(ingenNulPunkter(dom.replace(".map((r) => ({ key: r.key, value: r[felt] as number }))", ".map((r) => ({ key: r.key, value: r[felt] ?? 0 }))"))).toBe(false);
  });
  it("selvbevis 5: stedsætningen over hilsenen eller uden 30-døgns-gaten, felterne byttet, Score uden for sit felt, eller en order-klasse falder", () => {
    const sted = '{visStedsSaetningHer && <HbStedsSaetning sti="/" className="mt-4" />}';
    expect(forside.includes(sted)).toBe(true);
    expect(mobilRaekkefoelge(forside.replace(sted, "").replace("<PageHeader", `${sted}<PageHeader`))).toBe(false);
    expect(mobilRaekkefoelge(forside.replace(sted, '<HbStedsSaetning sti="/" className="mt-4" />'))).toBe(false);
    expect(mobilRaekkefoelge(forside.replace('data-felt="plan"', 'data-felt="X"').replace('data-felt="raadgiver"', 'data-felt="plan"').replace('data-felt="X"', 'data-felt="raadgiver"'))).toBe(false);
    expect(mobilRaekkefoelge(forside.replace("<Pakning>", "<Pakning><div data-forside-score />"))).toBe(false);
    expect(mobilRaekkefoelge(forside.replace('<Felt kol={1} data-felt="vigtigst">', '<Felt kol={1} data-felt="vigtigst"><div className="order-2" />'))).toBe(false);
  });
  it("dom 7 (v3): pakningen — eksplicitte kolonner, målte rækker, ingen order-* og ingen display: contents", () => {
    const v3 = udenKommentarer(laes(PAKNING));
    expect(pakningenHolder(v3)).toBe(true);
    expect(pakningenHolder(v3.replace("self-start", "self-start contents"))).toBe(false);
    expect(pakningenHolder(v3.replace('"xl:col-start-2"', '"xl:col-start-2 xl:order-first"'))).toBe(false);
    expect(pakningenHolder(v3.replace("self-start", ""))).toBe(false);
  });
  it("selvbevis 4: 42 %-spalten tilbage i MainStoryShell falder", () => {
    expect(staaende(forside.replace('<div className="relative aspect-video w-full">', '<div className="relative aspect-[3/2] md:aspect-auto md:w-[42%] md:shrink-0">'))).toBe(false);
  });
});
