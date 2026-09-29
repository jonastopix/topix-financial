import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for videosvarets flade (29/9-2026). Hver dom er grøn på repoets
 * filer OG rød på en kopi med fejlen indsat (mutationsprøverne nederst).
 *   1. KUN RÅDGIVEREN FÅR KAMERAET: `videoKnap=` står kun i CompanyChatPane,
 *      gated på isAdvisor; ChatRichInputs prop er valgfri og tegner kun en knap,
 *      når den er givet; optageren renderes kun i CompanyChatPane, gated.
 *   2. VISNINGEN: ingen dangerouslySetInnerHTML; præcis én iframe, hvis src er
 *      afspil-svarets embedUrl — aldrig en URL bygget i fladen; videoen findes
 *      kun gennem laesChatVideo.
 *   3. SLETNINGEN: chat-video «slet» FØR delete; fejler den, returneres der
 *      før delete; begge paner giver context_meta med.
 *   4. BOBLEN: begge paner skjuler markøren gennem erSkjultBobletekst (ingen
 *      gammel «📎»-sammenligning tilbage) og viser ChatVideoBesked ved hver
 *      MessageAttachments.
 *   5. OPTAGELSEN: formatet gennem vaelgOptageformat/isTypeSupported; stop ved
 *      MAKS_SEKUNDER; «Vælg fil» med accept video/* og doemFilLaengde på
 *      loadedmetadata.
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const foer = (k: string, a: string, b: string) => {
  const i = k.indexOf(a), j = k.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
};
const antal = (k: string, s: string | RegExp) => (typeof s === "string" ? k.split(s).length - 1 : (k.match(s) ?? []).length);

const COMPANY = "src/components/CompanyChatPane.tsx";
const MEMBER = "src/components/MemberChatPane.tsx";
const INPUT = "src/components/ChatRichInput.tsx";
const BESKED = "src/components/ChatVideoBesked.tsx";
const OPTAGER = "src/components/ChatVideoOptager.tsx";
const HANDLINGER = "src/hooks/useMessageActions.ts";

/** Alle .ts/.tsx under src (uden prøver), som {sti, kilde}. */
function alleSrcFiler(dir = "src"): { sti: string; kilde: string }[] {
  const ud: { sti: string; kilde: string }[] = [];
  for (const navn of readdirSync(resolve(ROD, dir)).sort()) {
    const sti = `${dir}/${navn}`;
    if (statSync(resolve(ROD, sti)).isDirectory()) {
      if (navn === "__tests__") continue;
      ud.push(...alleSrcFiler(sti));
    } else if (/\.tsx?$/.test(navn)) {
      ud.push({ sti, kilde: laes(sti) });
    }
  }
  return ud;
}

