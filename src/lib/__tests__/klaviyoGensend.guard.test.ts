import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afstandMinutter, MAKS_FORSOEG, TRAPPE_MINUTTER } from "../../../supabase/functions/_shared/klaviyoGensend.ts";

/**
 * Kildeværn for gensenderen (21/9-2026). Hver dom bevist på en kopi med
 * fejlen indsat, som husets andre værn (klaviyo.guard, stilleDom.guard):
 *
 *   1. Gensenderen går GENNEM klaviyoAfsendelse: functionen kalder
 *      gensendHvisGemt — ingen fetch, ingen kald, og Klaviyo-nøglen læses
 *      ikke her (klaviyo.guard dom 3: ét sted). Deno.env i functionen er KUN
 *      SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY — som stille-klokker-cron.
 *   2. Den kan ikke kaste: kørslen ligger i try/catch i Deno.serve,
 *      gensendHvisGemt har try/catch om alt, og hvert kald af den er await'et.
 *   3. Sporet skrives før hver return i gensendGemtKrop — og kroppen bygges
 *      ikke om (ingen byggHaendelse: samme unique_id, samme time, samme frisk).
 *   4. config.toml har verify_jwt = true, og KENDTE_FELTER er præcis
 *      dry_run · nu · bevis_id.
 *   5. Migrationen er bogført KØRT i prod (21/9 10:54, job 567 — filhovedet rettet i bogføringen 21/9;
 *      var «IKKE KØRT» indtil da), planlægger hvert 5. minut på offset 1 med
 *      kald_edge('klaviyo-gensend-cron', …, 60000, 300000).
 *   6. Beviset kræver en ok-række (400 ellers).
 *   7. Regnestykket i konstanterne holder: 5+10+20+40+80 = 155, seks forsøg.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const FUNKTION = "supabase/functions/klaviyo-gensend-cron/index.ts";
const AFSENDELSE = "supabase/functions/_shared/klaviyoAfsendelse.ts";
const HAENDELSER = "supabase/functions/_shared/klaviyoHaendelser.ts";
const CONFIG = "supabase/config.toml";
const MIGRATION = "supabase/migrations/20260921160000_klaviyo_gensend_cron.sql";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const gaarGennemAfsendelse = (funktion: string): boolean => {
  const k = udenKommentarer(funktion);
  const envKald = [...k.matchAll(/Deno\.env\.get\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
  const envUdenNoegle = envKald.length > 0 && envKald.every((n) => n === "SUPABASE_URL" || n === "SUPABASE_SERVICE_ROLE_KEY");
  return k.includes('from "../_shared/klaviyoAfsendelse.ts"') &&
    k.includes("gensendHvisGemt(") &&
    !/\bfetch\s*\(/.test(k) &&
    !/\bkald\s*\(/.test(k) &&
    !/\bkald\b.*from "\.\.\/_shared\/klaviyo\.ts"/.test(k) &&
    !k.includes("KLAVIYO_API_KEY") &&
    !k.includes("KLAVIYO_SECRET") &&
    !/Deno\.env\.get\([^"']/.test(k) &&
    envUdenNoegle;
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const kanIkkeKaste = (funktion: string, afsendelse: string): boolean => {
  const f = udenKommentarer(funktion);
  const a = udenKommentarer(afsendelse);
  const serve = f.slice(f.indexOf("Deno.serve("));
  const koerselITryCatch = /try \{[\s\S]*?await koerGensend\([\s\S]*?\} catch \(err\) \{/.test(serve);
  // Hvert kald af gensendHvisGemt er await'et — ingen løs promise.
  const alleAwaitet = (f.match(/gensendHvisGemt\(/g) ?? []).length >= 2 &&
    (f.match(/await gensendHvisGemt\(/g) ?? []).length === (f.match(/gensendHvisGemt\(/g) ?? []).length;
  const afsendelseFanger = new RegExp(
    `function gensendHvisGemt\\((?:(?!\\nexport |\\nasync function |\\nfunction )[\\s\\S])*?try \\{(?:(?!\\nexport |\\nasync function |\\nfunction )[\\s\\S])*?\\} catch \\(e\\) \\{`,
  ).test(a);
  return koerselITryCatch && alleAwaitet && afsendelseFanger;
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const sporetFoerHverReturn = (haendelser: string): boolean => {
  const h = udenKommentarer(haendelser);
  const start = h.indexOf("export async function gensendGemtKrop");
  const slut = h.indexOf("export async function sendHaendelse");
  if (start === -1 || slut === -1 || slut < start) return false;
  const krop = h.slice(start, slut);
  const spor = krop.indexOf("skrivSpor(");
  const foersteReturn = krop.indexOf("return");
  return spor !== -1 && foersteReturn > spor &&
    (krop.split("skrivSpor(").length - 1) === 1 &&
    krop.includes('metode: "POST", krop: raekke.sendt') &&
    !krop.includes("byggHaendelse(");
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const kendteFelterErTre = (funktion: string): boolean =>
  /export const KENDTE_FELTER = \["dry_run", "nu", "bevis_id"\] as const;/.test(udenKommentarer(funktion)) &&
  udenKommentarer(funktion).includes("ukendteFelter(") && udenKommentarer(funktion).includes("ukendteFelterBesked(");

// ── 5 ──────────────────────────────────────────────────────────────────────
export const migrationenPlanlaeggerRigtigt = (sql: string): boolean =>
  sql.startsWith("-- KØRT i prod — 21/9-2026 kl. 10:54") &&
  /cron\.schedule\(\s*'klaviyo-gensend',\s*'1-59\/5 \* \* \* \*'/.test(sql) &&
  /kald_edge\(\s*'klaviyo-gensend-cron',\s*'\{"dry_run": false\}'::jsonb,\s*60000,[^\n]*\n\s*300000/.test(sql) &&
  sql.includes("cron.unschedule('klaviyo-gensend')");

// ── 6 ──────────────────────────────────────────────────────────────────────
export const bevisetKraeverOk = (funktion: string): boolean => {
  const k = udenKommentarer(funktion);
  const start = k.indexOf("a.bevisId !== null");
  const slut = k.indexOf("const fra = new Date(");
  if (start === -1 || slut === -1 || slut < start) return false;
  const bevis = k.slice(start, slut);
  return bevis.includes('raekke.udfald !== "ok"') &&
    /udfald !== "ok"[\s\S]{0,400}status: 400/.test(bevis) &&
    // En bevis-kørsel sender netop én krop og returnerer FØR den almindelige kørsel — ingen alarm.
    !bevis.includes("skrivAlarm(") &&
    (bevis.match(/gensendHvisGemt\(/g) ?? []).length === 1;
};

describe("klaviyoGensend.guard — gensenderen", () => {
  it("1. functionen går gennem klaviyoAfsendelse — ingen fetch, ingen kald, ingen Klaviyo-nøgle her", () => {
    const f = laes(FUNKTION);
    expect(gaarGennemAfsendelse(f)).toBe(true);
    expect(gaarGennemAfsendelse(`${f}\nawait fetch("https://a.klaviyo.com/api/events/");`)).toBe(false);
    expect(gaarGennemAfsendelse(`${f}\nconst s = await kald(n, "/events/");`)).toBe(false);
    expect(gaarGennemAfsendelse(`${f}\nconst n = Deno.env.get("KLAVIYO_API_KEY");`)).toBe(false);
    expect(gaarGennemAfsendelse(`${f}\nconst n = Deno.env.get(KLAVIYO_SECRET);`)).toBe(false);
    expect(gaarGennemAfsendelse(f.replace(/gensendHvisGemt\(/g, "sendNoget("))).toBe(false);
    expect(gaarGennemAfsendelse("ingen function her")).toBe(false);
  });

  it("2. den kan ikke kaste: try/catch om kørslen, await på hvert kald, try/catch i gensendHvisGemt", () => {
    const f = laes(FUNKTION), a = laes(AFSENDELSE);
    expect(kanIkkeKaste(f, a)).toBe(true);
    expect(kanIkkeKaste(f.replace(/\} catch \(err\) \{/g, "} finally {"), a)).toBe(false);
    expect(kanIkkeKaste(f.replace(/await gensendHvisGemt\(/g, "void gensendHvisGemt("), a)).toBe(false);
    expect(kanIkkeKaste(f, a.replace(/\} catch \(e\) \{/g, "} finally {"))).toBe(false);
  });

  it("3. sporet skrives før hver return i gensendGemtKrop, og kroppen bygges ikke om", () => {
    const h = laes(HAENDELSER);
    expect(sporetFoerHverReturn(h)).toBe(true);
    // Præcis den fejl, dom 7 i klaviyo.guard handler om: en return før sporet.
    expect(sporetFoerHverReturn(h.replace("export async function gensendGemtKrop(", "export async function gensendGemtKrop(\n  // @ts-expect-error\n  return;\n"))).toBe(false);
    expect(sporetFoerHverReturn(h.replace('metode: "POST", krop: raekke.sendt', 'metode: "POST", krop: byggHaendelse(i)'))).toBe(false);
    expect(sporetFoerHverReturn(h.replace(/await skrivSpor\(skriver, i, svar\.spor, raekke\.sendt\);/, ""))).toBe(false);
    expect(sporetFoerHverReturn("ingen funktion her")).toBe(false);
  });

  it("4. config.toml har verify_jwt = true, og KENDTE_FELTER er præcis dry_run · nu · bevis_id", () => {
    expect(laes(CONFIG)).toMatch(/\[functions\.klaviyo-gensend-cron\]\s*\n\s*verify_jwt = true/);
    const f = laes(FUNKTION);
    expect(kendteFelterErTre(f)).toBe(true);
    expect(kendteFelterErTre(f.replace('"bevis_id"] as const', '"bevis_id", "alt"] as const'))).toBe(false);
    expect(kendteFelterErTre(f.replace(/ukendteFelterBesked\(/g, "besked("))).toBe(false);
  });

  it("5. migrationen er bogført KØRT i prod (job 567) og planlægger hvert 5. minut på offset 1 med 60 s / 5 min", () => {
    const sql = laes(MIGRATION);
    expect(migrationenPlanlaeggerRigtigt(sql)).toBe(true);
    // Filhovedet må ikke falde tilbage til «IKKE KØRT» — migrationen ER kørt (job 567).
    expect(migrationenPlanlaeggerRigtigt(sql.replace("-- KØRT i prod — 21/9-2026 kl. 10:54", "-- IKKE KØRT. DEPLOY:"))).toBe(false);
    expect(migrationenPlanlaeggerRigtigt(sql.replace("'1-59/5 * * * *'", "'*/5 * * * *'"))).toBe(false);
    expect(migrationenPlanlaeggerRigtigt(sql.replace("300000 ", "900000 "))).toBe(false);
  });

  it("6. beviset kræver en ok-række, sender netop én krop og alarmerer ikke", () => {
    const f = laes(FUNKTION);
    expect(bevisetKraeverOk(f)).toBe(true);
    expect(bevisetKraeverOk(f.replace('raekke.udfald !== "ok"', 'raekke.udfald === "aldrig"'))).toBe(false);
  });

  it("7. regnestykket: 5 + 10 + 20 + 40 + 80 = 155 minutter over seks forsøg", () => {
    const afstande = Array.from({ length: MAKS_FORSOEG - 1 }, (_, i) => afstandMinutter(i + 1));
    expect(afstande).toEqual([5, 10, 20, 40, 80]);
    expect(afstande.reduce((a, b) => a + b, 0)).toBe(TRAPPE_MINUTTER);
  });
});
