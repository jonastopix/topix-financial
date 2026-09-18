import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { MELLEMSTYKKER } from "@/lib/ansoegning/mellemstykker";
import { SKAERMTEKSTER, KVITTERING } from "@/lib/ansoegning/spoergsmaal";
import { annulleringsOrd, KOE_STATUS_ORD, MAIL_ORD, SKABELON_ORD } from "@/lib/ansoegninger/ansoegningSpor";
import { SAMTALE_MAIL } from "@/lib/samtaleBeskedDom";

// Jonas' prøve af flowet 18/9 aften — otte fund (udkast 19/9). Kildeværn for dem, der er kode:
//   1. Linket åbner i toppen: intet `autoFocus` i ansøgningsfladen — fokus sættes med fokusUdenScroll (preventScroll).
//   2. «Vi ringer» findes ikke: vi indkalder til en afklaringssamtale.
//   3. «Sådan hjælper vi dig» er punkter med ikon — Jonas' to afsnit ordret, ét pr. punkt.
//   4. Kvitteringsskærmen: «om et øjeblik» (#1002) — målt, ikke bygget her; låst af flowRettelser.guard.
//   5. Kvitteringsmailen: svarene som blokke (låst i flowRettelser.guard 2b) — her: rammen kender blokke.
//   7. Køen: danske statusord, grunden i ord, mails uden om køen har ord.
//   8. Svar-mails STRAKS: motoren sender trappens dag 0-mail i overgangen (sendSvarMailNu), cronen sender
//      gennem samme sendKoeMail; ventelisten straks; handlingen sætter pladsen før afslagsmailen
//      (afslagTilbud.guard 3). Kvitteringen straks (#1002) er uændret.
const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const MOTOR = "supabase/functions/_shared/ansoegningMotor.ts";
const CRON = "supabase/functions/ansoegning-rykker-cron/index.ts";
const VENTELISTE = "supabase/functions/_shared/venteliste.ts";
const MAILS = "supabase/functions/_shared/ansoegningRykkerMails.ts";
const RAMME = "supabase/functions/_shared/indgangsMail.ts";
const FLADE = "src/components/ansoegning";

/** 1: ingen autoFocus i ansøgningsfladen; fokus uden rulning findes og bruges. */
export function ingenAutoFocus(mappe: string): string[] {
  return readdirSync(resolve(ROD, mappe)).filter((f) => f.endsWith(".tsx") && /\bautoFocus\b/.test(udenKommentarer(laes(`${mappe}/${f}`))));
}
export const fokusUdenRulning = (lib: string, skaerm: string, side: string): boolean =>
  lib.includes("el?.focus({ preventScroll: true });") && skaerm.includes("ref={fokusUdenScroll}") && side.includes("window.scrollTo({ top: 0 });");

/** 2: «vi ringer» er væk. */
export const ingenRingerTekst = (k: string): boolean => !/\bringer\b/i.test(k) && k.includes("invitation til en afklaringssamtale");

/** 8: motoren sender svar-mailen i overgangen — efter rækken er skrevet, kun uden startFraTrinNr, aldrig når kalderen sagde nej. */
export const motorenSenderStraks = (m: string): boolean =>
  m.includes("export async function sendSvarMailNu(") && m.includes("export async function sendKoeMail(") &&
  foer(m, "planlagt = (await skrivPlan(admin, plan)).skrevet;", 'if (o.start && args.svarMailStraks !== false && svarMailTrin(o.start.trappe) !== null && (args.startFraTrinNr ?? o.start.fraTrinNr ?? 0) === 0) {') &&
  m.includes("mail = await sendSvarMailNu(admin, { ...a, ...opd } as AnsoegningRaekke, o.start.trappe, nu);") &&
  m.includes("idempotencyKey: raekke.idempotensnoegle") && m.includes('vej: i.vej') &&
  m.includes('.eq("trin_nr", 0)') && m.includes('.eq("status", "planlagt")');
