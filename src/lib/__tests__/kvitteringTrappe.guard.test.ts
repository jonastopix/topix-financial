import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afgoerSending, erUndtagetFraDagsreglen, TRAPPER_UDEN_DAGSREGEL } from "@/lib/rykkerkoe";
import * as koeDeno from "../../../supabase/functions/_shared/rykkerkoe.ts";
import { kbhTilUtc } from "@/lib/hverdage";

// Kvitteringstrappen «indsendt» (HASTER 18/9): migrationen, dagsreglen og loftet.
const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");
const CRON = "supabase/functions/ansoegning-rykker-cron/index.ts";
const GEM = "supabase/functions/ansoegning-gem/index.ts";
const MIG = "supabase/migrations/20260919100000_planlagte_haendelser_trappe_indsendt.sql";

export const cronenUndtagerKvitteringen = (k: string): boolean =>
  k.includes('.not("trappe", "in", `(${TRAPPER_UDEN_DAGSREGEL.join(",")})`)') && k.includes("harFaaet.has(email)),\n        trappe: raekke.trappe,") &&
  /\.eq\("status", "sendt"\)\s*\.not\("trappe", "in"[^\n]*\n\s*\.gte\("udfoert_at", fra\)/.test(k);
export const loftetEr300 = (k: string): boolean => k.includes("const OPRET_PR_TIME_I_ALT = 300;");
export const migrationenHarAlleOtte = (k: string): boolean =>
  k.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n").includes("check (trappe in ('kladde', 'indsendt', 'indkaldt', 'booket', 'aftalegrundlag', 'pause', 'venteplads', 'afslag'))");

const planlagt = kbhTilUtc("2026-09-18", 10, 0);
const nu = kbhTilUtc("2026-09-18", 11, 0);

describe("dagsreglen — kvitteringen er undtaget", () => {
  it("TRAPPER_UDEN_DAGSREGEL = [indsendt]; erUndtagetFraDagsreglen", () => {
    expect([...TRAPPER_UDEN_DAGSREGEL]).toEqual(["indsendt"]);
    expect(erUndtagetFraDagsreglen("indsendt")).toBe(true);
    expect(erUndtagetFraDagsreglen("indkaldt")).toBe(false);
    expect(erUndtagetFraDagsreglen(undefined)).toBe(false);
  });
  it("kvitteringen går, selv om personen fik en mail i dag; indkaldelsen (og en række uden trappe) udskydes som før", () => {
    expect(afgoerSending({ nu, planlagtTil: planlagt, handling: "send_mail", modtagerHarFaaetMailIDag: true, trappe: "indsendt" })).toEqual({ ok: true });
    expect(afgoerSending({ nu, planlagtTil: planlagt, handling: "send_mail", modtagerHarFaaetMailIDag: true, trappe: "indkaldt" })).toEqual({ ok: false, grund: "allerede_mail_i_dag", udskydTil: kbhTilUtc("2026-09-21", 10, 0) });
    expect(afgoerSending({ nu, planlagtTil: planlagt, handling: "send_mail", modtagerHarFaaetMailIDag: true })).toMatchObject({ ok: false, grund: "allerede_mail_i_dag" });
  });
  it("vinduet gælder stadig for kvitteringen (undtagelsen er kun dagsreglen)", () => {
    expect(afgoerSending({ nu: kbhTilUtc("2026-09-18", 16, 30), planlagtTil: planlagt, handling: "send_mail", modtagerHarFaaetMailIDag: false, trappe: "indsendt" })).toMatchObject({ ok: false, grund: "uden_for_vinduet" });
  });
  it("paritet: Deno-spejlet dømmer ens", () => {
    for (const trappe of ["indsendt", "indkaldt", undefined] as const) {
      expect(koeDeno.afgoerSending({ nu, planlagtTil: planlagt, handling: "send_mail", modtagerHarFaaetMailIDag: true, trappe })).toEqual(afgoerSending({ nu, planlagtTil: planlagt, handling: "send_mail", modtagerHarFaaetMailIDag: true, trappe }));
    }
  });
});

describe("kvitteringTrappe.guard — cronen, loftet og migrationen", () => {
  it("cronen: kvitteringen tæller ikke som «har fået mail i dag», og rækkens trappe gives til dommen", () => expect(cronenUndtagerKvitteringen(udenKommentarer(laes(CRON)))).toBe(true));
  it("loftet er 300 påbegyndte kladder i timen", () => expect(loftetEr300(udenKommentarer(laes(GEM)))).toBe(true));
  it("migrationen bærer alle otte trapper", () => expect(migrationenHarAlleOtte(laes(MIG))).toBe(true));
  it("VÆRNET VIRKER", () => {
    const cron = udenKommentarer(laes(CRON));
    expect(cronenUndtagerKvitteringen(cron.replace("harFaaet.has(email)),\n        trappe: raekke.trappe,", "harFaaet.has(email)),"))).toBe(false);
    expect(cronenUndtagerKvitteringen(cron.replace('.not("trappe", "in", `(${TRAPPER_UDEN_DAGSREGEL.join(",")})`)\n', ""))).toBe(false);
    expect(loftetEr300(udenKommentarer(laes(GEM)).replace("= 300;", "= 60;"))).toBe(false);
    expect(migrationenHarAlleOtte(laes(MIG).replace("'indsendt', ", ""))).toBe(false);
  });
});
