import React from "react";
import type { CertificateProps } from "../types";
import { Arc, LegatFooter, LegatText, Photo, Seal, useAssets } from "../parts";

/** "Dit portræt": legat-layout med medlemmets portræt og et lille segl. Kræver portræt. */
export function Portraet({ data, assets }: CertificateProps) {
  const a = useAssets(assets);
  return (
    <div className="crt-page crt-dark crt-legat" data-design="portraet">
      <Arc />
      <div className="crt-frame-single" />
      <div className="crt-content">
        <div className="crt-main">
          <LegatText memberName={data.memberName} companyName={data.companyName} period={data.period} />
          <div className="crt-visual" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            <div style={{ position: "relative", width: 330, height: 330 }}>
              <Photo url={data.portraitUrl} name={data.memberName} size={330} ring />
              <div style={{ position: "absolute", right: -18, bottom: -4 }}>
                <Seal size={116} variant="solid-ocean" />
              </div>
            </div>
          </div>
        </div>
        <LegatFooter assets={a} />
      </div>
    </div>
  );
}
