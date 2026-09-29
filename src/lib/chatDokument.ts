/**
 * src/lib/chatDokument.ts — «#» i chatten, motoren (kort m28-hash-i-chatten; Jonas 29/9-2026).
 *
 * En chatbesked kan bære et Tiptap-dokument i messages.indhold_json VED SIDEN AF
 * content (migration 20260929160000). Denne fil er tre rene funktioner:
 *
 *   parseChatDokument(input)   dokumentet → hvidlistet trædatastruktur
 *   chatDokumentTilTekst(noder) træet → ren tekst, som community_json_til_tekst
 *   byggChatBesked(input)      det ENESTE sted, content og indhold_json bygges
 *                              sammen — content er altid udledt af dokumentet
 *
 * PARSEREN GENBRUGES, IKKE KOPIERES. parseCommunityDokument (hjemmebane/
 * communityDokument.ts:419) kaldes uændret, og dens resultat filtreres BAGEFTER
 * ned til chattens hvidliste. Community's opførsel ændres derfor ikke, og alle
 * dens værn (links kun https/http/mailto, uuid-mønstre, områdelisten, slug-
 * mønstret, 120-tegns titler, dybdegrænsen, kast aldrig) gælder også her.
 *
 * CHATTENS HVIDLISTE = det ChatRichInput kan skrive + fire #-noder (Jonas 29/9,
 * trin 1: events, lektioner og opslag — samme adresse for medlem og rådgiver;
 * trin 3: rabataftaler, når en aftale har en adresse — rabataftaleAdresse):
 *   ChatRichInput (ChatRichInput.tsx:203-217, @tiptap/starter-kit 2.27.2):
 *     StarterKit uden heading, codeBlock, blockquote, horizontalRule — tilbage
 *     er doc, paragraph, text, hardBreak, bulletList, orderedList, listItem og
 *     marks bold, italic, strike, code; + Link (mark).
 *   Community-hvidlisten har ALLE de noder, og marks bold, italic, link.
 *   strike og code findes ikke i Community-hvidlisten og fjernes stille (teksten
 *   består) — chatten tegner dem heller ikke i dag: DOMPurify-listen i panerne
 *   er ['b','strong','i','em','ul','ol','li','a','p','br'].
 *   Fjernes af chatten, selv om Community tillader dem: heading, blockquote,
 *   image, fil og naevnelse — chatten har ingen editor til dem, og et dokument
 *   fra en håndlavet klient må ikke kunne få dem ind.
 *
 * INTET SPEJL I _shared (29/9): ingen edge function skriver eller læser
 * indhold_json. Alle functions, der læser chatbeskeder (send-slack-chat-
 * notification, run-company-agent), læser content — og content er netop den
 * udledte tekst. Får en function brug for dokumentet, spejles filen efter
 * husets paritetsmønster DENGANG, med parseCommunityDokument som del af spejlet.
 */
import { parseCommunityDokument, type CommunityNode } from "@/lib/hjemmebane/communityDokument";
import { rabataftaleAdresse } from "@/lib/hjemmebane/rabataftaleAdresse";

/** Nodetyperne, en chatbesked må bære — alt andet fjernes stille (med sit indhold). */
export type ChatNodeType =
  | "paragraph"
  | "bulletList"
  | "orderedList"
  | "listItem"
  | "hardBreak"
  | "text"
  | "henvisning"
  | "eventhenvisning"
  | "opslaghenvisning"
  | "rabathenvisning";

export const CHAT_NODER: ReadonlySet<string> = new Set<ChatNodeType>([
  "paragraph",
  "bulletList",
  "orderedList",
  "listItem",
  "hardBreak",
  "text",
  "henvisning",
  "eventhenvisning",
  "opslaghenvisning",
  "rabathenvisning",
]);

/** De fire #-henvisninger: lektion, event og opslag (trin 1) og rabataftale (trin 3). */
export const HENVISNINGS_NODER = ["henvisning", "eventhenvisning", "opslaghenvisning", "rabathenvisning"] as const;

export type ChatNode = Extract<CommunityNode, { type: ChatNodeType }>;

/** Filtrér et allerede Community-parset træ ned til chattens hvidliste. */
function filtrer(noder: readonly CommunityNode[]): ChatNode[] {
  const ud: ChatNode[] = [];
  for (const node of noder) {
    if (!CHAT_NODER.has(node.type)) continue;
    if ("content" in node) {
      const content = filtrer(node.content);
      // Samme tomhedsregler som Community (communityDokument.ts:296-320): et
      // afsnit af lutter hardBreak er tomt, og en tom liste/listItem er ingenting.
      // Reglen gentages, fordi filtreringen kan tømme et afsnit, der før var fyldt
      // (fx et afsnit, der kun bestod af en nævnelse).
      if (node.type === "paragraph") {
        if (content.every((n) => n.type === "hardBreak")) continue;
      } else if (content.length === 0) {
        continue;
      }
      ud.push({ ...node, content } as ChatNode);
    } else {
      ud.push(node as ChatNode);
    }
  }
  return ud;
}

/** Chatbeskedens dokument → hvidlistet træ. Kaster aldrig; ugyldigt input giver []. */
export function parseChatDokument(input: unknown): ChatNode[] {
  return filtrer(parseCommunityDokument(input));
}

