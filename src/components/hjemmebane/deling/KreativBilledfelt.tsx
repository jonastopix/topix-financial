/**
 * KreativBilledfelt — designets <image-slot> oversat til husets primitiver.
 *
 * Med billede: <img> i fast px-ramme, cover (portræt) eller contain (logo)
 * — image-slot.js:33-35 og :981-984 (cover = max(fw/iw, fh/ih), contain =
 * min), centreret (:299). Cirklen er border-radius 50 %, ikke clip-path
 * (:1074-1084). Tilpasningen regnes i px af billedTilpasning.ts, IKKE med
 * object-fit: html2canvas 1.4.1 kender ikke object-fit og strakte logoet i
 * PNG'en (målt 14/9 kl. 17:20). Rammen klipper med overflow:hidden og
 * radius, som html2canvas honorerer (html2canvas.js:6141-6149).
 *
 * Uden billede: tomtilstanden fra image-slot.js — grå ramme
 * rgba(127,127,127,.08) (:295), ikon 28×28 i currentColor med opacity .45
 * (:327, :428-431), billedtekst 13px/1.3 system-ui, vægt 500, .01em,
 * opacity .75 (:292, :294, :328), og en stiplet ring 1.5px currentColor med
 * opacity .35 (:334-335). Alt i currentColor, så den arver fladens tekstfarve.
 *
 * VIGTIGT (Jonas 14/9): tomtilstanden er til FORHÅNDSVISNINGEN. Den kreativ
 * der hentes, må aldrig bede om et billede — så `visTomtilstand={false}`
 * giver et tomt felt i samme mål uden ikon, tekst og ring.
 */

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { tilpasBillede, type Maal } from "./billedTilpasning";

export type BilledfeltForm = "cirkel" | "rektangel";
export type BilledfeltTilpasning = "cover" | "contain";

export interface KreativBilledfeltProps {
  url?: string | null;
  bredde: number;
  hoejde: number;
  form: BilledfeltForm;
  tilpasning: BilledfeltTilpasning;
  /** Tomtilstandens tekst — designets placeholder-attribut («Medlemmets portræt», «Firmalogo»). */
  pladsholder: string;
  /** Forhåndsvisning: true. Den kreativ der hentes: false. */
  visTomtilstand: boolean;
  alt?: string;
}

const PLADSHOLDER_IKON = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

export const KreativBilledfelt = ({ url, bredde, hoejde, form, tilpasning, pladsholder, visTomtilstand, alt = "" }: KreativBilledfeltProps) => {
  // Billedets naturlige mål — kendt efter load. Hooks i topblokken, før de
  // betingede returns nedenfor (React #310).
  const imgRef = useRef<HTMLImageElement>(null);
  const [natur, setNatur] = useState<Maal | null>(null);
  const laesNatur = () => {
    const img = imgRef.current;
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) setNatur({ bredde: img.naturalWidth, hoejde: img.naturalHeight });
  };
  useLayoutEffect(() => {
    // Ny URL: glem det gamle mål; er billedet allerede i cachen, fyrer load ikke igen.
    setNatur(null);
    if (imgRef.current?.complete) laesNatur();
  }, [url]);

  const radius = form === "cirkel" ? "50%" : "0";
  const ramme: CSSProperties = {
    position: "relative",
    width: `${bredde}px`,
    height: `${hoejde}px`,
    borderRadius: radius,
    overflow: "hidden",
    boxSizing: "border-box",
    flex: "none",
  };

  if (url) {
    // Tilpasningen regnes i px (billedTilpasning.ts) — html2canvas kender ikke
    // object-fit og fylder bare <img>-boksen, så boksen SKAL være det viste.
    // Rammen klipper (overflow:hidden + radius), det virker begge steder.
    // Før målet kendes: hele rammen med object-fit som midlertidigt greb —
    // kun på skærmen, aldrig i filen (billedet er indlæst når der hentes).
    const r = natur ? tilpasBillede(tilpasning, { bredde, hoejde }, natur) : null;
    const boks: CSSProperties = r
      ? { position: "absolute", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` }
      : { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", objectFit: tilpasning };
    return (
      <div style={ramme} data-billedfelt="udfyldt" data-tilpasning={r ? "px" : "object-fit"}>
        <img ref={imgRef} src={url} alt={alt} onLoad={laesNatur} style={{ display: "block", maxWidth: "none", ...boks }} />
      </div>
    );
  }

  if (!visTomtilstand) {
    // Tomt felt i samme mål — intet der beder om et billede (til det der hentes).
    return <div style={ramme} data-billedfelt="tom" aria-hidden="true" />;
  }

  return (
    <div style={{ ...ramme, background: "rgba(127,127,127,.08)" }} data-billedfelt="pladsholder">
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          textAlign: "center",
          padding: "12px",
          boxSizing: "border-box",
          font: "13px/1.3 system-ui, -apple-system, sans-serif",
          userSelect: "none",
        }}
      >
        <span style={{ opacity: 0.45, display: "inline-flex" }}>{PLADSHOLDER_IKON}</span>
        <span style={{ maxWidth: "90%", fontWeight: 500, letterSpacing: ".01em", opacity: 0.75 }}>{pladsholder}</span>
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          border: "1.5px dashed currentColor",
          borderRadius: radius,
          opacity: 0.35,
          boxSizing: "border-box",
        }}
      />
    </div>
  );
};
