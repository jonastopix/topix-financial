import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for de otte rettelser fra recon «vejen videre» §8 (19/9-2026). Otte
// domme med selvbevis på muterede kopier — én pr. rettelse:
//   1. Webhookens aflys-gren bruger skalWebhookAflyse FØR udfoerOvergang (en
//      flytning må ikke slette den nye booking).
//   2. Webhookens created-gren bruger skalWebhookBooke (samme event ELLER samme
//      starttid springes over) og giver Meet-linket videre.
//   3. «Ikke nu» fra booket afvises i dommen, og statussiden viser ikke knappen.
//   4. Pausen slipper: cronens pause_slut rydder paa_pause_til, og de fire
//      steder (motor, samtale, link, rådgiverside) tester erPaaPause — ikke rå null.
//   5. aflys_booking starter indkaldt-trappen fra trin 1 (ingen ny dag 0-mail),
//      og planlaegTrappe kender fraTrinNr.
//   6. Statussiden læser tag_pladsen/afslaa_pladsen og kalder svarPaaPladsen
//      (serverens svarPaaPlads) — knapperne i C's ventelistemail virker.
//   7. Calendly-kald har en AbortController med timeout.
//   8. Teksterne: «Tre rykkere», «på mandag» i dag −1-mailen, «dag 2, 7 og 11».

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const WEBHOOK = "supabase/functions/calendly-webhook/index.ts";
const DOM = "supabase/functions/_shared/calendlyWebhookDom.ts";
const TRIN = "supabase/functions/_shared/ansoegningTrin.ts";
const TRIN_SRC = "src/lib/ansoegningTrin.ts";
const MOTOR = "supabase/functions/_shared/ansoegningMotor.ts";
const CRON = "supabase/functions/ansoegning-rykker-cron/index.ts";
const SAMTALE = "supabase/functions/ansoegning-samtale/index.ts";
const LINK = "supabase/functions/ansoegning-link/index.ts";
const RYK = "supabase/functions/_shared/rykkerkoe.ts";
const CALENDLY = "supabase/functions/_shared/calendlyApi.ts";
const MAILS = "supabase/functions/_shared/ansoegningRykkerMails.ts";
const STATUS = "src/lib/ansoegning/status.ts";
const SIDE = "src/pages/AnsoegStatus.tsx";
const API = "src/lib/ansoegning/api.ts";
const VIEW = "src/components/hjemmebane/ansoegninger/AnsoegningView.tsx";
const AFSNIT = "src/components/hjemmebane/ansoegninger/SamtaleAfsnit.tsx";

export const aflysGrenErRigtig = (k: string): boolean =>
  k.includes("skalWebhookAflyse({ ansoegningEventUri: ansoegning.calendly_event_uri, payloadEventUri: aflystEventUri })") &&
  foer(k, "skalWebhookAflyse({", 'handling: { art: "aflys_booking" }, via: "calendly"') &&
  k.includes("if (vagt.aflys === false)");
export const bookGrenErRigtig = (k: string): boolean =>
  k.includes("skalWebhookBooke({ trin: ansoegning.trin, samtaleStart: ansoegning.samtale_start, ansoegningEventUri: ansoegning.calendly_event_uri, payloadEventUri: eventUri, payloadStart: startTid })") &&
  foer(k, "skalWebhookBooke({", 'handling: { art: "book" },\n          via: "calendly"') &&
  k.includes("moedeLink = await hentMoedeLink(eventUri)") && k.includes("eventUri, moedeLink }");
