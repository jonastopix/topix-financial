import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (17/9-2026, rådgivernes forside PR 4 — bølgen; Jonas «AA», valg 2;
// analyse-raadgivernes-forside.md §2c, §6 forslag 4; forsiden-design §3 «Bølgen»).
// Seks domme, læst i kilden:
//   1. Dommen: BOELGE_FRA = 3; ledsagerne er PRÆCIS tavshed, ikke_i_gang,
//      ingen_maal, maal_uden_bevaegelse; bølgen grupperer på velkomstgrundens
//      danske dag (dagsNoegleKbh fra lib/hjemmebane/kohorte — ikke UTC) og
//      kræver at ALLE linjens grunde er velkomst eller ledsager.
//   2. Bølgen bærer hver virksomheds eget grundlag (grundlag: l.grundlag) —
//      lukningen er stadig én kvittering pr. virksomhed, §7 uændret.
//   3. venter_paa_velkomst er STADIG en hændelse i FORM (bølgen er en form
//      for mange på én gang, ikke en tilstand).
//   4. Fladen: bølgen er en <details> med <summary>; hvert navn et <Link> til
//      grundLink(v.companyId, "venter_paa_velkomst") (samme mål som
//      velkomstlinjen); de to ord står på linjen; mutationen lukker HVER
//      virksomhed i bølgen med dens eget grundlag (for … of input.linje.virksomheder).
//   5. Flaget siger «N af dem er nye siden i går» kun gennem
//      usaedvanligtMangeTekst(dom) — og den gamle sætning findes ordret som
//      USAEDVANLIGT_MANGE_TEKST (fald-tilbage når bølgen ikke er årsagen).
//   6. Pulsen tæller bølgens virksomheder som «egen linje»; listens
//      ?grund=-opslag (forsideLinks) tager kun tilstande og pukler — aldrig bølgen.
// Selvbevis («VÆRNET VIRKER») kører hver dom på kopier med fejlen indsat.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");

const DOM = "src/lib/forsidensDom.ts";
const FLADE = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";
const PULSEN = "src/lib/pulsen.ts";
const LINKS = "src/lib/hjemmebane/forsideLinks.ts";
const DESIGN = "docs/forsiden-design.md";

/** Dom 1. */
export const dommenSamlerBoelgen = (dom: string): boolean =>
  dom.includes("export const BOELGE_FRA = 3;") &&
  /export const BOELGENS_LEDSAGERE: ReadonlySet<OpgaveSlags> = new Set<OpgaveSlags>\(\[\s*"tavshed",\s*"ikke_i_gang",\s*"ingen_maal",\s*"maal_uden_bevaegelse",\s*\]\);/.test(dom) &&
  dom.includes('import { dagsNoegleKbh } from "@/lib/hjemmebane/kohorte";') &&
  dom.includes("const dag = start && !Number.isNaN(start.getTime()) ? dagsNoegleKbh(start) : undefined;") &&
  dom.includes('if (!l.grunde.every((g) => g.slags === "venter_paa_velkomst" || BOELGENS_LEDSAGERE.has(g.slags))) continue;') &&
  dom.includes("if (liste.length < BOELGE_FRA) continue;") &&
  !/toISOString\(\)\.slice\(0, 10\)[^\n]*dag/.test(dom.replace(/venterPaaVelkomstGrundlag[^\n]*/g, ""));

/** Dom 2. */
export const boelgenBaererGrundlag = (dom: string): boolean =>
  dom.includes("grundlag: l.grundlag,") &&
  dom.includes('grund: l.grunde.find((g) => g.slags === "venter_paa_velkomst")!,') &&
  /virksomheder: \{ companyId: string; navn: string; grund: Grund; grundlag: Record<string, string> \}\[\];/.test(dom);

/** Dom 3. */
export const velkomstErHaendelse = (dom: string): boolean => /venter_paa_velkomst: "haendelse",/.test(dom);

/** Dom 4. */
export const fladenFolderOgLukkerAlle = (flade: string): boolean => {
  const start = flade.indexOf('if (l.linje === "boelge") {');
  const slut = flade.indexOf('const enkelt = l.linje === "tilstand" && l.antal === 1', start);
  const blok = start === -1 || slut === -1 ? "" : flade.slice(start, slut);
  return (
    blok.includes("<details className=") &&
    blok.includes("<summary className=") &&
    blok.includes('<Link to={grundLink(v.companyId, "venter_paa_velkomst")}') &&
    blok.includes("{LUKNINGS_UDFALD.map((udfald) => (") &&
    blok.includes("onClick={() => onLuk(l, udfald)}") &&
    flade.includes("for (const v of input.linje.virksomheder) {") &&
    flade.includes("await lukOpgave({ companyId: v.companyId, advisorId: user.id, udfald: input.udfald, grundlag: v.grundlag });")
  );
};

/** Dom 5. */
export const flagetForklarerSig = (dom: string, flade: string): boolean =>
  flade.includes("{usaedvanligtMangeTekst(dom)}") &&
  !flade.includes("Usædvanligt mange kræver noget i dag") &&
  dom.includes('"Usædvanligt mange kræver noget i dag — så mange linjer betyder at tærsklen er forkert, ikke at dagen er."') &&
  dom.includes("? `Usædvanligt mange i dag — ${d.nyeSidenIGaar} af dem er nye siden i går.`") &&
  dom.includes("return d.nyeSidenIGaar >= BOELGE_FRA");

/** Dom 6. */
export const pulsenOgListenKenderBoelgen = (pulsen: string, links: string): boolean =>
  pulsen.includes('l.linje === "boelge" ? l.virksomheder.map((v) => v.companyId) : []') &&
  links.includes('l.linje === "tilstand" || l.linje === "pukkel"') &&
  !links.includes('l.linje !== "virksomhed"');

describe("forsideBoelge.guard — bølgen: ≥ 3 velkomster med samme dag er én linje", () => {
  const dom = udenKommentarer(laes(DOM));
  const flade = udenKommentarer(laes(FLADE));
  const pulsen = udenKommentarer(laes(PULSEN));
  const links = udenKommentarer(laes(LINKS));

  it("1. dommen: tærskel 3, præcis fire ledsagere, dansk dag, alle grunde skal være velkomst/ledsager", () => {
    expect(dommenSamlerBoelgen(dom)).toBe(true);
  });
  it("2. bølgen bærer hver virksomheds eget grundlag", () => {
    expect(boelgenBaererGrundlag(dom)).toBe(true);
  });
  it("3. venter_paa_velkomst er stadig en hændelse", () => {
    expect(velkomstErHaendelse(dom)).toBe(true);
  });
  it("4. fladen: foldet linje, ét link pr. navn til velkomstlinjens mål, de to ord kvitterer alle", () => {
    expect(fladenFolderOgLukkerAlle(flade)).toBe(true);
  });
  it("5. flaget forklarer sig gennem usaedvanligtMangeTekst; den gamle sætning består ordret", () => {
    expect(flagetForklarerSig(dom, flade)).toBe(true);
  });
  it("6. pulsen tæller bølgen som egen linje; listen tager kun tilstande og pukler", () => {
    expect(pulsenOgListenKenderBoelgen(pulsen, links)).toBe(true);
  });
  it("designet: §3 bærer bølgen som form", () => {
    expect(laes(DESIGN)).toContain("**Bølgen — en form for ÉN slags");
  });
});

describe("forsideBoelge.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const dom = udenKommentarer(laes(DOM));
  const flade = udenKommentarer(laes(FLADE));
  const pulsen = udenKommentarer(laes(PULSEN));
  const links = udenKommentarer(laes(LINKS));

  it("1. en anden tærskel, en femte ledsager, eller UTC-dag fælder dom 1", () => {
    expect(dommenSamlerBoelgen(dom.replace("export const BOELGE_FRA = 3;", "export const BOELGE_FRA = 5;"))).toBe(false);
    expect(dommenSamlerBoelgen(dom.replace('"maal_uden_bevaegelse",\n]);', '"maal_uden_bevaegelse",\n  "venter_i_samtalen",\n]);'))).toBe(false);
    expect(dommenSamlerBoelgen(dom.replace("const dag = start && !Number.isNaN(start.getTime()) ? dagsNoegleKbh(start) : undefined;", "const dag = start ? start.toISOString().slice(0, 10) : undefined;"))).toBe(false);
    expect(dommenSamlerBoelgen(dom.replace('if (!l.grunde.every((g) => g.slags === "venter_paa_velkomst" || BOELGENS_LEDSAGERE.has(g.slags))) continue;', ""))).toBe(false);
  });
  it("2. en bølge uden grundlag pr. virksomhed fælder dom 2", () => {
    expect(boelgenBaererGrundlag(dom.replace("grundlag: l.grundlag,", "grundlag: {},"))).toBe(false);
  });
  it("3. velkomst som tilstand fælder dom 3", () => {
    expect(velkomstErHaendelse(dom.replace('venter_paa_velkomst: "haendelse",', 'venter_paa_velkomst: "tilstand",'))).toBe(false);
  });
  it("4. en bølge uden fold, uden link pr. navn, eller en lukning der kun kvitterer én, fælder dom 4", () => {
    expect(fladenFolderOgLukkerAlle(flade.replace("<details className=", "<div className="))).toBe(false);
    expect(fladenFolderOgLukkerAlle(flade.replace('<Link to={grundLink(v.companyId, "venter_paa_velkomst")}', "<span"))).toBe(false);
    expect(fladenFolderOgLukkerAlle(flade.replace("for (const v of input.linje.virksomheder) {", "for (const v of input.linje.virksomheder.slice(0, 1)) {"))).toBe(false);
  });
  it("5. den gamle sætning skrevet direkte i fladen, eller en anden tærskel for forklaringen, fælder dom 5", () => {
    expect(flagetForklarerSig(dom, flade.replace("{usaedvanligtMangeTekst(dom)}", "Usædvanligt mange kræver noget i dag — så mange linjer betyder at tærsklen er forkert, ikke at dagen er."))).toBe(false);
    expect(flagetForklarerSig(dom.replace("return d.nyeSidenIGaar >= BOELGE_FRA", "return d.nyeSidenIGaar > 0"), flade)).toBe(false);
  });
  it("6. en puls der ikke ser bølgen, eller en liste der tager alt der ikke er virksomhed, fælder dom 6", () => {
    expect(pulsenOgListenKenderBoelgen(pulsen.replace('l.linje === "boelge" ? l.virksomheder.map((v) => v.companyId) : []', "[]"), links)).toBe(false);
    expect(pulsenOgListenKenderBoelgen(pulsen, links.replace('l.linje === "tilstand" || l.linje === "pukkel"', 'l.linje !== "virksomhed"'))).toBe(false);
  });
});
