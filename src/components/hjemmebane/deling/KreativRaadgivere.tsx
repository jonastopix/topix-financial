/**
 * KreativRaadgivere — de to rådgiverportrætter i fuld størrelse med navne,
 * som 3a «Tre på række» viser dem (v2:52-62): to ens kolonner, portræt som
 * cirkel med object-fit cover, label «Rådgiver» i versaler og navnet under.
 * Rækkefølgen er designets (Morten, Jonas — RAADGIVERE i delingskreativ.ts).
 * Målene kommer udefra, så 3b/3c's små, overlappende portrætter senere kan
 * få deres egen komponent uden at røre denne.
 */

import { RAADGIVERE, TEKSTER, skriftStil, type TrePaaRaekkeMaal } from "@/lib/delingskreativ";

export interface KreativRaadgivereProps {
  maal: TrePaaRaekkeMaal["raadgiver"];
}

export const KreativRaadgivere = ({ maal }: KreativRaadgivereProps) => (
  <>
    {RAADGIVERE.map((r) => (
      <div
        key={r.navn}
        style={{ display: "flex", flexDirection: "column", gap: `${maal.gap}px`, width: `${maal.bredde}px`, paddingTop: `${maal.paddingTop}px`, flex: "none" }}
      >
        <img
          src={r.fil}
          alt={r.navn}
          style={{ display: "block", width: `${maal.portraet}px`, height: `${maal.portraet}px`, borderRadius: "50%", objectFit: "cover" }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: `${maal.tekstGap}px` }}>
          <div style={skriftStil(maal.label)}>{TEKSTER.raadgiver}</div>
          <div style={skriftStil(maal.navn)}>{r.navn}</div>
        </div>
      </div>
    ))}
  </>
);
