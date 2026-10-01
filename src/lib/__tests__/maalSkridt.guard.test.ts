import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for de to rettelser 1/10-2026 i «Dine mål» (Jonas):
//   1. «Når jeg har et skridt på et mål, og klikker gjort på et skridt, så
//      lukker målet.» — et mål bliver ALDRIG nået af sig selv, fordi alle
//      skridt er gjort. Dommen (milepaelDom) dømmer nået KUN på status =
//      'completed' (erMarkeretNaaet); opgave-luk skriver KUN progress, aldrig
//      status, og kalder aldrig skyderens skriveregel (statusEfterFremgang).
//   2. «Det er heller ikke smart, at et skridt kan have en deadline længere
//      ude i fremtiden end selve målet.» — skridt-tilfoej henter målets frist
//      og dømmer doemFristModMaal FØR insert (samme dom som formularen) —
//      og svarer dommens kode (rådets fund L1): 400 for efter_maalets_frist
//      og maalets_frist_passeret, 500 for maalets_frist_ulaeselig.
//   3–5 (1/10 eftermiddag, recon maal-teknik §3/§5.5): de tre andre veje til
//      et skridts frist eller målets frist dømmer det samme —
//      opgave-accepter (doemFristModMaal + målet skal være aktivt, 409),
//      opgave-udskyd (doemUdskydModMaal: min(motorens, målets), skrevet med
//      dommens dato) og maal-skriv «rediger» (doemMaalFristModSkridt, 409).
//   Rådets fund 1/10 eftermiddag: opgave-accepter dømmer den frist, der
//      SKRIVES (B1, `skrevetFrist`), med handlingen «accepteret» (K1);
//      opgave-udskyd afviser et ikke-aktivt mål (B4, 409) og kalder dommen
//      for ALLE skridt (K2); «Målet findes ikke» er 404 i begge (K5).
// Selvbevis på kopier: hver regel falder, når kilden ændres tilbage.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const OPGAVE_LUK = "supabase/functions/opgave-luk/index.ts";
const SKRIDT_TILFOEJ = "supabase/functions/skridt-tilfoej/index.ts";
const DOMMEN = ["src/lib/milepaelDom.ts", "supabase/functions/_shared/milepaelDom.ts"];

/** Dom 1: nået er KUN et menneskes klik. */
export const naaetKunVedKlik = (opgaveLuk: string, domme: string[]): boolean => {
  const luk = udenKommentarer(opgaveLuk);
  const milestoneSkriv = luk.slice(luk.indexOf("async function rykMaalFremdrift"));
  return (
    /\.from\("milestones"\)\s*\.update\(\{ progress: ny \}\)/.test(milestoneSkriv) &&
    !/status:\s*["']completed["']/.test(luk) &&
    !luk.includes("statusEfterFremgang") &&
    domme.every((d) => {
      const k = udenKommentarer(d);
      return k.includes("const faerdig = !parkeret && erMarkeretNaaet(input.status);") && k.includes('return status === "completed";') && !/progress\s*>=\s*100\s*\)/.test(k.slice(k.indexOf("export function afgoerMilepael"), k.indexOf("export function statusEfterFremgang")));
    })
  );
};

