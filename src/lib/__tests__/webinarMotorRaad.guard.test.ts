import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OFFENTLIG_LAAS_NOEGLE } from "@/lib/webinarMotor/tilmelding";
import { SET_PROCENT_KILDE_MOTOR } from "@/lib/webinarMotor/fremmoede";

/**
 * Kildeværn for det tekniske råds fund i webinarmotoren (30/9-2026). Hver dom
 * har en MUTATION, der viser, at værnet fælder den fejl, det er sat til at fange.
 *
 *   1. FLYT KUN MED TOKEN: webinar-tilmeld kalder offentligTilmeldDom (aldrig
 *      tilmeldDom) og skriver ALDRIG en UPDATE på webinar_tilmeldinger eller
 *      flyttet_fra_session_id. webinar-rum («gen_tilmeld», token-bevist) er
 *      den eneste, der flytter.
 *   2. ÉT ENSARTET SVAR: intet `dublet` i webinar-tilmelds svar; præcis ét
 *      `ok: true`-svar med token (den nye række), alt andet gennem `ensartet`.
 *   3. LOFTET: webinar-puls tæller (handlingUnderLoft) FØR loggen skrives for
 *      spørgsmål og reaktioner.
 *   4. LÅSEN: laasDom FØR offentligTilmeldDom; hver naesteSessioner i
 *      webinar-tilmeld og webinar-rum får en liste gennem bagLaasen; låsen
 *      læses fail-closed; migrationen lægger nøglen = false med ON CONFLICT DO NOTHING.
 *   5. DASHBOARDET: webinarDashboard filtrerer erInternTilmelding FØR alt andet
 *      i begge spejle, og begge hentninger beder om `intern:raa->>intern`.
 *   8. SET_PROCENT_KILDE: SQL'en og cronen skriver det samme navn.
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const foer = (s: string, a: string, b: string) => s.indexOf(a) >= 0 && s.indexOf(b) >= 0 && s.indexOf(a) < s.indexOf(b);

const TILMELD = "supabase/functions/webinar-tilmeld/index.ts";
const RUM = "supabase/functions/webinar-rum/index.ts";
const PULS = "supabase/functions/webinar-puls/index.ts";
const HENT = "supabase/functions/_shared/webinarMotorHent.ts";
const MIG3 = "supabase/migrations/20261003030000_webinarmotor_skive3.sql";
const MIG1 = "supabase/migrations/20261003010000_webinarmotor_skive1.sql";
const MOTOR_CRON = "supabase/functions/webinar-motor-cron/index.ts";
const DASH_SRC = "src/lib/webinar/dashboard.ts";
const DASH_DENO = "supabase/functions/_shared/webinarDashboard.ts";
const HOOK = "src/hooks/webinar.ts";
const DELT = "supabase/functions/webinar-delt/index.ts";

// ── 1 ────────────────────────────────────────────────────────────────────────
export function flytKunMedToken(tilmeld: string, rum: string): boolean {
  const t = udenKommentarer(tilmeld), r = udenKommentarer(rum);
  if (/(^|[^A-Za-z])tilmeldDom\(/.test(t)) return false;
  if (!t.includes("offentligTilmeldDom(")) return false;
  if (/\.update\(/.test(t) || t.includes("flyttet_fra_session_id")) return false;
  if (/art: "flyttet"/.test(t)) return false;
  // Den token-beviste vej findes stadig — og kun dér.
  return /verifyDeltagertoken\(/.test(r) && r.includes("flyttet_fra_session_id") && /(^|[^A-Za-z])tilmeldDom\(/.test(r);
}

describe("webinarMotorRaad.guard 1 — flyt kun med token", () => {
  it("webinar-tilmeld flytter aldrig; webinar-rum gør det bag tokenet", () => expect(flytKunMedToken(laes(TILMELD), laes(RUM))).toBe(true));
  it("MUTATION: tilmeldDom tilbage i webinar-tilmeld fanges", () => {
    const t = laes(TILMELD).replace("const valg = offentligTilmeldDom(", "const valg = tilmeldDom(");
    expect(t).not.toBe(laes(TILMELD));
    expect(flytKunMedToken(t, laes(RUM))).toBe(false);
  });
  it("MUTATION: en UPDATE af en tilmelding i webinar-tilmeld fanges", () => {
    const t = laes(TILMELD).replace("      // Rækken røres IKKE.", '      await admin.from("webinar_tilmeldinger").update({ session_id: session.id }).eq("id", valg.id);\n      // Rækken røres IKKE.');
    expect(t).not.toBe(laes(TILMELD));
    expect(flytKunMedToken(t, laes(RUM))).toBe(false);
  });
});

// ── 2 ────────────────────────────────────────────────────────────────────────
export function ensartetSvar(tilmeld: string): boolean {
  const t = udenKommentarer(tilmeld);
  if (t.split("\n").some((l) => l.includes("svar(req") && /\bdublet\b/.test(l))) return false;
  const okSvar = [...t.matchAll(/svar\(req, \{ ok: true,[^\n]*/g)].map((m) => m[0]);
  if (okSvar.length !== 2) return false; // ensartet() og den nye række
  if (!okSvar.some((l) => l.includes("token: null, link_paa_mail: true"))) return false;
  if (!okSvar.some((l) => l.includes("token, rum_sti:"))) return false;
  return t.includes("if (vaern.honning) return ensartet(req, null);") && (t.match(/return ensartet\(req, sessionUd\);/g) ?? []).length === 2;
}

