import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Kildeværn for «Én plan» fase 3 (16/9-2026) — medlemmets flade. Jonas
// (ordret): «Nej. Vi er rådgivere, men det er medlemmernes virksomheder.»
// — medlemmet ejer sine mål; «Et medlem skal da stadig kunne styre sine
// opgaver selv»; «A» — 100 % = alle skridt gjort, målet vises som færdigt;
// fladen får «Marker som nået». Syv ting låses:
//   1. Menuen: «Dine mål» på stien /milestones (hbNav), og siden er DineMaalView.
//   2. Fokusmotoren har INGEN milepæls-kilde (slot (e) ude): hverken
//      `milestones:` i inputtet, kind "milestone-deadline" eller "/milestones"
//      som ctaHref — og BoardroomView giver deriveFocus ingen `milestones:`.
//   3. Skyderen kun for mål UDEN skridt: HbMaalRaekke's klikbare bar er
//      låst til dommens kanSaetteFremdrift, og dommen sætter den fra `!x.beregnet`.
//   4. Medlemmet ejer sine mål: DineMaalView bruger useMilestones' opret, slet,
//      opdaterFelt og markerNaaet; og INGEN migration i repoet hedder
//      «maal_skrives_af_raadgiveren» (planens RLS-migration UDGÅR).
//   5. JONAS 16/9 (ordret: «B»): maalId er VALGFRIT i foreslaa-opgave — ingen
//      400 «Målet mangler»; et VALGT mål valideres stadig (404/409). Begge
//      kaldere — chatten og Planen — sender maalId kun når et mål er valgt, og
//      har et tydeligt «Uden mål»-valg.
//   8. Fulde titler i Planen (Jonas 16/9: «Vi kan ikke se hele opgaveskriften
//      på virksomhedssiden»): ingen truncate/line-clamp i VirksomhedPlanen.
//   6. «Måske relevant»: MODUL_FOR_KATEGORI kender præcis milestoneCategories'
//      nøgler, og modulerne findes i handoutConfig.moduleOrder.
//   7. Forsidens «Dine mål» og «Dine skridt» dømmer gennem dineMaal
//      (dineMaalDom/forsideMaal/modMaaletTekst) og kaster med kraevRaekker.
// Kildelæsning med selvbevis på kopier — samme mønster som maalSkriv.guard.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const NAV = "src/lib/hjemmebane/hbNav.ts";
const SIDE = "src/pages/Milestones.tsx";
const MOTOR = "src/components/hjemmebane/boardroom/nextStep.ts";
const FORSIDE = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const RAEKKE = "src/components/hjemmebane/milestones/HbMaalRaekke.tsx";
const VIEW = "src/components/hjemmebane/milestones/DineMaalView.tsx";
const DOM = "src/lib/hjemmebane/dineMaal.ts";
const FORESLAA = "supabase/functions/foreslaa-opgave/index.ts";
const CHAT = "src/components/CompanyChatPane.tsx";
const PLANEN = "src/components/hjemmebane/virksomhed/VirksomhedPlanen.tsx";
const RELEVANT = "src/lib/hjemmebane/maaskeRelevant.ts";
const KATEGORIER = "src/lib/milestoneCategories.ts";
const HANDOUT = "src/lib/handoutConfig.ts";

function alleFiler(rod: string, endelse: RegExp): string[] {
  const ud: string[] = [];
  const gaa = (dir: string) => {
    for (const navn of readdirSync(dir)) {
      if (navn === "node_modules" || navn.startsWith(".")) continue;
      const sti = join(dir, navn);
      if (statSync(sti).isDirectory()) gaa(sti);
      else if (endelse.test(navn)) ud.push(sti);
    }
  };
  gaa(resolve(process.cwd(), rod));
  return ud.map((s) => s.slice(resolve(process.cwd()).length + 1)).sort();
}

/** Dom 1: menupunkt og side. */
export const menuenHolder = (nav: string, side: string): boolean =>
  /\{ label: "Dine mål", to: "\/milestones", active: active === "milestones" \}/.test(nav) &&
  !/label: "Milestones"/.test(nav) &&
  side.includes('import { DineMaalView } from "@/components/hjemmebane/milestones/DineMaalView";') &&
  side.includes("<DineMaalView />");

