/**
 * KreativTrePaaRaekke — 3a «Tre på række» i fuld px-størrelse, oversat
 * element for element fra v2:32-158: topblok (label + overskrift), rækken
 * (medlem, Morten, Jonas), logokort og ordmærke. Absolut px-layout som
 * designet. Alle tal læses fra måltabellen TRE_PAA_RAEKKE i
 * delingskreativ.ts — intet mål står her.
 *
 * Kvadrat og liggende har samme dele, men ikke samme struktur (v2:69-97):
 * liggende skriver overskriften på én linje, sætter ordmærket øverst til
 * højre og logokortet nederst til højre hver for sig, hvor kvadrat har
 * dem i én bundrække. Derfor de tre nullable felter i tabellen
 * (bundraekke, logokortAbs, ordmaerkeAbs) — komponenten følger tabellen,
 * ikke omvendt. Mørk og lys er kun farver.
 *
 * `visTomtilstand` (default true) styrer om tomme billedfelter viser
 * pladsholderen — true i forhåndsvisningen, false når kreativen hentes.
 */

import { TEKSTER, TRE_PAA_RAEKKE, kombination, skriftStil, type LogokortMaal } from "@/lib/delingskreativ";
import { KreativBilledfelt } from "./KreativBilledfelt";
import { KreativRaadgivere } from "./KreativRaadgivere";
import type { KreativProps } from "./kreativProps";

/** Bevaret navn fra første skridt. */
export type KreativTrePaaRaekkeProps = KreativProps;

/** Det hvide logokort — samme form i alle tre layouts. */
export const KreativLogokort = ({ maal, logoUrl, companyName, visTomtilstand, style }: { maal: LogokortMaal; logoUrl?: string | null; companyName: string; visTomtilstand: boolean; style?: React.CSSProperties }) => (
  <div
    style={{
      width: `${maal.bredde}px`,
      height: `${maal.hoejde}px`,
      borderRadius: `${maal.radius}px`,
      background: maal.baggrund,
      border: `1px solid ${maal.kant}`,
      display: "grid",
      placeItems: "center",
      padding: `${maal.padding}px`,
      boxSizing: "border-box",
      color: maal.pladsholderFarve,
      flex: "none",
      ...style,
    }}
  >
    <KreativBilledfelt
      url={logoUrl}
      bredde={maal.slot.bredde}
      hoejde={maal.slot.hoejde}
      form="rektangel"
      tilpasning="contain"
      pladsholder={TEKSTER.pladsholderLogo}
      visTomtilstand={visTomtilstand}
      alt={companyName}
    />
  </div>
);

export const KreativTrePaaRaekke = ({ udgave, format, memberName, companyName, dateLabel, portraetUrl, logoUrl, visTomtilstand = true }: KreativProps) => {
  const m = TRE_PAA_RAEKKE[kombination(udgave, format)];

  return (
    <div
      data-kreativ="tre-paa-raekke"
      data-udgave={udgave}
      data-format={format}
      style={{ position: "relative", width: `${m.canvas.bredde}px`, height: `${m.canvas.hoejde}px`, background: m.canvas.baggrund, overflow: "hidden", boxSizing: "border-box" }}
    >
      {/* v2:39-41 / :70-72 — topblok */}
      <div
        style={{
          position: "absolute",
          left: `${m.topblok.venstre}px`,
          right: m.topblok.hoejre === null ? undefined : `${m.topblok.hoejre}px`,
          top: `${m.topblok.top}px`,
          display: "flex",
          flexDirection: "column",
          gap: `${m.topblok.gap}px`,
        }}
      >
        <div style={skriftStil(m.label)}>
          {TEKSTER.optaget} {dateLabel}
        </div>
        <div style={skriftStil(m.overskrift)}>
          {m.overskriftEnLinje ? (
            `${TEKSTER.overskrift[0]} ${TEKSTER.overskrift[1]}`
          ) : (
            <>
              {TEKSTER.overskrift[0]}
              <br />
              {TEKSTER.overskrift[1]}
            </>
          )}
        </div>
      </div>

      {/* v2:74 / :135 — liggende: ordmærket øverst til højre */}
      {m.ordmaerkeAbs && (
        <img
          src={m.ordmaerke.fil}
          alt="Topix"
          style={{ position: "absolute", right: `${m.ordmaerkeAbs.hoejre}px`, top: `${m.ordmaerkeAbs.top}px`, width: `${m.ordmaerke.bredde}px`, height: "auto" }}
        />
      )}

      {/* v2:43-63 / :75-95 — rækken: medlem, Morten, Jonas */}
      <div
        style={{
          position: "absolute",
          left: `${m.raekke.venstre}px`,
          right: m.raekke.hoejre === null ? undefined : `${m.raekke.hoejre}px`,
          top: `${m.raekke.top}px`,
          display: "flex",
          alignItems: "flex-start",
          gap: `${m.raekke.gap}px`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: `${m.medlem.gap}px`, width: `${m.medlem.bredde}px`, flex: "none" }}>
          {/* ringen; tomtilstandens currentColor arver herfra (image-slot.js:286-290: fladens tekstfarve) */}
          <div
            style={{
              width: `${m.medlem.ring.diameter}px`,
              height: `${m.medlem.ring.diameter}px`,
              borderRadius: "50%",
              border: `${m.medlem.ring.kant}px solid ${m.medlem.ring.farve}`,
              display: "grid",
              placeItems: "center",
              boxSizing: "border-box",
              color: m.medlem.ring.pladsholderFarve,
            }}
          >
            <KreativBilledfelt
              url={portraetUrl}
              bredde={m.medlem.ring.slot}
              hoejde={m.medlem.ring.slot}
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

      {/* v2:65-67 — kvadrat: logokort og ordmærke i én bundrække */}
      {m.bundraekke && (
        <div
          style={{
            position: "absolute",
            left: `${m.bundraekke.venstre}px`,
            right: `${m.bundraekke.hoejre}px`,
            bottom: `${m.bundraekke.bund}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <KreativLogokort maal={m.logokort} logoUrl={logoUrl} companyName={companyName} visTomtilstand={visTomtilstand} />
          <img src={m.ordmaerke.fil} alt="Topix" style={{ display: "block", width: `${m.ordmaerke.bredde}px`, height: "auto" }} />
        </div>
      )}

      {/* v2:97 / :158 — liggende: logokortet nederst til højre */}
      {m.logokortAbs && (
        <KreativLogokort
          maal={m.logokort}
          logoUrl={logoUrl}
          companyName={companyName}
          visTomtilstand={visTomtilstand}
          style={{ position: "absolute", right: `${m.logokortAbs.hoejre}px`, bottom: `${m.logokortAbs.bund}px` }}
        />
      )}
    </div>
  );
};