describe("webinarMotorRaad.guard 2 — ét ensartet svar", () => {
  it("webinar-tilmeld svarer ens for alt andet end en ny række", () => expect(ensartetSvar(laes(TILMELD))).toBe(true));
  it("MUTATION: et `dublet`-felt i svaret fanges", () => {
    const t = laes(TILMELD).replace("return svar(req, { ok: true, session: sessionUd, token, rum_sti:", 'return svar(req, { ok: true, dublet: "ny", session: sessionUd, token, rum_sti:');
    expect(t).not.toBe(laes(TILMELD));
    expect(ensartetSvar(t)).toBe(false);
  });
  it("MUTATION: en kendt mail med sit eget svar fanges", () => {
    const t = laes(TILMELD).replace("      return ensartet(req, sessionUd);\n    }", '      return svar(req, { ok: true, kendt: true, session: sessionUd, token: null });\n    }');
    expect(t).not.toBe(laes(TILMELD));
    expect(ensartetSvar(t)).toBe(false);
  });
  it("fladen læser ikke et `dublet`-felt", () => {
    expect(laes("src/components/webinarRum/WebinarTilmelding.tsx")).not.toMatch(/\.dublet\b/);
    expect(udenKommentarer(laes("src/lib/webinarRum/api.ts")).match(/export interface TilmeldSvar \{[\s\S]*?\}/)?.[0]).not.toMatch(/dublet/);
  });
});

// ── 3 ────────────────────────────────────────────────────────────────────────
export function loftFoerSkrivning(puls: string): boolean {
  const k = udenKommentarer(puls);
  const krop = k.slice(k.indexOf("async function udfoerHandling("), k.indexOf("Deno.serve("));
  const efterSvar = krop.slice(krop.indexOf('if (h.art === "svar")'));
  const svarSlut = efterSvar.indexOf('return ind && ind.length === 1 ? "ok" : "dublet";');
  const rest = efterSvar.slice(svarSlut);
  return foer(rest, "handlingUnderLoft(loftArt, talt)", 'from("webinar_motor_log").upsert(') &&
    foer(rest, "handlingUnderLoft(loftArt, talt)", 'from("webinar_spoergsmaal").insert(') &&
    foer(rest, "handlingUnderLoft(loftArt, talt)", 'rpc("webinar_reaktion_tael"') &&
    /if \(n === null\) \{ noterFejl\("loft"\); return "fejl"; \}/.test(rest) &&
    rest.includes("a.talt.set(loftArt, talt + 1);") &&
    k.includes('.gte("tid", new Date(nuMs - HANDLING_LOFT_VINDUE_MS).toISOString())');
}

describe("webinarMotorRaad.guard 3 — loftet på spørgsmål og reaktioner", () => {
  it("tællingen står før skrivningen", () => expect(loftFoerSkrivning(laes(PULS))).toBe(true));
  it("MUTATION: loftet fjernet fanges", () => {
    const p = laes(PULS).replace("if (!handlingUnderLoft(loftArt, talt)) {", "if (false) {");
    expect(p).not.toBe(laes(PULS));
    expect(loftFoerSkrivning(p)).toBe(false);
  });
  it("MUTATION: fail-open ved en fejlet tælling fanges", () => {
    const p = laes(PULS).replace('if (n === null) { noterFejl("loft"); return "fejl"; }', "");
    expect(p).not.toBe(laes(PULS));
    expect(loftFoerSkrivning(p)).toBe(false);
  });
});

