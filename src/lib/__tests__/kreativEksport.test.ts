import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FORMATER } from "@/lib/delingskreativ";
import {
  SKALERET_INDHOLD_ATTR,
  SKALERET_KREATIV_ATTR,
  canvasSomPng,
  eksportIndstillinger,
  frigoerSkalering,
  hentFil,
  kreativFilnavn,
} from "@/lib/kreativEksport";

// Kreativen som PNG (14/9). html2canvas selv kan IKKE testes i jsdom (ingen
// layout, intet canvas-tegning) — det er ikke forsøgt. Her låses de rene
// domme: filnavnet, målvalget, og at skaleringen fjernes på klonen.

describe("kreativFilnavn — filnavnet siger hvad det er", () => {
  it("layout, udgave, mål og navn — slug'et, uden æøå", () => {
    expect(kreativFilnavn({ layout: "tre_paa_raekke", udgave: "moerk", format: "kvadrat" }, "Anne Kirkegaard"))
      .toBe("the-boardroom-tre-paa-raekke-moerk-1080x1080-anne-kirkegaard.png");
    expect(kreativFilnavn({ layout: "optaget_i", udgave: "lys", format: "liggende" }, "Søren Ærø Åberg"))
      .toBe("the-boardroom-optaget-i-lys-1200x627-soeren-aeroe-aaberg.png");
  });
  it("uden navn udelades navnet helt — ingen hængende bindestreg", () => {
    for (const navn of [null, undefined, "", "   "]) {
      expect(kreativFilnavn({ layout: "optagelsen", udgave: "moerk", format: "kvadrat" }, navn))
        .toBe("the-boardroom-optagelsen-moerk-1080x1080.png");
    }
  });
});

describe("eksportIndstillinger — fuld størrelse, aldrig skærmens", () => {
  it("width/height er formatets px, scale er 1 (ikke devicePixelRatio), CORS til, ingen hvid baggrund", () => {
    const k = eksportIndstillinger("kvadrat", { bredde: 375, hoejde: 667 });
    expect(k).toMatchObject({ width: 1080, height: 1080, scale: 1, useCORS: true, backgroundColor: null, logging: false });
    const l = eksportIndstillinger("liggende", { bredde: 1920, hoejde: 1080 });
    expect(l).toMatchObject({ width: 1200, height: 627, scale: 1 });
  });
  it("klonens vindue er aldrig mindre end kreativen — og aldrig mindre end sidens", () => {
    expect(eksportIndstillinger("kvadrat", { bredde: 375, hoejde: 667 })).toMatchObject({ windowWidth: 1080, windowHeight: 1080 });
    expect(eksportIndstillinger("liggende", { bredde: 1920, hoejde: 1080 })).toMatchObject({ windowWidth: 1920, windowHeight: 1080 });
  });
  it("målene er FORMATER's — ét sted", () => {
    for (const format of ["kvadrat", "liggende"] as const) {
      const k = eksportIndstillinger(format, { bredde: 0, hoejde: 0 });
      expect([k.width, k.height]).toEqual([FORMATER[format].bredde, FORMATER[format].hoejde]);
    }
  });
});

/** SkaleretKreativ's markup (SkaleretKreativ.tsx:81-101), som klonen ser den: boks 400 px, indhold 1080 px skaleret. */
function skaleretMarkup(skala = 400 / 1080) {
  const container = document.createElement("div");
  container.innerHTML = `
    <div ${SKALERET_KREATIV_ATTR}="" style="position:relative;overflow:hidden;width:400px;height:400px;max-width:100%;max-height:100%">
      <div ${SKALERET_INDHOLD_ATTR}="" style="position:absolute;left:0;top:0;width:1080px;height:1080px;transform:scale(${skala});transform-origin:top left;visibility:visible">
        <div data-kreativ="">indhold</div>
      </div>
    </div>`;
  document.body.appendChild(container);
  const boks = container.querySelector<HTMLElement>(`[${SKALERET_KREATIV_ATTR}]`)!;
  const indhold = container.querySelector<HTMLElement>(`[${SKALERET_INDHOLD_ATTR}]`)!;
  const kreativ = container.querySelector<HTMLElement>("[data-kreativ]")!;
  return { container, boks, indhold, kreativ };
}

