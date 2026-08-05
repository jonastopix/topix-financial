/** Tom-body-dommen for richtext-felter: Tiptap efterlader "<p></p>"-skaller
    (og &nbsp;/whitespace), så et truthy-tjek af body lyver. Én sandhed —
    bruges af forsidens hero (Læs mere-blokken) og ElementViews body-render. */
export function hasRichTextContent(body: string | null): boolean {
  if (!body) return false;
  return (
    body
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .trim().length > 0
  );
}
