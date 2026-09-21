import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KOE_SKABELONER } from "@/lib/rykkerkoe";
import { RYKKER_SKABELONER, bygRykkerMail, type MailKontekst } from "../../../supabase/functions/_shared/ansoegningRykkerMails.ts";

// Kildeværn for «afslaget bliver til noget» (18/9-2026). Otte domme med
// selvbevis:
//   1. afslagsTilbud.ts er byte-ens efter filhovedet i src/lib og _shared.
//   2. Dialogen: ventelistefeltet (saetPaaVenteliste) vises KUN når grunden
//      giver venteliste (afslagsFoelger), kaldes EFTER handlingen (lukningen),
//      og fladen skriver aldrig i ventepladser selv (C's §8a).
//   3. Cronen: trapperne på lukkede ansøgninger (TRAPPER_PAA_LUKKET) kræver
//      trin = lukket i stedet for at blive annulleret; afslagsmailen får
//      pladsen i køen (koeNummer) — fail-soft.
//   4. Mailen: afslagsmailen bærer køpladsen som NUMMER — aldrig det siddende
//      medlem ved navn (Jonas 18/9); «tak for snakken» kun efter en samtale;
//      ingen «ikke nu»-linje. Mailbyggeren kender ikke rådgiverteksten.
//   5. Migrationen: kolonnen afslagsgrund, CHECK-unionen (afslag OG C's
//      venteplads), IKKE KØRT, ingen SECURITY DEFINER.
//   6. Handlingen: afvis/afslag læser afslagsgrund; ukendt grund → 400 (null).
//   7. Ansøgningens side viser køen (koeTekstTilRaadgiver) og «Fjern» gennem
//      C's fjernFraVenteliste — aldrig direkte i tabellen.
//   8. Abonnementet er UDE (Jonas 18/9: «Det skal slet ikke nævnes»): ingen af
//      motorens, køens, mailens, fladens eller migrationens filer nævner det
//      uden for kommentarer.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const DOM_SRC = "src/lib/afslagsTilbud.ts";
const DOM_DENO = "supabase/functions/_shared/afslagsTilbud.ts";
const KNAPPER = "src/components/hjemmebane/ansoegninger/AnsoegningHandlinger.tsx";
const MOTOR_IO = "supabase/functions/_shared/ansoegningMotor.ts";
const CRON = "supabase/functions/ansoegning-rykker-cron/index.ts";
const MAILS = "supabase/functions/_shared/ansoegningRykkerMails.ts";
const MIGRATION = "supabase/migrations/20260918250000_afslag_venteliste.sql";
const HANDLING = "supabase/functions/ansoegning-handling/index.ts";
const VIEW = "src/components/hjemmebane/ansoegninger/AnsoegningView.tsx";
const HOOK = "src/hooks/ansoegninger.ts";
const UDEN_ABONNEMENT = [
  "supabase/functions/_shared/ansoegningTrin.ts", "supabase/functions/_shared/rykkerkoe.ts", "supabase/functions/_shared/ansoegningMotor.ts",
  MAILS, DOM_DENO, CRON, HANDLING, HOOK, "src/lib/ansoegninger/ansoegningHandlinger.ts", KNAPPER, VIEW,
];

