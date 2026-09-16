import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for CVR-kilden (16/9-2026): opslaget går til DataCVR med nøgle
// og timeout — ikke til cvrapi.dk anonymt — og nøglen når aldrig en log.
// Kildelæsning (contactPerson.guard-/lektionBrugbar.guard-mønstret), fordi
// slaaCvrOp er Deno/fetch og ikke kan kaldes fra vitest; hver dom er en
// navngiven ren funktion over kildeteksten, og værnet beviser sig selv på
// KOPIER af kilden med fejlen indsat.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
/** Kommentarerne fjernet — men IKKE til URL-dommene: en URL bærer «//»,
    som stripperen ville æde. URL-dommene dømmer derfor på den rå kilde. */
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const OPRETTELSE = "supabase/functions/_shared/virksomhedsOprettelse.ts";
const OPSLAG = "supabase/functions/_shared/cvrOpslag.ts";
const BERIG = "supabase/functions/berig-virksomheder/index.ts";

// ── Dommene ──────────────────────────────────────────────────────────────

/** Opslaget bygger URL'en gennem cvrOpslag.ts (dataCvrUrl), ikke i hånden. */
export const brugerCvrOpslag = (kilde: string): boolean =>
  kilde.includes('from "./cvrOpslag.ts"') && kilde.includes("dataCvrUrl(");

/** cvrOpslag.ts bærer DataCVR's URL som konstant (dømmes på RÅ kilde — URL'en har «//»). */
export const baererDataCvrUrl = (raaKilde: string): boolean =>
  raaKilde.includes('"https://datacvrapi.dk/api/v2/dk/company"');

/** Nøglen sendes som Bearer i Authorization-headeren. */
export const sendesMedBearer = (kilde: string): boolean =>
  kilde.includes("Authorization: `Bearer ${noegle}`");

/** Timeout med AbortController + setTimeout, og timeren ryddes. */
export const harTimeout = (kilde: string): boolean =>
  kilde.includes("new AbortController()") && kilde.includes("controller.abort()") && kilde.includes("clearTimeout(timer)");

/** Nøglen læses fra secret'en DATACVR_API_KEY. */
export const laeserNoeglen = (kilde: string): boolean => kilde.includes('Deno.env.get("DATACVR_API_KEY")');

/** Den gamle anonyme kilde er væk (dømmes på RÅ kilde — URL'en har «//»; rammer også en kommentar med endpointet, med vilje). */
export const naevnerCvrapi = (raaKilde: string): boolean => raaKilde.includes("cvrapi.dk/api?country");

/** Hvert console.-kald i kilden, fra `console.` til det afsluttende `);`. */
export function logKald(kilde: string): string[] {
  const ud: string[] = [];
  let fra = 0;
  for (;;) {
    const start = kilde.indexOf("console.", fra);
    if (start === -1) break;
    const slut = kilde.indexOf(");", start);
    ud.push(kilde.slice(start, slut === -1 ? kilde.length : slut + 2));
    fra = slut === -1 ? kilde.length : slut + 2;
  }
  return ud;
}

/** De log-kald der nævner Bearer, Authorization eller nøglevariablen `noegle`. */
export const logKaldMedHemmelighed = (kilde: string): string[] =>
  logKald(kilde).filter((k) => /Bearer|Authorization|\bnoegle\b/.test(k));

/** Berigelsens loft pr. kørsel er 20 (DataCVR: 25 pr. dag pr. nøgle, minus 5 til dagens nye virksomheder). */
export const maksOpslagEr20 = (kilde: string): boolean => /const MAKS_OPSLAG = 20;/.test(kilde);

// ── Værnet ───────────────────────────────────────────────────────────────

describe("cvrKilde.guard — virksomhedsOprettelse.ts slår op hos DataCVR med nøgle og timeout", () => {
  const oprettelseRaa = laes(OPRETTELSE);
  const opslagRaa = laes(OPSLAG);
  const oprettelse = udenKommentarer(oprettelseRaa);

  it("URL'en kommer fra cvrOpslag.ts, som bærer datacvrapi-adressen", () => {
    expect(brugerCvrOpslag(oprettelse)).toBe(true);
    expect(baererDataCvrUrl(opslagRaa)).toBe(true);
  });

  it("nøglen læses fra DATACVR_API_KEY og sendes som Bearer", () => {
    expect(laeserNoeglen(oprettelse)).toBe(true);
    expect(sendesMedBearer(oprettelse)).toBe(true);
  });

  it("opslaget har timeout (AbortController + setTimeout, timeren ryddes)", () => {
    expect(harTimeout(oprettelse)).toBe(true);
  });

  it("cvrapi.dk's anonyme endpoint er væk — heller ikke i en kommentar", () => {
    expect(naevnerCvrapi(oprettelseRaa)).toBe(false);
    expect(naevnerCvrapi(opslagRaa)).toBe(false);
  });

  it("intet log-kald nævner Bearer, Authorization eller nøglevariablen", () => {
    expect(logKald(oprettelse).length).toBeGreaterThan(0); // der ER log-kald at dømme på
    expect(logKaldMedHemmelighed(oprettelse)).toEqual([]);
  });
});

