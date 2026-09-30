import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DRIFT_AGENT_MARKOER, KALD_EDGE_STANDARD_MS, KERNE_FELTER, SPOR } from "../../../supabase/functions/_shared/driftDom.ts";

/**
 * Kildeværn for driftsagenten, skive 1 (30/9-2026). Syv domme, hver bevist på en
 * kopi med fejlen indsat:
 *   1. AUTH FØRST OG TØRKØRSEL SOM STANDARD: authenticateServiceRole før
 *      createClient; STRIKS body (kun dry_run); dry_run !== false; tørkørslen
 *      returnerer FØR enhver skrivning og afsendelse; verify_jwt = true.
 *   2. LÅSEN OG ALARMEN: låsen «driftsagent_aktiv» er fail-closed; der mailes kun
 *      inde i «rødt OG sender rigtigt»; email_send_log slås op FØR afsendelsen;
 *      ÉN sendManagedEmail til driftModtager() med nøglen som idempotencyKey (aldrig
 *      Mailgun); ÉN drift-klokke med reference «drift_agent_koersler».
 *   3. SELECT-ONLY: functionen skriver kun i sine egne to tabeller, læser
 *      app_config/email_send_log, kalder kun drift_agent_laes; SQL-læseren er
 *      SECURITY INVOKER uden INSERT/UPDATE/DELETE/kald_edge, og ingen af de tre
 *      migrationer opretter en SECURITY DEFINER eller rører en eksisterende funktion.
 *   4. BEVISET: markøren «skive-1» står i svaret.
 *   5. MIGRATIONERNE: første linje ordret, tidsstempler efter 20260930140000 og
 *      unikke, cron hvert 15. min gennem kald_edge med dry_run false, 60000 < 900000.
 *   6. I TAKT: KERNE_FELTER = nøglerne i drift_agent_kerne; SPOR = værdilisten i
 *      drift_agent_laes; KALD_EDGE_STANDARD_MS = kald_edge_standard_ms().
 *   7. DOMMEN ER _shared's: functionen kalder doemDrift og skaber intet fund selv.
 */
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/ [^\n]*/g, "");
const sqlUdenKommentarer = (s: string) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const FN = "supabase/functions/drift-agent-cron/index.ts";
const CONFIG = "supabase/config.toml";
const MIGRATIONER = "supabase/migrations";
const MIG = `${MIGRATIONER}/20260930150000_driftsagent.sql`;
const RET = `${MIGRATIONER}/20260930151000_driftsagent_rettigheder.sql`;
const CRON = `${MIGRATIONER}/20260930152000_driftsagent_cron.sql`;
const KALD_EDGE = `${MIGRATIONER}/20260910180000_kald_edge.sql`;
const FOERSTE_LINJE = "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).";

export const authOgToerkoersel = (fn: string, config: string): boolean => {
  const f = udenKommentarer(fn);
  const serve = f.slice(f.indexOf("Deno.serve("));
  const i = config.indexOf("[functions.drift-agent-cron]");
  const blok = i === -1 ? "" : config.slice(i, i + 60);
  const koer = f.slice(f.indexOf("export async function koerDriftAgent("));
  const toer = "if (a.toerKoersel) {";
  return (
    serve.includes("const auth = authenticateServiceRole(req);") &&
    serve.includes("if (auth !== true) return auth;") &&
    foer(serve, "authenticateServiceRole(req)", "createClient(supabaseUrl, serviceKey") &&
    f.includes('export const KENDTE_FELTER = ["dry_run"] as const;') &&
    serve.includes("ukendteFelter(raaBody, KENDTE_FELTER)") &&
    foer(serve, "ukendteFelter(raaBody, KENDTE_FELTER)", "createClient(supabaseUrl, serviceKey") &&
    serve.includes("const toerKoersel = raaBody?.dry_run !== false;") &&
    koer.includes(`${toer}\n`) &&
    koer.slice(koer.indexOf(toer)).includes("return r;") &&
    ["sendManagedEmail(", "skrivRaadgiverBesked(", ".insert(", ".upsert(", ".delete("].every((w) => foer(koer, toer, w)) &&
    /verify_jwt = true/.test(blok)
  );
};

