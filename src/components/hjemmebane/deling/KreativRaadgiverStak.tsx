/**
 * KreativRaadgiverStak — de to rådgiverportrætter små og overlappende, som
 * 3b og 3c viser dem (v2:180, :202, :272, :294): to cirkler med kant i
 * fladens farve, den anden trukket ind over den første med negativ
 * margin-left. Rækkefølgen er designets (Morten, Jonas — RAADGIVERE).
 */

import { RAADGIVERE, type RaadgiverStakMaal } from "@/lib/delingskreativ";

export const KreativRaadgiverStak = ({ maal }: { maal: RaadgiverStakMaal }) => (
  <div style={{ display: "flex", flex: "none" }}>
    {RAADGIVERE.map((r, i) => (
      <img
        key={r.navn}
        src={r.fil}
        alt={r.navn}
        style={{
          display: "block",
          width: `${maal.portraet}px`,
          height: `${maal.portraet}px`,
          borderRadius: "50%",
          objectFit: "cover",
          border: `${maal.kant}px solid ${maal.kantFarve}`,
          marginLeft: i === 0 ? 0 : `${-maal.overlap}px`,
          boxSizing: "content-box",
        }}
      />
    ))}
  </div>
);
