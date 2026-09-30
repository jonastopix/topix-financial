import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afstandTilBund, BUND_TAERSKEL_PX, skalHoldeBunden } from "@/lib/chatBund";

const m = (scrollTop: number, scrollHeight: number, clientHeight: number) => ({ scrollTop, scrollHeight, clientHeight });

describe("chatBund — skalHoldeBunden", () => {
  it("afstanden er scrollHeight − scrollTop − clientHeight", () => {
    expect(afstandTilBund(m(800, 1400, 600))).toBe(0);
    expect(afstandTilBund(m(500, 1400, 600))).toBe(300);
  });

  it("skrivefeltet vokser ved fokus: stod ved bunden → rul til bunden", () => {
    expect(skalHoldeBunden(m(800, 1400, 600), m(800, 1400, 564))).toBe(true);
  });

  it("et billede indlæses sent: stod ved bunden → rul til bunden", () => {
    expect(skalHoldeBunden(m(800, 1400, 600), m(800, 1650, 600))).toBe(true);
  });

  it("inden for tærsklen (40 px) tæller som bunden; lige over gør ikke", () => {
    expect(BUND_TAERSKEL_PX).toBe(40);
    expect(skalHoldeBunden(m(760, 1400, 600), m(760, 1400, 564))).toBe(true);
    expect(skalHoldeBunden(m(759, 1400, 600), m(759, 1400, 564))).toBe(false);
  });

  it("rullet op for at læse → stå stille (rives ikke ned)", () => {
    expect(skalHoldeBunden(m(500, 1400, 600), m(500, 1400, 564))).toBe(false);
    expect(skalHoldeBunden(m(0, 1400, 600), m(0, 1650, 600))).toBe(false);
  });

  it("ingen måling endnu (åbning / skift af samtale) → den nyeste besked skal stå synligt", () => {
    expect(skalHoldeBunden(null, m(0, 1400, 600))).toBe(true);
  });

  it("står allerede ved bunden efter ændringen → intet at gøre", () => {
    expect(skalHoldeBunden(m(800, 1400, 600), m(836, 1400, 564))).toBe(false);
    expect(skalHoldeBunden(null, m(0, 500, 600))).toBe(false);
  });
});

// Kildeværn: CompanyChatPane bruger dommen gennem en ResizeObserver på
// listen OG dens børn, rydder op, og hooken står i topblokken.
describe("chatBund — CompanyChatPane holder bunden", () => {
  const pane = readFileSync(resolve(process.cwd(), "src/components/CompanyChatPane.tsx"), "utf8");
  it("ResizeObserver på listen og dens børn, dømt af skalHoldeBunden, med oprydning", () => {
    expect(pane).toContain('import { maalListe, skalHoldeBunden, type ListeMaal } from "@/lib/chatBund";');
    expect(pane).toMatch(/new ResizeObserver\(/);
    expect(pane).toMatch(/ro\.observe\(listeEl\)/);
    expect(pane).toMatch(/new MutationObserver\(/);
    expect(pane).toMatch(/skalHoldeBunden\(bundMaalRef\.current, efter\)/);
    expect(pane).toMatch(/ro\.disconnect\(\);/);
    expect(pane).toMatch(/mo\.disconnect\(\);/);
    expect(pane).toMatch(/removeEventListener\("scroll"/);
    expect(pane).toContain("ref={saetListeRef}");
  });
  it("hooken står før komponentens første return (React #310)", () => {
    const start = pane.indexOf("const CompanyChatPane = ");
    const hook = pane.indexOf("new ResizeObserver(", start);
    const foersteReturn = pane.indexOf("\n  return (", start);
    expect(hook).toBeGreaterThan(start);
    expect(hook).toBeLessThan(foersteReturn);
  });
});