export const laasOgAlarm = (fn: string): boolean => {
  const f = udenKommentarer(fn).replace(/\s+/g, " ");
  const gren = "if (dom.alvor === \"roed\" && senderRigtigt) {";
  return (
    f.includes('export const LAAS_NOEGLE = "driftsagent_aktiv";') &&
    f.includes('.eq("config_key", LAAS_NOEGLE)') &&
    f.includes('return v === true || v === "true";') &&
    f.includes("const senderRigtigt = !a.toerKoersel && a.laas;") &&
    (f.match(/sendManagedEmail\(/g) ?? []).length === 1 &&
    (f.match(/skrivRaadgiverBesked\(/g) ?? []).length === 1 &&
    foer(f, gren, '.from("email_send_log").select("message_id").eq("message_id", noegle)') &&
    foer(f, '.from("email_send_log").select("message_id").eq("message_id", noegle)', "sendManagedEmail(") &&
    foer(f, "if (valg.mail) {", "sendManagedEmail(") &&
    f.includes("to: driftModtager(),") &&
    f.includes("idempotencyKey: noegle,") &&
    f.includes('type: "drift",') &&
    f.includes('reference_type: "drift_agent_koersler" satisfies typeof DRIFT_ALARM_REFERENCE,') &&
    !/mailgun/i.test(f)
  );
};

const SKRIVER = /\.(insert|upsert|update|delete)\(/;
export const kunLaesning = (fn: string, migrationer: readonly string[]): boolean => {
  const f = udenKommentarer(fn).replace(/\s+/g, " ");
  const tabeller = [...f.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => ({ navn: m[1], efter: f.slice(m.index! + m[0].length, m.index! + m[0].length + 20) }));
  const egne = ["drift_agent_koersler", "drift_agent_jobs"];
  const tabellerOk = tabeller.length > 0 && tabeller.every((t) =>
    egne.includes(t.navn) || (["app_config", "email_send_log"].includes(t.navn) && t.efter.startsWith(".select(") && !SKRIVER.test(t.efter)));
  const rpc = [...f.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]);
  const sql = migrationer.map((m) => sqlUdenKommentarer(m).toLowerCase());
  const laeser = sql[0].slice(sql[0].indexOf("create or replace function public.drift_agent_laes()"), sql[0].indexOf("revoke all on function public.drift_agent_laes()"));
  const funktioner = sql.flatMap((s) => [...s.matchAll(/create or replace function public\.([a-z_]+)/g)].map((m) => m[1]));
  return (
    tabellerOk &&
    !f.includes(".update(") &&
    rpc.length === 1 && rpc[0] === "drift_agent_laes" &&
    laeser.length > 0 &&
    laeser.includes("security invoker") && laeser.includes("stable") &&
    !/\b(insert|update|delete|truncate)\b|public\.kald_edge\(|net\.http_post\(|cron\.schedule/.test(laeser) &&
    sql.every((s) => !s.includes("security definer")) &&
    funktioner.length === 2 && funktioner.every((n) => n.startsWith("drift_agent_")) &&
    sql.every((s) => !/\b(drop|alter)\s+(function|policy)\b/.test(s))
  );
};

export const beviset = (fn: string): boolean => {
  const f = udenKommentarer(fn);
  return (
    f.includes("const r: DriftAgentResultat = {\n    ok: true,\n    drift_agent: DRIFT_AGENT_MARKOER,") &&
    f.includes("drift_agent: typeof DRIFT_AGENT_MARKOER;") &&
    /import \{[^}]*\bDRIFT_AGENT_MARKOER\b[^}]*\} from "\.\.\/_shared\/driftDom\.ts";/.test(f)
  );
};

export const migrationerneErRigtige = (filer: readonly { navn: string; sql: string }[], navne: readonly string[]): boolean => {
  const cron = filer.find((f) => f.navn.includes("driftsagent_cron"))?.sql ?? "";
  const kode = cron.split("\n").filter((l) => !/^\s*--/.test(l)).map((l) => l.replace(/\s*--.*$/, "")).join("\n").replace(/\s+/g, " ");
  const stempler = navne.map((n) => n.slice(0, 14));
  return (
    filer.length === 3 &&
    filer.every((f) => f.sql.split("\n")[0] === FOERSTE_LINJE) &&
    filer.every((f) => f.navn.slice(0, 14) > "20260930140000") &&
    filer.every((f) => stempler.filter((s) => s === f.navn.slice(0, 14)).length === 1) &&
    /cron\.schedule\( 'drift-agent', '10,25,40,55 \* \* \* \*', \$job\$ SELECT public\.kald_edge\( 'drift-agent-cron', '\{"dry_run": false\}'::jsonb, 60000, 900000 \); \$job\$ \);/.test(kode) &&
    cron.includes("-- Revert: SELECT cron.unschedule('drift-agent');") &&
    filer.every((f) => /FØR-SQL/.test(f.sql) && /EFTER/.test(f.sql))
  );
};

export const iTakt = (mig: string, kaldEdge: string): boolean => {
  const s = sqlUdenKommentarer(mig);
  const kerne = s.slice(s.indexOf("create or replace function public.drift_agent_kerne"), s.indexOf("revoke all on function public.drift_agent_kerne"));
  const byg = kerne.slice(kerne.indexOf("jsonb_build_object("));
  const noegler = [...byg.matchAll(/^\s*'([a-z_]+)',/gm)].map((m) => m[1]).sort();
  const laes = s.slice(s.indexOf("create or replace function public.drift_agent_laes()"));
  const liste = [...laes.matchAll(/\('([a-z_]+)',\s*'([a-z_]+)',\s*'([a-z_]+)'\)/g)].map((m) => `${m[1]}·${m[2]}·${m[3]}`);
  return (
    JSON.stringify(noegler) === JSON.stringify([...KERNE_FELTER].sort()) &&
    JSON.stringify(liste) === JSON.stringify(SPOR.map((x) => `${x.navn}·${x.tid}·${x.felt}`)) &&
    kaldEdge.includes(`AS $$ SELECT ${KALD_EDGE_STANDARD_MS} $$;`)
  );
};

export const dommenErShared = (fn: string): boolean => {
  const f = udenKommentarer(fn);
  return (
    /import \{[^}]*\bdoemDrift\b[^}]*\} from "\.\.\/_shared\/driftDom\.ts";/.test(f) &&
    /const dom = doemDrift\(\{/.test(f) &&
    /import \{[^}]*\bskalAlarmere\b[^}]*\} from "\.\.\/_shared\/driftDom\.ts";/.test(f) &&
    !/alvor:\s*"(roed|gul)"|kode:\s*"/.test(f) &&
    !/laesSkema|sidsteFyring|tilskrivSvar/.test(f)
  );
};

