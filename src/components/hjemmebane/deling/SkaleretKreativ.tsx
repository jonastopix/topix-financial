/**
 * SkaleretKreativ — viser en kreativ i fuld px-størrelse skaleret ned, så
 * den boks der findes i layoutet ER den boks man ser.
 *
 * TO GANGE GALT PÅ ÉN DAG (14/9), begge gange målt for tidligt eller på det
 * forkerte element:
 *   15:08 (#866): wrapperens højde blev sat i px fra en useEffect efter
 *   første tegning; den utransformerede 1080-boks lå i flowet imens.
 *   15:29 (#868): containeren i boks-tilstand havde height:100 % — en
 *   procent der kun løser sig hvis forælderens højde er «definit». Løser
 *   den sig ikke (auto), er containerens højde rammens egen højde: første
 *   måling ser clientHeight = 0, koden faldt tilbage på bredden alene
 *   (`if (ch > 0)`), skalaen blev 1, rammen 1080 px høj — og NÆSTE måling
 *   så clientHeight = 1080 og bekræftede skalaen 1. Containeren målte sig
 *   selv. I headless Chrome løste procenten sig (684 px målt), på Jonas'
 *   skærm gjorde den ikke — det er den eneste forskel i koden mellem det
 *   kort der virkede (bredde-tilstand, ingen procent-højde) og fuldskærmen.
 *
 * FORMEN NU — tre lag, så det ikke kan ske igen:
 *   1. Der måles ALDRIG en procent. Containeren er selv flex-elementet
 *      (flex:1 1 0, min-height:0) i fuldskærmens kolonne, så dens højde er
 *      et tal flex-layoutet har regnet ud — ikke noget der afhænger af
 *      indholdet. I bredde-tilstand bruges kun bredden, som er et tal.
 *   2. Ingen tilbagefald. I boks-tilstand er skalaen min(bredde, højde);
 *      er en af dem 0 (ikke lagt ud endnu, display:none), er skalaen 0 og
 *      kreativen usynlig, indtil ResizeObserver melder en rigtig størrelse.
 *      Et 0 kan aldrig blive til «brug bredden».
 *   3. Rammen og transformen bruger samme tal fra samme render — de kan
 *      ikke afvige fra hinanden. Og containeren har overflow:hidden med
 *      rammen begrænset til max 100 % × 100 %: skulle et tal alligevel være
 *      forkert, bliver kreativen klippet inden for området — den kan ikke
 *      løbe under eller ud til siden.
 *
 * Skalaen måles med useLayoutEffect (før tegning) og følger containeren
 * med ResizeObserver. `tilpas`: "bredde" fylder containerens bredde
 * (galleri); "boks" holder sig inden for både bredde og højde (fuldskærm —
 * kræver at forælderen er en flex-kolonne med definit højde).
 */

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { beregnSkala, type SkalaTilpasning } from "./skala";

export interface SkaleretKreativProps {
  bredde: number;
  hoejde: number;
  tilpas?: SkalaTilpasning;
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
    const maal = () => setSkala(beregnSkala(tilpas, bredde, hoejde, el.clientWidth, el.clientHeight, maksSkala));
    maal();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(maal);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bredde, hoejde, tilpas, maksSkala]);

  const visBredde = Math.round(bredde * skala);
  const visHoejde = Math.round(hoejde * skala);

  const container: CSSProperties = {
    width: "100%",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    ...(tilpas === "boks" ? { flex: "1 1 0%", minHeight: 0, minWidth: 0 } : {}),
  };

  return (
    <div ref={containerRef} className={className} style={container} data-skaleret-container={tilpas}>
      <div
        data-skaleret-kreativ=""
        style={{ position: "relative", overflow: "hidden", width: `${visBredde}px`, height: `${visHoejde}px`, maxWidth: "100%", maxHeight: "100%", flex: "none" }}
      >
        <div
          data-skaleret-indhold=""
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
