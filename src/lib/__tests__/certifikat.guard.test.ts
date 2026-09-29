/**
 * Kildeværn for «Dit certifikat» (29/9-2026). Fem domme med selvbevis:
 *   1. PAKKENS FILER ER LÅST: certifikatet (designs/, parts.tsx, certificate.css,
 *      Certificate.tsx, types.ts, format.ts, designs.ts, exportCertificate.ts) og
 *      de faste assets (fonte, underskrifter) har de SHA-256-aftryk, de fik ved
 *      indflytningen fra ~/Downloads/boardroom-certifikat 29/9 — parts.tsx med
 *      husets to rådgiverfotos og logo-noten som eneste ændring. En ændring af
 *      designet er en BESLUTNING (HANDOFF §9 «Designregler») og skal opdatere
 *      aftrykket her med vilje.
 *   2. DATE-STRENGEN LÆSES SOM DANSK KALENDERDAG: dom.ts splitter «YYYY-MM-DD»
 *      og kalder new Date(år, måned - 1, dag) — aldrig new Date(streng) eller
 *      Date.parse, som er UTC-midnat og én dag for tidligt vest for UTC.
 *   3. SKJULT → FORSIDEN: siden sender et skjult dom til «/» (også ved direkte
 *      URL), og ruten står under MemberRoute.
 *   4. INGEN TANKESTREGER i fladens tekster (CertificatePage.tsx uden kommentarer).
 *   5. MENUPUNKTET bygges kun i hbNav.ts' certifikatPunkt og kun, når tilstanden er sat.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const aftryk = (sti: string) => createHash("sha256").update(readFileSync(resolve(process.cwd(), sti))).digest("hex");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const K = "src/components/hjemmebane/certifikat";
const DOM = "src/lib/certifikat/dom.ts";
const SIDE = "src/pages/Certifikat.tsx";
const FLADE = `${K}/CertificatePage.tsx`;
const NAV = "src/lib/hjemmebane/hbNav.ts";

/** Målt 29/9-2026 (shasum -a 256) efter indflytningen. */
export const LAASTE_AFTRYK: Record<string, string> = {
  [`${K}/types.ts`]: "2f30c9f2ca3152fe1b3f3e416e6823b1cf0647b1d6e8f6aa5badc9ccee1da53c",
  [`${K}/format.ts`]: "ade6f793322803a94ea1a691f0a112a8151e4ebb337215edd878fe70f7089ae1",
  [`${K}/designs.ts`]: "570af5f4433868c869835989055525389c91eb2f16aa955f81d4382b59ae28a7",
  [`${K}/certificate.css`]: "91b34f94f636e09f80238d27aaedf2ce7a45affaf2d972c61455e5433eb10217",
  [`${K}/Certificate.tsx`]: "c6619220ebdf4ba21fcd2e4ebff8cacc93f1348c0b664e8bd6e1b65323c1d0c4",
  [`${K}/exportCertificate.ts`]: "7a52e877365a395cc0b0d0739601f2a8eb41eb747f097c9bfe7d8dec7b6a12f4",
  [`${K}/parts.tsx`]: "42b09951b7a17273c62467a6aef8b6507ccbd356f3345681145e2935e7fc636d",
  [`${K}/designs/LegatSegl.tsx`]: "6a7acbbc4109d681c27502ef4499f29e5d0075ef25e371943eb34f0274a2ea6d",
  [`${K}/designs/MorkKlassiker.tsx`]: "fe412e797e295489a0ca4180d19a369ad9afa485cb6b430e70df2ef4b8dcc949",
  [`${K}/designs/Portraet.tsx`]: "251550d5d4a88b65c1996233154b7bc09c70a59d0c9f1a642c4b446b0686f1ad",
  [`${K}/designs/RaadgivereLys.tsx`]: "90c9b62155cc7eddac4fdd546d8a48b628c7278143149b8b5cf863016aeb417c",
  [`${K}/designs/RaadgivereMork.tsx`]: "9336f7ec28374048d4423e62c6c0bddde89299cc481aaf54d1f4fce97f5e0c43",
  "public/certificates/fonts/GildaDisplay-Regular.ttf": "8ca5475692552cd4f149bcd00099c098453c39b8541f4abe2192f84ad17a7aa0",
  "public/certificates/fonts/Manrope-VariableFont_wght.ttf": "42814a407491bfe54e4bfbc51ff6500d39445e49cc3feedea984cb5a768b04aa",
  "public/certificates/fonts/Parkinsans-VariableFont_wght.ttf": "e1779a28979ddab9b666ad0b8ac68c4471cca5150cc891b321ad7672ddb90366",
  "public/certificates/signatures/jonas-herlev-dark.svg": "9c380ea6d975a2d0e6c2784fa249ae6dcd797ff3bbf1a2279fcd73b367a761a9",
  "public/certificates/signatures/jonas-herlev-light.svg": "477db7a56131a123f6e225a23788e1f439d2780254aef1b71c3e43cf5057dbd7",
  "public/certificates/signatures/morten-larsen-dark.svg": "53d3f75670bde1a7cc5cf1fe2e6acbf7f9d1d5392d2dbd06d2cfd7a26c1b6c08",
  "public/certificates/signatures/morten-larsen-light.svg": "6dd2619d022e3cbf6cdab8f1c1d381d34cab1e48d0cc3440687e479803e50645",
};