const migNavne = readdirSync(resolve(process.cwd(), MIGRATIONER)).filter((n) => n.endsWith(".sql"));
const egneMig = () => [MIG, RET, CRON].map((sti) => ({ navn: sti.split("/").pop()!, sql: laes(sti) }));

describe("driftDom.guard", () => {
  it("1. auth først, tørkørsel som standard, verify_jwt = true", () => expect(authOgToerkoersel(laes(FN), laes(CONFIG))).toBe(true));
  it("2. låsen fail-closed, én alarmmail til driftModtager, én drift-klokke", () => expect(laasOgAlarm(laes(FN))).toBe(true));
  it("3. SELECT-only: egne tabeller, SECURITY INVOKER, ingen ny SECURITY DEFINER", () => expect(kunLaesning(laes(FN), [laes(MIG), laes(RET), laes(CRON)])).toBe(true));
  it("4. beviset «skive-1» står i svaret", () => {
    expect(DRIFT_AGENT_MARKOER).toBe("skive-1");
    expect(beviset(laes(FN))).toBe(true);
  });
  it("5. migrationernes hoveder, tidsstempler og cron-jobbet", () => expect(migrationerneErRigtige(egneMig(), migNavne)).toBe(true));
  it("6. kernefelter, spor og kald_edge-standarden i takt med SQL'en", () => expect(iTakt(laes(MIG), laes(KALD_EDGE))).toBe(true));
  it("7. dommen er _shared's", () => expect(dommenErShared(laes(FN))).toBe(true));
});

