import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ARTER } from "../../../supabase/functions/_shared/metaSend.ts";
import { TILMELDING_ART } from "../../../supabase/functions/_shared/metaTilmelding.ts";

/**
 * Kildeværn for webinarmotorens tilmeldinger til Metas Conversions API (udkast 3/10-2026; spec
 * §C6 nævner værnet ved navn; docs/webinarmotor.md §7.9). Jonas har besluttet D2.3 (pixel + CAPI
 * bag lås); B3 (dedup-formen) og B4 (privatlivsteksten) er IKKE besluttet. Værnet holder koden
 * lukket, til de er. Hver dom bevist på en kopi med fejlen indsat:
 *   1. LÅSEN ER EGEN OG FAIL-CLOSED: nøglen «webinarmotor_meta_aktiv» (≠ meta_send_aktiv); en
 *      læsefejl og en manglende række (porten) lukker; der sendes kun med porten «klar» OG
 *      (begge låse ELLER testkode + ét tilmeldings-id); afsendelsen står efter cronens
 *      `if (!r.sender_rigtigt) return` og begynder selv med sin egen `if (!r.sender_rigtigt)`.
 *   2. INGEN KLARTEKST OG INGEN IP: user_data bygges af `...hashet` + external_id + user agent
 *      (+ fbc/fbp kun når de findes); bygTilmeldingPayload rører aldrig r.email/r.fornavn;
 *      kolonnelisten læser hverken ip_dagshash, navn eller utm; værnet (findForbudteNoegler)
 *      prøver den FAKTISKE payload før afsendelsen; klarteksten hashes før payloaden bygges.
 *   3. INTERNE, AFMELDTE OG eWEBINAR ALDRIG: dommens fire første linjer er ikke_platform ·
 *      intern · afmeldt · fravalgt; forespørgslen kræver kilde_system = 'platform' og læser
 *      raa->>intern og raa->>via; afmeldingerne slås op i webinar_afmeldinger.
 *   4. EVENT_ID-FORMEN: «<tilmelding_id>:registration» i koden, og sporets CHECK siger
 *      event_id = coalesce(ansoegning_id, tilmelding_id) || ':' || art.
 *   5. SECRET'EN ÉT STED: de to nye filer læser ingen env, kalder ingen fetch, importerer ikke
 *      metaSendAfsendelse.ts og nævner ikke META_SEND_TOKEN; cronen giver sendTilMeta ind.
 *   6. CHECK OG KODE I TAKT: migrationens art-liste = metaSend.ts' ARTER + TILMELDING_ART, i
 *      den rækkefølge; filhovedet starter med «-- IKKE KØRT. DEPLOY:»; én transaktion; porten
 *      (raise, hvis skive 1 mangler); låsen false med ON CONFLICT DO NOTHING; ejerreglerne; og
 *      filen sorterer efter enhver KØRT migration (ventepladser-reglen).
 *   7. TEKSTEN FØLGER KODEN (spec §C6, B4): tracking.md bærer rækken med låsen og betingelsen
 *      «sendes ikke, før privatlivsteksten er publiceret», og det gamle løfte står citeret som
 *      det, der skal ændres; webinarmotor.md siger «bygget bag lås»; CLAUDE.md har linjen.
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSql = (k: string) => k.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const DOM = "supabase/functions/_shared/metaTilmelding.ts";
const KOERSEL = "supabase/functions/_shared/metaTilmeldingKoersel.ts";
const CRON = "supabase/functions/meta-send-cron/index.ts";
const MIG_DIR = "supabase/migrations";
const MIG = "supabase/migrations/20261003070000_meta_haendelser_tilmelding.sql";
const TRACKING = "docs/tracking.md";
const MOTOR_DOC = "docs/webinarmotor.md";
const CLAUDE_MD = "CLAUDE.md";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const laasenErEgenOgLukket = (dom: string, koersel: string, cron: string): boolean => {
  const d = udenKommentarer(dom), k = udenKommentarer(koersel), c = udenKommentarer(cron);
  const sender = d.slice(d.indexOf("export function tilmeldingSenderRigtigt("), d.indexOf("export const webinarMetaLaasAaben"));
  const laesning = d.slice(d.indexOf("export function laesWebinarLaas("), d.indexOf("/** Tørkørslens plan"));
  const koer = c.slice(c.indexOf("export async function koerMetaSend("), c.indexOf("Deno.serve("));
  const send = k.slice(k.indexOf("export async function sendTilmeldinger("));
  return d.includes('export const WEBINAR_META_LAAS_NOEGLE = "webinarmotor_meta_aktiv";') &&
    !/meta_send_aktiv"/.test(d) &&
    // dommen: tørkørsel → port → (testkode + id) → begge låse
    sender.includes("if (a.dryRun) return false;") &&
    sender.includes('if (a.port !== "klar") return false;') &&
    sender.includes("if (a.testEventCode !== null && a.tilmeldingId !== null) return true;") &&
    sender.includes("return a.metaLaasAktiv && a.webinarLaasAktiv;") &&
    foer(sender, 'if (a.port !== "klar") return false;', "if (a.testEventCode !== null") &&
    // læsningen: fejl og fravær lukker
    laesning.includes('if (svar.fejl) return { port: "laesefejl", aaben: false };') &&
    laesning.includes('if (svar.raekke === null) return { port: "migration_mangler", aaben: false };') &&
    d.includes("export const webinarMetaLaasAaben = (configValue: unknown): boolean => laasErAktiv(configValue);") &&
    // kørslen: låsen læst med sin egen nøgle, gennem dommen
    /\.eq\("config_key", WEBINAR_META_LAAS_NOEGLE\)\.maybeSingle\(\)/.test(k) &&
    k.includes("return laesWebinarLaas({ fejl: !!error, raekke:") &&
    // afsendelsen: kun efter cronens port, og med sin egen port først
    foer(koer, "if (!r.sender_rigtigt) return { status: 200, resultat: r };", "await sendTilmeldinger(") &&
    foer(send, "if (!r.sender_rigtigt) return { sendt, fejlede };", "await a.send(payload, a.testEventCode)") &&
    (k.match(/await a\.send\(/g) ?? []).length === 1;
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const ingenKlartekst = (dom: string, koersel: string): boolean => {
  const d = udenKommentarer(dom), k = udenKommentarer(koersel);
  const byg = d.slice(d.indexOf("export function bygTilmeldingPayload("), d.indexOf("export function tilmeldingSenderRigtigt("));
  const felter = (k.match(/export const TILMELDING_FELTER =\s*\n?\s*"([^"]+)"/) ?? [])[1] ?? "";
  const loekke = k.slice(k.indexOf("for (const p of planer) {"));
  return /user_data: \{\s*\n\s*\.\.\.hashet,\s*\n\s*external_id: \[externalIdAftryk\],\s*\n\s*client_user_agent: ua,\s*\n\s*\.\.\.\(fbc !== null \? \{ fbc \} : \{\}\),\s*\n\s*\.\.\.\(fbp !== null \? \{ fbp \} : \{\}\),\s*\n\s*\},/.test(byg) &&
    !/\br\.(email|fornavn|navn)\b/.test(byg) &&
    !/client_ip_address|ip_dagshash/.test(byg) &&
    // em + fn — aldrig ln/ph/country for en tilmelding
    d.includes('export const TILMELDING_BRUGERDATA_NOEGLER = ["em", "fn"] as const;') &&
    d.includes("return { em: normaliserEmail(r.email), fn: normaliserNavn(r.fornavn).fn };") &&
    felter !== "" && !/\b(ip_dagshash|navn|utm_\w+|ga_client_id|raa)\b(?!->>)/.test(felter.replace(/fornavn/g, "")) &&
    felter.includes("intern:raa->>intern") && felter.includes("via:raa->>via") &&
    k.includes("const hashet = await hashTilmeldingBrugerdata(normaliserTilmeldingBrugerdata(p.raekke), sha256Hex);") &&
    foer(loekke, "const hashet = await hashTilmeldingBrugerdata(", "const payload = bygTilmeldingPayload(") &&
    foer(loekke, "const forbudte = findForbudteNoegler(payload);", "await a.send(payload, a.testEventCode)") &&
    /if \(forbudte\.length > 0\) \{[\s\S]*?continue;\n\s*\}/.test(loekke) &&
    !/\.(email|fornavn)\b/.test(loekke.slice(0, loekke.indexOf("return { sendt, fejlede };", loekke.indexOf("await a.send("))));
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const internAfmeldtAldrig = (dom: string, koersel: string): boolean => {
  const d = udenKommentarer(dom), k = udenKommentarer(koersel);
  const doem = d.slice(d.indexOf("export function doemTilmelding("), d.indexOf("/** De TO brugerdatafelter"));
  const linjer = doem.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("if ("));
  return linjer[0] === 'if (r.kilde_system !== "platform") return { ok: false, grund: "ikke_platform" };' &&
    linjer[1] === 'if (erInternRaekke(r)) return { ok: false, grund: "intern" };' &&
    linjer[2] === 'if (r.afmeldt) return { ok: false, grund: "afmeldt" };' &&
    linjer[3] === 'if (r.fravalgt) return { ok: false, grund: "fravalgt" };' &&
    linjer[4] === 'if (r.via === GEN_TILMELD_VIA) return { ok: false, grund: "gen_tilmelding" };' &&
    d.includes('export const erInternRaekke = (r: Pick<TilmeldingTilMeta, "intern">): boolean => r.intern === true || r.intern === "true";') &&
    /from\("webinar_tilmeldinger"\)\.select\(TILMELDING_FELTER\)\s*\n\s*\.eq\("kilde_system", "platform"\)/.test(k) &&
    /from\("webinar_afmeldinger"\)\.select\("email"\)\.in\("email", b\)/.test(k) &&
    /from\("ansoegninger"\)\.select\("email"\)\.eq\("meta_fravalg", true\)/.test(k) &&
    k.includes("afmeldt: afmeldte.has(lav(t.email)), fravalgt: fravalgte.has(lav(t.email))");
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const eventIdFormen = (dom: string, mig: string): boolean => {
  const d = udenKommentarer(dom), m = udenSql(mig);
  return d.includes('export const TILMELDING_ART = "registration" as const;') &&
    d.includes("return `${tilmeldingId}:${TILMELDING_ART}`;") &&
    d.includes("event_id: tilmeldingEventId(r.id),") &&
    /check \(event_id = coalesce\(ansoegning_id, tilmelding_id\)::text \|\| ':' \|\| art\)/.test(m);
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const secretEtSted = (dom: string, koersel: string, cron: string): boolean => {
  const filer = [udenKommentarer(dom), udenKommentarer(koersel)];
  const c = udenKommentarer(cron);
  return filer.every((f) => !/\bDeno\b/.test(f) && !/\bfetch\s*\(/.test(f) && !f.includes("metaSendAfsendelse") && !f.includes("META_SEND_TOKEN")) &&
    c.includes("send: sendTilMeta }") && (c.match(/await sendTilMeta\(/g) ?? []).length === 1;
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export function migrationsOrden(dir: string): { koert: string[]; ikkeKoert: string[] } {
  const koert: string[] = [], ikkeKoert: string[] = [];
  for (const fil of readdirSync(resolve(ROD, dir)).filter((f) => f.endsWith(".sql")).sort()) {
    const foerste = laes(`${dir}/${fil}`).split("\n")[0] ?? "";
    if (foerste.startsWith("-- IKKE KØRT. DEPLOY:")) ikkeKoert.push(fil);
    else if (/^--\s*KØRT i prod/.test(foerste)) koert.push(fil);
  }
  return { koert, ikkeKoert };
}
export const artListenIMigrationen = (mig: string): string[] => {
  const m = udenSql(mig).match(/add constraint meta_haendelser_art_check\s*\n?\s*check \(art in \(([^)]*)\)\)/);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
};
export const migrationenErRigtig = (mig: string, kodeArter: readonly string[], koert: readonly string[], fil: string): boolean => {
  const m = udenSql(mig);
  const arter = artListenIMigrationen(mig);
  const iTransaktion = m.indexOf("begin;"), slut = m.indexOf("commit;");
  const alter = m.slice(m.indexOf("alter table public.meta_haendelser"), m.indexOf("create index"));
  return mig.split("\n")[0] === "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik)." &&
    JSON.stringify(arter) === JSON.stringify(kodeArter) &&
    iTransaktion !== -1 && slut > iTransaktion && (m.match(/alter table public\.meta_haendelser/g) ?? []).length === 1 &&
    foer(m, "raise exception 'STOP: webinar_tilmeldinger.kilde_system mangler", "alter table public.meta_haendelser") &&
    /add column if not exists tilmelding_id uuid references public\.webinar_tilmeldinger\(id\) on delete cascade,/.test(alter) &&
    alter.includes("alter column ansoegning_id drop not null,") &&
    /check \(\(ansoegning_id is null\) <> \(tilmelding_id is null\)\)/.test(alter) &&
    /check \(\(art = 'registration'\) = \(tilmelding_id is not null\)\)/.test(alter) &&
    /values \('webinarmotor_meta_aktiv', 'false'::jsonb,/.test(m) && /on conflict \(config_key\) do nothing;/.test(m) &&
    foer(m, "values ('webinarmotor_meta_aktiv'", "commit;") &&
    !/security definer/i.test(m) && !/drop policy/i.test(m) && !/delete from/i.test(m) && !/drop table/i.test(m) &&
    koert.every((k) => k < fil);
};

// ── 7 ──────────────────────────────────────────────────────────────────────
export const GAMMELT_LOEFTE = "Selve din tilmelding deler vi ikke med Meta.";
export const teksterneFoelgerKoden = (tracking: string, motor: string, claude: string): boolean => {
  const raekke = tracking.split("\n").find((l) => l.startsWith("| 28 |")) ?? "";
  return raekke.includes("CompleteRegistration") && raekke.includes("webinarmotor_meta_aktiv") &&
    raekke.includes("sendes ikke, før privatlivsteksten") && raekke.includes(GAMMELT_LOEFTE) &&
    raekke.includes("<tilmelding_id>:registration") &&
    /D2\.3 \| Pixel \+ CAPI på tilmeldingen bag låsen `webinarmotor_meta_aktiv` \| \*\*BYGGET BAG LÅS/.test(motor) &&
    motor.includes("### 7.9") &&
    claude.includes("webinarmotor_meta_aktiv") && claude.includes("webinarTilmeldMeta.guard");
};

describe("webinarTilmeldMeta.guard — tilmeldingerne til Metas Conversions API", () => {
  it("1. låsen er egen og fail-closed; porten; afsendelsen bag begge porte", () => expect(laasenErEgenOgLukket(laes(DOM), laes(KOERSEL), laes(CRON))).toBe(true));
  it("2. ingen klartekst-PII og ingen IP i payloaden; hashet før payloaden; værnet før afsendelsen", () => expect(ingenKlartekst(laes(DOM), laes(KOERSEL))).toBe(true));
  it("3. eWebinar, interne, afmeldte og fravalgte sendes aldrig — dømt først", () => expect(internAfmeldtAldrig(laes(DOM), laes(KOERSEL))).toBe(true));
  it("4. event_id = «<tilmelding_id>:registration» i koden og i sporets CHECK", () => expect(eventIdFormen(laes(DOM), laes(MIG))).toBe(true));
  it("5. META_SEND_TOKEN læses kun i metaSendAfsendelse.ts — de nye filer får afsendelsen givet ind", () => expect(secretEtSted(laes(DOM), laes(KOERSEL), laes(CRON))).toBe(true));
  it("6. migrationen: CHECK'en = kodens arter, IKKE KØRT-hovedet, én transaktion, porten, låsen false, efter enhver kørt", () => {
    const { koert } = migrationsOrden(MIG_DIR);
    expect(artListenIMigrationen(laes(MIG))).toEqual([...ARTER, TILMELDING_ART]);
    expect(migrationenErRigtig(laes(MIG), [...ARTER, TILMELDING_ART], koert, "20261003070000_meta_haendelser_tilmelding.sql")).toBe(true);
  });
  it("7. teksterne følger koden: tracking.md (låsen, B4-betingelsen, det gamle løfte), webinarmotor.md, CLAUDE.md", () =>
    expect(teksterneFoelgerKoden(laes(TRACKING), laes(MOTOR_DOC), laes(CLAUDE_MD))).toBe(true));
});

describe("webinarTilmeldMeta.guard — dommene fanger fejlen på en kopi", () => {
  const dom = laes(DOM), koersel = laes(KOERSEL), cron = laes(CRON), mig = laes(MIG);
  const skift = (k: string, a: string, b: string) => { expect(k.includes(a)).toBe(true); return k.split(a).join(b); };

  it("1. låsen delt med meta_send_aktiv, porten væk, testkoden alene nok, en læsefejl der åbner, eller afsendelse før cronens port, fælder dom 1", () => {
    expect(laasenErEgenOgLukket(skift(dom, '"webinarmotor_meta_aktiv"', '"meta_send_aktiv"'), koersel, cron)).toBe(false);
    expect(laasenErEgenOgLukket(skift(dom, '  if (a.port !== "klar") return false;\n', ""), koersel, cron)).toBe(false);
    expect(laasenErEgenOgLukket(skift(dom, "if (a.testEventCode !== null && a.tilmeldingId !== null) return true;", "if (a.testEventCode !== null) return true;"), koersel, cron)).toBe(false);
    expect(laasenErEgenOgLukket(skift(dom, "return a.metaLaasAktiv && a.webinarLaasAktiv;", "return a.webinarLaasAktiv;"), koersel, cron)).toBe(false);
    expect(laasenErEgenOgLukket(skift(dom, 'if (svar.fejl) return { port: "laesefejl", aaben: false };', 'if (svar.fejl) return { port: "klar", aaben: true };'), koersel, cron)).toBe(false);
    expect(laasenErEgenOgLukket(dom, skift(koersel, "  if (!r.sender_rigtigt) return { sendt, fejlede };\n", ""), cron)).toBe(false);
    const flyttet = skift(cron, "  if (!r.sender_rigtigt) return { status: 200, resultat: r };\n", "")
      .replace("  if (r.fejlede > 0) await skrivAlarm(", "  if (!r.sender_rigtigt) return { status: 200, resultat: r };\n  if (r.fejlede > 0) await skrivAlarm(");
    expect(laasenErEgenOgLukket(dom, koersel, flyttet)).toBe(false);
  });
  it("2. rå mail i payloaden, ln/ph tilføjet, ip_dagshash læst, værnet efter afsendelsen, eller hashning sprunget over, fælder dom 2", () => {
    expect(ingenKlartekst(skift(dom, "      ...hashet,\n", "      ...hashet,\n      email: r.email,\n"), koersel)).toBe(false);
    expect(ingenKlartekst(skift(dom, '["em", "fn"] as const;', '["em", "fn", "ln"] as const;'), koersel)).toBe(false);
    expect(ingenKlartekst(dom, skift(koersel, '"id, kilde_system,', '"id, ip_dagshash, kilde_system,'), )).toBe(false);
    expect(ingenKlartekst(dom, skift(koersel, '"id, kilde_system,', '"id, navn, kilde_system,'))).toBe(false);
    const sentVaern = skift(koersel, "    const forbudte = findForbudteNoegler(payload);\n", "")
      .replace("    const svar = await a.send(payload, a.testEventCode);\n", "    const svar = await a.send(payload, a.testEventCode);\n    const forbudte = findForbudteNoegler(payload);\n");
    expect(ingenKlartekst(dom, sentVaern)).toBe(false);
    expect(ingenKlartekst(dom, skift(koersel, "const hashet = await hashTilmeldingBrugerdata(normaliserTilmeldingBrugerdata(p.raekke), sha256Hex);", "const hashet = { em: [p.raekke.email ?? \"\"] };"))).toBe(false);
  });
  it("3. eWebinar-rækker med, intern efter afmeldt, uden afmeldingsopslag, eller uden kilde-filter, fælder dom 3", () => {
    expect(internAfmeldtAldrig(skift(dom, '  if (r.kilde_system !== "platform") return { ok: false, grund: "ikke_platform" };\n', ""), koersel)).toBe(false);
    const byttet = dom.replace('  if (erInternRaekke(r)) return { ok: false, grund: "intern" };\n  if (r.afmeldt) return { ok: false, grund: "afmeldt" };\n',
      '  if (r.afmeldt) return { ok: false, grund: "afmeldt" };\n  if (erInternRaekke(r)) return { ok: false, grund: "intern" };\n');
    expect(byttet).not.toBe(dom);
    expect(internAfmeldtAldrig(byttet, koersel)).toBe(false);
    expect(internAfmeldtAldrig(skift(dom, 'r.intern === true || r.intern === "true"', "r.intern === true"), koersel)).toBe(false);
    expect(internAfmeldtAldrig(dom, skift(koersel, '.eq("kilde_system", "platform")', ""))).toBe(false);
    expect(internAfmeldtAldrig(dom, skift(koersel, "afmeldt: afmeldte.has(lav(t.email))", "afmeldt: false"))).toBe(false);
  });
  it("4. event_id uden art (spec'ens gamle «eventID = tilmelding_id») eller CHECK'en på ansoegning_id alene, fælder dom 4", () => {
    expect(eventIdFormen(skift(dom, "return `${tilmeldingId}:${TILMELDING_ART}`;", "return tilmeldingId;"), mig)).toBe(false);
    expect(eventIdFormen(skift(dom, '"registration" as const;', '"tilmeldt" as const;'), mig)).toBe(false);
    expect(eventIdFormen(dom, skift(mig, "coalesce(ansoegning_id, tilmelding_id)::text", "ansoegning_id::text"))).toBe(false);
  });
  it("5. et env-opslag, et fetch, en import af afsendelsen eller tokenets navn i de nye filer, fælder dom 5", () => {
    expect(secretEtSted(dom + '\nconst t = Deno.env.get("X");\n', koersel, cron)).toBe(false);
    expect(secretEtSted(dom, koersel + '\nawait fetch("https://graph.facebook.com");\n', cron)).toBe(false);
    expect(secretEtSted(dom, koersel + '\nimport { sendTilMeta } from "./metaSendAfsendelse.ts";\n', cron)).toBe(false);
    expect(secretEtSted(dom + '\nexport const N = "META_SEND_TOKEN";\n', koersel, cron)).toBe(false);
    expect(secretEtSted(dom, koersel, cron + "\nawait sendTilMeta(x, null);\n")).toBe(false);
  });
  it("6. en art i koden uden CHECK, et andet filhoved, to alter table, ingen port, låsen true, eller en kørt fil efter, fælder dom 6", () => {
    const { koert } = migrationsOrden(MIG_DIR);
    const F = "20261003070000_meta_haendelser_tilmelding.sql";
    const arter = [...ARTER, TILMELDING_ART];
    expect(migrationenErRigtig(mig, [...arter, "ny_art"], koert, F)).toBe(false);
    expect(migrationenErRigtig(skift(mig, ", 'registration'))", "))"), arter, koert, F)).toBe(false);
    expect(migrationenErRigtig("-- forklaring først\n" + mig, arter, koert, F)).toBe(false);
    expect(migrationenErRigtig(skift(mig, "  drop constraint if exists meta_haendelser_ejer_xor,\n", ";\nalter table public.meta_haendelser\n  drop constraint if exists meta_haendelser_ejer_xor,\n"), arter, koert, F)).toBe(false);
    expect(migrationenErRigtig(skift(mig, "    raise exception 'STOP: webinar_tilmeldinger.kilde_system mangler", "    raise notice 'webinar_tilmeldinger.kilde_system mangler"), arter, koert, F)).toBe(false);
    expect(migrationenErRigtig(skift(mig, "values ('webinarmotor_meta_aktiv', 'false'::jsonb,", "values ('webinarmotor_meta_aktiv', 'true'::jsonb,"), arter, koert, F)).toBe(false);
    expect(migrationenErRigtig(skift(mig, "on conflict (config_key) do nothing;", "on conflict (config_key) do update set config_value = excluded.config_value;"), arter, koert, F)).toBe(false);
    expect(migrationenErRigtig(skift(mig, "alter column ansoegning_id drop not null,", ""), arter, koert, F)).toBe(false);
    expect(migrationenErRigtig(mig, arter, [...koert, "20261003080000_kort_efter.sql"], F)).toBe(false);
  });
  it("7. tracking.md uden B4-betingelsen eller låsen, webinarmotor.md med D2.3 «IKKE bygget», eller CLAUDE.md uden linjen, fælder dom 7", () => {
    const t = laes(TRACKING), m = laes(MOTOR_DOC), c = laes(CLAUDE_MD);
    expect(teksterneFoelgerKoden(skift(t, "sendes ikke, før privatlivsteksten", "sendes"), m, c)).toBe(false);
    expect(teksterneFoelgerKoden(t.replace(/(\| 28 \|[^\n]*?)webinarmotor_meta_aktiv/, "$1en lås"), m, c)).toBe(false);
    expect(teksterneFoelgerKoden(t, m.replace("**BYGGET BAG LÅS", "**IKKE bygget"), c)).toBe(false);
    expect(teksterneFoelgerKoden(t, m, c.split("webinarTilmeldMeta.guard").join("et værn"))).toBe(false);
  });
});