/** Dom 2: læsningen splitter og bygger datoen af tre tal — ingen strengparsing af en dato. */
export const laeserDanskDato = (k: string): boolean =>
  k.includes("const DATO = /^(\\d{4})-(\\d{2})-(\\d{2})$/;") &&
  k.includes("const d = new Date(aar, maaned - 1, dag);") &&
  !/new Date\((s|input\.kontraktStart|kontraktStart|t|str)\)/.test(k) &&
  !/Date\.parse\(/.test(k) &&
  !/new Date\(`/.test(k) &&
  !/new Date\((s|t)\s*\+/.test(k);

/** Dom 3: skjult sender til forsiden; ruten er medlemmets. */
export const skjultGaarTilForsiden = (side: string, app: string): boolean =>
  side.includes('if (c.dom.synlig === false) return <Navigate to="/" replace />;') &&
  app.includes('<Route path="/certifikat" element={<MemberRoute><Certifikat /></MemberRoute>} />');

/** Dom 4: ingen tankestreg i fladen (kommentarer undtaget). */
export const udenTankestreg = (k: string): boolean => !udenKommentarer(k).includes("—");

/**
 * Dom 5: medlemmets punkt bygges ét sted og kun når tilstanden er sat — og
 * (29/9 aften, Jonas: «Jeg kan jo heller ikke finde det som rådgiver»)
 * rådgiverens punkt står i raadgiverensNav og peger på forhåndsvisningen.
 * PRÆCIS tre forekomster af CERTIFIKAT_LABEL: konstanten, certifikatPunkt og
 * raadgiverensNav. Aldrig i medlemmetsNav uden for certifikatPunkt, og
 * teksten label: "Dit certifikat" står aldrig direkte.
 */
export const punktetKunNaarSat = (k: string): boolean => {
  const medlem = k.slice(k.indexOf("export function medlemmetsNav("), k.indexOf("export const CERTIFIKAT_LABEL"));
  const punkt = k.slice(k.indexOf("function certifikatPunkt("), k.indexOf("export function raadgiverensNav("));
  const raad = k.slice(k.indexOf("export function raadgiverensNav("), k.indexOf("export function bygHbNav("));
  return k.includes("if (certifikat) punkter.push(certifikatPunkt(active, certifikat));") &&
    k.includes('export const CERTIFIKAT_LABEL = "Dit certifikat";') &&
    (k.match(/CERTIFIKAT_LABEL/g) ?? []).length === 3 &&
    punkt.includes('const punkt: HbNavEntry = { label: CERTIFIKAT_LABEL, to: "/certifikat", active: active === "certifikat" };') &&
    raad.includes('{ label: CERTIFIKAT_LABEL, to: "/certifikat/forhaandsvisning", active: active === "certifikat", blok: medlem },') &&
    !medlem.includes("CERTIFIKAT_LABEL") &&
    !/label: "Dit certifikat"/.test(k);
};

describe("certifikat.guard — dom 1: pakkens filer er låst på aftryk", () => {
  for (const [sti, forventet] of Object.entries(LAASTE_AFTRYK)) {
    it(`${sti} har sit aftryk fra 29/9`, () => {
      expect(aftryk(sti)).toBe(forventet);
    });
  }
  it("VÆRNET VIRKER: ét tegn mere giver et andet aftryk (sammenligningen er over indholdet)", () => {
    const a = createHash("sha256").update(readFileSync(resolve(process.cwd(), `${K}/format.ts`))).digest("hex");
    const b = createHash("sha256").update(readFileSync(resolve(process.cwd(), `${K}/format.ts`)) + "x").digest("hex");
    expect(a).toBe(LAASTE_AFTRYK[`${K}/format.ts`]);
    expect(b).not.toBe(a);
  });
  it("alle nitten filer findes (en slettet fil er også et brud)", () => {
    expect(Object.keys(LAASTE_AFTRYK)).toHaveLength(19);
    for (const sti of Object.keys(LAASTE_AFTRYK)) expect(() => readFileSync(resolve(process.cwd(), sti))).not.toThrow();
  });
});

describe("certifikat.guard — dom 2: DATE-strengen læses som dansk kalenderdag", () => {
  it("dom.ts splitter og bygger af tre tal", () => {
    expect(laeserDanskDato(udenKommentarer(laes(DOM)))).toBe(true);
  });
  it("VÆRNET VIRKER: new Date(s) i stedet for de tre tal fælder — og en kommentar om det fælder ikke", () => {
    const k = udenKommentarer(laes(DOM));
    expect(laeserDanskDato(k.replace("const d = new Date(aar, maaned - 1, dag);", "const d = new Date(s);"))).toBe(false);
    expect(laeserDanskDato(k.replace("const d = new Date(aar, maaned - 1, dag);", "const d = new Date(Date.parse(s));"))).toBe(false);
    expect(laeserDanskDato(k.replace("const d = new Date(aar, maaned - 1, dag);", "const d = new Date(`${s}T00:00:00`);"))).toBe(false);
    expect(laeserDanskDato(k.replace("const DATO = /^(\\d{4})-(\\d{2})-(\\d{2})$/;", "const DATO = /^(\\d{4})-(\\d{2})/;"))).toBe(false);
    // Kommentaren i filhovedet nævner new Date("2025-10-22") — den dømmes ikke, koden gør.
    expect(laes(DOM)).toContain('new Date("2025-10-22")');
    expect(laeserDanskDato(udenKommentarer(laes(DOM)))).toBe(true);
  });
});

describe("certifikat.guard — dom 3: skjult går til forsiden, ruten er medlemmets", () => {
  it("siden og App.tsx", () => {
    expect(skjultGaarTilForsiden(laes(SIDE), laes("src/App.tsx"))).toBe(true);
  });
  it("VÆRNET VIRKER: en side, der viser noget til den skjulte, fælder; en rute uden MemberRoute fælder", () => {
    const side = laes(SIDE);
    const app = laes("src/App.tsx");
    expect(skjultGaarTilForsiden(side.replace('if (c.dom.synlig === false) return <Navigate to="/" replace />;', "if (c.dom.synlig === false) return <p>Ikke endnu</p>;"), app)).toBe(false);
    expect(skjultGaarTilForsiden(side, app.replace("<MemberRoute><Certifikat /></MemberRoute>", "<Certifikat />"))).toBe(false);
  });
});

describe("certifikat.guard — dom 4: ingen tankestreger i fladens tekster", () => {
  it("CertificatePage.tsx (uden kommentarer) og siden", () => {
    expect(udenTankestreg(laes(FLADE))).toBe(true);
    expect(udenTankestreg(laes(SIDE))).toBe(true);
  });
  it("VÆRNET VIRKER: én tankestreg i en tekst fælder; i en kommentar fælder den ikke", () => {
    expect(udenTankestreg(laes(FLADE).replace('klarTilPrint: "A4 liggende, klar til print"', 'klarTilPrint: "A4 liggende — klar til print"'))).toBe(false);
    expect(udenTankestreg(`${laes(FLADE)}\n// en kommentar — med tankestreg\n`)).toBe(true);
  });
});

