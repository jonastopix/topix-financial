import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ANNONCESPOR_KOLONNER, UDLEDTE_KOLONNER } from "@/lib/webinar/kolonner";

/**
 * Kildeværn for /webinar delt gennem et privat link (udkast 21/9-2026). Hver dom
 * bevist på en kopi med fejlen indsat:
 *   1. TOKENET FØRST: i webinar-delt kaldes verifyDelingstoken FØR sporet, FØR
 *      hentningen — og afvisningen er ÉT svar (403 «ukendt») for alle grunde;
 *      grunden går i sporet (afvisningAf) KUN for en kendt deling. Et ukendt token
 *      skrives ALDRIG i sporet (rettelse 21/9: sporet kan ikke slettes, ingen
 *      rate-limit) — kun i loggen, uden tokenet.
 *   2. AFTRYK OG KONSTANT TID: prædikatet afviser formen FØR opslaget, slår op på
 *      token_aftryk (aldrig en token-kolonne), regner sha256Hex og sammenligner
 *      med erKonstantTidLig.
 *   3. INGEN RÅ RÆKKER: svaret bygges af bygDeltSvar og går gennem
 *      findForbudteNoegler før `return json({ ok: true`; ingen række-liste
 *      sendes; kolonnelisterne i functionen er PRÆCIS fladens.
 *   4. SPORET ER INSERT-ONLY MED CASCADE: koden kun .insert på webinar_deling_spor
 *      (deling_id aldrig null); migrationen giver ingen UPDATE/DELETE-politik, har
 *      deling_id NOT NULL, ingen «afvist_ukendt» i CHECK'en, og triggeren er
 *      protect_aftale_spor-formen: UPDATE afvises altid, DELETE kun direkte
 *      (pg_trigger_depth() <= 1) — cascaden fra webinar_delinger slipper igennem;
 *      anon får intet; rådgivere læser; «-- IKKE KØRT» først.
 *   5. BUCKET A i webinar-deling: authenticateUser før createClient; has_role via
 *      callerClient.rpc; tokenet dannes af crypto.getRandomValues og gemmes kun som
 *      token_aftryk; svaret bærer token kun i «opret».
 *   6. STRIKS-body i begge; config.toml: webinar-delt false (med begrundelsen),
 *      webinar-deling true; prædikatet registreret i check-edge-function-auth.
 *   7. SIDEN: /delt/webinar er uguardet og lazy; DeltWebinar bruger ingen skal og
 *      har ingen links ud (<Link, href=, navigate(, <a ); kalder kun webinar-delt.
 *   8. FLADEN: WebinarView henter stadig ét sted (useWebinarDashboard) og giver
 *      visningen et FÆRDIGT dom; WebinarVisning tager WebinarDashboardSvar;
 *      Webinar.tsx monterer WebinarDelinger; hooken danner aldrig et token.
 *  10. OPBEVARING 12 MÅNEDER (Jonas 21/9): cron-jobbet webinar-delinger-opbevaring er ren
 *      SQL (ingen kald_edge/net.http_post), én bar DELETE på webinar_delinger med
 *      intervallet '12 months' og udvælgelsen least(coalesce(lukket_at, udloeber_at),
 *      udloeber_at) < now() - interval — kun lukkede eller udløbne; slottet 04:52
 *      rammer ingen anden plan (målt over alle cron.schedule i migrationerne);
 *      «-- IKKE KØRT» først; unschedule.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSql = (k: string) => k.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const DELT = "supabase/functions/webinar-delt/index.ts";
const DELING = "supabase/functions/webinar-deling/index.ts";
const AUTH = "supabase/functions/_shared/delingstokenAuth.ts";
const SVAR = "supabase/functions/_shared/webinarDelingSvar.ts";
const CONFIG = "supabase/config.toml";
const CHECK = "scripts/check-edge-function-auth.ts";
const MIGRATION = "supabase/migrations/20260922020000_webinar_delinger.sql";
const MIG_OPBEVARING = "supabase/migrations/20260922021000_webinar_delinger_opbevaring.sql";
const MIG_DIR = "supabase/migrations";
const APP = "src/App.tsx";
const SIDE = "src/pages/DeltWebinar.tsx";
const VIEW = "src/components/hjemmebane/webinar/WebinarView.tsx";
const WEBINAR_SIDE = "src/pages/Webinar.tsx";
const HOOK = "src/hooks/webinarDelinger.ts";
const BASELINE = "supabase/SECURITY_BASELINE.md";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const tokenetFoerst = (delt: string): boolean => {
  const f = udenKommentarer(delt);
  const serve = f.slice(f.indexOf("Deno.serve("));
  const ukendt = serve.match(/if \(dom\.tilstand === "ukendt"\) \{([\s\S]*?)\n {2}\}/)?.[1] ?? null;
  return serve.includes("const dom = await verifyDelingstoken(raaBody?.t, admin, nu);") &&
    foer(serve, "await verifyDelingstoken(", "await skrivSpor(") &&
    foer(serve, "await verifyDelingstoken(", "hentTilmeldinger(admin)") &&
    (serve.match(/await verifyDelingstoken\(/g) ?? []).length === 1 &&
    // Ukendt: FØR den anden gren, INGEN spor-skrivning, én log-linje uden tokenet, samme 403.
    ukendt !== null && foer(serve, 'if (dom.tilstand === "ukendt") {', 'if (dom.tilstand !== "aktiv") {') &&
    !ukendt.includes("skrivSpor(") && !ukendt.includes(".from(") && !ukendt.includes("insert(") &&
    ukendt.includes('console.error(`${LOG} afvist: ukendt token (form ${erTokenForm(raaBody?.t) ? "gyldig" : "ugyldig"}) — intet spor`);') &&
    !/\$\{raaBody\?\.t\}|\$\{token\}|raaBody\?\.t\)/.test(ukendt.replace("erTokenForm(raaBody?.t)", "")) &&
    ukendt.includes('return json({ error: "ukendt" }, 403);') &&
    /if \(dom\.tilstand !== "aktiv"\) \{[\s\S]*?await skrivSpor\(admin, dom\.raekke\.id, afvisningAf\(dom\.tilstand\), kalder\);[\s\S]*?return json\(\{ error: "ukendt" \}, 403\);/.test(serve) &&
    (serve.match(/, 403\)/g) ?? []).length === 2 && (serve.match(/return json\(\{ error: "ukendt" \}, 403\);/g) ?? []).length === 2 &&
    !/udloebet|lukket/.test(serve.replace(/afvisningAf\(dom\.tilstand\)/g, ""));
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const aftrykOgKonstantTid = (auth: string): boolean => {
  const a = udenKommentarer(auth);
  const fn = a.slice(a.indexOf("export async function verifyDelingstoken("));
  return foer(fn, "if (!erTokenForm(token)) return", "await delingsAftryk(token)") &&
    foer(fn, "await delingsAftryk(token)", '.from("webinar_delinger")') &&
    fn.includes('.eq("token_aftryk", aftryk)') && !/\.eq\("token"/.test(a) && !/select\([^)]*\btoken\b[^_]/.test(a) &&
    fn.includes("erKonstantTidLig(raekke.token_aftryk, aftryk)") &&
    a.includes('import { sha256Hex } from "./aftryk.ts";') && a.includes('import { erKonstantTidLig } from "./konstantTidLighed.ts";');
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const ingenRaaRaekker = (delt: string, svarFil: string): boolean => {
  const f = udenKommentarer(delt), s = udenKommentarer(svarFil);
  const serve = f.slice(f.indexOf("Deno.serve("));
  return serve.includes("const svar = bygDeltSvar({") &&
    foer(serve, "const forbudte = findForbudteNoegler(svar);", "return json({ ok: true,") &&
    /if \(forbudte\.length > 0\) \{[\s\S]*?return json\(\{ error: "svar_afvist" \}, 500\);/.test(serve) &&
    !/return json\(\{[^}]*tilmeldinger/.test(serve) && !/return json\(\{[^}]*raekker/.test(serve) &&
    s.includes("udenRaekker(webinarDashboard(") &&
    s.includes('"email"') && s.includes('"raekker"') && s.includes('"fbclid"');
};
/** Kolonnerne i functionen = fladens (hooks/webinar.ts + lib/webinar/kolonner.ts). */
export const kolonnerneErFladens = (delt: string): boolean => {
  const f = udenKommentarer(delt);
  const grund = f.match(/export const GRUND_KOLONNER =\s*\n?\s*"([^"]+)"/)?.[1] ?? "";
  const spor = [...(f.match(/export const ANNONCESPOR_KOLONNER = \[([\s\S]*?)\] as const;/)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const udledte = [...(f.match(/export const UDLEDTE_KOLONNER = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  // Læst som TEKST fra hooks/webinar.ts — en import ville trække Supabase-klienten ind i vitest.
  const TILMELDING_KOLONNER = udenKommentarer(laes("src/hooks/webinar.ts")).match(/export const TILMELDING_KOLONNER =\s*\n?\s*"([^"]+)"/)?.[1] ?? "";
  const fladensAlle = TILMELDING_KOLONNER.split(",").map((x) => x.trim());
  const fladensGrund = fladensAlle.filter((k) => !(ANNONCESPOR_KOLONNER as readonly string[]).includes(k));
  return grund.split(",").map((x) => x.trim()).join(",") === fladensGrund.join(",") &&
    spor.join(",") === [...ANNONCESPOR_KOLONNER].join(",") && udledte.join(",") === [...UDLEDTE_KOLONNER].join(",");
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const sporetErInsertOnly = (delt: string, deling: string, migration: string): boolean => {
  const kode = udenKommentarer(delt) + udenKommentarer(deling);
  const sporKald = [...kode.matchAll(/from\("webinar_deling_spor"\)\s*\.(\w+)\(/g)].map((m) => m[1]);
  const m = udenSql(migration);
  const politikker = [...m.matchAll(/create policy "([^"]+)"\s+on public\.(\w+) for (\w+)/gi)].map((x) => `${x[2]}:${x[3].toLowerCase()}`);
  const triggerKrop = m.match(/create or replace function public\.protect_webinar_deling_spor\(\)[\s\S]*?\$\$;/)?.[0] ?? "";
  return sporKald.length >= 2 && sporKald.every((k) => k === "insert") &&
    !/delingId: string \| null/.test(kode) && !/deling_id: null/.test(kode) && !/afvist_ukendt/.test(kode) &&
    migration.startsWith("-- IKKE KØRT. DEPLOY:") &&
    /deling_id\s+uuid not null references public\.webinar_delinger\(id\) on delete cascade/.test(m) &&
    !/afvist_ukendt/.test(m) && /'vist', 'afvist_udloebet', 'afvist_lukket'/.test(m) &&
    /if tg_op = 'UPDATE' then\s+raise exception/.test(triggerKrop) &&
    /if pg_trigger_depth\(\) <= 1 then\s+raise exception[^\n]*deleted directly/.test(triggerKrop) &&
    /return old;/.test(triggerKrop) && !/security definer/i.test(triggerKrop) &&
    migration.includes("20260918290000") && migration.includes("pg_trigger_depth() <= 1") &&
    m.includes("create table if not exists public.webinar_delinger") && m.includes("create table if not exists public.webinar_deling_spor") &&
    /token_aftryk\s+text not null/.test(m) && /check \(token_aftryk ~ '\^\[0-9a-f\]\{64\}\$'\)/.test(m) && !/\btoken\s+(uuid|text)/.test(m) &&
    m.includes("enable row level security") && (m.match(/enable row level security/g) ?? []).length === 2 &&
    !/to anon/i.test(m) && !/security definer/i.test(m) &&
    politikker.includes("webinar_delinger:select") && politikker.includes("webinar_delinger:all") &&
    politikker.includes("webinar_deling_spor:select") && politikker.includes("webinar_deling_spor:insert") &&
    !politikker.includes("webinar_deling_spor:update") && !politikker.includes("webinar_deling_spor:delete") && !politikker.includes("webinar_deling_spor:all") &&
    /before update or delete on public\.webinar_deling_spor/.test(m) && m.includes("execute function public.protect_webinar_deling_spor()") &&
    /has_role\(auth\.uid\(\), 'advisor'::app_role\)/.test(m);
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const bucketAErRigtig = (deling: string): boolean => {
  const f = udenKommentarer(deling);
  const serve = f.slice(f.indexOf("Deno.serve("));
  return foer(serve, "await authenticateUser(req)", "createClient(supabaseUrl, serviceKey") &&
    foer(serve, 'callerClient.rpc("has_role", { _user_id: callerId, _role: "advisor" })', "createClient(supabaseUrl, serviceKey") &&
    serve.includes('if (rolleFejl || erRaadgiver !== true) return json({ error: "kun_raadgivere" }, 403);') &&
    f.includes("crypto.getRandomValues(bytes)") && f.includes("tilBase64Url(bytes)") &&
    f.includes("token_aftryk: aftryk") && !/insert\(\{[^}]*\btoken:/.test(f) &&
    (f.match(/\btoken,/g) ?? []).length === 1 && /handling === "opret"[\s\S]*?token,[\s\S]*?const id = raaBody\?\.id;/.test(serve);
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const striksOgConfig = (delt: string, deling: string, config: string, check: string): boolean => {
  const a = udenKommentarer(delt), b = udenKommentarer(deling);
  const bl = (n: string) => config.slice(config.indexOf(`[functions.${n}]`), config.indexOf(`[functions.${n}]`) + 80);
  const bloknoter = config.slice(Math.max(0, config.indexOf("[functions.webinar-delt]") - 700), config.indexOf("[functions.webinar-delt]"));
  return a.includes('export const KENDTE_FELTER = ["t", "valg"] as const;') && a.includes("ukendteFelter(raaBody, KENDTE_FELTER)") && a.includes("ukendteFelterBesked(ukendte, KENDTE_FELTER)") &&
    b.includes('export const KENDTE_FELTER = ["handling", "navn", "dage", "id"] as const;') && b.includes("ukendteFelter(raaBody, KENDTE_FELTER)") && b.includes("ukendteFelterBesked(ukendte, KENDTE_FELTER)") &&
    /verify_jwt = false/.test(bl("webinar-delt")) && bloknoter.includes("verifyDelingstoken") &&
    /verify_jwt = true/.test(bl("webinar-deling")) &&
    /\{ name: "verifyDelingstoken\(\)",\s+pattern: \/\\bverifyDelingstoken\\s\*\\\(\/ \}/.test(check);
};

// ── 7 ──────────────────────────────────────────────────────────────────────
export const sidenErLukket = (app: string, side: string): boolean => {
  const s = udenKommentarer(side);
  return app.includes('const DeltWebinar = lazy(() => import("./pages/DeltWebinar"));') &&
    /<Route path="\/delt\/webinar" element=\{<DeltWebinar \/>\} \/>/.test(app) &&
    !/<(Advisor|Member|Protected|Admin|Partner)Route><DeltWebinar/.test(app) &&
    !s.includes("HbMemberShell") && !s.includes("<Link") && !s.includes("href=") && !s.includes("navigate(") && !/<a[\s>]/.test(s) && !s.includes("mailto") &&
    s.includes('supabase.functions.invoke("webinar-delt", { body: { t: token, valg } })') && (s.match(/functions\.invoke\(/g) ?? []).length === 1 &&
    !s.includes(".from(") && s.includes("<WebinarVisning") && s.includes("<AnnoncepriserVisning");
};

// ── 8 ──────────────────────────────────────────────────────────────────────
export const fladenErDelt = (view: string, webinarSide: string, hook: string): boolean => {
  const v = udenKommentarer(view), w = udenKommentarer(webinarSide), h = udenKommentarer(hook);
  return v.includes("export const WebinarVisning = ({") && v.includes("dom: WebinarDashboardSvar | null;") &&
    v.includes("priser: ReactNode;") && (v.split("useWebinarDashboard()").length - 1) === 1 &&
    /<WebinarVisning\s+tilstand=\{[\s\S]*?dom=\{dom\}/.test(v) &&
    w.includes("<WebinarDelinger />") && !w.includes("supabase") &&
    h.includes('supabase.functions.invoke("webinar-deling", { body })') && !h.includes("getRandomValues") && !h.includes("token_aftryk") &&
    h.includes("delingsOversigt(");
};

// ── 10 ─────────────────────────────────────────────────────────────────────
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
  for (const fil of readdirSync(resolve(process.cwd(), dir)).filter((f) => f.endsWith(".sql")).sort()) {
    const t = udenSql(laes(`${dir}/${fil}`));
    for (const m of t.matchAll(/cron\.schedule\(\s*'([^']+)'\s*,\s*'([^']+)'/gi)) ud.push({ fil, job: m[1], udtryk: m[2] });
  }
  return ud;
}
/** Planer (fem felter), der rammer minuttet — på NOGET tidspunkt. Udkastet klokke-mail (4-59/15) og klaviyo-profil (:17) lægges til, hvis de ikke står i mappen. */
export function kolliderer(minut: number, planer: readonly { job: string; udtryk: string }[], egetJob: string): string[] {
  const kendte = [...planer];
  if (!kendte.some((p) => p.job === "klokke-mail")) kendte.push({ job: "klokke-mail (udkast)", udtryk: "4-59/15 * * * *" });
  if (!kendte.some((p) => p.job === "klaviyo-profil")) kendte.push({ job: "klaviyo-profil (udkast)", udtryk: "17 * * * *" });
  return kendte
    .filter((p) => p.job !== egetJob && p.udtryk.trim().split(/\s+/).length === 5)
    .filter((p) => minutterI(p.udtryk).includes(minut))
    .map((p) => `${p.job} (${p.udtryk})`);
}
export const opbevaringenErRigtig = (mig: string): boolean => {
  const m = udenSql(mig);
  const job = m.match(/\$job\$([\s\S]*?)\$job\$/)?.[1] ?? "";
  const saetninger = job.split(";").map((x) => x.trim()).filter(Boolean);
  return mig.startsWith("-- IKKE KØRT. DEPLOY:") &&
    /cron\.schedule\(\s*'webinar-delinger-opbevaring',\s*'52 4 \* \* \*'/.test(m) &&
    saetninger.length === 1 && /^DELETE FROM public\.webinar_delinger\s+WHERE least\(coalesce\(lukket_at, udloeber_at\), udloeber_at\) < now\(\) - interval '12 months'$/.test(saetninger[0]) &&
    (m.match(/interval '/g) ?? []).length === 1 && !/kald_edge|net\.http_post|security definer|WITH /i.test(m) &&
    (m.match(/DELETE FROM/gi) ?? []).length === 1 && !/webinar_deling_spor/.test(job) &&
    mig.includes("cron.unschedule('webinar-delinger-opbevaring')") && mig.includes("12 MÅNEDER") && mig.includes("21/9-2026");
};

describe("webinarDeling.guard — /webinar delt gennem et privat link", () => {
  it("1. tokenet verificeres først, og afvisningen er ét svar (403 ukendt) med grunden i sporet", () => expect(tokenetFoerst(laes(DELT))).toBe(true));
  it("2. aftryk, form før opslag, konstant tid, aldrig en token-kolonne", () => expect(aftrykOgKonstantTid(laes(AUTH))).toBe(true));
  it("3. svaret er bygDeltSvar gennem findForbudteNoegler; kolonnerne er fladens", () => {
    expect(ingenRaaRaekker(laes(DELT), laes(SVAR))).toBe(true);
    expect(kolonnerneErFladens(laes(DELT))).toBe(true);
  });
  it("4. sporet er insert-only i kode og migration; anon intet; rådgivere læser; IKKE KØRT", () => expect(sporetErInsertOnly(laes(DELT), laes(DELING), laes(MIGRATION))).toBe(true));
  it("5. webinar-deling: authenticateUser og has_role før service role; tokenet fra crypto, kun aftrykket gemmes, tokenet svares én gang", () => expect(bucketAErRigtig(laes(DELING))).toBe(true));
  it("6. STRIKS i begge; config false/true med begrundelse; prædikatet registreret", () => expect(striksOgConfig(laes(DELT), laes(DELING), laes(CONFIG), laes(CHECK))).toBe(true));
  it("7. siden: uguardet og lazy; ingen skal, ingen links ud; ét kald til webinar-delt", () => expect(sidenErLukket(laes(APP), laes(SIDE))).toBe(true));
  it("8. fladen: WebinarVisning tager svar-typen; WebinarView henter ét sted; Webinar.tsx monterer listen; hooken danner intet token", () => expect(fladenErDelt(laes(VIEW), laes(WEBINAR_SIDE), laes(HOOK))).toBe(true));
  it("10. opbevaringen: ren SQL, én bar DELETE, 12 months, kun lukkede/udløbne, slot 04:52 uden kollision", () => {
    expect(opbevaringenErRigtig(laes(MIG_OPBEVARING))).toBe(true);
    const planer = cronUdtryk(MIG_DIR);
    expect(planer.some((p) => p.job === "webinar-delinger-opbevaring" && p.udtryk === "52 4 * * *")).toBe(true);
    expect(kolliderer(52, planer, "webinar-delinger-opbevaring")).toEqual([]);
    // Værnet ser de andre: :04 (klokke-mail), :17 (klaviyo-profil), :33 (meta), :00 (*/5).
    expect(kolliderer(4, planer, "webinar-delinger-opbevaring").some((s) => s.includes("4-59/15"))).toBe(true);
    expect(kolliderer(17, planer, "webinar-delinger-opbevaring").some((s) => s.includes("17 * * * *"))).toBe(true);
    expect(kolliderer(33, planer, "webinar-delinger-opbevaring").length).toBeGreaterThan(0);
    expect(kolliderer(0, planer, "webinar-delinger-opbevaring").length).toBeGreaterThan(0);
    expect(minutterI("52 4 * * *")).toEqual([52]);
  });
  it("9. SECURITY_BASELINE bogfører tabellerne, prædikatet og triggeren", () => {
    const b = laes(BASELINE);
    expect(b).toContain("### Webinar-delingen (`webinar_delinger`, `webinar_deling_spor`)");
    expect(b).toContain("### `protect_webinar_deling_spor()` on `webinar_deling_spor BEFORE UPDATE OR DELETE`");
    expect(b).toContain("verifyDelingstoken");
  });
});

describe("webinarDeling.guard — dommene fanger fejlen på en kopi", () => {
  const delt = laes(DELT), deling = laes(DELING), auth = laes(AUTH), mig = laes(MIGRATION);
  it("1. sporet før tokenet, en grund i svaret, EN SPOR-SKRIVNING FOR ET UKENDT TOKEN, eller tokenet i loggen, fælder dom 1", () => {
    const flyttet = delt.replace("  const dom = await verifyDelingstoken(raaBody?.t, admin, nu);\n", "").replace("  // ── 2. Visningen i sporet. ──\n", "  const dom = await verifyDelingstoken(raaBody?.t, admin, nu);\n");
    expect(flyttet).not.toBe(delt);
    expect(tokenetFoerst(flyttet)).toBe(false);
    expect(tokenetFoerst(delt.replace('return json({ error: "ukendt" }, 403);', 'return json({ error: dom.tilstand }, 403);'))).toBe(false);
    // Den fejl, der var: et ukendt token skrevet i sporet (deling_id null).
    const medSpor = delt.replace("    return json({ error: \"ukendt\" }, 403);\n  }\n  if (dom.tilstand !== \"aktiv\")", "    await skrivSpor(admin, null as unknown as string, \"afvist_udloebet\", kalder);\n    return json({ error: \"ukendt\" }, 403);\n  }\n  if (dom.tilstand !== \"aktiv\")");
    expect(medSpor).not.toBe(delt);
    expect(tokenetFoerst(medSpor)).toBe(false);
    // Tokenet i loggen.
    expect(tokenetFoerst(delt.replace("— intet spor`);", "— intet spor ${raaBody?.t}`);"))).toBe(false);
  });
  it("2. opslag på en token-kolonne, formen efter opslaget, eller === i stedet for konstant tid, fælder dom 2", () => {
    expect(aftrykOgKonstantTid(auth.replace('.eq("token_aftryk", aftryk)', '.eq("token", token)'))).toBe(false);
    expect(aftrykOgKonstantTid(auth.replace("erKonstantTidLig(raekke.token_aftryk, aftryk)", "raekke.token_aftryk === aftryk"))).toBe(false);
    const senForm = auth.replace("  if (!erTokenForm(token)) return { tilstand: \"ukendt\", raekke: null };\n", "").replace("  const raekke = (data ?? null)", "  if (!erTokenForm(token)) return { tilstand: \"ukendt\", raekke: null };\n  const raekke = (data ?? null)");
    expect(senForm).not.toBe(auth);
    expect(aftrykOgKonstantTid(senForm)).toBe(false);
  });
  it("3. svaret uden værnet, eller rækkerne med i svaret, eller en kolonne mere, fælder dom 3", () => {
    expect(ingenRaaRaekker(delt.replace("const forbudte = findForbudteNoegler(svar);", "const forbudte: string[] = [];"), laes(SVAR))).toBe(false);
    expect(ingenRaaRaekker(delt.replace("return json({ ok: true,", "return json({ ok: true, tilmeldinger: tilmeldinger.raekker,"), laes(SVAR))).toBe(false);
    expect(kolonnerneErFladens(delt.replace('"by", "land", "enhed", "tidszone",', '"by", "land", "enhed", "tidszone", "gclid",'))).toBe(false);
  });
  it("4. en update på sporet, en UPDATE-politik, en token-kolonne eller anon-adgang fælder dom 4", () => {
    expect(sporetErInsertOnly(delt + '\nawait admin.from("webinar_deling_spor").update({ ip: null });\n', deling, mig)).toBe(false);
    expect(sporetErInsertOnly(delt, deling, mig + '\ncreate policy "x" on public.webinar_deling_spor for update using (true);\n')).toBe(false);
    expect(sporetErInsertOnly(delt, deling, mig.replace("token_aftryk  text not null,", "token_aftryk  text not null,\n  token         uuid not null,"))).toBe(false);
    expect(sporetErInsertOnly(delt, deling, mig + '\ncreate policy "y" on public.webinar_delinger for select to anon using (true);\n')).toBe(false);
    expect(sporetErInsertOnly(delt, deling, mig.replace("-- IKKE KØRT. DEPLOY:", "-- DEPLOY:"))).toBe(false);
    // Rettelse 2: triggeren uden cascade-undtagelsen (nægter ALT), eller med undtagelsen vendt, fælder.
    // split/join: udtrykket står også i filhovedets citat — .replace ville kun ramme kommentaren (mutationstest-lærdommen).
    expect(sporetErInsertOnly(delt, deling, mig.split("if pg_trigger_depth() <= 1 then").join("if true then"))).toBe(false);
    expect(sporetErInsertOnly(delt, deling, mig.split("if pg_trigger_depth() <= 1 then").join("if pg_trigger_depth() = 0 then"))).toBe(false);
    // Rettelse 1: deling_id nullable igen, eller afvist_ukendt tilbage i CHECK'en, fælder.
    expect(sporetErInsertOnly(delt, deling, mig.replace("deling_id   uuid not null references", "deling_id   uuid references"))).toBe(false);
    expect(sporetErInsertOnly(delt, deling, mig.replace("'vist', 'afvist_udloebet', 'afvist_lukket'", "'vist', 'afvist_ukendt', 'afvist_udloebet', 'afvist_lukket'"))).toBe(false);
  });
  it("5. service role før gaten, eller tokenet gemt, fælder dom 5", () => {
    const foerGate = deling.replace("  // ── 3. Service role — først nu. ──\n  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });\n", "").replace("  // ── 1. Kalderen — FØRST. ──\n", "  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });\n");
    expect(foerGate).not.toBe(deling);
    expect(bucketAErRigtig(foerGate)).toBe(false);
    expect(bucketAErRigtig(deling.replace("token_aftryk: aftryk", "token_aftryk: aftryk, token: token"))).toBe(false);
  });
  it("6. et felt mere i body, eller verify_jwt vendt, fælder dom 6", () => {
    const c = laes(CONFIG), ch = laes(CHECK);
    expect(striksOgConfig(delt.replace('["t", "valg"] as const', '["t", "valg", "email"] as const'), deling, c, ch)).toBe(false);
    expect(striksOgConfig(delt, deling, c.replace("[functions.webinar-deling]\n    verify_jwt = true", "[functions.webinar-deling]\n    verify_jwt = false"), ch)).toBe(false);
    expect(striksOgConfig(delt, deling, c, ch.replace('{ name: "verifyDelingstoken()",', '{ name: "nogetAndet()",'))).toBe(false);
  });
  it("7. en gate på ruten, en skal, eller et link ud fælder dom 7", () => {
    const app = laes(APP), side = laes(SIDE);
    expect(sidenErLukket(app.replace("<Route path=\"/delt/webinar\" element={<DeltWebinar />} />", "<Route path=\"/delt/webinar\" element={<AdvisorRoute><DeltWebinar /></AdvisorRoute>} />"), side)).toBe(false);
    expect(sidenErLukket(app, side + '\nconst x = <a href="/webinar">Se mere</a>;\n')).toBe(false);
    expect(sidenErLukket(app, side.replace('import { HbCard } from "@/components/hjemmebane/HbCard";', 'import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";'))).toBe(false);
  });
  it("10. et andet interval, en udvælgelse uden lukket/udløbet, et kollisionsminut, en edge-function-kald eller en sætning mere fælder dom 10", () => {
    const o = laes(MIG_OPBEVARING);
    expect(opbevaringenErRigtig(o.split("interval '12 months'").join("interval '6 months'"))).toBe(false);
    expect(opbevaringenErRigtig(o.replace("WHERE least(coalesce(lukket_at, udloeber_at), udloeber_at) < now() - interval '12 months'", "WHERE oprettet_at < now() - interval '12 months'"))).toBe(false);
    expect(opbevaringenErRigtig(o.replace("'52 4 * * *'", "'4 4 * * *'"))).toBe(false);
    expect(opbevaringenErRigtig(o.replace("  $job$\n);", "  SELECT public.kald_edge('x');\n  $job$\n);"))).toBe(false);
    expect(opbevaringenErRigtig(o.replace("-- IKKE KØRT. DEPLOY:", "-- DEPLOY:"))).toBe(false);
    const planer = cronUdtryk(MIG_DIR);
    expect(kolliderer(52, [...planer, { fil: "x", job: "andet", udtryk: "52 9 * * *" }], "webinar-delinger-opbevaring")).toEqual(["andet (52 9 * * *)"]);
  });
  it("8. et token dannet i browseren, eller listen uden montering, fælder dom 8", () => {
    expect(fladenErDelt(laes(VIEW), laes(WEBINAR_SIDE), laes(HOOK) + "\nconst t = crypto.getRandomValues(new Uint8Array(32));\n")).toBe(false);
    expect(fladenErDelt(laes(VIEW), laes(WEBINAR_SIDE).replace("<WebinarDelinger />", ""), laes(HOOK))).toBe(false);
  });
});
