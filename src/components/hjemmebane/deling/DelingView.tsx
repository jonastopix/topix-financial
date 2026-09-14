/**
 * DelingView — overblik og fuldskærm (Jonas 14/9).
 *
 * Siden viser et GALLERI af kreativer i lille format. Klik på ét kort →
 * kreativen vises stor (KreativFuldskaerm), hvor man kan skifte mellem
 * kreativerne og klikke sig tilbage til overblikket. Med tolv varianter er
 * tolv store kreativer ubrugeligt; galleriet er den form der skalerer.
 *
 * Ren flade: listen KREATIVER (kreativer.tsx) er det eneste galleriet
 * læser — et nyt layout eller en ny udgave er én post der. Lige nu findes
 * kun 3a mørk kvadrat, så galleriet viser ét kort. Teksterne er designets
 * prøvetekster (v2:348). Ingen upload, download eller tekstudkast endnu.
 *
 * Skaleringen bor i SkaleretKreativ: den boks der findes i layoutet er den
 * man ser (rettelsen 14/9 efter første skridt).
 */

import { useState } from "react";
import { PROEVETEKSTER } from "@/lib/delingskreativ";
import { KreativFuldskaerm } from "./KreativFuldskaerm";
import { SkaleretKreativ } from "./SkaleretKreativ";
import { KREATIVER, kreativMaal } from "./kreativer";

export const DelingView = () => {
  const [aaben, setAaben] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-hb-ink-soft">Delingskreativ</p>
        <h1 className="font-brand text-2xl font-semibold text-hb-ink">Overblik</h1>
        <p className="text-sm text-hb-ink-soft">
          {KREATIVER.length === 1 ? "Én kreativ" : `${KREATIVER.length} kreativer`} — klik for at se den stor. Designets prøvetekster; tomme billedfelter viser pladsholderen kun her.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Kreativer">
        {KREATIVER.map((post, i) => {
          const maal = kreativMaal(post);
          const Kreativ = post.komponent;
          return (
            <li key={post.id}>
              <button
                type="button"
                onClick={() => setAaben(i)}
                aria-label={`Vis stor: ${post.titel}`}
                className="group flex w-full flex-col gap-3 rounded-hb border border-hb-line bg-hb-surface p-3 text-left transition-shadow duration-300 hover:shadow-hb-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60"
              >
                <SkaleretKreativ bredde={maal.bredde} hoejde={maal.hoejde} className="overflow-hidden rounded-[6px]">
                  <Kreativ
                    udgave={post.udgave}
                    format={post.format}
                    memberName={PROEVETEKSTER.memberName}
                    companyName={PROEVETEKSTER.companyName}
                    dateLabel={PROEVETEKSTER.dateLabel}
                    visTomtilstand
                  />
                </SkaleretKreativ>
                <span className="flex flex-col gap-0.5 px-1 pb-1">
                  <span className="text-sm font-medium text-hb-ink">{post.titel}</span>
                  <span className="text-xs text-hb-ink-soft">
                    {maal.bredde}×{maal.hoejde}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {aaben !== null && (
        <KreativFuldskaerm kreativer={KREATIVER} indeks={aaben} onSkift={setAaben} onLuk={() => setAaben(null)} />
      )}
    </div>
  );
};
