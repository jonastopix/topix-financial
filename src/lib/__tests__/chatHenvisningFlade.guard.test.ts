import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Kildeværn for «#» i chatten, trin 3: fladen (29/9-2026). Fem domme, hver
 * bevist nedenfor på en kopi med fejlen indsat:
 *
 *   a. AFSENDELSEN GÅR GENNEM MOTOREN: sendefeltet giver dokumentet videre
 *      (chatAfsendelse → onSubmit), og begge paners insert bygger content +
 *      indhold_json af byggChatBesked(dokument) — uden henvisning er content
 *      det gamle. Videobeskeden er urørt (content = markøren, intet dokument).
 *   b. REDIGERING OPDATERER BEGGE KOLONNER: startEdit bærer beskedens
 *      indhold_json ind i dialogen, dialogen giver dokumentet tilbage (også når
 *      henvisningerne er slettet), og saveEdit opdaterer content + indhold_json
 *      SAMMEN fra byggChatBesked.
 *   c. INGEN dangerouslySetInnerHTML AF DOKUMENTET: boblen tegner dokumentet som
 *      træ; den eneste innerHTML i ChatBeskedTekst er content gennem den gamle
 *      DOMPurify-liste (siden 1/10 i src/lib/chatHtml.ts: renskChatHtml, med
 *      `start` som ENESTE ekstra attribut — «1. 1. 1.»-rettelsen); panerne har ingen egen kopi af boblens innerHTML, og intet
 *      sted i src sætter indhold_json som HTML.
 *   d. AFTALENS ADRESSE FRA rabataftaleAdresse: chattens og Community's visning
 *      får aftalens href fra hjælperen, og ingen anden fil bygger
 *      «/rabataftaler?…» eller «aftaleId=» selv.
 *   e. OPSLAG OG OMRÅDENAVNE ER COMMUNITY'S (a29-hash-huller 2 og 4): chatten
 *      importerer opslagsnoden og OMRAADE_LABELS fra CommunityComposer (som
 *      eksporterer dem) frem for at have egne kopier; opslagene hentes af SAMME
 *      feed som Community's #-liste; forslaget bliver til noden med traadId +
 *      titel; og «/community/» bygges ikke i chattens forslagsfiler — adressen
 *      er henvisningsAdresse's alene.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
// Linjekommentarer KUN når // står først på linjen — ellers æder rensningen
// URL'er i koden (udenKommentarer-lærdommen).
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");
const antal = (k: string, s: string) => k.split(s).length - 1;
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b, i); return i !== -1 && j !== -1; };
const krop = (k: string, start: string, slut: string) => {
  const i = k.indexOf(start);
  if (i === -1) return "";
  const j = k.indexOf(slut, i);
  return j === -1 ? "" : k.slice(i, j);
};
const flad = (k: string) => k.replace(/\s+/g, " ");

const INPUT = "src/components/ChatRichInput.tsx";
const DIALOG = "src/components/MessageEditDialog.tsx";
const TEKST = "src/components/ChatBeskedTekst.tsx";
const HTML = "src/lib/chatHtml.ts";
const HOOK = "src/hooks/useMessageActions.ts";
const MOTOR = "src/lib/chatDokument.ts";
const COMMUNITY = "src/components/hjemmebane/community/CommunityDokument.tsx";
const HJAELPER = "src/lib/hjemmebane/rabataftaleAdresse.ts";
const CHAT_HOOK = "src/components/chatHenvisninger.ts";
const CHAT_FORSLAG = "src/lib/chatHenvisningsForslag.ts";
const COMPOSER = "src/components/hjemmebane/community/CommunityComposer.tsx";
const PANER = ["src/components/MemberChatPane.tsx", "src/components/CompanyChatPane.tsx"] as const;

