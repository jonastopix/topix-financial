import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for «gæsten læser, skriver ikke» (2/10-2026; Jonas 14/9: «En gæst
 * ser Community, men skriver ikke»; migration 20261002242000, IKKE KØRT,
 * KRÆVER GRØNT LYS). Otte domme, hver med selvbevis på en muteret kopi:
 *   1. Migrationens første linje kræver grønt lys (ikke «IKKE KØRT. DEPLOY:», så
 *      mappescanningen ikke tager den), og kan_laese_community er SECURITY
 *      DEFINER + STABLE + search_path, = har_aktivt_medlemskab OR (vis_i_netvaerk
 *      = false AND is_legat = false AND contract_end_date IS NULL AND is_demo IS
 *      DISTINCT FROM true AND data_slettet_at IS NULL — demo/slettet: rådets fund 2/10); grant til
 *      authenticated + service_role, REVOKE fra PUBLIC og anon.
 *   2. Den nye dom bruges KUN i læsning: de to SELECT-politikker (samme navne,
 *      FOR SELECT) og de fem læse-RPC'er — og INGEN skrive-politik eller
 *      skrive-RPC (opret/ret/slet/skjul/saet/registrer) og ikke
 *      get_community_medlemmer (modtagerlisten for opslagsmailen) står i filen.
 *   3. De fem RPC-kroppe er TEGN FOR TEGN som den seneste migrationsfil for hver,
 *      når KUN porten (har_aktivt_medlemskab → kan_laese_community + den ene
 *      kommentarlinje) normaliseres væk — ingen anden ændring er smuglet ind.
 *   4. Klientens spejl dømmer gæsten med de samme fem felter (erCommunityGaest),
 *      læsning = harAdgangEfterRls OR gæst, skrivning = harAdgangEfterRls alene.
 *   5. Feedet og trådsiden viser composeren KUN gennem visComposer(gaest), grænsen
 *      gennem visGaestGraense(gaest) med GAEST_LAESER_TEKST, og like-knappen er
 *      slået fra for gæsten.
 *   6. Tjeklistens trådret kræver gaest === false og venter på dommen (gaest !== null).
 *   7. Hooken: fejl → false (som i dag), rådgiver → false, pending → null; feltlisten er de fem.
 *   8. har_aktivt_medlemskab røres ikke (ingen CREATE OR REPLACE af den i filen).
 */
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenSqlKommentarer = (k: string) => k.replace(/^\s*--[^\n]*$/gm, "");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const MIGRATION = "supabase/migrations/20261002242000_community_gaest_laeser.sql";
const DOM = "src/lib/hjemmebane/communityAdgang.ts";
const HOOK = "src/hooks/communityAdgang.ts";
const FEED = "src/components/hjemmebane/community/CommunityView.tsx";
const TRAAD = "src/components/hjemmebane/community/CommunityTraadView.tsx";
const TJEKLISTE = "src/hooks/useOnboardingTjekliste.ts";

/** De fem læse-RPC'er og den seneste migrationsfil, der definerer hver (målt 2/10 over hele mappen). */
export const LAESE_RPC_KILDER: Record<string, string> = {
  get_community_feed: "supabase/migrations/20260812180000_community_moderation_rpc.sql",
  get_community_traad: "supabase/migrations/20260812180000_community_moderation_rpc.sql",
  get_community_svar: "supabase/migrations/20260812180000_community_moderation_rpc.sql",
  maa_se_community_billede: "supabase/migrations/20260812110000_community_billed_adgangsdom.sql",
  maa_se_community_fil: "supabase/migrations/20260812140000_community_fil_adgangsdom.sql",
};
const SKRIVE_RPCER = ["opret_community_traad", "opret_community_svar", "ret_community_traad", "ret_community_svar", "slet_community_traad", "slet_community_svar", "skjul_community_traad", "saet_community_reaktion", "registrer_community_visning", "get_community_medlemmer", "har_aktivt_medlemskab"];

