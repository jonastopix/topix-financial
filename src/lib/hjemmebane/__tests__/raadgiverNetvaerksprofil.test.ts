import { describe, expect, it } from "vitest";
import { profilFelt } from "@/lib/hjemmebane/netvaerksprofil";
import {
  RAADGIVER_PROFIL_KOLONNER,
  RAADGIVER_PROFIL_STI,
  RAADGIVER_VAERET_IGENNEM,
  fletEkspertise,
  raadgiverManglerSaetning,
  raadgiverProfilPayload,
  visRaadgiverProfilKort,
} from "@/lib/hjemmebane/raadgiverNetvaerksprofil";

// Rådgiverens netværksprofil (Jonas 30/9 21:21). Testene låser: hvilke
// kolonner gemmet må røre, hvem der ser kortet, og at feltet er medlemmets.

describe("feltet er medlemmets «Det har jeg været igennem»", () => {
  it("samme nøgle, etiket og grænse — kun hjælpeteksten er rådgiverens", () => {
    const m = profilFelt("vaeret_igennem");
    expect(RAADGIVER_VAERET_IGENNEM.noegle).toBe(m.noegle);
    expect(RAADGIVER_VAERET_IGENNEM.label).toBe(m.label);
    expect(RAADGIVER_VAERET_IGENNEM.graense).toBe(300);
    expect(RAADGIVER_VAERET_IGENNEM.hjaelp).not.toBe(m.hjaelp);
  });
});

describe("gemmet rører KUN linkedin_url, expertise og ask_me_about", () => {
  it("kolonnelisten er de tre — aldrig working_on eller virksomheden", () => {
    expect([...RAADGIVER_PROFIL_KOLONNER]).toEqual(["linkedin_url", "expertise", "ask_me_about"]);
  });
  it("payloaden har præcis de tre nøgler", () => {
    const p = raadgiverProfilPayload({ linkedin_url: "x", expertise: [], ask_me_about: "y" });
    expect(Object.keys(p).sort()).toEqual(["ask_me_about", "expertise", "linkedin_url"]);
  });
  it("trimmer, gør tomt til null, fjerner tomme og dobbelte tags, klipper teksten til 300", () => {
    const p = raadgiverProfilPayload({
      linkedin_url: "   ",
      expertise: [" Finansiering ", "", "Finansiering", "Ledelse"],
      ask_me_about: `  ${"a".repeat(400)}  `,
    });
    expect(p.linkedin_url).toBeNull();
    expect(p.expertise).toEqual(["Finansiering", "Ledelse"]);
    expect(p.ask_me_about).toHaveLength(300);
    expect(raadgiverProfilPayload({ linkedin_url: null, expertise: null, ask_me_about: undefined })).toEqual({
      linkedin_url: null,
      expertise: [],
      ask_me_about: null,
    });
  });
});

describe("fletEkspertise", () => {
  it("fletter komma-input ind uden dubletter", () => {
    expect(fletEkspertise(["A"], " B, A ,, C")).toEqual(["A", "B", "C"]);
    expect(fletEkspertise(["A"], "   ")).toEqual(["A"]);
  });
});

describe("hvem ser kortet på /konto", () => {
  it("en rådgiver, der ikke er tjenestekonto", () => {
    expect(visRaadgiverProfilKort(true, "success", false)).toBe(true);
  });
  it("aldrig et medlem", () => {
    expect(visRaadgiverProfilKort(false, "success", false)).toBe(false);
  });
  it("aldrig en tjenestekonto (claude@)", () => {
    expect(visRaadgiverProfilKort(true, "success", true)).toBe(false);
  });
  it("fail-closed mens opslaget henter eller er fejlet", () => {
    expect(visRaadgiverProfilKort(true, "pending", undefined)).toBe(false);
    expect(visRaadgiverProfilKort(true, "error", undefined)).toBe(false);
    expect(visRaadgiverProfilKort(true, "error", false)).toBe(false);
  });
});

describe("egen profilside", () => {
  it("siger hvad der mangler — og peger på /konto, ikke /settings", () => {
    expect(raadgiverManglerSaetning({ ask_me_about: "  " })).toBe("Du har ikke skrevet hvad du har været igennem.");
    expect(raadgiverManglerSaetning({ ask_me_about: "Solgt to virksomheder" })).toBeNull();
    expect(RAADGIVER_PROFIL_STI).toBe("/konto#netvaerksprofil");
  });
});
