/**
 * Kildeværn for engangsimporten (udkast 19/9): fem domme der låser det
 * README'en lover, og som ingen enhedstest kan se — Bucket B-rækkefølgen,
 * tørkørsel som standard, at importen bruger WEBHOOKENS fletning (ellers
 * kan de to veje skabe dubletter og sænke procenten), config.toml, og at
 * webhooken ikke er rørt.
 *
 * Dom 6–9 (udkast 21/9, fremmøde for én session): afsendelsen til Klaviyo
 * ligger EFTER tørkørsels-returen og FØR begge upserts — send først, skriv
 * bagefter, så en afbrudt kørsel intet efterlader og blot køres igen — og
 * upserts springes over, når budgettet afbrød afsendelsen; den sker KUN bag
 * send_fremmoede; den går gennem sendHvisMail — ingen fetch, ingen kald(),
 * ingen Klaviyo-nøgle i functionen; og body'en er STRIKS (KENDTE_FELTER +
 * ukendteFelter).
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
    //
    // STRAMMET 22/9 (udkast-ewebinar-afmelding): dommen var «ordet kilde: findes
    // ingen steder i webhooken» — og den holdt kun, så længe webhooken skrev til
    // netop to tabeller. Afmeldingen sender nu `kilde: "webhook"` med til
    // klaviyo_afmeldinger, som ER et felt, den SKAL sætte. Præmissen er den
    // samme; dommen er nu skåret til DE TO UPSERTS, hvor feltet ikke må stå,
    // og den siger samtidig, at det ENESTE kilde: i filen er afmeldingens.
    const w = kode(WEBHOOK);
    const iLog = w.indexOf('.from("webinar_haendelser")');
    const iSlutUpserts = w.indexOf('onConflict: "ewebinar_id"');
    expect(iLog).toBeGreaterThan(-1);
    expect(iSlutUpserts).toBeGreaterThan(iLog);
    const upserts = w.slice(iLog, iSlutUpserts);
    expect(upserts).not.toMatch(/(^|[^_a-zA-Z])kilde\s*:/);
    expect(w).toContain("set_procent_kilde");
    // Det eneste kilde: i hele filen er afmeldingens — og det er ordret «webhook».
    const alleKilder = [...w.matchAll(/(?:^|[^_a-zA-Z])kilde\s*:\s*("[^"]*")?/g)].map((m) => m[1] ?? "(uden streng)");
    expect(alleKilder).toEqual(['"webhook"']);
  });

  it("dom 6: SEND FØRST, SKRIV BAGEFTER — afsendelsen efter tørkørsels-returen, FØR begge upserts, og upserts springes over, når afbrudt", () => {
    const k = laes(IMPORT);
    expect(sendFoerstSkrivBagefter(k)).toBe(true);
    // Afsendelsen flyttet efter upserts → falsk.
    const send = k.slice(k.indexOf("  let afbrudt = false;"), k.indexOf("  // 6. SKRIVNINGEN"));
    const efter = k.replace(send, "").replace("  rapport.skrevet = skrevet;", `${send}  rapport.skrevet = skrevet;`);
    expect(efter).toContain("sendHvisMail(admin, ");
    expect(sendFoerstSkrivBagefter(efter)).toBe(false);
    // Upserts uden afbrudt-værnet → falsk.
    expect(sendFoerstSkrivBagefter(k.replace("  if (afbrudt) return rapport;\n", ""))).toBe(false);
    // Flyttes kaldet op før tørkørsels-returen → falsk.
    expect(sendFoerstSkrivBagefter(k.replace("if (dryRun) return rapport;", "await sendHvisMail(admin, fremmoedeDomme[0].haendelse!);\n  if (dryRun) return rapport;"))).toBe(false);
    // Fjernes kaldet helt → falsk.
    expect(sendFoerstSkrivBagefter(k.replace(/sendHvisMail\(admin, /g, "intet(admin, "))).toBe(false);
    // Budgettet tjekkes FØR hver pulje, med de besluttede tal.
    expect(k).toContain("export const BUDGET_MS = 100_000;");
    expect(k).toContain("export const PULJE = 5;");
    expect(k.indexOf("if (Date.now() - start > BUDGET_MS) {")).toBeLessThan(k.indexOf("sendHvisMail(admin, "));
  });

  it("dom 7: der sendes KUN bag send_fremmoede — uden feltet er alt som før", () => {
    expect(kunBagSendFremmoede(laes(IMPORT))).toBe(true);
    const k = laes(IMPORT);
    expect(kunBagSendFremmoede(k.replace("const sendFremmoede = body.send_fremmoede === true;", "const sendFremmoede = true;"))).toBe(false);
    expect(kunBagSendFremmoede(k.replace("if (fremmoede !== null && fremmoedeRapport) {", "if (true) {"))).toBe(false);
    expect(kunBagSendFremmoede(k.replace("koerImport(admin, api, dryRun, fremmoede, start)", "koerImport(admin, api, dryRun, { sessionDato: \"2026-09-22\" }, start)"))).toBe(false);
  });

  it("dom 8: afsendelsen går gennem sendHvisMail — ingen fetch, ingen kald(), ingen Klaviyo-nøgle i functionen", () => {
    expect(kunGennemSendHvisMail(kode(IMPORT))).toBe(true);
    const k = kode(IMPORT);
    expect(kunGennemSendHvisMail(`${k}\nawait fetch("https://a.klaviyo.com/api/events/");`)).toBe(false);
    expect(kunGennemSendHvisMail(`${k}\nconst n = Deno.env.get("KLAVIYO_API_KEY");`)).toBe(false);
    expect(kunGennemSendHvisMail(k.replace(/sendHvisMail/g, "kald"))).toBe(false);
    expect(kunGennemSendHvisMail(k.replace(/sendHvisMail\(admin, /g, "intet(admin, "))).toBe(false);
  });

  it("dom 9: body'en er STRIKS — KENDTE_FELTER, ukendteFelter og req.json(), som bodyFelter.guard kræver", () => {
    expect(bodyenErStriks(laes(IMPORT))).toBe(true);
    const k = laes(IMPORT);
    expect(bodyenErStriks(k.replace(/ukendteFelter\(/g, "intet("))).toBe(false);
    expect(bodyenErStriks(k.replace("body = (await req.json())", "body = JSON.parse(tekst)"))).toBe(false);
    expect(bodyenErStriks(k.replace('"session_dato"]', '"session_dato", "alt_muligt"]'))).toBe(false);
  });
});

// ── Dom 6–9: rene dommere, prøvet på kopier med fejlen indsat ─────────────

/**
 * Send først, skriv bagefter: sendekaldet ligger efter tørkørsels-returen og
 * FØR begge upserts; mellem sendekaldet og upserts står afbrudt-værnet
 * `if (afbrudt) return rapport;` — og der findes præcis ét sendekald.
 */
