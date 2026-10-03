import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for sikkerhedspakken 3/10-2026 (spor 4; g03-security-definer-anon og
// g03-with-check-15-politikker; docs/vaerdiliste.md §2 punkt 14). Tre FORBEREDTE migrationer,
// IKKE KØRT, KRÆVER JONAS' GRØNNE LYS. Værnet låser deres form, så de ikke kan glide, før de køres:
//   1. Trin 1a REVOKE'r EXECUTE fra PUBLIC + anon på PRÆCIS de 14 (målt i prod: anon bruger dem
//      bevisligt ikke) — cleanup_stale_processing_reports også fra authenticated — og intet andet.
//   2. Trin 1b REVOKE'r PRÆCIS has_role og user_company_id fra PUBLIC + anon, og intet andet.
//   3. De anonyme flader kalder KUN de to RPC'er, anon beholder (lookup_invite_company_info,
//      hent_betalingstilbud), læser ingen tabel direkte, og ingen af de tre filer rører de to.
//   4. WITH CHECK-filen: kun ALTER POLICY … WITH CHECK, 20 politikker, aldrig milestones (egen fil,
//      maalSkriv.guard dom 2), gruppe A binder virksomheden, og tørkørslens ALTER'er = kroppens.
// Køres en fil, flippes første linje — og værnet ajourføres i samme PR.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const saetninger = (sql: string): string[] =>
  udenSqlKommentarer(sql).split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

export const TRIN_1A = "supabase/migrations/20261003200000_revoke_anon_trin1a.sql";
export const TRIN_1B = "supabase/migrations/20261003201000_revoke_anon_trin1b.sql";
export const WITH_CHECK = "supabase/migrations/20261003202000_with_check_15_politikker.sql";

/** De 14 (målt 3/10: 18 anon-kaldbare ikke-trigger SECURITY DEFINER − 2 i 1b − 2 der bliver hos anon). */
export const TRIN_1A_FUNKTIONER = [
  "public.cleanup_stale_processing_reports()",
  "public.get_all_advisor_profiles()",
  "public.get_conversation_sender_profiles(uuid)",
  "public.get_siden_sidst(timestamptz)",
  "public.get_siden_sidst_virksomheder(timestamptz)",
  "public.get_users_last_login(uuid[])",
  "public.is_legat_user(uuid)",
  "public.legat_day(uuid)",
  "public.legat_unlocked_modules(uuid)",
  "public.log_user_login()",
  "public.lookup_invite_company(uuid)",
  "public.mark_messages_read(uuid)",
  "public.mark_notification_read(uuid)",
  "public.mark_notifications_seen()",
] as const;
export const TRIN_1B_FUNKTIONER = ["public.has_role(uuid, app_role)", "public.user_company_id(uuid)"] as const;
/** Anon BEHOLDER dem — de anonyme flader /auth og /betal kalder dem. */
export const ANON_BEHOLDER = ["lookup_invite_company_info", "hent_betalingstilbud"] as const;

const FOERSTE_1A = "-- IKKE KØRT. KRÆVER JONAS' GRØNNE LYS (REVOKE EXECUTE fra anon, trin 1a — g03-security-definer-anon).";
const FOERSTE_1B = "-- IKKE KØRT. KRÆVER JONAS' GRØNNE LYS (REVOKE EXECUTE fra anon, trin 1b: has_role + user_company_id — g03-security-definer-anon).";
const FOERSTE_WC = "-- IKKE KØRT. KRÆVER JONAS' GRØNNE LYS (RLS-stramning, WITH CHECK på 15 UPDATE-politikker + 5 INSERT — g03-with-check-15-politikker).";

/**
 * En REVOKE-fil: første linje som forventet; kroppen er KUN «REVOKE EXECUTE ON FUNCTION f FROM …»
 * og «GRANT EXECUTE ON FUNCTION f TO authenticated/service_role» — aldrig GRANT til PUBLIC/anon,
 * aldrig andet DDL. Svarer de REVOKE'de funktioner i rækkefølge, eller null hvis formen brydes.
 */
export const revokeFil = (
  sql: string,
  foerste: string,
  undtagelse: Readonly<Record<string, string>> = {},
): string[] | null => {
  if (sql.split("\n")[0] !== foerste) return null;
  const revoked: string[] = [];
  for (const s of saetninger(sql)) {
    const r = /^REVOKE EXECUTE ON FUNCTION (public\.[a-z_]+\([^)]*\)) FROM (.+)$/i.exec(s);
    const g = /^GRANT EXECUTE ON FUNCTION (public\.[a-z_]+\([^)]*\)) TO (.+)$/i.exec(s);
    if (r) {
      const forventet = undtagelse[r[1]] ?? "PUBLIC, anon";
      if (r[2] !== forventet) return null;
      revoked.push(r[1]);
    } else if (g) {
      const roller = g[2].split(",").map((x) => x.trim());
      if (roller.some((x) => x !== "authenticated" && x !== "service_role")) return null;
      if (!revoked.includes(g[1])) return null; // et GRANT står altid efter sin egen REVOKE
    } else return null;
  }
  return revoked;
};

