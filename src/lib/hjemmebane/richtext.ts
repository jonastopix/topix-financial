/** Richtext-håndteringen — én sandhed for «hvad er der egentlig i et
    Tiptap-felt». Rene funktioner, nul imports, ingen DOM (DOMParser findes
    ikke i Deno, og spejlet i supabase/functions/_shared/richtext.ts skal
    kunne bære den samme kode ordret — pariteten låses i
    __tests__/richtext.test.ts).

    renTekst (14/9): et uddrag af en besked må aldrig vise tags som tekst.
    Klokken viste ordret «<p>Hej Jonas, </p><p>Jo, det virkede ok! :-)<br>…»
    fordi chatten sender Tiptap-HTML (ChatRichInput: getHTML, medmindre
    beskeden er ren tekst) og notifikationen klippede de første 250 tegn af
    HTML'en. Afsnit og linjeskift bliver til ét mellemrum, så to afsnit ikke
    klistrer sammen; de almindelige entiteter oversættes; whitespace
    normaliseres. Bruges af klokken (lib/hjemmebane/klokke.ts) og af
    send-slack-chat-notification (gennem spejlet). */

const ENTITETER: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/** Ren tekst af richtext: tags væk, blokgrænser til mellemrum, entiteter
    oversat, whitespace normaliseret. Ren tekst uden tags går uændret igennem
    (ud over whitespace-normalisering). */
export function renTekst(body: string | null | undefined): string {
  if (!body) return "";
  return body
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (m) => ENTITETER[m.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Tom-body-dommen for richtext-felter: Tiptap efterlader "<p></p>"-skaller
    (og &nbsp;/whitespace), så et truthy-tjek af body lyver. Én sandhed —
    bruges af forsidens hero (Læs mere-blokken) og ElementViews body-render. */
export function hasRichTextContent(body: string | null): boolean {
  return renTekst(body).length > 0;
}
