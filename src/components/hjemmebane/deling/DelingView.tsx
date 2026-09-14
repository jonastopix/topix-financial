/**
 * DelingView — første skridt (Jonas 14/9): ÉN kreativ på skærmen, så vi kan
 * se om oversættelsen rammer designet. Ingen valg, ingen upload, ingen
 * download, ingen tekstudkast endnu.
 *
 * Kreativen tegnes i fuld størrelse (1080×1080) og skaleres ned med
 * transform:scale() til kolonnens bredde — så det er de rigtige px der
 * vises, ikke et responsivt layout. Teksterne er designets prøvetekster
 * (v2:348). Skalaen måles med ResizeObserver på wrapperen; hooks står i
 * topblokken før enhver return (React #310-reglen).
 */

import { useEffect, useRef, useState } from "react";
import { FORMATER, PROEVETEKSTER } from "@/lib/delingskreativ";
import { KreativTrePaaRaekke } from "./KreativTrePaaRaekke";

const FORMAT = FORMATER.kvadrat;

export const DelingView = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [skala, setSkala] = useState(1);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const maal = () => setSkala(Math.min(1, el.clientWidth / FORMAT.bredde));
    maal();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(maal);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-hb-ink-soft">Delingskreativ · første skridt</p>
        <h1 className="font-brand text-2xl font-semibold text-hb-ink">Tre på række — mørk kvadrat</h1>
        <p className="text-sm text-hb-ink-soft">Designets prøvetekster. Tomme billedfelter viser pladsholderen — kun i denne forhåndsvisning.</p>
      </div>

      <div ref={wrapperRef} className="w-full" style={{ height: `${FORMAT.hoejde * skala}px` }}>
        <div style={{ transform: `scale(${skala})`, transformOrigin: "top left", width: `${FORMAT.bredde}px`, height: `${FORMAT.hoejde}px` }}>
          <KreativTrePaaRaekke
            udgave="moerk"
            format="kvadrat"
            memberName={PROEVETEKSTER.memberName}
            companyName={PROEVETEKSTER.companyName}
            dateLabel={PROEVETEKSTER.dateLabel}
            visTomtilstand
          />
        </div>
      </div>
    </div>
  );
};
