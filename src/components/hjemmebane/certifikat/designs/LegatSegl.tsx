import React from "react";
import type { CertificateProps } from "../types";
import { Arc, LegatFooter, LegatText, Seal, useAssets } from "../parts";

/** "Legat med segl": legat-layout, stort segl til højre. Uden portræt. */
export function LegatSegl({ data, assets }: CertificateProps) {
  const a = useAssets(assets);
  return (
    <div className="crt-page crt-dark crt-legat" data-design="legat-segl">
      <Arc />
      <div className="crt-frame-single" />
      <div className="crt-content">
        <div className="crt-main">
          <LegatText memberName={data.memberName} companyName={data.companyName} period={data.period} />
          <div className="crt-visual" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            <Seal size={330} variant="outline" />
          </div>
        </div>
        <LegatFooter assets={a} />
      </div>
    </div>
  );
}
