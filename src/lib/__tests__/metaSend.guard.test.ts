import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PERSONDATA_AFSNIT } from "@/lib/ansoegning/persondata";

/**
 * Kildeværn for Metas Conversions API fra platformen (udkast 21/9-2026 aften). Hver dom bevist
 * på en kopi med fejlen indsat:
 *   1. NØGLEN ÉT STED: metaSend.ts er Deno-fri; Deno.env i afsendelsen KUN META_SEND_TOKEN_NAVN;
 *      cronen læser kun SUPABASE_*; fetch findes kun i metaSendAfsendelse.ts.
 *   2. INGEN PERSONDATA: bygPayload bygger user_data af PRÆCIS fbc, external_id og
 *      client_user_agent; ordene em/ph/client_ip_address/email/telefon/navn/cvr står ikke
 *      i bygPayload; cronen læser KUN de seks kolonner (RAEKKE_FELTER) og kører
 *      findForbudteNoegler før sendTilMeta.
 *   3. TØRKØRSEL STANDARD + LÅSEN: dry_run !== false; `if (!r.sender_rigtigt) return`
 *      før første sendTilMeta; låsen læses af app_config fail-closed.
 *   4. STRIKS-BODY + BUCKET B: KENDTE_FELTER præcis dry_run · nu · test_event_code ·
 *      ansoegning_id; authenticateServiceRole før createClient; config verify_jwt = true.
 *   5. USER AGENT KUN MED FBCLID: ansoegning-gem læser headeren gennem laesUserAgent (≤ 512)
 *      og skriver den KUN gennem sporMedUserAgent i gemAnnoncespor (fail-soft, aldrig i
 *      insert'en); ingen anden function skriver user_agent på ansoegninger. Rettelse 21/9
 *      aften: fejler updaten MED user agent, prøves STRAKS igen med sporet alene
 *      (`.update({ ...spor })`) — den anden update findes og står EFTER fejlen, så
 *      klik-id'et og utm aldrig tabes på grund af user agent.
 *   6. SPORET FØR SVARET: upsert på meta_haendelser (onConflict event_id) inde i løkken,
 *      før r.sendt/r.fejlede tælles.
 *   7. MIGRATIONERNE: de to første bogført KØRT i prod (21/9 15:50, FØR merge — filhovederne
 *      rettet ved ilægningen; var «IKKE KØRT» indtil da), cron-migrationen stadig «-- IKKE KØRT»; kolonnen user_agent text; sporet med
 *      event_id primary key, udfald-CHECK, låsen 'false'::jsonb; cron-minutterne rammer
 *      ingen anden plan (målt over alle cron.schedule + udkastene), kald_edge 60000/300000.
 *   8. ALARMEN: kun rigtig kørsel med fejlede > 0; nøglen bærer datoen (kbhDato); loggen
 *      slås op FØR sendManagedEmail; til driftModtager(); klokke drift.
 *   9. PERSONDATATEKSTEN: Meta-afsnittet står ORDRET (godkendt af Jonas 21/9), og
 *      «gemmer»-afsnittet nævner browseren.
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSql = (k: string) => k.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const DOM = "supabase/functions/_shared/metaSend.ts";
const AFSENDELSE = "supabase/functions/_shared/metaSendAfsendelse.ts";
const CRON = "supabase/functions/meta-send-cron/index.ts";
const GEM = "supabase/functions/ansoegning-gem/index.ts";
const UA = "supabase/functions/_shared/ansoegningUserAgent.ts";
const CONFIG = "supabase/config.toml";
const MIG_UA = "supabase/migrations/20260921233000_ansoegninger_user_agent.sql";
const MIG_SPOR = "supabase/migrations/20260921234000_meta_haendelser.sql";
const MIG_CRON = "supabase/migrations/20260921235500_meta_send_cron.sql";
const MIG_DIR = "supabase/migrations";

export const META_TEKST_ORDRET =
  "Kom du fra en annonce på Facebook eller Instagram, fortæller vi Meta, at der er sket noget — at en ansøgning er påbegyndt, og at den er sendt. Vi sender kun det klik-id, Meta selv satte på linket, hvilken slags browser du brugte, og et id, vi selv har lavet. Vi sender aldrig dit navn, din e-mail, dit telefonnummer, dit CVR-nummer eller dine svar. Kom du ikke fra en annonce, sender vi ingenting. Vil du helst være fri, så skriv til kontakt@theboardroom.dk.";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const noeglenEtSted = (dom: string, afsendelse: string, cron: string): boolean => {
  const d = udenKommentarer(dom), a = udenKommentarer(afsendelse), c = udenKommentarer(cron);
  const env = (k: string) => [...k.matchAll(/Deno\.env\.get\(\s*([^)]+?)\s*\)/g)].map((m) => m[1]);
  return !/\bDeno\b/.test(d) && !/\bfetch\s*\(/.test(d) &&
    env(a).join(",") === "META_SEND_TOKEN_NAVN" && (a.match(/\bfetch\s*\(/g) ?? []).length === 1 &&
    !/\bfetch\s*\(/.test(c) && env(c).every((n) => n === '"SUPABASE_URL"' || n === '"SUPABASE_SERVICE_ROLE_KEY"') &&
    c.includes('from "../_shared/metaSendAfsendelse.ts"') && !c.includes("META_SEND_TOKEN");
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const ingenPersondata = (dom: string, cron: string): boolean => {
  const d = udenKommentarer(dom), c = udenKommentarer(cron);
  const byg = d.slice(d.indexOf("export function bygPayload("), d.indexOf("export const FORBUDTE_NOEGLER"));
  return /user_data: \{\s*fbc: bygFbc\([^\n]*\n\s*external_id: \[externalIdAftryk\],\s*\n\s*client_user_agent: [^\n]*\n\s*\},/.test(byg) &&
    !/\b(em|ph|client_ip_address|fbp|email|telefon|navn|cvr)\b/.test(byg) &&
    c.includes('const RAEKKE_FELTER = "id, created_at, indsendt_at, fbclid, landing, user_agent";') &&
    !/\b(email|telefon|navn|cvr|ip_hash)\b/.test(c) &&
    foer(c, "const forbudte = findForbudteNoegler(payload);", "await sendTilMeta(payload, a.testEventCode)") &&
    /if \(forbudte\.length > 0\) \{[\s\S]*?return \{ status: 500, resultat: r \};/.test(c);
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const toerkoerselOgLaas = (cron: string, dom: string): boolean => {
  const c = udenKommentarer(cron), d = udenKommentarer(dom);
  const koer = c.slice(c.indexOf("export async function koerMetaSend("), c.indexOf("Deno.serve("));
  return c.includes("const toerKoersel = raaBody?.dry_run !== false;") &&
    foer(koer, "if (!r.sender_rigtigt) return { status: 200, resultat: r };", "await sendTilMeta(") &&
    (c.match(/await sendTilMeta\(/g) ?? []).length === 1 &&
    /async function hentLaas\([\s\S]*?from\("app_config"\)[\s\S]*?\.eq\("config_key", META_SEND_LAAS_NOEGLE\)[\s\S]*?return false; \}/.test(c) &&
    d.includes('export const META_SEND_LAAS_NOEGLE = "meta_send_aktiv";') &&
    d.includes('return configValue === true || configValue === "true";') &&
    d.includes("if (a.dryRun) return false;\n  return a.laasAktiv || a.testEventCode !== null;");
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const striksOgBucketB = (cron: string, config: string): boolean => {
  const c = udenKommentarer(cron);
  const blok = config.slice(config.indexOf("[functions.meta-send-cron]"));
  return c.includes('export const KENDTE_FELTER = ["dry_run", "nu", "test_event_code", "ansoegning_id"] as const;') &&
    c.includes("ukendteFelter(raaBody, KENDTE_FELTER)") && c.includes("ukendteFelterBesked(ukendte, KENDTE_FELTER)") &&
    foer(c.slice(c.indexOf("Deno.serve(")), "authenticateServiceRole(req)", "createClient(") &&
    /^\s*\[functions\.meta-send-cron\]\s*\n\s*verify_jwt = true/m.test(blok);
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const userAgentKunMedFbclid = (gem: string, ua: string, filer: readonly { sti: string; kilde: string }[]): boolean => {
  const g = udenKommentarer(gem), u = udenKommentarer(ua);
  const andre = filer.filter((f) => f.sti !== GEM && !f.sti.includes("_shared/metaSend") && !f.sti.includes("meta-send-cron"))
    .filter((f) => /from\("ansoegninger"\)[\s\S]{0,300}user_agent/.test(udenKommentarer(f.kilde)) && /\.(update|insert|upsert)\(/.test(udenKommentarer(f.kilde)) && /user_agent:/.test(udenKommentarer(f.kilde)));
  return u.includes('req.headers.get("user-agent") ?? "").trim().slice(0, USER_AGENT_MAKS)') && u.includes("export const USER_AGENT_MAKS = 512;") &&
    u.includes("return spor.fbclid ? { ...spor, user_agent: userAgent } : { ...spor };") &&
    g.includes('import { laesUserAgent, sporMedUserAgent } from "../_shared/ansoegningUserAgent.ts";') &&
    g.includes(".update(sporMedUserAgent(spor, userAgent)).eq(\"id\", id)") &&
    g.includes('const { error: fejlUden } = await admin.from("ansoegninger").update({ ...spor }).eq("id", id);') &&
    foer(g, ".update(sporMedUserAgent(spor, userAgent)).eq(\"id\", id)", "if (!error) return;") &&
    foer(g, "if (!error) return;", 'update({ ...spor }).eq("id", id)') &&
    g.includes("await gemAnnoncespor(adminClient, data.id, annoncesporAf(body?.annoncespor), laesUserAgent(req));") &&
    !/\.insert\(\{[^}]*user_agent/.test(g) && !/user_agent/.test(g.replace("sporMedUserAgent", "").replace("laesUserAgent", "")) &&
    andre.length === 0;
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const sporetFoerSvaret = (cron: string): boolean => {
  const c = udenKommentarer(cron);
  const loekke = c.slice(c.indexOf("for (const p of planer) {\n    if (Date.now()"), c.indexOf("if (r.fejlede > 0) await skrivAlarm("));
  return loekke.includes('from("meta_haendelser").upsert({') && loekke.includes('{ onConflict: "event_id" }') &&
    foer(loekke, "await sendTilMeta(", 'from("meta_haendelser").upsert({') &&
    foer(loekke, '{ onConflict: "event_id" }', 'if (svar.udfald === "sendt") r.sendt++;') &&
    loekke.includes("test_event_code: a.testEventCode") && !/payload:/.test(loekke);
};

// ── 7 ──────────────────────────────────────────────────────────────────────
export function minutterI(udtryk: string): number[] {
  const felt = udtryk.trim().split(/\s+/)[0];
  const ud = new Set<number>();
  for (const del of felt.split(",")) {
    const m = del.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) throw new Error(`minutterI: ukendt form «${del}»`);
    const [, basis, trin] = m;
    let fra = 0, til = 59;
    if (basis !== "*") { const [a, b] = basis.split("-").map(Number); fra = a; til = b ?? (trin ? 59 : a); }
    const step = trin ? Number(trin) : 1;
    for (let i = fra; i <= til; i += step) ud.add(i);
  }
  return [...ud].sort((a, b) => a - b);
}
export function cronUdtryk(dir: string): { fil: string; job: string; udtryk: string }[] {
  const ud: { fil: string; job: string; udtryk: string }[] = [];
  for (const fil of readdirSync(resolve(ROD, dir)).filter((f) => f.endsWith(".sql")).sort()) {
    const t = udenSql(laes(`${dir}/${fil}`));
    for (const m of t.matchAll(/cron\.schedule\(\s*'([^']+)'\s*,\s*'([^']+)'/gi)) ud.push({ fil, job: m[1], udtryk: m[2] });
  }
  return ud;
}
/** Planer (fem felter), der rammer minuttet på NOGET tidspunkt — plus udkastenes jobs, hvis de ikke står i mappen endnu. */
export function kolliderer(minut: number, planer: readonly { job: string; udtryk: string }[], egetJob: string): string[] {
  const kendte = [...planer];
  for (const [job, udtryk] of [["klokke-mail", "4-59/15 * * * *"], ["klaviyo-profil", "17 * * * *"], ["webinar-delinger-opbevaring", "52 4 * * *"]] as const) {
    if (!kendte.some((p) => p.job === job)) kendte.push({ job: `${job} (udkast)`, udtryk });
  }
  return kendte.filter((p) => p.job !== egetJob && p.udtryk.trim().split(/\s+/).length === 5).filter((p) => minutterI(p.udtryk).includes(minut)).map((p) => `${p.job} (${p.udtryk})`);
}
export const migrationerneErRigtige = (ua: string, spor: string, cron: string): boolean => {
  const u = udenSql(ua), s = udenSql(spor), c = udenSql(cron);
  return ua.startsWith("-- KØRT i prod — 21/9-2026 kl. 15:50") && spor.startsWith("-- KØRT i prod — 21/9-2026 kl. 15:50") &&
    cron.startsWith("-- IKKE KØRT. DEPLOY:") &&
    /ALTER TABLE public\.ansoegninger\s+ADD COLUMN IF NOT EXISTS user_agent text NULL;/.test(u) &&
    s.includes("create table if not exists public.meta_haendelser") && /event_id\s+text primary key/.test(s) &&
    /check \(udfald in \('sendt', 'fejl', 'timeout', 'ugyldig', 'ingen_noegle'\)\)/.test(s) &&
    s.includes("values ('meta_send_aktiv', 'false'::jsonb,") && s.includes("enable row level security") && !/security definer/i.test(s) && !/to anon/i.test(s) &&
    /cron\.schedule\(\s*'meta-send',\s*'3,8,13,18,23,28,38,43,48,53,58 \* \* \* \*'/.test(c) &&
    /kald_edge\(\s*'meta-send-cron',\s*'\{"dry_run": false\}'::jsonb,\s*60000,[^\n]*\n\s*300000/.test(c) &&
    cron.includes("cron.unschedule('meta-send')") && spor.includes("ingen jurist; låsen er bevisets, ikke juraens");
};

// ── 8 ──────────────────────────────────────────────────────────────────────
export const alarmenErRigtig = (cron: string, dom: string): boolean => {
  const c = udenKommentarer(cron), d = udenKommentarer(dom);
  const koer = c.slice(c.indexOf("export async function koerMetaSend("), c.indexOf("Deno.serve("));
  const alarm = c.slice(c.indexOf("async function skrivAlarm("), c.indexOf("export async function koerMetaSend("));
  return koer.includes("if (r.fejlede > 0) await skrivAlarm(admin, r.fejlede_liste, a.nu, r);") &&
    foer(koer, "if (!r.sender_rigtigt) return", "await skrivAlarm(") && (c.match(/skrivAlarm\(/g) ?? []).length === 2 &&
    d.includes("return `${ALARM_NOEGLE_PRAEFIKS}${kbhDato(nu)}`;") &&
    foer(alarm, 'from("email_send_log")', "await sendManagedEmail({") && alarm.includes("to: driftModtager(),") &&
    alarm.includes('r.alarm = "allerede_sendt_i_dag";') && alarm.includes("idempotencyKey: noegle,") &&
    alarm.includes("await skrivRaadgiverBesked(admin, { type: ALARM_KLOKKE_TYPE,") && alarm.includes('reference_type: "meta_haendelser"');
};

describe("metaSend.guard — Metas Conversions API fra platformen", () => {
  const filer = readdirSync(resolve(ROD, "supabase/functions")).flatMap((d) => {
    const sti = `supabase/functions/${d}`;
    try { return readdirSync(resolve(ROD, sti)).filter((f) => f.endsWith(".ts")).map((f) => ({ sti: `${sti}/${f}`, kilde: laes(`${sti}/${f}`) })); } catch { return []; }
  });
  it("1. nøglen læses ét sted (META_SEND_TOKEN i afsendelsen); dommen er Deno-fri; cronen kalder aldrig fetch", () => expect(noeglenEtSted(laes(DOM), laes(AFSENDELSE), laes(CRON))).toBe(true));
  it("2. ingen persondata: user_data er præcis fbc + external_id + client_user_agent; cronen læser seks kolonner; værnet kører før afsendelsen", () => expect(ingenPersondata(laes(DOM), laes(CRON))).toBe(true));
  it("3. tørkørsel er standard; låsen (app_config, fail-closed) eller en testkode åbner kun med dry_run: false", () => expect(toerkoerselOgLaas(laes(CRON), laes(DOM))).toBe(true));
  it("4. STRIKS-body og Bucket B med verify_jwt = true", () => expect(striksOgBucketB(laes(CRON), laes(CONFIG))).toBe(true));
  it("5. user agent gemmes kun med fbclid, i den fail-softe update, ≤ 512 — og af ingen anden function", () => expect(userAgentKunMedFbclid(laes(GEM), laes(UA), filer)).toBe(true));
  it("6. sporet skrives (upsert på event_id) efter hvert kald, før tællingen — uden payloaden", () => expect(sporetFoerSvaret(laes(CRON))).toBe(true));
  it("7. migrationerne: de to første bogført KØRT i prod (15:50), cron-migrationen IKKE KØRT, kolonnen, sporet + låsen false, cron-minutterne uden kollision", () => {
    expect(migrationerneErRigtige(laes(MIG_UA), laes(MIG_SPOR), laes(MIG_CRON))).toBe(true);
    const planer = cronUdtryk(MIG_DIR);
    for (const m of [3, 8, 13, 18, 23, 28, 38, 43, 48, 53, 58]) expect(`${m}: ${kolliderer(m, planer, "meta-send").join(", ")}`).toBe(`${m}: `);
    expect(kolliderer(33, planer, "meta-send").length).toBeGreaterThan(0); // derfor er :33 udeladt
    expect(kolliderer(4, planer, "meta-send").some((s) => s.includes("4-59/15"))).toBe(true);
  });
  it("8. alarmen: kun rigtig kørsel med fejlede > 0; én pr. døgn; loggen først; driftModtager; drift-klokke", () => expect(alarmenErRigtig(laes(CRON), laes(DOM))).toBe(true));
  it("9. persondatateksten: Meta-afsnittet ORDRET (godkendt af Jonas 21/9) og browseren i «gemmer»", () => {
    const gemmer = PERSONDATA_AFSNIT.find((a) => a.titel === "Hvad vi gemmer")!.afsnit;
    expect(gemmer).toContain(META_TEKST_ORDRET);
    expect(gemmer.some((a) => a.includes("gemmer vi det klik-id, Meta selv satte på linket, og hvilken slags browser du brugte."))).toBe(true);
    expect(gemmer.indexOf(META_TEKST_ORDRET)).toBe(gemmer.findIndex((a) => a.includes("hvilken slags browser du brugte.")) + 1);
  });
});

describe("metaSend.guard — dommene fanger fejlen på en kopi", () => {
  const dom = laes(DOM), afs = laes(AFSENDELSE), cron = laes(CRON), gem = laes(GEM);
  it("1. tokenet læst i cronen, eller et fetch i dommen, fælder dom 1", () => {
    expect(noeglenEtSted(dom, afs, cron + '\nconst t = Deno.env.get("META_SEND_TOKEN");\n')).toBe(false);
    expect(noeglenEtSted(dom + "\nconst r = fetch('https://x');\n", afs, cron)).toBe(false);
    expect(noeglenEtSted(dom, afs.replace("Deno.env.get(META_SEND_TOKEN_NAVN)", 'Deno.env.get("META_CAPI_TOKEN")'), cron)).toBe(false);
  });
  it("2. em i user_data, en email-kolonne i cronens select, eller afsendelse uden værnet, fælder dom 2", () => {
    expect(ingenPersondata(dom.replace("external_id: [externalIdAftryk],", "external_id: [externalIdAftryk],\n      em: [externalIdAftryk],"), cron)).toBe(false);
    expect(ingenPersondata(dom, cron.replace('const RAEKKE_FELTER = "id, created_at, indsendt_at, fbclid, landing, user_agent";', 'const RAEKKE_FELTER = "id, created_at, indsendt_at, fbclid, landing, user_agent, email";'))).toBe(false);
    expect(ingenPersondata(dom, cron.replace("const forbudte = findForbudteNoegler(payload);", "const forbudte: string[] = [];"))).toBe(false);
  });
  it("3. afsendelse uden låsen/testkoden, eller dry_run vendt, fælder dom 3", () => {
    expect(toerkoerselOgLaas(cron.replace("if (!r.sender_rigtigt) return { status: 200, resultat: r };", "if (a.toerKoersel) return { status: 200, resultat: r };"), dom)).toBe(false);
    expect(toerkoerselOgLaas(cron.replace("raaBody?.dry_run !== false", "raaBody?.dry_run === true"), dom)).toBe(false);
    expect(toerkoerselOgLaas(cron, dom.replace("if (a.dryRun) return false;\n  return a.laasAktiv || a.testEventCode !== null;", "return true;"))).toBe(false);
  });
  it("4. et felt mere, eller verify_jwt vendt, fælder dom 4", () => {
    expect(striksOgBucketB(cron.replace('["dry_run", "nu", "test_event_code", "ansoegning_id"]', '["dry_run", "nu", "test_event_code", "ansoegning_id", "email"]'), laes(CONFIG))).toBe(false);
    expect(striksOgBucketB(cron, laes(CONFIG).replace("[functions.meta-send-cron]\n    verify_jwt = true", "[functions.meta-send-cron]\n    verify_jwt = false"))).toBe(false);
  });
  it("5. user agent uden fbclid-betingelsen, i insert'en, eller fra en anden function, fælder dom 5", () => {
    const filer: { sti: string; kilde: string }[] = [];
    const ua = laes(UA);
    expect(userAgentKunMedFbclid(gem, ua.replace("return spor.fbclid ? { ...spor, user_agent: userAgent } : { ...spor };", "return { ...spor, user_agent: userAgent };"), filer)).toBe(false);
    expect(userAgentKunMedFbclid(gem.replace(".insert({ kilde, kilde_raa: kildeSpor, ip_hash: ipHash, ...del.svar })", ".insert({ kilde, kilde_raa: kildeSpor, ip_hash: ipHash, user_agent: laesUserAgent(req), ...del.svar })"), ua, filer)).toBe(false);
    expect(userAgentKunMedFbclid(gem, ua, [{ sti: "supabase/functions/x/index.ts", kilde: 'await admin.from("ansoegninger").update({ user_agent: ua }).eq("id", id);' }])).toBe(false);
    // Rettelse 21/9 aften: uden den anden update (sporet alene) — eller med den FØR fejlen — falder dom 5.
    const anden = 'const { error: fejlUden } = await admin.from("ansoegninger").update({ ...spor }).eq("id", id);';
    expect(userAgentKunMedFbclid(gem.replace(anden, "const fejlUden = null;"), ua, filer)).toBe(false);
    const foerste = 'const { error } = await admin.from("ansoegninger").update(sporMedUserAgent(spor, userAgent)).eq("id", id);';
    expect(userAgentKunMedFbclid(gem.replace(anden, "").replace(foerste, `${anden}\n  ${foerste}`), ua, filer)).toBe(false);
  });
  it("6. sporet skrevet efter tællingen, eller payloaden gemt, fælder dom 6", () => {
    expect(sporetFoerSvaret(cron.replace("test_event_code: a.testEventCode, varighed_ms: svar.varighed_ms,", "test_event_code: a.testEventCode, varighed_ms: svar.varighed_ms, payload: payload,"))).toBe(false);
    expect(sporetFoerSvaret(cron.replace('{ onConflict: "event_id" }', '{ onConflict: "ansoegning_id" }'))).toBe(false);
  });
  it("7. en anden lås-standard, et kollisionsminut, et filhoved tilbage på IKKE KØRT på de to kørte, eller KØRT på cron-migrationen fælder dom 7", () => {
    const ua = laes(MIG_UA), spor = laes(MIG_SPOR), c = laes(MIG_CRON);
    expect(migrationerneErRigtige(ua, spor.replace("'meta_send_aktiv', 'false'::jsonb", "'meta_send_aktiv', 'true'::jsonb"), c)).toBe(false);
    expect(migrationerneErRigtige(ua, spor, c.replace("'3,8,13,18,23,28,38,43,48,53,58 * * * *'", "'*/5 * * * *'"))).toBe(false);
    // #1064-formen: mutationen på den faktiske fil — tilbage til «IKKE KØRT» falder, for de ER kørt (15:50).
    expect(migrationerneErRigtige(ua.replace("-- KØRT i prod — 21/9-2026 kl. 15:50", "-- IKKE KØRT. DEPLOY:"), spor, c)).toBe(false);
    expect(migrationerneErRigtige(ua, spor.replace("-- KØRT i prod — 21/9-2026 kl. 15:50", "-- IKKE KØRT. DEPLOY:"), c)).toBe(false);
    // Cron-migrationen er IKKE kørt — et KØRT-hoved på den falder.
    expect(migrationerneErRigtige(ua, spor, c.replace("-- IKKE KØRT. DEPLOY:", "-- KØRT i prod — 21/9-2026 kl. 15:50"))).toBe(false);
    expect(kolliderer(33, cronUdtryk(MIG_DIR), "meta-send").some((s) => s.includes("33"))).toBe(true);
  });
  it("8. alarmen i tørkørslen, eller til rådgiveradressen, fælder dom 8", () => {
    const flyttet = cron.replace("  if (r.fejlede > 0) await skrivAlarm(admin, r.fejlede_liste, a.nu, r);\n", "").replace("  if (!r.sender_rigtigt) return { status: 200, resultat: r };\n", "  if (r.fejlede > 0) await skrivAlarm(admin, r.fejlede_liste, a.nu, r);\n  if (!r.sender_rigtigt) return { status: 200, resultat: r };\n");
    expect(flyttet).not.toBe(cron);
    expect(alarmenErRigtig(flyttet, dom)).toBe(false);
    expect(alarmenErRigtig(cron.replace("to: driftModtager(),", "to: raadgiverModtager(nu),"), dom)).toBe(false);
  });
});
