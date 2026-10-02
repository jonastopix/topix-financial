import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * forsideKort.guard — forsidens to sidste kort (2/10-2026 eftermiddag):
 * «Dit certifikat» og «Din rådgiver». Kildelæsning med selvbevis på kopier
 * (seksSteder.guard-mønstret).
 *
 *   1. RÆKKEFØLGEN: «Din plan» → «Dit certifikat» → «Din rådgiver» → «Næste i
 *      Netværket», hvert kort tegnet ÉN gang i BoardroomView; rådgiverkortet
 *      kun for medlemmet (!isAdvisor) — også gatet i komponenten.
 *   2. FORHÅNDSVISNING, INGEN LÆSEMARKERING, INGEN TILDELING: rådgiverkortet
 *      (komponent, hook, ord) kalder aldrig mark_messages_read, skriver aldrig
 *      conversation_last_seen/read_at og læser aldrig assigned_advisor_id.
 *   3. HUSETS DOM: certifikatkortet læser useCertificate (→ certifikatDom) og
 *      regner INGEN egen regel — ingen getCertificateStatus, addMonths,
 *      MEMBERSHIP_MONTHS, UNLOCK_DAYS_BEFORE, new Date( eller Date.now i ordene.
 *   4. HOOKS I TOPBLOKKEN: i begge komponenter står hvert hook-kald før den
 *      første `return` (React #310-lærdommen).
 *   5. ÉN SKRIVEVEJ: insert i messages står i lib/chatSkrivevej.ts; medlemmets
 *      chat (begge steder) og kortet kalder indsaetChatBesked, og ingen af dem
 *      — eller kortets hook — har en egen insert. Kortet dømmer udfaldet med
 *      sendeUdfald og kalder notifyChatMessage som chatten.
 *   6. TOKENS: ingen hårdkodet farve-hex i de to komponenter.
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const FORSIDE = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const CERT_KOMP = "src/components/hjemmebane/forside/ForsideCertifikatKort.tsx";
const RAAD_KOMP = "src/components/hjemmebane/forside/ForsideRaadgiverKort.tsx";
const CERT_ORD = "src/lib/hjemmebane/certifikatKort.ts";
const RAAD_ORD = "src/lib/hjemmebane/raadgiverKort.ts";
const RAAD_HOOK = "src/hooks/raadgiverKort.ts";
const SKRIVEVEJ = "src/lib/chatSkrivevej.ts";
const PANE = "src/components/MemberChatPane.tsx";

/** Dom 1. */
export const raekkefoelgen = (forside: string, raadKomp: string): boolean => {
  const krop = forside.slice(forside.indexOf("export const BoardroomView = () => {"));
  const plan = krop.lastIndexOf('id="din-plan"');
  const cert = krop.indexOf("<ForsideCertifikatKort />");
  const raad = krop.indexOf("<ForsideRaadgiverKort />");
  const naeste = krop.indexOf("data-forside-naeste-netvaerk");
  return plan > -1 && cert > plan && raad > cert && naeste > raad &&
    (krop.match(/<ForsideCertifikatKort \/>/g) ?? []).length === 1 &&
    (krop.match(/<ForsideRaadgiverKort \/>/g) ?? []).length === 1 &&
    krop.includes("{companyId && !isAdvisor && <ForsideRaadgiverKort />}") &&
    raadKomp.includes("const aktiv = !isAdvisor && !!companyId && !!user;") &&
    raadKomp.includes("if (!aktiv || kort.isPending) return null;");
};

const LAESEMARKERING = /mark_messages_read|conversation_last_seen|useConversationLastSeen|read_at|assigned_advisor_id/;
/** Dom 2. */
export const ingenLaesemarkering = (...kilder: string[]): boolean => kilder.every((k) => !LAESEMARKERING.test(udenKommentarer(k)));

/** Dom 3. */
export const husetsDom = (certKomp: string, certOrd: string): boolean => {
  const o = udenKommentarer(certOrd);
  return certKomp.includes('import { useCertificate } from "@/hooks/useCertificate";') &&
    certKomp.includes("const certifikat = useCertificate();") &&
    certKomp.includes("certifikatKort({ loading: certifikat.loading, fejl: certifikat.fejl, dom: certifikat.dom })") &&
    o.includes('import type { CertifikatDom } from "@/lib/certifikat/dom";') &&
    o.includes("if (i.loading || i.fejl || !i.dom) return null;") &&
    o.includes("if (i.dom.synlig === false) return null;") &&
    !/getCertificateStatus|addMonths|MEMBERSHIP_MONTHS|UNLOCK_DAYS_BEFORE|new Date\(|Date\.now/.test(o);
};

/** Dom 4: hvert hook-kald før den første return i komponentens krop. */
export const hooksITopblokken = (komp: string, start: string): boolean => {
  const k = udenKommentarer(komp);
  const krop = k.slice(k.indexOf(start));
  const foersteReturn = krop.search(/\breturn\b/);
  if (krop.length === 0 || foersteReturn === -1) return false;
  const efter = krop.slice(foersteReturn);
  return /\buse[A-Z]\w*\(/.test(krop.slice(0, foersteReturn)) && !/\buse[A-Z]\w*\(/.test(efter);
};

/** Dom 5. */
export const enSkrivevej = (skrivevej: string, pane: string, raadKomp: string, raadHook: string): boolean => {
  const s = udenKommentarer(skrivevej), p = udenKommentarer(pane), r = udenKommentarer(raadKomp), h = udenKommentarer(raadHook);
  const insert = /\.from\(["']messages["']\)\s*\.insert\(/;
  return insert.test(s) && (s.match(/\.insert\(/g) ?? []).length === 1 &&
    s.includes("export async function indsaetChatBesked(raekke: ChatBeskedRaekke): Promise<IndsaetSvar>") &&
    !insert.test(p) && !insert.test(r) && !insert.test(h) && !/\.insert\(/.test(r) && !/\.insert\(/.test(h) &&
    p.includes("const svar = await indsaetChatBesked(insertData);") &&
    p.includes("const svar = await indsaetChatBesked(fejletBesked.raekke as ChatBeskedRaekke);") &&
    r.includes("const svar = await indsaetChatBesked({ conversation_id: data.samtaleId, sender_id: user.id, content });") &&
    r.includes('if (sendeUdfald(svar) === "sendt") {') &&
    r.includes("notifyChatMessage(ny.id);") &&
    r.includes("const content = kortetsContent(tekst);");
};

/** Dom 6. */
export const ingenHex = (...kilder: string[]): boolean => kilder.every((k) => !/#[0-9a-fA-F]{3,8}\b/.test(udenKommentarer(k)));

describe("forsideKort.guard — «Dit certifikat» og «Din rådgiver» på forsiden", () => {
  const forside = laes(FORSIDE), certKomp = laes(CERT_KOMP), raadKomp = laes(RAAD_KOMP);
  const certOrd = laes(CERT_ORD), raadOrd = laes(RAAD_ORD), raadHook = laes(RAAD_HOOK), skrivevej = laes(SKRIVEVEJ), pane = laes(PANE);

  it("dom 1: Din plan → Dit certifikat → Din rådgiver → Næste i Netværket; rådgiverkortet kun for medlemmet", () =>
    expect(raekkefoelgen(forside, raadKomp)).toBe(true));
  it("dom 2: rådgiverkortet markerer intet læst og læser aldrig assigned_advisor_id", () =>
    expect(ingenLaesemarkering(raadKomp, raadHook, raadOrd)).toBe(true));
  it("dom 3: certifikatkortet bruger husets dom — ingen egen regel", () => expect(husetsDom(certKomp, certOrd)).toBe(true));
  it("dom 4: hooks i topblokken i begge komponenter", () => {
    expect(hooksITopblokken(certKomp, "export const ForsideCertifikatKort = () => {")).toBe(true);
    expect(hooksITopblokken(raadKomp, "export const ForsideRaadgiverKort = () => {")).toBe(true);
  });
  it("dom 5: én skrivevej — chatten og kortet indsætter gennem indsaetChatBesked", () =>
    expect(enSkrivevej(skrivevej, pane, raadKomp, raadHook)).toBe(true));
  it("dom 6: ingen farve-hex", () => expect(ingenHex(certKomp, raadKomp)).toBe(true));
});

describe("forsideKort.guard — dommene fælder på en kopi", () => {
  const forside = laes(FORSIDE), certKomp = laes(CERT_KOMP), raadKomp = laes(RAAD_KOMP);
  const certOrd = laes(CERT_ORD), raadHook = laes(RAAD_HOOK), skrivevej = laes(SKRIVEVEJ), pane = laes(PANE);

  it("1: byttet rækkefølge, et kort under Næste i Netværket, eller rådgiverkortet til rådgivere, fælder", () => {
    const byttet = forside.replace("{companyId && <ForsideCertifikatKort />}\n      {companyId && !isAdvisor && <ForsideRaadgiverKort />}", "{companyId && !isAdvisor && <ForsideRaadgiverKort />}\n      {companyId && <ForsideCertifikatKort />}");
    expect(byttet).not.toBe(forside);
    expect(raekkefoelgen(byttet, raadKomp)).toBe(false);
    const nederst = forside.replace("{companyId && <ForsideCertifikatKort />}", "").replace("    </div>\n  );\n};", "      <ForsideCertifikatKort />\n    </div>\n  );\n};");
    expect(raekkefoelgen(nederst, raadKomp)).toBe(false);
    expect(raekkefoelgen(forside.replace("{companyId && !isAdvisor && <ForsideRaadgiverKort />}", "{companyId && <ForsideRaadgiverKort />}"), raadKomp)).toBe(false);
    expect(raekkefoelgen(forside, raadKomp.replace("const aktiv = !isAdvisor && !!companyId && !!user;", "const aktiv = !!companyId && !!user;"))).toBe(false);
  });
  it("2: mark_messages_read, conversation_last_seen eller assigned_advisor_id i kortet fælder", () => {
    expect(ingenLaesemarkering(raadKomp + '\nsupabase.rpc("mark_messages_read", { p_conversation_id: x });')).toBe(false);
    expect(ingenLaesemarkering(raadHook.replace('.select("id")', '.select("id, assigned_advisor_id")'))).toBe(false);
    expect(ingenLaesemarkering(raadKomp + "\nuseConversationLastSeen(x);")).toBe(false);
  });
  it("3: en egen regel for åbningen fælder", () => {
    expect(husetsDom(certKomp, certOrd + "\nconst x = addMonths(start, 12);")).toBe(false);
    expect(husetsDom(certKomp, certOrd + "\nconst nu = new Date();")).toBe(false);
    expect(husetsDom(certKomp.replace("const certifikat = useCertificate();", "const certifikat = egenDom();"), certOrd)).toBe(false);
  });
  it("4: et hook efter en return fælder", () => {
    const sent = raadKomp.replace("  const data = kort.data;", "  const data = kort.data;\n  const [x] = useState(0);");
    expect(sent).not.toBe(raadKomp);
    expect(hooksITopblokken(sent, "export const ForsideRaadgiverKort = () => {")).toBe(false);
  });
  it("5: en egen insert i kortet eller panelet fælder", () => {
    const egen = raadKomp.replace(
      "const svar = await indsaetChatBesked({ conversation_id: data.samtaleId, sender_id: user.id, content });",
      'const svar = await supabase.from("messages").insert({ conversation_id: data.samtaleId, sender_id: user.id, content }).select().single();',
    );
    expect(egen).not.toBe(raadKomp);
    expect(enSkrivevej(skrivevej, pane, egen, raadHook)).toBe(false);
    const panel = pane.replace("const svar = await indsaetChatBesked(insertData);", 'const svar = await supabase.from("messages").insert(insertData).select().single();');
    expect(enSkrivevej(skrivevej, panel, raadKomp, raadHook)).toBe(false);
    expect(enSkrivevej(skrivevej, pane, raadKomp.replace("notifyChatMessage(ny.id);", ""), raadHook)).toBe(false);
  });
  it("6: en hex-farve fælder", () => expect(ingenHex(raadKomp.replace('className="h-10 px-5 text-sm"', 'className="h-10 px-5 text-sm" style={{ color: "#123456" }}'))).toBe(false));
});
