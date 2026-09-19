import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for «tidligst»-datoen (18/9): kolonnen, functionen, handlingen, fladen og forsiden.
const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");

const MIG = "supabase/migrations/20260919090000_ventepladser_tidligst.sql";
const IO = "supabase/functions/_shared/venteliste.ts";
const HANDLING = "supabase/functions/venteliste-handling/index.ts";
const API = "src/lib/hjemmebane/ventelisteApi.ts";
const FLADE = "src/components/hjemmebane/virksomhed/VentelisteHandlinger.tsx";
const DASH = "src/components/AdvisorDashboard.tsx";

export const migrationen = (k: string): boolean => k.includes("add column if not exists tidligst_tilbud_at date;");
/** Functionen: kolonnen læses, tilbuddet filtrerer på datoen FØR naesteIKoen (C's linje står urørt), saet skriver den. */
export const functionenHolderTilbage = (k: string): boolean =>
  k.includes("tilbud_nr, tidligst_tilbud_at\";") &&
  k.includes("const koe = klarTilTilbud(await hentKoe(admin, companyId), nu);") &&
  k.includes("const naeste = naesteIKoen(koe);") &&
  k.includes("tidligst_tilbud_at: i.tidligstTilbudAt ?? null");
export const handlingenTagerDatoen = (k: string): boolean =>
  /tidligst_tilbud_at skal være «YYYY-MM-DD»/.test(k) && k.includes("satAf: callerId, tidligstTilbudAt })");
export const fladenViserDatoen = (k: string): boolean =>
  k.includes("const naeste = naesteIKoen(klarTilTilbud(raekker, nu));") && k.includes("data-venteliste-tidligst=") && k.includes("må først tilbydes");
export const forsidenHolderTilbage = (k: string): boolean =>
  k.includes("const naeste = naesteIKoen(klarTilTilbud(raekker, now));") && k.includes("tidligst_tilbud_at, ansoegninger(lukket_at, navn, email, cvr_opslag)");
export const apiLaeserDatoen = (k: string): boolean => k.includes("tidligst_tilbud_at, ansoegninger(lukket_at") && k.includes("tidligst_tilbud_at: tidligstTilbudAt");

describe("ventelisteTidligst.guard — datoen holder køen tilbage hele vejen", () => {
  it("migration", () => expect(migrationen(laes(MIG))).toBe(true));
  it("functionen", () => expect(functionenHolderTilbage(udenKommentarer(laes(IO)))).toBe(true));
  it("venteliste-handling saet", () => expect(handlingenTagerDatoen(udenKommentarer(laes(HANDLING)))).toBe(true));
  it("virksomhedssiden", () => expect(fladenViserDatoen(udenKommentarer(laes(FLADE)))).toBe(true));
  it("forsiden", () => expect(forsidenHolderTilbage(udenKommentarer(laes(DASH)))).toBe(true));
  it("web-api", () => expect(apiLaeserDatoen(udenKommentarer(laes(API)))).toBe(true));
  it("VÆRNET VIRKER: tilbuddet uden filtret → falsk; forsiden uden → falsk; fladen uden → falsk", () => {
    expect(functionenHolderTilbage(udenKommentarer(laes(IO)).replace("const koe = klarTilTilbud(await hentKoe(admin, companyId), nu);", "const koe = await hentKoe(admin, companyId);"))).toBe(false);
    expect(forsidenHolderTilbage(udenKommentarer(laes(DASH)).replace("naesteIKoen(klarTilTilbud(raekker, now))", "naesteIKoen(raekker)"))).toBe(false);
    expect(fladenViserDatoen(udenKommentarer(laes(FLADE)).replace("naesteIKoen(klarTilTilbud(raekker, nu))", "naesteIKoen(raekker)"))).toBe(false);
  });
});