/** Dom 2: skridt-tilfoej dømmer skridtets frist mod målets FØR insert. */
export const fristModMaalHolder = (tilfoej: string): boolean => {
  const k = udenKommentarer(tilfoej);
  const dom = k.indexOf("doemFristModMaal(fristDom.dato,");
  const insert = k.indexOf(".insert(");
  return (
    /\.select\("id, status, deadline"\)/.test(k) &&
    dom > 0 && insert > dom &&
    /if \(!modMaal\.ok\) \{\s*if \(modMaal\.kode === "maalets_frist_ulaeselig"\) \{[\s\S]*?return jsonResponse\(\{ error: modMaal\.grund, grund: modMaal\.kode \}, 500\);\s*\}\s*return jsonResponse\(\{ error: modMaal\.grund, grund: modMaal\.kode \}, 400\);/.test(k)
  );
};

const OPGAVE_ACCEPTER = "supabase/functions/opgave-accepter/index.ts";
const OPGAVE_UDSKYD = "supabase/functions/opgave-udskyd/index.ts";
const MAAL_SKRIV = "supabase/functions/maal-skriv/index.ts";
const KODE_SVAR = /if \(!modMaal\.ok\) \{\s*if \(modMaal\.kode === "maalets_frist_ulaeselig"\) \{[\s\S]*?return jsonResponse\(\{ error: modMaal\.grund, grund: modMaal\.kode \}, 500\);\s*\}\s*return jsonResponse\(\{ error: modMaal\.grund, grund: modMaal\.kode \}, 400\);/;

/** Dom 3: opgave-accepter dømmer målets status og fristen FØR skrivningen. */
export const accepterHolder = (kilde: string): boolean => {
  const k = udenKommentarer(kilde);
  const aktiv = k.indexOf('.status !== "active") {');
  const dom = k.indexOf('doemFristModMaal(skrevetFrist, (maal as { deadline: string | null }).deadline, nu, "accepteret")');
  const skriv = k.indexOf(".update(");
  return (
    k.includes(".select(`${OPGAVE_KOLONNER}, maal_id`)") &&
    k.includes('.select("id, status, deadline")') &&
    aktiv > 0 && dom > aktiv && skriv > dom &&
    k.includes("const skrevetFrist = tilDbDato(resultat.opgave.due_date!);") &&
    /\.update\(\{[^}]*due_date: skrevetFrist,/.test(k) &&
    k.includes('"Målet er ikke aktivt — et skridt kan kun høre til et aktivt mål"') &&
    k.includes('genindlæs og prøv igen" }, 404);') &&
    KODE_SVAR.test(k)
  );
};

/** Dom 4: opgave-udskyd skriver dommens dato (min(motorens, målets)), ikke motorens. */
export const udskydHolder = (kilde: string): boolean => {
  const k = udenKommentarer(kilde);
  const aktiv = k.indexOf('.status !== "active") {');
  const dom = k.indexOf("doemUdskydModMaal(nyFrist, gammel, maalFrist,");
  const skriv = k.indexOf(".update(");
  const maalBlok = k.indexOf('if (typeof maalId === "string" && maalId !== "") {');
  const maalBlokSlut = k.indexOf("maalFrist = (maal as", maalBlok);
  return (
    k.includes(".select(`${OPGAVE_KOLONNER}, maal_id`)") &&
    k.includes('.select("id, status, deadline")') &&
    // K2: dommen kaldes UDEN for mål-blokken (for alle skridt).
    maalBlok > 0 && maalBlokSlut > maalBlok && aktiv > maalBlok && aktiv < maalBlokSlut && dom > maalBlokSlut &&
    k.includes('"Målet er ikke aktivt — et skridt kan kun høre til et aktivt mål", grund: "maalet_ikke_aktivt" }, 409);') &&
    k.includes('genindlæs og prøv igen" }, 404);') &&
    dom > 0 && skriv > dom &&
    k.includes("nyFrist = modMaal.dato;") &&
    /\.update\(\{\s*due_date: nyFrist,/.test(k) &&
    k.includes("opgave.deferral_count > 0)") &&
    KODE_SVAR.test(k)
  );
};

/** Dom 5: maal-skriv «rediger» nægter en målfrist før et åbent skridts. */
export const maalSkrivFristHolder = (kilde: string): boolean => {
  const k = udenKommentarer(kilde);
  const rediger = k.indexOf('if (handling === "rediger") {');
  const dom = k.indexOf("doemMaalFristModSkridt(nyFrist,");
  const skriv = k.indexOf(".update(patch)");
  return (
    rediger > 0 && dom > rediger && skriv > dom &&
    /\.eq\("maal_id", maalId as string\)\s*\.in\("status", \["active", "proposed"\]\)/.test(k) &&
    /return jsonResponse\(\{ error: fristDom\.grund, grund: "foer_skridtets_frist"[^}]*\}, 409\);/.test(k)
  );
};

describe("mål og skridt (1/10-2026)", () => {
  const luk = laes(OPGAVE_LUK);
  const domme = DOMMEN.map(laes);
  const tilfoej = laes(SKRIDT_TILFOEJ);

  it("dom 1: nået er KUN status 'completed'; opgave-luk skriver kun progress", () => {
    expect(naaetKunVedKlik(luk, domme)).toBe(true);
  });
  it("selvbevis 1: den gamle dom (progress >= 100), eller en opgave-luk der skriver status, falder", () => {
    const gammel = domme.map((d) => d.replace("const faerdig = !parkeret && erMarkeretNaaet(input.status);", 'const faerdig = !parkeret && (input.status === "completed" || progress >= 100);'));
    expect(naaetKunVedKlik(luk, gammel)).toBe(false);
    expect(naaetKunVedKlik(luk.replace(".update({ progress: ny })", '.update({ progress: ny, status: ny >= 100 ? "completed" : "active" })'), domme)).toBe(false);
  });
  it("dom 2: skridt-tilfoej dømmer fristen mod målets før insert", () => {
    expect(fristModMaalHolder(tilfoej)).toBe(true);
  });
  it("selvbevis 2: uden målets frist i opslaget, eller uden dommen, falder", () => {
    expect(fristModMaalHolder(tilfoej.replace('.select("id, status, deadline")', '.select("id, status")'))).toBe(false);
    expect(fristModMaalHolder(tilfoej.replace("doemFristModMaal(fristDom.dato,", "ingenDom(fristDom.dato,"))).toBe(false);
    // L1: én fast grund for alle tre afvisninger (før rettelsen) falder.
    expect(fristModMaalHolder(tilfoej.replace("grund: modMaal.kode }, 400)", 'grund: "efter_maalets_frist" }, 400)'))).toBe(false);
    expect(fristModMaalHolder(tilfoej.replace("grund: modMaal.kode }, 500)", "grund: modMaal.kode }, 400)"))).toBe(false);
  });
  it("dom 3–5: opgave-accepter, opgave-udskyd og maal-skriv «rediger» dømmer målets frist", () => {
    expect(accepterHolder(laes(OPGAVE_ACCEPTER))).toBe(true);
    expect(udskydHolder(laes(OPGAVE_UDSKYD))).toBe(true);
    expect(maalSkrivFristHolder(laes(MAAL_SKRIV))).toBe(true);
  });
  it("selvbevis 3–5: uden dommen, uden status-tjek, eller med motorens dato i skrivningen, falder", () => {
    const acc = laes(OPGAVE_ACCEPTER);
    expect(accepterHolder(acc.replace("doemFristModMaal(skrevetFrist,", "ingenDom(skrevetFrist,"))).toBe(false);
    // B1: en skrivning af motorens dato uden om den dømte værdi falder; K1: uden «accepteret» falder.
    expect(accepterHolder(acc.replace("due_date: skrevetFrist,", "due_date: tilDbDato(resultat.opgave.due_date!),"))).toBe(false);
    expect(accepterHolder(acc.replace(', nu, "accepteret")', ", nu)"))).toBe(false);
    // K5: 409 for et forsvundet mål falder.
    expect(accepterHolder(acc.replace('genindlæs og prøv igen" }, 404);', 'genindlæs og prøv igen" }, 409);'))).toBe(false);
    expect(accepterHolder(acc.replace('.status !== "active") {', '.status === "aldrig") {'))).toBe(false);
    expect(accepterHolder(acc.replace("grund: modMaal.kode }, 500)", "grund: modMaal.kode }, 400)"))).toBe(false);
    const uds = laes(OPGAVE_UDSKYD);
    expect(udskydHolder(uds.replace("due_date: nyFrist,", "due_date: tilDbDato(resultat.opgave.due_date!),"))).toBe(false);
    expect(udskydHolder(uds.replace("nyFrist = modMaal.dato;", ""))).toBe(false);
    expect(udskydHolder(uds.replace("opgave.deferral_count > 0)", "false)"))).toBe(false);
    // B4: uden status-tjek falder; K5: 409 for et forsvundet mål falder.
    expect(udskydHolder(uds.replace('.status !== "active") {', '.status === "aldrig") {'))).toBe(false);
    expect(udskydHolder(uds.replace('genindlæs og prøv igen" }, 404);', 'genindlæs og prøv igen" }, 409);'))).toBe(false);
    const ms = laes(MAAL_SKRIV);
    expect(maalSkrivFristHolder(ms.replace("doemMaalFristModSkridt(nyFrist,", "ingenDom(nyFrist,"))).toBe(false);
    expect(maalSkrivFristHolder(ms.replace('.in("status", ["active", "proposed"])', '.in("status", ["active"])'))).toBe(false);
  });
});