/** Dom 2: ingen milepæls-kilde i fokusmotoren; forsiden giver ingen. */
export const motorenUdenMilepaele = (motor: string, forside: string): boolean => {
  const focusKald = forside.slice(forside.indexOf("return deriveFocus({"), forside.indexOf("});", forside.indexOf("return deriveFocus({")));
  return !/milestone-deadline/.test(motor) &&
    !/^\s*milestones:/m.test(motor) &&
    !/ctaHref: "\/milestones"/.test(motor) &&
    !/NextStepMilestone/.test(motor) &&
    focusKald.length > 0 && !/milestones:/.test(focusKald);
};

/** Dom 3: skyderen kun uden skridt. */
export const skyderenHolder = (raekke: string, dom: string): boolean =>
  /const klikbarBar = h\.kanSaetteFremdrift && !maalbar;/.test(raekke) &&
  !/klikbarBar = (?!h\.kanSaetteFremdrift)/.test(raekke) &&
  /kanSaetteFremdrift: !x\.beregnet \}/.test(dom) &&
  (dom.match(/kanSaetteFremdrift: false/g) ?? []).length === 2;

/** Dom 4: medlemmet ejer sine mål — fladen skriver med hookets egne skrivere; ingen RLS-migration. */
export const medlemmetEjer = (view: string, migrationer: readonly string[]): boolean =>
  /const \{ milestones, loading, saetFremgang, saetNuvaerendeVaerdi, markerNaaet, slet, opdaterFelt, opret, genhent \} = useMilestones\(/.test(view) &&
  view.includes("onNaaet={() => void markerNaaet(ms.id)}") &&
  view.includes('onParker={() => void opdaterFelt(ms.id, { status: "parked" })}') &&
  view.includes("onSlet={() => setSletId(ms.id)}") &&
  view.includes("onOpret={opret}") &&
  !/functions\.invoke\("maal-skriv"/.test(view) &&
  !migrationer.some((m) => /maal_skrives_af_raadgiveren/.test(m));

/** Dom 5 (Jonas «B»): maalId valgfrit — det valgte mål valideres; kalderne sender kun et valgt mål og har «Uden mål». */
export const maaletErValgfrit = (fn: string, chat: string, planen: string): boolean =>
  !/Målet mangler/.test(fn) &&
  fn.includes('if (maalId !== undefined && maalId !== null && (typeof maalId !== "string" || maalId.trim() === "")) {') &&
  fn.includes("if (oensketMaalId) {") &&
  /status !== "active"/.test(fn) && /Målet findes ikke hos denne virksomhed/.test(fn) &&
  /\.\.\.\(valgtMaalId \? \{ maalId: valgtMaalId \} : \{\}\),/.test(chat) &&
  !/\|\| !forslagMaalId\) return;/.test(chat) &&
  /<option value="uden">Uden mål<\/option>/.test(chat) &&
  /functions\.invoke\("foreslaa-opgave"/.test(planen) &&
  /\.\.\.\(maalId \? \{ maalId \} : \{\}\) \}\);/.test(planen) &&
  /<option value="uden">Uden mål<\/option>/.test(planen);

/** Dom 8: fulde titler i Planen — ingen klipning. */
export const fuldeTitler = (planen: string): boolean => !/\b(truncate|line-clamp-\d+)\b/.test(planen);

