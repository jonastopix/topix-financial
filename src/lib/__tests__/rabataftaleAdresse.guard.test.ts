import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for én rabataftales adresse (29/9-2026). Tre domme, hver bevist
 * nedenfor på en kopi med fejlen indsat:
 *
 *   1. HVER AFTALE BÆRER SIT ID PÅ ADRESSENS FORM: den ene <article> i
 *      RabataftalerView har id={rabataftaleElementId(aftale.id)} og
 *      data-aftale-id={aftale.id}, og scroll'et finder den gennem SAMME hjælper.
 *   2. ADRESSEN ER ÉN FORM: hjælperen bygger og læser gennem den samme konstant
 *      (AFTALE_PARAM), og fladen læser location.search gennem laesRabataftaleId —
 *      ingen lokal searchParams.get("aftaleId").
 *   3. HOOKS FØR RETURN, OG PARAMETEREN RYDDES MED HASH'EN BEVARET (React #310;
 *      RapporteringView's mønster).
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const FLADE = "src/components/hjemmebane/rabataftaler/RabataftalerView.tsx";
const HJAELPER = "src/lib/hjemmebane/rabataftaleAdresse.ts";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const hverAftaleBaererSitId = (flade: string, hjaelper: string): boolean => {
  const f = udenKommentarer(flade);
  const artikler = f.match(/<article\b[^>]*>/g) ?? [];
  const i = f.indexOf("{aftaler.map((aftale) => (");
  const artikel = i === -1 ? "" : f.slice(i, f.indexOf(">", f.indexOf("<article", i)) + 1);
  return (
    artikler.length === 1 &&
    artikel.includes("id={rabataftaleElementId(aftale.id)}") &&
    artikel.includes("data-aftale-id={aftale.id}") &&
    f.includes("document.getElementById(rabataftaleElementId(maal.id))") &&
    udenKommentarer(hjaelper).includes("return `aftale-${id}`;")
  );
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const adressenErEnForm = (flade: string, hjaelper: string): boolean => {
  const f = udenKommentarer(flade), h = udenKommentarer(hjaelper);
  return (
    h.includes('export const AFTALE_PARAM = "aftaleId";') &&
    h.includes("`${RABATAFTALER_STI}?${AFTALE_PARAM}=${rent}`") &&
    h.includes("new URLSearchParams(search).get(AFTALE_PARAM)") &&
    f.includes("const oensketId = laesRabataftaleId(location.search);") &&
    !/["']aftaleId["']/.test(f) &&
    !/aftale-\$\{/.test(f)
  );
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const hooksFoerReturnOgRydning = (flade: string): boolean => {
  const f = udenKommentarer(flade);
  const start = f.indexOf("export const RabataftalerView = () => {");
  const krop = start === -1 ? "" : f.slice(start);
  const retur = krop.indexOf("\n  return (");
  if (retur === -1) return false;
  const foerRetur = krop.slice(0, retur);
  return (
    ["const location = useLocation();", "const navigate = useNavigate();", "useState<string | null>(null);", "useEffect(() => {"].every((h) => foerRetur.includes(h)) &&
    foerRetur.includes('navigate({ pathname: location.pathname, search: "", hash: location.hash }, { replace: true });') &&
    foer(foerRetur, "const maal = afgoerAftaleMaal(", "navigate({ pathname: location.pathname")
  );
};

describe("rabataftaleAdresse.guard", () => {
  it("1. hver aftale bærer sit id på adressens form, og scroll'et bruger samme hjælper", () => expect(hverAftaleBaererSitId(laes(FLADE), laes(HJAELPER))).toBe(true));
  it("2. adressen er én form — bygget og læst gennem AFTALE_PARAM", () => expect(adressenErEnForm(laes(FLADE), laes(HJAELPER))).toBe(true));
  it("3. hooks før return, og parameteren ryddes med hash'en bevaret", () => expect(hooksFoerReturnOgRydning(laes(FLADE))).toBe(true));
});

describe("rabataftaleAdresse.guard — dommene fælder på en kopi", () => {
  const flade = laes(FLADE), hjaelper = laes(HJAELPER);
  it("en <article> uden id, et id på en anden form, eller et scroll uden hjælperen, fælder dom 1", () => {
    expect(hverAftaleBaererSitId(flade.split("                id={rabataftaleElementId(aftale.id)}\n").join(""), hjaelper)).toBe(false);
    expect(hverAftaleBaererSitId(flade.split("id={rabataftaleElementId(aftale.id)}").join("id={`partner-${aftale.id}`}"), hjaelper)).toBe(false);
    expect(hverAftaleBaererSitId(flade.split("data-aftale-id={aftale.id}").join(""), hjaelper)).toBe(false);
    expect(hverAftaleBaererSitId(flade.split("document.getElementById(rabataftaleElementId(maal.id))").join("document.getElementById(maal.id)"), hjaelper)).toBe(false);
    expect(hverAftaleBaererSitId(flade, hjaelper.split("return `aftale-${id}`;").join("return `rabat-${id}`;"))).toBe(false);
  });
  it("en lokal parameterlæsning, et andet parameternavn, eller et hardkodet element-id, fælder dom 2", () => {
    expect(adressenErEnForm(flade.split("const oensketId = laesRabataftaleId(location.search);").join('const oensketId = new URLSearchParams(location.search).get("aftaleId");'), hjaelper)).toBe(false);
    expect(adressenErEnForm(flade, hjaelper.split('export const AFTALE_PARAM = "aftaleId";').join('export const AFTALE_PARAM = "id";'))).toBe(false);
    expect(adressenErEnForm(flade + "\nconst x = `aftale-${id}`;\n", hjaelper)).toBe(false);
  });
  it("en hook efter return, eller en rydning uden hash, fælder dom 3", () => {
    // useLocation flyttet ned efter komponentens return.
    const flyttet = flade.split("  const location = useLocation();\n").join("").split("\n  return (\n    <div>").join("\n  return (\n    useLocation(),\n    <div>");
    expect(flyttet).not.toBe(flade);
    expect(hooksFoerReturnOgRydning(flyttet)).toBe(false);
    expect(hooksFoerReturnOgRydning(flade.split('navigate({ pathname: location.pathname, search: "", hash: location.hash }, { replace: true });').join('navigate(location.pathname, { replace: true });'))).toBe(false);
  });
});
