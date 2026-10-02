import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (2/10-2026): den godkendte mockup til Community-feedet — «N fandt
// det nyttigt» og mærket «Mest læst denne uge». Seks domme over kildetekst;
// «VÆRNET VIRKER» kører dem på kopier med fejlen indsat.
//
//   1. MIGRATIONEN (20261002275000): første linje PRÆCIS «-- IKKE KØRT. KRÆVER
//      JONAS' GRØNNE LYS (SECURITY DEFINER). DEPLOY: …» (eller, efter kørslen,
//      «-- KØRT i prod <dato> … Jonas' grønne lys»); ÉN funktion, SECURITY
//      DEFINER, STABLE, search_path låst til «public, pg_temp»; PORTEN
//      (auth.uid() + kan_laese_community ELLER has_role advisor) står FØR
//      RETURN QUERY; kun status 'aktiv'; forfatteren og tjenestekonti
//      fraregnet; ugen er mandag 00:00 Europe/Copenhagen (to gange AT TIME
//      ZONE om date_trunc('week')); intet bruger-id i RETURNS; ingen
//      skrivning, ingen anden funktion, ingen policy; REVOKE PUBLIC/anon og
//      GRANT authenticated/service_role.
//   2. KLIENTEN er fail-soft: hentMestLaestUge kender 42883 og PGRST202.
//   3. FLADEN dømmer gennem vaelgMestLaest og skriver MEST_LAEST_MAERKE — ingen
//      egen tærskel eller sammenligning af laesere i komponenten, og ordene står
//      ikke hårdkodet i komponenterne.
//   4. LIKE-KNAPPEN skriver nyttigtTekst — «fandt det nyttigt» står ikke
//      hårdkodet i nogen komponent, og knappen viser ikke længere {antal}.
//   5. ORDENEN: en ukørt migration må aldrig sortere før en kørt (19/9) —
//      denne fil står efter den seneste «KØRT i prod».
//   6. BOGFØRINGEN: SECURITY_BASELINE.md og CLAUDE.md nævner funktionen.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");

const MIG_NAVN = "20261002275000_community_mest_laest.sql";
const MIGRATION = `supabase/migrations/${MIG_NAVN}`;
const VIEW = "src/components/hjemmebane/community/CommunityView.tsx";
const LIKE = "src/components/hjemmebane/community/LikeKnap.tsx";
const KOMPONENTER = "src/components/hjemmebane/community";
const API = "src/lib/hjemmebane/communityApi.ts";
const FOERSTE =
  "-- IKKE KØRT. KRÆVER JONAS' GRØNNE LYS (SECURITY DEFINER). DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).";

