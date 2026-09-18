import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for generalprøvens to rester (18/9-2026):
//   BRIST 8 — statussidens «Læs og underskriv» peger på e-underskriften, når der findes en
//   aftale på ansøgningen, og kun på aftale_url når der ingen findes.
//     1. ansoegning-link slår aftale_underskrift op på ansoegning_id — EFTER ansøgningens token
//        er verificeret, FØR nogen overgang — kun ikke-annullerede, nyeste først — og lægger
//        `underskrift` i svaret via den rene dom aftaleTilAnsoeger.
//     2. status.ts vælger e-underskriftens url når den kan underskrives; aftale_url KUN når
//        der ingen aftale er; udløbet/annulleret giver ingen knap.
//     3. AnsoegStatus bruger dommens `aftale` som href — ikke aftale_url direkte.
//   BRIST 7 — mailen til kontakt@ kan SES.
//     4. Motoren sender den med label «ansoegning-ny-raadgiver» og metadata.ansoegning_id — det
//        er nøglen, dommen og loggen finder den på.
//     5. Komponenten læser email_send_log på netop label + metadata, og på bounces/klager for
//        kontaktadressen; den er monteret på ansøgningen.
// Selvbevis: hvert prædikat fælder en muteret kopi.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");
const foer = (k: string, a: string, b: string): boolean => k.includes(a) && k.includes(b) && k.indexOf(a) < k.indexOf(b);

const LINK = "supabase/functions/ansoegning-link/index.ts";
const STATUS = "src/lib/ansoegning/status.ts";
const SIDE = "src/pages/AnsoegStatus.tsx";
const MOTOR = "supabase/functions/_shared/ansoegningMotor.ts";
const KOMPONENT = "src/components/hjemmebane/ansoegninger/AnsoegningRaadgivermail.tsx";
const VIEW = "src/components/hjemmebane/ansoegninger/AnsoegningView.tsx";

export const linkSlaarAftalenOp = (k: string): boolean =>
  foer(k, "verifyAnsoegningslink(token, admin)", '.from("aftale_underskrift")') &&
  foer(k, '.from("aftale_underskrift")', "udfoerOvergang(") &&
  /\.from\("aftale_underskrift"\)[\s\S]{0,200}\.eq\("ansoegning_id", a\.id\)[\s\S]{0,120}\.neq\("status", "annulleret"\)[\s\S]{0,120}\.order\("sendt_at", \{ ascending: false \}\)/.test(k) &&
  k.includes("const underskrift = aftaleTilAnsoeger(") && /\n\s*underskrift,\n/.test(k);

export const statusVaelgerEUnderskriften = (k: string): boolean =>
  k.includes("const aftale = u ? u.url : s.aftale_url;") &&
  k.includes('if (u?.tilstand === "udloebet") {') && k.includes('if (u?.tilstand === "underskrevet") {') &&
  k.includes('if (u && u.tilstand !== "kan_underskrives") {');

export const sidenBrugerDommen = (k: string): boolean => k.includes("href={v.aftale}") && !/href=\{[^}]*aftale_url/.test(k);

export const motorenSenderMedNoeglen = (k: string): boolean =>
  k.includes('label: "ansoegning-ny-raadgiver",') && k.includes("metadata: { ansoegning_id: a.id },") && k.includes("idempotencyKey: `ansoegning-ny-raadgiver-${a.id}`");

export const komponentenLaeserLoggen = (k: string, view: string): boolean =>
  k.includes('.from("email_send_log")') &&
  k.includes('.eq("template_name", RAADGIVERMAIL_LABEL).contains("metadata", { ansoegning_id: ansoegningId })') &&
  k.includes('.eq("recipient_email", KONTAKT_ADRESSE).in("status", ["bounced", "complained"])') &&
  view.includes("<AnsoegningRaadgivermail ansoegningId={a.id} />");

describe("generalproeveRest2.guard — brist 8: statussiden peger på e-underskriften", () => {
  it("1. ansoegning-link: aftalen slås op efter tokenet, før overgange; ikke-annulleret, nyeste; underskrift i svaret", () => {
    expect(linkSlaarAftalenOp(udenKommentarer(laes(LINK)))).toBe(true);
  });
  it("2. status.ts: e-underskriften vinder; aftale_url kun uden aftale; udløbet/annulleret/underskrevet uden knap", () => {
    expect(statusVaelgerEUnderskriften(udenKommentarer(laes(STATUS)))).toBe(true);
  });
  it("3. AnsoegStatus bruger dommens aftale, aldrig aftale_url direkte", () => {
    expect(sidenBrugerDommen(udenKommentarer(laes(SIDE)))).toBe(true);
  });
});

describe("generalproeveRest2.guard — brist 7: mailen til kontakt@ kan ses", () => {
  it("4. motoren sender med label + metadata.ansoegning_id + idempotensnøgle", () => {
    expect(motorenSenderMedNoeglen(udenKommentarer(laes(MOTOR)))).toBe(true);
  });
  it("5. komponenten læser loggen på nøglen og bounces på kontaktadressen, og er monteret på ansøgningen", () => {
    expect(komponentenLaeserLoggen(udenKommentarer(laes(KOMPONENT)), udenKommentarer(laes(VIEW)))).toBe(true);
  });
});

describe("generalproeveRest2.guard — selvbevis", () => {
  const link = udenKommentarer(laes(LINK));
  it("1: opslaget flyttet foran tokenet, eller annullerede med, falder", () => {
    expect(linkSlaarAftalenOp(link.replace("const a = await verifyAnsoegningslink(token, admin);", "").replace("const svar = () => ({", "const a = await verifyAnsoegningslink(token, admin);\n  const svar = () => ({"))).toBe(false);
    expect(linkSlaarAftalenOp(link.replace('.neq("status", "annulleret")', ""))).toBe(false);
  });
  it("2: aftale_url som første valg falder", () => {
    expect(statusVaelgerEUnderskriften(udenKommentarer(laes(STATUS)).replace("const aftale = u ? u.url : s.aftale_url;", "const aftale = s.aftale_url ?? u?.url ?? null;"))).toBe(false);
  });
  it("3: href på aftale_url falder", () => {
    expect(sidenBrugerDommen(udenKommentarer(laes(SIDE)).replace("href={v.aftale}", "href={svar.aftale_url}"))).toBe(false);
  });
  it("4 og 5: uden metadata, eller uden montering, falder", () => {
    expect(motorenSenderMedNoeglen(udenKommentarer(laes(MOTOR)).replace("metadata: { ansoegning_id: a.id },", ""))).toBe(false);
    expect(komponentenLaeserLoggen(udenKommentarer(laes(KOMPONENT)), udenKommentarer(laes(VIEW)).replace("<AnsoegningRaadgivermail ansoegningId={a.id} />", ""))).toBe(false);
  });
});
