/**
 * Kildeværn for lag 3 (udkast 19/9): seks domme, der låser det, ingen
 * enhedstest kan se — rækkefølgen i functionen, at tørkørsel er standard,
 * at sporet skrives på hver eneste vej, at kladde tvinges, at A's fil ikke
 * er rørt, og at migrationen ikke er kørt.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
/** Kun koden: et filhoved, der NÆVNER noget, tæller ikke som at gøre det. */
const kode = (sti: string) => laes(sti).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const FUNKTION = "supabase/functions/klaviyo-motor/index.ts";
const MOTOR = "supabase/functions/_shared/klaviyoMotor.ts";
const DOM = "supabase/functions/_shared/klaviyoMotorDom.ts";
const CONFIG = "supabase/config.toml";
// 210000, ikke 200000: A tog 200000 til klaviyo_haendelser, mens dette blev
// skrevet. To migrationer med samme tidsstempel har ingen bestemt rækkefølge.
const MIGRATION = "supabase/migrations/20260919210000_klaviyo_spor.sql";

describe("klaviyoMotor.guard", () => {
  it("1. Bucket A: authenticateUser → has_role → FØRST derefter service role", () => {
    const k = kode(FUNKTION);
    const auth = k.indexOf("await authenticateUser(req)");
    const rolle = k.indexOf('callerClient.rpc("has_role"');
    const klient = k.indexOf("createClient(supabaseUrl, serviceKey)");
    expect(auth).toBeGreaterThan(0);
    expect(rolle).toBeGreaterThan(auth);
    expect(klient).toBeGreaterThan(rolle);
    expect(k).toContain('return json(403, { error: "kun rådgivere" })');
  });

  it("2. tørkørsel er standard — kun body.skriv === true sender noget", () => {
    const k = kode(FUNKTION);
    expect(k).toContain("const skriv = body.skriv === true;");
    // Motoren må aldrig kalde Klaviyo uden at have set valg.skriv === true.
    const m = kode(MOTOR);
    for (const f of ["opretSkabelon", "retSkabelon", "retFlowmail", "opretFlow"]) {
      const krop = m.slice(m.indexOf(`export async function ${f}`), m.indexOf(`export async function ${f}`) + 3000);
      expect(krop, `${f} mangler tørkørsels-porten`).toContain("valg.skriv !== true");
    }
  });

  it("3. hver skrivning skriver et spor med FØR, sendt og EFTER", () => {
    const m = kode(MOTOR);
    // Ét sted skrives sporet; alle veje går gennem afslut().
    expect(m).toContain("async function afslut");
    expect(m).toContain("await skrivSpor(admin, post)");
    // Og sporet bærer de tre tilstande.
    for (const felt of ["foer", "sendt", "efter", "aendringer", "kladde_rettelser", "udfoert_af"]) {
      expect(m, `sporet mangler ${felt}`).toContain(`${felt}:`);
    }
    // Også læsninger spores — fra functionen.
    expect(kode(FUNKTION)).toContain("await skrivSpor(admin, {");
  });

  it("4. intet går live: opretFlow tvinger kladde FØR body'en bygges", () => {
    const m = kode(MOTOR);
    const krop = m.slice(m.indexOf("export async function opretFlow"));
    const tving = krop.indexOf("tvingKladde(input.definition)");
    const body = krop.indexOf("const body =");
    expect(tving).toBeGreaterThan(0);
    expect(body).toBeGreaterThan(tving);
    // Og en uventet status fra Klaviyo skal råbes op om, ikke sluges.
    expect(krop).toContain("ADVARSEL");
  });

  it("5. A's fil er URØRT — vi importerer den, vi ændrer den ikke", () => {
    const f = kode(FUNKTION);
    expect(f).toContain('from "../_shared/klaviyo.ts"');
    // Motoren må importere TYPER fra A (én sandhed om udfaldene), men ingen
    // VÆRDIER: den tager kaldet ind som en grænseflade, så lag 3 kan prøves
    // uden at lag 1 kører. `import type` forsvinder ved transpilering.
    const m = kode(MOTOR);
    expect(m).toContain('import type { KlaviyoSpor as KlaviyoSporFraA, KlaviyoSvar, KlaviyoUdfald } from "./klaviyo.ts"');
    expect(m).not.toMatch(/^import \{[^}]*\} from "\.\/klaviyo\.ts"/m);
    expect(m).toContain("export interface KlaviyoKlient");
  });

  it("6. config.toml har verify_jwt = true, og migrationen er IKKE KØRT", () => {
    expect(laes(CONFIG)).toMatch(/\[functions\.klaviyo-motor\]\s*\n\s*verify_jwt = true/);
    const sql = laes(MIGRATION);
    expect(sql.startsWith("-- IKKE KØRT.")).toBe(true);
    // Sporet må ikke kunne rettes: ingen UPDATE- eller DELETE-politik.
    expect(sql).not.toMatch(/for update to authenticated/);
    expect(sql).not.toMatch(/for delete to authenticated/);
    expect(sql).toContain("udfoert_af    uuid not null");
    expect(/security definer/i.test(sql)).toBe(false);
  });
});

describe("klaviyoMotor.guard — dommene fanger fejlen på en kopi", () => {
  it("1. service role før rollen → falsk", () => {
    const k = kode(FUNKTION);
    const byttet = k.replace("const admin = createClient(supabaseUrl, serviceKey);", "")
      .replace("const auth = await authenticateUser(req);", "const admin = createClient(supabaseUrl, serviceKey);\n  const auth = await authenticateUser(req);");
    expect(byttet).not.toBe(k);
    const auth = byttet.indexOf("await authenticateUser(req)");
    expect(byttet.indexOf("createClient(supabaseUrl, serviceKey)")).toBeLessThan(auth);
  });

  it("2. en skrivefunktion uden tørkørsels-port → falsk", () => {
    const m = kode(MOTOR);
    const uden = m.replace(/valg\.skriv !== true/g, "false");
    expect(uden).not.toBe(m);
    expect(uden.includes("valg.skriv !== true")).toBe(false);
  });

  it("4. kladde-tvangen fjernet → falsk", () => {
    const m = kode(MOTOR);
    const uden = m.replace("tvingKladde(input.definition)", "({ vaerdi: input.definition, rettede: [] })");
    expect(uden).not.toBe(m);
    expect(uden.includes("tvingKladde(input.definition)")).toBe(false);
  });
});
