/** Spejl af src/lib/hjemmebane/richtext.ts (14/9). src/lib er kanonisk,
    dette er spejlet — samme regel som betalingsfrist, fornyelse og
    branchekode. Pariteten låses i src/lib/hjemmebane/__tests__/richtext.test.ts:
    samme input skal give samme tekst. Ret der først, spejl herefter. */

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
    oversat, whitespace normaliseret. */
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
