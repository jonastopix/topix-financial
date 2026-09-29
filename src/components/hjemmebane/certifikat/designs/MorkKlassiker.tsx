import React from "react";
import type { CertificateProps } from "../types";
import { Lockup, Seal, Signature, nameLen, useAssets } from "../parts";

const NAME_SIZE = { s: [48, 56], m: [40, 48], l: [34, 42] } as const;

/** "Mørk klassiker": centreret, dobbelt ramme, segl mellem underskrifterne. Uden portræt. */
export function MorkKlassiker({ data, assets }: CertificateProps) {
  const a = useAssets(assets);
  const [fs, lh] = NAME_SIZE[nameLen(data.memberName)];
  return (
    <div className="crt-page crt-dark crt-classic" data-design="mork-klassiker">
      <svg className="crt-bg" width="1123" height="794" viewBox="0 0 1123 794" aria-hidden="true">
        <path d="M 1180 -40 C 700 -40 330 170 330 440 C 330 660 470 780 580 840" fill="none" stroke="#3e5a59" strokeWidth="1.2" />
        <polygon points="761,170 881,170 923,297 965,170 1085,170 1008,400 1085,630 965,630 923,503 881,630 761,630 838,400" fill="none" stroke="#3e5a59" strokeWidth="1.2" />
      </svg>
      <div className="crt-frame-double-outer" />
      <div className="crt-frame-double-inner" />
      <div className="crt-content">
        <Lockup size="sm" tone="dark" />
        <h1 className="crt-heading" style={{ marginTop: 26, fontSize: 100, lineHeight: "100px" }}>Certifikat</h1>
        <div className="crt-eyebrow" style={{ marginTop: 20 }}>Tildelt</div>
        <div
          className="crt-name"
          data-len={nameLen(data.memberName)}
          style={{ marginTop: 12, minWidth: 460, maxWidth: 760, padding: "0 40px 12px", borderBottom: "1px solid #a3d9c4", fontSize: fs, lineHeight: `${lh}px` }}
        >
          {data.memberName}
        </div>
        {data.companyName ? <div className="crt-company" style={{ marginTop: 10 }}>{data.companyName}</div> : null}
        <p className="crt-body" style={{ marginTop: 14, maxWidth: 620 }}>
          som bevis på 12 måneders medlemskab af The Boardroom, <span className="crt-nowrap">{data.period}</span>.
        </p>
        <div className="crt-footer">
          <Signature src={a.signatureJonasLight} name="Jonas Herlev" align="left" />
          <Seal size={140} variant="solid-ocean" />
          <Signature src={a.signatureMortenLight} name="Morten Larsen" align="right" />
        </div>
      </div>
    </div>
  );
}
