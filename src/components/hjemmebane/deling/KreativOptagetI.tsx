/**
 * KreativOptagetI — 3c «Optaget i» (overskrift øverst, afsenderbjælke
 * nederst), oversat element for element fra v2:250-341: øjenbryn (streg +
 * «Optaget {{ dateLabel }}»), overskriften «Optaget i / The Boardroom»,
 * portrætcirklen med kant, navn og virksomhed, logokortet, og nederst en
 * bjælke i accentfarven med de to små rådgiverportrætter, teksten og
 * ordmærket. Alle tal fra OPTAGET_I i delingskreativ.ts.
 *
 * Kvadrat (v2:256-278): rækken under overskriften har ringen til venstre
 * og en tekstkolonne (navneblok + logokort) til højre. Liggende
 * (v2:280-297): navneblokken står i topblokken under overskriften, og
 * ringen og logokortet står i en kolonne øverst til højre. Rådgiverteksten
 * er label + navne i kvadrat (v2:274-275) og én linje «Rådgivere: …» i
 * liggende (v2:295). Mørk og lys er kun farver — men bjælken og ordmærket
 * bytter: mørk har lys bjælke (ocean) med navy ordmærke, lys har navy
 * bjælke med shell ordmærke.
 */

import { OPTAGET_I, RAADGIVER_NAVNE, TEKSTER, kombination, skriftStil } from "@/lib/delingskreativ";
import { KreativBilledfelt } from "./KreativBilledfelt";
import { KreativRaadgiverStak } from "./KreativRaadgiverStak";
import { KreativLogokort } from "./KreativTrePaaRaekke";
import type { KreativProps } from "./kreativProps";

export const KreativOptagetI = ({ udgave, format, memberName, companyName, dateLabel, portraetUrl, logoUrl, visTomtilstand = true }: KreativProps) => {
  const m = OPTAGET_I[kombination(udgave, format)];

  const ring = (
    <div
      style={{
        flex: "none",
        width: `${m.ring.diameter}px`,
        height: `${m.ring.diameter}px`,
        borderRadius: "50%",
        border: `${m.ring.kant}px solid ${m.ring.farve}`,
        display: "grid",
        placeItems: "center",
        boxSizing: "border-box",
        color: m.ring.pladsholderFarve,
      }}
    >
      <KreativBilledfelt
        url={portraetUrl}
        bredde={m.ring.slot}
        hoejde={m.ring.slot}
        form="cirkel"
        tilpasning="cover"
        pladsholder={TEKSTER.pladsholderPortraet}
        visTomtilstand={visTomtilstand}
        alt={memberName}
      />
    </div>
  );
  const navneblok = (
    <div style={{ display: "flex", flexDirection: "column", gap: `${m.navneblok.gap}px`, marginTop: m.navneblok.margenTop === null ? undefined : `${m.navneblok.margenTop}px` }}>
      <div style={skriftStil(m.navneblok.navn)}>{memberName}</div>
      <div style={skriftStil(m.navneblok.virksomhed)}>{companyName}</div>
    </div>
  );
  const logokort = <KreativLogokort maal={m.logokort} logoUrl={logoUrl} companyName={companyName} visTomtilstand={visTomtilstand} />;

  return (
    <div
      data-kreativ="optaget-i"
      data-udgave={udgave}
      data-format={format}
      style={{ position: "relative", width: `${m.canvas.bredde}px`, height: `${m.canvas.hoejde}px`, background: m.canvas.baggrund, overflow: "hidden", boxSizing: "border-box" }}
    >
      {/* v2:257-259 / :281-287 — topblok */}
      <div
        style={{
          position: "absolute",
          left: `${m.topblok.venstre}px`,
          top: `${m.topblok.top}px`,
          right: m.topblok.hoejre === null ? undefined : `${m.topblok.hoejre}px`,
          width: m.topblok.bredde === null ? undefined : `${m.topblok.bredde}px`,
          display: "flex",
          flexDirection: "column",
          gap: `${m.topblok.gap}px`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: `${m.oejenbryn.gap}px` }}>
          <span style={{ display: "block", width: `${m.oejenbryn.streg.bredde}px`, height: `${m.oejenbryn.streg.hoejde}px`, background: m.oejenbryn.streg.farve }} />
          <span style={skriftStil(m.oejenbryn.label)}>
            {TEKSTER.optaget} {dateLabel}
          </span>
        </div>
        <div style={skriftStil(m.overskrift)}>
          {TEKSTER.overskrift[0]}
          <br />
          {TEKSTER.overskrift[1]}
        </div>
        {/* liggende: navneblokken under overskriften (v2:284-287) */}
        {!m.raekke && navneblok}
      </div>

      {/* kvadrat: rækken med ring og tekstkolonne (v2:261-269) */}
      {m.raekke && (
        <div
          style={{
            position: "absolute",
            left: `${m.raekke.venstre}px`,
            right: `${m.raekke.hoejre}px`,
            top: `${m.raekke.top}px`,
            display: "flex",
            alignItems: "center",
            gap: `${m.raekke.gap}px`,
          }}
        >
          {ring}
          <div style={{ display: "flex", flexDirection: "column", gap: `${m.tekstkolonneGap ?? 0}px` }}>
            {navneblok}
            {logokort}
          </div>
        </div>
      )}

      {/* liggende: ring og logokort i en kolonne øverst til højre (v2:289-292) */}
      {m.hoejreKolonne && (
        <div
          style={{
            position: "absolute",
            right: `${m.hoejreKolonne.hoejre}px`,
            top: `${m.hoejreKolonne.top}px`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: `${m.hoejreKolonne.gap}px`,
          }}
        >
          {ring}
          {logokort}
        </div>
      )}

      {/* v2:271-278 / :293-297 — afsenderbjælken */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: `${m.bjaelke.hoejde}px`,
          background: m.bjaelke.baggrund,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `0 ${m.bjaelke.paddingSide}px`,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: `${m.bjaelke.gap}px` }}>
          <KreativRaadgiverStak maal={m.raadgiverstak} />
          {m.raadgiverTekst.label ? (
            <div style={{ display: "flex", flexDirection: "column", gap: `${m.raadgiverTekst.gap}px` }}>
              <div style={skriftStil(m.raadgiverTekst.label)}>{TEKSTER.raadgivere}</div>
              <div style={skriftStil(m.raadgiverTekst.navne)}>{RAADGIVER_NAVNE}</div>
            </div>
          ) : (
            <div style={skriftStil(m.raadgiverTekst.navne)}>
              {TEKSTER.raadgivere}: {RAADGIVER_NAVNE}
            </div>
          )}
        </div>
        <img src={m.ordmaerke.fil} alt="Topix" style={{ display: "block", width: `${m.ordmaerke.bredde}px`, height: "auto" }} />
      </div>
    </div>
  );
};