// ── dom 1 ───────────────────────────────────────────────────────────────────
export function migrationenHolder(m: string): boolean {
  const foerste = m.split("\n")[0];
  if (foerste !== FOERSTE && !/^-- KØRT i prod \d{1,2}\/\d{1,2}-\d{4} .*Jonas' grønne lys/.test(foerste)) return false;
  const kode = udenSqlKommentarer(m);
  // Præcis én funktion, ingen anden DDL.
  if ((kode.match(/CREATE (OR REPLACE )?FUNCTION/g) ?? []).length !== 1) return false;
  if (/\b(CREATE|DROP|ALTER) (POLICY|TABLE|TRIGGER)\b/.test(kode)) return false;
  if (/\bDROP FUNCTION\b/.test(kode)) return false;
  if (/\b(INSERT INTO|UPDATE public\.|DELETE FROM)\b/.test(kode)) return false;
  if (!kode.includes("CREATE OR REPLACE FUNCTION public.community_mest_laest_uge()\nRETURNS TABLE(traad_id uuid, laesere bigint)")) return false;
  // Attributterne i selve hovedet (COMMENT-strengen nævner også SECURITY DEFINER).
  if (!kode.includes("LANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER\nSET search_path = public, pg_temp\nAS $$")) return false;
  // Porten FØR forespørgslen.
  const port = kode.indexOf(
    "IF auth.uid() IS NULL\n     OR NOT (public.kan_laese_community(auth.uid()) OR public.has_role(auth.uid(), 'advisor')) THEN\n    RETURN;",
  );
  const query = kode.indexOf("RETURN QUERY");
  if (port === -1 || query === -1 || port > query) return false;
  const q = kode.slice(query);
  if (!q.includes("WHERE t.status = 'aktiv'")) return false;
  if (!q.includes("AND v.bruger_id <> t.forfatter_id")) return false;
  if (!q.includes("AND NOT EXISTS (SELECT 1 FROM public.tjenestekonti tk WHERE tk.user_id = v.bruger_id)")) return false;
  if (!q.includes("count(DISTINCT v.bruger_id)")) return false;
  if (!q.includes("AND v.set_at >= _ugestart")) return false;
  if (!kode.includes("_ugestart := date_trunc('week', now() AT TIME ZONE 'Europe/Copenhagen')\n                 AT TIME ZONE 'Europe/Copenhagen';")) return false;
  // Kun aggregater ud.
  if (/RETURNS TABLE\([^)]*bruger_id/.test(kode)) return false;
  for (const linje of [
    "REVOKE ALL ON FUNCTION public.community_mest_laest_uge() FROM PUBLIC;",
    "REVOKE ALL ON FUNCTION public.community_mest_laest_uge() FROM anon;",
    "GRANT EXECUTE ON FUNCTION public.community_mest_laest_uge() TO authenticated;",
    "GRANT EXECUTE ON FUNCTION public.community_mest_laest_uge() TO service_role;",
  ]) if (!kode.includes(linje)) return false;
  if (/GRANT[^;]*TO (anon|PUBLIC)\b/.test(kode)) return false;
  // Filhovedet bærer regnestykket, FØR/EFTER, prøven og rollback.
  for (const del of ["UGEGRÆNSEN", "FØR-SQL", "EFTER-SQL", "UNION ALL", "RLS-PRØVE", "ROLLBACK", "DROP FUNCTION IF EXISTS public.community_mest_laest_uge();"]) {
    if (!m.includes(del)) return false;
  }
  return true;
}

// ── dom 2 ───────────────────────────────────────────────────────────────────
export function klientenErFailSoft(api: string): boolean {
  const k = udenKommentarer(api);
  if (!k.includes('export const MEST_LAEST_MANGLER_KODER = ["42883", "PGRST202"] as const;')) return false;
  const fn = k.slice(k.indexOf("export async function hentMestLaestUge"));
  if (!fn.includes('("community_mest_laest_uge")')) return false;
  if (!fn.includes("MEST_LAEST_MANGLER_KODER")) return false;
  return true;
}

// ── dom 3 ───────────────────────────────────────────────────────────────────
export function fladenDoemmerIDommen(view: string): boolean {
  const k = udenKommentarer(view);
  if (!k.includes("const mestLaestId = vaelgMestLaest(mestLaestQuery.data);")) return false;
  if (!k.includes("mestLaest={traad.id === mestLaestId}")) return false;
  if (!k.includes("{MEST_LAEST_MAERKE}")) return false;
  if (/laesere/.test(k)) return false; // ingen egen tærskel/sammenligning
  return true;
}

// ── dom 4 ───────────────────────────────────────────────────────────────────
export function likeKnappenSkriverOrdet(like: string): boolean {
  const k = udenKommentarer(like);
  if (!k.includes("const tekst = nyttigtTekst(antal);")) return false;
  if (/\{antal\}/.test(k)) return false;
  return true;
}

export function ordeneErIkkeHaardkodet(filer: { sti: string; kilde: string }[]): string[] {
  return filer
    .filter((f) => /fandt det nyttigt|Mest læst denne uge/.test(udenKommentarer(f.kilde)))
    .map((f) => f.sti);
}

// ── dom 5 ───────────────────────────────────────────────────────────────────
export function staarEfterSidsteKoerte(filer: { navn: string; foerste: string }[], navn: string): boolean {
  const koerte = filer.filter((f) => /^--\s*KØRT i prod/.test(f.foerste)).map((f) => f.navn).sort();
  const sidste = koerte[koerte.length - 1];
  // Efter kørslen (2/10 ca. 18:00) er filen SELV den seneste kørte — lig med er derfor også i orden.
  return sidste === undefined || navn >= sidste;
}

const komponentFiler = () =>
  readdirSync(resolve(ROD, KOMPONENTER), { withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => ({ sti: `${KOMPONENTER}/${e.name}`, kilde: laes(`${KOMPONENTER}/${e.name}`) }));

const migrationsFiler = () =>
  readdirSync(resolve(ROD, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((navn) => ({ navn, foerste: laes(`supabase/migrations/${navn}`).split("\n")[0] ?? "" }));

describe("communityMestLaest.guard — «N fandt det nyttigt» og «Mest læst denne uge»", () => {
  it("1. migrationen: én SECURITY DEFINER med porten først, aktive tråde, uden forfatter og tjenestekonti, dansk ISO-uge, grants", () => {
    expect(migrationenHolder(laes(MIGRATION))).toBe(true);
  });
  it("2. klienten er fail-soft på 42883/PGRST202", () => {
    expect(klientenErFailSoft(laes(API))).toBe(true);
  });
  it("3. fladen dømmer gennem vaelgMestLaest", () => {
    expect(fladenDoemmerIDommen(laes(VIEW))).toBe(true);
  });
  it("4. like-knappen skriver nyttigtTekst, og ordene står ikke hårdkodet i komponenterne", () => {
    expect(likeKnappenSkriverOrdet(laes(LIKE))).toBe(true);
    expect(ordeneErIkkeHaardkodet(komponentFiler())).toEqual([]);
  });
  it("5. migrationen sorterer efter den seneste kørte — så længe den ikke selv er kørt", () => {
    // KØRT 2/10 ca. kl. 18:00: derefter er det metaSend.guard dom 11 (ingen ikke-kørt før en kørt), der holder rækkefølgen.
    const egen = migrationsFiler().find((f) => f.navn === MIG_NAVN);
    if (egen && /^--\s*KØRT i prod/.test(egen.foerste)) return;
    expect(staarEfterSidsteKoerte(migrationsFiler(), MIG_NAVN)).toBe(true);
  });
  it("6. SECURITY_BASELINE.md og CLAUDE.md nævner funktionen", () => {
    expect(laes("supabase/SECURITY_BASELINE.md")).toContain("community_mest_laest_uge()");
    expect(laes("CLAUDE.md")).toContain("community_mest_laest_uge()");
  });
});

describe("communityMestLaest.guard — VÆRNET VIRKER", () => {
  const m = laes(MIGRATION);
  it("dom 1 fælder: andet filhoved, invoker, ulåst søgesti, port efter forespørgslen, skjulte tråde, forfatteren med, tjenestekonti med, UTC-uge, grant til anon, en policy", () => {
    expect(migrationenHolder(m.replace(m.split("\n")[0], "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik)."))).toBe(false);
    expect(migrationenHolder(m.replace("\nSECURITY DEFINER\n", "\nSECURITY INVOKER\n"))).toBe(false);
    expect(migrationenHolder(m.replace("SET search_path = public, pg_temp", "SET search_path = public"))).toBe(false);
    const port = "  IF auth.uid() IS NULL\n     OR NOT (public.kan_laese_community(auth.uid()) OR public.has_role(auth.uid(), 'advisor')) THEN\n    RETURN;\n  END IF;\n";
    expect(migrationenHolder(m.replace(port, ""))).toBe(false);
    expect(migrationenHolder(m.replace("WHERE t.status = 'aktiv'", "WHERE t.status IN ('aktiv', 'skjult')"))).toBe(false);
    expect(migrationenHolder(m.replace("     AND v.bruger_id <> t.forfatter_id\n", ""))).toBe(false);
    expect(migrationenHolder(m.replace("     AND NOT EXISTS (SELECT 1 FROM public.tjenestekonti tk WHERE tk.user_id = v.bruger_id)\n", ""))).toBe(false);
    expect(migrationenHolder(m.replace("_ugestart := date_trunc('week', now() AT TIME ZONE 'Europe/Copenhagen')", "_ugestart := date_trunc('week', now() AT TIME ZONE 'UTC')"))).toBe(false);
    expect(migrationenHolder(m.replace("FROM anon;", "FROM anon;\nGRANT EXECUTE ON FUNCTION public.community_mest_laest_uge() TO anon;"))).toBe(false);
    expect(migrationenHolder(m + "\nCREATE POLICY x ON public.community_visninger FOR SELECT USING (true);\n")).toBe(false);
    expect(migrationenHolder(m.replace("()\nRETURNS TABLE(traad_id uuid, laesere bigint)", "()\nRETURNS TABLE(traad_id uuid, laesere bigint, bruger_id uuid)"))).toBe(false);
  });
  it("dom 2 fælder: en kode mindre", () => {
    expect(klientenErFailSoft(laes(API).replace('["42883", "PGRST202"]', '["42883"]'))).toBe(false);
  });
  it("dom 3 fælder: egen tærskel i fladen, intet mærke-ord", () => {
    const v = laes(VIEW);
    expect(fladenDoemmerIDommen(v.replace("const mestLaestId = vaelgMestLaest(mestLaestQuery.data);", "const mestLaestId = mestLaestQuery.data?.find((r) => r.laesere >= 3)?.traad_id;"))).toBe(false);
    expect(fladenDoemmerIDommen(v.replace("{MEST_LAEST_MAERKE}", "Mest læst"))).toBe(false);
  });
  it("dom 4 fælder: det nøgne tal tilbage, ordet hårdkodet", () => {
    const l = laes(LIKE);
    expect(likeKnappenSkriverOrdet(l.replace("{tekst ?? ", "{antal}{tekst ?? "))).toBe(false);
    expect(ordeneErIkkeHaardkodet([{ sti: "x.tsx", kilde: "<span>{antal} fandt det nyttigt</span>" }])).toEqual(["x.tsx"]);
  });
  it("dom 5 fælder: en ukørt før en kørt", () => {
    expect(staarEfterSidsteKoerte([{ navn: "20261002400000_x.sql", foerste: "-- KØRT i prod 3/10-2026" }], MIG_NAVN)).toBe(false);
  });
});