/**
 * Træet → ren tekst efter PRÆCIS community_json_til_tekst's regler
 * (20260917160000_community_tekst_med_opslaghenvisninger.sql:65-113):
 *   - noderne besøges i dokumentorden (pre-order)
 *   - en text-node bidrager med sin tekst ORDRET (ingen trim)
 *   - henvisning, eventhenvisning, opslaghenvisning og rabathenvisning bidrager
 *     med «#» + titel (rabathenvisning kendes ikke af SQL'en — Community
 *     skriver den ikke; chattens tekst udledes her, ikke i databasen)
 *   - alle andre noder (afsnit, lister, hardBreak) bidrager med intet
 *   - bidragene samles med ÉT mellemrum, og kun mellemrum trimmes i enderne
 *     (btrim uden tegnliste trimmer kun ' ')
 *   - intet bidrag → null (SQL'en giver NULL)
 * (naevnelse → «@» + navn findes i SQL'en, men kan ikke stå i et chat-træ.)
 */
export function chatDokumentTilTekst(noder: readonly ChatNode[]): string | null {
  const dele: string[] = [];
  const gaa = (liste: readonly ChatNode[]) => {
    for (const node of liste) {
      switch (node.type) {
        case "text":
          if (node.text !== "") dele.push(node.text);
          break;
        case "henvisning":
        case "eventhenvisning":
        case "opslaghenvisning":
        case "rabathenvisning":
          if (node.titel !== "") dele.push(`#${node.titel}`);
          break;
        case "hardBreak":
          break;
        default:
          gaa(node.content as ChatNode[]);
      }
    }
  };
  gaa(noder);
  const tekst = dele.join(" ").replace(/^ +| +$/g, "");
  return tekst === "" ? null : tekst;
}

/**
 * Teksten, som den skrives i content. «&», «<» og «>» kodes som entiteter.
 *
 * HVORFOR: content læses som HTML af panerne (DOMPurify) og af renTekst, som
 * fjerner alt fra «<» til «>». Den rene tekst, ChatRichInput gemmer i dag, kan
 * ALDRIG indeholde de tre tegn — isPlain sammenligner getHTML() med
 * `<p>${getText()}</p>`, og getHTML koder dem, så en besked med dem gemmes som
 * HTML (ChatRichInput.tsx:303-312). Kodes de her, er content præcis den form, en
 * sådan besked har i dag: DOMPurify viser tegnene, renTekst oversætter &amp;,
 * &lt; og &gt; tilbage (richtext.ts), og ingen tekst som «a < b > c» bliver
 * spist af tag-rensningen.
 */
export function tekstTilContent(tekst: string): string {
  return tekst.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface ChatBesked {
  content: string;
  indhold_json: Record<string, unknown>;
}

/**
 * DET ENESTE STED content og indhold_json bygges sammen. content udledes af
 * dokumentet — aldrig skrevet frit ved siden af — så de to ikke kan komme i
 * utakt. Værn: chatDokument.guard (en skriver til messages, der nævner
 * indhold_json, skal gå gennem byggChatBesked og må ikke sætte feltet selv).
 *
 * Returnerer null, når dokumentet ikke er et dokument, eller når intet i det
 * giver tekst (samme tomhedsdom som Community's skrive-RPC'er). indhold_json er
 * dokumentet, som det kom (hvidlisten håndhæves ved LÆSNING, som i Community).
 */
export function byggChatBesked(input: unknown): ChatBesked | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const tekst = chatDokumentTilTekst(parseChatDokument(input));
  if (tekst === null) return null;
  return { content: tekstTilContent(tekst), indhold_json: input as Record<string, unknown> };
}

type Henvisning = Extract<ChatNode, { type: (typeof HENVISNINGS_NODER)[number] }>;

/** Bærer dokumentet mindst én (gyldig) #-henvisning? Kaster aldrig. */
export function harHenvisning(input: unknown): boolean {
  const gaa = (noder: readonly ChatNode[]): boolean =>
    noder.some((n) =>
      (HENVISNINGS_NODER as readonly string[]).includes(n.type) || ("content" in n && gaa(n.content as ChatNode[])),
    );
  return gaa(parseChatDokument(input));
}

/**
 * Henvisningens adresse i appen — ét sted for chattens visning. Samme ruter som
 * Community's renderer (CommunityDokument.tsx); aftalens adresse bygges KUN af
 * rabataftaleAdresse (værn: chatHenvisningFlade.guard dom d).
 */
export function henvisningsAdresse(node: Henvisning): string {
  switch (node.type) {
    case "henvisning":
      return `/akademiet/${node.area}/${node.slug}`;
    case "eventhenvisning":
      return `/events/${node.eventId}`;
    case "opslaghenvisning":
      return `/community/${node.traadId}`;
    case "rabathenvisning":
      return rabataftaleAdresse(node.aftaleId);
  }
}

/**
 * Sendefeltets afsendelse (ChatRichInput og redigeringsdialogen): teksten, som
 * den ALTID er blevet sendt — ren tekst, når editorens HTML kun er ét afsnit af
 * samme tekst, ellers HTML (isPlain-reglen, uændret) — og dokumentet, KUN når
 * det bærer en #-henvisning. Uden henvisning er der intet dokument, og content
 * bliver tegn for tegn det samme som før (prøve: chatAfsendelse.test.ts).
 */
export function chatAfsendelse(
  tekst: string,
  html: string,
  dokument: unknown,
): { content: string; dokument?: Record<string, unknown> } {
  const isPlain = html === `<p>${tekst}</p>`;
  const content = isPlain ? tekst : html;
  return harHenvisning(dokument) ? { content, dokument: dokument as Record<string, unknown> } : { content };
}
