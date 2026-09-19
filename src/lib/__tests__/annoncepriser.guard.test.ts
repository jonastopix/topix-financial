import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TROVAERDIG_FRA } from "@/lib/webinar/annoncepriser";

/**
 * Kildeværn for annoncepriserne (udkast 19/9-2026). Seks domme, hver bevist
 * på en kopi med fejlen indsat:
 *
 *   1. Afsnittet er FRIT: det henter kun forbruget selv og tager vores egne
 *      tal ind som props — så det kan flyttes til en marketingflade uden at
 *      røre en linje. Henter det webinardata selv, er det bundet til /webinar.
 *   2. Fladen regner intet: ingen division, ingen .reduce, ingen gruppering.
 *   3. Prisen vises ALDRIG uden sit antal. «50.000 kr. pr. medlem» af ét
 *      medlem er tallet, hele denne opgave handler om.
 *   4. Nul data giver en SÆTNING, ikke 0 kr. Tre tilstande, tre grene.
 *   5. Koblingsdommen er metaAnnoncer's (erMetaObjektId) — ikke en ny
 *      regex her. To domme om «er det et ad_id» ville før eller siden
 *      svare forskelligt.
 *   6. Tilstanden læses af 42P01 alene; enhver anden fejl kaster.
 *   7. ÉT VINDUE I BEGGE ENDER (fejl fundet af Jonas 19/9): forbruget og
 *      tilmeldingerne filtreres med SAMME vindue, før noget tælles. Den
 *      første udgave delte al forbrug med alle tilmeldinger og gav en pris
 *      fem gange for lav.
 *   8. Perioden står på skærmen, og en pris uden dækning vises ALDRIG.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const DOM = "src/lib/webinar/annoncepriser.ts";
const FLADE = "src/components/hjemmebane/annoncer/AnnoncepriserAfsnit.tsx";
const HOOK = "src/hooks/annonceforbrug.ts";
const WEBINAR = "src/components/hjemmebane/webinar/WebinarView.tsx";

export const afsnittetErFrit = (flade: string, webinar: string): boolean => {
  const f = udenKommentarer(flade);
  return f.includes("useAnnonceforbrug()") &&
    // Egne data KOMMER IND, hentes ikke.
    f.includes("tilmeldinger,") && f.includes("ansoegninger,") &&
    !f.includes("useWebinarDashboard") &&
    !f.includes("supabase") &&
    // Og /webinar giver dem videre som props.
    /<AnnoncepriserAfsnit tilmeldinger=\{[^}]*\} ansoegninger=\{[^}]*\}/.test(udenKommentarer(webinar));
};

const REGNEORD = [".reduce(", ".filter((r) =>", "new Map(", "Math.round(", " / "];
export const fladenRegnerIntet = (flade: string): boolean => {
  const f = udenKommentarer(flade);
  // .filter bruges ét sted til at vælge kampagnens annoncer; division og
  // summering hører til dommen og må ikke findes her.
  return !f.includes(".reduce(") && !/\bMath\.round\(/.test(f) && !/\)\s*\/\s*\(/.test(f) &&
    !f.includes("taelDeltagelse") && !f.includes("pris(");
};

export const prisenBaererSitAntal = (flade: string): boolean => {
  const f = udenKommentarer(flade);
  // Kernen: der findes ÉN komponent der viser en pris, og den viser altid antallet.
  const felt = f.slice(f.indexOf("const Prisfelt"), f.indexOf("const Hoveder"));
  return felt.includes("af {p.antal}") && felt.includes("p.antal === 0") &&
    // og ingen anden kr()-udskrivning af en pris uden for den komponent og totalen
    (f.split("kr(").length - 1) <= 4;
};

export const nulGiverEnSaetning = (flade: string): boolean => {
  const f = udenKommentarer(flade);
  return f.includes('dom.tilstand === "mangler"') && f.includes("PRIS_MANGLER_TEKST") &&
    f.includes('dom.tilstand === "tom"') && f.includes("PRIS_TOM_TEKST") &&
    f.includes("!dom.harForbrug") && f.includes("PRIS_UDEN_FORBRUG_TEKST");
};

export const koblingenErMetaAnnoncers = (dom: string): boolean => {
  const d = udenKommentarer(dom);
  return d.includes('import { erMetaObjektId } from "@/lib/metaAnnoncer"') &&
    d.includes("erMetaObjektId(maerke)") &&
    // Ingen egen id-regex.
    !/\[0-9\]\{\d+,\d+\}/.test(d);
};

export const tilstandenLaesesAf42P01 = (hook: string): boolean => {
  const h = udenKommentarer(hook);
  return h.includes('fejl.code === "42P01"') &&
    h.includes("if (erUkendtTabel(dagSvar.error)) return TOMT;") &&
    h.includes('throw new HentningsFejl("meta_annonce_dag"') &&
    h.includes('tilstand: dage.length === 0 ? "tom" : "har"');
};

// ── 7 ──────────────────────────────────────────────────────────────────────
export const etVindueIBeggeEnder = (dom: string): boolean => {
  const d = udenKommentarer(dom);
  // Begge ender filtreres med det SAMME `vindue`.
  const forbrug = /alleDage\.filter\(\(x\) => iVindue\(tekst\(x\.dato\), vindue\)\)/.test(d);
  const tilmeldinger = /alleFoerste\.filter\(\(r\) => iVindue\(dagKey\(r\.registreret_at\), vindue\)\)/.test(d);
  // Og ingen af linjerne må regne på det ufiltrerede sæt.
  const ingenUfiltreret = !/byggLinje\([^)]*alleDage/.test(d) && !/byggLinje\([^)]*alleFoerste/.test(d);
  return forbrug && tilmeldinger && ingenUfiltreret;
};

// ── 8 ──────────────────────────────────────────────────────────────────────
export const udaekketVisesIkke = (dom: string, flade: string): boolean => {
  const d = udenKommentarer(dom);
  const f = udenKommentarer(flade);
  return d.includes("export const UDAEKKET: Pris") &&
    /prPrTilmelding: daekket \? pris\(/.test(d) &&
    /prPrMedlem: daekket \? pris\(/.test(d) &&
    // Fladen viser perioden og siger hvorfor, når den ikke kan regnes.
    f.includes("periodeOrd(dom.vindue)") &&
    f.includes("udaekketTekst(dom.vindue, dom.daekning)") &&
    f.includes('p.tillid === "udaekket"');
};

describe("annoncepriserne — kildeværn", () => {
  it("1. afsnittet kan flyttes til en marketingflade uden ændringer", () => {
    const flade = laes(FLADE), webinar = laes(WEBINAR);
    expect(afsnittetErFrit(flade, webinar)).toBe(true);
    expect(afsnittetErFrit(`${flade}\nconst q = useWebinarDashboard();`, webinar)).toBe(false);
    expect(afsnittetErFrit(`${flade}\nsupabase.from("x");`, webinar)).toBe(false);
  });

  it("2. fladen regner intet", () => {
    const flade = laes(FLADE);
    expect(fladenRegnerIntet(flade)).toBe(true);
    for (const ond of ["const s = xs.reduce((a, b) => a + b, 0);", "const p = Math.round(f / n);", "const d = taelDeltagelse(r, nu);"]) {
      expect(fladenRegnerIntet(`${flade}\n${ond}`), ond).toBe(false);
    }
  });

  it("3. prisen vises aldrig uden sit antal", () => {
    const flade = laes(FLADE);
    expect(prisenBaererSitAntal(flade)).toBe(true);
    expect(prisenBaererSitAntal(flade.replace("af {p.antal}", ""))).toBe(false);
    expect(prisenBaererSitAntal(flade.replace("p.antal === 0", "false"))).toBe(false);
  });

  it("4. nul data giver en sætning, ikke 0 kr.", () => {
    const flade = laes(FLADE);
    expect(nulGiverEnSaetning(flade)).toBe(true);
    // /g: navnet står både i importen og i brugen — en replace uden g rammer
    // kun importen, og værnet ville bestå med teksten stadig i brug.
    expect(nulGiverEnSaetning(flade.replace(/PRIS_TOM_TEKST/g, '"0 kr."'))).toBe(false);
    expect(nulGiverEnSaetning(flade.replace(/PRIS_MANGLER_TEKST/g, '"0 kr."'))).toBe(false);
    expect(nulGiverEnSaetning(flade.replace(/!dom\.harForbrug/g, "false"))).toBe(false);
    expect(nulGiverEnSaetning(flade.replace('dom.tilstand === "mangler"', "false"))).toBe(false);
  });

  it("5. koblingsdommen er metaAnnoncer's, ikke en ny", () => {
    const dom = laes(DOM);
    expect(koblingenErMetaAnnoncers(dom)).toBe(true);
    expect(koblingenErMetaAnnoncers(dom.replace(/erMetaObjektId\(maerke\)/g, "/^[0-9]{9,25}$/.test(maerke)"))).toBe(false);
  });

  it("6. tilstanden læses af 42P01 alene; alt andet kaster", () => {
    const hook = laes(HOOK);
    expect(tilstandenLaesesAf42P01(hook)).toBe(true);
    expect(tilstandenLaesesAf42P01(hook.replace('fejl.code === "42P01"', "true"))).toBe(false);
    expect(tilstandenLaesesAf42P01(hook.replace('throw new HentningsFejl("meta_annonce_dag"', "return TOMT; //("))).toBe(false);
  });

  it("7. forbrug og tilmeldinger filtreres med SAMME vindue", () => {
    const dom = laes(DOM);
    expect(etVindueIBeggeEnder(dom)).toBe(true);
    // Præcis den gamle fejl: den ene ende ufiltreret.
    expect(etVindueIBeggeEnder(dom.replace(/alleDage\.filter\(\(x\) => iVindue\(tekst\(x\.dato\), vindue\)\)/g, "alleDage"))).toBe(false);
    expect(etVindueIBeggeEnder(dom.replace(/alleFoerste\.filter\(\(r\) => iVindue\(dagKey\(r\.registreret_at\), vindue\)\)/g, "alleFoerste"))).toBe(false);
  });

  it("8. uden dækning vises ingen pris, og perioden står på skærmen", () => {
    const dom = laes(DOM), flade = laes(FLADE);
    expect(udaekketVisesIkke(dom, flade)).toBe(true);
    expect(udaekketVisesIkke(dom.replace(/daekket \? pris\(/g, "true ? pris("), flade)).toBe(false);
    expect(udaekketVisesIkke(dom, flade.replace(/periodeOrd\(dom\.vindue\)/g, '""'))).toBe(false);
    expect(udaekketVisesIkke(dom, flade.replace(/p\.tillid === "udaekket"/g, "false"))).toBe(false);
  });

  it("grænsen for et troværdigt tal står ét sted og er fem", () => {
    expect(TROVAERDIG_FRA).toBe(5);
    expect(udenKommentarer(laes(FLADE))).toContain("TROVAERDIG_FRA");
  });
});
