import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for ad_id_udledt (20/9-2026, udkast-ad-id-udledt). Tre domme med selvbevis:
//   1. RÅVÆRDIEN RØRES IKKE: ingen kode skriver til utm_content ud fra ad_id_udledt, og
//      koblingen læser ad_id_udledt KUN når utm_content ikke selv er et id.
//   2. Hentningen prøver med de udledte kolonner FØRST og falder tilbage til sporet alene —
//      ikke direkte til «uden spor» — når kun den udledte kolonne mangler.
//   3. De udledte kolonner står i deres egen liste, ikke i ANNONCESPOR_KOLONNER (som er låst til
//      migration 20260919150000 af webinarFlade.guard dom 5).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const PRISER = "src/lib/webinar/annoncepriser.ts";
const HOOK = "src/hooks/webinarDashboard.ts";
const KOLONNER = "src/lib/webinar/kolonner.ts";

export const raavaerdienRoeresIkke = (k: string): boolean =>
  k.includes("const udledt = tekst(r.ad_id_udledt);") &&
  k.includes("if (!erMetaObjektId(maerke) && udledt !== null && erMetaObjektId(udledt)) {") &&
  k.includes("brud.kobletViaUdledt++") &&
  !/utm_content\s*=/.test(k) &&
  k.indexOf("const udledt = tekst(r.ad_id_udledt);") < k.indexOf("} else if (erMetaObjektId(maerke)) {");

export const hentningenFalderEtTrinAdGangen = (k: string): boolean => {
  const a = k.indexOf("q(medUdledte(medAnnoncespor(TILMELDING_KOLONNER)))");
  const b = k.indexOf("q(medAnnoncespor(TILMELDING_KOLONNER))");
  const c = k.indexOf("q(udenAnnoncespor(TILMELDING_KOLONNER))");
  return a !== -1 && b !== -1 && c !== -1 && a < b && b < c &&
    k.includes("if (!erUkendtKolonne(medAlt.error)) throw new HentningsFejl(") &&
    k.includes("if (!erUkendtKolonne(fuld.error)) throw new HentningsFejl(");
};

export const egenListe = (k: string): boolean =>
  k.includes('export const UDLEDTE_KOLONNER = ["ad_id_udledt"] as const;') &&
  !/ANNONCESPOR_KOLONNER = \[[^\]]*ad_id_udledt/.test(k);

describe("adIdUdledt.guard — på repoets filer", () => {
  it("1. råværdien røres ikke, og den udledte læses kun når utm_content ikke er et id", () => expect(raavaerdienRoeresIkke(udenKommentarer(laes(PRISER)))).toBe(true));
  it("2. hentningen prøver med de udledte først og falder ét trin ad gangen", () => expect(hentningenFalderEtTrinAdGangen(udenKommentarer(laes(HOOK)))).toBe(true));
  it("3. de udledte kolonner har egen liste", () => expect(egenListe(udenKommentarer(laes(KOLONNER)))).toBe(true));
});

describe("adIdUdledt.guard — dommene fanger fejlen på en kopi", () => {
  it("1. den udledte vinder over et rigtigt id, eller utm_content overskrives: rød", () => {
    const k = udenKommentarer(laes(PRISER));
    expect(raavaerdienRoeresIkke(k.split("if (!erMetaObjektId(maerke) && udledt !== null && erMetaObjektId(udledt)) {").join("if (udledt !== null && erMetaObjektId(udledt)) {"))).toBe(false);
    expect(raavaerdienRoeresIkke(k + "\nr.utm_content = udledt;")).toBe(false);
  });
  it("2. hentningen springer trin 2 over, eller kaster ikke på en fremmed fejl: rød", () => {
    const k = udenKommentarer(laes(HOOK));
    expect(hentningenFalderEtTrinAdGangen(k.split("q(medAnnoncespor(TILMELDING_KOLONNER))").join("q(udenAnnoncespor(TILMELDING_KOLONNER))"))).toBe(false);
    expect(hentningenFalderEtTrinAdGangen(k.split("if (!erUkendtKolonne(medAlt.error)) throw new HentningsFejl(").join(""))).toBe(false);
  });
  it("3. ad_id_udledt lagt ind i annoncesporets liste: rød", () => {
    const k = udenKommentarer(laes(KOLONNER));
    expect(egenListe(k.split('"utm_source", "utm_medium",').join('"ad_id_udledt", "utm_source", "utm_medium",'))).toBe(false);
  });
});