// ── 1 ──────────────────────────────────────────────────────────────────────
export const kunRaadgiverenFaarKameraet = (
  filer: readonly { sti: string; kilde: string }[],
  company: string,
  member: string,
  input: string,
): boolean => {
  // Hvem GIVER prop'en? «videoKnap={» uden for ChatRichInput selv (dér videregives den internt: videoKnap={videoKnap}).
  const giver = filer.filter((f) => f.sti !== INPUT && f.kilde.includes("videoKnap={")).map((f) => f.sti);
  const optager = filer.filter((f) => /<ChatVideoOptager\b/.test(f.kilde)).map((f) => f.sti);
  return giver.length === 1 && giver[0] === COMPANY &&
    optager.length === 1 && optager[0] === COMPANY &&
    company.includes("videoKnap={isAdvisor ? { onClick: () => setVideoOptagerAaben(true), fremdrift: videoFremdrift } : undefined}") &&
    /\{isAdvisor && \(\s*<ChatVideoOptager\b/.test(company) &&
    !member.includes("videoKnap") && !member.includes("ChatVideoOptager") &&
    input.includes("  videoKnap?: VideoKnap;") &&
    antal(input, "{videoKnap && (") === 2 &&
    foer(input, 'title="Vedhæft fil"', "{videoKnap && (") &&
    foer(input, 'aria-label="Vedhæft fil"', 'aria-label={videoKnap.fremdrift !== null ? "Videoen sendes" : "Optag video"}');
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const visningenErRen = (besked: string): boolean =>
  !besked.includes("dangerouslySetInnerHTML") &&
  antal(besked, /<iframe\b/g) === 1 &&
  /<iframe\s+src=\{svar\.embedUrl\}/.test(besked) &&
  besked.includes("const svar = afspil.data;") &&
  besked.includes('body: { action: "afspil", messageId },') &&
  besked.includes('supabase.functions.invoke("chat-video", {') &&
  !/mediadelivery|iframe\.src|\bsrc=\{`/.test(besked) &&
  besked.includes("const video = laesChatVideo(contextMeta);") &&
  foer(besked, "const afspil = useQuery({", "if (!video) return null;");

// ── 3 ──────────────────────────────────────────────────────────────────────
export const sletFoerDelete = (handlinger: string, company: string, member: string): boolean => {
  const fn = handlinger.slice(handlinger.indexOf("const deleteMessage = useCallback("), handlinger.indexOf("const canEdit = useCallback("));
  const PANE_KALD = "const ok = await deleteMessageAction(messageId, messages.find(m => m.id === messageId)?.context_meta);";
  return fn.includes("async (messageId: string, contextMeta?: unknown) => {") &&
    fn.includes("if (laesChatVideo(contextMeta)) {") &&
    foer(fn, 'body: { action: "slet", messageId },', ".delete()") &&
    foer(fn, "if (sletFejl || !sletGennemfoert(sletSvar)) {", ".delete()") &&
    /if \(sletFejl \|\| !sletGennemfoert\(sletSvar\)\) \{[^}]*return false;\s*\}/.test(fn) &&
    antal(fn, ".delete()") === 1 &&
    company.includes(PANE_KALD) && member.includes(PANE_KALD);
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const boblenSkjulerMarkoeren = (pane: string): boolean =>
  !pane.includes('msg.content !== "📎"') &&
  antal(pane, "{!erSkjultBobletekst(msg.content) && (") === 2 &&
  antal(pane, "<ChatVideoBesked messageId={msg.id} contextMeta={msg.context_meta} />") === 2 &&
  antal(pane, /<MessageAttachments [^\n]*\/>\s*<ChatVideoBesked messageId=\{msg\.id\} contextMeta=\{msg\.context_meta\} \/>/g) === 2;

// ── 5 ──────────────────────────────────────────────────────────────────────
export const optagelsenHolderLoftet = (optager: string): boolean =>
  optager.includes("const format = vaelgOptageformat((t) => MediaRecorder.isTypeSupported(t));") &&
  optager.includes("if (s >= MAKS_SEKUNDER) stopOptagelse();") &&
  optager.includes('accept="video/*"') &&
  optager.includes("v.onloadedmetadata = () => afslut(doemFilLaengde(v.duration), v.duration);") &&
  optager.includes('if (dom === "ok") {') &&
  optager.includes("navigator.mediaDevices.getUserMedia({ video: { facingMode: \"user\" }, audio: true })");

describe("chatVideoFlade.guard — de fem domme på repoets filer", () => {
  const filer = alleSrcFiler();
  it("1. kun CompanyChatPane giver videoKnap (gated på isAdvisor); medlemmets input er uændret", () =>
    expect(kunRaadgiverenFaarKameraet(filer, laes(COMPANY), laes(MEMBER), laes(INPUT))).toBe(true));
  it("2. visningen: ingen dangerouslySetInnerHTML; iframe-src kun fra afspil-svaret", () => expect(visningenErRen(laes(BESKED))).toBe(true));
  it("3. sletning kalder slet før delete, og en fejl stopper delete", () =>
    expect(sletFoerDelete(laes(HANDLINGER), laes(COMPANY), laes(MEMBER))).toBe(true));
  it("4. begge paner skjuler markøren og viser videoen", () => {
    expect(boblenSkjulerMarkoeren(laes(COMPANY))).toBe(true);
    expect(boblenSkjulerMarkoeren(laes(MEMBER))).toBe(true);
  });
  it("5. optagelsen: MP4-først-valget, loftet og længdetjekket på filen", () => expect(optagelsenHolderLoftet(laes(OPTAGER))).toBe(true));
});

describe("chatVideoFlade.guard — dommene fanger fejlen på en kopi", () => {
  const byt = (k: string, fra: string | RegExp, til: string) => {
    const ny = typeof fra === "string" ? k.split(fra).join(til) : k.replace(fra, til);
    expect(ny, `mutationen ramte ikke: ${String(fra)}`).not.toBe(k);
    return ny;
  };

  it("1. videoKnap i medlemmets pane, uden isAdvisor-gate, eller knappen uden prop fælder dom 1", () => {
    const filer = alleSrcFiler();
    const c = laes(COMPANY), m = laes(MEMBER), i = laes(INPUT);
    const mMedKnap = byt(m, "variant=\"hb\"\n", "variant=\"hb\"\n                    videoKnap={{ onClick: () => {}, fremdrift: null }}\n");
    const filerMed = filer.map((f) => (f.sti === MEMBER ? { ...f, kilde: mMedKnap } : f));
    expect(kunRaadgiverenFaarKameraet(filerMed, c, mMedKnap, i)).toBe(false);
    const cUdenGate = byt(c, "videoKnap={isAdvisor ? { onClick", "videoKnap={true ? { onClick");
    expect(kunRaadgiverenFaarKameraet(filer.map((f) => (f.sti === COMPANY ? { ...f, kilde: cUdenGate } : f)), cUdenGate, m, i)).toBe(false);
    expect(kunRaadgiverenFaarKameraet(filer, c, m, byt(i, /\{videoKnap && \(/g, "{true && ("))).toBe(false);
    expect(kunRaadgiverenFaarKameraet(filer, c, m, byt(i, "  videoKnap?: VideoKnap;", "  videoKnap: VideoKnap;"))).toBe(false);
  });

  it("2. HTML, en bygget URL eller en anden iframe-kilde fælder dom 2", () => {
    const b = laes(BESKED);
    expect(visningenErRen(`${b}\nconst x = <div dangerouslySetInnerHTML={{ __html: "" }} />;\n`)).toBe(false);
    expect(visningenErRen(byt(b, "src={svar.embedUrl}", "src={`https://iframe.mediadelivery.net/embed/1/${messageId}`}"))).toBe(false);
    expect(visningenErRen(byt(b, "src={svar.embedUrl}", "src={(contextMeta as any)?.video?.url}"))).toBe(false);
    expect(visningenErRen(`${b}\nconst y = <iframe src={svar.embedUrl} />;\n`)).toBe(false);
    expect(visningenErRen(byt(b, 'body: { action: "afspil", messageId },', 'body: { action: "opret", messageId },'))).toBe(false);
  });

  it("3. delete før slet, en fejl der ikke stopper, eller en pane uden context_meta fælder dom 3", () => {
    const h = laes(HANDLINGER), c = laes(COMPANY), m = laes(MEMBER);
    const flyttet = byt(h, "    if (laesChatVideo(contextMeta)) {", "    await supabase.from(messageTable as any).delete().eq(\"id\", messageId);\n    if (laesChatVideo(contextMeta)) {");
    expect(sletFoerDelete(flyttet, c, m)).toBe(false);
    expect(sletFoerDelete(byt(h, /toast\.error\("Videoen kunne ikke slettes — beskeden står uændret\."\);\n\s*return false;/, 'toast.error("Videoen kunne ikke slettes — beskeden står uændret.");'), c, m)).toBe(false);
    expect(sletFoerDelete(h, byt(c, "?.context_meta);", ");"), m)).toBe(false);
    expect(sletFoerDelete(h, c, byt(m, "?.context_meta);", ");"))).toBe(false);
  });

  it("4. den gamle «📎»-sammenligning eller en pane uden videoen fælder dom 4", () => {
    const c = laes(COMPANY);
    expect(boblenSkjulerMarkoeren(byt(c, /\{!erSkjultBobletekst\(msg\.content\) && \(/, '{msg.content !== "📎" && ('))).toBe(false);
    expect(boblenSkjulerMarkoeren(byt(c, /\n\s*<ChatVideoBesked messageId=\{msg\.id\} contextMeta=\{msg\.context_meta\} \/>/, ""))).toBe(false);
  });

  it("5. et fast format, intet loft eller intet længdetjek fælder dom 5", () => {
    const o = laes(OPTAGER);
    expect(optagelsenHolderLoftet(byt(o, "const format = vaelgOptageformat((t) => MediaRecorder.isTypeSupported(t));", 'const format = "video/webm";'))).toBe(false);
    expect(optagelsenHolderLoftet(byt(o, "if (s >= MAKS_SEKUNDER) stopOptagelse();", ""))).toBe(false);
    expect(optagelsenHolderLoftet(byt(o, "afslut(doemFilLaengde(v.duration), v.duration)", 'afslut("ok", v.duration)'))).toBe(false);
    expect(optagelsenHolderLoftet(byt(o, 'accept="video/*"', 'accept="*"'))).toBe(false);
  });
});
