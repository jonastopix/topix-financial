/**
 * src/lib/aftaleMarkdown.ts — aftalegrundlagets Markdown oversat til STRUKTUR, aldrig til HTML.
 *
 * Spejlet ordret i supabase/functions/_shared/aftaleMarkdown.ts (paritetstest
 * src/lib/__tests__/aftaleMarkdownParitet.test.ts). Nul imports.
 *
 * HVORFOR (Jonas' prøve 18/9 aften): aftaleteksten (aftale_skabelon) er Markdown — «# Aftalegrundlag …»,
 * «## 1. Baggrund», «**Mellem:**», «*I denne aftale …*», «- **Akademiet:** …», «---» — og blev vist rå på
 * underskriftssiden, i forhåndsvisningen og i PDF'en. Ren tekst var rigtigt tænkt (aldrig HTML fra data),
 * men ulæseligt. Denne oversætter kender KUN de tegn aftalen bruger: overskrifter (#, ##, ###), fed (**…**),
 * kursiv (*…*), punktlister (- …), citat (> …) og streg (---). Intet andet tolkes; HTML i teksten er tekst.
 * Den, der viser (React, pdf-lib), sætter selv struktur på — der findes ingen dangerouslySetInnerHTML.
 */
export interface Span {
  tekst: string;
  fed: boolean;
  kursiv: boolean;
}

export type Blok =
  | { slags: "overskrift"; niveau: 1 | 2 | 3; spans: Span[] }
  | { slags: "afsnit"; spans: Span[] }
  | { slags: "liste"; punkter: Span[][] }
  | { slags: "citat"; spans: Span[] }
  | { slags: "streg" };

/**
 * Inline: `**fed**` og `*kursiv*`. Kun disse to. Et umage tegn står som tekst.
 * Aldrig HTML: teksten bæres som strenge i Span — den der viser, escaper.
 */
export function parseSpans(linje: string): Span[] {
  const ud: Span[] = [];
  let fed = false;
  let kursiv = false;
  let buf = "";
  const luk = () => {
    if (buf) ud.push({ tekst: buf, fed, kursiv });
    buf = "";
  };
  let i = 0;
  while (i < linje.length) {
    if (linje.startsWith("**", i)) {
      const lukker = linje.indexOf("**", i + 2);
      if (fed || lukker > i + 2) { luk(); fed = !fed; i += 2; continue; }
    } else if (linje[i] === "*") {
      const lukker = linje.indexOf("*", i + 1);
      if (kursiv || (lukker > i + 1 && linje[i + 1] !== " ")) { luk(); kursiv = !kursiv; i += 1; continue; }
    }
    buf += linje[i];
    i++;
  }
  luk();
  return ud;
}

/** Blokke: `#`/`##`/`###` overskrift, `- ` liste, `> ` citat, `---` streg, tom linje = afsnitsskift, ellers afsnit. */
export function parseAftaleTekst(tekst: string): Blok[] {
  const ud: Blok[] = [];
  let liste: Span[][] | null = null;
  const lukListe = () => {
    if (liste && liste.length > 0) ud.push({ slags: "liste", punkter: liste });
    liste = null;
  };
  for (const raa of tekst.replace(/\r\n?/g, "\n").split("\n")) {
    const linje = raa.replace(/[ \t]+$/g, "");
    const punkt = /^\s*[-*•] +(.*)$/.exec(linje);
    if (punkt) {
      (liste ??= []).push(parseSpans(punkt[1]));
      continue;
    }
    lukListe();
    if (linje.trim() === "") continue;
    const overskrift = /^(#{1,3}) +(.*)$/.exec(linje);
    if (overskrift) { ud.push({ slags: "overskrift", niveau: overskrift[1].length as 1 | 2 | 3, spans: parseSpans(overskrift[2].trim()) }); continue; }
    if (/^-{3,}$/.test(linje.trim()) || /^\*{3,}$/.test(linje.trim())) { ud.push({ slags: "streg" }); continue; }
    const citat = /^> ?(.*)$/.exec(linje);
    if (citat) { ud.push({ slags: "citat", spans: parseSpans(citat[1]) }); continue; }
    ud.push({ slags: "afsnit", spans: parseSpans(linje.trim()) });
  }
  lukListe();
  return ud;
}

/** Spans som ren tekst — markørerne er væk. */
export function spansTilTekst(spans: readonly Span[]): string {
  return spans.map((s) => s.tekst).join("");
}

/** Er hele linjen fed (som «**Mellem:**»)? Bruges hvor kun hel-fed kan vises (PDF'en). */
export function erHeltFed(spans: readonly Span[]): boolean {
  const medTekst = spans.filter((s) => s.tekst.trim() !== "");
  return medTekst.length > 0 && medTekst.every((s) => s.fed);
}

/** Hele dokumentet som ren tekst uden markører, én linje pr. blok (lister med «• »). Til søgning og tests. */
export function aftaleSomRenTekst(tekst: string): string {
  return parseAftaleTekst(tekst)
    .map((b) => (b.slags === "streg" ? "———" : b.slags === "liste" ? b.punkter.map((p) => `• ${spansTilTekst(p)}`).join("\n") : spansTilTekst(b.spans)))
    .join("\n");
}
