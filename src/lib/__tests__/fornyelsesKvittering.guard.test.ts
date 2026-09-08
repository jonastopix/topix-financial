import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Driftværn for fornyelseskvitteringen (8/9): mailen sendes i
// stripe-webhookens fornyelsesgren EFTER at perioden er skrevet og
// contract_end_date er sat — aldrig før — og den må ALDRIG rulle
// betalingen tilbage. Værnet læser kilden (edge functions er Deno og kan
// ikke importeres af vitest) og låser rækkefølgen og kast-friheden.
// Kilde-læsning som varselStempel.guard.test.ts.

const STI = "supabase/functions/stripe-webhook/index.ts";
const kilde = readFileSync(resolve(process.cwd(), STI), "utf8");
const kode = kilde
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
  .replace(/\/\/[^\n]*/g, "");

/** Fornyelsesgrenen: fra `art === "fornyelse"` til indgangsgrenen begynder. */
function fornyelsesGren(): string {
  const start = kode.indexOf('session.metadata?.art === "fornyelse"');
  const slut = kode.indexOf('session.metadata?.art === "indgang"', start);
  expect(start, "fornyelsesgrenen mangler").toBeGreaterThan(-1);
  expect(slut, "indgangsgrenen mangler").toBeGreaterThan(start);
  return kode.slice(start, slut);
}

describe("fornyelseskvitteringen sendes efter registreringen og kan ikke koste den", () => {
  it("kvitteringen kaldes i hovedvejen EFTER perioden er indsat og contract_end_date er sat", () => {
    const gren = fornyelsesGren();
    const periode = gren.indexOf('from("company_perioder").insert(');
    const dato = gren.indexOf("contract_end_date: periode_slut");
    const kvittering = gren.lastIndexOf("sendFornyelseskvittering(");
    expect(periode).toBeGreaterThan(-1);
    expect(dato).toBeGreaterThan(periode);
    expect(kvittering, "kvitteringen skal kaldes i hovedvejen").toBeGreaterThan(dato);
  });

  it("kvitteringen kaldes også i begge gensendelsesveje, så en fejlet første mail får et forsøg til", () => {
    const gren = fornyelsesGren();
    const kald = gren.split("sendFornyelseskvittering(").length - 1;
    expect(kald).toBe(3);
    // den ene gensendelsesvej står FØR «allerede behandlet»-svaret, den anden efter «fuldførte halvt udført arbejde»
    expect(gren.indexOf("sendFornyelseskvittering(")).toBeLessThan(gren.indexOf('skipped: "already_processed"'));
  });

  it("hjælperen kaster aldrig: hele kroppen ligger i try/catch, og der er intet throw", () => {
    const start = kode.indexOf("async function sendFornyelseskvittering(");
    expect(start).toBeGreaterThan(-1);
    const slutFn = kode.indexOf("\n}\n", start);
    const krop = kode.slice(start, slutFn);
    expect(krop).toMatch(/try \{/);
    expect(krop).toMatch(/\} catch \(err\) \{/);
    expect(krop).not.toMatch(/\bthrow\b/);
  });

  it("idempotens: nøglen er sessionens id, sendes som idempotencyKey, og loggen spørges om 'sent' først", () => {
    const start = kode.indexOf("async function sendFornyelseskvittering(");
    const krop = kode.slice(start, kode.indexOf("\n}\n", start));
    expect(krop).toContain("`fornyelse-kvittering-${args.sessionId}`");
    expect(krop).toMatch(/idempotencyKey:\s*noegle/);
    expect(krop).toMatch(/from\("email_send_log"\)[\s\S]{0,200}\.eq\("message_id", noegle\)[\s\S]{0,80}\.eq\("status", "sent"\)/);
  });
});
