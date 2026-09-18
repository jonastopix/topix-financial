import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afgoerSending, erUndtagetFraDagsreglen, taellerIkkeIDagsreglen, TRAPPER_UDEN_DAGSREGEL } from "@/lib/rykkerkoe";
import * as koeDeno from "../../../supabase/functions/_shared/rykkerkoe.ts";
import { kbhTilUtc } from "@/lib/hverdage";

// Kvitteringstrappen «indsendt» (HASTER 18/9): dagsreglen og loftet. Migrationens CHECK-liste låses IKKE
// her længere (recon 18/9 §6 pkt. 9): enumsMatcherDatabasen.guard holder koden og databasen op mod hinanden
// begge veje — én sandhed, der ikke skal rettes i hånden, når den næste trappe kommer.
const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");
const CRON = "supabase/functions/ansoegning-rykker-cron/index.ts";
const GEM = "supabase/functions/ansoegning-gem/index.ts";

export const cronenUndtagerKvitteringen = (k: string): boolean =>
  k.includes('.select("sendt_til, trappe, trin_nr")') && k.includes(".filter((r) => !taellerIkkeIDagsreglen(r))") &&
  k.includes("harFaaet.has(email)),\n        trappe: raekke.trappe,\n        trinNr: raekke.trin_nr,");
export const loftetEr300 = (k: string): boolean => k.includes("const OPRET_PR_TIME_I_ALT = 300;");

const planlagt = kbhTilUtc("2026-09-18", 10, 0);
const nu = kbhTilUtc("2026-09-18", 11, 0);

describe("dagsreglen — kvitteringen er undtaget", () => {
  it("TRAPPER_UDEN_DAGSREGEL = [indsendt]; erUndtagetFraDagsreglen — hele trappen, eller ét trin med udenDagsregel", () => {
    expect([...TRAPPER_UDEN_DAGSREGEL]).toEqual(["indsendt"]);
    expect(erUndtagetFraDagsreglen("indsendt")).toBe(true);
    expect(erUndtagetFraDagsreglen("indkaldt")).toBe(false);
    expect(erUndtagetFraDagsreglen(undefined)).toBe(false);
    // Ventepladsens tilbud (recon 18/9 pkt. 7): dag 0 undtaget, rykkeren dag 3 ikke; uden trinNr gælder reglen.
    expect(erUndtagetFraDagsreglen("venteplads", 0)).toBe(true);
    expect(erUndtagetFraDagsreglen("venteplads", 1)).toBe(false);
    expect(erUndtagetFraDagsreglen("venteplads")).toBe(false);
    expect(taellerIkkeIDagsreglen({ trappe: "venteplads", trin_nr: 0 })).toBe(true);
    expect(taellerIkkeIDagsreglen({ trappe: "venteplads", trin_nr: 1 })).toBe(false);
    expect(taellerIkkeIDagsreglen({ trappe: "indsendt", trin_nr: 0 })).toBe(true);
    expect(taellerIkkeIDagsreglen({ trappe: "ukendt", trin_nr: 0 })).toBe(false);
  });
  it("ventepladsens tilbud går samme dag som afslagsmailen; rykkeren dag 3 udskydes som før", () => {
    expect(afgoerSending({ nu, planlagtTil: planlagt, handling: "send_mail", modtagerHarFaaetMailIDag: true, trappe: "venteplads", trinNr: 0 })).toEqual({ ok: true });
    expect(afgoerSending({ nu, planlagtTil: planlagt, handling: "send_mail", modtagerHarFaaetMailIDag: true, trappe: "venteplads", trinNr: 1 })).toMatchObject({ ok: false, grund: "allerede_mail_i_dag" });
    expect(koeDeno.afgoerSending({ nu, planlagtTil: planlagt, handling: "send_mail", modtagerHarFaaetMailIDag: true, trappe: "venteplads", trinNr: 0 })).toEqual({ ok: true });
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

describe("kvitteringTrappe.guard — cronen og loftet", () => {
  it("cronen: kvitteringen tæller ikke som «har fået mail i dag», og rækkens trappe gives til dommen", () => expect(cronenUndtagerKvitteringen(udenKommentarer(laes(CRON)))).toBe(true));
  it("loftet er 300 påbegyndte kladder i timen", () => expect(loftetEr300(udenKommentarer(laes(GEM)))).toBe(true));
  it("VÆRNET VIRKER", () => {
    const cron = udenKommentarer(laes(CRON));
    expect(cronenUndtagerKvitteringen(cron.replace("harFaaet.has(email)),\n        trappe: raekke.trappe,\n        trinNr: raekke.trin_nr,", "harFaaet.has(email)),"))).toBe(false);
    expect(cronenUndtagerKvitteringen(cron.replace(".filter((r) => !taellerIkkeIDagsreglen(r))", ""))).toBe(false);
    expect(loftetEr300(udenKommentarer(laes(GEM)).replace("= 300;", "= 60;"))).toBe(false);
  });
});
