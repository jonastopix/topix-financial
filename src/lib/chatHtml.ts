/**
 * src/lib/chatHtml.ts — chatboblens HTML-rensning og listernes numre (1/10-2026).
 *
 * FEJLEN (Jonas 1/10 13:09): en nummereret liste med tre punkter — hvert med en
 * fed overskrift og en tekst under — blev vist som «1. … 1. … 1. …».
 *
 * MÅLT I KODEN:
 *   - Sendefeltet (ChatRichInput, StarterKit 2.27.2) har OrderedList's
 *     input-regel /^(\d+)\.\s$/ med getAttributes { start: +tal } og
 *     joinPredicate «forrige liste har childCount + start === tal». Står der et
 *     afsnit (teksten under overskriften) mellem punkterne, er forrige node ikke
 *     en liste, og «2. » laver en NY <ol start="2"> — renderHTML udelader kun
 *     start, når den er 1. Det gemte er altså rigtigt: <ol>…</ol><p>…</p>
 *     <ol start="2">…</ol><p>…</p><ol start="3">…</ol>.
 *   - Visningen smed tallet væk to steder: DOMPurify-listen i ChatBeskedTekst
 *     tillod kun href/target/rel (start blev fjernet), og dokument-vejen
 *     (parseCommunityDokument → renderNode) kendte ikke attrs.start.
 *
 * RETTELSEN SIDDER I VISNINGEN, så også gamle beskeder bliver rigtige:
 *   1. `start` bevares — KUN på <ol>, KUN som helt tal 2..MAKS_LISTESTART
 *      (listeStart, samme dom som dokument-parseren). Ingen anden attribut
 *      åbnes; alt andet er DOMPurify-listen, som før.
 *   2. En <ol> UDEN eget start, hvis nærmeste forrige søskende — når tomme
 *      afsnit, <br> og blanktegn springes over — er en <ol>, fortsætter dens
 *      tælling: start = forriges start + antal <li>. Et afsnit med tekst
 *      imellem bryder fortsættelsen (så er det forfatterens to lister).
 * Punktlister (<ul>) røres ikke.
 */
import DOMPurify from "dompurify";
import { listeStart, MAKS_LISTESTART } from "@/lib/hjemmebane/communityDokument";
import type { ChatNode } from "@/lib/chatDokument";

export const CHAT_TILLADTE_TAGS = ["b", "strong", "i", "em", "ul", "ol", "li", "a", "p", "br"];
export const CHAT_TILLADTE_ATTR = ["href", "target", "rel"];

/** Et afsnit uden tekst og uden andet end <br> — springes over mellem to lister. */
function erTomtSkillerum(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").trim() === "";
  if (node.nodeType === Node.COMMENT_NODE) return true;
  if (!(node instanceof Element)) return false;
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return true;
  if (tag !== "p") return false;
  if ((node.textContent ?? "").trim() !== "") return false;
  return Array.from(node.children).every((barn) => barn.tagName.toLowerCase() === "br");
}

function forrigeListe(ol: Element): Element | null {
  let node = ol.previousSibling;
  while (node !== null && erTomtSkillerum(node)) node = node.previousSibling;
  return node instanceof Element && node.tagName.toLowerCase() === "ol" ? node : null;
}

function antalPunkter(ol: Element): number {
  return Array.from(ol.children).filter((barn) => barn.tagName.toLowerCase() === "li").length;
}

/**
 * content → renset HTML til dangerouslySetInnerHTML. Samme tag-/attributliste
 * som før + `start` på <ol> (valideret), og fortsat tælling over tomme skillerum.
 */
export function renskChatHtml(content: string): string {
  const fragment = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: CHAT_TILLADTE_TAGS,
    ALLOWED_ATTR: [...CHAT_TILLADTE_ATTR, "start"],
    RETURN_DOM_FRAGMENT: true,
  });
  // start er KUN tilladt på <ol> og kun som gyldigt tal.
  for (const el of Array.from(fragment.querySelectorAll("[start]"))) {
    const start = el.tagName.toLowerCase() === "ol" ? listeStart(el.getAttribute("start")) : null;
    if (start === null) el.removeAttribute("start");
    else el.setAttribute("start", String(start));
  }
  // Dokumentorden: en forrige <ol> har altid fået sit endelige start først.
  for (const ol of Array.from(fragment.querySelectorAll("ol"))) {
    if (ol.hasAttribute("start")) continue;
    const forrige = forrigeListe(ol);
    if (forrige === null) continue;
    const fortsat = listeStart((listeStart(forrige.getAttribute("start")) ?? 1) + antalPunkter(forrige));
    if (fortsat !== null) ol.setAttribute("start", String(fortsat));
  }
  const holder = document.createElement("div");
  holder.appendChild(fragment);
  return holder.innerHTML;
}

/**
 * Dokument-vejen: samme fortsættelse som renskChatHtml for to <ol>-søskende,
 * der står lige efter hinanden (parseChatDokument har allerede fjernet tomme
 * afsnit). Et eget start (attrs.start, båret af parseren) står ved magt.
 * Rekursivt, så lister inde i et punkt også nummereres. Ren; ændrer ikke input.
 */
export function nummererLister(noder: readonly ChatNode[]): ChatNode[] {
  const ud: ChatNode[] = [];
  for (const node of noder) {
    let ny: ChatNode = "content" in node ? ({ ...node, content: nummererLister(node.content as ChatNode[]) } as ChatNode) : node;
    const forrige = ud[ud.length - 1];
    if (ny.type === "orderedList" && ny.start === undefined && forrige?.type === "orderedList") {
      const fortsat = (forrige.start ?? 1) + forrige.content.length;
      if (fortsat >= 2 && fortsat <= MAKS_LISTESTART) ny = { ...ny, start: fortsat };
    }
    ud.push(ny);
  }
  return ud;
}
