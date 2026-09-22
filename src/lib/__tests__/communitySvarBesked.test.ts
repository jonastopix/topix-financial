import { describe, expect, it } from "vitest";
import { beskedVedSvar, REFERENCE_COMMUNITY_TRAAD, svarTitel, TYPE_COMMUNITY_SVAR } from "../../../supabase/functions/_shared/communitySvarBesked.ts";
import { ALDRIG_TYPER, klassificer } from "../../../supabase/functions/_shared/klokkeMail.ts";

/** Rådgivernes klokke ved et svar i en community-tråd (Jonas 21/9: klokke, ikke mail) — den rene dom, spejl af communityOpslagBesked.test. */
const TRAAD = "33333333-3333-4333-8333-333333333333";
const MEDLEM = "11111111-1111-4111-8111-111111111111";

describe("communitySvarBesked — dommen", () => {
  it("et medlems svar giver en besked: typen, titlen med forfatter og trådtitel, linket til tråden", () => {
    const b = beskedVedSvar({ traadId: TRAAD, traadTitel: " Hvordan budgetterer I? ", forfatterId: MEDLEM, forfatterNavn: "Anna Andersen", forfatterErRaadgiver: false, companyId: "c1" });
    expect(b).toEqual({
      type: "community_svar", title: "Anna Andersen har svaret i «Hvordan budgetterer I?»", body: null, company_id: "c1",
      member_id: MEDLEM, reference_type: "community_traad", reference_id: TRAAD,
    });
    expect(TYPE_COMMUNITY_SVAR).toBe("community_svar");
    expect(REFERENCE_COMMUNITY_TRAAD).toBe("community_traad");
  });
  it("en rådgivers svar giver ingen besked; tom tråd-id eller forfatter-id giver ingen", () => {
    expect(beskedVedSvar({ traadId: TRAAD, traadTitel: "x", forfatterId: MEDLEM, forfatterNavn: "Jonas", forfatterErRaadgiver: true })).toBeNull();
    expect(beskedVedSvar({ traadId: " ", traadTitel: "x", forfatterId: MEDLEM, forfatterNavn: "Anna", forfatterErRaadgiver: false })).toBeNull();
    expect(beskedVedSvar({ traadId: TRAAD, traadTitel: "x", forfatterId: null, forfatterNavn: "Anna", forfatterErRaadgiver: false })).toBeNull();
  });
  it("navnet falder tilbage på «Et medlem» (visningsnavn), titlen på «… på et opslag»; company_id null når tom", () => {
    expect(svarTitel(null, "Tråden")).toBe("Et medlem har svaret i «Tråden»");
    expect(svarTitel("Bo", "")).toBe("Bo har svaret på et opslag");
    expect(svarTitel("Bo", null)).toBe("Bo har svaret på et opslag");
    const b = beskedVedSvar({ traadId: TRAAD, traadTitel: null, forfatterId: MEDLEM, forfatterNavn: "", forfatterErRaadgiver: false, companyId: " " });
    expect(b?.title).toBe("Et medlem har svaret på et opslag");
    expect(b?.company_id).toBeNull();
  });
  it("mailen: typen står under ALDRIG i klokkeMail.ts med Jonas' grund", () => {
    expect(klassificer(TYPE_COMMUNITY_SVAR)).toBe("aldrig");
    expect(ALDRIG_TYPER[TYPE_COMMUNITY_SVAR]).toContain("Jonas 21/9: klokke, ikke mail");
  });
});
