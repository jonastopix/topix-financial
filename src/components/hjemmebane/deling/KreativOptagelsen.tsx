/**
 * KreativOptagelsen — 3b «Optagelsen» (centreret segl med ramme), oversat
 * element for element fra v2:161-246: en hairline-ramme inset i fladen,
 * label og overskrift «Nyt medlem af / The Boardroom», portrættet i en hvid
 * cirkel med seglet «NYT MEDLEM» nederst til højre, navnet, logokortet, og
 * en bundrække med de to små rådgiverportrætter, teksten og ordmærket.
 * Alle tal fra OPTAGELSEN i delingskreativ.ts.
 *
 * 3b viser IKKE virksomhedens navn (v2:167-246 har intet {{ companyName }})
 * — kun logoet. Kvadrat er én centreret kolonne (v2:169); liggende sætter
 * portræt og tekstkolonne i én række (v2:187) med navn og logokort side om
 * side (v2:195). Rådgiverteksten er to linjer i kvadrat (v2:181) og én
 * linje «Rådgivere: …» i liggende (v2:203). Mørk og lys er kun farver.
 */

import { OPTAGELSEN, RAADGIVER_NAVNE, TEKSTER, kombination, skriftStil } from "@/lib/delingskreativ";
import { KreativBilledfelt } from "./KreativBilledfelt";
import { KreativRaadgiverStak } from "./KreativRaadgiverStak";
import { KreativLogokort } from "./KreativTrePaaRaekke";
import type { KreativProps } from "./kreativProps";

export const KreativOptagelsen = ({ udgave, format, memberName, companyName, dateLabel, portraetUrl, logoUrl, visTomtilstand = true }: KreativProps) => {
  const m = OPTAGELSEN[kombination(udgave, format)];
  const kolonne = m.indhold.retning === "kolonne";

  const portraet = (
    <div
      style={{
        position: "relative",
        flex: "none",
        marginTop: m.portraet.margenTop === null ? undefined : `${m.portraet.margenTop}px`,
        width: `${m.portraet.diameter}px`,
        height: `${m.portraet.diameter}px`,
        borderRadius: "50%",
        background: m.portraet.baggrund,
        display: "grid",
        placeItems: "center",
        color: m.portraet.pladsholderFarve,
      }}
    >
      <KreativBilledfelt
        url={portraetUrl}
        bredde={m.portraet.slot}
        hoejde={m.portraet.slot}
        form="cirkel"
        tilpasning="cover"
        pladsholder={TEKSTER.pladsholderPortraet}
        visTomtilstand={visTomtilstand}
        alt={memberName}
      />
      {/* seglet (v2:174 / :190) */}
      <span
        style={{
          position: "absolute",
          right: `${m.portraet.segl.hoejre}px`,
          bottom: `${m.portraet.segl.bund}px`,
          width: `${m.portraet.segl.stoerrelse}px`,
          height: `${m.portraet.segl.stoerrelse}px`,
          borderRadius: "50%",
          background: m.portraet.segl.baggrund,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          ...skriftStil(m.portraet.segl.skrift),
        }}
      >
        {TEKSTER.segl[0]}
        <br />
        {TEKSTER.segl[1]}
      </span>
    </div>
  );

  const label = (
    <div style={skriftStil(m.label)}>
      {TEKSTER.optaget} {dateLabel}
    </div>
  );
  const overskrift = (
    <div style={{ ...skriftStil(m.overskrift), marginTop: m.overskriftMargenTop === null ? undefined : `${m.overskriftMargenTop}px` }}>
      {TEKSTER.nytMedlemAf[0]}
      <br />
      {TEKSTER.nytMedlemAf[1]}
    </div>
  );
  const navn = <div style={{ ...skriftStil(m.navn), marginTop: m.navnMargenTop === null ? undefined : `${m.navnMargenTop}px` }}>{memberName}</div>;
  const logokort = (
    <KreativLogokort
      maal={m.logokort}
      logoUrl={logoUrl}
      companyName={companyName}
      visTomtilstand={visTomtilstand}
      style={m.logokortMargenTop === null ? undefined : { marginTop: `${m.logokortMargenTop}px` }}
    />
  );

  return (
    <div
      data-kreativ="optagelsen"
      data-udgave={udgave}
      data-format={format}
      style={{ position: "relative", width: `${m.canvas.bredde}px`, height: `${m.canvas.hoejde}px`, background: m.canvas.baggrund, overflow: "hidden", boxSizing: "border-box" }}
    >
      {/* v2:168 / :186 — rammen */}
      <div style={{ position: "absolute", inset: `${m.ramme.inset}px`, border: `1px solid ${m.ramme.kant}`, pointerEvents: "none" }} />

      {kolonne && m.indhold.retning === "kolonne" ? (
        /* v2:169-178 — én centreret kolonne */
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: `${m.indhold.paddingTop}px ${m.indhold.paddingSide}px 0`,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {label}
          {overskrift}
          {portraet}
          {navn}
          {logokort}
        </div>
      ) : (
        m.indhold.retning === "raekke" && (
          /* v2:187-199 — portræt og tekstkolonne i én række */
          <div style={{ position: "absolute", inset: 0, padding: `0 ${m.indhold.paddingSide}px`, boxSizing: "border-box", display: "flex", alignItems: "center", gap: `${m.indhold.gap}px` }}>
            {portraet}
            <div style={{ display: "flex", flexDirection: "column", gap: `${m.tekstkolonneGap ?? 0}px` }}>
              {label}
              {overskrift}
              <div style={{ display: "flex", alignItems: "center", gap: `${m.navnRaekke?.gap ?? 0}px`, marginTop: m.navnRaekke ? `${m.navnRaekke.margenTop}px` : undefined }}>
                {navn}
                {logokort}
              </div>
            </div>
          </div>
        )
      )}

      {/* v2:179-183 / :201-205 — bundrækken */}
      <div
        style={{
          position: "absolute",
          left: `${m.bund.venstre}px`,
          right: `${m.bund.hoejre}px`,
          bottom: `${m.bund.bund}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: `${m.bund.gap}px` }}>
          <KreativRaadgiverStak maal={m.raadgiverstak} />
          <div style={{ ...skriftStil(m.raadgiverTekst), textAlign: "left" }}>
            {m.raadgiverTekstToLinjer ? (
              <>
                {TEKSTER.raadgivere}
                <br />
                {RAADGIVER_NAVNE}
              </>
            ) : (
              `${TEKSTER.raadgivere}: ${RAADGIVER_NAVNE}`
            )}
          </div>
        </div>
        <img src={m.ordmaerke.fil} alt="Topix" style={{ display: "block", width: `${m.ordmaerke.bredde}px`, height: "auto" }} />
      </div>
    </div>
  );
};