describe("certifikat.guard — dom 5: menupunktet bygges ét sted, kun når tilstanden er sat", () => {
  it("hbNav.ts", () => {
    expect(punktetKunNaarSat(udenKommentarer(laes(NAV)))).toBe(true);
  });
  it("VÆRNET VIRKER: et ubetinget push fælder; et andet sted med labelen fælder", () => {
    const k = udenKommentarer(laes(NAV));
    expect(punktetKunNaarSat(k.replace("if (certifikat) punkter.push(certifikatPunkt(active, certifikat));", "punkter.push(certifikatPunkt(active, certifikat ?? \"aaben\"));"))).toBe(false);
    expect(punktetKunNaarSat(`${k}\nconst x = { label: "Dit certifikat", to: "/certifikat" };\n`)).toBe(false);
  });
  it("VÆRNET VIRKER: rådgiverens punkt til /certifikat, en fjerde forekomst i medlemmetsNav, eller rådgiverens punkt fjernet, fælder", () => {
    const k = udenKommentarer(laes(NAV));
    const RAAD = '{ label: CERTIFIKAT_LABEL, to: "/certifikat/forhaandsvisning", active: active === "certifikat", blok: medlem },';
    expect(k.includes(RAAD)).toBe(true);
    // (a) rådgiverens punkt peger på /certifikat (som skjuler siden for rådgivere)
    expect(punktetKunNaarSat(k.replace(RAAD, '{ label: CERTIFIKAT_LABEL, to: "/certifikat", active: active === "certifikat", blok: medlem },'))).toBe(false);
    // (b) en fjerde forekomst i medlemmetsNav uden for certifikatPunkt
    const fjerde = k.replace(
      '{ label: "Fortæl det videre", to: "/deling", active: active === "deling" },',
      '{ label: "Fortæl det videre", to: "/deling", active: active === "deling" },\n    { label: CERTIFIKAT_LABEL, to: "/certifikat", active: active === "certifikat" },',
    );
    expect(fjerde).not.toBe(k);
    expect(punktetKunNaarSat(fjerde)).toBe(false);
    // (c) rådgiverens punkt fjernet — to forekomster
    expect(punktetKunNaarSat(k.replace(RAAD, ""))).toBe(false);
  });
});