// ── a ──────────────────────────────────────────────────────────────────────
const SEND_START = "const handleSend = useCallback(async (content: string, files?: File[], dokument?: Record<string, unknown>) => {";
export const afsendelsenGaarGennemMotoren = (k: { input: string; paner: readonly string[]; company: string }): boolean => {
  const input = udenKommentarer(k.input);
  const inputOk =
    input.includes("const { content, dokument } = chatAfsendelse(text, editor.getHTML(), editor.getJSON());") &&
    input.includes("onSubmit(content, hasFiles ? pendingFiles : undefined, dokument);") &&
    antal(input, "onSubmit(") === 1;
  const panerOk = k.paner.every((raa) => {
    const send = krop(udenKommentarer(raa), SEND_START, "}, [activeConvId");
    return (
      send.includes("const henvist = dokument ? byggChatBesked(dokument) : null;") &&
      send.includes('...(henvist ?? { content: trimmed || "📎" }),') &&
      !/^\s*content:/m.test(send) &&
      foer(send, "const henvist = dokument ? byggChatBesked(dokument) : null;", 'supabase.from("messages").insert(insertData)')
    );
  });
  const video = krop(udenKommentarer(k.company), "const handleSendVideo = useCallback(", "}, [");
  const videoOk =
    video.includes("content: besked.content,") &&
    !/byggChatBesked|dokument|indhold_json/.test(video);
  return inputOk && panerOk && videoOk;
};

// ── b ──────────────────────────────────────────────────────────────────────
export const redigeringOpdatererBegge = (k: { hook: string; dialog: string; paner: readonly string[] }): boolean => {
  const hook = udenKommentarer(k.hook);
  const gem = krop(hook, "const saveEdit = useCallback(", "}, [editContent");
  const start = krop(hook, "const startEdit = useCallback(", "}, []);");
  const hookOk =
    gem.startsWith("const saveEdit = useCallback(async (messageId: string, contentOverride?: string, dokument?: Record<string, unknown>) => {") &&
    gem.includes("const besked = dokument !== undefined ? byggChatBesked(dokument) : null;") &&
    gem.includes('.update({ ...besked, edited_at: new Date().toISOString() } as TablesUpdate<"messages">)') &&
    start.includes("(messageId: string, content: string, dokument?: unknown) => {") &&
    start.includes("setEditDokument(dokument ?? null);");
  const dialog = flad(udenKommentarer(k.dialog));
  const dialogOk =
    dialog.includes('editor.commands.setContent( harDokument ? (initialDokument as Record<string, unknown>) : initialHTML || "", false, );') &&
    dialog.includes("const ok = await onSave(payload, dokument ?? (harDokument ? (json as Record<string, unknown>) : undefined));");
  const panerOk = k.paner.every((raa) => {
    const p = udenKommentarer(raa);
    return (
      antal(p, "startEdit(msg.id, msg.content, msg.indhold_json)") === 2 &&
      antal(p, "startEdit(") === 2 &&
      antal(p, "initialDokument={editDokument}") === 1 &&
      p.includes("const ok = await saveEditAction(id, html, dokument);")
    );
  });
  return hookOk && dialogOk && panerOk;
};