describe("frigoerSkalering — skærmens scale(k) fjernes på klonen, og boksen klipper ikke", () => {
  it("givet den YDRE boks: barnets transform bliver none, boksen får fuld størrelse uden overflow-klip", () => {
    const { container, boks, indhold } = skaleretMarkup();
    expect(indhold.style.transform).toMatch(/^scale\(/);
    expect(frigoerSkalering(boks, "kvadrat")).toEqual({ indhold: true, boks: true });
    expect(indhold.style.transform).toBe("none");
    expect(indhold.style.width).toBe("1080px");
    expect(indhold.style.height).toBe("1080px");
    expect(boks.style.width).toBe("1080px");
    expect(boks.style.height).toBe("1080px");
    expect(boks.style.overflow).toBe("visible");
    expect(boks.style.maxWidth).toBe("none");
    container.remove();
  });

  it("givet INDHOLDET: samme resultat — boksen findes opad", () => {
    const { container, boks, indhold } = skaleretMarkup();
    expect(frigoerSkalering(indhold, "kvadrat")).toEqual({ indhold: true, boks: true });
    expect(indhold.style.transform).toBe("none");
    expect(boks.style.overflow).toBe("visible");
    container.remove();
  });

  it("givet et element INDE i kreativen: begge findes opad", () => {
    const { container, boks, indhold, kreativ } = skaleretMarkup();
    expect(frigoerSkalering(kreativ, "liggende")).toEqual({ indhold: true, boks: true });
    expect(indhold.style.transform).toBe("none");
    expect(indhold.style.width).toBe("1200px");
    expect(boks.style.height).toBe("627px");
    container.remove();
  });

  it("uden SkaleretKreativ-markup (kreativen står uskaleret): intet røres, intet kastes", () => {
    const el = document.createElement("div");
    el.style.transform = "scale(0.5)";
    expect(frigoerSkalering(el, "kvadrat")).toEqual({ indhold: false, boks: false });
    expect(el.style.transform).toBe("scale(0.5)");
  });

  it("KILDEVÆRN: attributterne er dem SkaleretKreativ.tsx faktisk sætter", () => {
    const kilde = readFileSync("src/components/hjemmebane/deling/SkaleretKreativ.tsx", "utf8");
    expect(kilde).toContain(`${SKALERET_KREATIV_ATTR}=""`);
    expect(kilde).toContain(`${SKALERET_INDHOLD_ATTR}=""`);
    expect(kilde).toMatch(/transform: `scale\(\$\{skala\}\)`/);
  });
});

describe("hentFil — husets download-greb (EventDetailView.tsx:38-49)", () => {
  it("laver et <a download> med filnavnet, klikker, fjerner det igen, og frigiver URL'en", async () => {
    const opret = URL.createObjectURL;
    const frigiv = URL.revokeObjectURL;
    const kald: string[] = [];
    URL.createObjectURL = () => "blob:test";
    URL.revokeObjectURL = (u: string) => { kald.push(`revoke:${u}`); };
    let klikket: HTMLAnchorElement | null = null;
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { klikket = this; kald.push(`click:${this.download}:${this.href}`); };
    try {
      hentFil(new Blob(["x"], { type: "image/png" }), "the-boardroom-test.png");
      expect(kald).toEqual(["click:the-boardroom-test.png:blob:test"]);
      expect(klikket).not.toBeNull();
      expect(document.body.contains(klikket)).toBe(false); // fjernet igen
      await new Promise((r) => setTimeout(r, 1100));
      expect(kald).toContain("revoke:blob:test");
    } finally {
      URL.createObjectURL = opret;
      URL.revokeObjectURL = frigiv;
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});

describe("canvasSomPng — toBlob-callback som promise", () => {
  it("null fra toBlob bliver en fejl med en menneskelig tekst (tomt eller spærret lærred)", async () => {
    const canvas = { toBlob: (cb: (b: Blob | null) => void) => cb(null) } as unknown as HTMLCanvasElement;
    await expect(canvasSomPng(canvas)).rejects.toThrow(/PNG'en kunne ikke dannes/);
  });
  it("en blob gives videre uændret", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    const canvas = { toBlob: (cb: (b: Blob | null) => void, type: string) => { expect(type).toBe("image/png"); cb(blob); } } as unknown as HTMLCanvasElement;
    await expect(canvasSomPng(canvas)).resolves.toBe(blob);
  });
});