/** Dom 6: MODUL_FOR_KATEGORI = milestoneCategories' nøgler; modulerne findes. */
export const kategoritabellenHolder = (relevant: string, kategorier: string, handout: string): boolean => {
  const tabelStart = relevant.indexOf("export const MODUL_FOR_KATEGORI");
  if (tabelStart === -1) return false;
  const tabel = relevant.slice(tabelStart, relevant.indexOf("};", tabelStart));
  const iTabel = new Map([...tabel.matchAll(/^\s*([a-z_]+):\s*("([a-z]+)"|null),?$/gm)].map((m) => [m[1], m[3] ?? null]));
  const katStart = kategorier.indexOf("export const MILESTONE_CATEGORIES");
  const katBlok = kategorier.slice(katStart);
  const iKategorier = new Set([...katBlok.matchAll(/^  ([a-z_]+): \{/gm)].map((m) => m[1]));
  const moduler = new Set([...(handout.match(/export const moduleOrder: HandoutModule\[\] = \[([^\]]+)\]/)?.[1] ?? "").matchAll(/'([a-z]+)'/g)].map((m) => m[1]));
  return iKategorier.size > 0 && iTabel.size === iKategorier.size &&
    [...iKategorier].every((k) => iTabel.has(k)) &&
    [...iTabel.values()].every((m) => m === null || moduler.has(m));
};

/** Dom 7: forsidens sektioner dømmer gennem dineMaal og kaster. */
export const forsidenHolder = (forside: string): boolean =>
  forside.includes("dineMaalDom(milestonesQuery.data, skridtQuery.data, new Date())") &&
  forside.includes("forsideMaal(dineMaal)") &&
  forside.includes("modMaaletTekst(maalTitler, a.maal_id)") &&
  forside.includes('kraevRaekker(skridtRes, "company_actions")') &&
  forside.includes('kraevRaekker(res, "milestones") as MaalRaekke[]') &&
  /id="dine-maal"/.test(forside) && /id="dine-skridt"/.test(forside) && !/id="dine-aftaler"/.test(forside);

