import React from "react";
import "./certificate.css";
import type { CertificateProps, DesignId } from "./types";
import { getDesign } from "./designs";

/** Rendrer ét certifikat i fuld størrelse (1123 x 794 px). */
export function Certificate({ design, ...props }: CertificateProps & { design: DesignId }) {
  const { Component } = getDesign(design);
  return <Component {...props} />;
}

/**
 * Nedskaleret preview (bruges i den store visning og i "Vælg design"-kortene).
 * width = den bredde previewet skal fylde; højden følger A4-formatet.
 */
export function CertificatePreview({ width, design, ...props }: CertificateProps & { design: DesignId; width: number }) {
  const scale = width / 1123;
  return (
    <div style={{ width, height: Math.round(794 * scale), overflow: "hidden", position: "relative" }}>
      <div style={{ width: 1123, height: 794, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        <Certificate design={design} {...props} />
      </div>
    </div>
  );
}
