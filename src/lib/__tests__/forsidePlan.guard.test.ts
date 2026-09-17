import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for medlemmets forside PR 3 (17/9-2026) — JONAS (ordret: «A på
// alle»), valg 3: «Din plan» erstatter «Dine skridt» + «Dine mål». Seks ting:
//   1. ÉN sektion: præcis én HbSection med eyebrow «Din plan» (foruden
//      fejl-grenen) og INGEN «Dine skridt»/«Dine mål»-sektioner; ankrene
//      #dine-skridt og #dine-maal står INDE i #din-plan (fokus-motorens
//      href, gamle links, dineMaal.guard).
//   2. Skridt under deres mål: rækkerne for x.aktive og x.forslag renderes
//      INDE i målets <li>; «Uden mål» står EFTER målene.
//   3. Samme functions som før — ingen ny skrivevej: forsiden kalder kun
//      opgave-accepter, opgave-udskyd, opgave-luk, skridt-tilfoej (og
//      podcast/andre der ikke skriver); ingen direkte insert/update på
//      company_actions eller milestones fra forsiden.
//   4. Tom-teksten er invitationen (PLAN_TOM_TEKST fra forsidePlan) med
//      «Sæt et mål» og «Book en session» — ikke «I har ikke sat mål endnu».
//   5. Fejringen: et gjort skridt sætter fejring fra motorens svar
//      (`maal.progress`) — fladen regner ikke selv; FejringRaekke viser ✓.
//   6. «Hvad er et mål?» (tillæg 17/9 — Jonas: «det er vigtigt de forstår
//      hvad et mål er eller kan være»): forklaringen og eksemplerne har ÉN
//      kilde (lib/hjemmebane/maalForklaring) og bruges TRE steder — forsidens
//      «Din plan» (åben uden mål, foldet <details> med mål), /milestones'
//      tomme tilstand (DineMaalView) og «Sæt et mål»-formularen
//      (MilestoneDialoger: teksten over titelfeltet, eksemplerne som hjælp
//      under). Ingen anden kildefil bærer teksten.
// Kildelæsning med selvbevis på kopier (dineMaal.guard-mønstret).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const FORSIDE = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const DOM = "src/lib/hjemmebane/forsidePlan.ts";
const KILDE = "src/lib/hjemmebane/maalForklaring.ts";
const KOMPONENT = "src/components/hjemmebane/milestones/HbMaalForklaring.tsx";
const VIEW = "src/components/hjemmebane/milestones/DineMaalView.tsx";
const DIALOG = "src/components/hjemmebane/milestones/MilestoneDialoger.tsx";

/** Alle kildefiler under src (uden tests) — til «ingen anden fil bærer teksten». */
const kildefiler = (rod = "src"): string[] =>
  readdirSync(resolve(process.cwd(), rod)).flatMap((navn) => {
    const sti = `${rod}/${navn}`;
    if (statSync(resolve(process.cwd(), sti)).isDirectory()) return navn === "__tests__" || navn === "test" ? [] : kildefiler(sti);
    return /\.(ts|tsx)$/.test(navn) && !/\.test\.tsx?$/.test(navn) ? [sti] : [];
  });

/** Dom 1: én sektion. */
export const enSektion = (forside: string): boolean => {
  const sektioner = forside.match(/eyebrow="Din plan"/g) ?? [];
  const plan = forside.indexOf('id="din-plan" eyebrow="Din plan" hairline linkLabel');
  const slut = forside.indexOf("</HbSection>", plan);
  const blok = plan === -1 ? "" : forside.slice(plan, slut);
  return sektioner.length === 2 && // fejl-grenen + planen
    !/eyebrow="Dine skridt"|eyebrow="Dine mål"/.test(forside) &&
    blok.includes('<span id="dine-skridt" data-anker /><span id="dine-maal" data-anker />') &&
    (forside.match(/id="dine-skridt"/g) ?? []).length === 2 && // fejl-grenen + planen
    !/<HbSection id="dine-skridt"|<HbSection id="dine-maal"/.test(forside);
};

/** Dom 2: skridt under deres mål; «Uden mål» efter. */
export const skridtUnderMaal = (forside: string): boolean => {
  const plan = forside.indexOf('id="din-plan" eyebrow="Din plan" hairline linkLabel');
  const slut = forside.indexOf("</HbSection>", plan);
  const blok = plan === -1 ? "" : forside.slice(plan, slut);
  const maalLi = blok.indexOf("{plan.maal.map((x) => (");
  const aktive = blok.indexOf("{x.aktive.map((a) => (", maalLi);
  const forslag = blok.indexOf("{x.forslag.map((f) => (", aktive);
  const liSlut = blok.indexOf("</li>\n              ))}", forslag);
  const udenMaal = blok.indexOf("data-plan-uden-maal", liSlut);
  return maalLi > -1 && aktive > maalLi && forslag > aktive && liSlut > forslag && udenMaal > liSlut &&
    /forsidePlanDom\(dineMaal, aftaleRaekker, new Date\(\)\)/.test(forside) &&
    blok.includes("<PlanSkridtRaekke key={a.id} skridt={a} slags=\"aktiv\"") &&
    blok.includes("<PlanSkridtRaekke key={f.id} skridt={f} slags=\"forslag\"");
};

/** Dom 3: samme functions — ingen ny skrivevej fra forsiden. */
export const sammeFunctions = (forside: string): boolean => {
  const kald = [...forside.matchAll(/functions\.invoke\(\s*(?:fn|"([a-z-]+)")/g)].map((m) => m[1] ?? "fn");
  const fnNavne = [...forside.matchAll(/fn: "([a-z-]+)"/g)].map((m) => m[1]);
  const alle = new Set([...kald.filter((k) => k !== "fn"), ...fnNavne]);
  const tilladt = new Set(["opgave-accepter", "opgave-udskyd", "opgave-luk", "skridt-tilfoej"]);
  return [...alle].every((n) => tilladt.has(n)) && alle.has("skridt-tilfoej") && alle.has("opgave-luk") &&
    !/from\("company_actions"\)\s*\.(insert|update|delete)\(/.test(forside) &&
    !/from\("milestones"\)\s*\.(insert|update|delete)\(/.test(forside);
};

/** Dom 4: tom-teksten er invitationen. */
export const invitationen = (dom: string, forside: string): boolean =>
  dom.includes('export const PLAN_TOM_TEKST = "Din plan starter med et mål. Sæt det første selv — eller sammen med din rådgiver.";') &&
  dom.includes('export const PLAN_TOM_SAET_MAAL = "Sæt et mål";') &&
  dom.includes('export const PLAN_TOM_BOOK = "Book en session";') &&
  forside.includes("{plan.tom && (") && forside.includes("{PLAN_TOM_TEKST}") &&
  forside.includes('<Link to="/milestones"><HbButton className="h-9 px-4 text-sm">{PLAN_TOM_SAET_MAAL}</HbButton></Link>') &&
  forside.includes('<Link to="/book-session"><HbButton variant="secondary" className="h-9 px-4 text-sm">{PLAN_TOM_BOOK}</HbButton></Link>') &&
  !/I har ikke sat mål endnu/.test(forside) && !/DINE_MAAL_TOM_TEKST/.test(forside);

/** Dom 5: fejringen fra motorens tal. */
export const fejringenHolder = (dom: string, forside: string): boolean =>
  /export function fejringTekst\(maalTitel: string \| null, progress: number \| null\): string/.test(dom) &&
  dom.includes("const pct = Math.round(progress);") && dom.includes("return `Godt gået — ${maalTitel} er nu ${pct} %`;") &&
  dom.includes("if (pct >= 100) return `Godt gået — ${maalTitel} er nu 100 %. ${ALLE_GJORT_TEKST}.`;") &&
  forside.includes('if (kald.type === "luk" && kald.udfald === "done") {') &&
  /setFejring\(lavFejring\(skridt, maal\?\.title \?\? null, progress\)\)/.test(forside) &&
  /\.maal\.progress/.test(forside) &&
  !/gjort\s*\/\s*|\* 100|Math\.round\(\(100/.test(forside.slice(forside.indexOf("const opgaveMutation"), forside.indexOf("const focusLoading"))) &&
  forside.includes("<FejringRaekke fejring={fejring} />");

/** Dom 6: «Hvad er et mål?» — én kilde, tre steder. `filer` er sti → indhold for alle kildefiler (uden tests). */
export const enKildeTreSteder = (filer: Record<string, string>): boolean => {
  const kilde = filer[KILDE] ?? "", komponent = filer[KOMPONENT] ?? "", forside = filer[FORSIDE] ?? "", view = filer[VIEW] ?? "", dialog = filer[DIALOG] ?? "";
  const tekst = "Et mål er det, du vil nå med din virksomhed det næste halve til hele år.";
  const eksempel = "Positiv bundlinje hver måned inden jul";
  const kunKilden = Object.entries(filer).every(([sti, k]) => sti === KILDE || (!k.includes(tekst) && !k.includes(eksempel) && !k.includes("Hvad er et mål?")));
  const planTom = forside.slice(forside.indexOf("<div data-plan-tom>"), forside.indexOf("{plan.ingenAktive && ("));
  const fold = forside.slice(forside.indexOf("{!plan.tom && (\n            <details"), forside.indexOf("</details>"));
  const viewTom = view.slice(view.indexOf("dom.tom ? ("), view.indexOf("{opretKnap}", view.indexOf("dom.tom ? (")));
  return kilde.includes('export const MAAL_FORKLARING_OVERSKRIFT = "Hvad er et mål?";') &&
    kilde.includes(`  "${tekst} Skridtene er de konkrete ting, du gør for at komme dertil. Et godt mål kan mærkes på bundlinjen eller i hverdagen, og du ved, hvornår du er i mål.";`) &&
    kilde.includes("export const MAAL_EKSEMPLER: readonly MaalEksempel[] = [") && kilde.includes("export function maalEksemplerHjaelp(): string {") &&
    kunKilden &&
    komponent.includes('import { MAAL_EKSEMPLER, MAAL_FORKLARING_OVERSKRIFT, MAAL_FORKLARING_TEKST } from "@/lib/hjemmebane/maalForklaring";') &&
    komponent.includes("{MAAL_EKSEMPLER.map((e) => (") && komponent.includes("{MAAL_FORKLARING_TEKST}") &&
    // 1. forsiden: åben i tom-tilstanden FØR knapperne; foldet <details> med mål
    forside.includes('import { HbMaalForklaring } from "../milestones/HbMaalForklaring";') &&
    planTom.indexOf('<HbMaalForklaring className="mt-5" />') > -1 && planTom.indexOf('<HbMaalForklaring className="mt-5" />') < planTom.indexOf("{PLAN_TOM_SAET_MAAL}") &&
    fold.includes("{MAAL_FORKLARING_OVERSKRIFT}</summary>") && fold.includes('<HbMaalForklaring udenOverskrift className="mt-3" />') && !/<details[^>]*\bopen\b/.test(fold) &&
    // 2. /milestones' tomme tilstand: åben FØR «Sæt et mål»; den gamle sætning væk
    view.includes('import { HbMaalForklaring } from "./HbMaalForklaring";') && viewTom.includes("<HbMaalForklaring />") &&
    !view.includes("Et mål er det I arbejder hen imod") &&
    // 3. «Sæt et mål»-formularen: teksten over titelfeltet, eksemplerne som hjælp under
    dialog.includes('import { MAAL_FORKLARING_TEKST, maalEksemplerHjaelp } from "@/lib/hjemmebane/maalForklaring";') &&
    dialog.includes("beskrivelse={MAAL_FORKLARING_TEKST}") && dialog.includes('<HbField label="Titel *" htmlFor="ms-titel" help={maalEksemplerHjaelp()}>');
};

describe("forsidePlan.guard — PR 3: én sektion, skridt under mål, samme functions, invitationen, fejringen, «Hvad er et mål?»", () => {
  const forside = udenKommentarer(laes(FORSIDE));
  const dom = udenKommentarer(laes(DOM));

  it("dom 1: én sektion «Din plan» (+ fejl-grenen); ingen «Dine skridt»/«Dine mål»; ankrene bevares inde i #din-plan", () => {
    expect(enSektion(forside)).toBe(true);
  });
  it("dom 2: aktive og forslag renderes inde i målets <li>; «Uden mål» efter målene; dommen er forsidePlanDom", () => {
    expect(skridtUnderMaal(forside)).toBe(true);
  });
  it("dom 3: kun opgave-accepter/-udskyd/-luk og skridt-tilfoej — ingen direkte skrivning fra forsiden", () => {
    expect(sammeFunctions(forside)).toBe(true);
  });
  it("dom 4: tom-teksten er invitationen med «Sæt et mål» og «Book en session»", () => {
    expect(invitationen(dom, forside)).toBe(true);
  });
  it("dom 5: fejringen bruger motorens progress (opgave-luk-svaret), regner intet selv, og FejringRaekke viser den", () => {
    expect(fejringenHolder(dom, forside)).toBe(true);
  });
  const filer = Object.fromEntries(kildefiler().map((sti) => [sti, udenKommentarer(laes(sti))]));
  it("dom 6: «Hvad er et mål?» har én kilde (maalForklaring) og bruges tre steder — forsiden (åben/foldet), /milestones' tomme tilstand, «Sæt et mål»-formularen", () => {
    expect(Object.keys(filer)).toContain(KILDE);
    expect(enKildeTreSteder(filer)).toBe(true);
  });

  it("selvbevis 1: en «Dine mål»-sektion tilbage, eller ankrene væk, falder", () => {
    expect(enSektion(forside + '\n<HbSection id="dine-maal" eyebrow="Dine mål" hairline />')).toBe(false);
    expect(enSektion(forside.replace('<span id="dine-skridt" data-anker /><span id="dine-maal" data-anker />\n          {', "{"))).toBe(false);
  });
  it("selvbevis 2: skridtene renderet uden for målets <li>, eller en egen dom, falder", () => {
    expect(skridtUnderMaal(forside.replace("forsidePlanDom(dineMaal, aftaleRaekker, new Date())", "egenPlan(dineMaal)"))).toBe(false);
    expect(skridtUnderMaal(forside.replace("{x.aktive.map((a) => (", "{[].map((a) => ("))).toBe(false);
  });
  it("selvbevis 3: en ny function eller en direkte insert falder", () => {
    expect(sammeFunctions(forside + '\nawait supabase.functions.invoke("skridt-opret-direkte", {});')).toBe(false);
    expect(sammeFunctions(forside + '\nawait supabase.from("company_actions").insert({});')).toBe(false);
  });
  it("selvbevis 4: den gamle mangel-tekst tilbage, eller «Book en session» væk, falder", () => {
    expect(invitationen(dom.replace("Din plan starter med et mål. Sæt det første selv — eller sammen med din rådgiver.", "I har ikke sat mål endnu."), forside)).toBe(false);
    expect(invitationen(dom, forside.replace('<Link to="/book-session"><HbButton variant="secondary" className="h-9 px-4 text-sm">{PLAN_TOM_BOOK}</HbButton></Link>', ""))).toBe(false);
  });
  it("selvbevis 6: en kopi af teksten i en anden fil, forklaringen væk fra /milestones' tomme tilstand, den gamle dialogtekst tilbage, eller <details open>, falder", () => {
    expect(enKildeTreSteder({ ...filer, [FORSIDE]: filer[FORSIDE] + '\nconst kopi = "Et mål er det, du vil nå med din virksomhed det næste halve til hele år.";' })).toBe(false);
    expect(enKildeTreSteder({ ...filer, [VIEW]: filer[VIEW].replace("<HbMaalForklaring />", "") })).toBe(false);
    expect(enKildeTreSteder({ ...filer, [DIALOG]: filer[DIALOG].replace("beskrivelse={MAAL_FORKLARING_TEKST}", 'beskrivelse="Definer dit mål og vælg en kategori."') })).toBe(false);
    expect(enKildeTreSteder({ ...filer, [FORSIDE]: filer[FORSIDE].replace('<details className="-mt-2 mb-4" data-maal-forklaring-fold>', '<details open className="-mt-2 mb-4" data-maal-forklaring-fold>') })).toBe(false);
  });
  it("selvbevis 5: en fejring der regner procenten selv, eller uden FejringRaekke, falder", () => {
    expect(fejringenHolder(dom, forside.replace("setFejring(lavFejring(skridt, maal?.title ?? null, progress))", "setFejring(lavFejring(skridt, maal?.title ?? null, Math.round((100 * gjort) / alle)))"))).toBe(false);
    expect(fejringenHolder(dom, forside.replace("<FejringRaekke fejring={fejring} />", ""))).toBe(false);
  });
});
