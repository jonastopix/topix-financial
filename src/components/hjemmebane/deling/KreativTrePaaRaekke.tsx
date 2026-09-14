/**
 * KreativTrePaaRaekke — 3a «Tre på række» i fuld px-størrelse, oversat
 * element for element fra v2:38-67 (mørk kvadrat). Absolut px-layout som
 * designet: topblok (label + overskrift), rækken (medlem, Morten, Jonas),
 * bundrækken (logokort + ordmærke). Alle tal læses fra måltabellen i
 * delingskreativ.ts — intet mål står her.
 *
 * Første skridt (Jonas 14/9): kun udgave="moerk" og format="kvadrat" er
 * bygget. De øvrige er typer; hentMaal() svarer null, og komponenten siger
 * det i stedet for at tegne noget forkert.
 *
 * `visTomtilstand` (default true) styrer om tomme billedfelter viser
 * pladsholderen — true i forhåndsvisningen, false når kreativen hentes.
 */

import { FORMATER, TEKSTER, hentMaal, skriftStil, type Format, type Udgave } from "@/lib/delingskreativ";
import { KreativBilledfelt } from "./KreativBilledfelt";
import { KreativRaadgivere } from "./KreativRaadgivere";

export interface KreativTrePaaRaekkeProps {
  udgave: Udgave;
  format: Format;
  memberName: string;
  companyName: string;
  dateLabel: string;
  portraetUrl?: string | null;
  logoUrl?: string | null;
  visTomtilstand?: boolean;
}

export const KreativTrePaaRaekke = ({ udgave, format, memberName, companyName, dateLabel, portraetUrl, logoUrl, visTomtilstand = true }: KreativTrePaaRaekkeProps) => {
  const m = hentMaal("tre_paa_raekke", udgave, format);
  if (!m) {
    const f = FORMATER[format];
    return (
      <div
        data-kreativ="ikke-bygget"
        style={{ width: `${f.bredde}px`, height: `${f.hoejde}px`, display: "grid", placeItems: "center", background: "#E9E9E7", color: "#133332", font: "600 32px/1.2 'Parkinsans', system-ui, sans-serif" }}
      >
        Ikke bygget endnu: {udgave} {format}
      </div>
    );
  }

  return (
    <div
      data-kreativ="tre-paa-raekke"
      data-udgave={udgave}
      data-format={format}
      style={{ position: "relative", width: `${m.canvas.bredde}px`, height: `${m.canvas.hoejde}px`, background: m.canvas.baggrund, overflow: "hidden", boxSizing: "border-box" }}
    >
      {/* v2:39-41 — topblok */}
      <div style={{ position: "absolute", left: `${m.topblok.venstre}px`, right: `${m.topblok.hoejre}px`, top: `${m.topblok.top}px`, display: "flex", flexDirection: "column", gap: `${m.topblok.gap}px` }}>
        <div style={skriftStil(m.label)}>
          {TEKSTER.optaget} {dateLabel}
        </div>
        <div style={skriftStil(m.overskrift)}>
          {TEKSTER.overskrift[0]}
          <br />
          {TEKSTER.overskrift[1]}
        </div>
      </div>

      {/* v2:43-63 — rækken: medlem, Morten, Jonas */}
      <div style={{ position: "absolute", left: `${m.raekke.venstre}px`, right: `${m.raekke.hoejre}px`, top: `${m.raekke.top}px`, display: "flex", alignItems: "flex-start", gap: `${m.raekke.gap}px` }}>
        <div style={{ display: "flex", flexDirection: "column", gap: `${m.medlem.gap}px`, width: `${m.medlem.bredde}px`, flex: "none" }}>
          {/* v2:45 — ringen; tomtilstandens currentColor arver herfra (image-slot.js:286-290: fladens tekstfarve) */}
          <div
            style={{
              width: `${m.medlem.ring.diameter}px`,
              height: `${m.medlem.ring.diameter}px`,
              borderRadius: "50%",
              border: `${m.medlem.ring.kant}px solid ${m.medlem.ring.farve}`,
              display: "grid",
              placeItems: "center",
              boxSizing: "border-box",
              color: m.medlem.virksomhed.farve,
            }}
          >
            <KreativBilledfelt
              url={portraetUrl}
              bredde={m.medlem.slot.diameter}
              hoejde={m.medlem.slot.diameter}
              form="cirkel"
              tilpasning="cover"
              pladsholder={TEKSTER.pladsholderPortraet}
              visTomtilstand={visTomtilstand}
              alt={memberName}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: `${m.medlem.tekstGap}px` }}>
            <div style={skriftStil(m.medlem.nytMedlem)}>{TEKSTER.nytMedlem}</div>
            <div style={skriftStil(m.medlem.navn)}>{memberName}</div>
            <div style={skriftStil(m.medlem.virksomhed)}>{companyName}</div>
          </div>
        </div>
        <KreativRaadgivere maal={m.raadgiver} />
      </div>

      {/* v2:65-67 — bundrækken: logokort og ordmærke */}
      <div style={{ position: "absolute", left: `${m.bund.venstre}px`, right: `${m.bund.hoejre}px`, bottom: `${m.bund.bund}px`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            width: `${m.logokort.bredde}px`,
            height: `${m.logokort.hoejde}px`,
            borderRadius: `${m.logokort.radius}px`,
            background: m.logokort.baggrund,
            border: `1px solid ${m.logokort.kant}`,
            display: "grid",
            placeItems: "center",
            padding: `${m.logokort.padding}px`,
            boxSizing: "border-box",
            color: m.canvas.baggrund,
          }}
        >
          <KreativBilledfelt
            url={logoUrl}
            bredde={m.logokort.slot.bredde}
            hoejde={m.logokort.slot.hoejde}
            form="rektangel"
            tilpasning="contain"
            pladsholder={TEKSTER.pladsholderLogo}
            visTomtilstand={visTomtilstand}
            alt={companyName}
          />
        </div>
        <img src={m.ordmaerke.fil} alt="Topix" style={{ display: "block", width: `${m.ordmaerke.bredde}px`, height: "auto" }} />
      </div>
    </div>
  );
};
