import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for Ø3b (17/9-2026 — Jonas' skærmbillede 17:27 af /oekonomi).
// Fire domme, læst i kilden:
//   1. RADAREN tager kun kontraktår for AKTIVE kunder (erAktivKunde: status
//      'active' og er_kunde) — Pro-Vision og E-skilte («tidligere») er ude af
//      radaren og af «omsætning i spil». MRR, broen og kurven er urørt:
//      periodiseringen får stadig ALLE kontrakter.
//   2. AKSEN: etiketterne kommer fra akseIndeks (hver 3. + sidste, en etiket
//      under AKSE_MIN_AFSTAND fra den sidste udelades) — ikke fra det gamle
//      `i % 3 === 0 || i === n - 1` i kurveKoordinater.
//   3. KUNDEVÆRDI erstatter koncentrationen: ingen koncentrationFor /
//      KONCENTRATION_ANTAL / «De fem største»; KUNDEVAERDI_ANTAL = 10, fladen
//      har sektionen «Kundeværdi» og teksten fra kundevaerdiTekst.
//   4. UDESTÅENDE er forfaldne, ikke betalte betalinger (forfaldentFor), og
//      nøgletallet er den samme sum; kortets tekst er UDESTAAENDE_LINJE
//      («forfaldne betalinger der ikke er kommet»). Motoren (omsaetning.ts)
//      er urørt: MaanedsTal.udestaaende_oere regnes som før.
// Selvbevis («VÆRNET VIRKER») kører hver dom på kopier med fejlen indsat.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");

const DOM = "src/lib/oekonomi/dashboard.ts";
const MOTOR = "src/lib/oekonomi/omsaetning.ts";
const VIEW = "src/components/hjemmebane/oekonomi/OekonomiView.tsx";

/** Dom 1. */
export const radarenTagerKunAktive = (dom: string): boolean => {
  const radar = dom.slice(dom.indexOf("export function radarFor("), dom.indexOf("export function prisudviklingFor("));
  const hele = dom.slice(dom.indexOf("export function dashboardDom("));
  return (
    dom.includes('return v.status === "active" && v.er_kunde === true;') &&
    radar.includes("const aktive = new Set(overblik.virksomheder.filter(erAktivKunde).map((v) => v.id));") &&
    radar.includes("if (!aktive.has(k.company_id)) return false;") &&
    hele.includes("periodiser({ kontrakter: overblik.kontrakter, betalinger: betalingerTilMotor(overblik.betalinger), fra, til })") &&
    hele.includes("bro: broFor(overblik, maaneder, nuKey),")
  );
};

/** Dom 2. */
export const aksenHolderAfstand = (dom: string): boolean => {
  const koord = dom.slice(dom.indexOf("export function kurveKoordinater("), dom.indexOf("export function akseIndeks("));
  const akse = dom.slice(dom.indexOf("export function akseIndeks("), dom.indexOf("const MAANEDER_KORT"));
  return (
    dom.includes("export const AKSE_MIN_AFSTAND = 0.06;") &&
    koord.includes("const akse = akseIndeks(n).map((i) =>") &&
    !koord.includes("i % 3 === 0 || i === n - 1") &&
    akse.includes("if (x(sidste) - x(i) < minAfstand) continue;") &&
    akse.includes("ud.push(sidste);")
  );
};

/** Dom 3. */
export const kundevaerdiErstatterKoncentration = (dom: string, view: string): boolean =>
  !dom.includes("koncentrationFor") &&
  !dom.includes("KONCENTRATION_ANTAL") &&
  dom.includes("export const KUNDEVAERDI_ANTAL = 10;") &&
  dom.includes("const top = alle.slice(0, KUNDEVAERDI_ANTAL);") &&
  dom.includes("kundevaerdi: kundevaerdiFor(overblik),") &&
  view.includes('<HbSection eyebrow="Kundeværdi" title="De 10 største kunder"') &&
  view.includes("{kundevaerdiTekst(k)}") &&
  !view.includes("De fem største") &&
  !view.includes("dom.koncentration");

/** Dom 4. */
export const udestaaendeErForfaldent = (dom: string, motor: string, view: string): boolean => {
  const ud = dom.slice(dom.indexOf("export function udestaaendeFor("), dom.indexOf("function danskDagAf("));
  return (
    dom.includes('export const UDESTAAENDE_LINJE = "forfaldne betalinger der ikke er kommet";') &&
    ud.includes("forfaldentFor(k, nuDag)") &&
    ud.includes("if (udestaaende > 0) raekker.push(") &&
    !ud.includes("periodiserKontrakt(") &&
    dom.includes("noegletal: { ...noegletalFor(maaneder, nuKey), udestaaende_oere: udestaaende.i_alt_oere },") &&
    view.includes('<StortTal testId="udestaaende" label="Udestående" oere={n.udestaaende_oere} linje={UDESTAAENDE_LINJE} />') &&
    motor.includes("else if (diff < 0) udestaaende += -diff;") &&
    motor.includes("if (diff > 0) forudbetalt += diff;")
  );
};

describe("oekonomiOe3b.guard — radaren, aksen, kundeværdien og udestående", () => {
  const dom = udenKommentarer(laes(DOM));
  const motor = udenKommentarer(laes(MOTOR));
  const view = udenKommentarer(laes(VIEW));

  it("1. radaren tager kun aktive kunder; MRR, broen og kurven får stadig alle kontrakter", () => {
    expect(radarenTagerKunAktive(dom)).toBe(true);
  });
  it("2. aksen: akseIndeks med mindste afstand 6 %; det gamle «hver 3. eller sidste» er væk", () => {
    expect(aksenHolderAfstand(dom)).toBe(true);
  });
  it("3. kundeværdi (10 største efter betalt) erstatter koncentrationen efter MRR — i dommen og på fladen", () => {
    expect(kundevaerdiErstatterKoncentration(dom, view)).toBe(true);
  });
  it("4. udestående = forfaldne, ikke betalte; nøgletallet er samme sum; kortets tekst; motoren urørt", () => {
    expect(udestaaendeErForfaldent(dom, motor, view)).toBe(true);
  });
});

describe("oekonomiOe3b.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const dom = udenKommentarer(laes(DOM));
  const motor = udenKommentarer(laes(MOTOR));
  const view = udenKommentarer(laes(VIEW));

  it("1. radaren uden filtret (den gamle form), eller en periodisering der også filtrerer, falder", () => {
    expect(radarenTagerKunAktive(dom.replace("if (!aktive.has(k.company_id)) return false;\n", ""))).toBe(false);
    expect(radarenTagerKunAktive(dom.replace("periodiser({ kontrakter: overblik.kontrakter, betalinger: betalingerTilMotor(overblik.betalinger), fra, til })", "periodiser({ kontrakter: overblik.kontrakter.filter((k) => aktive.has(k.company_id)), betalinger: betalingerTilMotor(overblik.betalinger), fra, til })"))).toBe(false);
  });
  it("2. den gamle akse ordret, eller en akse hvor den sidste ryger, falder", () => {
    // Før Ø3b ordret: `.filter(({ i }) => i % 3 === 0 || i === n - 1)`.
    expect(aksenHolderAfstand(dom.replace("const akse = akseIndeks(n).map((i) =>", "const akse = kurve.map((p, i) => ({ i, p })).filter(({ i }) => i % 3 === 0 || i === n - 1).map(({ i }) =>"))).toBe(false);
    expect(aksenHolderAfstand(dom.replace("ud.push(sidste);", ""))).toBe(false);
  });
  it("3. koncentrationen tilbage i dommen, eller «De fem største» på fladen, falder", () => {
    expect(kundevaerdiErstatterKoncentration(dom + "\nexport function koncentrationFor() {}", view)).toBe(false);
    expect(kundevaerdiErstatterKoncentration(dom, view.replace('title="De 10 største kunder"', 'title="De fem største"'))).toBe(false);
  });
  it("4. udestående efter anerkendt (den gamle form), kortet på motorens tal, eller en rørt motor, falder", () => {
    expect(udestaaendeErForfaldent(dom.replace("forfaldentFor(k, nuDag)", "periodiserKontrakt(k).filter((m) => m.key <= nuDag.slice(0, 7)).reduce((s, m) => s + m.anerkendt_oere, 0)"), motor, view)).toBe(false);
    expect(udestaaendeErForfaldent(dom, motor, view.replace("linje={UDESTAAENDE_LINJE}", 'linje="anerkendt, men ikke betalt"'))).toBe(false);
    expect(udestaaendeErForfaldent(dom, motor.replace("else if (diff < 0) udestaaende += -diff;", ""), view)).toBe(false);
  });
});
