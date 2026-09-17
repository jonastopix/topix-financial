import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn Ø3d (17/9-2026 19:42, Jonas: kurven viser de rigtige tal, men er svær at læse — fem ting):
//   1. etiketterne efter PLADSEN (dashboard.akseEtiketter, bredde af fontstørrelsen) — oekonomiOe3b.guard dom 2;
//   2. SKALA: tre niveauer (top, midt, 0) regnet i dommen (skalaNiveauer) og tegnet i venstre side; MRR-tallet ved
//      den fulde linjes ende (ende.mrr);
//   3. KONTANTEN i sin EGEN kurve med EGEN top (kontant_max_oere) — hovedkurvens max er MRR/anerkendt alene;
//   4. «uden nye fornyelser» ved den stiplede linjes ende (ende.kontraheret, UDEN_FORNYELSER_TEKST);
//   5. lodret streg ved «i dag» med «herefter kun kontrakt» (idag, IDAG_TEKST).
// Alt regnes i dommen; fladen tegner efter dommens x/y. SELVBEVIS: hver dom falder når den ændres tilbage.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");
const DOM = "src/lib/oekonomi/dashboard.ts";
const VIEW = "src/components/hjemmebane/oekonomi/OekonomiView.tsx";

/** Dom 2: skalaen og MRR-tallet ved linjens ende. */
export const skalaOgEndeFraDommen = (dom: string, view: string): boolean =>
  dom.includes("export function skalaNiveauer(maxOere: number)") &&
  dom.includes("const skala = skalaNiveauer(max).map((s) => ({ oere: s.oere, y: y(s.oere) }));") &&
  view.includes("data-kurve-skala") &&
  view.includes("{ko.skala.map((s) => (") &&
  view.includes("data-kurve-mrr-ende>{kr(ko.ende.mrr.oere)}</span>");

/** Dom 3: kontanten i egen kurve med egen top; hovedkurvens max uden kontant. */
export const kontantenHarEgenKurve = (dom: string, view: string): boolean => {
  const koord = dom.slice(dom.indexOf("export function kurveKoordinater("), dom.indexOf("export function etiketBredde("));
  const kurve = view.slice(view.indexOf("const Kurve = ("), view.indexOf("const BroRaekke = ("));
  const hovedSvg = kurve.slice(kurve.indexOf("<svg viewBox={`0 0 ${B} ${H}`}"), kurve.indexOf("</svg>"));
  return (
    koord.includes("const max = Math.max(1, ...kurve.map((p) => Math.max(p.anerkendt_oere, p.mrr_oere)));") &&
    koord.includes("const kontantMax = Math.max(1, ...kurve.map((p) => p.kontant_oere));") &&
    koord.includes("hoejde: p.kontant_oere / kontantMax") &&
    kurve.includes("data-kurve-kontant>") &&
    !hovedSvg.includes("ko.soejler") &&
    kurve.includes("top {kr(ko.kontant_max_oere)}")
  );
};

/** Dom 4 + 5: «uden nye fornyelser» og «i dag». */
export const enderneOgIdagFraDommen = (dom: string, view: string): boolean =>
  dom.includes('export const IDAG_TEKST = "herefter kun kontrakt";') &&
  dom.includes('export const UDEN_FORNYELSER_TEKST = "uden nye fornyelser";') &&
  dom.includes("const idag = iIdag < 0 ? null : { x: x(iIdag), label: IDAG_TEKST };") &&
  dom.includes("label: UDEN_FORNYELSER_TEKST }") &&
  view.includes("data-kurve-idag />") &&
  view.includes("data-kurve-idag-tekst>{ko.idag.label}</span>") &&
  view.includes("data-kurve-uden-fornyelser>{ko.ende.kontraheret.label}</span>") &&
  !view.includes('>herefter kun kontrakt<') &&
  !view.includes('>uden nye fornyelser<');

describe("oekonomiKurve.guard — skala, egen kontantkurve, ender og i dag", () => {
  const dom = udenKommentarer(laes(DOM));
  const view = udenKommentarer(laes(VIEW));
  it("2. skalaen (tre niveauer) og MRR-tallet ved linjens ende kommer fra dommen", () => {
    expect(skalaOgEndeFraDommen(dom, view)).toBe(true);
  });
  it("3. kontanten tegnes i sin egen kurve med egen top; hovedkurvens skala er MRR/anerkendt alene", () => {
    expect(kontantenHarEgenKurve(dom, view)).toBe(true);
  });
  it("4+5. «uden nye fornyelser» og «herefter kun kontrakt» er dommens ord, sat efter dommens x/y", () => {
    expect(enderneOgIdagFraDommen(dom, view)).toBe(true);
  });
});

describe("oekonomiKurve.guard — selvbevis", () => {
  const dom = udenKommentarer(laes(DOM));
  const view = udenKommentarer(laes(VIEW));
  it("2. en flade der regner skalaen selv, eller en dom uden niveauer, falder", () => {
    expect(skalaOgEndeFraDommen(dom.replace("const skala = skalaNiveauer(max).map((s) => ({ oere: s.oere, y: y(s.oere) }));", "const skala = [] as { oere: number; y: number }[];"), view)).toBe(false);
    expect(skalaOgEndeFraDommen(dom, view.split("{ko.skala.map((s) => (").join("{[0, 0.5, 1].map((s) => ("))).toBe(false);
  });
  it("3. søjlerne tilbage i hovedkurven, eller kontanten i hovedkurvens max (den gamle form), falder", () => {
    expect(kontantenHarEgenKurve(dom.replace("Math.max(p.anerkendt_oere, p.mrr_oere)));", "Math.max(p.anerkendt_oere, p.mrr_oere, p.kontant_oere)));"), view)).toBe(false);
    expect(kontantenHarEgenKurve(dom.replace("hoejde: p.kontant_oere / kontantMax", "hoejde: p.kontant_oere / max"), view)).toBe(false);
    const hoved = view.indexOf("<svg viewBox={`0 0 ${B} ${H}`}");
    const medSoejler = view.slice(0, hoved) + view.slice(hoved).replace("preserveAspectRatio=\"none\"", "preserveAspectRatio=\"none\">{ko.soejler.map((s) => null)}<g ");
    expect(kontantenHarEgenKurve(dom, medSoejler)).toBe(false);
  });
  it("4+5. ordene skrevet i fladen i stedet for dommens, eller en dom uden i dag, falder", () => {
    expect(enderneOgIdagFraDommen(dom, view.replace("data-kurve-idag-tekst>{ko.idag.label}</span>", "data-kurve-idag-tekst>herefter kun kontrakt</span>"))).toBe(false);
    expect(enderneOgIdagFraDommen(dom.replace("const idag = iIdag < 0 ? null : { x: x(iIdag), label: IDAG_TEKST };", "const idag = null;"), view)).toBe(false);
  });
});
