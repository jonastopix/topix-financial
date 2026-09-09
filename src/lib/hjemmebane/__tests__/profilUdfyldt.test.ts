import { describe, expect, it } from "vitest";
import {
  FANE_PARAM,
  laesFaneParam,
  PROFIL_MANGLER_TEKST,
  PROFIL_STI,
  profilMangler,
  profilUdfyldt,
} from "../profilUdfyldt";

describe("profilUdfyldt — ét felt, ask_me_about", () => {
  it("udfyldt når ask_me_about har indhold", () => {
    expect(profilUdfyldt({ ask_me_about: "Likviditet i håndværk." })).toBe(true);
  });

  it("ikke udfyldt: null, undefined, tom streng, mellemrum, ingen række", () => {
    expect(profilUdfyldt({ ask_me_about: null })).toBe(false);
    expect(profilUdfyldt({ ask_me_about: undefined })).toBe(false);
    expect(profilUdfyldt({ ask_me_about: "" })).toBe(false);
    expect(profilUdfyldt({ ask_me_about: "   " })).toBe(false);
    expect(profilUdfyldt(null)).toBe(false);
    expect(profilUdfyldt(undefined)).toBe(false);
  });

  it("LinkedIn, spidskompetencer eller working_on alene gør IKKE profilen udfyldt — de indgår ikke i dommen", () => {
    const kunAndet = {
      ask_me_about: null,
      linkedin_url: "https://linkedin.com/in/x",
      expertise: ["E-commerce"],
      working_on: "Nyt lagersystem",
    };
    expect(profilUdfyldt(kunAndet)).toBe(false);
  });
});

describe("profilMangler", () => {
  it("nævner det ene der mangler, og intet om billedet", () => {
    expect(profilMangler({ ask_me_about: null })).toEqual([PROFIL_MANGLER_TEKST]);
    expect(PROFIL_MANGLER_TEKST).not.toMatch(/billede/);
  });

  it("tom liste når profilen er udfyldt", () => {
    expect(profilMangler({ ask_me_about: "x" })).toEqual([]);
  });
});

describe("stien og fanen", () => {
  it("PROFIL_STI fører til fanen, ikke bare siden", () => {
    expect(PROFIL_STI).toBe("/settings?fane=profil");
    expect(PROFIL_STI).toContain(`${FANE_PARAM}=profil`);
  });

  it("laesFaneParam: kendte værdier, ellers virksomhed som før", () => {
    expect(laesFaneParam("profil")).toBe("profil");
    expect(laesFaneParam("notifikationer")).toBe("notifikationer");
    expect(laesFaneParam("virksomhed")).toBe("virksomhed");
    expect(laesFaneParam(" Profil ")).toBe("profil");
    expect(laesFaneParam(null)).toBe("virksomhed");
    expect(laesFaneParam(undefined)).toBe("virksomhed");
    expect(laesFaneParam("")).toBe("virksomhed");
    expect(laesFaneParam("konto")).toBe("virksomhed");
  });
});
