import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KOE_SKABELONER } from "@/lib/rykkerkoe";
import { SAMTALE_MAIL } from "@/lib/samtaleBeskedDom";

// Kildeværn for «samtalen vælges i platformen, oprettes i Calendly» (udkast
// 18/9-2026, rev. 2). Otte domme med selvbevis på muterede kopier:
//   1. ansoegning-samtale: verifyAnsoegningslink FØR enhver anden service-role-
//      handling; slottet regnes igen på serveren (erSlotLedig) FØR Calendly
//      (bookIKalenderen) FØR platformen (udfoerOvergang) FØR beskederne;
//      kompensation (aflysIKalenderen) når platformen siger nej; Calendly
//      aflyses FØR platformen ved aflys.
//   2. ansoegning-handling: samme rækkefølge for rådgiveren; kompensation.
//   3. Motoren: 23505 (ansoegninger_samtale_start_uidx) → 409; det gamle
//      scheduling-link (afklaringUrl/bygBookingUrl/calendly.com) er væk —
//      Calendly tales KUN gennem calendlyApi.ts.
//   4. Cronen: bookinglinket er ansøgerens egen side (ansoegerLink);
//      mødelinket er ansøgningens samtale_link.
//   5. Mailene: de tre samtalemails er IKKE i køen (KOE_SKABELONER) og bruger
//      bygUdkast; i dag/i morgen nævner ikke Calendly.
//   6. Ansøgerens side og rådgiverens afsnit regner ingen tider selv: siden
//      kalder kun statusApi (ingen supabase.from), afsnittet henter slots
//      gennem hentSamtaleTider og bekræfter gennem udfoerHandling.
//   7. Migrationen: UNIQUE-indekset WHERE trin = 'booket', kolonnen
//      samtale_link, ingen SECURITY DEFINER, ingen egne tider-tabeller, IKKE KØRT.
//   8. config.toml: ansoegning-samtale har verify_jwt = false med
//      begrundelsen (tokenet er legitimationen), som ansoegning-link.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const SAMTALE_FN = "supabase/functions/ansoegning-samtale/index.ts";
const HANDLING_FN = "supabase/functions/ansoegning-handling/index.ts";
const MOTOR = "supabase/functions/_shared/ansoegningMotor.ts";
const CRON = "supabase/functions/ansoegning-rykker-cron/index.ts";
const MAILS = "supabase/functions/_shared/ansoegningRykkerMails.ts";
const SAMTALE_MAILS = "supabase/functions/_shared/samtaleMails.ts";
const SIDE = "src/components/ansoegning/AnsoegSamtale.tsx";
const STATUS_SIDE = "src/pages/AnsoegStatus.tsx";
const AFSNIT = "src/components/hjemmebane/ansoegninger/SamtaleAfsnit.tsx";
const MIGRATION = "supabase/migrations/20260918270000_samtale_i_kalenderen.sql";
const CALENDLY_API = "supabase/functions/_shared/calendlyApi.ts";
const CONFIG = "supabase/config.toml";

// book/flyt-grenen står SIDST i filen (aflys først): rækkefølgen måles på DEN gren (lastIndexOf).
export const samtaleFnErRigtig = (k: string): boolean =>
  foer(k, "await verifyAnsoegningslink(token, admin)", "hentLedigeSamtaletider(") &&
  k.indexOf("if (!erSlotLedig(start, tider.input))") !== -1 &&
  k.indexOf("if (!erSlotLedig(start, tider.input))") < k.indexOf("await bookIKalenderen(a, start)") &&
  k.indexOf("await bookIKalenderen(a, start)") < k.lastIndexOf("await udfoerOvergang(admin, {") &&
  k.lastIndexOf("await udfoerOvergang(admin, {") < k.lastIndexOf("await meldSamtaleAendring(admin, {") &&
  k.includes("await aflysIKalenderen(kalender.eventUri, ") &&
  foer(k, "await aflysIKalenderen(a.calendly_event_uri, ", 'handling: { art: "aflys_booking" }') &&
  !/api\.calendly\.com|calendly\.com\//.test(k);
export const handlingFnErRigtig = (k: string): boolean =>
  foer(k, "if (!erSlotLedig(start, tider.input))", "await bookIKalenderen(ansoegning, start)") &&
  foer(k, "await bookIKalenderen(ansoegning, start)", "await udfoerOvergang(admin, {") &&
  foer(k, "await udfoerOvergang(admin, {", "await meldSamtaleAendring(admin, {") &&
  k.includes("if (samtale?.eventUri) await aflysIKalenderen(samtale.eventUri, ") &&
  k.includes('const RAADGIVER_SAMTALE: readonly string[] = ["book", "aflys_booking"];');
