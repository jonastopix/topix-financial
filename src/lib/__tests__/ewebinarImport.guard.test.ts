/**
 * Kildeværn for engangsimporten (udkast 19/9): fem domme der låser det
 * README'en lover, og som ingen enhedstest kan se — Bucket B-rækkefølgen,
 * tørkørsel som standard, at importen bruger WEBHOOKENS fletning (ellers
 * kan de to veje skabe dubletter og sænke procenten), config.toml, og at
 * webhooken ikke er rørt.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");

/** Kun koden: kommentarer strippes, så et filhoved der NÆVNER «Deno.» ikke tæller som brug af den (check-edge-function-auth-mønstret). */
const kode = (sti: string) => laes(sti).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const IMPORT = "supabase/functions/ewebinar-import/index.ts";
const API = "supabase/functions/_shared/ewebinarApi.ts";
const DOM = "supabase/functions/_shared/webinarImport.ts";
const WEBHOOK = "supabase/functions/ewebinar-webhook/index.ts";
const CONFIG = "supabase/config.toml";

describe("ewebinarImport.guard", () => {
  it("dom 1: Bucket B — authenticateServiceRole FØR nøglen læses og FØR service-role-klienten", () => {
    const k = laes(IMPORT);
    const auth = k.indexOf("const auth = authenticateServiceRole(req)");
    const noegle = k.indexOf("hentNoegle(miljoe)");
    const klient = k.indexOf("createClient(supabaseUrl, serviceKey)");
    expect(auth).toBeGreaterThan(0);
    expect(noegle).toBeGreaterThan(auth);
    expect(klient).toBeGreaterThan(auth);
    expect(k).toContain("if (auth !== true) return auth;");
  });

  it("dom 2: tørkørsel er standard — kun et eksplicit dry_run: false skriver", () => {
    const k = laes(IMPORT);
    expect(k).toContain("const dryRun = body.dry_run !== false;");
    // Skrivningen ligger EFTER den tidlige retur i tørkørsel.
    const retur = k.indexOf("if (dryRun) return rapport;");
    expect(retur).toBeGreaterThan(0);
    expect(k.indexOf('.from("webinar_tilmeldinger").upsert(')).toBeGreaterThan(retur);
    expect(k.indexOf('.from("webinar_haendelser").upsert(')).toBeGreaterThan(retur);
  });

  it("dom 3: importen bruger WEBHOOKENS fletning og plukker — ikke sine egne", () => {
    const imp = laes(IMPORT);
    expect(imp).toContain('from "../_shared/webinarDom.ts"');
    expect(imp).toContain("fletTilmelding(foer, t)");
    expect(imp).toContain("plukRestRegistrant(raa)");
    // Oversættelsen kalder webhookens plukker; den har ingen egen kopi.
    const dom = laes(DOM);
    expect(dom).toContain('import { plukTilmelding');
    expect(dom).not.toMatch(/function plukTilmelding\s*\(/);
    // Nøglen der forhindrer dubletter er registrantens id.
    expect(imp).toContain('onConflict: "ewebinar_id"');
  });

  it("dom 4: nøglen har et navn og en pæn 503 — og basen er den målte /v2", () => {
    const api = laes(API);
    const imp = laes(IMPORT);
    // Env-opslaget bor i functionen; klienten er Deno-fri, så vitest kan følge den.
    expect(imp).toContain('Deno.env.get(navn)');
    expect(imp).toContain("hentNoegle(miljoe)");
    expect(kode(API)).not.toContain("Deno.");
    expect(api).toContain('env("EWEBINAR_API_KEY")');
    expect(api).toMatch(/EwebinarFejl\(503, NOEGLE_MANGLER_BESKED\)/);
    expect(api).toContain('EWEBINAR_BASE_STANDARD = "https://api.ewebinar.com/v2"');
    expect(laes(IMPORT)).toMatch(/if \(err instanceof EwebinarFejl\)[\s\S]{0,200}json\(err\.status/);
  });

  it("dom 5: config.toml har verify_jwt = true (Bucket B), og webhooken er URØRT", () => {
    expect(laes(CONFIG)).toMatch(/\[functions\.ewebinar-import\]\s*\n\s*verify_jwt = true/);
    // Webhookens egen blok står stadig på false — importen ændrer den ikke.
    expect(laes(CONFIG)).toMatch(/\[functions\.ewebinar-webhook\]\s*\n\s*verify_jwt = false/);
    // Webhooken sætter ikke FELTET kilde i sine upserts: migrationens default ('webhook')
    // bærer den, så webhooken ikke skal ændres. (set_procent_kilde er et andet felt og står der.)
    const w = kode(WEBHOOK);
    expect(w).not.toMatch(/(^|[^_a-zA-Z])kilde\s*:/);
    expect(w).toContain("set_procent_kilde");
  });
});
