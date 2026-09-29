import React from "react";
import type { CertificateProps } from "../types";
import { Arc, LegatFooter, LegatText, Photo, useAssets } from "../parts";

function Advisor({ src, name, left }: { src: string; name: string; left: number }) {
  return (
    <div style={{ position: "absolute", left, top: 190, width: 150, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <img
        src={src}
        alt=""
        crossOrigin="anonymous"
        style={{ width: 116, height: 116, borderRadius: "50%", objectFit: "cover", border: "5px solid #133332" }}
      />
      <div className="crt-eyebrow" style={{ marginTop: 10, fontSize: 10, lineHeight: "14px" }}>Rådgiver</div>
      <div style={{ marginTop: 2, fontSize: 14, lineHeight: "20px", fontWeight: 600, color: "#ffffff" }}>{name}</div>
    </div>
  );
}

/** "Med rådgiverne · mørk": medlemmets portræt + Morten og Jonas. Kræver portræt. */
export function RaadgivereMork({ data, assets }: CertificateProps) {
  const a = useAssets(assets);
  return (
    <div className="crt-page crt-dark crt-legat" data-design="raadgivere-mork">
      <Arc />
      <div className="crt-frame-single" />
      <div className="crt-content">
        <div className="crt-main">
          <LegatText memberName={data.memberName} companyName={data.companyName} period={data.period} />
          <div className="crt-visual" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            <div style={{ position: "relative", width: 376, height: 350 }}>
              <div style={{ position: "absolute", left: 73, top: 0 }}>
                <Photo url={data.portraitUrl} name={data.memberName} size={230} ring />
              </div>
              <Advisor src={a.advisorPhotoMorten} name="Morten Larsen" left={0} />
              <Advisor src={a.advisorPhotoJonas} name="Jonas Herlev" left={226} />
            </div>
          </div>
        </div>
        <LegatFooter assets={a} />
      </div>
    </div>
  );
}