/** Dom 1. */
export const dommenHolder = (raa: string): boolean => {
  const sql = udenSqlKommentarer(raa);
  const krop = sql.match(/CREATE OR REPLACE FUNCTION public\.kan_laese_community\(_user_id uuid\)([\s\S]*?)\$function\$;/)?.[1] ?? "";
  return (
    raa.split("\n")[0] === "-- IKKE KØRT. KRÆVER JONAS' GRØNNE LYS (SECURITY DEFINER/trigger). DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik)." &&
    /RETURNS boolean\s+LANGUAGE sql\s+STABLE SECURITY DEFINER\s+SET search_path TO 'public'/.test(krop) &&
    /SELECT public\.har_aktivt_medlemskab\(_user_id\)\s+OR EXISTS \(/.test(krop) &&
    /WHERE cm\.user_id = _user_id\s+AND c\.vis_i_netvaerk = false\s+AND c\.is_legat = false\s+AND c\.contract_end_date IS NULL\s+AND c\.is_demo IS DISTINCT FROM true\s+AND c\.data_slettet_at IS NULL\s*\)/.test(krop) &&
    sql.includes("REVOKE ALL ON FUNCTION public.kan_laese_community(uuid) FROM PUBLIC;") &&
    sql.includes("REVOKE ALL ON FUNCTION public.kan_laese_community(uuid) FROM anon;") &&
    sql.includes("GRANT EXECUTE ON FUNCTION public.kan_laese_community(uuid) TO authenticated;") &&
    sql.includes("GRANT EXECUTE ON FUNCTION public.kan_laese_community(uuid) TO service_role;")
  );
};

/** Dom 2 + 8. */
export const kunLaesning = (raa: string): boolean => {
  const sql = udenSqlKommentarer(raa);
  const politikker = [...sql.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.(\w+) FOR (\w+)\s+TO authenticated\s+USING \(([^;]*)\);/g)];
  const funktioner = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  return (
    politikker.length === 2 &&
    politikker.every((p) => p[3] === "SELECT" && p[4].includes("status = 'aktiv' AND public.kan_laese_community(auth.uid())")) &&
    politikker.map((p) => `${p[2]}:${p[1]}`).sort().join("|") === "community_svar:Members can view active replies|community_traade:Members can view active threads" &&
    (sql.match(/DROP POLICY IF EXISTS/g) ?? []).length === 2 &&
    !/WITH CHECK/.test(sql) &&
    funktioner.sort().join("|") === ["kan_laese_community", ...Object.keys(LAESE_RPC_KILDER)].sort().join("|") &&
    SKRIVE_RPCER.every((f) => !new RegExp(`FUNCTION public\\.${f}\\(`).test(sql))
  );
};

