import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Kildeværn for process-pending-invitation (pakke D, 3/10-2026). Fem domme, hver med selvbevis
 * (en kopi med fejlen indsat, som fælder):
 *   1. Ingen fil under src/ kalder PPI undtagen useAuth.tsx (og kildelisten er ikke tom).
 *   2. I grenen UDEN medlemskab (efter `if (cm?.company_id)`) står dommen FØR springgrenen,
 *      og springgrenen FØR invoke.
 *   3. Dommen får rolleKendt og erRaadgiver — og INTET invite_token.
 *   4. Springgrenen gør præcis: id/navn/tier nulstilles, companyResolution «none», return true
 *      (ikke «failed»/return false — en rådgiver må aldrig ramme gaten).
 *   5. Dommen er en ren eksporteret funktion i authIndlaesning.ts; rådgiver-timeouten findes ikke mere.
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

const KALDER_PPI = /["']process-pending-invitation["']/;

/** Grenen uden medlemskab: fra `if (cm?.company_id) {` og dens `} else {` til slutningen af fetchUserData. */
export const udenMedlemskabsgren = (hook: string): string => {
  const h = udenKommentarer(hook);
  const start = h.indexOf("if (cm?.company_id) {");
  if (start === -1) return "";
  const el = h.indexOf("} else {", start);
  const slut = h.indexOf("useEffect(", el);
  return el === -1 || slut === -1 ? "" : h.slice(el, slut);
};

const SPRING =
  /if \(!kalderPpi\) \{\s*setOwnCompanyId\(null\);\s*setOwnCompanyName\(null\);\s*setMembershipTier\(null\);\s*setCompanyResolution\("none"\);\s*return true;\s*\}/;

export const raekkefoelgeBrudt = (hook: string): boolean => {
  const g = udenMedlemskabsgren(hook);
  const dom = g.indexOf("skalKaldePendingInvitation({");
  const gren = g.search(/if \(!kalderPpi\)/);
  const kald = g.search(KALDER_PPI);
  return !(dom !== -1 && gren !== -1 && kald !== -1 && dom < gren && gren < kald);
};
export const inputBrudt = (hook: string): boolean => {
  const g = udenMedlemskabsgren(hook);
  const m = /skalKaldePendingInvitation\(\{([\s\S]*?)\}\)/.exec(g);
  return !(m && /rolleKendt:\s*!rolesRes\.error/.test(m[1]) && /erRaadgiver:\s*isAdv/.test(m[1]) && !/token/i.test(m[1]));
};
export const springBrudt = (hook: string): boolean => !SPRING.test(udenMedlemskabsgren(hook));

describe("ppiDom.guard", () => {
  it("1: kun useAuth kalder process-pending-invitation (kildelisten er ikke tom)", () => {
    const filer = kildefiler("src");
    expect(filer.length).toBeGreaterThan(100);
    expect(filer).toContain(HOOK);
    const syndere = filer.filter((f) => f !== HOOK && KALDER_PPI.test(udenKommentarer(laes(f))));
    expect(syndere).toEqual([]);
  });
  it("1b: selvbevis — en fil med et PPI-kald ville blive fanget", () => {
    expect(KALDER_PPI.test(udenKommentarer('supabase.functions.invoke("process-pending-invitation", {})'))).toBe(true);
    expect(KALDER_PPI.test(udenKommentarer('// "process-pending-invitation"'))).toBe(false);
  });

  it("2: dom → springgren → invoke, inden for grenen uden medlemskab", () => {
    expect(udenMedlemskabsgren(laes(HOOK)).length).toBeGreaterThan(500);
    expect(raekkefoelgeBrudt(laes(HOOK))).toBe(false);
  });
  it("2b: selvbevis — en springgren efter invoke fælder", () => {
    const k = laes(HOOK).replace("if (!kalderPpi) {", "if (false) {");
    expect(raekkefoelgeBrudt(k)).toBe(true);
  });
  it("2c: selvbevis — dommen kun nævnt i en kommentar fælder", () => {
    const k = laes(HOOK).replace(
      "const kalderPpi = skalKaldePendingInvitation({",
      "const kalderPpi = true; // skalKaldePendingInvitation({\n void ({",
    );
    expect(raekkefoelgeBrudt(k)).toBe(true);
  });
  it("2d: selvbevis — dommen over medlemskabsgrenen (uden for grenen) tæller ikke", () => {
    const k = laes(HOOK).replace(
      "const kalderPpi = skalKaldePendingInvitation({",
      "const kalderPpi = true; void ({",
    ).replace("if (cm?.company_id) {", "skalKaldePendingInvitation({}); if (cm?.company_id) {");
    expect(raekkefoelgeBrudt(k)).toBe(true);
  });

  it("3: dommen får rolleKendt og erRaadgiver, og intet token", () => {
    expect(inputBrudt(laes(HOOK))).toBe(false);
  });
  it("3b: selvbevis — et token-input eller en tabt rolleKendt fælder", () => {
    expect(inputBrudt(laes(HOOK).replace("erRaadgiver: isAdv,", "erRaadgiver: isAdv, harInviteToken: !!inviteTokenMeta,"))).toBe(true);
    expect(inputBrudt(laes(HOOK).replace("rolleKendt: !rolesRes.error", "rolleKendt: true"))).toBe(true);
  });

  it("4: springgrenen nulstiller og returnerer true med «none»", () => {
    expect(springBrudt(laes(HOOK))).toBe(false);
  });
  it("4b: selvbevis — «failed» + return false fælder", () => {
    const k = laes(HOOK).replace(
      /if \(!kalderPpi\) \{[\s\S]*?return true;\s*\}/,
      'if (!kalderPpi) { setCompanyResolution("failed"); return false; }',
    );
    expect(k).not.toBe(laes(HOOK));
    expect(springBrudt(k)).toBe(true);
  });
  it("4c: selvbevis — en tabt nulstilling eller et return false fælder", () => {
    const k1 = laes(HOOK).replace(/(if \(!kalderPpi\) \{\s*setOwnCompanyId\(null\);\s*setOwnCompanyName\(null\);)\s*setMembershipTier\(null\);/, "$1");
    expect(k1).not.toBe(laes(HOOK));
    expect(springBrudt(k1)).toBe(true);
    const k2 = laes(HOOK).replace(/(setCompanyResolution\("none"\);\s*)return true;(\s*\}\s*if \(userEmail\))/, "$1return false;$2");
    expect(k2).not.toBe(laes(HOOK));
    expect(springBrudt(k2)).toBe(true);
  });

  it("5: dommen er en ren eksporteret funktion; rådgiver-timeouten er væk", () => {
    expect(udenKommentarer(laes(DOM))).toMatch(/export function skalKaldePendingInvitation\(/);
    expect(udenKommentarer(laes(DOM))).not.toMatch(/PPI_TIMEOUT_RAADGIVER_MS/);
    expect(udenKommentarer(laes(HOOK))).not.toMatch(/PPI_TIMEOUT_RAADGIVER_MS/);
  });
  it("5b: selvbevis — en genindført rådgiver-timeout ville fælde", () => {
    expect(/PPI_TIMEOUT_RAADGIVER_MS/.test(udenKommentarer(laes(DOM) + "\nexport const PPI_TIMEOUT_RAADGIVER_MS = 4_000;"))).toBe(true);
  });
});
