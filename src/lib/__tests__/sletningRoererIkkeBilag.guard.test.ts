import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Driftværn for slettefunktionen (8/9): (b) — vores eget bilag — må ALDRIG
// røres. company_perioder, company_traek og company_betalingslink er
// ON DELETE CASCADE mod companies, og session_bookings.user_id CASCADE mod
// auth.users; det var grunden til at hardDeleteCompany ikke kunne bruges
// på Alina. Værnet læser funktionens kilde (edge functions er Deno og kan
// ikke importeres af vitest) og låser tre ting:
//   1) ingen af (b)-tabellerne står i en .from("…") efterfulgt af
//      .delete( i samme kæde;
//   2) companies slettes aldrig (.delete på companies findes ikke) — rækken
//      tømmes med UPDATE;
//   3) UPDATE'en af companies rører ikke Stripe-felterne eller
//      kontraktperioden, og bærer stemplet data_slettet_at.
// Kilde-læsning som varselStempel.guard.test.ts.

const STI = "supabase/functions/slet-medlemsdata-cron/index.ts";
const kilde = readFileSync(resolve(process.cwd(), STI), "utf8");

/** Fjern kommentarer, så et navn i historien ikke tæller — linjebevarende. */
const kode = kilde
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
  .replace(/\/\/[^\n]*/g, "");

const BILAG = ["company_perioder", "company_traek", "company_betalingslink", "session_bookings"];

/** Alle query-kæder der starter med .from("<tabel>") — kæden løber til næste .from( eller til en tom linje. */
function kaederFor(tabel: string): string[] {
  const ud: string[] = [];
  const re = new RegExp(`\\.from\\(\\s*["'\`]${tabel}["'\`]`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(kode))) {
    const rest = kode.slice(m.index + 1);
    const naesteFrom = rest.search(/\.from\(/);
    const tomLinje = rest.search(/\n\s*\n/);
    const slut = Math.min(...[naesteFrom, tomLinje].filter((n) => n >= 0), rest.length);
    ud.push(rest.slice(0, slut));
  }
  return ud;
}

describe("slettefunktionen rører ikke (b) — vores eget bilag", () => {
  it("bilagstabellerne står i ROERES_ALDRIG og har ingen delete-kæde", () => {
    for (const t of BILAG) {
      expect(kode, `${t} mangler i ROERES_ALDRIG`).toMatch(new RegExp(`ROERES_ALDRIG[\\s\\S]{0,400}["']${t}["']`));
      for (const kaede of kaederFor(t)) {
        expect(kaede, `${t}: delete i kæden:\n${kaede}`).not.toMatch(/\.delete\s*\(/);
        expect(kaede, `${t}: update i kæden:\n${kaede}`).not.toMatch(/\.update\s*\(/);
      }
    }
  });

  it("companies slettes aldrig — kun UPDATE, og den rører ikke Stripe eller kontraktperioden", () => {
    const kaeder = kaederFor("companies");
    expect(kaeder.length).toBeGreaterThan(0);
    for (const kaede of kaeder) expect(kaede, kaede).not.toMatch(/\.delete\s*\(/);
    const updates = kaeder.filter((k) => /\.update\s*\(/.test(k));
    expect(updates.length, "der skal findes én UPDATE der tømmer rækken og stempler").toBeGreaterThan(0);
    for (const u of updates) {
      for (const felt of ["stripe_customer_id", "stripe_subscription_id", "contract_start_date", "contract_end_date", "indgangspris_oere", "fornyelsespris_oere", "name", "cvr_number", "offboarding_requested_at"]) {
        expect(u, `UPDATE rører ${felt}`).not.toMatch(new RegExp(`\\b${felt}\\s*:`));
      }
      expect(u).toMatch(/data_slettet_at/);
      expect(u, "UPDATE'en skal være gated på at rækken ikke allerede er stemplet").toMatch(/\.is\(\s*["']data_slettet_at["']\s*,\s*null\s*\)/);
    }
  });

  it("dommen kommer fra motoren, ikke fra en lokal regel", () => {
    expect(kode).toMatch(/import\s*\{[^}]*afgoerSletning[^}]*\}\s*from\s*["']\.\.\/_shared\/sletning\.ts["']/);
    expect(kode).toMatch(/afgoerSletning\s*\(/);
    expect(kode, "ingen egen dage-regning på slutdato i funktionen").not.toMatch(/interval|\* 86_?400_?000/);
  });

  it("tørkørsel er standard: kun body.dry_run === false sletter", () => {
    expect(kode).toMatch(/let\s+toerKoersel\s*=\s*true/);
    expect(kode).toMatch(/dry_run\s*===\s*false/);
  });
});
