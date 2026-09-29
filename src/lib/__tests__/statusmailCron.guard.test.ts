import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SELVMAILENDE_REFERENCER } from "../../../supabase/functions/_shared/klokkeMail.ts";

/**
 * Kildeværn for statusmail-cron (trin 2, 29/9-2026). Syv domme, hver bevist på
 * en kopi med fejlen indsat:
 *
 *   1. AUTH FØRST: authenticateServiceRole(req) står FØR createClient i
 *      Deno.serve, og config.toml har verify_jwt = true for functionen.
 *   2. TØRKØRSEL SOM STANDARD: dry_run !== false; body STRIKS (KENDTE_FELTER
 *      dry_run · nu, ukendteFelter); uden for vinduet hentes intet.
 *   3. NØGLEOPSLAG FØR SEND: email_send_log slås op på statusMailNoegle, og
 *      sendManagedEmail får samme nøgle som idempotencyKey og STATUSMAIL_LABEL.
 *   4. FILTRENE ER ENS I HOOK OG FUNCTION: for hver af de 13 tabeller er
 *      select-kolonnerne (hookens ⊆ functionens, kun `name` må komme til) og
 *      filterkæden (.eq/.is/.neq/.in FØR .order) ordret ens; ingen .limit(;
 *      login-løkken stopper på brugere. Derefter ÉT kald byggOverblik.
 *   5. VINDUET: functionen dømmer gennem erStatusmailVindue (mandag, time ≥ 7
 *      dansk), og cron-udtrykket er '33 5,6 * * 1' — og INGEN anden cron rammer
 *      minut 33 i timerne 5 eller 6 (regnet af alle cron.schedule i migrationerne).
 *   6. ÉN DRIFT-KLOKKE VED FEJL: skrivRaadgiverBesked type «drift», reference_type
 *      «statusmail», kaldt én gang efter løkken, kun når r.fejl.length > 0 — og
 *      functionen mailer IKKE driftModtager selv; «statusmail» står IKKE på
 *      SELVMAILENDE_REFERENCER (klokke-mail-cron skal maile klokken).
 *   7. MIGRATIONENS HOVED: første linje «-- IKKE KØRT. DEPLOY: …», jobbet
 *      'statusmail', kald_edge('statusmail-cron', …), timeout < interval.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSql = (k: string) => k.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const FUNKTION = "supabase/functions/statusmail-cron/index.ts";
const HOOK = "src/hooks/medlemsOverblik.ts";
const CONFIG = "supabase/config.toml";
const MIG = "supabase/migrations/20260929170000_statusmail_cron.sql";
const MIG_DIR = "supabase/migrations";
const TEKST = "supabase/functions/_shared/statusMail.ts";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const authFoerst = (funktion: string, config: string): boolean => {
  const f = udenKommentarer(funktion);
  const serve = f.slice(f.indexOf("Deno.serve("));
  const blok = config.slice(config.indexOf("[functions.statusmail-cron]"), config.indexOf("[functions.statusmail-cron]") + 80);
  return (
    serve.includes("const auth = authenticateServiceRole(req);") &&
    serve.includes("if (auth !== true) return auth;") &&
    foer(serve, "authenticateServiceRole(req)", "createClient(supabaseUrl, serviceKey") &&
    /verify_jwt = true/.test(blok)
  );
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const toerkoerselErStandard = (funktion: string): boolean => {
  const f = udenKommentarer(funktion);
  return (
    f.includes('export const KENDTE_FELTER = ["dry_run", "nu"] as const;') &&
    f.includes("ukendteFelter(raaBody, KENDTE_FELTER)") &&
    f.includes("const toerKoersel = raaBody?.dry_run !== false;") &&
    // Uden for vinduet: return FØR hentKilder.
    foer(f, "if (!r.vindue) return { status: 200, resultat: r };", "await hentKilder(admin)") &&
    // Tørkørslen sender ikke: continue før indgangsMailHtml/sendManagedEmail.
    foer(f, "if (a.toerKoersel) continue;", "await sendManagedEmail({")
  );
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const noegleFoerSend = (funktion: string): boolean => {
  const f = udenKommentarer(funktion);
  return (
    f.includes("const noegle = statusMailNoegle(rg.id, a.nu);") &&
    foer(f, '.select("message_id, status").eq("message_id", noegle).in("status", ["sent", "suppressed"]).limit(1);', "await sendManagedEmail({") &&
    f.includes("        idempotencyKey: noegle,") &&
    f.includes("        label: STATUSMAIL_LABEL,") &&
    (f.match(/await sendManagedEmail\(\{/g) ?? []).length === 1
  );
};

// ── 4 ──────────────────────────────────────────────────────────────────────
/** Pr. tabel: select-kolonnerne og filterkæden (før .order). */
export function forespoergsler(kilde: string): Map<string, { kolonner: string[]; filtre: string }> {
  const ud = new Map<string, { kolonner: string[]; filtre: string }>();
  for (const m of udenKommentarer(kilde).matchAll(/\.from\("([a-z_]+)"\)\.select\("([^"]+)"\)((?:\.(?:eq|is|neq|in)\([^)]*\))*)/g)) {
    ud.set(m[1], { kolonner: m[2].split(",").map((x) => x.trim()).sort(), filtre: m[3] });
  }
  return ud;
}
export const KILDER = ["companies", "company_members", "session_bookings", "financial_report_facts", "financial_reports", "pulse_checkins", "conversations", "event_registrations", "member_progress", "community_traade", "community_svar", "community_reaktioner", "milestones", "user_login_log"] as const;
export const filtreneErEns = (funktion: string, hook: string): boolean => {
  const f = udenKommentarer(funktion), a = forespoergsler(funktion), b = forespoergsler(hook);
  // Hookens forespørgsler læses uden om dens andre tabeller (den har kun disse).
  return (
    KILDER.every((t) => {
      const x = a.get(t), y = b.get(t);
      if (!x || !y) return false;
      const ekstra = x.kolonner.filter((k) => !y.kolonner.includes(k));
      const mangler = y.kolonner.filter((k) => !x.kolonner.includes(k));
      // Functionen må hente `name` (navne-kortet) — og intet andet ud over hookens.
      return x.filtre === y.filtre && mangler.length === 0 && ekstra.every((k) => t === "companies" && k === "name");
    }) &&
    a.get("companies")?.kolonner.includes("is_demo") === true &&
    !/\.limit\(/.test(f.replace('.in("status", ["sent", "suppressed"]).limit(1)', "")) &&
    f.includes("for (let fra = 0; mangler.size > 0; fra += SIDE) {") &&
    f.includes("const overblik = byggOverblik(kilder, a.nu);") &&
    (f.match(/byggOverblik\(/g) ?? []).length === 1
  );
};

// ── 5 ──────────────────────────────────────────────────────────────────────
function felt(spec: string, min: number, max: number): number[] {
  const ud = new Set<number>();
  for (const del of spec.split(",")) {
    const [omr, trin] = del.split("/");
    const step = trin ? Number(trin) : 1;
    let fra = min, til = max;
    if (omr !== "*") {
      const [x, y] = omr.split("-").map(Number);
      fra = x; til = y ?? (trin ? max : x);
    }
    for (let v = fra; v <= til; v += step) ud.add(v);
  }
  return [...ud];
}
/** Rammer et 5-felts cron-udtryk (minut, time, ugedag) det tidspunkt? Dag/måned ignoreres (hverdags-jobs). */
export function rammer(udtryk: string, minut: number, time: number, ugedag: number): boolean {
  const dele = udtryk.trim().split(/\s+/);
  if (dele.length !== 5) return false;
  return felt(dele[0], 0, 59).includes(minut) && felt(dele[1], 0, 23).includes(time) && felt(dele[4], 0, 7).map((d) => d % 7).includes(ugedag);
}
export function cronUdtryk(dir: string): { fil: string; job: string; udtryk: string }[] {
  const ud: { fil: string; job: string; udtryk: string }[] = [];
  for (const fil of readdirSync(resolve(process.cwd(), dir)).filter((f) => f.endsWith(".sql")).sort()) {
    for (const m of udenSql(laes(`${dir}/${fil}`)).matchAll(/cron\.schedule\(\s*'([^']+)'\s*,\s*'([^']+)'/gi)) ud.push({ fil, job: m[1], udtryk: m[2] });
  }
  return ud;
}
export const vinduetErRigtigt = (funktion: string, tekst: string, migration: string, planer: readonly { job: string; udtryk: string }[]): boolean => {
  const f = udenKommentarer(funktion), t = udenKommentarer(tekst), m = udenSql(migration);
  const kollisioner = planer.filter((p) => p.job !== "statusmail" && [5, 6].some((h) => rammer(p.udtryk, 33, h, 1)));
  return (
    t.includes("return p.ugedag === STATUSMAIL_UGEDAG && p.time >= STATUSMAIL_TIME;") &&
    t.includes("export const STATUSMAIL_UGEDAG = 1;") && t.includes("export const STATUSMAIL_TIME = 7;") &&
    f.includes("vindue: erStatusmailVindue(nu)") &&
    /cron\.schedule\(\s*'statusmail',\s*'33 5,6 \* \* 1'/.test(m) &&
    kollisioner.length === 0
  );
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const enKlokkeVedFejl = (funktion: string, selvmailende: readonly string[]): boolean => {
  const f = udenKommentarer(funktion);
  const efterLoekken = f.slice(f.indexOf("if (r.fejl.length > 0) {"));
  return (
    (f.match(/skrivRaadgiverBesked\(/g) ?? []).length === 1 &&
    /skrivRaadgiverBesked\(admin, \{\s*type: "drift",[\s\S]{0,300}?reference_type: STATUSMAIL_REFERENCE,\s*reference_id: null,/.test(efterLoekken) &&
    f.includes('export const STATUSMAIL_REFERENCE = "statusmail";') &&
    // Fejl til én stopper ikke de næste: try/catch i løkken, fejlen samles i r.fejl.
    f.includes("r.fejl.push(`${rg.id}: ${grund}`);") &&
    !/driftModtager/.test(f) &&
    !selvmailende.includes("statusmail")
  );
};

// ── 7 ──────────────────────────────────────────────────────────────────────
export const migrationenErRigtig = (migration: string): boolean => {
  const m = udenSql(migration);
  return (
    migration.startsWith("-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).") &&
    // Argumenterne bærer hale-kommentarer på linjen (som klokke-mail-migrationen), derfor [^\n]* mellem dem.
    /kald_edge\(\s*'statusmail-cron',\s*'\{"dry_run": false\}'::jsonb,\s*60000,[^\n]*\n\s*3600000/.test(m) &&
    migration.includes("SELECT cron.unschedule('statusmail');")
  );
};

describe("statusmailCron.guard — den ugentlige statusmail", () => {
  const planer = cronUdtryk(MIG_DIR);
  it("1. auth først, verify_jwt = true", () => expect(authFoerst(laes(FUNKTION), laes(CONFIG))).toBe(true));
  it("2. tørkørsel som standard, STRIKS body, intet hentes uden for vinduet", () => expect(toerkoerselErStandard(laes(FUNKTION))).toBe(true));
  it("3. nøgleopslag før send, samme nøgle som idempotencyKey", () => expect(noegleFoerSend(laes(FUNKTION))).toBe(true));
  it("4. filtrene er ens i hook og function (13 tabeller + logins), intet loft, ét byggOverblik", () => expect(filtreneErEns(laes(FUNKTION), laes(HOOK))).toBe(true));
  it("5. vinduet mandag ≥ 7 dansk, cron '33 5,6 * * 1', ingen kollision i timerne 5 og 6", () => {
    expect(planer.some((p) => p.job === "statusmail")).toBe(true);
    expect(vinduetErRigtigt(laes(FUNKTION), laes(TEKST), laes(MIG), planer)).toBe(true);
  });
  it("6. én drift-klokke ved fejl, ikke selvmailende", () => expect(enKlokkeVedFejl(laes(FUNKTION), SELVMAILENDE_REFERENCER)).toBe(true));
  it("7. migrationens hoved og kald", () => expect(migrationenErRigtig(laes(MIG))).toBe(true));
});

describe("statusmailCron.guard — dommene fanger fejlen på en kopi", () => {
  const funktion = laes(FUNKTION), hook = laes(HOOK), config = laes(CONFIG), mig = laes(MIG), tekst = laes(TEKST);
  const planer = cronUdtryk(MIG_DIR);

  it("service role før auth, eller verify_jwt false, fælder dom 1", () => {
    const byttet = funktion.replace("  const auth = authenticateServiceRole(req);\n  if (auth !== true) return auth;\n", "").replace("  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });", "  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });\n  const auth = authenticateServiceRole(req);\n  if (auth !== true) return auth;");
    expect(byttet).not.toBe(funktion);
    expect(authFoerst(byttet, config)).toBe(false);
    expect(authFoerst(funktion, config.replace("[functions.statusmail-cron]\n    verify_jwt = true", "[functions.statusmail-cron]\n    verify_jwt = false"))).toBe(false);
  });

  it("dry_run som opt-in, et felt mere, eller hentning uden for vinduet, fælder dom 2", () => {
    expect(toerkoerselErStandard(funktion.replace("const toerKoersel = raaBody?.dry_run !== false;", "const toerKoersel = raaBody?.dry_run === true;"))).toBe(false);
    expect(toerkoerselErStandard(funktion.replace('["dry_run", "nu"] as const', '["dry_run", "nu", "til"] as const'))).toBe(false);
    expect(toerkoerselErStandard(funktion.replace("  if (!r.vindue) return { status: 200, resultat: r };\n", ""))).toBe(false);
    expect(toerkoerselErStandard(funktion.replace("      if (a.toerKoersel) continue;\n", ""))).toBe(false);
  });

  it("opslaget efter afsendelsen, eller en anden idempotencyKey, fælder dom 3", () => {
    const OPSLAG = '.select("message_id, status").eq("message_id", noegle).in("status", ["sent", "suppressed"]).limit(1);';
    const efter = funktion.replace(OPSLAG, '.select("x");').replace("      if (res.sent) svar.mail = \"sendt\";", `      await admin.from("email_send_log")${OPSLAG}\n      if (res.sent) svar.mail = "sendt";`);
    expect(efter).not.toBe(funktion);
    expect(noegleFoerSend(efter)).toBe(false);
    expect(noegleFoerSend(funktion.replace("        idempotencyKey: noegle,", "        idempotencyKey: `${noegle}:${Date.now()}`,"))).toBe(false);
  });

  it("et filter der glider (amount_dkk, deleted_at, sentinel, is_demo), et .limit(, en ekstra kolonne, eller to byggOverblik, fælder dom 4", () => {
    expect(filtreneErEns(funktion.replace('.eq("amount_dkk", 0)', ""), hook)).toBe(false);
    expect(filtreneErEns(funktion.replace('.is("deleted_at", null)', ""), hook)).toBe(false);
    expect(filtreneErEns(funktion.replace('.neq("file_path", "_sentinel")', ""), hook)).toBe(false);
    expect(filtreneErEns(funktion.replace("is_legat, er_kunde, is_demo, intro_session_used_at, jonas_session_used_at, name", "is_legat, er_kunde, intro_session_used_at, jonas_session_used_at, name"), hook)).toBe(false);
    expect(filtreneErEns(funktion.replace('select("company_id, created_at").order("created_at").order("id").range(fra, til), "pulse_checkins"', 'select("company_id, created_at").limit(1000), "pulse_checkins"'), hook)).toBe(false);
    expect(filtreneErEns(funktion.replace('select("company_id, uploaded_at")', 'select("company_id, uploaded_at, file_path")'), hook)).toBe(false);
    expect(filtreneErEns(funktion.replace("const overblik = byggOverblik(kilder, a.nu);", "const overblik = byggOverblik(kilder, a.nu); const igen = byggOverblik(kilder, a.nu);"), hook)).toBe(false);
    // Og hooken kan ikke glide alene: et filter væk i hooken fælder også.
    expect(filtreneErEns(funktion, hook.replace('.eq("amount_dkk", 0)', ""))).toBe(false);
  });

  it("et andet vindue, et andet cron-udtryk, eller en kolliderende cron, fælder dom 5", () => {
    expect(vinduetErRigtigt(funktion, tekst.replace("return p.ugedag === STATUSMAIL_UGEDAG && p.time >= STATUSMAIL_TIME;", "return p.time >= STATUSMAIL_TIME;"), mig, planer)).toBe(false);
    expect(vinduetErRigtigt(funktion, tekst, mig.replace("'33 5,6 * * 1'", "'33 5,6 * * *'"), planer)).toBe(false);
    expect(vinduetErRigtigt(funktion, tekst, mig, [...planer, { job: "ny", udtryk: "33 5 * * 1" }])).toBe(false);
    expect(vinduetErRigtigt(funktion, tekst, mig, [...planer, { job: "ny", udtryk: "*/3 * * * *" }])).toBe(false);
    expect(vinduetErRigtigt(funktion, tekst, mig, [...planer, { job: "ny", udtryk: "33 4 * * 1" }])).toBe(true); // time 4: ingen kollision
    // rammer(): de kendte former.
    expect(rammer("*/5 * * * *", 35, 6, 1)).toBe(true);
    expect(rammer("1-59/5 * * * *", 33, 6, 1)).toBe(false);
    expect(rammer("33 3 * * *", 33, 5, 1)).toBe(false);
    expect(rammer("*/15 5-15 * * 1-5", 30, 6, 1)).toBe(true);
    expect(rammer("0 6 * * 1", 0, 6, 0)).toBe(false);
  });

  it("to klokker, en klokke uden fejl, driftModtager i functionen, eller «statusmail» på SELVMAILENDE_REFERENCER, fælder dom 6", () => {
    expect(enKlokkeVedFejl(`${funktion}\nawait skrivRaadgiverBesked(admin, { type: "drift", title: "x" });\n`, SELVMAILENDE_REFERENCER)).toBe(false);
    expect(enKlokkeVedFejl(funktion.replace("if (r.fejl.length > 0) {", "if (true) {"), SELVMAILENDE_REFERENCER)).toBe(false);
    expect(enKlokkeVedFejl(`${funktion}\nconst x = driftModtager();\n`, SELVMAILENDE_REFERENCER)).toBe(false);
    expect(enKlokkeVedFejl(funktion, [...SELVMAILENDE_REFERENCER, "statusmail"])).toBe(false);
  });

  it("et hoved uden «IKKE KØRT» først, en timeout der ikke er kortere end intervallet, eller ingen rollback, fælder dom 7", () => {
    expect(migrationenErRigtig(`-- En forklaring først\n${mig}`)).toBe(false);
    expect(migrationenErRigtig(mig.replace("60000,", "3600000,"))).toBe(false);
    expect(migrationenErRigtig(mig.replace("SELECT cron.unschedule('statusmail');", ""))).toBe(false);
  });
});
