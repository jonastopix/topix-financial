import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { KENDTE_FELTER, KENDTE_FELTNAVNE, felterITekst, ukendteFelter } from "../../../supabase/functions/_shared/aftalefelter.ts";

// Kildeværn for aftaleskabelonens felter (18/9-2026). Formålet: en fremtidig
// tekstændring må ALDRIG kunne sende et dokument med rå {{…}} til et medlem,
// og listen over hvad koden kan udfylde skal stå ét sted.
//
//   1. send-til-underskrift udfylder PRÆCIS listen i aftalefelter.ts —
//      hverken flere (et felt listen ikke kender) eller færre (et felt teksten
//      må bruge, som funktionen glemmer).
//   2. Hver skabelontekst i repoet (migrationerne + supabase/aftale/*.md, hvor
//      den godkendte tekst lægges som kanonisk kopi) bruger kun kendte felter.
//   3. {{samlet_kr}} er IKKE kendt — bevidst (STOP-punkt: beløbet vælges efter
//      underskriften) — så en tekst med det stoppes med 422, ikke gættes.
//   4. Funktionen har værnet i drift (kaster hvis den udfylder uden for listen)
//      og forhåndsvisningen skriver og sender intet.
// Selvbevis på kopier: hvert prædikat fælder en muteret kilde.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const FUNKTION = "supabase/functions/send-til-underskrift/index.ts";

/** Nøglerne send-til-underskrift lægger i `felter`: literalen `{ a: …, b: … }` + `felter.x =`. */
export function funktionensFelter(kilde: string): string[] {
  const k = udenKommentarer(kilde);
  const start = k.indexOf("const felter: Record<string, string> = {");
  const slut = k.indexOf("};", start);
  const literal = k.slice(start, slut);
  const navne = new Set<string>();
  for (const m of literal.matchAll(/^\s*([a-z_0-9]+):/gm)) navne.add(m[1]);
  for (const m of k.matchAll(/\bfelter\.([a-z_0-9]+)\s*=/g)) navne.add(m[1]);
  return [...navne].sort();
}

/** Skabelontekster i repoet: migrationernes E'…'/'…'-indsættelser i aftale_skabelon og supabase/aftale/*.md. */
export function skabelontekster(): Array<{ fil: string; tekst: string }> {
  const ud: Array<{ fil: string; tekst: string }> = [];
  for (const f of readdirSync(resolve(ROD, "supabase/migrations"))) {
    const sql = laes(`supabase/migrations/${f}`);
    if (!sql.includes("aftale_skabelon")) continue;
    // Kun teksten der INDSÆTTES tæller — ikke SQL-kommentarer og COMMENT ON, som omtaler «{{pladsholdere}}».
    const udenKommentarer = sql.replace(/^\s*--[^\n]*$/gm, "").replace(/comment on [\s\S]*?;/gi, "");
    ud.push({ fil: f, tekst: udenKommentarer });
  }
  let md: string[] = [];
  try { md = readdirSync(resolve(ROD, "supabase/aftale")).filter((f) => f.endsWith(".md")); } catch { md = []; }
  for (const f of md) ud.push({ fil: `supabase/aftale/${f}`, tekst: laes(`supabase/aftale/${f}`) });
  return ud;
}