/** 8: cronen dømmer vinduet og dagsreglen selv (afgoerSending) FØR den sender gennem motoren — og sender ikke selv. */
export const cronenSenderGennemMotoren = (c: string): boolean =>
  foer(c, "const dom = afgoerSending({", 'await sendKoeMail(admin, raekke, a, nu, { venteplads: ventepladsKontekst, vej: "koe" })') && !/sendManagedEmail\(|bygRykkerMail\(/.test(c);
/** 8: ventepladsens tilbud straks — efter rækken er skrevet. */
export const ventelistenSenderStraks = (v: string): boolean =>
  foer(v, "const skrevet = await skrivPlan(admin, plan);", 'await sendSvarMailNu(admin, a, "venteplads", nu, {');

/** 5: rammen renderer blokke — overskriften i fed, svaret escaped (linjeskift → <br> via esc). */
export const rammenKenderBlokke = (r: string): boolean =>
  r.includes("blokke?: Array<{ overskrift: string; tekst: string }>;") && r.includes("${esc(b.overskrift)}") && r.includes("${esc(b.tekst)}") && foer(r, "${afsnit}\n${blokke}", "${knap}");
export const mailenBrugerBlokke = (m: string): boolean =>
  m.includes("blokke: dine,") && m.includes('for (const b of u.blokke ?? []) linjer.push("", b.overskrift, b.tekst);') && !/Din største udfordring lige nu: \$\{/.test(m);

describe("proeveRettelser.guard — Jonas' prøve 18/9, de otte fund", () => {
  it("1. intet autoFocus i ansøgningsfladen; fokus sættes uden rulning; genoptagelsen ruller op", () => {
    expect(ingenAutoFocus(FLADE)).toEqual([]);
    expect(fokusUdenRulning(laes("src/lib/fokusUdenScroll.ts"), udenKommentarer(laes(`${FLADE}/AnsoegSkaerm.tsx`)), udenKommentarer(laes("src/pages/Ansoeg.tsx")))).toBe(true);
  });
  it("2. «vi ringer» er væk fra spørgsmålene og mailene — vi indkalder til en afklaringssamtale", () => {
    expect(ingenRingerTekst(udenKommentarer(laes("src/lib/ansoegning/spoergsmaal.ts")))).toBe(true);
    expect(/\bringer\b/i.test(udenKommentarer(laes(MAILS)))).toBe(false);
    expect(SKAERMTEKSTER.find((s) => s.id === "kontakt")?.hjaelp).toContain("afklaringssamtale");
  });
  it("3. «Sådan hjælper vi dig» er to punkter med ikon — Jonas' to afsnit ordret, ét pr. punkt", () => {
    const m = MELLEMSTYKKER.find((s) => s.id === "moedet")!;
    expect(m.punkter?.map((p) => p.ikon)).toEqual(["chat", "tal"]);
    expect(m.punkter?.map((p) => p.tekst).join("\n")).toBe(m.tekst);
    expect(udenKommentarer(laes(`${FLADE}/AnsoegMellemstykke.tsx`))).toContain("data-mellemstykke-punkter={stykke.punkter.length}");
  });
  it("4. kvitteringsskærmen siger «om et øjeblik» (#1002 — målt, intet bygget)", () => {
    expect(KVITTERING.tekst(true)).toContain("om et øjeblik");
    expect(KVITTERING.tekst(true)).not.toMatch(/mandag morgen|i morgen tidlig/);
  });
  it("5. kvitteringsmailen: svarene som blokke i ramme, mail og tekst", () => {
    expect(rammenKenderBlokke(udenKommentarer(laes(RAMME)))).toBe(true);
    expect(mailenBrugerBlokke(udenKommentarer(laes(MAILS)))).toBe(true);
  });
  it("7. køen: danske statusord, annulleringens grund i ord, og ord for alle mails uden om køen", () => {
    expect(KOE_STATUS_ORD.udfoert).toBe("udført");
    expect(annulleringsOrd("tal_med_dem (raadgiver)")).toBe("en rådgiver indkaldte til samtale");
    expect(annulleringsOrd("ansøgningen står på «booket»")).toBe("ansøgningen står på «booket»");
    for (const s of [...Object.values(SAMTALE_MAIL), "aftale-link", "ansoegning-ny-raadgiver", ...Object.keys(SKABELON_ORD)]) expect(MAIL_ORD[s]).toBeTruthy();
  });
  it("8. svar-mails straks: motoren i overgangen, cronen gennem motoren, ventelisten straks", () => {
    expect(motorenSenderStraks(udenKommentarer(laes(MOTOR)))).toBe(true);
    expect(cronenSenderGennemMotoren(udenKommentarer(laes(CRON)))).toBe(true);
    expect(ventelistenSenderStraks(udenKommentarer(laes(VENTELISTE)))).toBe(true);
  });
});

describe("proeveRettelser.guard — dommene fanger fejlen på en kopi", () => {
  it("1. et autoFocus tilbage → fanges; fokus med rulning → falsk", () => {
    expect(fokusUdenRulning("el?.focus();", "ref={fokusUdenScroll}", "window.scrollTo({ top: 0 });")).toBe(false);
    expect(fokusUdenRulning(laes("src/lib/fokusUdenScroll.ts"), "autoFocus", "window.scrollTo({ top: 0 });")).toBe(false);
  });
  it("2. «vi ringer» tilbage → falsk", () => expect(ingenRingerTekst(laes("src/lib/ansoegning/spoergsmaal.ts") + '\nconst x = "Vi ringer, hvis der er et match.";')).toBe(false));
  it("5. rammen uden blokke, eller mailen med «spørgsmål: svar» i ét afsnit → falsk", () => {
    expect(rammenKenderBlokke(udenKommentarer(laes(RAMME)).replace("${afsnit}\n${blokke}", "${afsnit}"))).toBe(false);
    expect(mailenBrugerBlokke(udenKommentarer(laes(MAILS)) + "\nconst y = `Din største udfordring lige nu: ${1}`;")).toBe(false);
  });
  it("8. motoren uden straks-kaldet, med straks trods startFraTrinNr, cron der sender selv, venteliste uden straks → falsk", () => {
    const m = udenKommentarer(laes(MOTOR)), c = udenKommentarer(laes(CRON)), v = udenKommentarer(laes(VENTELISTE));
    expect(motorenSenderStraks(m.replace("mail = await sendSvarMailNu(admin, { ...a, ...opd } as AnsoegningRaekke, o.start.trappe, nu);", "mail = null;"))).toBe(false);
    expect(motorenSenderStraks(m.replace("&& (args.startFraTrinNr ?? o.start.fraTrinNr ?? 0) === 0) {", ") {"))).toBe(false);
    expect(motorenSenderStraks(m.replace("args.svarMailStraks !== false && ", ""))).toBe(false);
    expect(cronenSenderGennemMotoren(c + "\nawait sendManagedEmail({});")).toBe(false);
    expect(ventelistenSenderStraks(v.replace('await sendSvarMailNu(admin, a, "venteplads", nu, {', "await x({"))).toBe(false);
  });
});