export const motorErRigtig = (k: string): boolean =>
  k.includes('if (updErr.code === "23505") return { ok: false, status: 409') && !/afklaringUrl|bygBookingUrl|calendly\.com/.test(k);
export const kunCalendlyApiTalerMedCalendly = (filer: Array<[string, string]>): boolean =>
  filer.every(([sti, k]) => sti === CALENDLY_API || !/api\.calendly\.com/.test(k));
/** Køens mailkontekst bor i motoren (koeMailKontekst, 19/9 — cronen og «straks» deler den): ansøgerens side som bookinglink, mødelinket fra ansøgningen. */
export const cronErRigtig = (k: string): boolean =>
  k.includes("bookingUrl: ansoegerLink(a.token),") && !/bygBookingUrl|afklaringUrl/.test(k) && k.includes("moedeLink: a.samtale_link,");
export const mailsErRigtige = (koe: string, samtale: string): boolean =>
  !/Calendly/.test(koe) && samtale.includes("bygUdkast(") && Object.values(SAMTALE_MAIL).every((s) => !KOE_SKABELONER.includes(s));
export const sideErRigtig = (side: string, afsnit: string): boolean =>
  !/supabase\.from\(|\.from\("/.test(side) && side.includes('from "@/lib/ansoegning/api"') && side.includes("<SamtaleVaelger") && !/calendly\.com/.test(side) &&
  afsnit.includes("hentSamtaleTider(id)") && afsnit.includes("udfoerHandling({ ansoegningId: id, handling: input.handling, samtaleStart: input.samtaleStart ?? null })") && !/supabase\.from\(/.test(afsnit);
export const migrationErRigtig = (sql: string): boolean =>
  /create unique index if not exists ansoegninger_samtale_start_uidx\s+on public\.ansoegninger \(samtale_start\)\s+where trin = 'booket' and samtale_start is not null;/.test(sql) &&
  sql.includes("add column if not exists samtale_link text") && !/create table/i.test(sql) &&
  !/security definer/i.test(sql) && !/auth\.users/.test(sql);
export const configErRigtig = (k: string): boolean =>
  /\[functions\.ansoegning-samtale\]\s*\n\s*verify_jwt = false/.test(k) && /tokenet i\s*\n?\s*# body er legitimationen/.test(k);

describe("samtaleBooking.guard — de otte domme på repoets filer", () => {
  it("1. ansoegning-samtale: token → slot → Calendly → platform → besked; kompensation; aflys i Calendly først", () => expect(samtaleFnErRigtig(udenKommentarer(laes(SAMTALE_FN)))).toBe(true));
  it("2. ansoegning-handling: samme rækkefølge for rådgiveren, med kompensation", () => expect(handlingFnErRigtig(udenKommentarer(laes(HANDLING_FN)))).toBe(true));
  it("3. motoren: 23505 → 409; det gamle scheduling-link er væk; kun calendlyApi taler med api.calendly.com", () => {
    expect(motorErRigtig(udenKommentarer(laes(MOTOR)))).toBe(true);
    expect(kunCalendlyApiTalerMedCalendly([SAMTALE_FN, HANDLING_FN, MOTOR, CRON, "supabase/functions/_shared/samtaleTider.ts", CALENDLY_API].map((f) => [f, udenKommentarer(laes(f))]))).toBe(true);
  });
  it("4. køens mailkontekst (motoren, delt af cronen og «straks») linker til ansøgerens side; mødelinket er ansøgningens", () => {
    expect(cronErRigtig(udenKommentarer(laes(MOTOR)))).toBe(true);
    expect(udenKommentarer(laes(CRON)).includes("await sendKoeMail(admin, raekke, a, nu,")).toBe(true);
  });
  it("5. samtalemailene går uden om køen; ingen Calendly i køens mails", () => expect(mailsErRigtige(udenKommentarer(laes(MAILS)), udenKommentarer(laes(SAMTALE_MAILS)))).toBe(true));
  it("6. siden og afsnittet regner ingen tider selv; statussiden (#992) viser AnsoegSamtale og ingen Calendly-knap", () => {
    expect(sideErRigtig(udenKommentarer(laes(SIDE)), udenKommentarer(laes(AFSNIT)))).toBe(true);
    const s = udenKommentarer(laes(STATUS_SIDE));
    expect(s.includes("<AnsoegSamtale token={token} booket={v.booket}") && !/href=\{v\.book\}|Book samtalen med Jonas/.test(s)).toBe(true);
  });
  it("7. migrationen: UNIQUE-værnet, samtale_link, ingen egne tabeller, IKKE KØRT", () => {
    expect(laes(MIGRATION).startsWith("-- IKKE KØRT.")).toBe(true);
    expect(migrationErRigtig(udenSqlKommentarer(laes(MIGRATION)))).toBe(true);
  });
  it("8. config.toml: verify_jwt = false med begrundelsen", () => expect(configErRigtig(laes(CONFIG))).toBe(true));
});

describe("samtaleBooking.guard — dommene fanger fejlen på en kopi", () => {
  it("1. tokenet efter opslaget, slottet efter overgangen, eller besked før overgangen fælder dom 1", () => {
    const k = udenKommentarer(laes(SAMTALE_FN));
    const tok = "await verifyAnsoegningslink(token, admin)";
    expect(samtaleFnErRigtig(k.replace(tok, "null") + `\nconst _a = ${tok};`)).toBe(false); // tokenet efter alt andet
    expect(samtaleFnErRigtig(k.replace("if (!erSlotLedig(start, tider.input))", "if (false)"))).toBe(false);
    expect(samtaleFnErRigtig(k.replace("await aflysIKalenderen(kalender.eventUri, ", "console.log("))).toBe(false); // ingen kompensation
    expect(samtaleFnErRigtig(k + "\nfetch('https://api.calendly.com/x');")).toBe(false);
  });
  it("2./3./4. rådgiverens book uden slot-tjek, motor uden 23505, cron med Calendly-link fælder dom 2/3/4", () => {
    expect(handlingFnErRigtig(udenKommentarer(laes(HANDLING_FN)).replace("if (!erSlotLedig(start, tider.input))", "if (false)"))).toBe(false);
    expect(kunCalendlyApiTalerMedCalendly([[MOTOR, udenKommentarer(laes(MOTOR)) + "\nfetch('https://api.calendly.com/users/me');"]])).toBe(false);
    expect(motorErRigtig(udenKommentarer(laes(MOTOR)).replace('if (updErr.code === "23505") return { ok: false, status: 409', "if (false) return { ok: false, status: 409"))).toBe(false);
    expect(motorErRigtig(udenKommentarer(laes(MOTOR)) + '\nexport const x = "https://calendly.com/x";')).toBe(false);
    expect(cronErRigtig(udenKommentarer(laes(MOTOR)).replace("bookingUrl: ansoegerLink(a.token),", "bookingUrl: bygBookingUrl(base, a.id),"))).toBe(false);
  });
  it("5./6. en samtalemail i køen, eller en side der læser tabellen selv, fælder dom 5/6", () => {
    expect(mailsErRigtige(udenKommentarer(laes(MAILS)) + "\nconst t = 'Calendly';", udenKommentarer(laes(SAMTALE_MAILS)))).toBe(false);
    expect(sideErRigtig(udenKommentarer(laes(SIDE)) + '\nsupabase.from("raadgiver_samtaletider").select();', udenKommentarer(laes(AFSNIT)))).toBe(false);
    expect(sideErRigtig(udenKommentarer(laes(SIDE)), udenKommentarer(laes(AFSNIT)).replace("hentSamtaleTider(id)", "hentSamtaleTider(andenId)"))).toBe(false);
  });
  it("7./8. indekset uden WHERE, SECURITY DEFINER, eller verify_jwt = true uden begrundelse fælder dom 7/8", () => {
    const sql = udenSqlKommentarer(laes(MIGRATION));
    expect(migrationErRigtig(sql.replace("where trin = 'booket' and samtale_start is not null;", ";"))).toBe(false);
    expect(migrationErRigtig(sql + "\ncreate function x() returns int language sql security definer as $$ select 1 $$;")).toBe(false);
    expect(migrationErRigtig(sql + "\ncreate table public.raadgiver_samtaletider (advisor text primary key);")).toBe(false); // egne tider-tabeller er en kopi af hans kalender
    expect(configErRigtig(laes(CONFIG).replace(/\[functions\.ansoegning-samtale\]\s*\n\s*verify_jwt = false/, "[functions.ansoegning-samtale]\n    verify_jwt = true"))).toBe(false);
  });
});
