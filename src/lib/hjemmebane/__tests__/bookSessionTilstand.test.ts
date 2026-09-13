import { describe, expect, it } from "vitest";
import {
  afgoerBookSession,
  afgoerMortenTilstand,
  visMortenKolonne,
  type BookSessionInput,
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

// ── Begge rettigheder (13/9) ──────────────────────────────────────────────
//
// Medlemskabet indeholder én session med hver rådgiver (Jonas 13/9). Jonas'
// kort er ALTID til stede: inkluderet indtil retten er brugt, derefter købt.
// Mortens forsvinder som i dag. Altså altid præcis to kort, indtil Mortens er
// brugt — så ét.

const begge = (overrides: Partial<BookSessionInput> = {}): BookSessionInput => ({
  isAdvisor: false,
  membershipTier: "full",
  companyId: "c-1",
  company: { intro_session_used_at: null, jonas_session_used_at: null, contract_end_date: FREMTID },
  inkluderedeLoading: false,
  mortenBooking: null,
  jonasBooking: null,
  ...overrides,
});
const BRUGT = "2026-08-01T10:00:00Z";

describe("afgoerBookSession — Mortens dom er uændret og uafhængig af Jonas' ret", () => {
  it("nyt medlem: begge kort er 'book' — to kort", () => {
    expect(afgoerBookSession(begge(), NU)).toEqual({ morten: "book", jonas: { kort: "inkluderet", tilstand: "book" } });
  });

  it("Mortens tilstande følger afgoerMortenTilstand præcis, uanset Jonas' ret", () => {
    const c = (intro: string | null) => ({ intro_session_used_at: intro, jonas_session_used_at: BRUGT, contract_end_date: FREMTID });
    expect(afgoerBookSession(begge({ company: c(null) }), NU).morten).toBe("book");
    expect(afgoerBookSession(begge({ company: c(BRUGT), inkluderedeLoading: true }), NU).morten).toBe("loading");
    expect(afgoerBookSession(begge({ company: c(BRUGT) }), NU).morten).toBe("none");
    expect(afgoerBookSession(begge({ company: c(BRUGT), mortenBooking: { status: "booking_sent" } }), NU).morten).toBe("link-ready");
    expect(afgoerBookSession(begge({ company: c(BRUGT), mortenBooking: { status: "booked" } }), NU).morten).toBe("booked");
    expect(afgoerBookSession(begge({ company: c(BRUGT), mortenBooking: { status: "cancelled" } }), NU).morten).toBe("cancelled");
    expect(afgoerBookSession(begge({ isAdvisor: true }), NU).morten).toBe("hidden");
  });

  it("de to domme er samme maskine: afgoerMortenTilstand og afgoerBookSession().morten er enige på hele matricen", () => {
    const retter = [null, BRUGT];
    const bookinger = [null, { status: "booking_sent" }, { status: "booked" }, { status: "cancelled" }, { status: "pending" }];
    for (const ret of retter) for (const loading of [false, true]) for (const booking of bookinger) for (const isAdvisor of [false, true]) {
      const company = { intro_session_used_at: ret, jonas_session_used_at: null, contract_end_date: FREMTID };
      const gammel = afgoerMortenTilstand(input({ isAdvisor, company, mortenBookingLoading: loading, mortenBooking: booking }), NU);
      const ny = afgoerBookSession(begge({ isAdvisor, company, inkluderedeLoading: loading, mortenBooking: booking }), NU).morten;
      expect(ny).toBe(gammel);
    }
  });
});

describe("afgoerBookSession — Jonas-kortets to ansigter", () => {
  const c = (jonas: string | null) => ({ intro_session_used_at: null, jonas_session_used_at: jonas, contract_end_date: FREMTID });

  it("retten ikke brugt → inkluderet/book", () => {
    expect(afgoerBookSession(begge({ company: c(null) }), NU).jonas).toEqual({ kort: "inkluderet", tilstand: "book" });
  });

  it("retten brugt, opslaget henter → inkluderet/loading (det købte kort blinker ikke op)", () => {
    expect(afgoerBookSession(begge({ company: c(BRUGT), inkluderedeLoading: true }), NU).jonas).toEqual({ kort: "inkluderet", tilstand: "loading" });
  });

  it("retten brugt, linket sendt men tiden ikke valgt → inkluderet/link-ready (linket vises kun her)", () => {
    expect(afgoerBookSession(begge({ company: c(BRUGT), jonasBooking: { status: "booking_sent" } }), NU).jonas).toEqual({ kort: "inkluderet", tilstand: "link-ready" });
    // Enhver anden status end booked/cancelled er link-ready — som Mortens.
    expect(afgoerBookSession(begge({ company: c(BRUGT), jonasBooking: { status: "pending" } }), NU).jonas).toEqual({ kort: "inkluderet", tilstand: "link-ready" });
  });

  it("retten brugt og tiden valgt (booked) → købt: «derefter skal boksen skifte til den betalte»", () => {
    expect(afgoerBookSession(begge({ company: c(BRUGT), jonasBooking: { status: "booked" } }), NU).jonas).toEqual({ kort: "koebt" });
  });

  it("retten brugt og aflyst → købt (invitee-aflysning: retten forbliver brugt; host-aflysning nulstiller retten og giver book igen)", () => {
    expect(afgoerBookSession(begge({ company: c(BRUGT), jonasBooking: { status: "cancelled" } }), NU).jonas).toEqual({ kort: "koebt" });
    expect(afgoerBookSession(begge({ company: c(null), jonasBooking: { status: "cancelled" } }), NU).jonas).toEqual({ kort: "inkluderet", tilstand: "book" });
  });

  it("retten brugt uden række (sat i hånden af admin) → købt", () => {
    expect(afgoerBookSession(begge({ company: c(BRUGT), jonasBooking: null }), NU).jonas).toEqual({ kort: "koebt" });
  });

  it("ikke berettiget (rådgiver, abonnent, udløbet, kontrakt i fortiden, ingen virksomhed) → købt — som det ubetingede Jonas-kort i dag", () => {
    expect(afgoerBookSession(begge({ isAdvisor: true }), NU).jonas).toEqual({ kort: "koebt" });
    expect(afgoerBookSession(begge({ membershipTier: "subscriber" }), NU).jonas).toEqual({ kort: "koebt" });
    expect(afgoerBookSession(begge({ membershipTier: "expired" }), NU).jonas).toEqual({ kort: "koebt" });
    expect(afgoerBookSession(begge({ company: { intro_session_used_at: null, jonas_session_used_at: null, contract_end_date: FORTID } }), NU).jonas).toEqual({ kort: "koebt" });
    expect(afgoerBookSession(begge({ company: { intro_session_used_at: null, jonas_session_used_at: null, contract_end_date: null } }), NU).jonas).toEqual({ kort: "koebt" });
    expect(afgoerBookSession(begge({ companyId: null, company: null }), NU).jonas).toEqual({ kort: "koebt" });
  });

  it("fuldt medlem med virksomhed, men company-rækken er ikke hentet endnu → inkluderet/loading, ikke et blink af det købte", () => {
    expect(afgoerBookSession(begge({ company: null }), NU).jonas).toEqual({ kort: "inkluderet", tilstand: "loading" });
    // Rådgivere og abonnenter venter ikke: de får det købte kort med det samme.
    expect(afgoerBookSession(begge({ company: null, isAdvisor: true }), NU).jonas).toEqual({ kort: "koebt" });
    expect(afgoerBookSession(begge({ company: null, membershipTier: "subscriber" }), NU).jonas).toEqual({ kort: "koebt" });
  });

  it("Jonas' ret er uafhængig af Mortens: Mortens brugt ændrer intet for Jonas, og omvendt", () => {
    const mortenBrugt = { intro_session_used_at: BRUGT, jonas_session_used_at: null, contract_end_date: FREMTID };
    const ud = afgoerBookSession(begge({ company: mortenBrugt }), NU);
    expect(ud.morten).toBe("none");
    expect(ud.jonas).toEqual({ kort: "inkluderet", tilstand: "book" });
    const jonasBrugt = { intro_session_used_at: null, jonas_session_used_at: BRUGT, contract_end_date: FREMTID };
    const ud2 = afgoerBookSession(begge({ company: jonasBrugt }), NU);
    expect(ud2.morten).toBe("book");
    expect(ud2.jonas).toEqual({ kort: "koebt" });
  });
});

describe("afgoerBookSession — antal kort: to indtil Mortens er brugt, så ét", () => {
  const antal = (t: ReturnType<typeof afgoerBookSession>) => (visMortenKolonne(t.morten) ? 2 : 1);

  it("nyt medlem: to kort", () => {
    expect(antal(afgoerBookSession(begge(), NU))).toBe(2);
  });
  it("Jonas' ret brugt (og booket) — stadig to kort: Jonas-kortet skifter, det forsvinder ikke", () => {
    const c = { intro_session_used_at: null, jonas_session_used_at: BRUGT, contract_end_date: FREMTID };
    expect(antal(afgoerBookSession(begge({ company: c, jonasBooking: { status: "booked" } }), NU))).toBe(2);
  });
  it("Mortens ret brugt uden række: ét kort — Jonas', som er det købte når hans ret også er brugt", () => {
    const c = { intro_session_used_at: BRUGT, jonas_session_used_at: BRUGT, contract_end_date: FREMTID };
    const t = afgoerBookSession(begge({ company: c }), NU);
    expect(antal(t)).toBe(1);
    expect(t.jonas).toEqual({ kort: "koebt" });
  });
  it("rådgiver: ét kort — det købte", () => {
    const t = afgoerBookSession(begge({ isAdvisor: true }), NU);
    expect(antal(t)).toBe(1);
    expect(t.jonas).toEqual({ kort: "koebt" });
  });
});
