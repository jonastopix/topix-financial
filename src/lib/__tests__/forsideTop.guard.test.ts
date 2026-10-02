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

/** Dom 1 (omskrevet 2/10, igen i skridt 2): toppen uden bånd — én kolonne,
    «Dit næste skridt» (kompakt) alene; «Din måned» er IKKE på forsiden (den
    bor på /reports — dom 6); ingen nyhed/tiles/StoryCard i BoardroomView,
    ingen tal-strip. */
export const toppenHolder = (forside: string): boolean => {
  const krop = forside.slice(forside.indexOf("export const BoardroomView = () => {"));
  const top = forside.indexOf("data-forside-top");
  const hoejre = forside.indexOf("data-forside-hoejre", top);
  const skridt = forside.indexOf("data-forside-naeste-skridt", hoejre);
  const topLinje = forside.slice(forside.lastIndexOf("\n", top), forside.indexOf("\n", top));
  return krop.length > 0 && top > -1 && hoejre > top && skridt > hoejre &&
    !/data-forside-din-maaned|<DinMaaned\b|dinMaanedDom\(/.test(krop) &&
    /grid grid-cols-1/.test(topLinje) && !/md:grid-cols-12/.test(topLinje) && !/hasBand/.test(topLinje) &&
    /<div className="min-w-0 space-y-8 md:col-span-12" data-forside-hoejre>/.test(forside) &&
    !/data-forside-venstre|data-forside-nyheden|data-forside-tiles/.test(forside) &&
    !/<StoryCard\b|variant="main"|variant="side"|hasBand|band\.main|band\.side|redaktioneltHistory|historikOpen/.test(krop) &&
    !/"Fra os til dig"|Se tidligere|Skjul tidligere/.test(krop) &&
    /<FocusCard\s+variant="kompakt"/.test(forside.slice(skridt)) &&
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

/** Dom 5 (PR 3, Jonas' skærm 17/9 11:28; OMSKREVET 2/10): MOBIL-RÆKKEFØLGEN
    var tiles EFTER højre kolonne — nu er der ingen tiles. DOM-ordenen ER
    stadig mobil-ordenen: hilsen → stedsætningen → (fornyelsen) →
    Dit næste skridt → Score → Din plan; ingen `order-*`, ingen md:hidden-
    dublet, og stedsætningen står under hilsenen og FØR toppen. */
export const mobilRaekkefoelge = (forside: string): boolean => {
  const hilsen = forside.indexOf("<PageHeader");
  const sted = forside.indexOf('<HbStedsSaetning sti="/"', hilsen);
  const top = forside.indexOf("data-forside-top", sted);
  const hoejre = forside.indexOf("data-forside-hoejre", top);
  const scoreSektion = forside.indexOf('eyebrow="Boardroom Score"', hoejre);
  const score = forside.indexOf("data-forside-score", hoejre);
  const slut = forside.indexOf('id="din-plan"', score);
  const topBlok = forside.slice(top, slut === -1 ? undefined : slut);
  return hilsen > -1 && sted > hilsen && top > sted && hoejre > top && scoreSektion > hoejre && score > scoreSektion && slut > score &&
    (forside.match(/data-forside-score/g) ?? []).length === 1 &&
    (forside.match(/<HbStedsSaetning sti="\/"/g) ?? []).length === 1 &&
    !/\border-\d|md:order-|\bord[e]r-(first|last|none)\b/.test(topBlok) &&
    !/md:hidden|hidden md:block/.test(topBlok);
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

  it("dom 1 (omskrevet 2/10, skridt 2): toppen er én kolonne uden bånd — Dit næste skridt alene, Din måned ikke på forsiden; intet StoryCard, ingen tiles, tal-strippen er væk", () => {
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
  it("dom 5 (omskrevet 2/10): mobil-rækkefølgen — hilsen → stedsætning → top → Score → Din plan; ingen order-*, ingen dublet", () => {
    expect(mobilRaekkefoelge(forside)).toBe(true);
  });

  it("selvbevis 1: båndet tilbage (StoryCard, to kolonner, tiles), Dit næste skridt før Din måned, en fuld FocusCard i toppen, eller tal-strippen tilbage falder", () => {
    expect(toppenHolder(forside.replace('<div className="min-w-0 space-y-8 md:col-span-12" data-forside-hoejre>', '<div className="min-w-0 md:col-span-7" data-forside-venstre><StoryCard story={band.main} variant="main" pushSender={null} pushCoverUrl={null} onVelkomstSet={async () => {}} /></div><div className="min-w-0 space-y-8 md:col-span-12" data-forside-hoejre>'))).toBe(false);
    expect(toppenHolder(forside.replace('className="mt-10 grid grid-cols-1 gap-8 md:mt-12 md:items-start" data-forside-top', 'className={cn("mt-10 grid grid-cols-1 gap-8 md:mt-12 md:items-start", hasBand && "md:grid-cols-12")} data-forside-top'))).toBe(false);
    expect(toppenHolder(forside.replace("data-forside-hoejre>", "data-forside-hoejre><div data-forside-tiles />"))).toBe(false);
    expect(toppenHolder(forside.replace('<FocusCard\n              variant="kompakt"', '<FocusCard\n              variant="fuld"'))).toBe(false);
    expect(toppenHolder(forside + "\n<TalStrip hasFacts={false} />")).toBe(false);
    // Din måned tilbage på forsiden falder (skridt 2).
    expect(toppenHolder(forside.replace("data-forside-naeste-skridt>", 'data-forside-naeste-skridt><HbSection eyebrow="Din måned" data-forside-din-maaned><DinMaaned dom={dinMaaned} /></HbSection>'))).toBe(false);
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
  it("selvbevis 5: stedsætningen over hilsenen eller tegnet to gange, Score i toppen, eller en order-klasse falder", () => {
    const sted = '<HbStedsSaetning sti="/" className="mt-4" />';
    expect(mobilRaekkefoelge(forside.replace(sted, "").replace("<PageHeader", `${sted}<PageHeader`))).toBe(false);
    expect(mobilRaekkefoelge(forside.replace("<FornyelsesBaand />", `<FornyelsesBaand />${sted}`))).toBe(false);
    expect(mobilRaekkefoelge(forside.replace("data-forside-hoejre>", "data-forside-hoejre><div data-forside-score />"))).toBe(false);
    expect(mobilRaekkefoelge(forside.replace('"min-w-0 space-y-8 md:col-span-12" data-forside-hoejre', '"min-w-0 space-y-8 md:col-span-12 order-2" data-forside-hoejre'))).toBe(false);
  });
  it("selvbevis 4: 42 %-spalten tilbage i MainStoryShell falder", () => {
    expect(staaende(forside.replace('<div className="relative aspect-video w-full">', '<div className="relative aspect-[3/2] md:aspect-auto md:w-[42%] md:shrink-0">'))).toBe(false);
  });
});
