import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * forsideKort.guard — forsidens to sidste kort (2/10-2026 eftermiddag):
 * «Dit certifikat» og «Din rådgiver». Kildelæsning med selvbevis på kopier
 * (seksSteder.guard-mønstret).
 *
 *   1. RÆKKEFØLGEN (FORSIDE V3, 2/10-2026 aften — docs/forside-v3.md §0): felterne
 *      i HTML-rækkefølge vigtigst → til-gode → tal-og-score → plan → raadgiver →
 *      netvaerk (= prioritet = mobil = skærmlæser); rådgiverkortet ÉN gang og kun
 *      for medlemmet (!isAdvisor) — også gatet i komponenten. Certifikatet er en
 *      LINJE i Score-kortet (certifikatScore), ikke længere et kort på forsiden
 *      (før v3: «Din plan» → «Dit certifikat» → «Din rådgiver» → «Næste i Netværket»).
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

/** Dom 1 (forside v3). */
export const FELTER = ["vigtigst", "til-gode", "tal-og-score", "plan", "raadgiver", "netvaerk"] as const;
export const raekkefoelgen = (forside: string, raadKomp: string): boolean => {
  const krop = forside.slice(forside.indexOf("export const BoardroomView = () => {"));
  const pos = FELTER.map((f) => krop.indexOf(`data-felt="${f}"`));
  const iOrden = pos.every((p, i) => p > -1 && (i === 0 || p > pos[i - 1]!)) && FELTER.every((f) => krop.split(`data-felt="${f}"`).length === 2);
  return iOrden &&
    !krop.includes("<ForsideCertifikatKort") &&
    krop.includes("certifikat={certifikatScore}") &&
    (krop.match(/<ForsideRaadgiverKort /g) ?? []).length === 1 &&
    krop.includes("{companyId && !isAdvisor && (\n          <Felt kol={2} data-felt=\"raadgiver\">\n            <ForsideRaadgiverKort className=\"\" />") &&
    raadKomp.includes("const aktiv = !isAdvisor && !!companyId && !!user;") &&
    raadKomp.includes("if (!aktiv || kort.isPending) return null;");
};

/** Dom 7 (forside v3 §5): kortet viser KUN rådgivernes beskeder — rådgiverlisten er den synlige (uden
    tjenestekonto), hentet i samme queryFn (fail-closed), og valget er den rene senesteFraRaadgiver. */
export const kunRaadgivernes = (raadHook: string, raadOrd: string): boolean => {
  const h = udenKommentarer(raadHook), o = udenKommentarer(raadOrd);
  return h.includes("await hentSynligeRaadgiverProfiler()") &&
    h.includes("const seneste = senesteFraRaadgiver(") &&
    !h.includes("get_conversation_sender_profiles") &&
    o.includes("return beskeder.find((b) => ids.has(b.sender_id)) ?? null;");
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

  it("dom 1 (v3): vigtigst → til-gode → tal-og-score → plan → raadgiver → netvaerk; certifikatet i Score; rådgiverkortet kun for medlemmet", () =>
    expect(raekkefoelgen(forside, raadKomp)).toBe(true));
  it("dom 7 (v3): kun rådgivernes beskeder — synlig rådgiverliste, fail-closed, ren dom", () =>
    expect(kunRaadgivernes(raadHook, raadOrd)).toBe(true));
  it("dom 2: rådgiverkortet markerer intet læst og læser aldrig assigned_advisor_id", () =>
    expect(ingenLaesemarkering(raadKomp, raadHook, raadOrd)).toBe(true));
  it("dom 3: certifikatkortet bruger husets dom — ingen egen regel", () => expect(husetsDom(certKomp, certOrd)).toBe(true));
  it("dom 4: hooks i topblokken i begge komponenter", () => {
    expect(hooksITopblokken(certKomp, "export const ForsideCertifikatKort = () => {")).toBe(true);
    expect(hooksITopblokken(raadKomp, "export const ForsideRaadgiverKort = (")).toBe(true);
  });
  it("dom 5: én skrivevej — chatten og kortet indsætter gennem indsaetChatBesked", () =>
    expect(enSkrivevej(skrivevej, pane, raadKomp, raadHook)).toBe(true));
  it("dom 6: ingen farve-hex", () => expect(ingenHex(certKomp, raadKomp)).toBe(true));
});

describe("forsideKort.guard — dommene fælder på en kopi", () => {
  const forside = laes(FORSIDE), certKomp = laes(CERT_KOMP), raadKomp = laes(RAAD_KOMP);
  const certOrd = laes(CERT_ORD), raadHook = laes(RAAD_HOOK), skrivevej = laes(SKRIVEVEJ), pane = laes(PANE);

  it("1: byttet rækkefølge, certifikatkortet tilbage, eller rådgiverkortet til rådgivere, fælder", () => {
    const byttet = forside.replace('data-felt="plan"', 'data-felt="X"').replace('data-felt="netvaerk"', 'data-felt="plan"').replace('data-felt="X"', 'data-felt="netvaerk"');
    expect(byttet).not.toBe(forside);
    expect(raekkefoelgen(byttet, raadKomp)).toBe(false);
    const certTilbage = forside.replace("      </Pakning>", "      </Pakning>\n      <ForsideCertifikatKort />");
    expect(raekkefoelgen(certTilbage, raadKomp)).toBe(false);
    expect(raekkefoelgen(forside.replace("{companyId && !isAdvisor && (\n          <Felt kol={2} data-felt=\"raadgiver\">", "{companyId && (\n          <Felt kol={2} data-felt=\"raadgiver\">"), raadKomp)).toBe(false);
    expect(raekkefoelgen(forside, raadKomp.replace("const aktiv = !isAdvisor && !!companyId && !!user;", "const aktiv = !!companyId && !!user;"))).toBe(false);
  });
  it("7: medlemmets egen besked eller en anden afsenderliste fælder", () => {
    const ord = laes(RAAD_ORD);
    expect(kunRaadgivernes(raadHook.replace("const seneste = senesteFraRaadgiver(", "const seneste = foersteBesked("), ord)).toBe(false);
    expect(kunRaadgivernes(raadHook.replace("await hentSynligeRaadgiverProfiler()", "await hentAlleProfiler()"), ord)).toBe(false);
    expect(kunRaadgivernes(raadHook, ord.replace("return beskeder.find((b) => ids.has(b.sender_id)) ?? null;", "return beskeder[0] ?? null;"))).toBe(false);
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
    expect(hooksITopblokken(sent, "export const ForsideRaadgiverKort = (")).toBe(false);
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
  it("6: en hex-farve fælder", () => expect(ingenHex(raadKomp.replace('className="h-10 shrink-0 px-5 text-sm"', 'className="h-10 shrink-0 px-5 text-sm" style={{ color: "#123456" }}'))).toBe(false));
});
