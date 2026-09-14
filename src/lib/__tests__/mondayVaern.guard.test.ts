import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for rækkefølgen i monday-webhook/index.ts (14/9-2026).
// Værnet selv er en ren funktion (mondayVaern.test.ts); det der IKKE kan
// testes uden HTTP er rækkefølgen i handleren, og den bærer to løfter:
//   1. Challenge-kaldet (body.challenge) svares FØR værnet og uden
//      hemmelighed — Monday sender det ved oprettelse af webhooken, og
//      kommentaren i kilden siger «must be publicly reachable». Læses
//      header, URL eller env før challenge-svaret, er løftet brudt.
//   2. `verifyMondayJwt(` står stadig i index.ts, så CI-værnet
//      (scripts/check-edge-function-auth.ts, prædikatet «verifyMondayJwt()»)
//      matcher uden at scriptet ændres. Flyttes kaldet helt ind i _shared,
//      mister filen sit prædikat, og CI'en fejler først på næste push.
// Kilde-læsning frem for import: index.ts kalder Deno.serve ved import og
// kan ikke lastes i vitest (forsidenKaster.guard-mønstret).

const KILDE = resolve(process.cwd(), "supabase/functions/monday-webhook/index.ts");
const kilde = readFileSync(KILDE, "utf8");

/** Den ordrette challenge-gren — uændret fra før 14/9. */
const CHALLENGE_BLOK = `    if (body.challenge) {
      console.log("Monday webhook challenge received");
      return jsonResponse({ challenge: body.challenge });
    }`;

describe("monday-webhook/index.ts — challenge svares før værnet, uden hemmelighed", () => {
  const challengeVed = kilde.indexOf(CHALLENGE_BLOK);
  const vaernVed = kilde.indexOf("afgoerMondayVaern(");

  it("challenge-grenen står ordret i filen", () => {
    expect(challengeVed).toBeGreaterThan(-1);
  });

  it("værnet kaldes, og først EFTER challenge-grenen", () => {
    expect(vaernVed).toBeGreaterThan(-1);
    expect(vaernVed).toBeGreaterThan(challengeVed);
  });

  it("intet af det værnet bruger læses før challenge-svaret: ingen header, ingen URL, ingen env", () => {
    const foer = kilde.slice(kilde.indexOf("Deno.serve("), challengeVed);
    expect(foer).not.toMatch(/req\.headers\.get\(/);
    expect(foer).not.toMatch(/new URL\(/);
    expect(foer).not.toMatch(/Deno\.env\.get\(/);
    // Det eneste der læses før challenge: method og body.
    expect(foer).toMatch(/req\.method === "OPTIONS"/);
    expect(foer).toMatch(/await req\.json\(\)/);
  });

  it("challenge-grenen er uden værn: intet afvisningssvar mellem req.json() og challenge-svaret", () => {
    const mellem = kilde.slice(kilde.indexOf("await req.json()"), challengeVed);
    expect(mellem).not.toMatch(/401|Unauthorized|afgoerMondayVaern/);
  });
});

describe("monday-webhook/index.ts — CI-prædikatet og de to veje", () => {
  it("`verifyMondayJwt(` kaldes i filen (prædikatet i check-edge-function-auth.ts:133)", () => {
    // Samme regex som scriptet, på kilden uden kommentarer — så en kommentar ikke bærer prædikatet.
    const udenKommentarer = kilde.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(udenKommentarer).toMatch(/\bverifyMondayJwt\s*\(/);
  });

  it("definitionen af verifyMondayJwt er flyttet til _shared og findes ikke længere lokalt", () => {
    expect(kilde).not.toMatch(/async function verifyMondayJwt/);
    expect(kilde).toMatch(/from "\.\.\/_shared\/mondayVaern\.ts"/);
  });

  it("URL-parameteren og secret-navnet læses via konstanterne — ikke som løse strenge", () => {
    expect(kilde).toMatch(/searchParams\.get\(MONDAY_URL_PARAMETER\)/);
    expect(kilde).toMatch(/Deno\.env\.get\(MONDAY_WEBHOOK_SECRET_NAVN\)/);
    expect(kilde).toMatch(/Deno\.env\.get\("MONDAY_SIGNING_SECRET"\)/);
  });

  it("værnets afvisning svarer med dommens status og { error }, og logger på dommens niveau", () => {
    expect(kilde).toMatch(/console\[dom\.logNiveau\]\(dom\.logTekst\)/);
    expect(kilde).toMatch(/jsonResponse\(\{ error: dom\.fejl \}, dom\.status\)/);
  });
});
