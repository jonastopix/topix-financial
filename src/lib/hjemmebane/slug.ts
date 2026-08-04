/** Slug-generering til indholdslaget: dansk translitteration, URL-stabil.
    Bruges som forslag ud fra titlen — feltet er altid redigérbart, og
    unikhed håndhæves af DB'ens UNIQUE-constraint (fejl vises inline). */

const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    // é, ü, ñ osv. → basisbogstav via Unicode-dekomposition
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
