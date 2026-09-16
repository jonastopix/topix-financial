import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (16/9-2026): rådgivernes klokke ved et nyt opslag i Community.
// Fire ting låses, læst i kilden fordi functionen rører Supabase og npm:
//   1. notify-community-opslag importerer skrivRaadgiverBesked (husets writer,
//      raadgiverBesked.ts) og beskedVedNytOpslag (den rene dom) — og kalder
//      writeren KUN gennem dommen: `const besked = beskedVedNytOpslag({…})`
//      med forfatterErRaadgiver, og `if (besked)` før kaldet.
//   2. Klokken står EFTER writeNotificationToMany (medlemmernes rækker
//      først) og FØR svaret `return jsonResponse({ notificeret })` — inde i
//      try/catch med console.error, så den aldrig koster medlemmernes
//      notifikationer eller svaret.
//   3. Forfatterens rolle slås op i user_roles på advisor/admin (admin arver
//      advisor) med adminClient.
//   4. Ingen mail-vej rører advisor_notifications: send-notification-email og
//      _shared/samlemail.ts nævner ikke tabellen.
// Dommene er navngivne og rene over kildetekst; «VÆRNET VIRKER» kører dem på
// kopier med fejlen indsat (spaerretMail.guard-mønstret).

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const OPSLAG = "supabase/functions/notify-community-opslag/index.ts";
const MAILKOE = "supabase/functions/send-notification-email/index.ts";
const SAMLEMAIL = "supabase/functions/_shared/samlemail.ts";

const IMPORT_WRITER = 'import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";';
const IMPORT_DOM = 'import { beskedVedNytOpslag } from "../_shared/communityOpslagBesked.ts";';
const KALD_WRITER = "await skrivRaadgiverBesked(adminClient, besked)";
const KALD_MEDLEMMER = "await writeNotificationToMany(adminClient, modtagere, {";
const SVARET = "return jsonResponse({ notificeret });";

/** Klokkeblokken: fra `try {` efter writeNotificationToMany til `return jsonResponse({ notificeret })`. */
export function klokkeBlok(kilde: string): string {
  const medlemmer = kilde.indexOf(KALD_MEDLEMMER);
  if (medlemmer === -1) throw new Error("fandt ikke writeNotificationToMany-kaldet");
  const start = kilde.indexOf("try {", medlemmer);
  const slut = kilde.indexOf(SVARET, medlemmer);
  if (start === -1 || slut === -1 || start > slut) return "";
  return kilde.slice(start, slut);
}

