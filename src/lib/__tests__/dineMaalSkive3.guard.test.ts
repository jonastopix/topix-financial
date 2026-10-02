import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for «Dine mål», skive 3 (Jonas' svar på aftenlisten 1/10-2026 kl.
// 22:04–22:09; docs/dine-maal-design.md «Skive 3»; migration 20261002100000):
//   1. «Ja, ét klik» — et ubekræftet mål er et forslag: fladens kort og
//      pladserne er de bekræftede (dineMaalDom), forsidens fokus læser kun
//      bekræftede (maalFokus), og Score's «mål»-point læses af Dine mål gennem
//      taellerSomScoreMaal — ikke af kpi_targets (undtagen som fail-soft).
//   2. «Bekræft eller slip» — «Slip»/«Ikke nu»/«Parkér» er status 'parked';
//      ingen af skive 3's skrivere sletter en række. Bekræftelsen er guardet på
//      bekraeftet_at IS NULL + status active.
//   3. Pejlemærker — /kpis siger aldrig «mål» om KPI-målene i synlig tekst
//      (ordene bor i kpiMaal.PEJLEMAERKE_ORD); Score-løfteren peger på /milestones.
//   4. Kvartalstjekket — ordforrådet (KVARTALER, KVARTAL_VALG) står ORDRET i
//      migrationens CHECK'e; handlingen skrives FØR rækken (parkér/nået →
//      registrér); tjekket er i begge flader (Dine mål + forsiden) gennem
//      SAMME komponent, og rådgiverens forside bærer linjen.
//   5. Fail-soft — hentningerne falder tilbage ved en manglende kolonne/tabel
//      (erManglendeKolonne/erManglendeTabel), og erBekraeftet dømmer undefined
//      som «i dag» (bekræftet).
//   6. Migrationen er KUN tilføjende: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF
//      NOT EXISTS, ingen ALTER/DROP POLICY på eksisterende tabeller, ingen
//      SECURITY DEFINER, backfillen guardet på bekraeftet_at IS NULL, første
//      linje «IKKE KØRT».
//   7. Rådets fund 9 + 11 (2/10): ankeret KVARTALSTJEK_FRA står ÉT sted i
//      motoren og ORDRET i migrationens INSERT-policy (greatest(…, date
//      '2026-10-02')), og policyens dom er klientens maaRegistrereKvartalstjek:
//      bekræftet, forfaldent (3·kvartal og 12 måneder fra ankeret), ingen række
//      med kvartal ≥ k, og status efter valget (parkeret → parked, naaet →
//      completed, ellers active).
//   8. Rådets fund 1 (2/10): kvartalstjekkets «Nået» på Dine mål går gennem
//      hookets GUARDEDE skriv.markerNaaet (ok/grund), og rækken registreres
//      KUN efter ok — aldrig useMilestones' void-skriver. Runde 2, fund 7: efter
//      ok fejres med SAMME fejring som målkortets «Markér som nået»
//      (useMilestones.fejr), før rækken.
//   9. Runde 2, fund 9: FØR INSERT'en i registrerKvartalstjek dømmes klientens
//      spejl af policyen (doemKvartalstjek), så grunden vises — og
//      maaRegistrereKvartalstjek er den samme dom uden grund.
//  10. Runde 2, fund 3 + 8: «Genåbn» (nået → aktiv) og «Aktivér» (parkeret →
//      aktiv) skriver begge gennem aktiverFelter (et ubekræftet mål bekræftes
//      ved klikket); GAMLE_MAAL_FOER udledes af KVARTALSTJEK_FRA (én kilde).
// Selvbevis på kopier: hver regel falder, når kilden ændres tilbage.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");

const MOTOR = "src/lib/hjemmebane/maalBekraeft.ts";
const DINE_MAAL_DOM = "src/lib/hjemmebane/dineMaal.ts";
const MAAL_FOKUS = "src/lib/hjemmebane/maalFokus.ts";
const HOOK = "src/hooks/dineMaalGrundlag.ts";
const SCORE_HOOK = "src/hooks/useBoardroomScore.ts";
const SCORE = "src/lib/boardroomScore/score.ts";
const KPIS = "src/components/hjemmebane/noegletal/NoegletalView.tsx";
const KORT = "src/components/hjemmebane/milestones/BekraeftMaalKort.tsx";
const VIEW = "src/components/hjemmebane/milestones/DineMaalView.tsx";
const FORSIDE = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const NEXT_STEP = "src/components/hjemmebane/boardroom/nextStep.ts";
const RAADGIVER_FORSIDE = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";
const MIGRATION = "supabase/migrations/20261002100000_maal_bekraeft_kvartal.sql";

/** Dom 1: ubekræftede tæller ikke — kort, pladser, fokus, Score. */
export const ubekraeftedeTaellerIkke = (dom: string, fokus: string, hook: string, scoreHook: string): boolean => {
  const d = udenKommentarer(dom);
  const f = udenKommentarer(fokus);
  const h = udenKommentarer(hook);
  const s = udenKommentarer(scoreHook);
  return (
    /const bekraeftede = plan\.aktive\.filter\(\(x\) => erBekraeftet\(x\.maal\)\);/.test(d) &&
    /aktive: bekraeftede\.map\(til\)/.test(d) &&
    /graenseTekst: graenseTekst\(bekraeftede\.length, ubekraeftede\.length\)/.test(d) &&
    /afgoerMilepael\(m, nu\)\.aktiv && erBekraeftet\(m\)/.test(f) &&
    /g\.maal\.filter\(\(m\) => m\.status === "active" && erBekraeftet\(m\)\)/.test(h) &&
    /\.some\(taellerSomScoreMaal\)/.test(s) &&
    // kpi_targets kun i tilbagefaldet bag erManglendeKolonne.
    /if \(maal\.error && erManglendeKolonne\(maal\.error\)\) \{\s*const kpi = await supabase\.from\("kpi_targets"\)/.test(s)
  );
};

/** Dom 2: slip = parkér, aldrig slet; bekræftelsen guardet. */
export const slipErParkering = (hook: string, kort: string): boolean => {
  const h = udenKommentarer(hook);
  const skive3 = h.slice(h.indexOf("export async function bekraeftMaal"), h.indexOf("export const RETNING_IKKE_GEMT_TEKST"));
  return (
    /\.update\(\{ status: "parked" \}\)\.eq\("id", args\.maalId\)\.eq\("status", "active"\)/.test(skive3) &&
    !/\.delete\(/.test(skive3) &&
    /\.is\("bekraeftet_at" as never, null\)\s*\.eq\("status", "active"\)/.test(skive3) &&
    !/\.delete\(/.test(udenKommentarer(kort)) &&
    !/\bslet\b/i.test(udenKommentarer(kort).replace(/SLET aldrig/g, ""))
  );
};

/** Dom 3: pejlemærker på /kpis; Score-løfteren peger på /milestones. */
export const pejlemaerkerHolder = (kpis: string, score: string): boolean => {
  const k = udenKommentarer(kpis);
  // Ordet «mål» (ikke «målt»/«måle»/«opfyldelse» — \b stopper ved «l») må ikke stå i kilden uden
  // for kommentarer: identifikatorer er ASCII (maal), så en forekomst er synlig tekst.
  const synligeMaal = k.split("\n").filter((l) => /\bmål\b/i.test(l));
  return (
    synligeMaal.length === 0 &&
    /PEJLEMAERKE_ORD\.eyebrow/.test(k) &&
    /PEJLEMAERKE_ORD\.saet/.test(k) &&
    /PEJLEMAERKE_ORD\.gem/.test(k) &&
    /sti: "\/milestones"/.test(udenKommentarer(score)) &&
    !/sti: "\/kpis"/.test(udenKommentarer(score))
  );
};

/** Dom 4: kvartalstjekkets ordforråd = migrationens CHECK'e; handlingen før rækken; samme komponent i begge flader; rådgiverlinjen. */
export const kvartalstjekHolder = (motor: string, migration: string, view: string, forside: string, nextStep: string, raadgiverForside: string): boolean => {
  const m = udenKommentarer(motor);
  const sql = udenSqlKommentarer(migration);
  const kvartaler = /export const KVARTALER = \[([^\]]+)\] as const;/.exec(m)?.[1].replace(/\s/g, "");
  const valg = /export const KVARTAL_VALG = \[([^\]]+)\] as const;/.exec(m)?.[1].replace(/\s|"/g, "");
  const sqlKvartal = /kvartal\s+smallint NOT NULL CHECK \(kvartal IN \(([^)]+)\)\)/.exec(sql)?.[1].replace(/\s/g, "");
  const sqlValg = /valg\s+text NOT NULL CHECK \(valg IN \(([^)]+)\)\)/.exec(sql)?.[1].replace(/\s|'/g, "");
  const v = udenKommentarer(view);
  const f = udenKommentarer(forside);
  const handlingFoerRaekke = (k: string) => {
    const blok = k.slice(k.indexOf("const kvartalHandling"), k.indexOf("const kvartalHandling") + 1200);
    const parker = blok.indexOf('h.valg === "parkeret"');
    const naaet = blok.indexOf('h.valg === "naaet"');
    const raekke = blok.indexOf("registrerKvartal");
    return parker > 0 && naaet > parker && raekke > naaet;
  };
  return (
    !!kvartaler && kvartaler === sqlKvartal && !!valg && valg === sqlValg &&
    /UNIQUE \(milestone_id, kvartal\)/.test(sql) &&
    handlingFoerRaekke(v) && handlingFoerRaekke(f) &&
    /<BekraeftMaalKort/.test(v) && /<BekraeftMaalKort/.test(f) &&
    /kvartalstjek: ventendeKvartalstjek,/.test(f) &&
    /kind: "kvartalstjek"/.test(udenKommentarer(nextStep)) &&
    /<KvartalstjekVenter hentning=\{kvartalstjekQuery\}/.test(udenKommentarer(raadgiverForside))
  );
};

/** Dom 5: fail-soft. */
export const failSoftHolder = (motor: string, hook: string, forside: string): boolean => {
  const m = udenKommentarer(motor);
  const h = udenKommentarer(hook);
  const f = udenKommentarer(forside);
  return (
    /if \(m\.bekraeftet_at === undefined\) return true;/.test(m) &&
    /const skive3 = await hent\(MAAL_KOLONNER_SKIVE3\);\s*if \(!\(skive3\.error && erManglendeKolonne\(skive3\.error\)\)\)/.test(h) &&
    /if \(res\?\.error && erManglendeTabel\(res\.error\)\) return \[\];/.test(h) &&
    /if \(svar\.error && erManglendeKolonne\(svar\.error\)\) svar = await supabase\.from\("milestones"\)\.insert\(payload\)/.test(h) &&
    /if \(res\.error && erManglendeKolonne\(res\.error\)\) res = await hent\(gamle\);/.test(f)
  );
};

/** Dom 6: migrationen er kun tilføjende. */
export const migrationenTilfoejer = (migration: string): boolean => {
  const sql = udenSqlKommentarer(migration);
  return (
    migration.startsWith("-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).") &&
    /ADD COLUMN IF NOT EXISTS bekraeftet_at timestamptz NULL/.test(sql) &&
    /ADD COLUMN IF NOT EXISTS bekraeftet_af uuid NULL/.test(sql) &&
    /CREATE TABLE IF NOT EXISTS public\.maal_kvartalstjek/.test(sql) &&
    /ENABLE ROW LEVEL SECURITY/.test(sql) &&
    !/ALTER POLICY/.test(sql) &&
    !/SECURITY DEFINER/i.test(sql) &&
    !/CREATE (OR REPLACE )?FUNCTION/i.test(sql) &&
    !/DROP (TABLE|COLUMN)/i.test(sql) &&
    // DROP POLICY kun på den nye tabel (idempotens).
    [...sql.matchAll(/DROP POLICY IF EXISTS "[^"]+" ON public\.([a-z_]+)/g)].every((x) => x[1] === "maal_kvartalstjek") &&
    /UPDATE public\.milestones m\s+SET bekraeftet_at = m\.created_at,\s+bekraeftet_af = m\.user_id\s+WHERE m\.bekraeftet_at IS NULL\s+AND m\.source = 'manual'\s+AND EXISTS \(SELECT 1 FROM public\.company_members cm/.test(sql) &&
    /GRANT SELECT, INSERT ON public\.maal_kvartalstjek TO authenticated;/.test(sql) &&
    !/GRANT [^;]*(UPDATE|DELETE)[^;]*maal_kvartalstjek/.test(sql)
  );
};

/** Dom 7: ankeret og INSERT-policyens dom = klientens. */
export const ankerOgPolicyHolder = (motor: string, migration: string): boolean => {
  const m = udenKommentarer(motor);
  const sql = udenSqlKommentarer(migration);
  const fra = /export const KVARTALSTJEK_FRA = "(\d{4}-\d{2}-\d{2})";/.exec(m)?.[1];
  if (!fra) return false;
  const policy = sql.slice(sql.indexOf('CREATE POLICY "Company members can insert company kvartalstjek"'), sql.indexOf('DROP POLICY IF EXISTS "Advisors can view all kvartalstjek"'));
  const greatest = `greatest((m.bekraeftet_at AT TIME ZONE 'Europe/Copenhagen')::date, date '${fra}')`;
  return (
    // Klienten: ankeret klippes til KVARTALSTJEK_FRA, skillelinjen udledes af den (dom 10), og spejlet dømmer status efter valget.
    /return dato < KVARTALSTJEK_FRA \? KVARTALSTJEK_FRA : dato;/.test(m) &&
    /export const GAMLE_MAAL_FOER = kbhTilUtc\(KVARTALSTJEK_FRA, 0, 0\)\.toISOString\(\);/.test(m) &&
    (m.match(/\d{4}-\d{2}-\d{2}/g) ?? []).length === 1 &&
    /valg === "parkeret" \? maal\.status === "active" \|\| maal\.status === "parked"/.test(m) &&
    /valg === "naaet" \? maal\.status === "active" \|\| maal\.status === "completed"/.test(m) &&
    /: maal\.status === "active";/.test(m) &&
    /\(laesKvartal\(t\.kvartal\) \?\? 0\) >= kvartal/.test(m) &&
    // Policyen: samme anker to gange (forfald og slut), samme statusdom, samme «ingen række ≥ k».
    policy.split(greatest).length === 3 &&
    policy.includes("make_interval(months => 3 * maal_kvartalstjek.kvartal)") &&
    policy.includes("make_interval(months => 12)") &&
    policy.includes("m.bekraeftet_at IS NOT NULL") &&
    policy.includes("WHEN 'parkeret' THEN m.status IN ('active', 'parked')") &&
    policy.includes("WHEN 'naaet'    THEN m.status IN ('active', 'completed')") &&
    policy.includes("ELSE                 m.status = 'active'") &&
    policy.includes("AND t.kvartal >= maal_kvartalstjek.kvartal") &&
    policy.includes("(now() AT TIME ZONE 'Europe/Copenhagen')::date")
  );
};

/** Dom 8: «Nået» i kvartalstjekket på Dine mål = hookets guardede skriver, rækken kun efter ok. */
export const naaetGuardet = (view: string): boolean => {
  const v = udenKommentarer(view);
  const blok = v.slice(v.indexOf("const kvartalHandling"), v.indexOf("const aabnJuster"));
  return (
    /else if \(h\.valg === "naaet"\) \{\s*const s = await skriv\.markerNaaet\(\{ maalId: h\.maalId \}\);\s*if \(s\.ok === false\) return s\.grund;\s*fejr\(/.test(blok) &&
    !/markerNaaetOgRyd/.test(blok)
  );
};

/** Dom 9: dommen med grund FØR INSERT'en; maaRegistrereKvartalstjek = doemKvartalstjek uden grund. */
export const domFoerInsert = (hook: string, motor: string, view: string, forside: string): boolean => {
  const h = udenKommentarer(hook);
  const m = udenKommentarer(motor);
  const fn = h.slice(h.indexOf("export async function registrerKvartalstjek"), h.indexOf("export async function goerMaalSkarpt"));
  const dom = fn.indexOf("doemKvartalstjek(args.maal, args.tjek, args.kvartal, args.valg, args.nu)");
  const insert = fn.indexOf('.from("maal_kvartalstjek" as any).insert(');
  return (
    dom > 0 && insert > dom &&
    /if \(dom\.ok === false\) return \{ ok: false, grund: dom\.grund, afventerMigration: false \};/.test(fn) &&
    /return doemKvartalstjek\(maal, tjek, kvartal, valg, nu\)\.ok;/.test(m) &&
    // Begge flader giver målet som det står EFTER handlingen og de registrerede rækker med.
    /status: statusEfterKvartalValg\(raa\.status, valg\)/.test(udenKommentarer(view)) &&
    /status: statusEfterKvartalValg\(maal\.status, h\.valg\)/.test(udenKommentarer(forside))
  );
};

/** Dom 10: Genåbn og Aktivér gennem aktiverFelter. */
export const genaabnBekraefter = (view: string): boolean => {
  const v = udenKommentarer(view);
  return (
    /onGenaabn=\{\(\) => void opdaterMaalFelt\(ms\.id, aktiverFelter\(ms, /.test(v) &&
    /onAktiver=\{\(\) => void opdaterMaalFelt\(ms\.id, aktiverFelter\(ms, /.test(v) &&
    !/\{ status: "active" \}/.test(v)
  );
};

describe("dineMaalSkive3.guard", () => {
  it("dom 1: ubekræftede mål tæller ikke — kort, pladser, forsidens fokus og Score", () => {
    const dom = laes(DINE_MAAL_DOM);
    const fokus = laes(MAAL_FOKUS);
    const hook = laes(HOOK);
    const score = laes(SCORE_HOOK);
    expect(ubekraeftedeTaellerIkke(dom, fokus, hook, score)).toBe(true);
    expect(ubekraeftedeTaellerIkke(dom.replace("aktive: bekraeftede.map(til)", "aktive: plan.aktive.map(til)"), fokus, hook, score)).toBe(false);
    expect(ubekraeftedeTaellerIkke(dom, fokus.replace(" && erBekraeftet(m)", ""), hook, score)).toBe(false);
    expect(ubekraeftedeTaellerIkke(dom, fokus, hook, score.replace(".some(taellerSomScoreMaal)", ".length > 0"))).toBe(false);
  });

  it("dom 2: «Slip»/«Ikke nu»/«Parkér» er parkering, aldrig slet; bekræftelsen guardet", () => {
    const hook = laes(HOOK);
    const kort = laes(KORT);
    expect(slipErParkering(hook, kort)).toBe(true);
    expect(slipErParkering(hook.replace('.update({ status: "parked" }).eq("id", args.maalId).eq("status", "active")', '.delete().eq("id", args.maalId)'), kort)).toBe(false);
    expect(slipErParkering(hook.replace('.is("bekraeftet_at" as never, null)\n    .eq("status", "active")', ''), kort)).toBe(false);
  });

  it("dom 3: /kpis siger «pejlemærker», aldrig «mål», i synlig tekst; Score-løfteren peger på /milestones", () => {
    const kpis = laes(KPIS);
    const score = laes(SCORE);
    expect(pejlemaerkerHolder(kpis, score)).toBe(true);
    expect(pejlemaerkerHolder(kpis.replace("{PEJLEMAERKE_ORD.ingen}", "Ingen mål sat endnu."), score)).toBe(false);
    expect(pejlemaerkerHolder(kpis, score.replace('sti: "/milestones"', 'sti: "/kpis"'))).toBe(false);
  });

  it("dom 4: kvartalstjekkets ordforråd = migrationens CHECK'e; handling før række; samme komponent i begge flader; rådgiverlinjen", () => {
    const motor = laes(MOTOR);
    const migration = laes(MIGRATION);
    const view = laes(VIEW);
    const forside = laes(FORSIDE);
    const nextStep = laes(NEXT_STEP);
    const raadgiver = laes(RAADGIVER_FORSIDE);
    expect(kvartalstjekHolder(motor, migration, view, forside, nextStep, raadgiver)).toBe(true);
    expect(kvartalstjekHolder(motor.replace('["behold", "justeret", "parkeret", "naaet"]', '["behold", "justeret", "parkeret", "naaet", "slettet"]'), migration, view, forside, nextStep, raadgiver)).toBe(false);
    expect(kvartalstjekHolder(motor, migration, view, forside.replace("kvartalstjek: ventendeKvartalstjek,", ""), nextStep, raadgiver)).toBe(false);
    expect(kvartalstjekHolder(motor, migration, view, forside, nextStep, raadgiver.replace("<KvartalstjekVenter hentning={kvartalstjekQuery}", "<div"))).toBe(false);
  });

  it("dom 5: fail-soft på en manglende kolonne/tabel — klienten opfører sig som i dag", () => {
    const motor = laes(MOTOR);
    const hook = laes(HOOK);
    const forside = laes(FORSIDE);
    expect(failSoftHolder(motor, hook, forside)).toBe(true);
    expect(failSoftHolder(motor.replace("if (m.bekraeftet_at === undefined) return true;", "if (m.bekraeftet_at === undefined) return false;"), hook, forside)).toBe(false);
    expect(failSoftHolder(motor, hook.replace("if (res?.error && erManglendeTabel(res.error)) return [];", ""), forside)).toBe(false);
  });

  it("dom 6: migrationen er kun tilføjende, backfillen guardet, første linje «IKKE KØRT»", () => {
    const migration = laes(MIGRATION);
    expect(migrationenTilfoejer(migration)).toBe(true);
    expect(migrationenTilfoejer(migration.replace("WHERE m.bekraeftet_at IS NULL\n", "WHERE true\n"))).toBe(false);
    expect(migrationenTilfoejer(migration + "\nALTER POLICY \"x\" ON public.milestones USING (true);")).toBe(false);
    expect(migrationenTilfoejer(migration.replace("-- IKKE KØRT.", "-- KØRT."))).toBe(false);
  });

  it("dom 7: KVARTALSTJEK_FRA står ét sted og ordret i INSERT-policyen; policyens dom = klientens maaRegistrereKvartalstjek", () => {
    const motor = laes(MOTOR);
    const migration = laes(MIGRATION);
    expect(ankerOgPolicyHolder(motor, migration)).toBe(true);
    expect(ankerOgPolicyHolder(motor.replace('export const KVARTALSTJEK_FRA = "2026-10-02";', 'export const KVARTALSTJEK_FRA = "2026-10-03";'), migration)).toBe(false);
    expect(ankerOgPolicyHolder(motor, migration.replace("WHEN 'parkeret' THEN m.status IN ('active', 'parked')", "WHEN 'parkeret' THEN true"))).toBe(false);
    expect(ankerOgPolicyHolder(motor, migration.replace("AND t.kvartal >= maal_kvartalstjek.kvartal", "AND t.kvartal = maal_kvartalstjek.kvartal"))).toBe(false);
  });

  it("dom 8: kvartalstjekkets «Nået» på Dine mål er hookets guardede skriver — rækken kun efter ok, fejringen efter ok", () => {
    const view = laes(VIEW);
    expect(naaetGuardet(view)).toBe(true);
    expect(naaetGuardet(view.replace("const s = await skriv.markerNaaet({ maalId: h.maalId });\n      if (s.ok === false) return s.grund;", "await markerNaaetOgRyd(h.maalId);"))).toBe(false);
    expect(naaetGuardet(view.replace(/\n\s*fejr\(msAf[^\n]*\n/, "\n"))).toBe(false);
  });

  it("dom 9: doemKvartalstjek FØR INSERT'en (grunden vises), i begge flader", () => {
    const hook = laes(HOOK);
    const motor = laes(MOTOR);
    const view = laes(VIEW);
    const forside = laes(FORSIDE);
    expect(domFoerInsert(hook, motor, view, forside)).toBe(true);
    // Mod-prøven rammer kvartalstjekkets dom (ikke opret/goerSkarpt, som bærer samme linje).
    expect(domFoerInsert(hook.replace("const dom = doemKvartalstjek(args.maal, args.tjek, args.kvartal, args.valg, args.nu);\n    if (dom.ok === false) return { ok: false, grund: dom.grund, afventerMigration: false };", ""), motor, view, forside)).toBe(false);
    expect(domFoerInsert(hook, motor.replace("return doemKvartalstjek(maal, tjek, kvartal, valg, nu).ok;", "return true;"), view, forside)).toBe(false);
    expect(domFoerInsert(hook, motor, view.replace("status: statusEfterKvartalValg(raa.status, valg)", "status: raa.status"), forside)).toBe(false);
  });

  it("dom 10: Genåbn og Aktivér bekræfter ved klikket (aktiverFelter); GAMLE_MAAL_FOER udledes af KVARTALSTJEK_FRA", () => {
    const view = laes(VIEW);
    expect(genaabnBekraefter(view)).toBe(true);
    expect(genaabnBekraefter(view.replace(/onGenaabn=\{\(\) => void opdaterMaalFelt\(ms\.id, aktiverFelter\(ms, [^\n]*\n/, 'onGenaabn={() => void opdaterMaalFelt(ms.id, { status: "active" })}\n'))).toBe(false);
    const motor = laes(MOTOR);
    expect(ankerOgPolicyHolder(motor.replace("export const GAMLE_MAAL_FOER = kbhTilUtc(KVARTALSTJEK_FRA, 0, 0).toISOString();", 'export const GAMLE_MAAL_FOER = "2026-10-02T00:00:00.000Z";'), laes(MIGRATION))).toBe(false);
  });
});