/** Dom 3: kroppen fra kilden med KUN porten normaliseret væk. */
const krop = (tekst: string, navn: string): string => tekst.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${navn}\\([\\s\\S]*?\\n\\$\\$;`))?.[0] ?? "";
export const normaliserPort = (t: string): string =>
  t
    .replace(/public\.kan_laese_community\(/g, "public.har_aktivt_medlemskab(")
    .replace(/\n\s*-- LÆSE-dommen \(2\/10-2026\): kan_laese_community — gæsten læser med\./g, "")
    .replace(/\(kan_laese_community eller advisor; 2\/10-2026: gæsten\n  -- læser med\)/g, "(har_aktivt_medlemskab eller advisor)");
export const kroppeneErKilden = (ny: string, laesFil: (f: string) => string): string[] =>
  Object.entries(LAESE_RPC_KILDER)
    .filter(([navn, fil]) => {
      const gammel = krop(laesFil(fil), navn);
      const nu = normaliserPort(krop(ny, navn));
      return gammel === "" || nu === "" || gammel !== nu || !krop(ny, navn).includes("public.kan_laese_community(");
    })
    .map(([navn]) => navn);

/** Dom 4. */
export const spejletHolder = (dom: string): boolean =>
  dom.includes('import { harAdgangEfterRls } from "./eventSvar";') &&
  dom.includes("return v.vis_i_netvaerk === false && v.is_legat === false && v.contract_end_date === null && v.is_demo !== true && v.data_slettet_at === null;") &&
  dom.includes("return harAdgangEfterRls(virksomheder, nu) || virksomheder.some(erCommunityGaest);") &&
  /export function kanSkriveICommunity\([^)]*\): boolean \{\s*return harAdgangEfterRls\(virksomheder, nu\);\s*\}/.test(dom) &&
  !/erCommunityGaest/.test(dom.match(/export function kanSkriveICommunity[\s\S]*?\n\}/)?.[0] ?? "x");

/** Dom 5. */
export const fladenHolder = (feed: string, traad: string): boolean =>
  feed.includes("const gaest = useCommunityGaest();") &&
  feed.includes("{!feedQuery.isLoading && user && visComposer(gaest) && (") &&
  feed.includes("{!feedQuery.isLoading && visGaestGraense(gaest) && (") &&
  feed.includes("data-gaest-graense>{GAEST_LAESER_TEKST}</p>") &&
  feed.includes("reagerer={reaktionMutation.isPending || !visComposer(gaest)}") &&
  traad.includes("const gaest = useCommunityGaest();") &&
  traad.includes("{user && visComposer(gaest) && (") &&
  traad.includes("{visGaestGraense(gaest) && (") &&
  traad.includes("data-gaest-graense>{GAEST_LAESER_TEKST}</p>") &&
  traad.includes("disabled={reaktionMutation.isPending || !visComposer(gaest)}") &&
  traad.includes("reagerer={reaktionMutation.isPending || !visComposer(gaest)}") &&
  !/\{user && \(\s*<div className="mt-8">\s*<CommunityComposer/.test(traad);

/** Dom 6. */
export const tjeklistenHolder = (hook: string): boolean =>
  hook.includes("const gaest = useCommunityGaest();") &&
  hook.includes('const kanOpretteTraad = !isLegat && membershipTier === "full" && gaest === false;') &&
  /const aktiv = [^;]*membershipTier !== null && gaest !== null;/.test(hook);

/** Dom 7. */
export const hookenHolder = (hook: string): boolean =>
  hook.includes('export const COMMUNITY_GAEST_FELTER = "vis_i_netvaerk, is_legat, contract_end_date, is_demo, data_slettet_at";') &&
  /if \(error\) \{[\s\S]*?return false;\s*\}/.test(hook) &&
  hook.includes("if (isAdvisor) return false;") &&
  hook.includes('if (!companyId) return companyResolution === "pending" ? null : false;') &&
  hook.includes("return q.data ?? null;") &&
  !/throw/.test(hook);

describe("communityGaest.guard — gæsten læser, skriver ikke", () => {
  const migration = laes(MIGRATION);
  it("dom 1: første linje kræver grønt lys; kan_laese_community = har_aktivt_medlemskab OR (flag, ikke legat, ingen slutdato, ikke demo, ikke slettet); DEFINER + STABLE + search_path; grants", () => {
    expect(dommenHolder(migration)).toBe(true);
  });
  it("dom 2 + 8: kun læsning rører den nye dom — to SELECT-politikker, fem læse-RPC'er; ingen skrive-RPC, ikke get_community_medlemmer, ikke har_aktivt_medlemskab", () => {
    expect(kunLaesning(migration)).toBe(true);
  });
  it("dom 3: de fem kroppe er tegn for tegn som deres seneste migrationsfil, når kun porten normaliseres væk", () => {
    expect(kroppeneErKilden(migration, laes)).toEqual([]);
  });
  it("dom 4: klientens spejl — gæst = de tre felter; læsning = RLS-reglen eller gæst; skrivning = RLS-reglen alene", () => {
    expect(spejletHolder(udenKommentarer(laes(DOM)))).toBe(true);
  });
  it("dom 5: feedet og trådsiden — composeren kun gennem visComposer, grænsen gennem visGaestGraense, like slået fra", () => {
    expect(fladenHolder(udenKommentarer(laes(FEED)), udenKommentarer(laes(TRAAD)))).toBe(true);
  });
  it("dom 6: tjeklistens «Præsentér dig» udgår for gæsten, og hooken venter på dommen", () => {
    expect(tjeklistenHolder(udenKommentarer(laes(TJEKLISTE)))).toBe(true);
  });
  it("dom 7: hooken kaster aldrig — fejl → false, rådgiver → false, pending → null; de tre felter", () => {
    expect(hookenHolder(udenKommentarer(laes(HOOK)))).toBe(true);
  });

  it("selvbevis 1: «IKKE KØRT. DEPLOY:», INVOKER, et manglende led eller en grant til anon falder", () => {
    expect(dommenHolder(migration.replace(/^[^\n]*/, "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik)."))).toBe(false);
    expect(dommenHolder(migration.replace("STABLE SECURITY DEFINER\nSET search_path TO 'public'\nAS $function$\n  SELECT public.har_aktivt_medlemskab(_user_id)", "STABLE\nSET search_path TO 'public'\nAS $function$\n  SELECT public.har_aktivt_medlemskab(_user_id)"))).toBe(false);
    expect(dommenHolder(migration.replace("             AND c.contract_end_date IS NULL\n", ""))).toBe(false);
    expect(dommenHolder(migration.replace("             AND c.is_demo IS DISTINCT FROM true\n", ""))).toBe(false);
    expect(dommenHolder(migration.replace("             AND c.data_slettet_at IS NULL\n", ""))).toBe(false);
    expect(dommenHolder(migration.replace("GRANT EXECUTE ON FUNCTION public.kan_laese_community(uuid) TO authenticated;", "GRANT EXECUTE ON FUNCTION public.kan_laese_community(uuid) TO authenticated;\nGRANT EXECUTE ON FUNCTION public.kan_laese_community(uuid) TO anon;") .replace("REVOKE ALL ON FUNCTION public.kan_laese_community(uuid) FROM anon;\n", ""))).toBe(false);
  });
  it("selvbevis 2: en INSERT-politik på den nye dom, en skrive-RPC eller har_aktivt_medlemskab i filen falder", () => {
    expect(kunLaesning(migration + '\nCREATE POLICY "Members can create own threads"\n  ON public.community_traade FOR INSERT\n  TO authenticated\n  WITH CHECK (auth.uid() = forfatter_id AND public.kan_laese_community(auth.uid()));')).toBe(false);
    expect(kunLaesning(migration + "\nCREATE OR REPLACE FUNCTION public.opret_community_traad(p_titel text) RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;")).toBe(false);
    expect(kunLaesning(migration + "\nCREATE OR REPLACE FUNCTION public.get_community_medlemmer() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;")).toBe(false);
    expect(kunLaesning(migration + "\nCREATE OR REPLACE FUNCTION public.har_aktivt_medlemskab(_user_id uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;")).toBe(false);
    expect(kunLaesning(migration.replace("USING (status = 'aktiv' AND public.kan_laese_community(auth.uid()));\n\nDROP POLICY IF EXISTS \"Members can view active replies\"", "USING (public.kan_laese_community(auth.uid()));\n\nDROP POLICY IF EXISTS \"Members can view active replies\""))).toBe(false);
  });
  it("selvbevis 3: en smuglet ændring i en krop, eller en port, der ikke skiftede, falder", () => {
    expect(kroppeneErKilden(migration.replace("ORDER BY t.fastgjort DESC, COALESCE(t.sidste_svar_at, t.created_at) DESC\n  LIMIT p_limit OFFSET p_offset;", "ORDER BY t.created_at DESC\n  LIMIT p_limit OFFSET p_offset;"), laes)).toEqual(["get_community_feed"]);
    const uskiftet = migration.replace(
      "IF NOT (public.kan_laese_community(_user_id)\n          OR public.has_role(_user_id, 'advisor')) THEN\n    RETURN false;\n  END IF;\n\n  -- 2) Optræder stien som fil-node",
      "IF NOT (public.har_aktivt_medlemskab(_user_id)\n          OR public.has_role(_user_id, 'advisor')) THEN\n    RETURN false;\n  END IF;\n\n  -- 2) Optræder stien som fil-node",
    );
    expect(kroppeneErKilden(uskiftet, laes)).toEqual(["maa_se_community_fil"]);
  });
  it("selvbevis 4–7: et spejl, der lader gæsten skrive; en composer uden dommen; en tjekliste uden gæsten; en hook, der kaster", () => {
    const dom = udenKommentarer(laes(DOM));
    expect(spejletHolder(dom.replace("return harAdgangEfterRls(virksomheder, nu);\n}", "return harAdgangEfterRls(virksomheder, nu) || virksomheder.some(erCommunityGaest);\n}"))).toBe(false);
    expect(spejletHolder(dom.replace(" && v.contract_end_date === null && v.is_demo !== true && v.data_slettet_at === null;", ";"))).toBe(false);
    expect(spejletHolder(dom.replace(" && v.is_demo !== true", ""))).toBe(false);
    expect(spejletHolder(dom.replace(" && v.data_slettet_at === null;", ";"))).toBe(false);
    const feed = udenKommentarer(laes(FEED)), traad = udenKommentarer(laes(TRAAD));
    expect(fladenHolder(feed.replace("{!feedQuery.isLoading && user && visComposer(gaest) && (", "{!feedQuery.isLoading && user && ("), traad)).toBe(false);
    expect(fladenHolder(feed, traad.replace("{user && visComposer(gaest) && (", "{user && ("))).toBe(false);
    expect(fladenHolder(feed.replace("reagerer={reaktionMutation.isPending || !visComposer(gaest)}", "reagerer={reaktionMutation.isPending}"), traad)).toBe(false);
    const tjek = udenKommentarer(laes(TJEKLISTE));
    expect(tjeklistenHolder(tjek.replace(' && gaest === false;', ";"))).toBe(false);
    expect(tjeklistenHolder(tjek.replace(" && gaest !== null;", ";"))).toBe(false);
    const hook = udenKommentarer(laes(HOOK));
    expect(hookenHolder(hook.replace("    return false;\n  }\n  if (!data) return false;", "    throw error;\n  }\n  if (!data) return false;"))).toBe(false);
    expect(hookenHolder(hook.replace("if (isAdvisor) return false;", ""))).toBe(false);
  });
});