export function krop(k: string): string {
  const i = k.indexOf("*/");
  return (i === -1 ? k : k.slice(i + 2)).replace(/from "\.\/([A-Za-z]+)\.ts"/g, 'from "./$1"');
}
export const dialogenErRigtig = (k: string): boolean =>
  k.includes("const tilbud = afslagsFoelger(grund);") &&
  k.includes("{tilbud.venteliste && (") &&
  // 19/9 (Jonas 18/9, pkt. 8): ventelisten REJSER MED i handlingen — lukningen, pladsen og afslagsmailen
  // (straks, med pladsen i) sker i ansoegning-handling i den rækkefølge; fladen kalder ikke venteliste-handling selv.
  k.includes("ventelisteCompanyId: k.kraeverAfslagsgrund && tilbud.venteliste ? ventelisteCompanyId || null : null,") &&
  !/saetPaaVenteliste\(/.test(k) &&
  !/from\("ventepladser"/.test(k) &&
  k.includes("afslagsgrund: k.kraeverAfslagsgrund ? grund : null,");
/** 3: cronen (k) kender undtagelsen for lukkede; køpladsen læses fail-soft i motorens koeMailKontekst (m), som cronen og «straks» deler (19/9). */
export const cronenErRigtig = (k: string, m: string = k): boolean =>
  k.includes("TRAPPER_PAA_LUKKET.includes(raekke.trappe)") &&
  k.includes('? (!a || !a.indsendt_at || a.trin !== "lukket")') &&
  m.includes("koeNummer(") && m.includes("afslagsmailen sendes uden køplads") &&
  m.includes('efterSamtale: a.lukkeaarsag === "afslag_efter_samtale"') &&
  m.includes('afslag: i.trappe === "afslag" ? await afslagsIndhold(admin, a) : null,');
/** Handlingen: ventelisten sættes EFTER lukningen og FØR afslagsmailen — og kun da sender motoren den ikke selv. */
export const handlingenSaetterPladsenFoerMailen = (h: string): boolean =>
  h.includes("svarMailStraks: ventelisteCompanyId === null") &&
  foer(h, "await saetPaaVenteliste(admin, { ansoegningId, companyId: ventelisteCompanyId,", 'await sendSvarMailNu(admin, frisk, "afslag", nu)') &&
  foer(h, "const res = await udfoerOvergang(admin, {", "await saetPaaVenteliste(admin, { ansoegningId, companyId: ventelisteCompanyId,");
/**
 * Mailbyggeren kender kun ansøgerens sætning — ikke rådgiverens tekst med navn, ikke feltet virksomhed.
 * 21/9 (udkast-afslag-luk): selve teksten bor i afslagsTilbud.ts (afslagsMailTekst), så dialogens
 * forhåndsvisning bygges af samme kode; byggeren kalder den. Dommen læser derfor begge filer.
 */
export const mailenErRigtig = (k: string, dom: string): boolean =>
  dom.includes("koeSaetningTilAnsoeger(a.ventepladser)") && !k.includes("koeTekstTilRaadgiver") && !/\.virksomhed\b/.test(k) &&
  k.includes('BYGGERE["ansoegning-afslag"]') && k.includes("afslagsMailTekst({");
export const migrationenErRigtig = (sql: string): boolean =>
  sql.includes("add column if not exists afslagsgrund text") &&
  /check \(trappe in \('kladde', 'indkaldt', 'booket', 'aftalegrundlag', 'pause', 'venteplads', 'afslag'\)\)/.test(sql) &&
  !/security definer/i.test(sql) && !/abonnement/i.test(sql);
export const handlingenErRigtig = (k: string): boolean =>
  k.includes('if (art === "afvis" || art === "afslag") {') &&
  k.includes("if (grund !== null && !(AFSLAGSGRUNDE as readonly string[]).includes(grund)) return null;");
export const sidenErRigtig = (view: string, hook: string): boolean =>
  view.includes("koeTekstTilRaadgiver({ virksomhed: p.virksomhed, nummer: p.nummer, hvorfor: p.hvorfor })") &&
  view.includes("await fjernFraVenteliste(ventepladsId);") && !/from\("ventepladser"/.test(view) &&
  hook.includes("koeNummer(raekker, ansoegningId)");
export const udenAbonnement = (k: string): boolean => !/abonnement|dine tal|399 kr/i.test(k);

const K: MailKontekst = {
  fornavn: "Lisbeth", virksomhedsnavn: "Nordic Byg ApS", bookingUrl: "https://c/x", statusUrl: "https://s", ikkeNuUrl: "https://s&handling=ikke_nu",
  samtaleStart: null, aftaleUrl: null, token: "abc", manglerSvar: null,
  afslag: { grundTekst: "Vi har allerede et medlem i nichen.", ventepladser: [{ nummer: 2 }], efterSamtale: false },
};

describe("afslagTilbud.guard — de otte domme på repoets filer", () => {
  it("1. dommen er ordret ens i src/lib og _shared", () => {
    const a = krop(laes(DOM_SRC)), b = krop(laes(DOM_DENO));
    expect(a.length).toBeGreaterThan(300);
    expect(a).toBe(b);
  });
  it("2. dialogen: ventelistefeltet kun når grunden giver det, kaldt efter lukningen, aldrig direkte i tabellen", () => expect(dialogenErRigtig(udenKommentarer(laes(KNAPPER)))).toBe(true));
  it("3. cronen: lukkede ansøgninger med afslag-trappe sendes; køpladsen læses fail-soft i motorens kontekst; samtalen kendes; handlingen sætter pladsen før mailen", () => {
    expect(cronenErRigtig(udenKommentarer(laes(CRON)), udenKommentarer(laes(MOTOR_IO)))).toBe(true);
    expect(handlingenSaetterPladsenFoerMailen(udenKommentarer(laes(HANDLING)))).toBe(true);
  });
  it("4. mailen: nummeret, aldrig navnet; «tak for snakken» kun efter samtale; ingen «ikke nu»", () => {
    expect([...RYKKER_SKABELONER].sort()).toEqual([...KOE_SKABELONER].sort());
    expect(mailenErRigtig(udenKommentarer(laes(MAILS)), udenKommentarer(laes(DOM_DENO)))).toBe(true);
    const koe = bygRykkerMail("ansoegning-afslag", K)!;
    expect(koe.tekst).toContain("I står nummer 2 i køen til pladsen i jeres niche");
    expect(koe.tekst).not.toMatch(/hos /);
    expect(koe.emne).toBe("Vores svar på din ansøgning — og din plads i køen");
    expect(koe.tekst).not.toContain("tak for snakken");
    expect(koe.tekst).not.toContain("ikke_nu");
    expect(udenAbonnement(koe.tekst)).toBe(true);
    const efterSamtale = bygRykkerMail("ansoegning-afslag", { ...K, afslag: { ...K.afslag!, ventepladser: [], efterSamtale: true } })!;
    expect(efterSamtale.tekst).toContain("og tak for snakken.");
    expect(efterSamtale.tekst).not.toContain("i køen");
    expect(efterSamtale.emne).toBe("Vores svar på din ansøgning");
    expect(bygRykkerMail("ansoegning-abonnement-tilbud", K)).toBeNull();
  });
  it("5. migrationen: kolonnen, CHECK-unionen med C's venteplads, IKKE KØRT, intet abonnement", () => {
    expect(laes(MIGRATION).startsWith("-- IKKE KØRT.")).toBe(true);
    expect(migrationenErRigtig(udenSqlKommentarer(laes(MIGRATION)))).toBe(true);
  });
  it("6. handlingen læser grunden og afviser en ukendt", () => expect(handlingenErRigtig(udenKommentarer(laes(HANDLING)))).toBe(true));
  it("7. ansøgningens side viser køen med navn og nummer (rådgiveren) og fjerner gennem C's api", () => expect(sidenErRigtig(udenKommentarer(laes(VIEW)), udenKommentarer(laes(HOOK)))).toBe(true));
  it("8. abonnementet nævnes ingen steder uden for kommentarer", () => {
    for (const f of UDEN_ABONNEMENT) expect(udenAbonnement(udenKommentarer(laes(f))), f).toBe(true);
    expect(udenAbonnement(udenSqlKommentarer(laes(MIGRATION)))).toBe(true);
  });
});

describe("afslagTilbud.guard — dommene fanger fejlen på en kopi", () => {
  it("2. ventelisten kaldt selv fra fladen, eller altid vist, eller skrevet direkte, fælder dom 2", () => {
    const k = udenKommentarer(laes(KNAPPER));
    expect(dialogenErRigtig(k + "\nawait saetPaaVenteliste(id, ventelisteCompanyId, null);")).toBe(false);
    expect(dialogenErRigtig(k.replace("ventelisteCompanyId: k.kraeverAfslagsgrund && tilbud.venteliste ? ventelisteCompanyId || null : null,", "ventelisteCompanyId: null,"))).toBe(false);
    expect(dialogenErRigtig(k.replace("{tilbud.venteliste && (", "{true && ("))).toBe(false);
    expect(dialogenErRigtig(k + '\nsupabase.from("ventepladser").insert({});')).toBe(false);
  });
  it("3. cronen uden undtagelsen, motoren uden fail-soft eller uden samtalen, handlingen med mailen før pladsen fælder dom 3", () => {
    const k = udenKommentarer(laes(CRON)), m = udenKommentarer(laes(MOTOR_IO)), h = udenKommentarer(laes(HANDLING));
    expect(cronenErRigtig(k.replace("TRAPPER_PAA_LUKKET.includes(raekke.trappe)", "false"), m)).toBe(false);
    expect(cronenErRigtig(k, m.replace("afslagsmailen sendes uden køplads", "x"))).toBe(false);
    expect(cronenErRigtig(k, m.replace('efterSamtale: a.lukkeaarsag === "afslag_efter_samtale"', "efterSamtale: true"))).toBe(false);
    expect(handlingenSaetterPladsenFoerMailen(h.replace("svarMailStraks: ventelisteCompanyId === null", "svarMailStraks: true"))).toBe(false);
    const plads = "await saetPaaVenteliste(admin, { ansoegningId, companyId: ventelisteCompanyId,";
    expect(handlingenSaetterPladsenFoerMailen(h.replace(plads, "0;") + `\n${plads} hvorfor: null, satAf: userId });`)).toBe(false);
  });
  it("4. en mailbygger der bruger rådgiverens tekst eller feltet virksomhed fælder dom 4", () => {
    const k = udenKommentarer(laes(MAILS)), dom = udenKommentarer(laes(DOM_DENO));
    expect(mailenErRigtig(k.replace("afslagsMailTekst({", "egenTekst({"), dom)).toBe(false);
    expect(mailenErRigtig(k, dom.replace("koeSaetningTilAnsoeger(a.ventepladser)", "a.ventepladser.map(koeTekstTilRaadgiver).join(', ')"))).toBe(false);
    expect(mailenErRigtig(k + "\nconst x = (p: { virksomhed: string }) => p.virksomhed;", dom)).toBe(false);
  });
  it("5. unionen uden venteplads, SECURITY DEFINER eller en abonnementskolonne fælder dom 5", () => {
    const sql = udenSqlKommentarer(laes(MIGRATION));
    expect(migrationenErRigtig(sql.replace("'pause', 'venteplads', 'afslag'", "'pause', 'afslag'"))).toBe(false);
    expect(migrationenErRigtig(sql + "\ncreate function x() returns int language sql security definer as $$ select 1 $$;")).toBe(false);
    expect(migrationenErRigtig(sql + "\nalter table public.ansoegninger add column tilbyd_abonnement_at timestamptz;")).toBe(false);
  });
  it("6./7./8. en ukendt grund der slipper igennem, siden der skriver selv, eller ét ord om abonnementet fælder dom 6/7/8", () => {
    expect(handlingenErRigtig(udenKommentarer(laes(HANDLING)).replace("if (grund !== null && !(AFSLAGSGRUNDE as readonly string[]).includes(grund)) return null;", ""))).toBe(false);
    expect(sidenErRigtig(udenKommentarer(laes(VIEW)) + '\nsupabase.from("ventepladser").delete();', udenKommentarer(laes(HOOK)))).toBe(false);
    expect(udenAbonnement(udenKommentarer(laes(KNAPPER)) + '\nconst t = "Tilbyd abonnementet";')).toBe(false);
    expect(udenAbonnement("// abonnement i en kommentar er ok\n" .replace(/\/\/[^\n]*/g, ""))).toBe(true);
  });
});
