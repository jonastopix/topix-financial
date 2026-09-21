import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PERSONDATA_AFSNIT } from "@/lib/ansoegning/persondata";

/**
 * Kildeværn for Google Analytics fra platformen (udkast 21/9-2026 aften). Hver dom bevist
 * på en kopi med fejlen indsat:
 *   1. NØGLEN ÉT STED: gaSend.ts er Deno-fri; Deno.env i afsendelsen KUN GA_SEND_SECRET_NAVN;
 *      cronen læser kun SUPABASE_*; fetch findes kun i gaSendAfsendelse.ts; ordet
 *      GA4_API_SECRET (sitets navn) står ingen steder i de tre filer.
 *   2. INGEN PERSONDATA: bygPayload bygger params af PARAMETER_NAVNE og intet andet; ordene
 *      email/navn/telefon/cvr/user_agent/fbclid står ikke i bygPayload; cronen læser KUN de
 *      elleve kolonner (RAEKKE_FELTER) og kører findForbudteNoegler før sendTilGa.
 *   3. EU OG DE TO STIER: region1-værten, /mp/collect og /debug/mp/collect; api_secret i
 *      query (Googles form) og aldrig i en log.
 *   4. TØRKØRSEL STANDARD + LÅSEN: dry_run !== false; `if (!r.sender_rigtigt) return` før
 *      første sendTilGa; låsen læses af app_config fail-closed.
 *   5. STRIKS-BODY + BUCKET B: KENDTE_FELTER præcis dry_run · nu · debug · ansoegning_id;
 *      authenticateServiceRole før createClient; config verify_jwt = true.
 *   6. SPORET FØR TÆLLINGEN, INTET FORSØGSLOFT — OG EN DEBUG-KØRSEL EFTERLADER INGEN
 *      «SENDT»-RÆKKE (rettelse 21/9 aften, fejlen i #1073): upsert på event_id inde i løkken
 *      før r.sendt/r.fejlede, og upsert'en står bag `if (skalSkriveSpor(svar.udfald, a.debug))`,
 *      hvis regel er «debug ? udfald === "ugyldig" : true». En gyldig validering tælles som
 *      `valideret`, ikke `sendt`. maaForsoeges nævner intet forsøgstal.
 *   7. MIGRATIONERNE: begge bogført KØRT i prod — sporet (010000) 21/9 17:48 (FØR merge) og
 *      cron-migrationen (011000) 21/9 21:02 (EFTER merge; job 569, låsen slået til samtidig);
 *      filhovederne rettet, efterhånden som de blev kørt (var «IKKE KØRT» indtil da);
 *      sporet med event_id primary key og udfald-CHECK;
 *      låsen 'false'::jsonb; cron-minutterne rammer ingen anden plan (målt over alle
 *      cron.schedule + de udkast, der ikke er merget); kald_edge 60000/480000.
 *   8. PERSONDATATEKSTEN: GA-afsendelsesafsnittet og den tilpassede «Vi sælger aldrig …»
 *      står ORDRET (forslag 21/9 — venter på Jonas). Rettet 22/9: Meta-afsnittet, som GA's
 *      står LIGE EFTER, begynder nu «Vi fortæller Meta …», og «Vi sælger aldrig …» har
 *      mistet forbeholdet «når du kom fra en annonce» — vi sender for alle.
 *   9. ALARMEN: kun rigtig kørsel med fejlede > 0; nøglen bærer datoen; loggen slås op FØR
 *      sendManagedEmail; til driftModtager(); klokke drift med reference_type ga_haendelser.
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
/**
 * FÆLDEN, målt 21/9: udenKommentarer() æder også URL'er i KODE — «https://» ligner en
 * linjekommentar, så alt efter «https:» forsvinder. Domme, der læser en URL (dom 3),
 * skal derfor bruge den RÅ kilde. De øvrige bruger den rensede, som husets andre værn.
 */
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSql = (k: string) => k.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const DOM = "supabase/functions/_shared/gaSend.ts";
const AFSENDELSE = "supabase/functions/_shared/gaSendAfsendelse.ts";
const CRON = "supabase/functions/ga-send-cron/index.ts";
const CONFIG = "supabase/config.toml";
const MIG_SPOR = "supabase/migrations/20260922010000_ga_haendelser.sql";
const MIG_CRON = "supabase/migrations/20260922011000_ga_send_cron.sql";
const MIG_OPRYDNING = "supabase/migrations/20260922015000_ga_haendelser_debug_oprydning.sql";
const MIG_DIR = "supabase/migrations";