export const dommeneErRene = (k: string): boolean =>
  k.includes("export function skalWebhookAflyse(") && k.includes("export function skalWebhookBooke(") && !/fetch\(|createClient|Deno\./.test(k);
export const ikkeNuErRigtig = (trin: string, status: string): boolean =>
  foer(trin, 'if (fra === "booket") return AFVIST("ikke_nu: aflys samtalen først");', 'start: { trappe: "pause", anker: "pause" }, saetPause: true, ophaevPause: false') &&
  !/booket: \{ start: s\.samtale_start[^\n]*visIkkeNu: true/.test(status) && status.includes("visIkkeNu: false, titel: \"Samtalen er booket\"");
export const pausenSlipper = (cron: string, motor: string, samtale: string, link: string, view: string, status: string): boolean =>
  // 18/9 aften: pause_slut går gennem motorens genoptag — ikke en rå update af kolonnen — så køen, rådgiveren og ansøgeren har ÉN dom.
  cron.includes('if (raekke.handling === "pause_slut") {') && cron.includes('handling: { art: "genoptag" }, via: "koe"') && !cron.includes(".update({ paa_pause_til: null })") &&
  // og pause-rækken lever så længe pausen er SAT (på slutdatoen er erPaaPause falsk — den test annullerede pause_slut den dag, den skulle køre)
  cron.includes('(raekke.trappe === "pause" && !a.paa_pause_til)') && !cron.includes('(raekke.trappe === "pause" && !paaPause)') &&
  cron.includes("const paaPause = erPaaPause(a?.paa_pause_til, nu);") && !cron.includes("a?.paa_pause_til !== null") &&
  motor.includes("paaPause: erPaaPause(a.paa_pause_til, nu)") && !motor.includes("paaPause: a.paa_pause_til !== null") &&
  samtale.includes("if (erPaaPause(a.paa_pause_til, new Date())) return json({ error: \"Ansøgningen er på pause\" }, 409);") && !samtale.includes("if (a.paa_pause_til) return json") &&
  link.includes("if (erPaaPause(a.paa_pause_til, new Date())) return json({ ok: true, allerede: true") && !link.includes("if (a.paa_pause_til) return json") &&
  view.includes("!erPaaPause(a.paa_pause_til, nu) && (") && !view.includes("&& !a.paa_pause_til && (") && view.includes("paaPause={erPaaPause(a.paa_pause_til, nu)}") &&
  status.includes("if (erPaaPause(s.paa_pause_til, nu)) {") && !status.includes("if (s.paa_pause_til) {");
export const ingenDagNulEfterAflysning = (trin: string, ryk: string, motor: string): boolean =>
  trin.includes('if (h.art === "aflys_booking") return OK({ til: "indkaldt", annuller: ["booket"], start: { trappe: "indkaldt", anker: "nu", fraTrinNr: 1 } });') &&
  ryk.includes("if (i.fraTrinNr !== undefined && t.trinNr < i.fraTrinNr) continue;") &&
  motor.includes("fraTrinNr: args.startFraTrinNr ?? o.start.fraTrinNr,");
export const ventelistenVirker = (side: string, api: string, status: string): boolean =>
  side.includes("laesPladsHandling(searchParams.get(\"handling\"))") && side.includes("await svarPaaPladsen(token, pladsSvar)") && side.includes("onClick={svarPlads}") &&
  api.includes('handling: svar === "ja" ? "tag_pladsen" : "afslaa_pladsen"') &&
  status.includes('raw === "tag_pladsen" ? "ja" : raw === "afslaa_pladsen" ? "nej" : null');
export const timeoutFindes = (k: string): boolean =>
  k.includes("new AbortController()") && k.includes("signal: styring.signal") && k.includes("CALENDLY_TIMEOUT_MS") && k.includes("clearTimeout(vaekkeur)");
export const teksterneErRigtige = (cron: string, mails: string, afsnit: string): boolean =>
  cron.includes("Tre rykkere uden booking") && !cron.includes("Fire rykkere") &&
  mails.includes("samtaledagOrd(k.samtaleStart, k.nu ?? new Date())") && !mails.includes('emne: "I morgen: vores snak"') &&
  afsnit.includes("Rykkerne kører (dag 2, 7 og 11).") && !afsnit.includes("dag 2, 4, 7 og 11");

describe("vejenVidere.guard — de otte rettelser på repoets filer", () => {
  it("1. aflys-grenen sammenligner event-uri før udfoerOvergang", () => expect(aflysGrenErRigtig(udenKommentarer(laes(WEBHOOK)))).toBe(true));
  it("2. created-grenen springer over ved samme event/starttid og giver Meet-linket videre", () => {
    expect(bookGrenErRigtig(udenKommentarer(laes(WEBHOOK)))).toBe(true);
    expect(dommeneErRene(udenKommentarer(laes(DOM)))).toBe(true);
  });
  it("3. «ikke nu» fra booket afvises; statussiden viser ikke knappen", () => {
    expect(ikkeNuErRigtig(udenKommentarer(laes(TRIN)), udenKommentarer(laes(STATUS)))).toBe(true);
    expect(ikkeNuErRigtig(udenKommentarer(laes(TRIN_SRC)), udenKommentarer(laes(STATUS)))).toBe(true);
  });
  it("4. pausen slipper: cronen går gennem motorens genoptag på datoen, og fire steder tester mod dato", () =>
    expect(pausenSlipper(udenKommentarer(laes(CRON)), udenKommentarer(laes(MOTOR)), udenKommentarer(laes(SAMTALE)), udenKommentarer(laes(LINK)), udenKommentarer(laes(VIEW)), udenKommentarer(laes(STATUS)))).toBe(true));
  it("5. aflysning starter indkaldt fra trin 1", () => expect(ingenDagNulEfterAflysning(udenKommentarer(laes(TRIN)), udenKommentarer(laes(RYK)), udenKommentarer(laes(MOTOR)))).toBe(true));
  it("6. ventelistens ja/nej virker på statussiden", () => expect(ventelistenVirker(udenKommentarer(laes(SIDE)), udenKommentarer(laes(API)), udenKommentarer(laes(STATUS)))).toBe(true));
  it("7. Calendly-kald har timeout", () => expect(timeoutFindes(udenKommentarer(laes(CALENDLY)))).toBe(true));
  it("8. teksterne", () => expect(teksterneErRigtige(udenKommentarer(laes(CRON)), udenKommentarer(laes(MAILS)), udenKommentarer(laes(AFSNIT)))).toBe(true));
});

describe("vejenVidere.guard — dommene fanger fejlen på en kopi", () => {
  it("1./2. webhook uden værnene fælder dom 1/2; en dom med IO fælder «rene»", () => {
    const w = udenKommentarer(laes(WEBHOOK));
    // Vagten står nu i TO grene (aflys + ikke_moedt, 20/9) — mutationen skal ramme alle
    // forekomster, ellers består dommen på den gren, der ikke blev rørt (replace uden /g).
    expect(aflysGrenErRigtig(w.split("if (vagt.aflys === false)").join("if (false)"))).toBe(false);
    expect(aflysGrenErRigtig(w.replace("skalWebhookAflyse({ ansoegningEventUri: ansoegning.calendly_event_uri, payloadEventUri: aflystEventUri })", "({ aflys: true })"))).toBe(false);
    expect(bookGrenErRigtig(w.replace("skalWebhookBooke({", "((_x: unknown) => ({ book: true }))({"))).toBe(false);
    expect(bookGrenErRigtig(w.replace("eventUri, moedeLink }", "eventUri }"))).toBe(false);
    expect(dommeneErRene(udenKommentarer(laes(DOM)) + "\nawait fetch('https://api.calendly.com');")).toBe(false);
  });
  it("3./4./5. ikke_nu fra booket tilladt, en rå null-test tilbage, eller dag 0 efter aflysning fælder dom 3/4/5", () => {
    const trin = udenKommentarer(laes(TRIN)), status = udenKommentarer(laes(STATUS));
    expect(ikkeNuErRigtig(trin.replace('if (fra === "booket") return AFVIST("ikke_nu: aflys samtalen først");', ""), status)).toBe(false);
    expect(ikkeNuErRigtig(trin, status.replace('visIkkeNu: false, titel: "Samtalen er booket"', 'visIkkeNu: true, titel: "Samtalen er booket"'))).toBe(false);
    const cron = udenKommentarer(laes(CRON)), motor = udenKommentarer(laes(MOTOR)), samtale = udenKommentarer(laes(SAMTALE)), link = udenKommentarer(laes(LINK)), view = udenKommentarer(laes(VIEW));
    expect(pausenSlipper(cron.replace('handling: { art: "genoptag" }, via: "koe"', 'handling: { art: "afholdt" }, via: "koe"'), motor, samtale, link, view, status)).toBe(false);
    expect(pausenSlipper(cron.replace('(raekke.trappe === "pause" && !a.paa_pause_til)', '(raekke.trappe === "pause" && !paaPause)'), motor, samtale, link, view, status)).toBe(false);
    expect(pausenSlipper(cron, motor, samtale.replace("if (erPaaPause(a.paa_pause_til, new Date())) return json({ error: \"Ansøgningen er på pause\" }, 409);", "if (a.paa_pause_til) return json({ error: \"Ansøgningen er på pause\" }, 409);"), link, view, status)).toBe(false);
    expect(pausenSlipper(cron, motor, samtale, link, view, status.replace("if (erPaaPause(s.paa_pause_til, nu)) {", "if (s.paa_pause_til) {"))).toBe(false);
    expect(ingenDagNulEfterAflysning(trin.replace(', fraTrinNr: 1 } });', " } });"), udenKommentarer(laes(RYK)), motor)).toBe(false);
    expect(ingenDagNulEfterAflysning(trin, udenKommentarer(laes(RYK)).replace("if (i.fraTrinNr !== undefined && t.trinNr < i.fraTrinNr) continue;", ""), motor)).toBe(false);
  });
  it("6./7./8. døde ventelisteknapper, manglende timeout eller de gamle tekster fælder dom 6/7/8", () => {
    const side = udenKommentarer(laes(SIDE)), api = udenKommentarer(laes(API)), status = udenKommentarer(laes(STATUS));
    expect(ventelistenVirker(side.replace("await svarPaaPladsen(token, pladsSvar)", "await Promise.resolve({ genaabnet: false })"), api, status)).toBe(false);
    expect(ventelistenVirker(side, api.replace('handling: svar === "ja" ? "tag_pladsen" : "afslaa_pladsen"', 'handling: "hent"'), status)).toBe(false);
    expect(timeoutFindes(udenKommentarer(laes(CALENDLY)).replace("signal: styring.signal,", ""))).toBe(false);
    const cron = udenKommentarer(laes(CRON)), mails = udenKommentarer(laes(MAILS)), afsnit = udenKommentarer(laes(AFSNIT));
    expect(teksterneErRigtige(cron.replace("Tre rykkere uden booking", "Fire rykkere uden booking"), mails, afsnit)).toBe(false);
    expect(teksterneErRigtige(cron, mails.split("samtaledagOrd(k.samtaleStart, k.nu ?? new Date())").join('"i morgen"'), afsnit)).toBe(false); // ordet står to steder (emne + tekst)
    expect(teksterneErRigtige(cron, mails, afsnit.replace("dag 2, 7 og 11", "dag 2, 4, 7 og 11"))).toBe(false);
  });
});
