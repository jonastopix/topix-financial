import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { erKontaktSpaerret, KONTAKT_BOUNCE_TIDSPUNKT, KONTAKT_SPAERRET_TIL, MIDLERTIDIG_RAADGIVERADRESSE, raadgiverModtager, udenSpaerring } from "../../../supabase/functions/_shared/raadgiverModtager.ts";
import { KONTAKT_ADRESSE } from "../../../supabase/functions/_shared/indgangsMail.ts";

// Bounce-spærringen på kontakt@ (18/9-2026 20:47:49 → udløber 18/10 20:47). Rådgiverbeskederne går til
// jonas@theboardroom.dk indtil 19/10 00:00 dansk tid og derefter til kontakt@ igen — af sig selv.
const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");
const MOTOR = "supabase/functions/_shared/ansoegningMotor.ts";
const AFTALE = "supabase/functions/aftale-underskrift/index.ts";
const BETALING = "supabase/functions/_shared/indgangsBetalingsmail.ts";

const foer = new Date("2026-09-22T09:00:00+02:00"); // webinardagen
const sidsteMinut = new Date("2026-10-18T23:59:59+02:00");
const efter = new Date("2026-10-19T00:00:00+02:00");

describe("raadgiverModtager — skifter tilbage af sig selv på datoen", () => {
  it("datoerne: bouncen 18/9 20:47:49, skiftet midnat efter udbyderens udløb 18/10 20:47", () => {
    expect(KONTAKT_BOUNCE_TIDSPUNKT).toBe("2026-09-18T20:47:49+02:00");
    expect(KONTAKT_SPAERRET_TIL).toBe("2026-10-19T00:00:00+02:00");
    expect(new Date(KONTAKT_SPAERRET_TIL).getTime()).toBeGreaterThan(new Date("2026-10-18T20:47:49+02:00").getTime());
  });
  it("før 19/10: jonas@theboardroom.dk; fra 19/10 00:00: kontakt@ igen", () => {
    expect(erKontaktSpaerret(foer)).toBe(true);
    expect(raadgiverModtager(foer)).toBe(MIDLERTIDIG_RAADGIVERADRESSE);
    expect(raadgiverModtager(sidsteMinut)).toBe("jonas@theboardroom.dk");
    expect(MIDLERTIDIG_RAADGIVERADRESSE.endsWith("@theboardroom.dk")).toBe(true); // samme domæne som afsenderen
    expect(erKontaktSpaerret(efter)).toBe(false);
    expect(raadgiverModtager(efter)).toBe(KONTAKT_ADRESSE);
  });
  it("udenSpaerring rører KUN kontakt@ (uanset store bogstaver og mellemrum); en anden secret-adresse er uændret", () => {
    expect(udenSpaerring("kontakt@theboardroom.dk", foer)).toBe("jonas@theboardroom.dk");
    expect(udenSpaerring("  Kontakt@TheBoardroom.dk ", foer)).toBe("jonas@theboardroom.dk");
    expect(udenSpaerring("morten@molainvest.dk", foer)).toBe("morten@molainvest.dk");
    expect(udenSpaerring("", foer)).toBe("");
    expect(udenSpaerring("kontakt@theboardroom.dk", efter)).toBe("kontakt@theboardroom.dk");
  });
});

// Kun MODTAGEREN skiftes: replyTo på ansøgerens mails og «skriv til kontakt@» i teksterne står.
export const motorenSenderUdenOm = (k: string): boolean =>
  k.includes("to: raadgiverModtager(nu),") && k.includes("replyTo: KONTAKT_ADRESSE") && !k.includes("replyTo: raadgiverModtager") && !k.includes("to: KONTAKT_ADRESSE");
export const secretMailsGaarUdenOm = (aftale: string, betaling: string): boolean =>
  aftale.includes('udenSpaerring((Deno.env.get("RAADGIVER_MAIL_TIL") ?? "").trim(), nu)') &&
  betaling.includes('udenSpaerring((Deno.env.get("RAADGIVER_MAIL_TIL") ?? "").trim(), new Date())');

describe("raadgiverModtager.guard — hvor omvejen sidder", () => {
  it("motoren: rådgivermailen ved ny ansøgning går uden om; replyTo til ansøgeren står", () => expect(motorenSenderUdenOm(udenKommentarer(laes(MOTOR)))).toBe(true));
  it("C's aftale-kvittering til rådgiverne og betalingsmailens rådgivermail (RAADGIVER_MAIL_TIL) går uden om, hvis secret'en peger på kontakt@", () =>
    expect(secretMailsGaarUdenOm(udenKommentarer(laes(AFTALE)), udenKommentarer(laes(BETALING)))).toBe(true));
  it("VÆRNET VIRKER: modtageren hårdkodet tilbage → falsk; replyTo skiftet med → falsk", () => {
    const k = udenKommentarer(laes(MOTOR));
    expect(motorenSenderUdenOm(k.replace("to: raadgiverModtager(nu),", "to: KONTAKT_ADRESSE,"))).toBe(false);
    expect(motorenSenderUdenOm(k.replace("replyTo: KONTAKT_ADRESSE", "replyTo: raadgiverModtager(nu)"))).toBe(false);
  });
  it("PÅMINDELSE — fejler bevidst efter 19/11-2026: spærringen er udløbet for en måned siden, fjern omvejen (raadgiverModtager.ts + de tre kald) og denne test", () => {
    expect(Date.now()).toBeLessThan(new Date("2026-11-19T00:00:00+01:00").getTime());
  });
});
