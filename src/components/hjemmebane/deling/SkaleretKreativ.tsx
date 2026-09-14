/**
 * SkaleretKreativ — viser en kreativ i fuld px-størrelse skaleret ned, så
 * den boks der findes i layoutet ER den boks man ser.
 *
 * FEJLEN 14/9 (kl. 15:08, set på skærm af Jonas: «den mørke flade
 * fortsætter under indholdet, ud over containeren»). Første skridt lagde
 * den utransformerede 1080×1080-boks i det almindelige flow og satte
 * wrapperens højde i px fra en useEffect. transform:scale() ændrer ikke
 * elementets plads i layoutet: ved første tegning — før effekten — lå
 * kreativen i fuld størrelse i kolonnen, og den fulde boks fandtes i
 * flowet under hele visningen; kun wrapperens inline-højde holdt den nede.
 * Målt 14/9 i headless Chrome (harness med den rigtige komponent, fire
 * bredder) stemte wrapperens boks med det viste — fejlen gengav sig IKKE
 * dér, så den præcise udløser på Jonas' skærm er ikke fundet.
 *
 * Her er formen robust uanset: kreativen er absolut positioneret i en
 * ramme med overflow:hidden, hvis bredde og højde er skalaen gange
 * formatet. Den utransformerede boks deltager ikke i flowet, rammen kan
 * ikke vise andet end det den er, og skalaen måles med useLayoutEffect
 * (før tegning) og følger containeren med ResizeObserver.
 *
 * `tilpas`: "bredde" fylder containerens bredde (galleri, side);
 * "boks" holder sig inden for både bredde og højde (fuldskærm).
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface SkaleretKreativProps {
  bredde: number;
  hoejde: number;
  tilpas?: "bredde" | "boks";
  /** Skaler aldrig op over 1 (ellers pixleres tekst i PNG-tænkning) */
  maksSkala?: number;
  children: ReactNode;
  className?: string;
}

export const SkaleretKreativ = ({ bredde, hoejde, tilpas = "bredde", maksSkala = 1, children, className }: SkaleretKreativProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [skala, setSkala] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const maal = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      let s = cw / bredde;
      if (tilpas === "boks" && ch > 0) s = Math.min(s, ch / hoejde);
      setSkala(Math.max(0, Math.min(maksSkala, s)));
    };
    maal();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(maal);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bredde, hoejde, tilpas, maksSkala]);

  const visBredde = Math.round(bredde * skala);
  const visHoejde = Math.round(hoejde * skala);

  return (
    <div ref={containerRef} className={className} style={{ width: "100%", height: tilpas === "boks" ? "100%" : undefined, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        data-skaleret-kreativ=""
        style={{ position: "relative", overflow: "hidden", width: `${visBredde}px`, height: `${visHoejde}px`, flex: "none" }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: `${bredde}px`,
            height: `${hoejde}px`,
            transform: `scale(${skala})`,
            transformOrigin: "top left",
            visibility: skala > 0 ? "visible" : "hidden",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
