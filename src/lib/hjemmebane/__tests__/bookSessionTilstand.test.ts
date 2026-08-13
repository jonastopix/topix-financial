import { describe, expect, it } from "vitest";
import {
  afgoerMortenTilstand,
  visMortenKolonne,
  type MortenTilstand,
  type MortenTilstandInput,
} from "../bookSessionTilstand";

/** Fast "nu" så testene er deterministiske: 13-08-2026 kl. 12 UTC. */
const NU = new Date(Date.UTC(2026, 7, 13, 12, 0, 0));
const FREMTID = "2026-12-01";
const FORTID = "2026-05-01";

const base: MortenTilstandInput = {
  isAdvisor: false,
  membershipTier: "full",
  companyId: "c-1",
  company: { intro_session_used_at: null, contract_end_date: FREMTID },
  mortenBookingLoading: false,
  mortenBooking: null,
};

const input = (overrides: Partial<MortenTilstandInput> = {}): MortenTilstandInput => ({
  ...base,
  ...overrides,
});

describe("afgoerMortenTilstand — hidden (baseEligible falder)", () => {
  it("rådgiver giver hidden, uanset alt andet", () => {
    expect(afgoerMortenTilstand(input({ isAdvisor: true }), NU)).toBe("hidden");
  });

  it("abonnent (subscriber) giver hidden", () => {
    expect(afgoerMortenTilstand(input({ membershipTier: "subscriber" }), NU)).toBe("hidden");
  });

  it("udløbet (expired) giver hidden", () => {
    expect(afgoerMortenTilstand(input({ membershipTier: "expired" }), NU)).toBe("hidden");
  });

  it("manglende companyId giver hidden", () => {
    expect(afgoerMortenTilstand(input({ companyId: null }), NU)).toBe("hidden");
  });

  it("company-data endnu ikke hentet (null) giver hidden", () => {
    expect(afgoerMortenTilstand(input({ company: null }), NU)).toBe("hidden");
  });

  it("contract_end_date i fortiden giver hidden", () => {
    expect(
      afgoerMortenTilstand(
        input({ company: { intro_session_used_at: null, contract_end_date: FORTID } }),
        NU,
      ),
    ).toBe("hidden");
  });

  it("contract_end_date præcis i dag giver hidden — datokolonnen parses som midnat UTC, og sammenligningen er strengt '>', så på selve slutdagen er kontrakten IKKE i fremtiden", () => {
    // Dokumenteret nuværende adfærd: new Date("2026-08-13") = 2026-08-13T00:00:00Z,
    // som hverken er > NU (kl. 12 samme dag) eller > midnat selv.
    const slutdatoIDag = { intro_session_used_at: null, contract_end_date: "2026-08-13" };
    expect(afgoerMortenTilstand(input({ company: slutdatoIDag }), NU)).toBe("hidden");
    const midnat = new Date(Date.UTC(2026, 7, 13, 0, 0, 0));
    expect(afgoerMortenTilstand(input({ company: slutdatoIDag }), midnat)).toBe("hidden");
  });

  it("contract_end_date null giver hidden (ingen dato = ikke i fremtiden)", () => {
    expect(
      afgoerMortenTilstand(
        input({ company: { intro_session_used_at: null, contract_end_date: null } }),
        NU,
      ),
    ).toBe("hidden");
  });
});

describe("afgoerMortenTilstand — de fem synlige tilstande", () => {
  it("book: berettiget og intro ikke brugt", () => {
    expect(afgoerMortenTilstand(input(), NU)).toBe("book");
  });

  it("intro brugt giver ikke book", () => {
    const brugt = { intro_session_used_at: "2026-08-01T10:00:00Z", contract_end_date: FREMTID };
    const ud = afgoerMortenTilstand(input({ company: brugt }), NU);
    expect(ud).not.toBe("book");
    expect(ud).toBe("none"); // ingen booking-række og ikke loading
  });

  it("loading: intro brugt og booking-opslaget henter stadig", () => {
    const brugt = { intro_session_used_at: "2026-08-01T10:00:00Z", contract_end_date: FREMTID };
    expect(
      afgoerMortenTilstand(input({ company: brugt, mortenBookingLoading: true }), NU),
    ).toBe("loading");
  });

  it("none: intro brugt, opslag færdigt, ingen booking-række", () => {
    const brugt = { intro_session_used_at: "2026-08-01T10:00:00Z", contract_end_date: FREMTID };
    expect(afgoerMortenTilstand(input({ company: brugt, mortenBooking: null }), NU)).toBe("none");
  });

  it("booked: bookingens status er 'booked'", () => {
    const brugt = { intro_session_used_at: "2026-08-01T10:00:00Z", contract_end_date: FREMTID };
    expect(
      afgoerMortenTilstand(input({ company: brugt, mortenBooking: { status: "booked" } }), NU),
    ).toBe("booked");
  });

  it("cancelled: bookingens status er 'cancelled'", () => {
    const brugt = { intro_session_used_at: "2026-08-01T10:00:00Z", contract_end_date: FREMTID };
    expect(
      afgoerMortenTilstand(input({ company: brugt, mortenBooking: { status: "cancelled" } }), NU),
    ).toBe("cancelled");
  });

  it("link-ready: bookingens status er 'booking_sent'", () => {
    const brugt = { intro_session_used_at: "2026-08-01T10:00:00Z", contract_end_date: FREMTID };
    expect(
      afgoerMortenTilstand(
        input({ company: brugt, mortenBooking: { status: "booking_sent" } }),
        NU,
      ),
    ).toBe("link-ready");
  });

  it("link-ready er fallback for enhver anden status end booked/cancelled — dokumenteret nuværende adfærd, ikke et ønske", () => {
    const brugt = { intro_session_used_at: "2026-08-01T10:00:00Z", contract_end_date: FREMTID };
    expect(
      afgoerMortenTilstand(input({ company: brugt, mortenBooking: { status: "pending" } }), NU),
    ).toBe("link-ready");
  });
});

describe("visMortenKolonne", () => {
  it("falsk for hidden og none", () => {
    expect(visMortenKolonne("hidden")).toBe(false);
    expect(visMortenKolonne("none")).toBe(false);
  });

  it("sand for de fem andre tilstande", () => {
    const synlige: MortenTilstand[] = ["book", "loading", "booked", "cancelled", "link-ready"];
    for (const tilstand of synlige) {
      expect(visMortenKolonne(tilstand)).toBe(true);
    }
  });
});