/** Dom 1: writer og dom importeres; writeren kaldes kun gennem `if (besked)`. */
export const kalderGennemDommen = (kilde: string): boolean => {
  const blok = klokkeBlok(kilde);
  return (
    kilde.includes(IMPORT_WRITER) &&
    kilde.includes(IMPORT_DOM) &&
    blok.includes("const besked = beskedVedNytOpslag({") &&
    blok.includes("forfatterErRaadgiver,") &&
    blok.includes("if (besked) {") &&
    blok.indexOf("if (besked) {") < blok.indexOf(KALD_WRITER) &&
    (kilde.match(/skrivRaadgiverBesked\(/g) ?? []).length === 1
  );
};

/** Dom 2: efter medlemmernes rækker, før svaret, i try/catch med console.error. */
export const efterMedlemmerneITryCatch = (kilde: string): boolean => {
  const medlemmer = kilde.indexOf(KALD_MEDLEMMER);
  const writer = kilde.indexOf(KALD_WRITER);
  const svar = kilde.indexOf(SVARET);
  if (medlemmer === -1 || writer === -1 || svar === -1) return false;
  if (!(medlemmer < writer && writer < svar)) return false;
  const blok = klokkeBlok(kilde);
  return blok.startsWith("try {") && /\}\s*catch \(err\) \{[\s\S]*console\.error\(/.test(blok) && blok.includes(KALD_WRITER);
};

/** Dom 3: rollen slås op i user_roles på advisor/admin for forfatteren. */
export const rollenSlaasOp = (kilde: string): boolean => {
  const blok = klokkeBlok(kilde);
  return (
    blok.includes('.from("user_roles")') &&
    blok.includes('.eq("user_id", traad.forfatter_id)') &&
    blok.includes('.in("role", ["advisor", "admin"])') &&
    blok.includes("const forfatterErRaadgiver = (roller ?? []).length > 0;")
  );
};

/** Dom 4: mail-vejen nævner ikke advisor_notifications. */
export const mailVejenLaeserIkkeKlokken = (kilde: string): boolean => !/advisor_notifications/.test(kilde);

describe("klokkeCommunity.guard — rådgivernes klokke ved et nyt opslag", () => {
  const opslag = udenKommentarer(laes(OPSLAG));
  const mailkoe = udenKommentarer(laes(MAILKOE));
  const samlemail = udenKommentarer(laes(SAMLEMAIL));

  it("1. writeren kaldes kun gennem beskedVedNytOpslag (forfatterErRaadgiver → null) og `if (besked)`", () => {
    expect(kalderGennemDommen(opslag)).toBe(true);
  });
  it("2. klokken står efter writeNotificationToMany og før svaret, i try/catch med console.error — svaret er uændret", () => {
    expect(efterMedlemmerneITryCatch(opslag)).toBe(true);
    expect((opslag.match(/return jsonResponse\(\{ notificeret \}\);/g) ?? []).length).toBe(1);
  });
  it("3. forfatterens rolle slås op i user_roles på advisor/admin", () => {
    expect(rollenSlaasOp(opslag)).toBe(true);
  });
  it("4. ingen mail-vej rører advisor_notifications", () => {
    expect(mailVejenLaeserIkkeKlokken(mailkoe)).toBe(true);
    expect(mailVejenLaeserIkkeKlokken(samlemail)).toBe(true);
  });
  it("den rene fil er ren: kun opslagsMail-importen, ingen Supabase", () => {
    const ren = udenKommentarer(laes("supabase/functions/_shared/communityOpslagBesked.ts"));
    expect(ren.match(/^import .*$/gm) ?? []).toEqual(['import { visningsnavn } from "./opslagsMail.ts";']);
    // Kun notify-community-opslag importerer den (udrulningslisten er én function).
    expect(opslag).toContain(IMPORT_DOM);
  });
});

describe("klokkeCommunity.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const opslag = udenKommentarer(laes(OPSLAG));

  it("1. et writer-kald uden dommen, eller uden `if (besked)`, fælder dom 1", () => {
    expect(kalderGennemDommen(opslag.replace("if (besked) {", "if (true) {"))).toBe(false);
    expect(kalderGennemDommen(opslag.replace("forfatterErRaadgiver,", "forfatterErRaadgiver: false,"))).toBe(false);
    expect(kalderGennemDommen(opslag + "\nawait skrivRaadgiverBesked(adminClient, besked);\n")).toBe(false);
  });
  it("2. klokken FØR medlemmernes rækker, eller uden catch, fælder dom 2", () => {
    const blok = klokkeBlok(opslag);
    const foer = opslag.replace(blok, "").replace(KALD_MEDLEMMER, blok + KALD_MEDLEMMER);
    expect(efterMedlemmerneITryCatch(foer)).toBe(false);
    expect(efterMedlemmerneITryCatch(opslag.replace("console.error(\"[notify-community-opslag] klokken ringede ikke —\"", "void("))).toBe(false);
  });
  it("3. en rolle slået op uden admin fælder dom 3", () => {
    expect(rollenSlaasOp(opslag.replace('.in("role", ["advisor", "admin"])', '.eq("role", "advisor")'))).toBe(false);
  });
  it("4. en mailkø der læser advisor_notifications fælder dom 4", () => {
    expect(mailVejenLaeserIkkeKlokken('await admin.from("advisor_notifications").select("*")')).toBe(false);
  });
});
