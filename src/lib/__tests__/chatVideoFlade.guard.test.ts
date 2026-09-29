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
 *      kun gennem laesChatVideo. Fladen kender hverken bibliotek, collection
 *      eller nogen BUNNY_*-secret (29/9 aften: eget bibliotek — alt om Bunny
 *      bor i chat-video; iframen er Bunnys player, den eneste med JIT).
 *   3. SLETNINGEN: chat-video «slet» FØR delete; fejler den, returneres der
 *      før delete; begge paner giver context_meta med.
 *   4. BOBLEN: begge paner skjuler markøren gennem erSkjultBobletekst (ingen
 *      gammel «📎»-sammenligning tilbage) og viser ChatVideoBesked ved hver
 *      MessageAttachments.
 *   5. OPTAGELSEN: formatet gennem vaelgOptageformat/isTypeSupported; stop ved
 *      MAKS_SEKUNDER; «Vælg fil» med accept video/* og doemFilLaengde på
 *      loadedmetadata. INGEN AUTOMATISK START (Jonas 29/9): dialogen åbner i
 *      «vaelg»; getUserMedia står ÉT sted, inde i startOptagelse, og effekten på
 *      `open` kalder hverken startOptagelse eller getUserMedia — kun knapperne
 *      «Optag video» og «Optag igen» starter kameraet.
 *   6. DEN BEDSTE OPLEVELSE (Jonas 29/9): (a) «behandles» spørges hvert 2. sekund
 *      det første minut (AFSPIL_POLL_HURTIG_MS = 2_000, …_INDTIL_MS = 60_000) og
 *      derefter hvert 10. sekund til loftet — dømt i naesteAfspilForespoergsel;
 *      (b) INGEN TOM VIDEO: erTomFil FØR onSend i optagerens Send og FØR
 *      længden i «Vælg fil», med Jonas' to linjer; (c) SENDELINJEN: CompanyChatPane
 *      tegner ChatVideoSendeLinje FØR ChatRichInput, sætter sender/sendt/fejl i
 *      handleSendVideo, og bruger INGEN toast om uploaden — kun den udløbne
 *      virksomheds toast bliver; «Prøv igen» sender den samme fil (videoIgenRef).
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
const FLADE = "src/lib/chatVideoFlade.ts";
const SENDELINJE = "src/components/ChatVideoSendeLinje.tsx";

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
  !/collection|BUNNY_|libraryId|video\.bunnycdn\.com/i.test(besked) &&
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
/** Effekten på `open`: fra markøren til dens afslutning (`}, [open`). */
const openEffekten = (k: string): string => {
  const i = k.indexOf("// Åbnes dialogen");
  if (i === -1) return "";
  const j = k.indexOf("}, [open", i);
  return j === -1 ? "" : k.slice(i, j);
};

