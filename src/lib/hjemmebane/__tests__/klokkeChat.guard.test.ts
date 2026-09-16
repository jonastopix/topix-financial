import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for chatbeskedens vej i rådgiverens klokke (16/9-2026, Jonas'
// prioritet 1; mangellisten «En chatbesked i klokken åbner indbakken, ikke
// samtalen»). Set på skærm 11/9: klokke.ts sagde `case "chat": return
// "/chat"` — indbakken. Rækken (send-slack-chat-notification, den eneste
// skriver med reference_type 'chat') bærer company_id og BESKEDENS id, ikke
// samtalens; indbakken (CompanyChatPane) holder én samtale pr. virksomhed.
// Fire ting låses:
//   1. klokke.ts' chat-gren bygger samtalestien (chatSti) — ingen fast
//      "/chat" i grenen.
//   2. Det eneste "/chat"-literal i klokke.ts er CHAT_STI, og chatSti falder
//      kun tilbage på det med en grund: manglende company_id.
//   3. CompanyChatPane forstår ?companyId= (finder samtalen på company_id),
//      forstår stadig ?conversationId= og ?messageId=, og ryder ikke
//      parametrene før rulningen når et besked-id findes.
//   4. Ruten /chat står i App.tsx.
// React-kode uden ren funktion at kalde → kildelæsning (forloeb.guard-
// mønstret), og værnet beviser sig selv på en KOPI med fejlen indsat.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const KLOKKE = "src/lib/hjemmebane/klokke.ts";
const PANE = "src/components/CompanyChatPane.tsx";
const APP = "src/App.tsx";

/** Chat-grenen i raadgiverSti: fra `case "chat":` til næste `case`. */
export const chatGren = (kilde: string): string => {
  const fra = kilde.indexOf('case "chat":');
  if (fra < 0) return "";
  const rest = kilde.slice(fra + 'case "chat":'.length);
  const til = rest.search(/\n\s*(case |default:)/);
  return til < 0 ? rest : rest.slice(0, til);
};

/** Dom 1: chat-grenen returnerer chatSti(n) og intet fast "/chat". */
export const grenenByggerSamtalen = (kilde: string): boolean => {
  const gren = chatGren(kilde);
  return /return chatSti\(n\);/.test(gren) && !/"\/chat"/.test(gren) && !/CHAT_STI/.test(gren);
};

/** Dom 2: "/chat" står ét sted (CHAT_STI), og chatSti's fald-tilbage er gated på company_id. */
export const faldTilbageHarGrund = (kilde: string): boolean => {
  const literaler = kilde.match(/"\/chat"/g) ?? [];
  const kun = literaler.length === 1 && /export const CHAT_STI = "\/chat";/.test(kilde);
  const fn = kilde.slice(kilde.indexOf("export function chatSti("));
  const krop = fn.slice(0, fn.indexOf("\n}") + 2);
  return kun && /if \(!n\.company_id\) return CHAT_STI;/.test(krop) && /\?companyId=\$\{n\.company_id\}/.test(krop) && /&messageId=\$\{n\.reference_id\}/.test(krop);
};

/** Dom 3: panelet forstår companyId, conversationId og messageId — og venter med rydningen. */
export const paneletForstaarVirksomheden = (kilde: string): boolean =>
  /searchParams\.get\("companyId"\)/.test(kilde) &&
  /searchParams\.get\("conversationId"\)/.test(kilde) &&
  /searchParams\.get\("messageId"\)/.test(kilde) &&
  /conversations\.find\(c => c\.company_id === companyParam\)/.test(kilde) &&
  /if \(!msgParam\) setSearchParams\(\{\}, \{ replace: true \}\);/.test(kilde);

describe("klokkeChat.guard — samtalen, ikke indbakken", () => {
  const klokke = udenKommentarer(laes(KLOKKE));
  const pane = udenKommentarer(laes(PANE));
  const app = laes(APP);

  it("1. chat-grenen i raadgiverSti bygger samtalestien gennem chatSti", () => {
    expect(chatGren(klokke)).not.toBe("");
    expect(grenenByggerSamtalen(klokke)).toBe(true);
  });

  it("2. det eneste \"/chat\" er CHAT_STI, og fald-tilbage sker kun uden company_id", () => {
    expect(faldTilbageHarGrund(klokke)).toBe(true);
  });

  it("3. CompanyChatPane finder samtalen på company_id, forstår stadig conversationId og messageId, og rydder først efter rulningen", () => {
    expect(paneletForstaarVirksomheden(pane)).toBe(true);
    expect(pane).toContain("scrollToMessage(msgParam);");
  });

  it("4. ruten /chat findes i App.tsx", () => {
    expect(app).toContain('path="/chat"');
  });

  it("klokke.ts er stadig ren — kun richtext-importen", () => {
    expect(klokke.match(/^import .*$/gm) ?? []).toEqual(['import { renTekst } from "./richtext";']);
  });
});

describe("klokkeChat.guard — dommene fanger fejlen på en kopi af kilden", () => {
  const klokke = udenKommentarer(laes(KLOKKE));
  const pane = udenKommentarer(laes(PANE));

  it("1. den gamle gren (`case \"chat\": return \"/chat\";`) fælder dom 1", () => {
    const gammel = klokke.replace('case "chat":\n      return chatSti(n);', 'case "chat":\n      return "/chat";');
    expect(gammel).not.toBe(klokke);
    expect(grenenByggerSamtalen(gammel)).toBe(false);
    // Også en gren der bruger konstanten direkte er en fast indbakke.
    const konstant = klokke.replace('case "chat":\n      return chatSti(n);', 'case "chat":\n      return CHAT_STI;');
    expect(grenenByggerSamtalen(konstant)).toBe(false);
  });

  it("2. et ekstra \"/chat\"-literal eller en fald-tilbage uden grund fælder dom 2", () => {
    expect(faldTilbageHarGrund(klokke + '\nconst x = "/chat";\n')).toBe(false);
    const udenGrund = klokke.replace("if (!n.company_id) return CHAT_STI;", "if (!n.company_id || !n.reference_id) return CHAT_STI;");
    expect(udenGrund).not.toBe(klokke);
    expect(faldTilbageHarGrund(udenGrund)).toBe(false);
  });

  it("3. et panel uden companyId, eller som rydder før rulningen, fælder dom 3", () => {
    const udenVirksomhed = pane.replace('searchParams.get("companyId")', 'null');
    expect(udenVirksomhed).not.toBe(pane);
    expect(paneletForstaarVirksomheden(udenVirksomhed)).toBe(false);
    const rydderFoer = pane.replace("if (!msgParam) setSearchParams({}, { replace: true });", "setSearchParams({}, { replace: true });");
    expect(rydderFoer).not.toBe(pane);
    expect(paneletForstaarVirksomheden(rydderFoer)).toBe(false);
  });
});
