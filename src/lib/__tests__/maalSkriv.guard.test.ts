import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Kildeværn for «Én plan» fase 2 (16/9-2026). Jonas: «Nej. Vi er rådgivere,
// men det er medlemmernes virksomheder.» — medlemmet ejer sine mål og skriver
// dem selv fra klienten (RLS uændret); rådgiveren skriver gennem maal-skriv
// (hun har kun SELECT); AI'en skriver aldrig mål; «højst tre aktive» gælder
// alle og håndhæves af databasen. Seks ting låses:
//   1. maal-skriv er Bucket A i husets rækkefølge (authenticateUser → has_role
//      → service role), kun rådgivere (ingen medlems-undtagelse), «højst tre»
//      kun gennem kanOpretteMaal, målet slås altid op med company_id.
//   2. INGEN RLS-ændring: ingen migration i repoet rører milestones' politikker
//      efter fase 1 (ingen «on public.milestones» i create/drop/alter policy).
//   3. Klientskrivere til milestones er præcis de bogførte (medlemmets egne):
//      useMilestones, handoutEngine (direkte insert med loeftestangStatus),
//      RapporteringView (død), LegatDashboard. Planen skriver KUN gennem maal-skriv.
//   4. Medlemmets flade («Dine mål», fase 3: DineMaalView; fladen 1/10-2026)
//      beholder vejen til at SÆTTE et mål — den stiplede plads «Sæt et mål»
//      (TomPladsKort → SaetMaalGuide → dineMaalGrundlag.opretMaalMedTal, dom 3)
//      — og slet; hooket oversætter
//      triggerens fejl til husets tekst (maalFejlTekst) ved opret og ved
//      parkér/aktivér.
//   5. Agenten har hverken create_milestone eller update_milestone_progress —
//      hverken i poolen, i executeTool, i SKRIVE_TOOLS eller i onboarding-prompten.
//   6. Triggeren «højst tre» (ikke DEFINER, kun når rækken bliver aktiv, ingen politik).
//   7. Punkt 13 (2/10-2026, Jonas «Ja, kun bekræftede»; migration 20261002241000, IKKE KØRT,
//      KRÆVER GRØNT LYS): den NYE krop tæller kun bekræftede aktive (bekraeftet_at is not null),
//      dømmer også når bekraeftet_at sættes på en aktiv (old.bekraeftet_at is null), bærer
//      markøren «PLADSDOM: kun_bekraeftede», som RPC'en maal_pladser_kun_bekraeftede læser i
//      pg_proc; stadig ikke DEFINER, ingen politik; første linje kræver grønt lys (ikke «IKKE
//      KØRT. DEPLOY:», så mappescanningen ikke tager den); klienten dømmer «alle» uden svar
//      (laesPladsdom) og tager reglen fra RPC'en, aldrig fra en antagelse.
// Kildelæsning med selvbevis på kopier.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");

const MAAL_SKRIV = "supabase/functions/maal-skriv/index.ts";
const AGENT = "supabase/functions/run-company-agent/index.ts";
const TOER = "supabase/functions/_shared/agentToerkoersel.ts";
const TRE = "supabase/migrations/20260917150000_maal_hoejst_tre_aktive.sql";
const TRE_BEKRAEFTEDE = "supabase/migrations/20261002241000_maal_pladser_kun_bekraeftede.sql";
const PLADSDOM = "src/lib/hjemmebane/maalPladsdom.ts";
const PLADSDOM_HOOK = "src/hooks/maalPladsdom.ts";
const HANDOUT = "src/lib/handoutEngine.ts";
const HOOK = "src/components/hjemmebane/milestones/useMilestones.ts";
const MEDLEM = "src/components/hjemmebane/milestones/DineMaalView.tsx";
const PLANEN = "src/components/hjemmebane/virksomhed/VirksomhedPlanen.tsx";
const MAALFEJL = "src/lib/hjemmebane/maalFejl.ts";
const CONFIG = "supabase/config.toml";

