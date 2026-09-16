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
//   4. Medlemmets flade («Dine mål», fase 3: DineMaalView) beholder opret-
//      knappen (opretKnap i header OG tom tilstand), og hooket oversætter
//      triggerens fejl til husets tekst (maalFejlTekst) ved opret og ved
//      parkér/aktivér.
//   5. Agenten har hverken create_milestone eller update_milestone_progress —
//      hverken i poolen, i executeTool, i SKRIVE_TOOLS eller i onboarding-prompten.
//   6. Triggeren «højst tre» (ikke DEFINER, kun når rækken bliver aktiv, ingen politik).
// Kildelæsning med selvbevis på kopier.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");

const MAAL_SKRIV = "supabase/functions/maal-skriv/index.ts";
const AGENT = "supabase/functions/run-company-agent/index.ts";
const TOER = "supabase/functions/_shared/agentToerkoersel.ts";
const TRE = "supabase/migrations/20260917150000_maal_hoejst_tre_aktive.sql";
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

/** Dom 4: medlemmets flade — opret-knap bevaret, triggerfejl oversat. */
export const medlemsfladenHolder = (view: string, hook: string, fejl: string): boolean =>
  view.includes("const opretKnap = (") && (view.match(/\bopretKnap\}/g) ?? []).length >= 2 &&
  view.includes("onOpret={opret}") && view.includes("onSlet={() => setSletId(ms.id)}") &&
  hook.includes('import { maalFejlTekst } from "@/lib/hjemmebane/maalFejl";') &&
  hook.includes('toast.error(maalFejlTekst(error, "Kunne ikke oprette målet"))') &&
  hook.includes('toast.error(maalFejlTekst(error, "Kunne ikke gemme"))') &&
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

describe("maalSkriv.guard — fase 2: medlemmet ejer sine mål, rådgiveren skriver gennem maal-skriv, AI aldrig", () => {
  it("dom 1: maal-skriv — auth før rolle før service role; kun rådgivere; «højst tre» kun gennem kanOpretteMaal; opslag og sletning med company_id", () => {
    expect(maalSkrivHolder(udenKommentarer(laes(MAAL_SKRIV)))).toBe(true);
    expect(laes(CONFIG)).toMatch(/\[functions\.maal-skriv\]\s*\n\s*verify_jwt = true/);
  });
  it("dom 2: ingen migration efter fase 1 rører milestones' politikker (Jonas: medlemmet ejer sine mål)", () => {
    const migrationer = alleFiler("supabase/migrations", /\.sql$/).map((sti) => ({ sti, sql: laes(sti) }));
    expect(ingenRlsAendring(migrationer)).toEqual([]);
  });
  it("dom 3: klientskrivere til milestones er præcis de bogførte; løftestangen tæller aktive og skriver selv; Planen kun gennem maal-skriv", () => {
    expect(klientskrivere(alleFiler("src"), laes)).toEqual(Object.keys(BOGFOERTE_KLIENTSKRIVERE).sort());
    for (const [f, mønstre] of Object.entries(BOGFOERTE_KLIENTSKRIVERE)) for (const m of mønstre) expect(udenKommentarer(laes(f)), `${f} ${m}`).toMatch(m);
    expect(loeftestangHolder(udenKommentarer(laes(HANDOUT)))).toBe(true);
    const planen = udenKommentarer(laes(PLANEN));
    expect(planen).toContain('functions.invoke("maal-skriv"');
    expect(planen).not.toMatch(/\.from\("milestones"\)/);
  });
  it("dom 4: medlemmets flade («Dine mål») beholder opret-knappen og oversætter «højst tre» til husets tekst", () => {
    expect(medlemsfladenHolder(udenKommentarer(laes(MEDLEM)), udenKommentarer(laes(HOOK)), laes(MAALFEJL))).toBe(true);
  });
  it("dom 5: agenten har hverken create_milestone eller update_milestone_progress — kun get_milestones", () => {
    expect(agentenHolder(udenKommentarer(laes(AGENT)), udenKommentarer(laes(TOER)))).toBe(true);
  });
  it("dom 6: triggeren «højst tre» — ikke DEFINER, kun når rækken bliver aktiv, ingen politik", () => {
    expect(treHolder(udenSqlKommentarer(laes(TRE)))).toBe(true);
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
  it("selvbevis 4: flade uden opret-knap eller hook med den rå fejl falder", () => {
    const view = udenKommentarer(laes(MEDLEM)), hook = udenKommentarer(laes(HOOK)), fejl = laes(MAALFEJL);
    expect(medlemsfladenHolder(view.replace(/\bopretKnap\}/g, "}"), hook, fejl)).toBe(false);
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