export const sendFoerstSkrivBagefter = (k: string): boolean => {
  const send = k.indexOf("sendHvisMail(admin, ");
  if (send === -1 || send !== k.lastIndexOf("sendHvisMail(admin, ")) return false;
  const retur = k.indexOf("if (dryRun) return rapport;");
  const vaern = k.indexOf("if (afbrudt) return rapport;");
  const t = k.indexOf('.from("webinar_tilmeldinger").upsert(');
  const h = k.indexOf('.from("webinar_haendelser").upsert(');
  return retur !== -1 && vaern !== -1 && t !== -1 && h !== -1 &&
    send > retur && send < vaern && vaern < t && vaern < h;
};

/** Sendes der kun, når kalderen bad om det? Flaget læses af body'en, gives ind, og gate'er løkken. */
export const kunBagSendFremmoede = (k: string): boolean =>
  k.includes("const sendFremmoede = body.send_fremmoede === true;") &&
  k.includes("koerImport(admin, api, dryRun, fremmoede, start)") &&
  k.includes("sendFremmoede ? { sessionDato: body.session_dato as string } : null") &&
  k.includes("if (fremmoede !== null && fremmoedeRapport) {") &&
  k.indexOf("if (fremmoede !== null && fremmoedeRapport) {") < k.indexOf("sendHvisMail(admin, ");

/** Kun ÉN vej til Klaviyo: sendHvisMail fra klaviyoAfsendelse.ts. Kommentarer er strippet af kalderen. */
export const kunGennemSendHvisMail = (k: string): boolean =>
  k.includes('import { sendHvisMail } from "../_shared/klaviyoAfsendelse.ts";') &&
  k.includes("sendHvisMail(admin, ") &&
  !/\bfetch\s*\(/.test(k) &&
  !/\bkald\s*\(/.test(k) &&
  !/KLAVIYO/.test(k) &&
  !/a\.klaviyo\.com/.test(k);

/** bodyFelter.guard's STRIKS-regel, som den læser den: req.json() + ukendteFelter + ukendteFelterBesked — og præcis fire kendte felter. */
export const bodyenErStriks = (k: string): boolean =>
  k.includes("body = (await req.json())") &&
  k.includes("ukendteFelter(body, KENDTE_FELTER)") &&
  k.includes("ukendteFelterBesked(") &&
  k.includes('export const KENDTE_FELTER = ["maal", "dry_run", "send_fremmoede", "session_dato"] as const;');