describe("dineMaal.guard — fase 3: medlemmets mål, uden milepæls-slot, skyder kun uden skridt, mål obligatorisk", () => {
  const nav = udenKommentarer(laes(NAV)), side = udenKommentarer(laes(SIDE));
  const motor = udenKommentarer(laes(MOTOR)), forside = udenKommentarer(laes(FORSIDE));
  const raekke = udenKommentarer(laes(RAEKKE)), dom = udenKommentarer(laes(DOM)), view = udenKommentarer(laes(VIEW));
  const fn = udenKommentarer(laes(FORESLAA)), chat = udenKommentarer(laes(CHAT)), planen = udenKommentarer(laes(PLANEN));
  const relevant = udenKommentarer(laes(RELEVANT)), kategorier = udenKommentarer(laes(KATEGORIER)), handout = udenKommentarer(laes(HANDOUT));
  const migrationer = alleFiler("supabase/migrations", /\.sql$/);

  it("dom 1: menuen siger «Dine mål» på /milestones, og siden er DineMaalView", () => {
    expect(menuenHolder(nav, side)).toBe(true);
  });
  it("dom 2: fokusmotoren har ingen milepæls-kilde, og forsiden giver den ingen", () => {
    expect(motorenUdenMilepaele(motor, forside)).toBe(true);
  });
  it("dom 3: skyderen (klik på baren) kun når dommen siger kanSaetteFremdrift — og dommen siger det kun uden tællende skridt", () => {
    expect(skyderenHolder(raekke, dom)).toBe(true);
  });
  it("dom 4: medlemmet ejer sine mål — opret/omdøb/parkér/slet/nået gennem useMilestones; ingen RLS-migration «maal_skrives_af_raadgiveren»", () => {
    expect(medlemmetEjer(view, migrationer)).toBe(true);
  });
  it("dom 5 (Jonas «B»): maalId er valgfrit i foreslaa-opgave, et valgt mål valideres; chatten og Planen sender kun et valgt mål og har «Uden mål»", () => {
    expect(maaletErValgfrit(fn, chat, planen)).toBe(true);
  });
  it("dom 8: fulde titler i Planen — ingen truncate/line-clamp", () => {
    expect(fuldeTitler(planen)).toBe(true);
  });
  it("dom 6: MODUL_FOR_KATEGORI kender præcis milestoneCategories' nøgler, modulerne findes i moduleOrder", () => {
    expect(kategoritabellenHolder(relevant, kategorier, handout)).toBe(true);
  });
  it("dom 7: forsidens «Dine mål» og «Dine skridt» dømmer gennem dineMaal og kaster med kraevRaekker; ankeret er #dine-skridt", () => {
    expect(forsidenHolder(forside)).toBe(true);
  });

  it("selvbevis 1: «Milestones» tilbage i menuen, eller siden på den gamle view, falder", () => {
    expect(menuenHolder(nav.replace('label: "Dine mål"', 'label: "Milestones"'), side)).toBe(false);
    expect(menuenHolder(nav, side.replace("<DineMaalView />", "<MilestonesView />"))).toBe(false);
  });
  it("selvbevis 2: slot (e) tilbage i motoren, eller `milestones:` i forsidens deriveFocus-kald, falder", () => {
    expect(motorenUdenMilepaele(motor + '\n  items.push({ kind: "milestone-deadline" });', forside)).toBe(false);
    expect(motorenUdenMilepaele(motor, forside.replace("return deriveFocus({", "return deriveFocus({\n      milestones: milestonesQuery.data ?? [],"))).toBe(false);
  });
  it("selvbevis 3: en bar der er klikbar uanset skridt, eller en dom der giver skyderen til mål med skridt, falder", () => {
    expect(skyderenHolder(raekke.replace("const klikbarBar = h.kanSaetteFremdrift && !maalbar;", "const klikbarBar = !maalbar;"), dom)).toBe(false);
    expect(skyderenHolder(raekke, dom.replace("kanSaetteFremdrift: !x.beregnet }", "kanSaetteFremdrift: true }"))).toBe(false);
  });
  it("selvbevis 4: fladen uden slet, med maal-skriv, eller en RLS-migration med planens navn falder", () => {
    expect(medlemmetEjer(view.replace("onSlet={() => setSletId(ms.id)}", ""), migrationer)).toBe(false);
    expect(medlemmetEjer(view + '\nawait supabase.functions.invoke("maal-skriv", {});', migrationer)).toBe(false);
    expect(medlemmetEjer(view, [...migrationer, "supabase/migrations/20260917160000_maal_skrives_af_raadgiveren.sql"])).toBe(false);
  });
  it("selvbevis 5: «Målet mangler» tilbage i functionen, et værn der er væk, eller en kalder uden «Uden mål» falder", () => {
    expect(maaletErValgfrit(fn + '\n  return jsonResponse({ error: "Målet mangler" }, 400);', chat, planen)).toBe(false);
    expect(maaletErValgfrit(fn.replace("if (oensketMaalId) {", "{"), chat, planen)).toBe(false);
    expect(maaletErValgfrit(fn, chat.replace('<option value="uden">Uden mål</option>', ""), planen)).toBe(false);
    expect(maaletErValgfrit(fn, chat, planen.replace("...(maalId ? { maalId } : {}) });", "maalId });"))).toBe(false);
  });
  it("selvbevis 8: en truncate på en titel i Planen falder", () => {
    expect(fuldeTitler(planen.replace("min-w-0 break-words text-hb-ink", "min-w-0 truncate text-hb-ink"))).toBe(false);
    expect(fuldeTitler(planen + '\n<p className="line-clamp-2">x</p>')).toBe(false);
  });
  it("selvbevis 6: en kategori uden linje i tabellen, eller et modul der ikke findes, falder", () => {
    expect(kategoritabellenHolder(relevant, kategorier + "\n  ny_kategori: {\n", handout)).toBe(false);
    expect(kategoritabellenHolder(relevant.replace('profit: "bogholderi",', 'profit: "finans",'), kategorier, handout)).toBe(false);
  });
  it("selvbevis 7: forsiden med egen dom, uden kraevRaekker på skridtene, eller med det gamle anker falder", () => {
    expect(forsidenHolder(forside.replace("dineMaalDom(milestonesQuery.data, skridtQuery.data, new Date())", "egenDom(milestonesQuery.data)"))).toBe(false);
    expect(forsidenHolder(forside.replace('kraevRaekker(skridtRes, "company_actions")', "(skridtRes.data ?? [])"))).toBe(false);
    expect(forsidenHolder(forside.replace(/id="dine-skridt"/g, 'id="dine-aftaler"'))).toBe(false);
  });
});
