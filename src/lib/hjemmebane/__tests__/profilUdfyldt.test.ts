import { describe, expect, it } from "vitest";
import {
  FANE_PARAM,
  laesFaneParam,
  PROFIL_MANGLER_FOTO_TEKST,
  PROFIL_MANGLER_TEKST,
  PROFIL_STI,
  profilHarFoto,
  profilHarTekst,
  profilMangler,
  profilUdfyldt,
} from "../profilUdfyldt";

/* OMSKREVET MED VILJE 17/9-2026 (forside PR 4b, Jonas ordret «C»): fotoet er
   et krav. Før (9/9) lød testene:
     describe("profilUdfyldt — ét felt, ask_me_about")
       it("udfyldt når ask_me_about har indhold") →
         expect(profilUdfyldt({ ask_me_about: "Likviditet i håndværk." })).toBe(true);
     describe("profilMangler")
       it("nævner det ene der mangler, og intet om billedet") →
         expect(profilMangler({ ask_me_about: null })).toEqual([PROFIL_MANGLER_TEKST]);
         expect(PROFIL_MANGLER_TEKST).not.toMatch(/billede/);
       it("tom liste når profilen er udfyldt") →
         expect(profilMangler({ ask_me_about: "x" })).toEqual([]);
   Nu: udfyldt = tekst OG foto; mangler nævner begge hver for sig. */

const FOTO = "https://x/avatars/u/avatar?v=1";

describe("profilUdfyldt — to felter (17/9): ask_me_about OG avatar_url", () => {
  it("udfyldt når både teksten og fotoet er sat", () => {
    expect(profilUdfyldt({ ask_me_about: "Likviditet i håndværk.", avatar_url: FOTO })).toBe(true);
  });

  it("teksten alene er IKKE nok længere (før 9/9: var den) — og fotoet alene er det heller ikke", () => {
    expect(profilUdfyldt({ ask_me_about: "Likviditet i håndværk.", avatar_url: null })).toBe(false);
    expect(profilUdfyldt({ ask_me_about: "Likviditet i håndværk.", avatar_url: "  " })).toBe(false);
    expect(profilUdfyldt({ ask_me_about: null, avatar_url: FOTO })).toBe(false);
  });

  it("ikke udfyldt: null, undefined, tom streng, mellemrum, ingen række", () => {
    expect(profilUdfyldt({ ask_me_about: null, avatar_url: FOTO })).toBe(false);
    expect(profilUdfyldt({ ask_me_about: undefined, avatar_url: FOTO })).toBe(false);
    expect(profilUdfyldt({ ask_me_about: "", avatar_url: FOTO })).toBe(false);
    expect(profilUdfyldt({ ask_me_about: "   ", avatar_url: FOTO })).toBe(false);
    expect(profilUdfyldt(null)).toBe(false);
    expect(profilUdfyldt(undefined)).toBe(false);
  });

  it("LinkedIn, spidskompetencer eller working_on alene gør IKKE profilen udfyldt — de indgår ikke i dommen", () => {
    const kunAndet = {
      ask_me_about: null,
      avatar_url: FOTO,
      linkedin_url: "https://linkedin.com/in/x",
      expertise: ["E-commerce"],
      working_on: "Nyt lagersystem",
    };
    expect(profilUdfyldt(kunAndet)).toBe(false);
  });

  it("profilHarTekst / profilHarFoto hver for sig — Community sorterer stadig på teksten", () => {
    expect(profilHarTekst({ ask_me_about: "Noget." })).toBe(true);
    expect(profilHarTekst({ ask_me_about: "  " })).toBe(false);
    expect(profilHarFoto({ avatar_url: FOTO })).toBe(true);
    expect(profilHarFoto({ avatar_url: "" })).toBe(false);
    expect(profilHarFoto(null)).toBe(false);
  });
});

describe("profilMangler — teksten først, så fotoet", () => {
  it("nævner begge når begge mangler; ordene er tjeklistens", () => {
    expect(profilMangler({ ask_me_about: null, avatar_url: null })).toEqual([PROFIL_MANGLER_TEKST, PROFIL_MANGLER_FOTO_TEKST]);
    expect(PROFIL_MANGLER_TEKST).toBe("hvad man kan spørge dig om");
    expect(PROFIL_MANGLER_FOTO_TEKST).toBe("et foto");
  });

  it("kun det der mangler: fotoet alene, eller teksten alene", () => {
    expect(profilMangler({ ask_me_about: "x", avatar_url: null })).toEqual([PROFIL_MANGLER_FOTO_TEKST]);
    expect(profilMangler({ ask_me_about: null, avatar_url: FOTO })).toEqual([PROFIL_MANGLER_TEKST]);
  });

  it("tom liste når profilen er udfyldt", () => {
    expect(profilMangler({ ask_me_about: "x", avatar_url: FOTO })).toEqual([]);
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