describe("cvrKilde.guard — berig-virksomheder bruger samme opslag og holder sig under DataCVR's grænse", () => {
  const berig = udenKommentarer(laes(BERIG));

  it("importerer slaaCvrOp fra virksomhedsOprettelse.ts og nævner ikke hentCvrData", () => {
    expect(berig).toContain('import { slaaCvrOp, type CvrSvar } from "../_shared/virksomhedsOprettelse.ts";');
    expect(berig).not.toContain("hentCvrData");
  });

  it("MAKS_OPSLAG er 20", () => {
    expect(maksOpslagEr20(berig)).toBe(true);
  });
});

describe("cvrKilde.guard — VÆRNET VIRKER: kopier med fejlen indsat fanges (filerne er ikke rørt)", () => {
  const oprettelseRaa = laes(OPRETTELSE);
  const opslagRaa = laes(OPSLAG);
  const oprettelse = udenKommentarer(oprettelseRaa);
  const berig = udenKommentarer(laes(BERIG));

  it("URL bygget i hånden uden cvrOpslag.ts → falsk", () => {
    const kopi = oprettelse.replace('from "./cvrOpslag.ts"', 'from "./andetSted.ts"');
    expect(kopi).not.toBe(oprettelse);
    expect(brugerCvrOpslag(kopi)).toBe(false);
    const kopiUrl = opslagRaa.replace('"https://datacvrapi.dk/api/v2/dk/company"', '"https://example.test/api"');
    expect(kopiUrl).not.toBe(opslagRaa);
    expect(baererDataCvrUrl(kopiUrl)).toBe(false);
  });

  it("nøglen som query-parameter i stedet for Bearer → falsk; nøglen læst fra en anden secret → falsk", () => {
    const kopiBearer = oprettelse.replace("Authorization: `Bearer ${noegle}`", "\"X-Api-Key\": noegle");
    expect(kopiBearer).not.toBe(oprettelse);
    expect(sendesMedBearer(kopiBearer)).toBe(false);
    const kopiSecret = oprettelse.replace('Deno.env.get("DATACVR_API_KEY")', 'Deno.env.get("CVR_KEY")');
    expect(kopiSecret).not.toBe(oprettelse);
    expect(laeserNoeglen(kopiSecret)).toBe(false);
  });

  it("timeren ikke ryddet, eller ingen AbortController → falsk", () => {
    const kopiTimer = oprettelse.replace("clearTimeout(timer)", "void timer");
    expect(kopiTimer).not.toBe(oprettelse);
    expect(harTimeout(kopiTimer)).toBe(false);
    const kopiAbort = oprettelse.replace("new AbortController()", "new Object()");
    expect(kopiAbort).not.toBe(oprettelse);
    expect(harTimeout(kopiAbort)).toBe(false);
  });

  it("cvrapi.dk smuglet ind igen → sand (i koden og i en kommentar)", () => {
    const kopi = oprettelseRaa.replace("dataCvrUrl(cvr)", "`https://cvrapi.dk/api?country=dk&search=${cvr}`");
    expect(kopi).not.toBe(oprettelseRaa);
    expect(naevnerCvrapi(kopi)).toBe(true);
    expect(naevnerCvrapi(oprettelseRaa + "\n// før: https://cvrapi.dk/api?country=dk&search=…\n")).toBe(true);
  });

  it("et log-kald der lækker nøglen eller headeren → fanges; flerlinjede kald ses også", () => {
    const kopiNoegle = oprettelse.replace(
      'console.error("[virksomhedsOprettelse] DATACVR_API_KEY mangler — CVR-opslag springes over");',
      'console.error("[virksomhedsOprettelse] DATACVR_API_KEY mangler — CVR-opslag springes over", noegle);',
    );
    expect(kopiNoegle).not.toBe(oprettelse);
    expect(logKaldMedHemmelighed(kopiNoegle)).toHaveLength(1);
    const kopiHeader = oprettelse + "\nconsole.log(\n  \"headers\",\n  { Authorization: `Bearer ${noegle}` },\n);\n";
    expect(logKaldMedHemmelighed(kopiHeader)).toHaveLength(1);
    // «noegle» som del af et andet ord (fx DATACVR_API_KEY-teksten eller «nøgle» med ø) fanges IKKE — kun variablen.
    expect(logKaldMedHemmelighed('console.log("nøglen blev afvist — se DATACVR_API_KEY");')).toEqual([]);
  });

  it("MAKS_OPSLAG sat tilbage til 45 → falsk", () => {
    const kopi = berig.replace("const MAKS_OPSLAG = 20;", "const MAKS_OPSLAG = 45;");
    expect(kopi).not.toBe(berig);
    expect(maksOpslagEr20(kopi)).toBe(false);
  });
});
