import { describe, expect, it } from "vitest";
import {
  GAMMEL_DAGE,
  aabneInvitationer,
  erGyldigEmail,
  invitationStatusFor,
  invitationTekst,
  invitationsTal,
  invitationsTalTekst,
  normaliserEmail,
  type InvitationRaekke,
} from "@/lib/invitationer";

const NU = new Date(2026, 8, 9, 10, 0);
const inv = (id: string, over: Partial<InvitationRaekke> = {}): InvitationRaekke => ({
  id, company_id: "c1", email: `${id}@x.dk`, status: "pending", created_at: "2026-09-01T10:00:00Z", accepted_at: null, ...over,
});
const fmt = (iso: string) => new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "long", timeZone: "Europe/Copenhagen" });

describe("aabneInvitationer — kun pending, ældste først", () => {
  it("sorterer ældst øverst og udelader accepterede", () => {
    const liste = [inv("ny"), inv("gammel", { created_at: "2026-06-15T08:00:00Z" }), inv("acc", { status: "accepted" })];
    expect(aabneInvitationer(liste).map((i) => i.id)).toEqual(["gammel", "ny"]);
  });
});

describe("invitationTekst — sendt/oprettet, alder, gammel", () => {
  it("«Sendt» når mailloggen har et stempel, ellers «Oprettet»; gammel efter 30 dage", () => {
    const g = invitationTekst(inv("a", { created_at: "2026-06-15T08:00:00Z" }), null, NU, fmt);
    expect(g.tekst).toBe("Oprettet 15. juni · 86 dage");
    expect(g.gammel).toBe(true);
    const s = invitationTekst(inv("b"), "2026-09-08T09:00:00Z", NU, fmt);
    expect(s.tekst).toBe("Sendt 8. september · 1 dag");
    expect(s.gammel).toBe(false);
    expect(invitationTekst(inv("c"), "2026-09-09T08:00:00Z", NU, fmt).tekst).toBe("Sendt 9. september · i dag");
    expect(GAMMEL_DAGE).toBe(30);
  });
});

describe("invitationsTal — Members' regel, ordret", () => {
  const medlemmer = new Map([["c1", 2], ["c3", 1]]);
  const invitationer = [
    inv("i1", { company_id: "c1", status: "pending" }), // c1 har medlemmer → accepteret uanset status
    inv("i2", { company_id: "c2", status: "pending" }), // c2 afventer
    inv("i4", { company_id: "c4", status: "accepted" }), // c4 accepteret uden medlem
    inv("i0", { company_id: null }), // standalone tæller ikke pr. virksomhed
  ];
  it("pr. virksomhed", () => {
    expect(invitationStatusFor("c1", invitationer, medlemmer)).toBe("accepteret");
    expect(invitationStatusFor("c2", invitationer, medlemmer)).toBe("afventer");
    expect(invitationStatusFor("c3", invitationer, medlemmer)).toBe("uden_invitation");
    expect(invitationStatusFor("c4", invitationer, medlemmer)).toBe("accepteret");
    expect(invitationStatusFor("c5", invitationer, medlemmer)).toBe("uden_invitation");
  });
  it("samlet, med «uden medlem» som det egentlige hul", () => {
    const t = invitationsTal(["c1", "c2", "c3", "c4", "c5"], invitationer, medlemmer);
    expect(t).toEqual({ accepteret: 2, afventer: 1, udenInvitation: 2, udenMedlem: 1 });
    expect(invitationsTalTekst(t)).toBe("2 accepteret · 1 afventer · 2 uden invitation (1 uden medlem)");
    expect(invitationsTalTekst({ accepteret: 9, afventer: 3, udenInvitation: 15, udenMedlem: 15 })).toBe("9 accepteret · 3 afventer · 15 uden invitation");
  });
});

describe("e-mail", () => {
  it("normaliseres og valideres", () => {
    expect(normaliserEmail("  Jeppe@Firma.DK ")).toBe("jeppe@firma.dk");
    expect(erGyldigEmail("jeppe@firma.dk")).toBe(true);
    expect(erGyldigEmail("jeppe@firma")).toBe(false);
    expect(erGyldigEmail("")).toBe(false);
  });
});