/** Bogførte klientskrivere til milestones — medlemmets egne (fil → forventede operationer). */
const BOGFOERTE_KLIENTSKRIVERE: Record<string, RegExp[]> = {
  [HOOK]: [/\.from\("milestones"\)\.update\(/, /\.from\("milestones"\)\.delete\(/, /\.from\("milestones"\)\.insert\(/],
  [HANDOUT]: [/\.from\("milestones"\)\s*\.insert\(insertData as any\)/],
  "src/pages/LegatDashboard.tsx": [/\.from\("milestones"\)\s*\.update\(\{ progress: 100, status: "completed" \}\)/],
  "src/components/hjemmebane/rapportering/RapporteringView.tsx": [/from\("milestones"\)\.delete\(\)\.eq\("source_report"/],
  // 1/10-2026 (Dine mål, tal-mål — Jonas 21:04): guidens oprettelse og «Gør målet skarpt»,
  // medlemmets egen vej som useMilestones; dømt af maalTal.doemNytMaal, «højst tre» af databasen.
  "src/hooks/dineMaalGrundlag.ts": [
    /\.from\("milestones"\)\.insert\(payload\)/,
    /\.from\("milestones"\)\.update\(payload\)\.eq\("id", args\.maalId\)\.is\("art", null\)/,
    // Skive 3 (2/10-2026, Jonas 1/10): medlemmets bekræftelse (guardet på bekraeftet_at IS NULL + aktiv),
    // «Slip»/«Ikke nu»/«Parkér» = parkér (aldrig delete), og guidens insert MED bekræftelsen (fail-soft uden).
    /\.from\("milestones"\)\.insert\(medBekraeftelse as never\)/,
    /\.update\(\{ bekraeftet_at: args\.nu\.toISOString\(\), bekraeftet_af: args\.userId \} as never\)\s*\.eq\("id", args\.maalId\)\s*\.is\("bekraeftet_at" as never, null\)\s*\.eq\("status", "active"\)/,
    /\.from\("milestones"\)\.update\(\{ status: "parked" \}\)\.eq\("id", args\.maalId\)\.eq\("status", "active"\)/,
  ],
  // Skive 3: kvartalstjekkets «Nået» på forsiden — et menneskes klik (samme skrivning som useMilestones.markerNaaet),
  // i egen fil fordi dineMaalGrundlag aldrig skriver 'completed' (maalTal.guard dom 7).
  "src/hooks/maalNaaetKlik.ts": [/\.from\("milestones"\)\.update\(\{ status: "completed" \}\)\.eq\("id", args\.maalId\)\.eq\("status", "active"\)/],
};

function alleFiler(rod: string, endelse: RegExp = /\.tsx?$/): string[] {
  const ud: string[] = [];
  const gaa = (dir: string) => {
    for (const navn of readdirSync(dir)) {
      if (navn === "node_modules" || navn.startsWith(".")) continue;
      const sti = join(dir, navn);
      if (statSync(sti).isDirectory()) gaa(sti);
      else if (endelse.test(navn)) ud.push(sti);
    }
  };
  gaa(resolve(process.cwd(), rod));
  return ud.map((s) => s.slice(resolve(process.cwd()).length + 1)).sort();
}

/** Dom 1: maal-skriv's rækkefølge, rolle og motor. */
export const maalSkrivHolder = (kode: string): boolean => {
  const auth = kode.indexOf("await authenticateUser(req)");
  const rolle = kode.indexOf('rpc("has_role"');
  const admin = kode.indexOf("const adminClient = createClient(");
  return auth > -1 && rolle > auth && admin > rolle &&
    /if \(rolleErr \|\| !erRaadgiver\) \{/.test(kode) &&
    !/loeftestangsForslag|company_members"\)\s*\.select\("user_id"\)\s*\.eq\("company_id", companyId\)\s*\.eq\("user_id", callerId\)/.test(kode) &&
    kode.includes('import { kanOpretteMaal, MAX_AKTIVE_MAAL } from "../_shared/maal.ts";') &&
    (kode.match(/kanOpretteMaal\(antal\)/g) ?? []).length === 2 &&
    !/antal >= 3|antal < 3|>= 3\b/.test(kode) &&
    /\.from\("milestones"\)\s*\.select\("id, status"\)\s*\.eq\("id", maalId as string\)\s*\.eq\("company_id", companyId\)/.test(kode) &&
    /\.delete\(\)\s*\.eq\("id", maalId as string\)\s*\.eq\("company_id", companyId\)/.test(kode);
};

/** Dom 2: ingen migration rører milestones' politikker efter fase 1. */
export const ingenRlsAendring = (migrationer: readonly { sti: string; sql: string }[]): string[] =>
  migrationer
    .filter((m) => m.sti > "supabase/migrations/20260917140000")
    .filter((m) => /(create|drop|alter) policy[^;]*on public\.milestones/i.test(udenSqlKommentarer(m.sql)))
    .map((m) => m.sti);

/**
 * Dom 2-undtagelsen (rådets fund 9, 1/10 aften): den FORBEREDTE stramning
 * (SECURITY_BASELINE fund 6) står i mappen, men er IKKE kørt og KRÆVER Jonas'
 * grønne lys. Den er kun tilladt, så længe den (a) bærer den linje som første
 * linje, (b) kun bruger ALTER POLICY (aldrig CREATE/DROP POLICY) og (c) kun
 * STRAMMER: hver WITH CHECK indeholder company_id = public.user_company_id(auth.uid()).
 * Køres den, flippes linjen — og værnet skal ajourføres i samme PR.
 */
export const FORBEREDTE_RLS_STRAMNINGER = ["supabase/migrations/20261002280000_milestones_with_check.sql"] as const;
export const forberedtStramning = (sql: string): boolean => {
  const krop = udenSqlKommentarer(sql);
  const checks = [...krop.matchAll(/WITH CHECK \(([^;]*)\);/gi)].map((m) => m[1]);
  return (
    sql.split("\n")[0] === "-- IKKE KØRT. KRÆVER JONAS' GRØNNE LYS (RLS-stramning, SECURITY_BASELINE fund 6)." &&
    !/\b(create|drop)\s+policy\b/i.test(krop) &&
    (krop.match(/\balter policy\b/gi) ?? []).length === checks.length && checks.length > 0 &&
    checks.every((c) => c.includes("company_id = public.user_company_id(auth.uid())"))
  );
};

/** Dom 3: klientskrivere til milestones = de bogførte. */
export const klientskrivere = (filer: readonly string[], laesFil: (f: string) => string): string[] =>
  filer.filter((f) => !f.includes("__tests__") && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
    .filter((f) => /\.from\("milestones"\)\s*\.(insert|update|delete|upsert)\(/.test(udenKommentarer(laesFil(f))))
    .sort();

/** Dom 3b: løftestangen tæller aktive og lader dommen vælge status. */
export const loeftestangHolder = (kode: string): boolean =>
  kode.includes('import { loeftestangStatus } from "@/lib/hjemmebane/maalFejl";') &&
  /\.from\("milestones"\)\s*\.select\("id", \{ count: "exact", head: true \}\)\s*\.eq\("company_id", companyId\)\s*\.eq\("status", "active"\)/.test(kode) &&
  /const status = loeftestangStatus\(antalAktive\);/.test(kode) &&
  /source: "handout", company_id: companyId, status \}/.test(kode) &&
  !/functions\.invoke\("maal-skriv"/.test(kode);

/** Dom 4: medlemmets flade — vejen til at sætte et mål bevaret (fladen 1/10: TomPladsKort → aabnGuide(GUIDE_NY) → guiden → skriv.opret; rådets fund 16: guiden får sit åbningstidspunkt, runde 2 fund 7: samme frosne `guideNu` i skriveren), triggerfejl oversat. */
export const medlemsfladenHolder = (view: string, hook: string, fejl: string): boolean =>
  view.includes('{tomPlads && <TomPladsKort onSaetMaal={() => aabnGuide(GUIDE_NY)} />}') &&
  view.includes("const tomPlads = !dom.overGraensen && dom.kanOprette;") &&
  view.includes("await skriv.opret({ companyId, userId: user.id, input, nu: guideNu, maaneder: g.grundlag?.maaneder ?? null });") &&
  view.includes("onSlet={() => setSletId(ms.id)}") && view.includes("onSlet={() => setSletId(k.id)}") &&
  hook.includes('import { maalFejlTekst } from "@/lib/hjemmebane/maalFejl";') &&
  hook.includes('toast.error(maalFejlTekst(error, "Kunne ikke oprette målet"))') &&
  // Fund 13: opdaterFelt svarer ok/fejl — grunden er stadig husets tekst (maalFejlTekst), toastet og returneret.
  hook.includes('const grund = maalFejlTekst(error, "Kunne ikke gemme"); toast.error(grund); return { ok: false, grund };') &&
  !/toast\.error\("Kunne ikke oprette målet"\)/.test(hook) &&
  fejl.includes('export const HOEJST_TRE_TEKST = `Du har allerede ${MAX_AKTIVE_MAAL} aktive mål — parkér eller markér et som nået først`;');

/** Dom 5: agenten uden mål-tools. */
export const agentenHolder = (agent: string, toer: string): boolean =>
  !/name: "create_milestone"/.test(agent) && !/name: "update_milestone_progress"/.test(agent) &&
  !/case "create_milestone"/.test(agent) && !/case "update_milestone_progress"/.test(agent) &&
  !/Opret præcis 2 start-milestones/.test(agent) &&
  !/"create_milestone"/.test(toer) && !/"update_milestone_progress"/.test(toer) &&
  /name: "get_milestones"/.test(agent);

/** Dom 6: triggeren «højst tre». */
export const treHolder = (sql: string): boolean =>
  /create or replace function public\.haandhaev_hoejst_tre_aktive_maal\(\)/.test(sql) &&
  /set search_path to 'public'/.test(sql) && !/security definer/i.test(sql) &&
  /if new\.status = 'active' and \(tg_op = 'INSERT' or old\.status is distinct from 'active'\) then/.test(sql) &&
  /if antal >= 3 then/.test(sql) &&
  /create trigger milestones_hoejst_tre_aktive\s+before insert or update on public\.milestones/.test(sql) &&
  !/create policy|drop policy|alter policy/i.test(sql);

/** Dom 7: triggeren «højst tre BEKRÆFTEDE» (punkt 13) — og klienten, der måler reglen. */
export const treBekraeftedeHolder = (raa: string): boolean => {
  const sql = udenSqlKommentarer(raa);
  return (
    (
      raa.split("\n")[0] === "-- IKKE KØRT. KRÆVER JONAS' GRØNNE LYS (SECURITY DEFINER/trigger). DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik)." ||
      // Efter kørslen (2/10-2026): første linje bærer KØRT og Jonas' grønne lys — aldrig et lys, der ikke blev givet.
      /^-- KØRT i prod \d{1,2}\/\d{1,2}-\d{4} .*Jonas' grønne lys/.test(raa.split("\n")[0])
    ) &&
    /create or replace function public\.haandhaev_hoejst_tre_aktive_maal\(\)/.test(sql) &&
    /set search_path to 'public'/.test(sql) && !/security definer/i.test(sql) &&
    /if new\.status = 'active'\s+and new\.bekraeftet_at is not null\s+and \(tg_op = 'INSERT' or old\.status is distinct from 'active' or old\.bekraeftet_at is null\) then/.test(sql) &&
    /and m\.status = 'active'\s+and m\.bekraeftet_at is not null\s+and m\.id is distinct from new\.id;/.test(sql) &&
    /if antal >= 3 then/.test(sql) &&
    // Markøren står i KROPPEN (en kommentar inde i $$ … $$ er en del af prosrc) — ikke kun i filhovedet.
    /PLADSDOM: kun_bekraeftede/.test(raa.match(/haandhaev_hoejst_tre_aktive_maal\(\)\s+returns trigger[\s\S]*?as \$\$([\s\S]*?)\$\$;/)?.[1] ?? "") &&
    /create trigger milestones_hoejst_tre_aktive\s+before insert or update on public\.milestones/.test(sql) &&
    /create or replace function public\.maal_pladser_kun_bekraeftede\(\)\s+returns boolean/.test(sql) &&
    /position\('PLADSDOM: kun_bekraeftede' in p\.prosrc\) > 0/.test(sql) &&
    /exception when others then\s+return false;/.test(sql) &&
    (sql.match(/security definer/gi) ?? []).length === 0 &&
    !/create policy|drop policy|alter policy/i.test(sql) &&
    !/alter table/i.test(sql)
  );
};

/** Dom 7b: klienten måler — «alle» uden svar, reglen kun fra RPC'en, og medlemmets flade sender dommen ind. */
export const klientenMaaler = (lib: string, hook: string, view: string): boolean =>
  lib.includes('export const PLADSDOM_RPC = "maal_pladser_kun_bekraeftede";') &&
  /if \(fejl\) return "alle";\s*return data === true \? "kun_bekraeftede" : "alle";/.test(lib) &&
  hook.includes("(supabase.rpc as any)(PLADSDOM_RPC)") &&
  hook.includes('return q.data ?? "alle";') &&
  !/"kun_bekraeftede"/.test(udenKommentarer(hook)) &&
  view.includes("const pladsdom = useMaalPladsdom();") &&
  view.includes("dineMaalDom(milestones.map(tilMaalRaekke), skridtTilDom, nu, pladsdom)") &&
  view.includes("hovedLinje(kort.length, dom.ubekraeftede.length, dom.pladsdom)");

describe("maalSkriv.guard — fase 2: medlemmet ejer sine mål, rådgiveren skriver gennem maal-skriv, AI aldrig", () => {
  it("dom 1: maal-skriv — auth før rolle før service role; kun rådgivere; «højst tre» kun gennem kanOpretteMaal; opslag og sletning med company_id", () => {
    expect(maalSkrivHolder(udenKommentarer(laes(MAAL_SKRIV)))).toBe(true);
    expect(laes(CONFIG)).toMatch(/\[functions\.maal-skriv\]\s*\n\s*verify_jwt = true/);
  });
  it("dom 2: ingen migration efter fase 1 rører milestones' politikker (Jonas: medlemmet ejer sine mål) — undtagen den FORBEREDTE stramning", () => {
    const migrationer = alleFiler("supabase/migrations", /\.sql$/).map((sti) => ({ sti, sql: laes(sti) }));
    expect(ingenRlsAendring(migrationer)).toEqual([...FORBEREDTE_RLS_STRAMNINGER]);
    for (const sti of FORBEREDTE_RLS_STRAMNINGER) expect(forberedtStramning(laes(sti)), sti).toBe(true);
  });
  it("selvbevis 2b: en forberedt stramning, der er flippet, dropper, opretter eller slækker, falder", () => {
    const f = laes(FORBEREDTE_RLS_STRAMNINGER[0]);
    expect(forberedtStramning(f.replace(/^[^\n]*/, "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik)."))).toBe(false);
    expect(forberedtStramning(f + '\ndrop policy "x" on public.milestones;')).toBe(false);
    expect(forberedtStramning(f + '\ncreate policy "x" on public.milestones for insert with check (true);')).toBe(false);
    expect(forberedtStramning(f.replace(/WITH CHECK \(auth\.uid\(\) = user_id AND company_id = public\.user_company_id\(auth\.uid\(\)\)\)/g, "WITH CHECK (true)"))).toBe(false);
  });
  it("dom 3: klientskrivere til milestones er præcis de bogførte; løftestangen tæller aktive og skriver selv; Planen kun gennem maal-skriv", () => {
    expect(klientskrivere(alleFiler("src"), laes)).toEqual(Object.keys(BOGFOERTE_KLIENTSKRIVERE).sort());
    for (const [f, mønstre] of Object.entries(BOGFOERTE_KLIENTSKRIVERE)) for (const m of mønstre) expect(udenKommentarer(laes(f)), `${f} ${m}`).toMatch(m);
    expect(loeftestangHolder(udenKommentarer(laes(HANDOUT)))).toBe(true);
    const planen = udenKommentarer(laes(PLANEN));
    expect(planen).toContain('functions.invoke("maal-skriv"');
    expect(planen).not.toMatch(/\.from\("milestones"\)/);
  });
  it("dom 4: medlemmets flade («Dine mål») beholder vejen til at sætte et mål (den stiplede plads) og oversætter «højst tre» til husets tekst", () => {
    expect(medlemsfladenHolder(udenKommentarer(laes(MEDLEM)), udenKommentarer(laes(HOOK)), laes(MAALFEJL))).toBe(true);
  });
  it("dom 5: agenten har hverken create_milestone eller update_milestone_progress — kun get_milestones", () => {
    expect(agentenHolder(udenKommentarer(laes(AGENT)), udenKommentarer(laes(TOER)))).toBe(true);
  });
  it("dom 6: triggeren «højst tre» — ikke DEFINER, kun når rækken bliver aktiv, ingen politik", () => {
    expect(treHolder(udenSqlKommentarer(laes(TRE)))).toBe(true);
  });

  it("dom 7: triggeren «højst tre BEKRÆFTEDE» (punkt 13) — markøren i kroppen, RPC'en måler den, ikke DEFINER, ingen politik, første linje kræver grønt lys", () => {
    expect(treBekraeftedeHolder(laes(TRE_BEKRAEFTEDE))).toBe(true);
    expect(klientenMaaler(laes(PLADSDOM), laes(PLADSDOM_HOOK), udenKommentarer(laes(MEDLEM)))).toBe(true);
  });
  it("selvbevis 7: uden markøren i kroppen, uden bekræftelsesleddet, som DEFINER, med «IKKE KØRT. DEPLOY:» eller en klient, der antager reglen, falder", () => {
    const f = laes(TRE_BEKRAEFTEDE);
    expect(treBekraeftedeHolder(f.replace("-- PLADSDOM: kun_bekraeftede (2/10-2026", "-- (2/10-2026"))).toBe(false);
    expect(treBekraeftedeHolder(f.replace(" or old.bekraeftet_at is null) then", ") then"))).toBe(false);
    expect(treBekraeftedeHolder(f.replace("language plpgsql\nset search_path to 'public'\nas $$\ndeclare", "language plpgsql\nsecurity definer\nset search_path to 'public'\nas $$\ndeclare"))).toBe(false);
    expect(treBekraeftedeHolder(f.replace(/^[^\n]*/, "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik)."))).toBe(false);
    expect(treBekraeftedeHolder(f + "\ncreate policy x on public.milestones for insert with check (true);")).toBe(false);
    const lib = laes(PLADSDOM), hook = laes(PLADSDOM_HOOK), view = udenKommentarer(laes(MEDLEM));
    expect(klientenMaaler(lib.replace('if (fejl) return "alle";', 'if (fejl) return "kun_bekraeftede";'), hook, view)).toBe(false);
    expect(klientenMaaler(lib, hook.replace('return q.data ?? "alle";', 'return q.data ?? "kun_bekraeftede";'), view)).toBe(false);
    expect(klientenMaaler(lib, hook, view.replace("skridtTilDom, nu, pladsdom)", "skridtTilDom, nu)"))).toBe(false);
  });

  it("selvbevis 1: service role før auth, en medlems-undtagelse, et hardkodet «>= 3» eller sletning uden company_id falder", () => {
    const k = udenKommentarer(laes(MAAL_SKRIV));
    const admin = "const adminClient = createClient(";
    expect(maalSkrivHolder(admin + "\n" + k.replace(admin, "const adminClientX = createClient("))).toBe(false);
    expect(maalSkrivHolder(k.replace("if (rolleErr || !erRaadgiver) {", "const loeftestangsForslag = true;\n  if (rolleErr || (!erRaadgiver && !loeftestangsForslag)) {"))).toBe(false);
    expect(maalSkrivHolder(k.replace("if (!kanOpretteMaal(antal)) return forFuld(antal);", "if (antal >= 3) return forFuld(antal);"))).toBe(false);
    expect(maalSkrivHolder(k.replace('.delete()\n        .eq("id", maalId as string)\n        .eq("company_id", companyId)', '.delete()\n        .eq("id", maalId as string)'))).toBe(false);
  });
  it("selvbevis 2: en migration der rører milestones' politikker fanges", () => {
    expect(ingenRlsAendring([{ sti: "supabase/migrations/20260918000000_x.sql", sql: 'drop policy if exists "Users can insert own milestones" on public.milestones;' }])).toHaveLength(1);
    expect(ingenRlsAendring([{ sti: "supabase/migrations/20260918000000_x.sql", sql: "-- drop policy x on public.milestones;\nselect 1;" }])).toHaveLength(0);
    expect(ingenRlsAendring([{ sti: "supabase/migrations/20260223155456_a.sql", sql: "create policy x on public.milestones for select using (true);" }])).toHaveLength(0);
  });
  it("selvbevis 3: en ny skriver, en løftestang gennem maal-skriv, eller uden tælling falder", () => {
    const filer = [...alleFiler("src"), "src/lib/ny.ts"];
    expect(klientskrivere(filer, (f) => (f === "src/lib/ny.ts" ? 'await supabase.from("milestones").insert({ title: "x" });' : laes(f)))).toContain("src/lib/ny.ts");
    const h = udenKommentarer(laes(HANDOUT));
    expect(loeftestangHolder(h.replace("const status = loeftestangStatus(antalAktive);", 'const status = "active";'))).toBe(false);
    expect(loeftestangHolder(h + '\nawait supabase.functions.invoke("maal-skriv", {});')).toBe(false);
  });
  it("selvbevis 4: flade uden den stiplede plads, en plads uden dommen, eller hook med den rå fejl falder", () => {
    const view = udenKommentarer(laes(MEDLEM)), hook = udenKommentarer(laes(HOOK)), fejl = laes(MAALFEJL);
    expect(medlemsfladenHolder(view.replace('{tomPlads && <TomPladsKort onSaetMaal={() => aabnGuide(GUIDE_NY)} />}', ""), hook, fejl)).toBe(false);
    expect(medlemsfladenHolder(view.replace("const tomPlads = !dom.overGraensen && dom.kanOprette;", "const tomPlads = true;"), hook, fejl)).toBe(false);
    expect(medlemsfladenHolder(view.replace("onSlet={() => setSletId(ms.id)}", ""), hook, fejl)).toBe(false);
    expect(medlemsfladenHolder(view, hook.replace('toast.error(maalFejlTekst(error, "Kunne ikke oprette målet"))', 'toast.error("Kunne ikke oprette målet")'), fejl)).toBe(false);
  });
  it("selvbevis 5: agenten med toolet tilbage falder", () => {
    const a = udenKommentarer(laes(AGENT)), t = udenKommentarer(laes(TOER));
    expect(agentenHolder(a + '\n{ function: { name: "create_milestone" } }', t)).toBe(false);
    expect(agentenHolder(a, t.replace('"notify_advisor",', '"notify_advisor",\n  "update_milestone_progress",'))).toBe(false);
  });
  it("selvbevis 6: DEFINER eller en politik i trigger-migrationen falder", () => {
    const tre = udenSqlKommentarer(laes(TRE));
    expect(treHolder(tre.replace("set search_path to 'public'", "security definer set search_path to 'public'"))).toBe(false);
    expect(treHolder(tre + "\ncreate policy x on public.milestones for insert with check (true);")).toBe(false);
  });
});
