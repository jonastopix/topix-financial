/**
 * Rådgivernes klokke ved et nyt opslag i Community (16/9): den rene dom i
 * _shared/communityOpslagBesked.ts — rådgiverforfatter giver null, tom titel
 * giver en tekst uden «undefined», type og reference ordret.
 */
import { describe, expect, it } from "vitest";
import {
  beskedVedNytOpslag,
  opslagsTitel,
  REFERENCE_COMMUNITY_TRAAD,
  TYPE_COMMUNITY_OPSLAG,
} from "../../../supabase/functions/_shared/communityOpslagBesked.ts";

const TRAAD = "11111111-1111-1111-1111-111111111111";
const FORFATTER = "22222222-2222-2222-2222-222222222222";
const VIRKSOMHED = "33333333-3333-3333-3333-333333333333";

const medlem = (over: Partial<Parameters<typeof beskedVedNytOpslag>[0]> = {}) =>
  beskedVedNytOpslag({
    traadId: TRAAD,
    titel: "Hvem har prøvet at ansætte sin første sælger?",
    forfatterId: FORFATTER,
    forfatterNavn: "Mette Hansen",
    forfatterErRaadgiver: false,
    companyId: VIRKSOMHED,
    ...over,
  });

describe("beskedVedNytOpslag — dommen", () => {
  it("et medlems opslag: type, titel, body, reference og member_id ordret", () => {
    expect(medlem()).toEqual({
      type: "community_opslag",
      title: "Mette Hansen har skrevet et nyt opslag",
      body: "Hvem har prøvet at ansætte sin første sælger?",
      company_id: VIRKSOMHED,
      member_id: FORFATTER,
      reference_type: "community_traad",
      reference_id: TRAAD,
    });
    expect(TYPE_COMMUNITY_OPSLAG).toBe("community_opslag");
    expect(REFERENCE_COMMUNITY_TRAAD).toBe("community_traad");
  });

  it("rådgiverforfatter → null — klokken ringer ikke for vores egne opslag", () => {
    expect(medlem({ forfatterErRaadgiver: true })).toBeNull();
  });

  it("tom titel → body null; title uden «undefined»/«null»", () => {
    for (const titel of ["", "   ", null, undefined]) {
      const b = medlem({ titel })!;
      expect(b.body).toBeNull();
      expect(b.title).toBe("Mette Hansen har skrevet et nyt opslag");
      expect(JSON.stringify(b)).not.toContain("undefined");
    }
  });

  it("navnet er visningsnavn-reglen: tomt profilnavn → «Et medlem» (samme som in-app-titlen)", () => {
    expect(medlem({ forfatterNavn: null })!.title).toBe("Et medlem har skrevet et nyt opslag");
    expect(medlem({ forfatterNavn: "  " })!.title).toBe("Et medlem har skrevet et nyt opslag");
    expect(opslagsTitel("Jens")).toBe("Jens har skrevet et nyt opslag");
  });

  it("company_id: null når virksomheden ikke kunne slås op; tom streng → null", () => {
    expect(medlem({ companyId: null })!.company_id).toBeNull();
    expect(medlem({ companyId: undefined })!.company_id).toBeNull();
    expect(medlem({ companyId: " " })!.company_id).toBeNull();
  });

  it("uden tråd-id eller forfatter-id → null (intet at dedup'e på, intet at linke til)", () => {
    expect(medlem({ traadId: "" })).toBeNull();
    expect(medlem({ traadId: null })).toBeNull();
    expect(medlem({ forfatterId: "" })).toBeNull();
  });

  it("body og titel trimmes", () => {
    expect(medlem({ titel: "  Hej  " })!.body).toBe("Hej");
  });
});
