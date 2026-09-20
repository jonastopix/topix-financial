/**
 * Kildeværn for eWebinar-webhooken (udkast 19/9): fire domme der låser det
 * README'en lover, og som ingen enhedstest kan se — rækkefølgen i
 * functionen, config.toml, CI-værnets prædikat og at fladen viser målingen.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");

const FUNKTION = "supabase/functions/ewebinar-webhook/index.ts";
const CONFIG = "supabase/config.toml";
const VAERN = "scripts/check-edge-function-auth.ts";
const HOOK = "src/hooks/ansoegninger.ts";
const DETALJE = "src/components/hjemmebane/ansoegninger/AnsoegningView.tsx";
const LISTE = "src/components/hjemmebane/ansoegninger/AnsoegningslisteView.tsx";
const HAENDELSER = "supabase/functions/_shared/webinarHaendelser.ts";
const DOM_DENO = "supabase/functions/_shared/webinarDom.ts";
const DOM_WEB = "src/lib/webinarDom.ts";

/**
 * Dom 5–7 (20/9, recon-platformsiden): tre huller, der hver var én linje, og
 * som ingen enhedstest kunne se, fordi prøverne låste dem fast som ønsket.
 *   5. Loggen siger kun «sendt», når det ER sendt — udfaldet læses, ikke antages.
 *   6. `byggFremmoede` taber aldrig en hændelse tavst: ingen `return null` på mail.
 *   7. «Mødte ikke op» kan først være sandt efter sessionen — tiden før ordet,
 *      i BEGGE kopier af dommen.
 */
export const loggenSigerSandheden = (k: string): boolean =>
  /const a = await sendHvisMail\(admin, haendelse\);/.test(k) &&
  /if \(a\.sendt\) \{/.test(k) &&
  k.includes("fremmoede IKKE sendt (${a.spor.udfald})") &&
  k.includes("fremmoede_sendt: fremmoedeSendt") &&
  // Ingen ubetinget «sendt»-linje lige efter kaldet.
  !/await sendHvisMail\(admin, haendelse\);\s*\n\s*console\.log/.test(k);

export const ingenTavsNull = (k: string): boolean => {
  const start = k.indexOf("export function byggFremmoede(");
  const slut = k.indexOf("return {", start);
  const krop = start >= 0 && slut > start ? k.slice(start, slut) : "";
  return krop !== "" && !/if \(mail === null\) return null/.test(krop) && /brugbarMail\(i\.email\) \?\?/.test(krop);
};

export const tidenFoerOrdet = (k: string): boolean =>
  /const fremtid = t\.session_tid !== null && Date\.parse\(t\.session_tid\) > nu\.getTime\(\);\s*\n\s*if \(state === "missed" \|\| state === "notjoined"\) return fremtid \? "tilmeldt" : "moedte_ikke";/.test(k);

describe("ewebinarWebhook.guard", () => {
  it("dom 1: den RÅ body (req.text) verificeres FØR JSON.parse og FØR createClient — og der genserialiseres ikke", () => {
    const k = laes(FUNKTION);
    const raa = k.indexOf("await req.text()");
    const verify = k.indexOf("await verifyEwebinarSignature(");
    const parse = k.indexOf("JSON.parse(rawBody)");
    const klient = k.indexOf("createClient(Deno.env.get(\"SUPABASE_URL\")");
    expect(raa).toBeGreaterThan(0);
    expect(verify).toBeGreaterThan(raa);
    expect(parse).toBeGreaterThan(verify);
    expect(klient).toBeGreaterThan(parse);
    expect(k).not.toMatch(/JSON\.stringify\(event/);
    expect(k).toContain('return json(401, { error: "invalid signature" })');
  });

  it("dom 2: config.toml har blokken med verify_jwt = false (Bucket C — afsenderen er eWebinar, ingen JWT)", () => {
    expect(laes(CONFIG)).toMatch(/\[functions\.ewebinar-webhook\]\s*\n\s*verify_jwt = false/);
  });

  it("dom 3: CI-værnet kender verifyEwebinarSignature som auth-prædikat", () => {
    expect(laes(VAERN)).toContain('{ name: "verifyEwebinarSignature()",');
  });

  it("dom 5: loggen siger kun «sendt», når det er sendt — udfaldet læses", () => {
    const k = laes(FUNKTION);
    expect(loggenSigerSandheden(k)).toBe(true);
    // Den gamle form: kald, og så «sendt» uanset.
    const gammel = k.replace("const a = await sendHvisMail(admin, haendelse);", "await sendHvisMail(admin, haendelse);\n    console.log(`sendt`);");
    expect(loggenSigerSandheden(gammel)).toBe(false);
    expect(loggenSigerSandheden(k.replace("fremmoede_sendt: fremmoedeSendt", "x: 1"))).toBe(false);
  });

  it("dom 6: byggFremmoede taber aldrig en hændelse tavst på mailen", () => {
    const k = laes(HAENDELSER);
    expect(ingenTavsNull(k)).toBe(true);
    expect(ingenTavsNull(k.replace("const mail = brugbarMail(i.email) ?? (typeof i.email === \"string\" ? i.email : \"\");", "const mail = brugbarMail(i.email);\n  if (mail === null) return null;"))).toBe(false);
  });

  it("dom 7: «mødte ikke op» kan først være sandt efter sessionen — i begge kopier af dommen", () => {
    for (const sti of [DOM_DENO, DOM_WEB]) {
      const k = laes(sti);
      expect(tidenFoerOrdet(k), sti).toBe(true);
      expect(tidenFoerOrdet(k.replace('return fremtid ? "tilmeldt" : "moedte_ikke";', 'return "moedte_ikke";')), sti).toBe(false);
    }
  });

  it("dom 4: rådgiveren ser eWebinars måling ved siden af ansøgerens svar — på siden og i listens fold, hentet i ét opslag", () => {
    expect(laes(HOOK)).toContain("hentWebinarTilmeldingerForEmails(");
    const detalje = laes(DETALJE);
    expect(detalje).toContain("webinarLinje(a.webinar, nu)");
    expect(detalje).toContain("webinarModSvar(a.set_webinar, a.webinar, nu)");
    expect(laes(LISTE)).toContain("webinarLinje(a.webinar, new Date())");
  });
});
