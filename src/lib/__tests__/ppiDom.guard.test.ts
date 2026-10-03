import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Kildeværn for process-pending-invitation (pakke D, 3/10-2026). Tre domme:
 *   1. Ingen fil under src/ kalder PPI undtagen useAuth.tsx.
 *   2. useAuth kalder dommen skalKaldePendingInvitation FØR invoke, og dommen får
 *      rolleKendt, erRaadgiver og harInviteToken (selvbevis på en kopi uden dommen).
 *   3. Dommen er en ren funktion i authIndlaesning.ts.
 */
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const HOOK = "src/hooks/useAuth.tsx";
const DOM = "src/lib/authIndlaesning.ts";

const kildefiler = (mappe: string): string[] =>
  readdirSync(mappe).flatMap((n) => {
    const sti = join(mappe, n);
    if (statSync(sti).isDirectory()) return n === "__tests__" ? [] : kildefiler(sti);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [sti] : [];
  });

export const ppiKaldtUdenOmDommen = (hook: string): boolean => {
  const h = udenKommentarer(hook);
  const kald = h.indexOf('"process-pending-invitation"');
  const dom = h.indexOf("skalKaldePendingInvitation({");
  const gren = h.indexOf("userEmail && !kalderPpi");
  return !(
    kald !== -1 && dom !== -1 && gren !== -1 && dom < gren && gren < kald &&
    /rolleKendt:\s*!rolesRes\.error/.test(h) && /erRaadgiver:\s*isAdv/.test(h) &&
    /harInviteToken:\s*!!inviteTokenMeta/.test(h)
  );
};

describe("ppiDom.guard", () => {
  it("1: kun useAuth kalder process-pending-invitation", () => {
    const syndere = kildefiler("src").filter(
      (f) => f !== HOOK && /["']process-pending-invitation["']/.test(udenKommentarer(laes(f))),
    );
    expect(syndere).toEqual([]);
  });
  it("2: useAuth dømmer FØR invoke, med alle tre input", () => {
    expect(ppiKaldtUdenOmDommen(laes(HOOK))).toBe(false);
  });
  it("2b: selvbevis — fælder en kopi, hvor dommen er fjernet", () => {
    expect(ppiKaldtUdenOmDommen(laes(HOOK).replace("skalKaldePendingInvitation({", "xx({"))).toBe(true);
  });
  it("3: dommen er en ren eksporteret funktion i authIndlaesning", () => {
    const d = udenKommentarer(laes(DOM));
    expect(d).toMatch(/export function skalKaldePendingInvitation\(/);
  });
});