describe("driftDom.guard — dommene fælder på en kopi", () => {
  const fn = laes(FN), config = laes(CONFIG), mig = laes(MIG), ret = laes(RET), cron = laes(CRON), kaldEdge = laes(KALD_EDGE);
  const byt = (k: string, a: string, b: string) => { expect(k.split(a).length - 1, a).toBe(1); return k.split(a).join(b); };

  it("auth fjernet, dry_run som opt-in, et ekstra body-felt, skrivning før tørkørslens return eller verify_jwt false fælder dom 1", () => {
    expect(authOgToerkoersel(byt(fn, "  const auth = authenticateServiceRole(req);\n  if (auth !== true) return auth;\n", ""), config)).toBe(false);
    expect(authOgToerkoersel(byt(fn, "const toerKoersel = raaBody?.dry_run !== false;", "const toerKoersel = raaBody?.dry_run === true;"), config)).toBe(false);
    expect(authOgToerkoersel(byt(fn, 'export const KENDTE_FELTER = ["dry_run"] as const;', 'export const KENDTE_FELTER = ["dry_run", "nu"] as const;'), config)).toBe(false);
    expect(authOgToerkoersel(byt(fn, "  // TØRKØRSEL: intet skrives, intet sendes.\n", '  await admin.from("drift_agent_jobs").upsert([]);\n'), config)).toBe(false);
    expect(authOgToerkoersel(fn, byt(config, "[functions.drift-agent-cron]\n    verify_jwt = true", "[functions.drift-agent-cron]\n    verify_jwt = false"))).toBe(false);
  });

  it("en åben lås som standard, mail uden rødt, ingen opslag før afsendelse, en anden modtager eller en anden reference fælder dom 2", () => {
    expect(laasOgAlarm(byt(fn, 'return v === true || v === "true";', "return v !== false;"))).toBe(false);
    expect(laasOgAlarm(byt(fn, 'if (dom.alvor === "roed" && senderRigtigt) {', "if (senderRigtigt) {"))).toBe(false);
    expect(laasOgAlarm(byt(fn, "const senderRigtigt = !a.toerKoersel && a.laas;", "const senderRigtigt = !a.toerKoersel;"))).toBe(false);
    expect(laasOgAlarm(byt(fn, ".eq(\"message_id\", noegle)", ".eq(\"message_id\", \"x\")"))).toBe(false);
    expect(laasOgAlarm(byt(fn, "to: driftModtager(),", 'to: "kontakt@theboardroom.dk",'))).toBe(false);
    expect(laasOgAlarm(byt(fn, "idempotencyKey: noegle,", "idempotencyKey: crypto.randomUUID(),"))).toBe(false);
    expect(laasOgAlarm(byt(fn, 'reference_type: "drift_agent_koersler" satisfies', 'reference_type: "drift_agent" satisfies'))).toBe(false);
  });

  it("en skrivning i en fremmed tabel, en ny SECURITY DEFINER, en skrivning i læseren eller et andet RPC fælder dom 3", () => {
    expect(kunLaesning(`${fn}\nawait admin.from("companies").update({ x: 1 });\n`, [mig, ret, cron])).toBe(false);
    expect(kunLaesning(byt(fn, '.from("app_config").select("config_value")', '.from("app_config").upsert({}).select("config_value")'), [mig, ret, cron])).toBe(false);
    expect(kunLaesning(byt(fn, 'admin.rpc("drift_agent_laes")', 'admin.rpc("vagt_cron")'), [mig, ret, cron])).toBe(false);
    expect(kunLaesning(fn, [byt(mig, "stable\nsecurity invoker\nset search_path = public\nas $$\ndeclare\n  -- De seneste", "stable\nsecurity definer\nset search_path = public\nas $$\ndeclare\n  -- De seneste"), ret, cron])).toBe(false);
    expect(kunLaesning(fn, [byt(mig, "  -- Vagtens seneste række.\n", "  delete from public.cron_vagt_log;\n"), ret, cron])).toBe(false);
    expect(kunLaesning(fn, [`${mig}\ncreate or replace function public.has_role(uuid, text) returns boolean language sql as $$ select true $$;\n`, ret, cron])).toBe(false);
  });

  it("en manglende markør fælder dom 4", () => {
    expect(beviset(byt(fn, "    drift_agent: DRIFT_AGENT_MARKOER,\n    dry_run: a.toerKoersel,", "    dry_run: a.toerKoersel,"))).toBe(false);
  });

  it("et hoved med forklaringen først, et genbrugt tidsstempel, et andet skema eller en timeout ≥ interval fælder dom 5", () => {
    const filer = egneMig();
    const med = (i: number, sql: string) => filer.map((f, j) => (j === i ? { ...f, sql } : f));
    expect(migrationerneErRigtige(med(0, mig.split("\n").slice(1).join("\n")), migNavne)).toBe(false);
    expect(migrationerneErRigtige(filer, [...migNavne, "20260930150000_andet.sql"])).toBe(false);
    expect(migrationerneErRigtige(filer.map((f, j) => (j === 1 ? { ...f, navn: "20260930120000_driftsagent_rettigheder.sql" } : f)), migNavne)).toBe(false);
    expect(migrationerneErRigtige(med(2, byt(cron, "'10,25,40,55 * * * *'", "'*/5 * * * *'")), migNavne)).toBe(false);
    expect(migrationerneErRigtige(med(2, byt(cron, "    60000,       -- timeout", "    900000,      -- timeout")), migNavne)).toBe(false);
    expect(migrationerneErRigtige(med(2, byt(cron, "'{\"dry_run\": false}'::jsonb", "'{}'::jsonb")), migNavne)).toBe(false);
  });

  it("et kernefelt mere i SQL'en, et spor med forkert kolonne eller en anden kald_edge-standard fælder dom 6", () => {
    expect(iTakt(byt(mig, "    'drift_agent',       case", "    'navn', j->'navn',\n    'drift_agent',       case"), kaldEdge)).toBe(false);
    expect(iTakt(byt(mig, "('klaviyo_haendelser', 'sendt_at',          'udfald')", "('klaviyo_haendelser', 'oprettet_at',       'udfald')"), kaldEdge)).toBe(false);
    expect(iTakt(mig, byt(kaldEdge, "AS $$ SELECT 30000 $$;", "AS $$ SELECT 45000 $$;"))).toBe(false);
  });

  it("et fund skabt i functionen eller en egen skemaregning fælder dom 7", () => {
    expect(dommenErShared(`${fn}\nconst ekstra = { kode: "stille", alvor: "roed", emne: "x", saetning: "" };\n`)).toBe(false);
    expect(dommenErShared(`${fn}\nconst s = laesSkema("* * * * *");\n`)).toBe(false);
    expect(dommenErShared(byt(fn, "const dom = doemDrift({", "const dom = egenDom({"))).toBe(false);
  });
});