// ── 4 ────────────────────────────────────────────────────────────────────────
export function laasenHolder(tilmeld: string, rum: string, hent: string, mig: string): boolean {
  const t = udenKommentarer(tilmeld), r = udenKommentarer(rum), h = udenKommentarer(hent);
  if (!foer(t, "const laas = laasDom(", "const valg = offentligTilmeldDom(")) return false;
  if (!foer(t, "const intern = internDom(", "const laas = laasDom(")) return false;
  if (!t.includes("if (!laas.ok) return svar(req, { fejl: laas.grund }, 403);")) return false;
  for (const k of [t, r]) {
    const kald = [...k.matchAll(/naesteSessioner\(\s*([\s\S]*?),\s*nuMs/g)].map((m) => m[1].trim());
    if (kald.length === 0 || !kald.every((a) => a.startsWith("bagLaasen("))) return false;
  }
  if ([...r.matchAll(/naesteSessioner\(/g)].length !== 2) return false;
  if (!/eq\("config_key", OFFENTLIG_LAAS_NOEGLE\)/.test(h) || !/if \(error\) return false;/.test(h) || !/catch \{\s*return false;/.test(h)) return false;
  const insert = `insert into public.app_config (config_key, config_value, description)\nvalues ('${OFFENTLIG_LAAS_NOEGLE}', 'false'::jsonb,`;
  return mig.includes(insert) && /values \('webinarmotor_offentlig_aktiv'[^;]*\)\non conflict \(config_key\) do nothing;/.test(mig);
}

describe("webinarMotorRaad.guard 4 — låsen foran de offentlige sessioner", () => {
  const alt = () => [laes(TILMELD), laes(RUM), laes(HENT), laes(MIG3)] as const;
  it("tilmeld, rum, hentningen og migrationen holder den", () => expect(laasenHolder(...alt())).toBe(true));
  it("MUTATION: låsen efter dubletdommen fanges", () => {
    const [t, r, h, m] = alt();
    const t2 = t.replace("    const laas = laasDom(sessionIntern, sessionIntern ? false : await hentOffentligLaas(admin));\n    if (!laas.ok) return svar(req, { fejl: laas.grund }, 403);\n", "")
      .replace("    if (valg.art === \"afvis\")", "    const laas = laasDom(sessionIntern, sessionIntern ? false : await hentOffentligLaas(admin));\n    if (!laas.ok) return svar(req, { fejl: laas.grund }, 403);\n    if (valg.art === \"afvis\")");
    expect(t2).not.toBe(t);
    expect(laasenHolder(t2, r, h, m)).toBe(false);
  });
  it("MUTATION: en liste uden om låsen i «sessioner» fanges", () => {
    const [t, r, h, m] = alt();
    const t2 = t.replace("naesteSessioner(bagLaasen(valg, offentligAaben), nuMs", "naesteSessioner(valg, nuMs");
    expect(t2).not.toBe(t);
    expect(laasenHolder(t2, r, h, m)).toBe(false);
  });
  it("MUTATION: rummets «Tag næste session» uden om låsen fanges", () => {
    const [t, r, h, m] = alt();
    const r2 = r.replace("naesteSessioner(bagLaasen(kommende, await hentOffentligLaas(admin)), nuMs", "naesteSessioner(kommende, nuMs");
    expect(r2).not.toBe(r);
    expect(laasenHolder(t, r2, h, m)).toBe(false);
  });
  it("MUTATION: fail-open ved en læsefejl fanges", () => {
    const [t, r, h, m] = alt();
    const h2 = h.replace("if (error) return false;", "if (error) return true;");
    expect(h2).not.toBe(h);
    expect(laasenHolder(t, r, h2, m)).toBe(false);
  });
  it("MUTATION: låsen lagt som true — eller uden ON CONFLICT — fanges", () => {
    const [t, r, h, m] = alt();
    expect(laasenHolder(t, r, h, m.replace("values ('webinarmotor_offentlig_aktiv', 'false'::jsonb,", "values ('webinarmotor_offentlig_aktiv', 'true'::jsonb,"))).toBe(false);
    expect(laasenHolder(t, r, h, m.replace("')\non conflict (config_key) do nothing;", "')\non conflict (config_key) do update set config_value = excluded.config_value;"))).toBe(false);
  });
});

// ── 5 ────────────────────────────────────────────────────────────────────────
const INTERN_KILDE = "intern:raa->>intern";
export function dashboardUdenInterne(src: string, deno: string, hook: string, delt: string): boolean {
  const filter = "const tilmeldinger = ind.tilmeldinger.filter((r) => !erInternTilmelding(r));";
  for (const k of [src, deno].map(udenKommentarer)) {
    const krop = k.slice(k.indexOf("export function webinarDashboard("));
    if (!krop.includes(filter)) return false;
    // Filtret står FØR første brug af tilmeldingerne, og intet læser ind.tilmeldinger bagefter.
    if (!foer(krop, filter, "naesteWebinar(tilmeldinger")) return false;
    if ((krop.match(/ind\.tilmeldinger/g) ?? []).length !== 1) return false;
    if (!/export const erInternTilmelding = \(r: InternFelter\): boolean => r\.intern === true \|\| r\.intern === "true";/.test(k)) return false;
  }
  const grund = udenKommentarer(delt).match(/export const GRUND_KOLONNER =\s*\n?\s*"([^"]+)"/)?.[1] ?? "";
  const flade = udenKommentarer(hook).match(/export const TILMELDING_KOLONNER =\s*\n?\s*"([^"]+)"/)?.[1] ?? "";
  return grund.split(",").map((x) => x.trim()).includes(INTERN_KILDE) && flade.split(",").map((x) => x.trim()).includes(INTERN_KILDE);
}

describe("webinarMotorRaad.guard 5 — /webinar og delingen uden den interne prøve", () => {
  const alt = () => [laes(DASH_SRC), laes(DASH_DENO), laes(HOOK), laes(DELT)] as const;
  it("begge spejle filtrerer, begge hentninger beder om mærket", () => expect(dashboardUdenInterne(...alt())).toBe(true));
  it("MUTATION: filtret fjernet i delingens spejl fanges", () => {
    const [s, d, h, dl] = alt();
    const d2 = d.replace("const tilmeldinger = ind.tilmeldinger.filter((r) => !erInternTilmelding(r));", "const tilmeldinger = ind.tilmeldinger;");
    expect(d2).not.toBe(d);
    expect(dashboardUdenInterne(s, d2, h, dl)).toBe(false);
  });
  it("MUTATION: mærket ikke hentet i delingen fanges", () => {
    const [s, d, h, dl] = alt();
    const dl2 = dl.replace(", intern:raa->>intern\"", "\"");
    expect(dl2).not.toBe(dl);
    expect(dashboardUdenInterne(s, d, h, dl2)).toBe(false);
  });
});

// ── 8 ────────────────────────────────────────────────────────────────────────
export function kildenavnetErEt(sql: string, cron: string): boolean {
  const fund = [...sql.matchAll(/set_procent_kilde\s*=\s*'([^']+)'/g)].map((m) => m[1]);
  const c = udenKommentarer(cron);
  return fund.length === 1 && fund[0] === SET_PROCENT_KILDE_MOTOR &&
    c.includes("saet.set_procent_kilde = SET_PROCENT_KILDE_MOTOR;") && !/set_procent_kilde = MOTOR_VERSION/.test(c);
}

describe("webinarMotorRaad.guard 8 — ét navn for set_procent_kilde", () => {
  it("SQL'en og cronen skriver det samme", () => expect(kildenavnetErEt(laes(MIG1), laes(MOTOR_CRON))).toBe(true));
  it("MUTATION: versionen tilbage i SQL'en eller cronen fanges", () => {
    expect(kildenavnetErEt(laes(MIG1).replace("set_procent_kilde = 'boardroom-bitmap'", "set_procent_kilde = 'boardroom-1'"), laes(MOTOR_CRON))).toBe(false);
    expect(kildenavnetErEt(laes(MIG1), laes(MOTOR_CRON).replace("saet.set_procent_kilde = SET_PROCENT_KILDE_MOTOR;", "saet.set_procent_kilde = MOTOR_VERSION;"))).toBe(false);
  });
});
