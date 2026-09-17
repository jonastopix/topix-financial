import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (17/9-2026, rådgivernes forside PR 3 — links på navnene;
// analyse-raadgivernes-forside.md §3.1 pkt. 2, §6 forslag 3: «Siden sidst» og
// «Nye medlemmer» nævnte navne uden link). Fem domme, læst i kilden:
//   1. «Siden sidst» tegnes af DELENE (sidenSidstLinjeDele): hvert navn med id
//      er et <Link to={virksomhedsLink(v.id)}> i husets tekstlink-klasser;
//      skilletegnene (sidenSidstNavneSep, «, » / « og ») og halen («og N
//      andre») står som TEKST uden for linket; et navn uden id (den gamle
//      RPC) står som tekst.
//   2. «Nye medlemmer» tegnes af delene (ikkeKommetIgenDele): hvert navn et
//      <Link to={virksomhedsLink(v.id)}>, kommaerne som tekst (`{i > 0 && ", "}`),
//      halen fra ikkeKommetIgenHale — ingen knapflade.
//   3. Hooken prøver den NYE RPC først (get_siden_sidst_virksomheder) og
//      falder KUN tilbage til den gamle (get_siden_sidst) på «funktionen
//      findes ikke» (erFunktionenIkkeFundet: PGRST202) — andre fejl kastes.
//   4. Migrationen laver en NY funktion (CREATE OR REPLACE på det nye navn),
//      SECURITY DEFINER m. search_path = public, has_role-gaten i WHERE,
//      GRANT EXECUTE TO authenticated, «LIMIT 6», jsonb med id+name — og
//      rører IKKE den gamle (ingen DROP/REPLACE af get_siden_sidst(…)).
//   5. Delene siger det teksten siger: sidenSidstLinjeTekst(dele) ===
//      sidenSidstLinjer(...).tekst, og ikkeKommetIgenDeleTekst(dele) ===
//      ikkeKommetIgenTekst(navne) — låst i enhedstestene, her på kildeplan:
//      begge tekstfunktioner findes stadig (fladens gamle form kan genskabes).
// Selvbevis («VÆRNET VIRKER») kører hver dom på kopier med fejlen indsat.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");

const FLADE = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";
const HOOK = "src/hooks/sidenSidst.ts";
const LIB = "src/lib/sidenSidst.ts";
const KOHORTE = "src/lib/hjemmebane/kohorte.ts";
const MIGRATION = "supabase/migrations/20260917170000_siden_sidst_virksomheder.sql";

const LINK = "<Link to={virksomhedsLink(v.id)} className={TEKSTLINK}>{v.navn}</Link>";

/** Blokken for «Siden sidst»: fra `Siden sidst{` til `{KOHORTE_OVERSKRIFT}`. */
export function sidenSidstBlok(flade: string): string {
  const start = flade.indexOf("Siden sidst{");
  const slut = flade.indexOf("{KOHORTE_OVERSKRIFT}", start);
  return start === -1 || slut === -1 ? "" : flade.slice(start, slut);
}
/** Blokken for «Nye medlemmer»: fra `{KOHORTE_OVERSKRIFT}` til `{KORT_OVERSKRIFT}`. */
export function kohorteBlok(flade: string): string {
  const start = flade.indexOf("{KOHORTE_OVERSKRIFT}");
  const slut = flade.indexOf("{KORT_OVERSKRIFT}", start);
  return start === -1 || slut === -1 ? "" : flade.slice(start, slut);
}

/** Dom 1. */
export const sidenSidstLinker = (flade: string): boolean => {
  const b = sidenSidstBlok(flade);
  return (
    b.includes("sidenSidstLinjeDele(sidenSidstQuery.data.raekker)") &&
    b.includes("{sidenSidstNavneSep(i, l.viste.length, l.efter !== \"\")}") &&
    b.includes(LINK) &&
    /\{v\.id \? \(\s*<Link to=\{virksomhedsLink\(v\.id\)\}/.test(b) &&
    b.includes("{l.efter && ` og ${l.efter}`}") &&
    !b.includes("sidenSidstLinjer(") &&
    !/<button/.test(b) &&
    flade.includes('const TEKSTLINK = "text-hb-evergreen underline-offset-4 hover:underline";') &&
    flade.includes("const virksomhedsLink = (companyId: string) => `/virksomhed/${companyId}`;")
  );
};

/** Dom 2. */
export const kohorteLinker = (flade: string): boolean => {
  const b = kohorteBlok(flade);
  return (
    b.includes("ikkeKommetIgenDele(linje.ikkeKommetIgenVirksomheder)") &&
    b.includes("{IKKE_KOMMET_IGEN_PRAEFIKS}") &&
    b.includes('{i > 0 && ", "}') &&
    b.includes(LINK) &&
    b.includes("{ikkeKommetIgenHale(ikke.flere)}") &&
    !b.includes("ikkeKommetIgenTekst(") &&
    !/<button/.test(b)
  );
};

/** Dom 3. */
export const hookenFalderKunTilbagePaaManglendeFunktion = (hook: string): boolean => {
  const h = udenKommentarer(hook);
  const ny = h.indexOf("supabase.rpc(SIDEN_SIDST_RPC as any, param)");
  const gammel = h.indexOf("supabase.rpc(SIDEN_SIDST_RPC_GAMMEL as any, param)");
  return (
    h.includes('export const SIDEN_SIDST_RPC = "get_siden_sidst_virksomheder";') &&
    h.includes('export const SIDEN_SIDST_RPC_GAMMEL = "get_siden_sidst";') &&
    ny !== -1 && gammel > ny &&
    h.includes("if (!erFunktionenIkkeFundet(ny.error)) throw new Error(ny.error.message);") &&
    h.slice(ny, gammel).includes("if (!ny.error) {") &&
    (h.match(/supabase\.rpc\(/g) ?? []).length === 2
  );
};

/** Dom 4. */
export const migrationenErNyOgUaendretSikker = (sql: string): boolean => {
  const s = sql.replace(/^--[^\n]*$/gm, "");
  return (
    s.includes("CREATE OR REPLACE FUNCTION public.get_siden_sidst_virksomheder(siden timestamptz)") &&
    s.includes("RETURNS TABLE (slags text, antal integer, virksomheder jsonb)") &&
    s.includes("LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public") &&
    s.includes("WHERE has_role(auth.uid(), 'advisor'::app_role)") &&
    s.includes("GRANT EXECUTE ON FUNCTION public.get_siden_sidst_virksomheder(timestamptz) TO authenticated;") &&
    s.includes("LIMIT 6") &&
    s.includes("jsonb_build_object('id', q.company_id, 'name', q.name)") &&
    !/DROP FUNCTION/i.test(s) &&
    !/FUNCTION public\.get_siden_sidst\(/.test(s) &&
    !/ALTER TABLE|CREATE POLICY|DROP POLICY/i.test(s)
  );
};

/** Dom 5. */
export const tekstformerneBestaar = (lib: string, kohorte: string): boolean =>
  lib.includes("export function sidenSidstLinjer(") &&
  lib.includes("export function sidenSidstLinjeDele(") &&
  lib.includes("export function sidenSidstLinjeTekst(") &&
  lib.includes("export function erFunktionenIkkeFundet(") &&
  kohorte.includes("export function ikkeKommetIgenTekst(") &&
  kohorte.includes("export function ikkeKommetIgenDele(") &&
  kohorte.includes("export function ikkeKommetIgenDeleTekst(");

describe("forsideNavneLinker.guard — links på navnene i «Siden sidst» og «Nye medlemmer»", () => {
  const flade = udenKommentarer(laes(FLADE));
  const hook = laes(HOOK);
  const lib = laes(LIB);
  const kohorte = laes(KOHORTE);
  const sql = laes(MIGRATION);

  it("1. «Siden sidst»: navne med id er tekstlinks, skilletegn og hale som tekst, ingen knapflade", () => {
    expect(sidenSidstLinker(flade)).toBe(true);
  });
  it("2. «Nye medlemmer»: hvert navn et tekstlink, kommaerne som tekst", () => {
    expect(kohorteLinker(flade)).toBe(true);
  });
  it("3. hooken prøver den nye RPC først og falder kun tilbage på PGRST202", () => {
    expect(hookenFalderKunTilbagePaaManglendeFunktion(hook)).toBe(true);
  });
  it("4. migrationen: ny funktion, samme sikkerhed, den gamle urørt", () => {
    expect(migrationenErNyOgUaendretSikker(sql)).toBe(true);
  });
  it("5. tekstformerne består ved siden af delene", () => {
    expect(tekstformerneBestaar(lib, kohorte)).toBe(true);
  });
});

describe("forsideNavneLinker.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const flade = udenKommentarer(laes(FLADE));
  const hook = laes(HOOK);
  const lib = laes(LIB);
  const kohorte = laes(KOHORTE);
  const sql = laes(MIGRATION);

  it("1. den gamle tekstform, en knap, eller skilletegn inde i linket fælder dom 1", () => {
    expect(sidenSidstLinker(flade.replace("sidenSidstLinjeDele(sidenSidstQuery.data.raekker)", "sidenSidstLinjer(sidenSidstQuery.data.raekker)"))).toBe(false);
    expect(sidenSidstLinker(flade.replace(LINK, "<button type=\"button\">{v.navn}</button>"))).toBe(false);
    expect(sidenSidstLinker(flade.replace("{sidenSidstNavneSep(i, l.viste.length, l.efter !== \"\")}", ""))).toBe(false);
  });
  it("2. den gamle tekstform i kohorten fælder dom 2", () => {
    expect(kohorteLinker(flade.replace("ikkeKommetIgenDele(linje.ikkeKommetIgenVirksomheder)", "ikkeKommetIgenTekst(linje.ikkeKommetIgen)"))).toBe(false);
    expect(kohorteLinker(flade.replace('{i > 0 && ", "}', ""))).toBe(false);
  });
  it("3. fald-tilbage på ALLE fejl, eller den gamle RPC først, fælder dom 3", () => {
    expect(hookenFalderKunTilbagePaaManglendeFunktion(hook.replace("if (!erFunktionenIkkeFundet(ny.error)) throw new Error(ny.error.message);", ""))).toBe(false);
    expect(hookenFalderKunTilbagePaaManglendeFunktion(hook.replace('export const SIDEN_SIDST_RPC = "get_siden_sidst_virksomheder";', 'export const SIDEN_SIDST_RPC = "get_siden_sidst";'))).toBe(false);
  });
  it("4. en migration uden has_role, uden search_path, eller der rører den gamle funktion, fælder dom 4", () => {
    expect(migrationenErNyOgUaendretSikker(sql.replace("WHERE has_role(auth.uid(), 'advisor'::app_role)", "WHERE true"))).toBe(false);
    expect(migrationenErNyOgUaendretSikker(sql.replace(" SET search_path = public", ""))).toBe(false);
    expect(migrationenErNyOgUaendretSikker(sql + "\nDROP FUNCTION public.get_siden_sidst(timestamptz);\n")).toBe(false);
    expect(migrationenErNyOgUaendretSikker(sql + "\nCREATE OR REPLACE FUNCTION public.get_siden_sidst(siden timestamptz) RETURNS void LANGUAGE sql AS $$ select 1 $$;\n")).toBe(false);
  });
  it("5. en fjernet tekstform fælder dom 5", () => {
    expect(tekstformerneBestaar(lib.replace("export function sidenSidstLinjer(", "function sidenSidstLinjer("), kohorte)).toBe(false);
    expect(tekstformerneBestaar(lib, kohorte.replace("export function ikkeKommetIgenTekst(", "function ikkeKommetIgenTekst("))).toBe(false);
  });
});
