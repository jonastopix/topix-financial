import { Info } from "lucide-react";

/** Forsiden er ryddet (seks steder, 2/10-2026; rådets fund 1): de fire
    admin-editorer (push, ugens video, redaktionelt, evergreen) lovede
    stadig forsiden — «Seneste publicerede er forsidens hero» — men
    BoardroomView tegner ingen af dem længere. Linjen står synligt ØVERST i
    listekolonnen i alle fire views, så ingen rådgiver publicerer til en
    plads, der ikke findes. Ordene bor ÉT sted (her); fanerne er ikke
    fjernet — indholdet får plads i Akademiet som «Nyt fra os» (skridt 2+). */
export const FORSIDEN_RYDDET_LINJE =
  "Vises ikke for medlemmer lige nu — forsiden er ryddet (2/10). Indholdet får plads i Akademiet som «Nyt fra os».";

export const ForsidenRyddetLinje = () => (
  <div className="flex items-start gap-2.5 border-b border-hb-line bg-hb-sage/20 px-4 py-3" data-forsiden-ryddet>
    <Info className="mt-0.5 h-4 w-4 shrink-0 text-hb-ink-soft" aria-hidden="true" />
    <p className="text-xs leading-relaxed text-hb-ink">{FORSIDEN_RYDDET_LINJE}</p>
  </div>
);