/** Dom 3: alle .rpc("…")-navne i en kilde (også gennem en konstant ville være skjult — derfor også `.rpc(<ident>`). */
export const rpcKald = (kode: string): string[] => {
  const k = udenKommentarer(kode);
  const navne = [...k.matchAll(/\.rpc\(\s*["'`]([a-z_]+)["'`]/g)].map((m) => m[1]);
  if (/\.rpc\(\s*[A-Za-z_]/.test(k)) navne.push("<ikke-literal>");
  return navne;
};
export const ANONYME_SIDER = [
  "src/pages/Auth.tsx",
  "src/pages/ResetPassword.tsx",
  "src/pages/Betal.tsx",
  "src/pages/Ansoeg.tsx",
  "src/pages/AnsoegPersondata.tsx",
  "src/pages/AnsoegStatus.tsx",
  "src/pages/Aftale.tsx",
  "src/pages/DeltWebinar.tsx",
  "src/pages/RingMigOp.tsx",
  "src/pages/NotFound.tsx",
] as const;
export const anonymeFladerHolder = (sider: readonly { sti: string; kode: string }[]): string[] => {
  const brud: string[] = [];
  for (const { sti, kode } of sider) {
    for (const n of rpcKald(kode)) if (!(ANON_BEHOLDER as readonly string[]).includes(n)) brud.push(`${sti}: rpc ${n}`);
    if (/supabase\s*\.from\(/.test(udenKommentarer(kode))) brud.push(`${sti}: læser en tabel direkte`);
  }
  return brud;
};

/** Dom 4: WITH CHECK-filen. Svarer null ved brud, ellers politiknavnene i kroppen. */
export const GRUPPE_A = [
  "Users can update own reports", "Users can update own kpi targets", "Users can update own benchmarks",
  "Members can update own conversation", "Users can update own lever milestones",
  "Users can insert own reports", "Users can insert own benchmarks", "Users can insert own kpi targets",
  "Members can create own conversation", "Users can insert own lever milestones",
] as const;
export const withCheckFil = (sql: string): string[] | null => {
  if (sql.split("\n")[0] !== FOERSTE_WC) return null;
  const s = saetninger(sql);
  const navne: string[] = [];
  for (const x of s) {
    const m = /^ALTER POLICY "([^"]+)" ON public\.([a-z_]+) WITH CHECK \((.+)\)$/i.exec(x);
    if (!m) return null;
    if (m[2] === "milestones") return null;
    const a = (GRUPPE_A as readonly string[]).includes(m[1]);
    if (a && !m[3].includes("public.user_company_id(auth.uid())")) return null;
    if (/\btrue\b/i.test(m[3])) return null;
    navne.push(m[1]);
  }
  if (navne.length !== 20 || new Set(navne).size !== 20) return null;
  if (!GRUPPE_A.every((n) => navne.includes(n))) return null;
  // Tørkørslens ALTER'er (i filhovedet) skal være kroppens, tegn for tegn efter normalisering.
  const START = "--     -- ALTER'erne — ORDRET filens krop", SLUT = "--     -- EFTER: flytningen skal AFVISES";
  const a0 = sql.indexOf(START), a1 = sql.indexOf(SLUT);
  if (a0 < 0 || a1 < a0) return null;
  const iHoved = sql.slice(sql.indexOf("\n", a0) + 1, a1).replace(/^--     /gm, "");
  const krop = udenSqlKommentarer(sql);
  const norm = (t: string) => t.replace(/\s+/g, " ").trim();
  if (norm(iHoved) !== norm(krop.slice(krop.indexOf("ALTER POLICY")))) return null;
  return navne;
};

describe("sikkerhedspakken 3/10 — REVOKE fra anon og WITH CHECK (forberedt, ikke kørt)", () => {
  it("dom 1: trin 1a REVOKE'r PRÆCIS de 14 fra PUBLIC + anon (cleanup også fra authenticated) og intet andet", () => {
    const r = revokeFil(laes(TRIN_1A), FOERSTE_1A, { "public.cleanup_stale_processing_reports()": "PUBLIC, anon, authenticated" });
    expect(r).toEqual([...TRIN_1A_FUNKTIONER]);
  });
  it("dom 2: trin 1b REVOKE'r PRÆCIS has_role og user_company_id fra PUBLIC + anon og intet andet", () => {
    expect(revokeFil(laes(TRIN_1B), FOERSTE_1B)).toEqual([...TRIN_1B_FUNKTIONER]);
  });
  it("dom 3: de anonyme flader kalder kun de to RPC'er, anon beholder, og ingen af de tre filer rører dem", () => {
    expect(anonymeFladerHolder(ANONYME_SIDER.map((sti) => ({ sti, kode: laes(sti) })))).toEqual([]);
    for (const f of [TRIN_1A, TRIN_1B, WITH_CHECK])
      for (const n of ANON_BEHOLDER) expect(udenSqlKommentarer(laes(f)), `${f} ${n}`).not.toContain(n);
  });
  it("dom 4: WITH CHECK-filen — kun ALTER POLICY … WITH CHECK, 20 politikker, aldrig milestones, gruppe A binder virksomheden, tørkørslen = kroppen", () => {
    expect(withCheckFil(laes(WITH_CHECK))).not.toBeNull();
  });

  it("selvbevis 1–2: en flippet første linje, en ekstra funktion, et GRANT til anon eller andet DDL falder", () => {
    const a = laes(TRIN_1A), u = { "public.cleanup_stale_processing_reports()": "PUBLIC, anon, authenticated" };
    expect(revokeFil(a.replace(/^[^\n]*/, "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik)."), FOERSTE_1A, u)).toBeNull();
    expect(revokeFil(a + "\nREVOKE EXECUTE ON FUNCTION public.hent_betalingstilbud(uuid) FROM PUBLIC, anon;", FOERSTE_1A, u)).not.toEqual([...TRIN_1A_FUNKTIONER]);
    expect(revokeFil(a + "\nGRANT EXECUTE ON FUNCTION public.log_user_login() TO anon;", FOERSTE_1A, u)).toBeNull();
    expect(revokeFil(a + "\nALTER FUNCTION public.has_role(uuid, app_role) SECURITY INVOKER;", FOERSTE_1A, u)).toBeNull();
    expect(revokeFil(a.replace("cleanup_stale_processing_reports() FROM PUBLIC, anon, authenticated", "cleanup_stale_processing_reports() FROM PUBLIC, anon"), FOERSTE_1A, u)).toBeNull();
    const b = laes(TRIN_1B);
    expect(revokeFil(b.replace("user_company_id(uuid) FROM PUBLIC, anon", "user_company_id(uuid) FROM anon"), FOERSTE_1B)).toBeNull();
    expect(revokeFil(b + "\nREVOKE EXECUTE ON FUNCTION public.is_membership_active(uuid) FROM PUBLIC, anon;", FOERSTE_1B)).not.toEqual([...TRIN_1B_FUNKTIONER]);
  });
  it("selvbevis 3: en anonym side, der kalder en REVOKE'd RPC eller læser en tabel, falder", () => {
    expect(anonymeFladerHolder([{ sti: "x", kode: 'await supabase.rpc("has_role", {});' }])).toEqual(["x: rpc has_role"]);
    expect(anonymeFladerHolder([{ sti: "x", kode: 'await supabase.from("companies").select("id");' }])).toEqual(["x: læser en tabel direkte"]);
    expect(anonymeFladerHolder([{ sti: "x", kode: "await supabase.rpc(NAVN);" }])).toEqual(["x: rpc <ikke-literal>"]);
    expect(anonymeFladerHolder([{ sti: "x", kode: 'await supabase.rpc("hent_betalingstilbud", {});' }])).toEqual([]);
  });
  it("selvbevis 4: milestones, en slækket check, en manglende virksomhedsbinding, CREATE/DROP eller en tørkørsel, der afviger, falder", () => {
    const w = laes(WITH_CHECK);
    expect(withCheckFil(w + '\nALTER POLICY "Users can update own milestones" ON public.milestones WITH CHECK (auth.uid() = user_id);')).toBeNull();
    expect(withCheckFil(w + '\nDROP POLICY "x" ON public.profiles;')).toBeNull();
    expect(w.split("WITH CHECK (user_id = auth.uid());").length).toBe(3); // i tørkørslen OG i kroppen
    expect(withCheckFil(w.split("WITH CHECK (user_id = auth.uid());").join("WITH CHECK (true);"))).toBeNull();
    const kropStart = w.indexOf("-- ── GRUPPE A: lukker hullet");
    const hoved = w.slice(0, kropStart), krop = w.slice(kropStart);
    expect(withCheckFil(hoved + krop.replace('ON public.kpi_targets\n  WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()));', "ON public.kpi_targets\n  WITH CHECK (auth.uid() = user_id);"))).toBeNull();
    expect(withCheckFil(hoved.replace("--     ALTER POLICY \"Users can update own profile\"", "--     ALTER POLICY \"Users can update own profilX\"") + krop)).toBeNull();
    expect(withCheckFil(w.replace(/^[^\n]*/, "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik)."))).toBeNull();
  });
});