/** FORSLAGET, ordret (21/9 aften — venter på Jonas i chatten). */
export const GA_SEND_TEKST_ORDRET =
  "Har du sagt ja til cookies på theboardroom.dk, fortæller vi også Google Analytics, at en ansøgning er påbegyndt, og at den er sendt. Vi sender det id, Google Analytics selv har givet din browser, og hvor du kom fra — aldrig dit navn, din e-mail, dit telefonnummer, dit CVR-nummer eller dine svar. Har du ikke sagt ja til cookies, sender vi ingenting.";
export const SAELGER_ORDRET =
  "Vi sælger aldrig dine oplysninger. Ud over leverandørerne ovenfor, det vi fortæller Meta, og det vi fortæller Google Analytics, når du har sagt ja til cookies, videregiver vi dem ikke.";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const noeglenEtSted = (dom: string, afsendelse: string, cron: string): boolean => {
  const d = udenKommentarer(dom), a = udenKommentarer(afsendelse), c = udenKommentarer(cron);
  const env = (k: string) => [...k.matchAll(/Deno\.env\.get\(\s*([^)]+?)\s*\)/g)].map((m) => m[1]);
  return !/\bDeno\b/.test(d) && !/\bfetch\s*\(/.test(d) &&
    env(a).join(",") === "GA_SEND_SECRET_NAVN" && (a.match(/\bfetch\s*\(/g) ?? []).length === 1 &&
    !/\bfetch\s*\(/.test(c) && env(c).every((n) => n === '"SUPABASE_URL"' || n === '"SUPABASE_SERVICE_ROLE_KEY"') &&
    c.includes('from "../_shared/gaSendAfsendelse.ts"') && !c.includes("GA4_SEND_SECRET") &&
    [d, a, c].every((k) => !k.includes("GA4_API_SECRET")) &&
    d.includes('export const GA_SEND_SECRET_NAVN = "GA4_SEND_SECRET";');
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const ingenPersondata = (dom: string, cron: string): boolean => {
  const d = udenKommentarer(dom), c = udenKommentarer(cron);
  const byg = d.slice(d.indexOf("export function bygPayload("), d.indexOf("export const FORBUDTE_NOEGLER"));
  // Feltadgang, ikke ordforbud: «navn» er løkkevariablen over PARAMETER_NAVNE og et lovligt
  // dansk ord i koden. Det, der må fældes, er at LÆSE et forbudt felt af rækken.
  const forbudteFelter = /\br\.(email|navn|telefon|cvr|svar|udfordring|hjemmeside|user_agent|fbclid|ip_hash|landing|referrer)\b/;
  return byg.includes("for (const navn of PARAMETER_NAVNE)") && !forbudteFelter.test(byg) &&
    c.includes('const RAEKKE_FELTER = "id, created_at, indsendt_at, ga_client_id, ga_session_id, kilde, utm_source, utm_medium, utm_campaign, utm_content, utm_term";') &&
    !/\b(email|telefon|cvr|ip_hash|user_agent|fbclid)\b/.test(c) &&
    foer(c, "const forbudte = findForbudteNoegler(payload);", "await sendTilGa(payload, a.debug)") &&
    /if \(forbudte\.length > 0\) \{[\s\S]*?return \{ status: 500, resultat: r \};/.test(c) &&
    // «name» må ALDRIG stå på forbudslisten — det er Googles eget felt (fanget af prøven 21/9).
    !/"name"/.test(d.slice(d.indexOf("export const FORBUDTE_NOEGLER"), d.indexOf("export function findForbudteNoegler")));
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const euOgStierne = (dom: string, afsendelse: string): boolean => {
  const d = udenKommentarer(dom);
  // RÅ kilde her: udenKommentarer ville æde selve URL'en (se fælden i filhovedet).
  const a = afsendelse;
  return d.includes('export const GA_HOST = "region1.google-analytics.com";') &&
    d.includes('export const GA_STI = "/mp/collect";') && d.includes('export const GA_DEBUG_STI = "/debug/mp/collect";') &&
    a.includes("`https://${GA_HOST}${debug ? GA_DEBUG_STI : GA_STI}?measurement_id=${encodeURIComponent(GA_MEASUREMENT_ID)}&api_secret=${encodeURIComponent(secret)}`") &&
    !/console\.(log|error)\([^)]*url/i.test(a);
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const toerkoerselOgLaas = (cron: string, dom: string): boolean => {
  const c = udenKommentarer(cron), d = udenKommentarer(dom);
  const koer = c.slice(c.indexOf("export async function koerGaSend("), c.indexOf("Deno.serve("));
  return c.includes("const toerKoersel = raaBody?.dry_run !== false;") &&
    foer(koer, "if (!r.sender_rigtigt) return { status: 200, resultat: r };", "await sendTilGa(") &&
    (c.match(/await sendTilGa\(/g) ?? []).length === 1 &&
    /async function hentLaas\([\s\S]*?from\("app_config"\)[\s\S]*?\.eq\("config_key", GA_SEND_LAAS_NOEGLE\)[\s\S]*?return false; \}/.test(c) &&
    d.includes('export const GA_SEND_LAAS_NOEGLE = "ga_send_aktiv";') &&
    d.includes('return configValue === true || configValue === "true";') &&
    d.includes("if (a.dryRun) return false;\n  return a.laasAktiv || a.debug;");
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const striksOgBucketB = (cron: string, config: string): boolean => {
  const c = udenKommentarer(cron);
  const blok = config.slice(config.indexOf("[functions.ga-send-cron]"));
  return c.includes('export const KENDTE_FELTER = ["dry_run", "nu", "debug", "ansoegning_id"] as const;') &&
    c.includes("ukendteFelter(raaBody, KENDTE_FELTER)") && c.includes("ukendteFelterBesked(ukendte, KENDTE_FELTER)") &&
    foer(c.slice(c.indexOf("Deno.serve(")), "authenticateServiceRole(req)", "createClient(") &&
    /^\s*\[functions\.ga-send-cron\]\s*\n\s*verify_jwt = true/m.test(blok);
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const sporetOgIntetLoft = (cron: string, dom: string): boolean => {
  const c = udenKommentarer(cron), d = udenKommentarer(dom);
  const loekke = c.slice(c.indexOf("for (const p of planer) {\n    if (Date.now()"), c.indexOf("if (r.fejlede > 0) await skrivAlarm("));
  const maa = d.slice(d.indexOf("export function maaForsoeges("), d.indexOf("export interface Valideringsbesked"));
  return loekke.includes('from("ga_haendelser").upsert({') && loekke.includes('{ onConflict: "event_id" }') &&
    foer(loekke, "await sendTilGa(", 'from("ga_haendelser").upsert({') &&
    foer(loekke, '{ onConflict: "event_id" }', 'if (svar.udfald === "sendt") {') &&
    !/payload:/.test(loekke) &&
    // Rettelse 21/9 aften (#1073): upsert'en står BAG skalSkriveSpor, og reglen bor i den rene dom.
    loekke.includes("if (skalSkriveSpor(svar.udfald, a.debug)) {") &&
    foer(loekke, "if (skalSkriveSpor(svar.udfald, a.debug)) {", 'from("ga_haendelser").upsert({') &&
    d.includes('return debug ? udfald === "ugyldig" : true;') &&
    // …og en gyldig validering tælles som «valideret», aldrig som «sendt».
    loekke.includes("if (a.debug) r.valideret++;") &&
    foer(loekke, "if (a.debug) r.valideret++;", "r.sendt++;") &&
    // Intet forsøgsloft: dommen nævner hverken MAKS_FORSOEG eller en talsammenligning på forsoeg.
    !/MAKS_FORSOEG|forsoeg\s*>=|forsoeg\s*>/.test(maa) && maa.includes('grund: "allerede_sendt"') && maa.includes('grund: "ugyldig"');
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
/** Planer, der rammer minuttet — plus de udkast, der endnu ikke er merget. */
export function kolliderer(minut: number, planer: readonly { job: string; udtryk: string }[], egetJob: string): string[] {
  const kendte = [...planer];
  for (const [job, udtryk] of [["klokke-mail", "4-59/15 * * * *"], ["klaviyo-profil", "17 * * * *"], ["webinar-delinger-opbevaring", "52 4 * * *"]] as const) {
    if (!kendte.some((p) => p.job === job)) kendte.push({ job: `${job} (udkast)`, udtryk });
  }
  return kendte.filter((p) => p.job !== egetJob && p.udtryk.trim().split(/\s+/).length === 5).filter((p) => minutterI(p.udtryk).includes(minut)).map((p) => `${p.job} (${p.udtryk})`);
}
export const migrationerneErRigtige = (spor: string, cron: string): boolean => {
  const s = udenSql(spor), c = udenSql(cron);
  return spor.startsWith("-- KØRT i prod — 21/9-2026 kl. 17:48") &&
    cron.startsWith("-- KØRT i prod — 21/9-2026 kl. 21:02") &&
    s.includes("create table if not exists public.ga_haendelser") && /event_id\s+text primary key/.test(s) &&
    /check \(udfald in \('sendt', 'fejl', 'timeout', 'ugyldig', 'ingen_noegle'\)\)/.test(s) &&
    s.includes("values ('ga_send_aktiv', 'false'::jsonb,") && s.includes("enable row level security") &&
    !/security definer/i.test(s) && !/to anon/i.test(s) &&
    /cron\.schedule\(\s*'ga-send',\s*'2,12,22,32,42,54 \* \* \* \*'/.test(c) &&
    /kald_edge\(\s*'ga-send-cron',\s*'\{"dry_run": false\}'::jsonb,\s*60000,[^\n]*\n\s*480000/.test(c) &&
    cron.includes("cron.unschedule('ga-send')");
};

// ── 9 ──────────────────────────────────────────────────────────────────────
export const alarmenErRigtig = (cron: string, dom: string): boolean => {
  const c = udenKommentarer(cron), d = udenKommentarer(dom);
  const koer = c.slice(c.indexOf("export async function koerGaSend("), c.indexOf("Deno.serve("));
  const alarm = c.slice(c.indexOf("async function skrivAlarm("), c.indexOf("export async function koerGaSend("));
  return koer.includes("if (r.fejlede > 0) await skrivAlarm(admin, r.fejlede_liste, a.nu, r);") &&
    foer(koer, "if (!r.sender_rigtigt) return", "await skrivAlarm(") && (c.match(/skrivAlarm\(/g) ?? []).length === 2 &&
    d.includes("return `${ALARM_NOEGLE_PRAEFIKS}${kbhDato(nu)}`;") &&
    foer(alarm, 'from("email_send_log")', "await sendManagedEmail({") && alarm.includes("to: driftModtager(),") &&
    alarm.includes('r.alarm = "allerede_sendt_i_dag";') && alarm.includes("idempotencyKey: noegle,") &&
    alarm.includes("await skrivRaadgiverBesked(admin, { type: ALARM_KLOKKE_TYPE,") && alarm.includes('reference_type: "ga_haendelser"');
};

describe("gaSend.guard — Google Analytics fra platformen", () => {
  it("1. nøglen læses ét sted (GA4_SEND_SECRET i afsendelsen); dommen er Deno-fri; sitets GA4_API_SECRET nævnes aldrig", () => expect(noeglenEtSted(laes(DOM), laes(AFSENDELSE), laes(CRON))).toBe(true));
  it("2. ingen persondata: params bygges af PARAMETER_NAVNE; cronen læser elleve kolonner; værnet kører før afsendelsen", () => expect(ingenPersondata(laes(DOM), laes(CRON))).toBe(true));
  it("3. EU-værten og de to stier; api_secret i query, aldrig i en log", () => expect(euOgStierne(laes(DOM), laes(AFSENDELSE))).toBe(true));
  it("4. tørkørsel er standard; låsen (app_config, fail-closed) eller debug åbner kun med dry_run: false", () => expect(toerkoerselOgLaas(laes(CRON), laes(DOM))).toBe(true));
  it("5. STRIKS-body og Bucket B med verify_jwt = true", () => expect(striksOgBucketB(laes(CRON), laes(CONFIG))).toBe(true));
  it("6. sporet skrives efter hvert kald, før tællingen — og der er intet forsøgsloft", () => expect(sporetOgIntetLoft(laes(CRON), laes(DOM))).toBe(true));
  it("7b. oprydningen efter #1073: bogført KØRT i prod (21/9 21:15, 0 rækker slettet), én sætning, og den rører kun debug-rækker med udfald «sendt»", () => {
    const m = laes(MIG_OPRYDNING);
    expect(m.startsWith("-- KØRT i prod — 21/9-2026 kl. 21:15")).toBe(true);
    // #1064-formen: tilbage til «IKKE KØRT» falder — den ER kørt (bogført no-op: 0 rækker).
    expect(m.replace("-- KØRT i prod — 21/9-2026 kl. 21:15", "-- IKKE KØRT. DEPLOY:").startsWith("-- KØRT i prod — 21/9-2026 kl. 21:15")).toBe(false);
    const sql = udenSql(m);
    expect(/delete from public\.ga_haendelser\s+where debug = true\s+and udfald = 'sendt';/.test(sql)).toBe(true);
    expect(sql.split(";").filter((x) => x.trim() !== "")).toHaveLength(1);
    expect(/debug = false/.test(sql)).toBe(false);
  });
  it("7. migrationerne: begge bogført KØRT i prod (sporet 17:48, cron 21:02), låsen false i filen, cron-minutterne uden kollision", () => {
    expect(migrationerneErRigtige(laes(MIG_SPOR), laes(MIG_CRON))).toBe(true);
    const planer = cronUdtryk(MIG_DIR);
    for (const m of [2, 12, 22, 32, 42, 54]) expect(`${m}: ${kolliderer(m, planer, "ga-send").join(", ")}`).toBe(`${m}: `);
    expect(kolliderer(52, planer, "ga-send").length).toBeGreaterThan(0); // derfor :54 og ikke :52
    expect(kolliderer(3, planer, "ga-send").some((s) => s.includes("meta-send"))).toBe(true);
  });
  it("8. persondatateksten: GA-afsendelsen og «Vi sælger aldrig …» står ORDRET (forslag — venter på Jonas)", () => {
    const gemmer = PERSONDATA_AFSNIT.find((a) => a.titel === "Hvad vi gemmer")!.afsnit;
    const hvemSer = PERSONDATA_AFSNIT.find((a) => a.titel === "Hvem ser dem")!.afsnit;
    expect(gemmer).toContain(GA_SEND_TEKST_ORDRET);
    expect(hvemSer).toContain(SAELGER_ORDRET);
    // Afsendelsesafsnittet står LIGE EFTER Meta-afsnittet, så de to «fortæller vi»-afsnit står sammen.
    // 22/9: Meta-afsnittet begynder nu «Vi fortæller Meta …» (før: «Kom du fra en annonce …»),
    // fordi vi fra 22/9 sender for ALLE ansøgere — ikke kun dem, der kom fra en annonce.
    // «Vi sælger aldrig …» er rettet samme sted og af samme grund: forbeholdet «når du kom
    // fra en annonce» passede ikke længere på det, koden GØR.
    expect(gemmer.indexOf(GA_SEND_TEKST_ORDRET)).toBe(gemmer.findIndex((a) => a.startsWith("Vi fortæller Meta, at der er sket noget")) + 1);
  });
  it("9. alarmen: kun rigtig kørsel med fejlede > 0; én pr. døgn; loggen først; driftModtager; drift-klokke", () => expect(alarmenErRigtig(laes(CRON), laes(DOM))).toBe(true));
});

describe("gaSend.guard — dommene fanger fejlen på en kopi", () => {
  const dom = laes(DOM), afs = laes(AFSENDELSE), cron = laes(CRON);
  it("1. sitets GA4_API_SECRET, eller nøglen læst i cronen, fælder dom 1", () => {
    expect(noeglenEtSted(dom, afs.replace('export const GA_SEND_SECRET_NAVN = "GA4_SEND_SECRET";', ""), cron + '\nconst s = Deno.env.get("GA4_SEND_SECRET");\n')).toBe(false);
    expect(noeglenEtSted(dom.replace('"GA4_SEND_SECRET"', '"GA4_API_SECRET"'), afs, cron)).toBe(false);
    expect(noeglenEtSted(dom + "\nconst r = fetch('https://x');\n", afs, cron)).toBe(false);
  });
  it("2. en persondatakolonne i cronens select, «name» på forbudslisten, eller payload uden værnet, fælder dom 2", () => {
    expect(ingenPersondata(dom, cron.replace('ga_session_id, kilde,', 'ga_session_id, email, kilde,'))).toBe(false);
    expect(ingenPersondata(dom.replace("const session = vaerdi(r.ga_session_id);", "const session = vaerdi(r.ga_session_id); const m = r.email;"), cron)).toBe(false);
    expect(ingenPersondata(dom.replace('"email", "em", "ph", "navn",', '"email", "em", "ph", "navn", "name",'), cron)).toBe(false);
    expect(ingenPersondata(dom, cron.replace("const forbudte = findForbudteNoegler(payload);", "const forbudte: string[] = [];"))).toBe(false);
  });
  it("3. den amerikanske vært, eller en url i loggen, fælder dom 3", () => {
    expect(euOgStierne(dom.replace('"region1.google-analytics.com"', '"www.google-analytics.com"'), afs)).toBe(false);
    expect(euOgStierne(dom, afs + "\nconsole.log(`kaldte ${url}`);\n")).toBe(false);
  });
  it("4. afsendelse uden låsen, eller dry_run vendt, fælder dom 4", () => {
    expect(toerkoerselOgLaas(cron.replace("if (!r.sender_rigtigt) return { status: 200, resultat: r };", "if (a.toerKoersel) return { status: 200, resultat: r };"), dom)).toBe(false);
    expect(toerkoerselOgLaas(cron.replace("raaBody?.dry_run !== false", "raaBody?.dry_run === true"), dom)).toBe(false);
    expect(toerkoerselOgLaas(cron, dom.replace("if (a.dryRun) return false;\n  return a.laasAktiv || a.debug;", "return true;"))).toBe(false);
  });
  it("5. et felt mere i body, eller verify_jwt vendt, fælder dom 5", () => {
    expect(striksOgBucketB(cron.replace('["dry_run", "nu", "debug", "ansoegning_id"]', '["dry_run", "nu", "debug", "ansoegning_id", "email"]'), laes(CONFIG))).toBe(false);
    expect(striksOgBucketB(cron, laes(CONFIG).replace("[functions.ga-send-cron]\n    verify_jwt = true", "[functions.ga-send-cron]\n    verify_jwt = false"))).toBe(false);
  });
  it("6. et forsøgsloft indført, sporet skrevet efter tællingen, eller EN DEBUG-KØRSEL DER SKRIVER «SENDT», fælder dom 6", () => {
    // PRÆCIS FEJLEN I #1073: upsert'en uden for skalSkriveSpor — en validering ville efterlade «sendt».
    expect(sporetOgIntetLoft(cron.replace("if (skalSkriveSpor(svar.udfald, a.debug)) {", "if (true) {"), dom)).toBe(false);
    // Reglen udvandet, så debug også skriver: fælder.
    expect(sporetOgIntetLoft(cron, dom.replace('return debug ? udfald === "ugyldig" : true;', "return true;"))).toBe(false);
    // En gyldig validering talt som en rigtig afsendelse: fælder.
    expect(sporetOgIntetLoft(cron.replace("if (a.debug) r.valideret++;", "if (false) r.valideret++;"), dom)).toBe(false);
    expect(sporetOgIntetLoft(cron, dom.replace('  if (spor.udfald === "ugyldig") return { ok: false, grund: "ugyldig" };', '  if (spor.udfald === "ugyldig") return { ok: false, grund: "ugyldig" };\n  if (spor.forsoeg >= 6) return { ok: false, grund: "ugyldig" };'))).toBe(false);
    expect(sporetOgIntetLoft(cron.replace('{ onConflict: "event_id" }', '{ onConflict: "ansoegning_id" }'), dom)).toBe(false);
  });
  it("7. en anden lås-standard, et kollisionsminut, eller et filhoved tilbage på IKKE KØRT på en af de to kørte migrationer fælder dom 7", () => {
    const spor = laes(MIG_SPOR), c = laes(MIG_CRON);
    expect(migrationerneErRigtige(spor.replace("'ga_send_aktiv', 'false'::jsonb", "'ga_send_aktiv', 'true'::jsonb"), c)).toBe(false);
    expect(migrationerneErRigtige(spor, c.split("'2,12,22,32,42,54 * * * *'").join("'2,12,22,32,42,52 * * * *'"))).toBe(false);
    // #1064-formen: mutationen på den FAKTISKE fil — tilbage til «IKKE KØRT» falder, for sporet ER kørt (17:48).
    expect(migrationerneErRigtige(spor.replace("-- KØRT i prod — 21/9-2026 kl. 17:48", "-- IKKE KØRT. DEPLOY:"), c)).toBe(false);
    // #1064-formen, også for cron-migrationen: den ER kørt (21:02), så «IKKE KØRT» falder.
    expect(migrationerneErRigtige(spor, c.replace("-- KØRT i prod — 21/9-2026 kl. 21:02", "-- IKKE KØRT. DEPLOY:"))).toBe(false);
    expect(kolliderer(52, [...cronUdtryk(MIG_DIR)], "ga-send").some((s) => s.includes("opbevaring"))).toBe(true);
  });
  it("9. alarmen i tørkørslen, eller til rådgiveradressen, fælder dom 9", () => {
    const flyttet = cron.replace("  if (r.fejlede > 0) await skrivAlarm(admin, r.fejlede_liste, a.nu, r);\n", "").replace("  if (!r.sender_rigtigt) return { status: 200, resultat: r };\n", "  if (r.fejlede > 0) await skrivAlarm(admin, r.fejlede_liste, a.nu, r);\n  if (!r.sender_rigtigt) return { status: 200, resultat: r };\n");
    expect(flyttet).not.toBe(cron);
    expect(alarmenErRigtig(flyttet, dom)).toBe(false);
    expect(alarmenErRigtig(cron.replace("to: driftModtager(),", "to: raadgiverModtager(nu),"), dom)).toBe(false);
  });
});
