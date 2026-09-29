import React from "react";
import type { CertificateProps } from "../types";
import { Lockup, Photo, Signature, nameLen, useAssets } from "../parts";

const NAME_SIZE = { s: [40, 46], m: [34, 40], l: [28, 34] } as const;

function Advisor({ photo, sig, name }: { photo: string; sig: string; name: string }) {
  return (
    <div style={{ width: 200, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <img src={photo} alt="" crossOrigin="anonymous" style={{ width: 116, height: 116, borderRadius: "50%", objectFit: "cover" }} />
      <div style={{ marginTop: 14 }}>
        <Signature src={sig} name={name} align="center" width={200} />
      </div>
    </div>
  );
}

/** "Med rådgiverne · lys": medlemmet i midten, Morten og Jonas med underskrift på hver side. Kræver portræt. */
export function RaadgivereLys({ data, assets }: CertificateProps) {
  const a = useAssets(assets);
  const [fs, lh] = NAME_SIZE[nameLen(data.memberName)];
  return (
    <div className="crt-page crt-light crt-classic" data-design="raadgivere-lys">
      <div className="crt-frame-double-outer" />
      <div className="crt-frame-double-inner" />
      <div className="crt-content">
        <Lockup size="sm" tone="light" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: 8 }}>
        <h1 className="crt-heading" style={{ fontSize: 92, lineHeight: "92px" }}>Certifikat</h1>
        <div className="crt-eyebrow" style={{ marginTop: 14 }}>Tildelt</div>
        <div style={{ marginTop: 22, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 56 }}>
          <Advisor photo={a.advisorPhotoMorten} sig={a.signatureMortenDark} name="Morten Larsen" />
          <div style={{ width: 353, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Photo url={data.portraitUrl} name={data.memberName} size={206} ring />
            <div className="crt-name" data-len={nameLen(data.memberName)} style={{ marginTop: 12, fontSize: fs, lineHeight: `${lh}px`, textWrap: "balance" } as React.CSSProperties}>
              {data.memberName}
            </div>
            {data.companyName ? <div className="crt-company" style={{ fontSize: 15, color: "#3e5a59" }}>{data.companyName}</div> : <div className="crt-company" style={{ fontSize: 15 }}>&nbsp;</div>}
          </div>
          <Advisor photo={a.advisorPhotoJonas} sig={a.signatureJonasDark} name="Jonas Herlev" />
        </div>
        <p className="crt-body" style={{ marginTop: 30, maxWidth: 620 }}>
          som bevis på 12 måneders medlemskab af The Boardroom, <span className="crt-nowrap">{data.period}</span>.
        </p>
        </div>
      </div>
    </div>
  );
}
