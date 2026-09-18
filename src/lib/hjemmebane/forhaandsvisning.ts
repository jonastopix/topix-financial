/**
 * forhaandsvisning — den rene dom over send-til-underskrifts forhåndsvisningssvar (18/9 aften).
 *
 * HVORFOR I FLADEN OG IKKE ET NYT VINDUE: forhåndsvisningen kaldte window.open EFTER to await
 * (session + functions.invoke). I browserens øjne er klikket så ikke længere brugerens handling,
 * og vinduet blokeres — uanset at pop-ups er tilladt for domænet (Jonas 18/9: «tillad pop-ups»
 * hjalp ikke). Nu vises dokumentet i et panel på siden som REN TEKST (React escaper — aldrig
 * HTML fra data), så der er intet at blokere, og det virker også på telefon.
 */
export interface ForhaandsvisningSvar {
  titel?: string;
  skabelon?: string;
  tekst?: string;
  manglende?: string[];
  tomme?: string[];
  kan_sendes?: boolean;
  til?: string | null;
}

export interface ForhaandsvisningDom {
  kanSendes: boolean;
  /** Én linje øverst: «Kan sendes til x@y — intet er sendt» eller «Kan ikke sendes: …». */
  linje: string;
  /** Grundene, én pr. punkt — tom når den kan sendes. */
  grunde: string[];
  titel: string;
  skabelon: string;
  tekst: string;
}

export function afgoerForhaandsvisning(svar: ForhaandsvisningSvar): ForhaandsvisningDom {
  const grunde = [
    ...(svar.manglende ?? []).map((m) => `{{${m}}} kendes ikke`),
    ...(svar.tomme ?? []).map((t) => `{{${t}}} er tom`),
    ...(svar.til ? [] : ["ingen kontaktmail"]),
  ];
  const kanSendes = svar.kan_sendes === true;
  return {
    kanSendes,
    linje: kanSendes ? `Kan sendes til ${svar.til ?? "?"} — dette er en forhåndsvisning, intet er sendt.` : `Kan ikke sendes: ${grunde.join(" · ") || "ukendt grund"}.`,
    grunde: kanSendes ? [] : grunde,
    titel: svar.titel ?? "",
    skabelon: svar.skabelon ?? "",
    tekst: svar.tekst ?? "",
  };
}
