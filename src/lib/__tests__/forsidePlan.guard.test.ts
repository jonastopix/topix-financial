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
//      tomme tilstand (DineMaalView) og guiden «Sæt et mål» (SaetMaalGuide,
//      fladen 1/10-2026: teksten som dialogens beskrivelse i trin 1 «Hvad vil
//      I nå?» — før MilestoneDialoger: over titelfeltet, eksemplerne som
//      hjælp). Ingen anden kildefil bærer teksten.
// RETTET 2/10-2026 aften (Jonas' ja til mockuppen «Din plan i tre tilstande»,
// kl. 17:19): dom 2 — målet er et KORT (ForsideMaalKort, motorens maalKort), og
// skridtene står inde i kortet (det næste aktive + forslagene; resten på Dine
// mål); dom 4 — det tomme er det mørke kort med «Sæt jeres første mål» (guiden
// på /milestones?saet=maal) og «Book en session»; tilstanden dømmes af den rene
// forsideMaalTilstand; dom 6 — «Hvad er et mål?» er foldet nederst i alle tre
// tilstande (før: åben i den tomme). Ingen dom er slækket: selvbeviserne er
// flyttet med.
// TILFØJET 3/10-2026: dom 7 — én overskrift, ét begreb (g03-din-plan-dobbelt-overskrift).
// Kildelæsning med selvbevis på kopier (dineMaal.guard-mønstret).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const FORSIDE = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const DOM = "src/lib/hjemmebane/forsidePlan.ts";
const KILDE = "src/lib/hjemmebane/maalForklaring.ts";
const KOMPONENT = "src/components/hjemmebane/milestones/HbMaalForklaring.tsx";
const VIEW = "src/components/hjemmebane/milestones/DineMaalView.tsx";
const DIALOG = "src/components/hjemmebane/milestones/SaetMaalGuide.tsx";

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

/** Dom 2: målet er et kort; skridtene inde i kortet; «Uden mål» efter målene. */
export const skridtUnderMaal = (forside: string): boolean => {
  const plan = forside.indexOf('id="din-plan" eyebrow="Din plan" hairline linkLabel');
  const slut = forside.indexOf("</HbSection>", plan);
  const blok = plan === -1 ? "" : forside.slice(plan, slut);
  const maalLi = blok.indexOf("{plan.maal.map((x) => (");
  const kort = blok.indexOf("<ForsideMaalKort", maalLi);
  const aktive = blok.indexOf("{x.aktive.slice(0, 1).map((a) => (", kort);
  const forslag = blok.indexOf("{x.forslag.map((f) => (", aktive);
  const kortSlut = blok.indexOf("</ForsideMaalKort>", forslag);
  const liSlut = blok.indexOf("</li>", kortSlut);
  const udenMaal = blok.indexOf("data-plan-uden-maal", liSlut);
  return maalLi > -1 && kort > maalLi && aktive > kort && forslag > aktive && kortSlut > forslag && liSlut > kortSlut && udenMaal > liSlut &&
    /forsidePlanDom\(dineMaal, aftaleRaekker, new Date\(\)\)/.test(forside) &&
    // Kortets tal er MOTORENS (samme hook som /milestones) — aldrig regnet på forsiden.
    /const maalGrundlag = useDineMaalGrundlag\(companyId \?\? undefined\);/.test(forside) &&
    blok.includes("kort={maalKortFor(x.plan.plan.maal.id)}") &&
    blok.includes("<PlanSkridtRaekke key={a.id} skridt={a} slags=\"aktiv\"") &&
    blok.includes("<PlanSkridtRaekke key={f.id} skridt={f} slags=\"forslag\"");
};

