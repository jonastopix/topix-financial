import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Kildeværn for rådgiverens netværksprofil (30/9). De rene regler er testet i
// src/lib/hjemmebane/__tests__/raadgiverNetvaerksprofil.test.ts; her låses,
// at fladen og skrivevejen bruger dem.

const laes = (sti: string) => readFileSync(sti, "utf8");
const konto = laes("src/components/hjemmebane/konto/KontoView.tsx");
const kort = laes("src/components/hjemmebane/konto/RaadgiverNetvaerksprofil.tsx");
const api = laes("src/lib/hjemmebane/memberProfile.ts");
const profilside = laes("src/components/hjemmebane/members/MemberProfileView.tsx");

const funktionskrop = (kilde: string, navn: string): string => {
  const start = kilde.indexOf(`export async function ${navn}(`);
  expect(start, `${navn} findes`).toBeGreaterThanOrEqual(0);
  const slut = kilde.indexOf("\n}\n", start);
  return kilde.slice(start, slut);
};

describe("dom 1 — kortet vises kun gennem visRaadgiverProfilKort", () => {
  it("KontoView dømmer med visRaadgiverProfilKort og tegner kortet betinget", () => {
    expect(konto).toMatch(/visRaadgiverProfilKort\(isAdvisor, tjenestekontoQuery\.status, tjenestekontoQuery\.data\)/);
    expect(konto).toMatch(/\{visNetvaerksprofil && <RaadgiverNetvaerksprofil \/>\}/);
    expect(konto.match(/<RaadgiverNetvaerksprofil/g)?.length).toBe(1);
  });
  it("tjenestekonto-opslaget deler nøgle med useAuth (ét kald)", () => {
    const auth = laes("src/hooks/useAuth.tsx");
    const noegle = 'queryKey: ["tjenestekonto", user?.id ?? null]';
    expect(auth).toContain(noegle);
    expect(konto).toContain(noegle);
  });
  it("ingen anden flade monterer rådgiverkortet", () => {
    const filer = readdirSync("src", { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => `src/${f}`)
      .filter((f) => !f.endsWith("KontoView.tsx") && !f.endsWith("RaadgiverNetvaerksprofil.tsx"));
    for (const f of filer) expect(laes(f), f).not.toContain("<RaadgiverNetvaerksprofil");
  });
});

describe("dom 2 — gemmet rører aldrig working_on eller virksomheden", () => {
  it("saveMyAdvisorProfile skriver kun de tre kolonner og kaster ved nul rækker", () => {
    const krop = funktionskrop(api, "saveMyAdvisorProfile");
    expect(krop).not.toMatch(/working_on/);
    expect(krop).not.toMatch(/\.\.\.fields/);
    expect(krop).not.toMatch(/companies/);
    for (const k of ["linkedin_url", "expertise", "ask_me_about"]) expect(krop).toContain(`${k}: fields.${k}`);
    expect(krop).toMatch(/nul rækker/);
  });
  it("kortet gemmer gennem saveMyAdvisorProfile + raadgiverProfilPayload — aldrig medlemmets gem", () => {
    expect(kort).toContain("saveMyAdvisorProfile(");
    expect(kort).toContain("raadgiverProfilPayload(");
    expect(kort).not.toContain("saveMyMemberProfile");
    expect(kort).not.toContain("saveMyCompanyDescription");
  });
});

describe("dom 3 — ingen tom overskrivning", () => {
  it("formularen og knappen tegnes kun, når egen række er hentet", () => {
    const fejlGren = kort.indexOf('egenQuery.status === "error"');
    const knap = kort.indexOf("Gem netværksprofil");
    expect(fejlGren).toBeGreaterThan(0);
    expect(kort.indexOf('egenQuery.status === "pending"')).toBeGreaterThan(0);
    expect(knap).toBeGreaterThan(fejlGren);
  });
});

describe("dom 4 — rådgiverens egen profilside peger på /konto", () => {
  it("MemberProfileView bruger RAADGIVER_PROFIL_STI og raadgiverManglerSaetning for is_advisor", () => {
    expect(profilside).toMatch(/profile\.is_advisor \? raadgiverManglerSaetning\(profile\) : manglerSaetning\(profile\)/);
    expect(profilside).toMatch(/profile\.is_advisor \? RAADGIVER_PROFIL_STI : PROFIL_STI/);
  });
});

describe("dom 5 — Netværket filtrerer stadig tjenestekonti", () => {
  it("listMemberDirectory går gennem synligeRaadgivere", () => {
    expect(funktionskrop(api, "listMemberDirectory")).toContain("synligeRaadgivere(");
  });
});
