import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for rådgiverens forhåndsvisning af «Dit certifikat» (29/9-2026).
 * Hver dom grøn på repoets filer og rød på en kopi med fejlen:
 *   1. RÅDGIVER-RUTEN: /certifikat/forhaandsvisning er lazy og bag den
 *      eksisterende AdvisorRoute — og AdvisorRoute sender den, der ikke er
 *      rådgiver, til forsiden. Et medlem sendes altså væk som ved de andre
 *      rådgiversider (webinarFlade.guard-mønstret).
 *   2. INTET GEMMES: siden kalder hverken skrivHentning, logHentning eller
 *      useCertificate, rører ikke supabase og giver ingen onDownloaded.
 *   3. DEN ÆGTE SIDE: CertificatePage importeres fra komponenten — ingen kopi.
 *   4. MENUPUNKTET (29/9 aften, Jonas: «Jeg kan jo heller ikke finde det som
 *      rådgiver»): ruten står i raadgiverensNav under «Medlemmets flader» —
 *      og ALDRIG i medlemmetsNav.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

const APP = "src/App.tsx";
const SIDE = "src/pages/CertifikatForhaandsvisning.tsx";
const NAV = "src/lib/hjemmebane/hbNav.ts";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const bagRaadgiverVagten = (app: string): boolean => {
  const vagt = app.slice(app.indexOf("const AdvisorRoute = "), app.indexOf("const AdminRoute = "));
  return app.includes('const CertifikatForhaandsvisning = lazy(() => import("./pages/CertifikatForhaandsvisning"));') &&
    app.includes('<Route path="/certifikat/forhaandsvisning" element={<AdvisorRoute><CertifikatForhaandsvisning /></AdvisorRoute>} />') &&
    (app.match(/<CertifikatForhaandsvisning \/>/g) ?? []).length === 1 &&
    vagt.includes('if (!isAdvisor) return <Navigate to="/" replace />;');
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const intetGemmes = (side: string): boolean => {
  const k = udenKommentarer(side);
  return !/skrivHentning|logHentning|useCertificate|certificate_downloads|supabase|lib\/certifikat\/hentninger/.test(k) &&
    !k.includes("onDownloaded") &&
    k.includes("throw new Error(UPLOAD_SLAAET_FRA);");
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const denAegteSide = (side: string): boolean =>
  side.includes('import { CertificatePage } from "@/components/hjemmebane/certifikat/CertificatePage";') &&
  side.includes('import { getCertificateStatus } from "@/components/hjemmebane/certifikat/format";') &&
  !/function (OpenView|LockedView)|export function CertificatePage/.test(side);

// ── 4 ──────────────────────────────────────────────────────────────────────
export const kunIRaadgiverensMenu = (nav: string): boolean => {
  const medlem = nav.slice(nav.indexOf("export function medlemmetsNav("), nav.indexOf("export function raadgiverensNav("));
  const raad = nav.slice(nav.indexOf("export function raadgiverensNav("), nav.indexOf("export function bygHbNav("));
  return raad.includes('{ label: CERTIFIKAT_LABEL, to: "/certifikat/forhaandsvisning", active: active === "certifikat", blok: medlem },') &&
    (nav.match(/\/certifikat\/forhaandsvisning"/g) ?? []).length === 1 &&
    !medlem.includes("/certifikat/forhaandsvisning");
};

describe("certifikatForhaandsvisning.guard — på repoets filer", () => {
  it("1. ruten er bag AdvisorRoute, og AdvisorRoute sender ikke-rådgivere til forsiden", () => expect(bagRaadgiverVagten(laes(APP))).toBe(true));
  it("2. intet gemmes: ingen skrivHentning/logHentning/useCertificate/supabase, ingen onDownloaded", () => expect(intetGemmes(laes(SIDE))).toBe(true));
  it("3. den ægte CertificatePage — ingen kopi", () => expect(denAegteSide(laes(SIDE))).toBe(true));
  it("4. ruten står i rådgiverens menu under Medlemmets flader — aldrig i medlemmets", () => expect(kunIRaadgiverensMenu(laes(NAV))).toBe(true));
});

describe("certifikatForhaandsvisning.guard — dommene fælder på en kopi", () => {
  const byt = (k: string, fra: string, til: string) => {
    const ny = k.split(fra).join(til);
    expect(ny, `mutationen ramte ikke: ${fra}`).not.toBe(k);
    return ny;
  };

  it("1. ruten bag MemberRoute, uden vagt, eller en vagt uden omdirigering fælder", () => {
    const app = laes(APP);
    expect(bagRaadgiverVagten(byt(app, "<AdvisorRoute><CertifikatForhaandsvisning /></AdvisorRoute>", "<MemberRoute><CertifikatForhaandsvisning /></MemberRoute>"))).toBe(false);
    expect(bagRaadgiverVagten(byt(app, "<AdvisorRoute><CertifikatForhaandsvisning /></AdvisorRoute>", "<CertifikatForhaandsvisning />"))).toBe(false);
    expect(bagRaadgiverVagten(byt(app, '  if (!isAdvisor) return <Navigate to="/" replace />;\n  return <>{children}</>;\n};\n\nconst AdminRoute', '  return <>{children}</>;\n};\n\nconst AdminRoute'))).toBe(false);
  });

  it("2. et kald af skrivHentning eller logHentning, useCertificate eller en onDownloaded fælder", () => {
    const side = laes(SIDE);
    const medLog = byt(side, "        portraitUrl={null}\n", "        portraitUrl={null}\n        onDownloaded={(d, f) => void logHentning(d, f)}\n");
    expect(intetGemmes(medLog)).toBe(false);
    expect(intetGemmes(`${side}\nimport { skrivHentning } from "@/lib/certifikat/hentninger";\nvoid skrivHentning;\n`)).toBe(false);
    expect(intetGemmes(`${side}\nconst c = useCertificate();\n`)).toBe(false);
    expect(intetGemmes(byt(side, "throw new Error(UPLOAD_SLAAET_FRA);", "return;"))).toBe(false);
  });

  it("3. en kopi af siden i stedet for importen fælder", () => {
    const side = laes(SIDE);
    expect(denAegteSide(byt(side, 'import { CertificatePage } from "@/components/hjemmebane/certifikat/CertificatePage";', 'import { CertificatePage } from "./kopi";'))).toBe(false);
    expect(denAegteSide(`${side}\nfunction OpenView() { return null; }\n`)).toBe(false);
  });

  it("4. punktet fjernet fra rådgiverens menu, eller dukket op i medlemmets, fælder", () => {
    const nav = laes(NAV);
    const RAAD = '    { label: CERTIFIKAT_LABEL, to: "/certifikat/forhaandsvisning", active: active === "certifikat", blok: medlem },\n';
    expect(kunIRaadgiverensMenu(byt(nav, RAAD, ""))).toBe(false);
    // Ankeret er medlemmets «Akademiet»-linje (seks steder, 2/10; før «Fortæl det videre»).
    expect(kunIRaadgiverensMenu(byt(
      nav,
      '    { label: "Akademiet", to: "/akademiet", active: active === "akademiet" },\n',
      '    { label: "Akademiet", to: "/akademiet", active: active === "akademiet" },\n    { label: "Forhåndsvisning", to: "/certifikat/forhaandsvisning" },\n',
    ))).toBe(false);
  });
});
