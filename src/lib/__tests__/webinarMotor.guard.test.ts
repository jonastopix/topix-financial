import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { findMotorForbudte, MOTOR_FORBUDTE_NOEGLER } from "@/lib/webinarMotor/svar";

/**
 * Kildeværn for webinarmotoren, skive 1 (30/9-2026). Hver dom har en MUTATION,
 * der viser, at værnet fælder den fejl, det er sat til at fange.
 *
 *   1. POSITIONEN ER KUN SERVERENS: pulsens krop kender ingen «forventet»;
 *      webinar-puls regner positionen med positionDom og giver pulsDom serverens
 *      tal; webinar-rum læser kun t og handling.
 *   2. INGEN PERSONDATA I SVAR: hvert JSON-svar i de tre functions går gennem
 *      ÉN hjælper, der kalder findMotorForbudte, og listen dækker personfelterne.
 *   3. INGEN LOG PR. PULS: webinar-puls har ÉT console-kald, og det står i
 *      udskrivFejlsum; de delte filer, pulsen trækker ind, logger aldrig.
 *   4. TOKENET ER EN HMAC: HMAC-SHA256, sammenlignet i konstant tid (aldrig
 *      `===`), secret'en læst ÉT sted, intet token i en kolonne, og prædikatet
 *      står FØR første databasekald i rum og puls.
 *   5. MIGRATIONEN er kun tilføjende og starter med den linje, der scannes efter.
 *   6. Prædikaterne står i CI-værnet, og config.toml har de tre functions.
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const TILMELD = "supabase/functions/webinar-tilmeld/index.ts";
const RUM = "supabase/functions/webinar-rum/index.ts";
const PULS = "supabase/functions/webinar-puls/index.ts";
const AUTH = "supabase/functions/_shared/webinarDeltagerAuth.ts";
const HENT = "supabase/functions/_shared/webinarMotorHent.ts";
const TOKEN = "supabase/functions/_shared/webinarMotor/token.ts";
const PULS_DOM = "src/lib/webinarMotor/puls.ts";
const MIGRATION = "supabase/migrations/20261003010000_webinarmotor_skive1.sql";
const utenKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ── 1. Positionen ────────────────────────────────────────────────────────────

/** Pulsens kropsfelter må ikke bære en forventet position — kun afspillerens egen (pos_sek). */
export function kropKenderIngenForventet(pulsDom: string): boolean {
  const m = pulsDom.match(/export const PULS_FELTER = \[([^\]]*)\]/);
  const k = pulsDom.match(/export const PULS_KENDTE_FELTER = \[([^\]]*)\]/);
  if (!m || !k) return false;
  return !/forventet|position|server/i.test(m[1] + k[1]);
}

/** webinar-puls: pulsDom får serverens forventede position fra positionDom — aldrig noget fra kroppen. */
export function pulsBrugerServerensUr(kilde: string): boolean {
  const k = utenKommentarer(kilde);
  if (!/const pos = positionDom\(a\.rd\.ur, serverMs\)/.test(k)) return false;
  const kald = k.match(/pulsDom\(([^;]*)\);/);
  if (!kald || !/pos\.forventetPosSek/.test(kald[1])) return false;
  return !/\b(p|body|h)\??\.forventet/.test(k) && !/body\??\.pos/.test(k);
}

describe("webinarMotor.guard 1 — positionen er kun serverens", () => {
  it("pulsens krop kender ingen «forventet»", () => {
    expect(kropKenderIngenForventet(laes(PULS_DOM))).toBe(true);
  });
  it("webinar-puls regner med serverens ur", () => {
    expect(pulsBrugerServerensUr(laes(PULS))).toBe(true);
  });
  it("webinar-rum læser kun t og handling af kroppen", () => {
    const k = utenKommentarer(laes(RUM));
    expect(k).toContain('const KENDTE_FELTER = ["t", "handling"] as const;');
    expect(k).toMatch(/const pos = positionDom\(rd\.ur, nuMs\)/);
  });
  it("MUTATION: en «forventet_pos_sek» i kroppen fanges", () => {
    const m = laes(PULS_DOM).replace('"korrigeret"] as const;', '"korrigeret", "forventet_pos_sek"] as const;');
    expect(m).not.toBe(laes(PULS_DOM));
    expect(kropKenderIngenForventet(m)).toBe(false);
  });
  it("MUTATION: pulsDom, der får klientens tal, fanges", () => {
    const m = laes(PULS).replace("serverMs, pos.forventetPosSek, a.rd.varighedSek)", "serverMs, p.forventet_pos_sek, a.rd.varighedSek)");
    expect(m).not.toBe(laes(PULS));
    expect(pulsBrugerServerensUr(m)).toBe(false);
  });
});