/** Dom 3: samme functions — ingen ny skrivevej fra forsiden. */
export const sammeFunctions = (forside: string): boolean => {
  const kald = [...forside.matchAll(/functions\.invoke\(\s*(?:fn|"([a-z-]+)")/g)].map((m) => m[1] ?? "fn");
  const fnNavne = [...forside.matchAll(/fn: "([a-z-]+)"/g)].map((m) => m[1]);
  const alle = new Set([...kald.filter((k) => k !== "fn"), ...fnNavne]);
  // FORSIDE V3 (2/10-2026, Jonas: «+ Tilføj skridt» væk fra forsiden — «Ja»): forsiden SVARER kun på skridt
  // (accepter/udskyd/luk); at tilføje et skridt (skridt-tilfoej) bor på Dine mål og må ikke stå her.
  const tilladt = new Set(["opgave-accepter", "opgave-udskyd", "opgave-luk"]);
  return [...alle].every((n) => tilladt.has(n)) && !alle.has("skridt-tilfoej") && alle.has("opgave-luk") &&
    !forside.includes("TilfoejSkridtForm") && !forside.includes('data-handling="tilfoej-skridt"') &&
    !/from\("company_actions"\)\s*\.(insert|update|delete)\(/.test(forside) &&
    !/from\("milestones"\)\s*\.(insert|update|delete)\(/.test(forside);
};

/** Dom 4: det tomme er invitationen — det mørke kort, tilstanden dømt af den rene forsideMaalTilstand. */
export const invitationen = (dom: string, forside: string): boolean => {
  const tom = forside.slice(forside.indexOf('{maalTilstand === "tom" && ('), forside.indexOf("{plan.maal.length > 0 && ("));
  return dom.includes('export const PLAN_TOM_TEKST = "Sæt ét mål med et tal og en frist — selv eller sammen med jeres rådgiver. Så viser vi hver måned, om I er på sporet.";') &&
    dom.includes('export const PLAN_TOM_BOOK = "Book en session";') &&
    /const maalTilstand = forsideMaalTilstand\(\{ bekraeftedeViste: plan\?\.maal\.length \?\? 0, ubekraeftede: ubekraeftedeMaal \}\);/.test(forside) &&
    tom.includes("data-plan-tom") && tom.includes(": PLAN_TOM_TEKST}") &&
    tom.includes("<Link to={SAET_MAAL_STI}>") && tom.includes("FORSIDE_MAAL_ORD.saetFoersteMaal") &&
    tom.includes('<Link to="/book-session">') && tom.includes("{PLAN_TOM_BOOK}") &&
    !/I har ikke sat mål endnu/.test(forside) && !/DINE_MAAL_TOM_TEKST/.test(forside);
};

/** Dom 5: fejringen fra motorens tal. */
export const fejringenHolder = (dom: string, forside: string): boolean =>
  /export function fejringTekst\(maalTitel: string \| null, progress: number \| null\): string/.test(dom) &&
  dom.includes("const pct = Math.round(progress);") && dom.includes("return `Godt gået — ${maalTitel} er nu ${pct} %`;") &&
  dom.includes("if (pct >= 100) return `Godt gået — ${maalTitel} er nu 100 %. ${ALLE_SKRIDT_GJORT_TEKST}`;") &&
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
  // FORSIDE V3 (UX-rådet 2/10 nat): «Hvad er et mål?» stod ikke i den godkendte mockup v3 — den er TAGET AF
  // forsiden og står nu TO steder: /milestones' tomme tilstand og guiden «Sæt et mål». Forsiden må ikke have den.
  // Fladen 1/10-2026: den tomme tilstand er blokken data-dine-maal="tom" FØR gitteret med den stiplede plads «Sæt et mål».
  const viewTom = view.slice(view.indexOf('data-dine-maal="tom"'), view.indexOf("<TomPladsKort", view.indexOf('data-dine-maal="tom"')));
  return kilde.includes('export const MAAL_FORKLARING_OVERSKRIFT = "Hvad er et mål?";') &&
    kilde.includes(`  "${tekst} Skridtene er de konkrete ting, du gør for at komme dertil. Et godt mål kan mærkes på bundlinjen eller i hverdagen, og du ved, hvornår du er i mål.";`) &&
    kilde.includes("export const MAAL_EKSEMPLER: readonly MaalEksempel[] = [") && kilde.includes("export function maalEksemplerHjaelp(): string {") &&
    kunKilden &&
    komponent.includes('import { MAAL_EKSEMPLER, MAAL_FORKLARING_OVERSKRIFT, MAAL_FORKLARING_TEKST } from "@/lib/hjemmebane/maalForklaring";') &&
    komponent.includes("{MAAL_EKSEMPLER.map((e) => (") && komponent.includes("{MAAL_FORKLARING_TEKST}") &&
    // 1. forsiden: IKKE længere (forside v3) — ingen fold, ingen import.
    !forside.includes("HbMaalForklaring") && !forside.includes("data-maal-forklaring-fold") &&
    // 2. /milestones' tomme tilstand: åben FØR «Sæt et mål»; den gamle sætning væk
    view.includes('import { HbMaalForklaring } from "./HbMaalForklaring";') && viewTom.includes("<HbMaalForklaring />") &&
    !view.includes("Et mål er det I arbejder hen imod") &&
    // 3. Guiden «Sæt et mål» (fladen 1/10): teksten som dialogens beskrivelse i trin 1 — og eksemplerne
    //    (maalEksemplerHjaelp, rådets fund 19) under kortene i trin 1, så de ikke er død kode.
    dialog.includes('import { MAAL_FORKLARING_TEKST, maalEksemplerHjaelp } from "@/lib/hjemmebane/maalForklaring";') &&
    dialog.includes("beskrivelse={trin === 1 ? MAAL_FORKLARING_TEKST : undefined}") &&
    dialog.includes("{trin === 1 && <p") && dialog.includes("data-guide-eksempler>{maalEksemplerHjaelp()}</p>}");
};

/** Dom 7 (3/10-2026, mangellisten g03-din-plan-dobbelt-overskrift — livetjek Floren Engros: «VENTER PÅ JERES JA»
    stod to gange i træk i «Din plan»): én overskrift, ét begreb. Ordene bor i forsidePlan.ts (fladens ord-fil):
    målene, der venter, hedder MAAL_VENTER_OVERSKRIFT; skridtgruppen under de ubekræftede mål hedder
    SKRIDT_TIL_FORESLAAEDE_MAAL_OVERSKRIFT — og den må ikke sige «venter på jeres ja». Forsiden skriver ingen af de
    to som streng; de to er forskellige; den gamle fælles konstant er væk. */
export const enOverskriftEtBegreb = (dom: string, forside: string): boolean => {
  const maal = dom.match(/export const MAAL_VENTER_OVERSKRIFT = "([^"]+)";/)?.[1];
  const skridt = dom.match(/export const SKRIDT_TIL_FORESLAAEDE_MAAL_OVERSKRIFT = "([^"]+)";/)?.[1];
  if (!maal || !skridt) return false;
  return (
    maal !== skridt &&
    /venter på jeres ja/i.test(maal) &&
    !/venter på jeres ja/i.test(skridt) &&
    !/VENTER_PAA_JA_OVERSKRIFT/.test(dom + forside) &&
    forside.includes('["venter", SKRIDT_TIL_FORESLAAEDE_MAAL_OVERSKRIFT, plan.venterPaaJa],') &&
    (forside.match(/\{MAAL_VENTER_OVERSKRIFT\}/g) ?? []).length === 1 &&
    !forside.includes(`"${maal}"`) && !forside.includes(`>${maal}<`) &&
    !forside.includes(`"${skridt}"`) && !forside.includes(`>${skridt}<`) &&
    !/["'>]Venter på jeres ja["'<]/i.test(forside)
  );
};

describe("forsidePlan.guard — PR 3: én sektion, skridt under mål, samme functions, invitationen, fejringen, «Hvad er et mål?»", () => {
  const forside = udenKommentarer(laes(FORSIDE));
  const dom = udenKommentarer(laes(DOM));

  it("dom 1: én sektion «Din plan» (+ fejl-grenen); ingen «Dine skridt»/«Dine mål»; ankrene bevares inde i #din-plan", () => {
    expect(enSektion(forside)).toBe(true);
  });
  it("dom 2: målet er motorens kort; næste aktive og forslagene inde i kortet; «Uden mål» efter målene; dommen er forsidePlanDom", () => {
    expect(skridtUnderMaal(forside)).toBe(true);
  });
  it("dom 3 (v3): kun opgave-accepter/-udskyd/-luk — intet «+ Tilføj skridt» og ingen direkte skrivning fra forsiden", () => {
    expect(sammeFunctions(forside)).toBe(true);
  });
  it("dom 4: det tomme er det mørke kort med «Sæt jeres første mål» og «Book en session»; tilstanden er forsideMaalTilstand", () => {
    expect(invitationen(dom, forside)).toBe(true);
  });
  it("dom 5: fejringen bruger motorens progress (opgave-luk-svaret), regner intet selv, og FejringRaekke viser den", () => {
    expect(fejringenHolder(dom, forside)).toBe(true);
  });
  const filer = Object.fromEntries(kildefiler().map((sti) => [sti, udenKommentarer(laes(sti))]));
  it("dom 6 (v3): «Hvad er et mål?» har én kilde (maalForklaring) og bruges to steder — /milestones' tomme tilstand og guiden «Sæt et mål»; IKKE på forsiden", () => {
    expect(Object.keys(filer)).toContain(KILDE);
    expect(enKildeTreSteder(filer)).toBe(true);
  });

  it("selvbevis 1: en «Dine mål»-sektion tilbage, eller ankrene væk, falder", () => {
    expect(enSektion(forside + '\n<HbSection id="dine-maal" eyebrow="Dine mål" hairline />')).toBe(false);
    expect(enSektion(forside.split('<span id="dine-skridt" data-anker /><span id="dine-maal" data-anker />').join(""))).toBe(false);
  });
  it("selvbevis 2: skridtene renderet uden for målets <li>, eller en egen dom, falder", () => {
    expect(skridtUnderMaal(forside.replace("forsidePlanDom(dineMaal, aftaleRaekker, new Date())", "egenPlan(dineMaal)"))).toBe(false);
    expect(skridtUnderMaal(forside.replace("{x.aktive.slice(0, 1).map((a) => (", "{[].map((a) => ("))).toBe(false);
    expect(skridtUnderMaal(forside.replace("kort={maalKortFor(x.plan.plan.maal.id)}", "kort={null}"))).toBe(false);
  });
  it("selvbevis 3: en ny function, en direkte insert eller «+ Tilføj skridt» tilbage falder", () => {
    expect(sammeFunctions(forside + '\nawait supabase.functions.invoke("skridt-tilfoej", {});')).toBe(false);
    expect(sammeFunctions(forside + '\nawait supabase.functions.invoke("skridt-opret-direkte", {});')).toBe(false);
    expect(sammeFunctions(forside + '\nawait supabase.from("company_actions").insert({});')).toBe(false);
  });
  it("selvbevis 4: den gamle mangel-tekst tilbage, eller «Book en session» væk, falder", () => {
    expect(invitationen(dom.replace("Sæt ét mål med et tal og en frist — selv eller sammen med jeres rådgiver. Så viser vi hver måned, om I er på sporet.", "I har ikke sat mål endnu."), forside)).toBe(false);
    expect(invitationen(dom, forside.replace('<Link to="/book-session">', "<span>"))).toBe(false);
    expect(invitationen(dom, forside.replace("<Link to={SAET_MAAL_STI}>", '<Link to="/milestones">'))).toBe(false);
  });
  it("selvbevis 6: en kopi af teksten i en anden fil, forklaringen væk fra /milestones' tomme tilstand, den gamle dialogtekst tilbage, eller <details open>, falder", () => {
    expect(enKildeTreSteder({ ...filer, [FORSIDE]: filer[FORSIDE] + '\nconst kopi = "Et mål er det, du vil nå med din virksomhed det næste halve til hele år.";' })).toBe(false);
    expect(enKildeTreSteder({ ...filer, [VIEW]: filer[VIEW].replace("<HbMaalForklaring />", "") })).toBe(false);
    expect(enKildeTreSteder({ ...filer, [DIALOG]: filer[DIALOG].replace("beskrivelse={trin === 1 ? MAAL_FORKLARING_TEKST : undefined}", 'beskrivelse="Definer dit mål og vælg en kategori."') })).toBe(false);
    expect(enKildeTreSteder({ ...filer, [DIALOG]: filer[DIALOG].replace("data-guide-eksempler>{maalEksemplerHjaelp()}</p>}", "data-guide-eksempler>Fx</p>}") })).toBe(false);
    // Forklaringen tilbage på forsiden fælder (forside v3).
    expect(enKildeTreSteder({ ...filer, [FORSIDE]: filer[FORSIDE] + '\n<details data-maal-forklaring-fold><HbMaalForklaring udenOverskrift /></details>' })).toBe(false);
  });
  it("dom 7 (3/10): «Din plan» har ÉN overskrift pr. begreb — målene «venter på jeres ja», skridtene har deres eget ord", () => {
    expect(enOverskriftEtBegreb(dom, forside)).toBe(true);
  });
  it("selvbevis 7: samme ord til begge, skridtgruppen med «venter på jeres ja», en hårdkodet overskrift eller den gamle konstant falder", () => {
    expect(enOverskriftEtBegreb(dom.replace('"Skridt til de foreslåede mål"', '"Mål, der venter på jeres ja"'), forside)).toBe(false);
    expect(enOverskriftEtBegreb(dom.replace('"Skridt til de foreslåede mål"', '"Venter på jeres ja"'), forside)).toBe(false);
    expect(enOverskriftEtBegreb(dom, forside.replace("{MAAL_VENTER_OVERSKRIFT}", "Venter på jeres ja"))).toBe(false);
    expect(enOverskriftEtBegreb(dom, forside.replace('["venter", SKRIDT_TIL_FORESLAAEDE_MAAL_OVERSKRIFT, plan.venterPaaJa],', '["venter", MAAL_VENTER_OVERSKRIFT, plan.venterPaaJa],'))).toBe(false);
    expect(enOverskriftEtBegreb(dom + '\nexport const VENTER_PAA_JA_OVERSKRIFT = "Venter på jeres ja";', forside)).toBe(false);
  });
  it("selvbevis 5: en fejring der regner procenten selv, eller uden FejringRaekke, falder", () => {
    expect(fejringenHolder(dom, forside.replace("setFejring(lavFejring(skridt, maal?.title ?? null, progress))", "setFejring(lavFejring(skridt, maal?.title ?? null, Math.round((100 * gjort) / alle)))"))).toBe(false);
    expect(fejringenHolder(dom, forside.replace("<FejringRaekke fejring={fejring} />", ""))).toBe(false);
  });
});