export const forhaandsvisningenSkriverIntet = (k: string): boolean => {
  const i = k.indexOf("if (forhaandsvis) {");
  const j = k.indexOf("}", k.indexOf("return jsonResponse({", i));
  const blok = k.slice(i, j);
  return i > 0 && !/\.insert\(|\.update\(|sendIndgangsMail\(|udfoerOvergang\(/.test(blok) && k.indexOf("if (forhaandsvis) {") < k.indexOf('.from("aftale_underskrift")\n      .insert(');
};

/** 5: adresse/postnummer/by udfyldes fra ejeren (companies eller cvr_opslag_cache.svar / slaaCvrOp), og et kendt felt uden værdi afvises (tomme → 422) — også i afsendelsen, ikke kun i forhåndsvisningen. */
export const adressenErVaernet = (k: string): boolean =>
  /adresse: ejer\.adresse \?\? "",\s*postnummer: ejer\.postnummer \?\? "",\s*by: ejer\.by \?\? "",/.test(k) &&
  k.includes('.from("cvr_opslag_cache").select("svar")') && k.includes("await slaaCvrOp(cvr)") &&
  /const tomme = Object\.entries\(felter\)\.filter\(\(\[k, v\]\) => !v && skabelon\.tekst\.includes/.test(k) &&
  k.includes('return jsonResponse({ error: "felter_tomme", tomme }, 422);');

describe("aftalefelter.guard — listen, funktionen og teksterne", () => {
  const kilde = laes(FUNKTION);
  it("1. send-til-underskrift udfylder præcis KENDTE_FELTER", () => {
    expect(funktionensFelter(kilde)).toEqual([...KENDTE_FELTNAVNE].sort());
    expect(new Set(KENDTE_FELTNAVNE).size).toBe(KENDTE_FELTER.length);
  });
  it("2. hver skabelontekst i repoet bruger kun kendte felter", () => {
    const tekster = skabelontekster();
    expect(tekster.length).toBeGreaterThanOrEqual(1);
    for (const t of tekster) expect(ukendteFelter(t.tekst), t.fil).toEqual([]);
  });
  it("3. {{samlet_kr}} er ukendt med vilje — en tekst med det stoppes, ikke gættes", () => {
    expect(KENDTE_FELTNAVNE).not.toContain("samlet_kr");
    expect(ukendteFelter("Købesummen udgør DKK {{samlet_kr}} — {{pris_kr}}")).toEqual(["samlet_kr"]);
  });
  it("4. værnet i drift står i funktionen, og forhåndsvisningen skriver og sender intet", () => {
    const k = udenKommentarer(kilde);
    expect(k).toContain("filter((k) => !KENDTE_FELTNAVNE.includes(k))");
    expect(k).toContain("throw new Error(`felter uden for aftalefelter.ts:");
    expect(k).toContain('return jsonResponse({ error: "pladsholdere_mangler"');
    expect(forhaandsvisningenSkriverIntet(k)).toBe(true);
  });
  it("5. adressen kommer fra CVR-opslaget, og en TOM adresse stopper afsendelsen (Jonas 18/9: aldrig en aftale med tom adresse)", () => {
    const k = udenKommentarer(kilde);
    expect(adressenErVaernet(k)).toBe(true);
  });
  it("Jonas' tolv felter (18/9): elleve kendes, samlet_kr er STOP-punktet", () => {
    const tolv = ["virksomhed", "adresse", "postnummer", "by", "kontaktperson", "cvr", "kontrakt_maaneder", "pris_kr", "samlet_kr", "frist_dage", "dato", "frist_dato"];
    expect(tolv.filter((f) => !KENDTE_FELTNAVNE.includes(f))).toEqual(["samlet_kr"]);
  });
  it("felterITekst: hvert felt én gang, i rækkefølge; mellemrum tåles", () => {
    expect(felterITekst("{{ cvr }} og {{virksomhed}} og {{cvr}}")).toEqual(["cvr", "virksomhed"]);
  });
});

describe("aftalefelter.guard — selvbevis", () => {
  const kilde = laes(FUNKTION);
  it("1: et ekstra felt i funktionen, eller et manglende, falder", () => {
    expect(funktionensFelter(kilde + "\nfelter.hemmelig = 'x';\n")).not.toEqual([...KENDTE_FELTNAVNE].sort());
    expect(funktionensFelter(kilde.replace("felter.kontrakt_maaneder =", "x ="))).not.toEqual([...KENDTE_FELTNAVNE].sort());
  });
  it("2: en tekst med et ukendt felt falder", () => {
    expect(ukendteFelter("Hej {{virksomhed}} — {{bankkonto}}")).toEqual(["bankkonto"]);
  });
  it("5: en adresse der ikke afvises når den er tom, falder", () => {
    expect(adressenErVaernet(udenKommentarer(kilde).replace('return jsonResponse({ error: "felter_tomme", tomme }, 422);', "void tomme;"))).toBe(false);
    expect(adressenErVaernet(udenKommentarer(kilde).replace('adresse: ejer.adresse ?? "",', 'adresse: ejer.adresse ?? "ukendt",'))).toBe(false);
  });
  it("4: forhåndsvisning der sender, falder", () => {
    const k = udenKommentarer(kilde).replace("if (forhaandsvis) {", "if (forhaandsvis) { await sendIndgangsMail({});");
    expect(forhaandsvisningenSkriverIntet(k)).toBe(false);
  });
});