// ── c ──────────────────────────────────────────────────────────────────────
const BOBLE_HTML = "dangerouslySetInnerHTML={{ __html: renskChatHtml(content) }}";
const innerHtmlUdtryk = (k: string) => [...k.matchAll(/dangerouslySetInnerHTML=\{\{([\s\S]*?)\}\}\s*\/>/g)].map((m) => m[1]);
export const ingenInnerHtmlAfDokumentet = (k: { tekst: string; html: string; paner: readonly string[]; alle: ReadonlyMap<string, string> }): boolean => {
  const tekst = udenKommentarer(k.tekst);
  const html = udenKommentarer(k.html);
  const listeOk =
    html.includes('export const CHAT_TILLADTE_TAGS = ["b", "strong", "i", "em", "ul", "ol", "li", "a", "p", "br"];') &&
    html.includes('export const CHAT_TILLADTE_ATTR = ["href", "target", "rel"];') &&
    antal(html, "ALLOWED_ATTR:") === 1 &&
    html.includes('ALLOWED_ATTR: [...CHAT_TILLADTE_ATTR, "start"],') &&
    antal(html, "ALLOWED_TAGS:") === 1 &&
    html.includes("ALLOWED_TAGS: CHAT_TILLADTE_TAGS,") &&
    !/ADD_ATTR|ADD_TAGS|addHook/.test(html);
  const tekstOk =
    listeOk &&
    antal(tekst, "dangerouslySetInnerHTML") === 1 &&
    tekst.includes(BOBLE_HTML) &&
    foer(tekst, "if (noder.length > 0) {", BOBLE_HTML) &&
    krop(tekst, "if (noder.length > 0) {", "\n  }\n").includes("{renderIndhold(noder)}");
  const panerOk = k.paner.every((raa) => {
    const p = udenKommentarer(raa);
    return (
      antal(p, "<ChatBeskedTekst content={msg.content} dokument={msg.indhold_json} />") === 2 &&
      antal(p, "DOMPurify.sanitize(msg.content, {") === 0
    );
  });
  const ingenSteder = [...k.alle.values()].every((raa) =>
    innerHtmlUdtryk(udenKommentarer(raa)).every((u) => !/indhold_json|dokument/.test(u)),
  );
  return tekstOk && panerOk && ingenSteder;
};

// ── d ──────────────────────────────────────────────────────────────────────
export const aftalensAdresseFraHjaelperen = (k: {
  motor: string;
  tekst: string;
  community: string;
  alle: ReadonlyMap<string, string>;
}): boolean => {
  const motor = flad(udenKommentarer(k.motor));
  const tekst = udenKommentarer(k.tekst);
  const motorOk =
    motor.includes('import { rabataftaleAdresse } from "@/lib/hjemmebane/rabataftaleAdresse";') &&
    motor.includes('case "rabathenvisning": return rabataftaleAdresse(node.aftaleId);');
  const tekstOk = tekst.includes("to={henvisningsAdresse(node)}") && antal(tekst, " to=") === 1;
  const communityOk = udenKommentarer(k.community).includes("to={rabataftaleAdresse(node.aftaleId)}");
  const ingenEgenBygning = [...k.alle.entries()].every(
    ([sti, raa]) => sti === HJAELPER || !/rabataftaler\?|aftaleId=/.test(udenKommentarer(raa)),
  );
  return motorOk && tekstOk && communityOk && ingenEgenBygning;
};