export const optagelsenHolderLoftet = (optager: string): boolean => {
  const effekt = openEffekten(optager);
  const start = optager.slice(optager.indexOf("const startOptagelse = useCallback("), optager.indexOf("const vaelgFil = useCallback("));
  const kaldAfKamera = (optager.match(/\.getUserMedia\(/g) ?? []).length;
  return optager.includes("const format = vaelgOptageformat((t) => MediaRecorder.isTypeSupported(t));") &&
  optager.includes("if (s >= MAKS_SEKUNDER) stopOptagelse();") &&
  optager.includes('accept="video/*"') &&
  optager.includes("v.onloadedmetadata = () => afslut(doemFilLaengde(v.duration), v.duration);") &&
  optager.includes('if (dom === "ok") {') &&
  optager.includes("navigator.mediaDevices.getUserMedia({ video: { facingMode: \"user\" }, audio: true })") &&
  // Ingen automatisk start: dialogen åbner i «vaelg», kameraet kun fra «Optag».
  optager.includes('const [fase, setFase] = useState<Fase>("vaelg");') &&
  kaldAfKamera === 1 && start.includes(".getUserMedia(") &&
  effekt !== "" && effekt.includes('setFase("vaelg");') &&
  !effekt.includes("startOptagelse(") && !effekt.includes("getUserMedia") &&
  /onClick=\{\(\) => void startOptagelse\(\)\}>\s*Optag video\s*</.test(optager);
};

// ── 6 ──────────────────────────────────────────────────────────────────────
/** (a) Takten: 2 s i 60 s, så 10 s til loftet — i dommen, ikke i fladen. */
export const taktenErHurtigFoerst = (flade: string): boolean => {
  const fn = flade.slice(flade.indexOf("export function naesteAfspilForespoergsel("), flade.indexOf("export function sletGennemfoert("));
  return flade.includes("export const AFSPIL_POLL_HURTIG_MS = 2_000;") &&
    flade.includes("export const AFSPIL_POLL_HURTIG_INDTIL_MS = 60_000;") &&
    flade.includes("export const AFSPIL_POLL_MS = 10_000;") &&
    flade.includes("export const AFSPIL_POLL_MAKS_MS = 10 * 60_000;") &&
    fn.includes("const gaaet = i.nuMs - i.foersteMs;") &&
    fn.includes("if (gaaet < AFSPIL_POLL_HURTIG_INDTIL_MS) return AFSPIL_POLL_HURTIG_MS;") &&
    fn.includes("return gaaet < AFSPIL_POLL_MAKS_MS ? AFSPIL_POLL_MS : false;") &&
    foer(fn, "if (gaaet < AFSPIL_POLL_HURTIG_INDTIL_MS) return AFSPIL_POLL_HURTIG_MS;", "return gaaet < AFSPIL_POLL_MAKS_MS ? AFSPIL_POLL_MS : false;");
};

/** (b) Tomme filer stoppes FØR de sendes, på begge veje, med Jonas' ord. */
export const ingenTomVideo = (optager: string, flade: string): boolean => {
  const send = optager.slice(optager.indexOf("const send = () => {"), optager.indexOf("return (\n    <Dialog"));
  const vaelg = optager.slice(optager.indexOf("const vaelgFil = useCallback("), optager.indexOf("// Åbnes dialogen"));
  return flade.includes('  optagelse: "Optagelsen blev tom. Prøv at optage igen.",') &&
    flade.includes('  fil: "Filen er tom.",') &&
    flade.includes("return typeof size !== \"number\" || !Number.isFinite(size) || size <= 0;") &&
    send.includes("if (erTomFil(forhaandsvisning.fil)) {") && send.includes("setLinje(TOM_TEKST.optagelse);") &&
    foer(send, "if (erTomFil(forhaandsvisning.fil)) {", "onSend({ fil: forhaandsvisning.fil, varighed: forhaandsvisning.varighed });") &&
    vaelg.includes("if (erTomFil(fil)) {") && vaelg.includes("setLinje(TOM_TEKST.fil);") &&
    foer(vaelg, "if (erTomFil(fil)) {", "const url = URL.createObjectURL(fil);") &&
    foer(vaelg, "if (erTomFil(fil)) {", "visForhaandsvisning(fil, varighed);") &&
    // Ingen øvre bytegrænse — chunk-filtret `e.data.size > 0` er ikke en grænse.
    !/MAKS_BYTES|1024 \* 1024|\.size > [1-9]|size >= /.test(optager);
};

/** (c) Sendelinjen: findes, står FØR skrivefeltet, drives af handleSendVideo, ingen toast om uploaden. */
export const sendelinjenFindes = (company: string, sendelinje: string): boolean => {
  const fn = company.slice(company.indexOf("const handleSendVideo = useCallback("), company.indexOf("const proevVideoIgen = useCallback("));
  return company.includes("<ChatVideoSendeLinje tilstand={videoSending} onProevIgen={proevVideoIgen} />") &&
    foer(company, "<ChatVideoSendeLinje tilstand={videoSending} onProevIgen={proevVideoIgen} />", "<ChatRichInput\n") &&
    fn.includes('setVideoSending({ tilstand: "sender", procent: 0 });') &&
    fn.includes('setVideoSending({ tilstand: "sender", procent });') &&
    fn.includes('setVideoSending({ tilstand: "fejl", besked: upload.besked });') &&
    fn.includes('setVideoSending({ tilstand: "sendt" });') &&
    fn.includes("videoIgenRef.current = { fil, varighed, guid };") &&
    antal(fn, "toast.") === 1 && fn.includes('toast.error("Denne virksomhed er udløbet — beskeder kan ikke sendes");') &&
    company.includes("void handleSendVideo(igen);") &&
    sendelinje.includes('role="status"') && !/from "sonner"|\btoast[.(]/.test(sendelinje.replace(/\/\*[\s\S]*?\*\//g, "")) &&
    sendelinje.includes("const tekst = videoSendeTekst(tilstand);") &&
    /Prøv igen\s*<\/HbButton>/.test(sendelinje);
};

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
  it("5. optagelsen: MP4-først-valget, loftet, længdetjekket — og ingen automatisk start (kun «Optag video» kalder getUserMedia)", () => expect(optagelsenHolderLoftet(laes(OPTAGER))).toBe(true));
  it("6a. takten: 2 s det første minut, så 10 s til loftet", () => expect(taktenErHurtigFoerst(laes(FLADE))).toBe(true));
  it("6b. ingen tom video: erTomFil før Send og før «Vælg fil», med Jonas' ord, ingen øvre grænse", () => expect(ingenTomVideo(laes(OPTAGER), laes(FLADE))).toBe(true));
  it("6c. sendelinjen findes før skrivefeltet, drives af handleSendVideo, og ingen toast om uploaden", () => expect(sendelinjenFindes(laes(COMPANY), laes(SENDELINJE))).toBe(true));
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
    // Bunny-viden i fladen (et bibliotek, en collection, en secret eller API'et) fælder.
    expect(visningenErRen(`${b}\nconst lib = "BUNNY_CHAT_LIBRARY_ID";\n`)).toBe(false);
    expect(visningenErRen(`${b}\nconst c = (contextMeta as any)?.video?.collectionId;\n`)).toBe(false);
    expect(visningenErRen(`${b}\nfetch("https://video.bunnycdn.com/library/1/videos/x");\n`)).toBe(false);
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
    // Kaldet flyttet tilbage i effekten på open (automatisk start) fælder.
    expect(optagelsenHolderLoftet(byt(o, '    setFase("vaelg");\n  }, [open', '    setFase("vaelg");\n    if (open) void startOptagelse();\n  }, [open'))).toBe(false);
    // Starttilstanden tilbage på «starter», eller et ekstra getUserMedia-kald, fælder.
    expect(optagelsenHolderLoftet(byt(o, 'useState<Fase>("vaelg")', 'useState<Fase>("starter")'))).toBe(false);
    expect(optagelsenHolderLoftet(`${o}\nconst x = () => navigator.mediaDevices.getUserMedia({ video: true });\n`)).toBe(false);
  });

  it("6a. 10 s fra start, 2 s uden 60 s-grænsen, eller grænsen ombyttet fælder", () => {
    const fl = laes(FLADE);
    expect(taktenErHurtigFoerst(byt(fl, "export const AFSPIL_POLL_HURTIG_MS = 2_000;", "export const AFSPIL_POLL_HURTIG_MS = 10_000;"))).toBe(false);
    expect(taktenErHurtigFoerst(byt(fl, "export const AFSPIL_POLL_HURTIG_INDTIL_MS = 60_000;", "export const AFSPIL_POLL_HURTIG_INDTIL_MS = 600_000;"))).toBe(false);
    expect(taktenErHurtigFoerst(byt(fl, "    if (gaaet < AFSPIL_POLL_HURTIG_INDTIL_MS) return AFSPIL_POLL_HURTIG_MS;\n", ""))).toBe(false);
    expect(taktenErHurtigFoerst(byt(fl, "return gaaet < AFSPIL_POLL_MAKS_MS ? AFSPIL_POLL_MS : false;", "return AFSPIL_POLL_MS;"))).toBe(false);
  });

  it("6b. tjekket væk fra Send, væk fra «Vælg fil», efter onSend, en anden tekst, eller en øvre bytegrænse fælder", () => {
    const o = laes(OPTAGER), fl = laes(FLADE);
    expect(ingenTomVideo(byt(o, "    if (erTomFil(forhaandsvisning.fil)) {\n      setLinje(TOM_TEKST.optagelse);\n      return;\n    }\n", ""), fl)).toBe(false);
    expect(ingenTomVideo(byt(o, "    if (erTomFil(fil)) {\n      setFase((f) => (f === \"forhaandsvis\" || f === \"vaelg\" ? f : \"afvist\"));\n      setLinje(TOM_TEKST.fil);\n      return;\n    }\n", ""), fl)).toBe(false);
    const efter = byt(o, "    if (erTomFil(forhaandsvisning.fil)) {\n      setLinje(TOM_TEKST.optagelse);\n      return;\n    }\n    onSend({ fil: forhaandsvisning.fil, varighed: forhaandsvisning.varighed });\n",
      "    onSend({ fil: forhaandsvisning.fil, varighed: forhaandsvisning.varighed });\n    if (erTomFil(forhaandsvisning.fil)) {\n      setLinje(TOM_TEKST.optagelse);\n      return;\n    }\n");
    expect(ingenTomVideo(efter, fl)).toBe(false);
    expect(ingenTomVideo(o, byt(fl, '  fil: "Filen er tom.",', '  fil: "Filen er for lille.",'))).toBe(false);
    expect(ingenTomVideo(o, byt(fl, "size <= 0;", "size <= 1024;"))).toBe(false);
    expect(ingenTomVideo(`${o}\nconst MAKS_BYTES = 200 * 1024 * 1024;\n`, fl)).toBe(false);
  });

  it("6c. linjen væk, linjen efter feltet, en toast om uploaden, eller «Prøv igen» der ikke sender samme fil fælder", () => {
    const c = laes(COMPANY), s = laes(SENDELINJE);
    expect(sendelinjenFindes(byt(c, "                  <ChatVideoSendeLinje tilstand={videoSending} onProevIgen={proevVideoIgen} />\n", ""), s)).toBe(false);
    const flyttet = byt(c, "                  <ChatVideoSendeLinje tilstand={videoSending} onProevIgen={proevVideoIgen} />\n", "")
      .replace("                  {!isMobile && <div className=\"safe-bottom-spacer\" />}", "                  <ChatVideoSendeLinje tilstand={videoSending} onProevIgen={proevVideoIgen} />\n                  {!isMobile && <div className=\"safe-bottom-spacer\" />}");
    expect(flyttet).not.toBe(c);
    expect(sendelinjenFindes(flyttet, s)).toBe(false);
    expect(sendelinjenFindes(byt(c, '          setVideoSending({ tilstand: "fejl", besked: upload.besked });', '          toast.error(upload.besked);'), s)).toBe(false);
    expect(sendelinjenFindes(byt(c, "void handleSendVideo(igen);", "setVideoOptagerAaben(true);"), s)).toBe(false);
    expect(sendelinjenFindes(c, byt(s, 'role="status"', 'role="alert"'))).toBe(false);
    expect(sendelinjenFindes(c, `${s}\nimport { toast } from "sonner";\n`)).toBe(false);
  });
});