// ── 2. Persondata ────────────────────────────────────────────────────────────

/** Hvert `new Response(JSON.stringify(` står i en hjælper, der kalder findMotorForbudte på samme objekt. */
export function alleSvarGaarGennemVaernet(kilde: string): boolean {
  const k = utenKommentarer(kilde);
  const svar = [...k.matchAll(/new Response\(JSON\.stringify\(/g)].length;
  if (svar === 0) return false;
  // Hjælperen: function <navn>(...) { const ud = { motor: MOTOR_VERSION, ...body }; ... findMotorForbudte(ud) ... }
  const hjaelper = k.match(/function (json|svar)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
  if (!hjaelper) return false;
  const krop = hjaelper[2];
  if (!/findMotorForbudte\(ud\)/.test(krop)) return false;
  const iHjaelper = [...krop.matchAll(/new Response\(JSON\.stringify\(/g)].length;
  return iHjaelper === svar;
}

describe("webinarMotor.guard 2 — ingen persondata i svar", () => {
  for (const f of [TILMELD, RUM, PULS]) {
    it(`${f.split("/")[2]}: hvert JSON-svar går gennem findMotorForbudte`, () => {
      expect(alleSvarGaarGennemVaernet(laes(f))).toBe(true);
    });
  }
  it("listen dækker tilmeldingens personfelter og motorens egne", () => {
    for (const n of ["email", "navn", "fornavn", "ip_dagshash", "user_agent", "fbclid", "fbp", "fbc_cookie", "ga_client_id", "referrer", "origin", "join_link", "set_bits", "enhed_tilstand"]) {
      expect(MOTOR_FORBUDTE_NOEGLER as readonly string[]).toContain(n);
    }
    // Rummets faktiske svarnøgler er rene.
    expect(findMotorForbudte({ motor: "boardroom-1", server_nu_ms: 1, rum: "lobby", webinar: { slug: "a", titel: "b", vaert_navn: "c" }, embed: null, interaktioner: [{ id: "x", indhold: {} }], svar: [{ spoergsmaal: "?", svar: "!" }] })).toEqual([]);
  });
  it("MUTATION: et svar uden om hjælperen fanges", () => {
    const m = laes(RUM).replace("const ukendt = () => json(", 'const snyd = () => new Response(JSON.stringify({ email: "x" }));\nconst ukendt = () => json(');
    expect(alleSvarGaarGennemVaernet(m)).toBe(false);
  });
  it("MUTATION: en hjælper, der ikke dømmer, fanges", () => {
    const m = laes(PULS).replace("if (findMotorForbudte(ud).length > 0) {", "if (false) {");
    expect(m).not.toBe(laes(PULS));
    expect(alleSvarGaarGennemVaernet(m)).toBe(false);
  });
});

// ── 3. Logning ───────────────────────────────────────────────────────────────

/** Præcis ét console-kald i webinar-puls, og det står inde i udskrivFejlsum. */
export function logFrPuls(kilde: string): boolean {
  const k = utenKommentarer(kilde);
  const alle = [...k.matchAll(/\bconsole\.\w+\(/g)].length;
  const fn = k.match(/function udskrivFejlsum\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
  if (!fn) return false;
  const iFn = [...fn[1].matchAll(/\bconsole\.\w+\(/g)].length;
  return alle === 1 && iFn === 1;
}

describe("webinarMotor.guard 3 — ingen log pr. puls", () => {
  it("webinar-puls logger kun fejlsummen", () => {
    expect(logFrPuls(laes(PULS))).toBe(true);
  });
  it("de delte filer, pulsen trækker ind, logger aldrig", () => {
    const delte = [AUTH, HENT, ...readdirSync(resolve(ROD, "supabase/functions/_shared/webinarMotor")).map((f) => `supabase/functions/_shared/webinarMotor/${f}`)];
    for (const f of delte) expect(`${f}: ${/\bconsole\./.test(utenKommentarer(laes(f)))}`).toBe(`${f}: false`);
    // Og pulsen importerer kun dem (plus de to husets fælles uden log).
    const imports = [...laes(PULS).matchAll(/from "\.\.\/_shared\/([^"]+)"/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(["edgeFunctionAuth.ts", "kendteFelter.ts", "webinarDeltagerAuth.ts", "webinarMotor/interaktioner.ts", "webinarMotor/puls.ts", "webinarMotor/svar.ts", "webinarMotor/ur.ts", "webinarMotorHent.ts"]);
    expect(/\bconsole\./.test(utenKommentarer(laes("supabase/functions/_shared/kendteFelter.ts")))).toBe(false);
  });
  it("MUTATION: et console.log pr. kald fanges", () => {
    const m = laes(PULS).replace("const d = dom.deltager;", 'const d = dom.deltager;\n    console.log("puls", d.id);');
    expect(m).not.toBe(laes(PULS));
    expect(logFrPuls(m)).toBe(false);
  });
});

// ── 4. Tokenet ───────────────────────────────────────────────────────────────

export function tokenErHmac(kilde: string): boolean {
  const k = utenKommentarer(kilde);
  return /name: "HMAC", hash: "SHA-256"/.test(k)
    && /ensIKonstantTid\(await hmac\(nu, besked\), aftryk\)/.test(k)
    && !/aftryk\s*===|===\s*aftryk/.test(k);
}

/** Prædikatet står før første databasekald i Deno.serve-handleren (for POST-grenen). */
export function tokenFoerDatabasen(kilde: string): boolean {
  const k = utenKommentarer(kilde);
  const start = k.indexOf("Deno.serve(");
  const handler = k.slice(start);
  const post = handler.includes('req.method === "GET"') ? handler.slice(handler.indexOf("req.json()")) : handler;
  const verify = post.indexOf("verifyDeltagertoken(");
  const db = post.search(/\.(from|rpc)\(/);
  const hjaelpere = /hentRumData\(|hentEllerOpret\(|antalIRummet\(/;
  const foersteHjaelper = post.search(hjaelpere);
  return verify > 0 && (db === -1 || verify < db) && (foersteHjaelper === -1 || verify < foersteHjaelper);
}

function alleTsFiler(dir: string): string[] {
  const ud: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) ud.push(...alleTsFiler(p));
    else if (p.endsWith(".ts")) ud.push(p);
  }
  return ud;
}

describe("webinarMotor.guard 4 — tokenet er en HMAC", () => {
  it("HMAC-SHA256, konstant tid, ingen `===` på aftrykket", () => {
    expect(tokenErHmac(laes(TOKEN))).toBe(true);
  });
  it("secret'en læses ÉT sted", () => {
    const laesere = alleTsFiler(resolve(ROD, "supabase/functions")).filter((f) => /WEBINAR_JOIN_SECRET/.test(readFileSync(f, "utf8")));
    expect(laesere.map((f) => f.slice(ROD.length + 1))).toEqual([AUTH]);
    expect(laes(AUTH)).toMatch(/Deno\.env\.get\(JOIN_SECRET\)/);
  });
  it("intet token i en kolonne — kun versionen", () => {
    const m = laes(MIGRATION).replace(/--[^\n]*/g, "");
    expect(m).toMatch(/add column if not exists token_version/);
    expect(m).not.toMatch(/add column if not exists (join_)?token\b/);
    expect(m).not.toMatch(/\btoken_aftryk\b/);
  });
  it("verifyDeltagertoken står FØR første databasekald i rum og puls", () => {
    expect(tokenFoerDatabasen(laes(RUM))).toBe(true);
    expect(tokenFoerDatabasen(laes(PULS))).toBe(true);
  });
  it("MUTATION: en `===`-sammenligning fanges", () => {
    const m = laes(TOKEN).replace("if (ensIKonstantTid(await hmac(nu, besked), aftryk))", "if (b64u(await hmac(nu, besked)) === b)");
    expect(m).not.toBe(laes(TOKEN));
    expect(tokenErHmac(m)).toBe(false);
  });
  it("MUTATION: et opslag før tokenet fanges", () => {
    const m = laes(PULS).replace("    // ── TOKENET FØRST", '    await admin.from("webinar_tilmeldinger").select("id");\n    // ── TOKENET FØRST');
    expect(m).not.toBe(laes(PULS));
    expect(tokenFoerDatabasen(m)).toBe(false);
  });
});

// ── 5. Migrationen ───────────────────────────────────────────────────────────

/** Uden kommentarer og uden funktionskroppe ($$ … $$): ingen DROP/ALTER COLUMN/UPDATE/DELETE på noget eksisterende. */
export function kunTilfoejende(sql: string): boolean {
  const k = sql.replace(/--[^\n]*/g, "").replace(/\$\$[\s\S]*?\$\$/g, "$$$$");
  if (/\bdrop\s+(table|column|function|index)\b/i.test(k)) return false;
  if (/\balter\s+column\b/i.test(k)) return false;
  if (/^\s*(update|delete|truncate)\b/im.test(k)) return false;
  // Eneste ALTER TABLE'er på eksisterende tabeller: add column / add constraint / RLS på nye.
  for (const m of k.matchAll(/alter table public\.(\w+)\s+([a-z]+ [a-z]+)/gi)) {
    if (!/^(add column|add constraint|enable row)$/i.test(m[2])) return false;
  }
  // DROP POLICY/TRIGGER kun på de NYE tabeller (husets idempotente form).
  const nye = ["webinarer", "webinar_gentagelser", "webinar_sessioner", "webinar_interaktioner", "webinar_deltagelser", "webinar_pulser", "webinar_motor_log", "webinar_svar", "webinar_reaktioner", "webinar_spoergsmaal"];
  for (const m of k.matchAll(/drop trigger if exists \w+ on public\.(\w+)/gi)) if (!nye.includes(m[1])) return false;
  return true;
}

describe("webinarMotor.guard 5 — migrationen", () => {
  it("første linje er den, der scannes efter", () => {
    expect(laes(MIGRATION).split("\n")[0]).toBe("-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).");
  });
  it("tidsstemplet er efter alle andre migrationer — undtagen webinarmotorens egne senere skiver", () => {
    // Skive 3 (30/9) lagde 20260930160000_webinarmotor_skive3 og 20260930161000_webinar_motor_cron
    // EFTER skive 1's. Reglen er stadig, at skive 1 kommer efter alt, der ikke er motorens.
    const alle = readdirSync(resolve(ROD, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
    const efter = alle.slice(alle.indexOf(MIGRATION.split("/")[2]) + 1);
    expect(alle).toContain(MIGRATION.split("/")[2]);
    expect(efter).toEqual(["20260930160000_webinarmotor_skive3.sql", "20260930161000_webinar_motor_cron.sql"]);
  });
  it("kun tilføjende", () => {
    expect(kunTilfoejende(laes(MIGRATION))).toBe(true);
  });
  it("skrivefunktionerne er SECURITY INVOKER og kun service_role må kalde dem", () => {
    const m = laes(MIGRATION);
    expect(m).not.toMatch(/security definer/i);
    expect(m).toMatch(/revoke all on function public\.webinar_puls_skriv\([^)]*\) from public, anon, authenticated;/);
    expect(m).toMatch(/grant execute on function public\.webinar_puls_skriv\([^)]*\) to service_role;/);
    expect(m).toMatch(/revoke all on function public\.webinar_reaktion_tael\([^)]*\) from public, anon, authenticated;/);
  });
  it("ingen anon-politik; puls og log er service-role-only", () => {
    const m = laes(MIGRATION).replace(/--[^\n]*/g, "");
    expect(m).not.toMatch(/to anon\b/);
    const advisorListe = laes(MIGRATION).match(/Rådgivere LÆSER — men ikke[\s\S]*?array\[([^\]]*)\]/);
    expect(advisorListe).not.toBeNull();
    expect(advisorListe![1]).not.toMatch(/webinar_pulser|webinar_motor_log/);
  });
  it("MUTATION: en UPDATE af eksisterende rækker eller en DROP COLUMN fanges", () => {
    expect(kunTilfoejende(laes(MIGRATION) + "\nupdate public.webinar_tilmeldinger set state = 'x';")).toBe(false);
    expect(kunTilfoejende(laes(MIGRATION) + "\nalter table public.webinar_tilmeldinger drop column state;")).toBe(false);
    expect(kunTilfoejende(laes(MIGRATION) + "\nalter table public.webinar_tilmeldinger alter column state set not null;")).toBe(false);
  });
});

// ── 6. CI-værnet og config ───────────────────────────────────────────────────

describe("webinarMotor.guard 6 — prædikaterne og config", () => {
  it("de to prædikater står i check-edge-function-auth og bruges af functionerne", () => {
    const check = laes("scripts/check-edge-function-auth.ts");
    expect(check).toMatch(/verifyDeltagertoken\\s\*\\\(/);
    expect(check).toMatch(/verifyOffentligTilmelding\\s\*\\\(/);
    expect(utenKommentarer(laes(TILMELD))).toMatch(/await verifyOffentligTilmelding\(/);
    expect(utenKommentarer(laes(RUM))).toMatch(/await verifyDeltagertoken\(/);
    expect(utenKommentarer(laes(PULS))).toMatch(/await verifyDeltagertoken\(/);
  });
  it("config.toml: alle tre verify_jwt = false (seeren har ingen konto)", () => {
    const c = laes("supabase/config.toml");
    for (const f of ["webinar-tilmeld", "webinar-rum", "webinar-puls"]) {
      expect(c).toMatch(new RegExp(`\\[functions\\.${f}\\]\\s*\\n\\s*verify_jwt = false`));
    }
  });
  it("hvert svar bærer beviset `motor`", () => {
    for (const f of [TILMELD, RUM, PULS]) expect(laes(f)).toMatch(/\{ motor: MOTOR_VERSION, \.\.\.body \}/);
  });
});