// ── e ──────────────────────────────────────────────────────────────────────
export const opslagOgOmraaderErCommunitys = (k: { hook: string; forslag: string; composer: string }): boolean => {
  const hook = flad(udenKommentarer(k.hook));
  const forslag = flad(udenKommentarer(k.forslag));
  const composer = udenKommentarer(k.composer);
  const composerOk =
    composer.includes("export const OpslagHenvisningNode = Mention.extend({") &&
    composer.includes("export const OMRAADE_LABELS: Record<string, string> = {");
  const hookOk =
    hook.includes('import { OMRAADE_LABELS, OpslagHenvisningNode } from "@/components/hjemmebane/community/CommunityComposer";') &&
    hook.includes("OpslagHenvisningNode, HenvisningNode.configure(") &&
    hook.includes('queryKey: ["community", "feed"], queryFn: () => hentFeed(30),') &&
    hook.includes("OMRAADE_LABELS[forslag.item.area] ?? forslag.item.area") &&
    hook.includes("traade: feedQuery.data ?? [],") &&
    hook.includes("feed: feedQuery.isError,");
  const forslagOk =
    forslag.includes("attrs: { traadId: forslag.traad.id, titel: forslag.traad.titel }") &&
    forslag.includes("...aftaler, ...opslag]");
  const ingenKopi = [hook, forslag].every(
    (raa) => !/Mention\.extend|OMRAADE_LABELS: Record|`\/community\//.test(raa),
  );
  return composerOk && hookOk && forslagOk && ingenKopi;
};

const kildefiler = (): Map<string, string> => {
  const ud = new Map<string, string>();
  const gaa = (mappe: string) => {
    for (const navn of readdirSync(mappe)) {
      const sti = join(mappe, navn);
      if (statSync(sti).isDirectory()) {
        if (navn === "__tests__" || navn === "node_modules") continue;
        gaa(sti);
      } else if (/\.(ts|tsx)$/.test(navn) && !/\.test\.tsx?$/.test(navn)) {
        ud.set(sti, readFileSync(sti, "utf8"));
      }
    }
  };
  gaa("src");
  return ud;
};

describe("chatHenvisningFlade.guard", () => {
  it("e. opslagsnoden og områdenavnene er Community's — ingen kopi, samme feed, adressen i motoren", () =>
    expect(opslagOgOmraaderErCommunitys({ hook: laes(CHAT_HOOK), forslag: laes(CHAT_FORSLAG), composer: laes(COMPOSER) })).toBe(true));
  const paner = PANER.map(laes);
  it("a. afsendelsen går gennem byggChatBesked — og videobeskeden er urørt", () =>
    expect(afsendelsenGaarGennemMotoren({ input: laes(INPUT), paner, company: laes(PANER[1]) })).toBe(true));
  it("b. redigering opdaterer content og indhold_json sammen", () =>
    expect(redigeringOpdatererBegge({ hook: laes(HOOK), dialog: laes(DIALOG), paner })).toBe(true));
  it("c. ingen dangerouslySetInnerHTML af dokumentet", () =>
    expect(ingenInnerHtmlAfDokumentet({ tekst: laes(TEKST), html: laes(HTML), paner, alle: kildefiler() })).toBe(true));
  it("d. aftalens href fra rabataftaleAdresse — ingen bygger den selv", () =>
    expect(aftalensAdresseFraHjaelperen({ motor: laes(MOTOR), tekst: laes(TEKST), community: laes(COMMUNITY), alle: kildefiler() })).toBe(true));
});

describe("chatHenvisningFlade.guard — dommene fælder på en kopi", () => {
  const input = laes(INPUT), dialog = laes(DIALOG), tekst = laes(TEKST), hook = laes(HOOK), motor = laes(MOTOR), community = laes(COMMUNITY);
  const [member, company] = PANER.map(laes);
  const alle = kildefiler();
  /** Én mutation = præcis én forekomst byttet — ellers er beviset tavst. */
  const byt = (k: string, a: string, b: string) => {
    expect(antal(k, a), a).toBe(1);
    return k.split(a).join(b);
  };

  it("a: en insert med content ved siden af motoren, et dokument der ikke gives videre, en motor byttet ud, eller en video gennem motoren, fælder", () => {
    const ok = { input, paner: [member, company], company };
    expect(afsendelsenGaarGennemMotoren(ok)).toBe(true);
    const fri = byt(member, '...(henvist ?? { content: trimmed || "📎" }),', 'content: trimmed || "📎",');
    expect(afsendelsenGaarGennemMotoren({ ...ok, paner: [fri, company] })).toBe(false);
    const udenDok = byt(input, "onSubmit(content, hasFiles ? pendingFiles : undefined, dokument);", "onSubmit(content, hasFiles ? pendingFiles : undefined);");
    expect(afsendelsenGaarGennemMotoren({ ...ok, input: udenDok })).toBe(false);
    const egen = byt(company, "const henvist = dokument ? byggChatBesked(dokument) : null;", 'const henvist = dokument ? { content: "x", indhold_json: dokument } : null;');
    expect(afsendelsenGaarGennemMotoren({ ...ok, paner: [member, egen], company: egen })).toBe(false);
    const video = byt(company, "        content: besked.content,\n", "        content: besked.content,\n        ...(byggChatBesked(null) ?? {}),\n");
    expect(afsendelsenGaarGennemMotoren({ ...ok, paner: [member, video], company: video })).toBe(false);
  });

  it("b: en update uden dokumentet, en startEdit uden indhold_json, eller en dialog der glemmer et slettet dokument, fælder", () => {
    const ok = { hook, dialog, paner: [member, company] };
    expect(redigeringOpdatererBegge(ok)).toBe(true);
    const kunContent = byt(hook, '.update({ ...besked, edited_at: new Date().toISOString() } as TablesUpdate<"messages">)', '.update({ content: besked.content, edited_at: new Date().toISOString() } as TablesUpdate<"messages">)');
    expect(redigeringOpdatererBegge({ ...ok, hook: kunContent })).toBe(false);
    const udenDok = byt(member, "                                onEdit={() => startEdit(msg.id, msg.content, msg.indhold_json)}", "                                onEdit={() => startEdit(msg.id, msg.content)}");
    expect(redigeringOpdatererBegge({ ...ok, paner: [udenDok, company] })).toBe(false);
    const glemmer = byt(dialog, "dokument ?? (harDokument ? (json as Record<string, unknown>) : undefined)", "dokument");
    expect(redigeringOpdatererBegge({ ...ok, dialog: glemmer })).toBe(false);
    const udenSaet = byt(company, "        initialDokument={editDokument}\n", "");
    expect(redigeringOpdatererBegge({ ...ok, paner: [member, udenSaet] })).toBe(false);
  });

  it("c: dokumentet som innerHTML — i boblen, i et pane eller et andet sted — eller en bredere DOMPurify-liste, fælder", () => {
    const html = laes(HTML);
    const ok = { tekst, html, paner: [member, company], alle };
    expect(ingenInnerHtmlAfDokumentet(ok)).toBe(true);
    const boble = byt(tekst, "{renderIndhold(noder)}</div>", "<div dangerouslySetInnerHTML={{ __html: String(dokument) }} /></div>");
    expect(ingenInnerHtmlAfDokumentet({ ...ok, tekst: boble })).toBe(false);
    const udenTrae = byt(tekst, "{renderIndhold(noder)}</div>", "{content}</div>");
    expect(ingenInnerHtmlAfDokumentet({ ...ok, tekst: udenTrae })).toBe(false);
    const bred = byt(html, '"a", "p", "br"];', '"a", "p", "br", "img"];');
    expect(ingenInnerHtmlAfDokumentet({ ...ok, html: bred })).toBe(false);
    const bredAttr = byt(html, 'ALLOWED_ATTR: [...CHAT_TILLADTE_ATTR, "start"],', 'ALLOWED_ATTR: [...CHAT_TILLADTE_ATTR, "start", "style"],');
    expect(ingenInnerHtmlAfDokumentet({ ...ok, html: bredAttr })).toBe(false);
    const tilfoejet = byt(html, "    RETURN_DOM_FRAGMENT: true,\n", '    RETURN_DOM_FRAGMENT: true,\n    ADD_ATTR: ["style"],\n');
    expect(ingenInnerHtmlAfDokumentet({ ...ok, html: tilfoejet })).toBe(false);
    const udenom = byt(tekst, "renskChatHtml(content)", "DOMPurify.sanitize(content)");
    expect(ingenInnerHtmlAfDokumentet({ ...ok, tekst: udenom })).toBe(false);
    const pane = company.replace(
      "<ChatBeskedTekst content={msg.content} dokument={msg.indhold_json} />",
      "<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(JSON.stringify(msg.indhold_json)) }} />",
    );
    expect(antal(pane, "<ChatBeskedTekst content={msg.content} dokument={msg.indhold_json} />")).toBe(1);
    expect(ingenInnerHtmlAfDokumentet({ ...ok, paner: [member, pane] })).toBe(false);
    const andetSted = new Map(alle).set("src/components/X.tsx", "const x = <div dangerouslySetInnerHTML={{ __html: row.indhold_json }} />;");
    expect(ingenInnerHtmlAfDokumentet({ ...ok, alle: andetSted })).toBe(false);
  });

  it("e: en egen opslagsnode eller områdeliste i chatten, en anden feed-kilde, en bygget /community/-adresse eller et fjernet opslag fælder", () => {
    const ok = { hook: laes(CHAT_HOOK), forslag: laes(CHAT_FORSLAG), composer: laes(COMPOSER) };
    expect(opslagOgOmraaderErCommunitys(ok)).toBe(true);
    const eget = byt(ok.hook, 'import { OMRAADE_LABELS, OpslagHenvisningNode } from "@/components/hjemmebane/community/CommunityComposer";', 'const OpslagHenvisningNode = Mention.extend({ name: "opslaghenvisning" });');
    expect(opslagOgOmraaderErCommunitys({ ...ok, hook: eget })).toBe(false);
    const udenNode = byt(ok.hook, "    OpslagHenvisningNode,\n", "");
    expect(opslagOgOmraaderErCommunitys({ ...ok, hook: udenNode })).toBe(false);
    const andenFeed = byt(ok.hook, 'queryKey: ["community", "feed"],', 'queryKey: ["chat", "opslag"],');
    expect(opslagOgOmraaderErCommunitys({ ...ok, hook: andenFeed })).toBe(false);
    const udenOmraade = byt(ok.hook, "OMRAADE_LABELS[forslag.item.area] ?? forslag.item.area", "null");
    expect(opslagOgOmraaderErCommunitys({ ...ok, hook: udenOmraade })).toBe(false);
    const udenFejl = byt(ok.hook, "    feed: feedQuery.isError,\n", "");
    expect(opslagOgOmraaderErCommunitys({ ...ok, hook: udenFejl })).toBe(false);
    const egenAdresse = byt(ok.forslag, "  // Opslag sidst, som i Community", "  const href = `/community/${x}`;\n  // Opslag sidst, som i Community");
    expect(opslagOgOmraaderErCommunitys({ ...ok, forslag: egenAdresse })).toBe(false);
    const forkertNode = byt(ok.forslag, "attrs: { traadId: forslag.traad.id, titel: forslag.traad.titel }", "attrs: { id: forslag.traad.id, titel: forslag.traad.titel }");
    expect(opslagOgOmraaderErCommunitys({ ...ok, forslag: forkertNode })).toBe(false);
    const ikkeEksporteret = byt(ok.composer, "export const OpslagHenvisningNode = Mention.extend({", "const OpslagHenvisningNode = Mention.extend({");
    expect(opslagOgOmraaderErCommunitys({ ...ok, composer: ikkeEksporteret })).toBe(false);
    const labelsPrivate = byt(ok.composer, "export const OMRAADE_LABELS: Record", "const OMRAADE_LABELS: Record");
    expect(opslagOgOmraaderErCommunitys({ ...ok, composer: labelsPrivate })).toBe(false);
  });

  it("d: en bygget aftale-adresse i motoren, i boblen, i Community eller i en ny fil, fælder", () => {
    const ok = { motor, tekst, community, alle };
    expect(aftalensAdresseFraHjaelperen(ok)).toBe(true);
    const iMotoren = byt(motor, "return rabataftaleAdresse(node.aftaleId);", "return `/rabataftaler?aftaleId=${node.aftaleId}`;");
    expect(aftalensAdresseFraHjaelperen({ ...ok, motor: iMotoren })).toBe(false);
    const iBoblen = byt(tekst, "to={henvisningsAdresse(node)}", 'to={node.type === "rabathenvisning" ? `/rabataftaler?aftaleId=${node.aftaleId}` : henvisningsAdresse(node)}');
    expect(aftalensAdresseFraHjaelperen({ ...ok, tekst: iBoblen })).toBe(false);
    const iCommunity = byt(community, "to={rabataftaleAdresse(node.aftaleId)}", "to={`/rabataftaler?aftaleId=${node.aftaleId}`}");
    expect(aftalensAdresseFraHjaelperen({ ...ok, community: iCommunity })).toBe(false);
    const nyFil = new Map(alle).set("src/components/Y.tsx", 'const href = "/rabataftaler?" + "aftaleId=" + id;');
    expect(aftalensAdresseFraHjaelperen({ ...ok, alle: nyFil })).toBe(false);
  });
});
