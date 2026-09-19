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

  it("dom 4: rådgiveren ser eWebinars måling ved siden af ansøgerens svar — på siden og i listens fold, hentet i ét opslag", () => {
    expect(laes(HOOK)).toContain("hentWebinarTilmeldingerForEmails(");
    const detalje = laes(DETALJE);
    expect(detalje).toContain("webinarLinje(a.webinar, nu)");
    expect(detalje).toContain("webinarModSvar(a.set_webinar, a.webinar, nu)");
    expect(laes(LISTE)).toContain("webinarLinje(a.webinar, new Date())");
  });
});
