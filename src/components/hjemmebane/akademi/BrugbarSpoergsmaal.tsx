import * as React from "react";
import { BRUGBAR_JA, BRUGBAR_NEJ, BRUGBAR_SPOERGSMAAL } from "@/lib/hjemmebane/lektionBrugbar";

/** «Kunne du bruge den?» — én rolig række under lektionens footer, når
    lektionen er set færdig og ubesvaret (dommen skalSpoergeOmBrugbar bor i
    ElementView). To pills i den rå form fra ProgressViews «Markér hele
    modulet» (klasserne kopieret ordret); disabled mens svaret gemmes.
    Ingen egen tilstand: ElementView ejer «har svaret i dette besøg». */
export const BrugbarSpoergsmaal = ({
  onSvar,
  gemmer,
}: {
  onSvar: (svar: boolean) => void;
  gemmer: boolean;
}) => (
  <div role="group" aria-label={BRUGBAR_SPOERGSMAAL} className="mt-4 flex flex-wrap items-center gap-3">
    <span className="text-sm text-hb-ink">{BRUGBAR_SPOERGSMAAL}</span>
    <button
      type="button"
      onClick={() => onSvar(true)}
      disabled={gemmer}
      className="shrink-0 rounded-full border border-hb-line px-3.5 py-1.5 text-sm text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink disabled:opacity-40"
    >
      {BRUGBAR_JA}
    </button>
    <button
      type="button"
      onClick={() => onSvar(false)}
      disabled={gemmer}
      className="shrink-0 rounded-full border border-hb-line px-3.5 py-1.5 text-sm text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink disabled:opacity-40"
    >
      {BRUGBAR_NEJ}
    </button>
  </div>
);
