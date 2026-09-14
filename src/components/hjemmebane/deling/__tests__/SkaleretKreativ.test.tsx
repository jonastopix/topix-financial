/**
 * SkaleretKreativ — rammen følger det viste (14/9, efter to overløb).
 *
 * HVAD TESTEN BEVISER: at rammens px-mål og transformens skala kommer af
 * samme tal, at boks-tilstand tager den mindste af bredde og højde, og at
 * en manglende højde (0) giver skala 0 — ALDRIG et tilbagefald på bredden
 * (det var 15:29-fejlen). clientWidth/clientHeight er mocket på
 * HTMLElement.prototype, fordi jsdom ikke lægger ud.
 *
 * HVAD DEN IKKE KAN BEVISE: at browseren faktisk tegner rammen lige så
 * stor som kreativen, eller at containeren får sin højde fra flex-layoutet.
 * jsdom har ingen layout, ingen ResizeObserver og tegner ingen transform.
 * Det beviser kun en rigtig browser — målt i headless Chrome 14/9.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SkaleretKreativ } from "../SkaleretKreativ";
import { beregnSkala } from "../skala";

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
});

const mockMaal = (cw: number, ch: number) => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => cw });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => ch });
};

const ramme = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-skaleret-kreativ]")!;
const indhold = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-skaleret-indhold]")!;

describe("beregnSkala", () => {
  it("bredde-tilstand: bredden alene, aldrig over maksSkala", () => {
    expect(beregnSkala("bredde", 1080, 1080, 540, 0)).toBe(0.5);
    expect(beregnSkala("bredde", 1080, 1080, 2160, 0)).toBe(1);
    expect(beregnSkala("bredde", 1200, 627, 600, 9999)).toBe(0.5);
  });

  it("boks-tilstand: den mindste af bredde og højde", () => {
    expect(beregnSkala("boks", 1080, 1080, 1376, 684)).toBeCloseTo(684 / 1080, 10);
    expect(beregnSkala("boks", 1080, 1080, 500, 684)).toBeCloseTo(500 / 1080, 10);
    expect(beregnSkala("boks", 1200, 627, 1000, 627)).toBeCloseTo(1000 / 1200, 10);
  });

  it("boks-tilstand: højde 0 giver skala 0 — intet tilbagefald på bredden (15:29-fejlen)", () => {
    expect(beregnSkala("boks", 1080, 1080, 1376, 0)).toBe(0);
    expect(beregnSkala("boks", 1080, 1080, 0, 684)).toBe(0);
    expect(beregnSkala("boks", 1080, 1080, 0, 0)).toBe(0);
  });
});

describe("SkaleretKreativ — ramme og transform er samme tal", () => {
  it("bredde-tilstand: ramme = format × skala, transform = samme skala", () => {
    mockMaal(540, 0);
    const { container } = render(
      <SkaleretKreativ bredde={1080} hoejde={1080}><div>k</div></SkaleretKreativ>,
    );
    expect(ramme(container).style.width).toBe("540px");
    expect(ramme(container).style.height).toBe("540px");
    expect(indhold(container).style.transform).toBe("scale(0.5)");
    expect(indhold(container).style.visibility).toBe("visible");
  });

  it("boks-tilstand: højden begrænser, rammen følger med", () => {
    mockMaal(1376, 684);
    const { container } = render(
      <SkaleretKreativ bredde={1080} hoejde={1080} tilpas="boks"><div>k</div></SkaleretKreativ>,
    );
    const s = 684 / 1080;
    expect(ramme(container).style.width).toBe(`${Math.round(1080 * s)}px`);
    expect(ramme(container).style.height).toBe(`${Math.round(1080 * s)}px`);
    expect(indhold(container).style.transform).toBe(`scale(${s})`);
    expect(ramme(container).style.maxWidth).toBe("100%");
    expect(ramme(container).style.maxHeight).toBe("100%");
    expect(container.firstElementChild).toHaveStyle({ overflow: "hidden" });
  });

  it("boks-tilstand uden højde: rammen er 0×0 og kreativen usynlig — ikke 1080 px", () => {
    mockMaal(1376, 0);
    const { container } = render(
      <SkaleretKreativ bredde={1080} hoejde={1080} tilpas="boks"><div>k</div></SkaleretKreativ>,
    );
    expect(ramme(container).style.width).toBe("0px");
    expect(ramme(container).style.height).toBe("0px");
    expect(indhold(container).style.transform).toBe("scale(0)");
    expect(indhold(container).style.visibility).toBe("hidden");
  });

  it("boks-tilstand: containeren er selv flex-elementet (ingen procent-højde)", () => {
    mockMaal(1376, 684);
    const { container } = render(
      <SkaleretKreativ bredde={1080} hoejde={1080} tilpas="boks"><div>k</div></SkaleretKreativ>,
    );
    const c = container.firstElementChild as HTMLElement;
    expect(c.style.height).toBe("");
    expect(c.style.flex).toBe("1 1 0%");
    expect(c.style.minHeight).toBe("0");
  });
});
