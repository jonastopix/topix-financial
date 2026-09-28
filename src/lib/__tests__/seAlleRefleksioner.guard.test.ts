import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Kildeværn for «Se alle dine refleksioner» (udkast 28/9-2026) — linket DEN
 * ANDEN VEJ, fra modalens «Tidligere refleksioner» til sektionen på /reports.
 * Tre domme, hver bevist nedenfor på en kopi med fejlen indsat:
 *
 *   1. LINKET STÅR I MODALENS FÆRDIG-GREN: alreadyDoneContent bærer knappen
 *      med SE_ALLE_REFLEKSIONER, og handleren går gennem dommen
 *      seAlleRefleksionerHandling og REFLEKSIONER_STI — ingen egen sti.
 *   2. ANKERET BOR ÉT STED: sektionen bruger REFLEKSIONER_ANKER som id, og
 *      strengen «dine-refleksioner» står ingen andre steder i src end i
 *      dommen (og prøverne). Et omdøbt id ville ellers lade linket pege på
 *      intet — uden at nogen prøve lagde mærke til det.
 *   3. HOOKS FØR RETURN: useNavigate og useLocation står i modalens topblok,
 *      før den betingede return (React #310-reglen).
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const MODAL = "src/components/PulseCheckinModal.tsx";
const SEKTION = "src/components/hjemmebane/rapportering/RefleksionerSektion.tsx";
const DOM = "src/lib/hjemmebane/refleksioner.ts";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const linketIFaerdigGrenen = (modal: string): boolean => {
  const m = udenKommentarer(modal);
  const start = m.indexOf("const alreadyDoneContent = (");
  const slut = m.indexOf("const formContent = (");
  if (start === -1 || slut === -1 || slut < start) return false;
  const gren = m.slice(start, slut);
  const handler = m.slice(m.indexOf("const seAlleRefleksioner = () => {"), start);
  return (
    gren.includes("onClick={seAlleRefleksioner}") &&
    gren.includes("{SE_ALLE_REFLEKSIONER}") &&
    handler.includes("seAlleRefleksionerHandling(location.pathname, location.hash)") &&
    handler.includes("navigate(REFLEKSIONER_STI)") &&
    !/navigate\(["'`]/.test(m)
  );
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const ankeretEtSted = (sektion: string, filer: ReadonlyMap<string, string>): boolean => {
  if (!udenKommentarer(sektion).includes("<HbSection id={REFLEKSIONER_ANKER}")) return false;
  for (const [sti, indhold] of filer) {
    if (sti === DOM || sti.includes("__tests__")) continue;
    if (udenKommentarer(indhold).includes("dine-refleksioner")) return false;
  }
  return true;
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const hooksFoerReturn = (modal: string): boolean => {
  const m = udenKommentarer(modal);
  const retur = m.indexOf("if (inline) {");
  const nav = m.indexOf("useNavigate()");
  const loc = m.indexOf("useLocation()");
  return retur !== -1 && nav !== -1 && loc !== -1 && nav < retur && loc < retur;
};

const alleKildefiler = (rod: string): Map<string, string> => {
  const ud = new Map<string, string>();
  const gaa = (mappe: string) => {
    for (const navn of readdirSync(mappe)) {
      const sti = join(mappe, navn);
      if (statSync(sti).isDirectory()) gaa(sti);
      else if (/\.(ts|tsx)$/.test(navn)) ud.set(sti, readFileSync(sti, "utf8"));
    }
  };
  gaa(rod);
  return ud;
};

describe("«Se alle dine refleksioner» — kildeværn", () => {
  const modal = laes(MODAL);
  const sektion = laes(SEKTION);
  const filer = alleKildefiler("src");

  it("1. linket står i modalens færdig-gren og går gennem dommen", () => expect(linketIFaerdigGrenen(modal)).toBe(true));
  it("2. ankeret bor ét sted — sektionens id er konstanten", () => expect(ankeretEtSted(sektion, filer)).toBe(true));
  it("3. hooks før return i modalen", () => expect(hooksFoerReturn(modal)).toBe(true));
});

describe("«Se alle dine refleksioner» — værnet fælder (selvbevis på kopier)", () => {
  const modal = laes(MODAL);
  const sektion = laes(SEKTION);
  const filer = alleKildefiler("src");

  it("et link uden for færdig-grenen, en egen sti eller en handler uden dommen fælder dom 1", () => {
    expect(linketIFaerdigGrenen(modal.split("onClick={seAlleRefleksioner}").join("onClick={() => {}}"))).toBe(false);
    expect(linketIFaerdigGrenen(modal.split("navigate(REFLEKSIONER_STI)").join('navigate("/reports#dine-refleksioner")'))).toBe(false);
    expect(linketIFaerdigGrenen(modal.split("seAlleRefleksionerHandling(location.pathname, location.hash)").join('"naviger"'))).toBe(false);
  });

  it("et id skrevet som streng, eller ankeret gentaget i en anden fil, fælder dom 2", () => {
    expect(ankeretEtSted(sektion.split("<HbSection id={REFLEKSIONER_ANKER}").join('<HbSection id="dine-refleksioner"'), filer)).toBe(false);
    const med = new Map(filer);
    med.set("src/components/Andet.tsx", 'const a = "/reports#dine-refleksioner";');
    expect(ankeretEtSted(sektion, med)).toBe(false);
  });

  it("en hook efter den betingede return fælder dom 3", () => {
    const flyttet = modal.split("  const navigate = useNavigate();\n").join("").split("  if (inline) {").join("  if (inline) {\n  const navigate = useNavigate();");
    expect(hooksFoerReturn(flyttet)).toBe(false);
  });
});
