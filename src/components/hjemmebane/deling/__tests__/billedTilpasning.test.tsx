/**
 * cover/contain regnet i px (14/9): html2canvas kender ikke object-fit, så
 * <img>-boksen skal være det viste. Låser regnestykket (letterbox,
 * beskæring, centrering, ugyldige mål) og at KreativBilledfelt sætter
 * boksen i px når billedets naturlige mål er kendt — og bruger object-fit
 * som midlertidigt greb før det. Hvad html2canvas tegner, måles i en
 * browser (målt 14/9 i headless Chrome: logoet ikke længere strukket).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { tilpasBillede } from "../billedTilpasning";
import { KreativBilledfelt } from "../KreativBilledfelt";

afterEach(() => {
  cleanup();
  delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).naturalWidth;
  delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).naturalHeight;
  delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).complete;
});

const mockNatur = (b: number, h: number, complete = false) => {
  Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => b });
  Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", { configurable: true, get: () => h });
  Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => complete });
};

describe("tilpasBillede", () => {
  it("contain: hele billedet inde i rammen, centreret (logoslot 204×60, ordmærke 260×90)", () => {
    // skala = min(204/260, 60/90) = 0.6667 → 173.3×60, centreret vandret
    const r = tilpasBillede("contain", { bredde: 204, hoejde: 60 }, { bredde: 260, hoejde: 90 });
    expect(r.height).toBeCloseTo(60, 6);
    expect(r.width).toBeCloseTo(173.333, 2);
    expect(r.top).toBeCloseTo(0, 6);
    expect(r.left).toBeCloseTo((204 - 173.333) / 2, 2);
  });

  it("contain: et næsten kvadratisk ikon (2000×1805) i 204×60 bliver 66×60 midt i — ikke strukket", () => {
    const r = tilpasBillede("contain", { bredde: 204, hoejde: 60 }, { bredde: 2000, hoejde: 1805 });
    expect(r.height).toBeCloseTo(60, 6);
    expect(r.width).toBeCloseTo(66.48, 1);
    expect(r.left).toBeCloseTo((204 - 66.48) / 2, 1);
  });

  it("cover: rammen fyldt, overskud centreret uden for (portræt 1035×830 i 310×310)", () => {
    // skala = max(310/1035, 310/830) = 0.3735 → 386.5×310, 38 px uden for i hver side
    const r = tilpasBillede("cover", { bredde: 310, hoejde: 310 }, { bredde: 1035, hoejde: 830 });
    expect(r.height).toBeCloseTo(310, 6);
    expect(r.width).toBeCloseTo(386.57, 1);
    expect(r.left).toBeCloseTo(-(386.57 - 310) / 2, 1);
    expect(r.top).toBeCloseTo(0, 6);
  });

  it("samme forhold: fylder rammen præcis i begge tilstande", () => {
    for (const t of ["cover", "contain"] as const) {
      expect(tilpasBillede(t, { bredde: 310, hoejde: 310 }, { bredde: 728, hoejde: 728 })).toEqual({ left: 0, top: 0, width: 310, height: 310 });
    }
  });

  it("ugyldige mål giver hele rammen — aldrig 0×0", () => {
    expect(tilpasBillede("contain", { bredde: 204, hoejde: 60 }, { bredde: 0, hoejde: 0 })).toEqual({ left: 0, top: 0, width: 204, height: 60 });
    expect(tilpasBillede("cover", { bredde: 310, hoejde: 310 }, { bredde: NaN, hoejde: 5 })).toEqual({ left: 0, top: 0, width: 310, height: 310 });
  });
});

describe("KreativBilledfelt — boksen er det viste", () => {
  it("efter load sættes <img> til det regnede rektangel i px, og object-fit er væk", () => {
    mockNatur(260, 90);
    const { container } = render(
      <KreativBilledfelt url="https://x.test/logo" bredde={204} hoejde={60} form="rektangel" tilpasning="contain" pladsholder="Firmalogo" visTomtilstand />,
    );
    const felt = container.querySelector<HTMLElement>('[data-billedfelt="udfyldt"]')!;
    const img = felt.querySelector("img")!;
    expect(felt.getAttribute("data-tilpasning")).toBe("object-fit");
    fireEvent.load(img);
    expect(felt.getAttribute("data-tilpasning")).toBe("px");
    expect(img.style.height).toBe("60px");
    expect(parseFloat(img.style.width)).toBeCloseTo(173.333, 2);
    expect(parseFloat(img.style.left)).toBeCloseTo(15.333, 2);
    expect(img.style.objectFit).toBe("");
    // rammen klipper — det er den html2canvas honorerer
    expect(felt.style.overflow).toBe("hidden");
  });

  it("cover i en cirkel: negativ left, rammen er rund", () => {
    mockNatur(1035, 830);
    const { container } = render(
      <KreativBilledfelt url="https://x.test/p" bredde={310} hoejde={310} form="cirkel" tilpasning="cover" pladsholder="Portræt" visTomtilstand />,
    );
    const felt = container.querySelector<HTMLElement>('[data-billedfelt="udfyldt"]')!;
    fireEvent.load(felt.querySelector("img")!);
    const img = felt.querySelector("img")!;
    expect(img.style.height).toBe("310px");
    expect(parseFloat(img.style.width)).toBeGreaterThan(310);
    expect(parseFloat(img.style.left)).toBeLessThan(0);
    expect(felt.style.borderRadius).toBe("50%");
  });

  it("et billede der allerede er i cachen (complete) måles uden load-hændelse", () => {
    mockNatur(728, 728, true);
    const { container } = render(
      <KreativBilledfelt url="/morten-hi.png" bredde={270} hoejde={270} form="cirkel" tilpasning="cover" pladsholder="Portræt" visTomtilstand />,
    );
    const felt = container.querySelector<HTMLElement>('[data-billedfelt="udfyldt"]')!;
    expect(felt.getAttribute("data-tilpasning")).toBe("px");
    expect(felt.querySelector("img")!.style.width).toBe("270px");
  });
});
