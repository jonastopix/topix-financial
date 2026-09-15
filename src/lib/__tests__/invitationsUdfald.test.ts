/**
 * Fund B (14/9 2026): udfaldet af sikrIndgangsInvitation må ikke forsvinde.
 * Ren dom: «sendt» og «fandtes_allerede» giver INGEN besked; «sprunget_over»
 * og «fejlet» giver rådgiverne én besked i klokken med virksomhed, mail,
 * grund, Stripe-reference og vejen ud (/virksomheder). Dedup-nøglen er
 * company_id som reference_id.
 */
import { describe, expect, it } from "vitest";
import {
  beskedVedInvitationsUdfald,
  invitationFejletBeskedTekst,
  raadgivereUdenRaekke,
  TYPE_INVITATION_FEJLET,
} from "../../../supabase/functions/_shared/raadgiverBeskedTekst.ts";

const COMPANY = "a4481db0-1cbc-4f2f-801e-29d5693da08d";
const basis = { virksomhed: "FLOOR1 I/S", email: "lisbeth@floor1.dk", companyId: COMPANY, stripeReference: "cs_test_123" };

describe("beskedVedInvitationsUdfald — de tre normale udfald larmer ikke", () => {
  it("sendt → null", () => {
    expect(beskedVedInvitationsUdfald({ ...basis, udfald: { udfald: "sendt", email: "lisbeth@floor1.dk" } })).toBeNull();
  });
  it("fandtes_allerede → null", () => {
    expect(beskedVedInvitationsUdfald({ ...basis, udfald: { udfald: "fandtes_allerede", email: "lisbeth@floor1.dk" } })).toBeNull();
  });
  // DE TYVE (8), 15/9: invitationen er accepteret af en bruger der findes —
  // medlemmet har sit login, og «intet login» i klokken ville være usandt.
  it("allerede_medlem → null (ingen besked: medlemmet har sit login)", () => {
    expect(beskedVedInvitationsUdfald({ ...basis, udfald: { udfald: "allerede_medlem", email: "lisbeth@floor1.dk" } })).toBeNull();
  });
  it("uden company_id kan der ikke skrives en besked (kolonnen er NOT NULL) → null", () => {
    expect(beskedVedInvitationsUdfald({ ...basis, companyId: "  ", udfald: { udfald: "fejlet", aarsag: "x" } })).toBeNull();
  });
});

describe("beskedVedInvitationsUdfald — de to der skal i klokken", () => {
  it("sprunget_over (secret mangler): typen, virksomhed, mail, grunden, referencen og vejen ud", () => {
    const b = beskedVedInvitationsUdfald({ ...basis, udfald: { udfald: "sprunget_over", grund: "secret_mangler" } });
    expect(b).not.toBeNull();
    expect(b!.type).toBe(TYPE_INVITATION_FEJLET);
    expect(TYPE_INVITATION_FEJLET).toBe("invitation_fejlet");
    expect(b!.title).toBe("FLOOR1 I/S: invitationen efter betaling blev ikke sendt");
    expect(b!.body).toContain("Til lisbeth@floor1.dk");
    expect(b!.body).toContain("Secret INVITATION_AFSENDER_USER_ID mangler i Lovable");
    expect(b!.body).toContain("Betalingen er registreret (cs_test_123)");
    expect(b!.body).toContain("Invitér manuelt fra /virksomheder");
    expect(b!.company_id).toBe(COMPANY);
    expect(b!.reference_type).toBe("company");
    expect(b!.reference_id).toBe(COMPANY);
  });

  it("fejlet: årsagen står i beskeden, ordret fra sikrIndgangsInvitation", () => {
    const b = beskedVedInvitationsUdfald({
      ...basis,
      udfald: { udfald: "fejlet", aarsag: "send-invitation-email fejlede: status=500 body= error=Failed to send invitation email (rate_limited): Email API error: 429" },
    });
    expect(b!.body).toContain("Fejl: send-invitation-email fejlede: status=500");
    expect(b!.body).toContain("rate_limited");
    expect(b!.reference_id).toBe(COMPANY);
  });

  it("fejlet uden årsag → «ukendt», og uden mail → «mailadresse ukendt»", () => {
    const b = beskedVedInvitationsUdfald({ ...basis, email: null, udfald: { udfald: "fejlet", aarsag: "  " } });
    expect(b!.body).toContain("Til mailadresse ukendt");
    expect(b!.body).toContain("Fejl: ukendt");
  });

  it("teksten alene: fire led adskilt af «·»", () => {
    const t = invitationFejletBeskedTekst({ virksomhed: "X", email: "a@b.dk", grund: "G", stripeReference: "in_1" });
    expect(t.body.split(" · ")).toHaveLength(4);
  });
});

describe("dedup — Stripes gensendelser giver én besked pr. rådgiver", () => {
  it("samme company_id som reference_id: anden runde finder rækken hos begge rådgivere", () => {
    const b = beskedVedInvitationsUdfald({ ...basis, udfald: { udfald: "fejlet", aarsag: "x" } })!;
    const raadgivere = ["jonas", "morten"];
    // Første kørsel: ingen rækker → begge mangler.
    expect(raadgivereUdenRaekke(raadgivere, [], b)).toEqual(["jonas", "morten"]);
    // Gensendelse (også ad fakturavejen — samme company_id): rækkerne findes → ingen mangler.
    const eks = raadgivere.map((advisor_id) => ({ advisor_id, reference_id: b.reference_id, title: "en anden titel" }));
    expect(raadgivereUdenRaekke(raadgivere, eks, b)).toEqual([]);
    // En anden virksomhed er en anden nøgle.
    const anden = beskedVedInvitationsUdfald({ ...basis, companyId: "11111111-1111-1111-1111-111111111111", udfald: { udfald: "fejlet", aarsag: "x" } })!;
    expect(raadgivereUdenRaekke(raadgivere, eks, anden)).toEqual(["jonas", "morten"]);
  });
});
