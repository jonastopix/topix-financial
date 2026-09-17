import { describe, expect, it } from "vitest";
import {
  INGEN_SESSIONER_TEKST,
  SESSIONER_OVERSKRIFT,
  SESSIONER_VINDUE_EFTER_MS,
  SESSIONER_VINDUE_FOER_MS,
  UKENDT_VIRKSOMHED,
  dagensSessioner,
  klokkenKbh,
  sessionLinjeTekst,
  type SessionBooking,
} from "@/lib/hjemmebane/dagensSessioner";

/* «Sessioner i dag» (17/9, PR 2): bookede sessioner med start på dagens
   DANSKE dato, sorteret på starttid. `nu` er 17/9-2026 kl. 09:00 dansk
   (07:00 UTC, sommertid UTC+2). */

const NU = new Date("2026-09-17T07:00:00Z");
const b = (id: string, start_tid: string | null, over: Partial<SessionBooking> = {}): SessionBooking => ({
  id,
  company_id: `c-${id}`,
  advisor: "morten",
  status: "booked",
  start_tid,
  slut_tid: null,
  ...over,
});
const v = (id: string) => ({ id: `c-${id}`, name: `Firma ${id}` });

describe("dagensSessioner — hvem er med", () => {
  it("bookede sessioner på dagens danske dato, sorteret på starttid; navn fra virksomhederne; rådgiveren med stort", () => {
    const r = dagensSessioner({
      bookinger: [b("b", "2026-09-17T12:00:00Z"), b("a", "2026-09-17T08:00:00Z", { advisor: "jonas" })],
      virksomheder: [v("a"), v("b")],
      nu: NU,
    });
    expect(r.map((s) => [s.klokken, s.navn, s.raadgiver])).toEqual([["10:00", "Firma a", "Jonas"], ["14:00", "Firma b", "Morten"]]);
    expect(sessionLinjeTekst(r[0])).toBe("10:00 Firma a · Jonas");
  });
  it("dansk dato: 22:30 UTC i går er i dag i Danmark (00:30); 22:30 UTC i dag er i morgen — ikke med", () => {
    const r = dagensSessioner({
      bookinger: [b("igaar-sent", "2026-09-16T22:30:00Z"), b("idag-sent", "2026-09-17T22:30:00Z")],
      virksomheder: [v("igaar-sent"), v("idag-sent")],
      nu: NU,
    });
    expect(r.map((s) => s.id)).toEqual(["igaar-sent"]);
    expect(r[0].klokken).toBe("00:30");
  });
  it("kun status booked: pending/paid/booking_sent/cancelled/refunded er ikke aftaler med en tid", () => {
    const r = dagensSessioner({
      bookinger: ["pending", "paid", "booking_sent", "cancelled", "refunded"].map((status) => b(status, "2026-09-17T08:00:00Z", { status })),
      virksomheder: [],
      nu: NU,
    });
    expect(r).toEqual([]);
  });
  it("uden start_tid eller med ulæselig tid: ikke med; uden virksomhedsnavn: «Ukendt virksomhed» (ikke udeladt); ukendt rådgiver: null", () => {
    const r = dagensSessioner({
      bookinger: [b("x", null), b("y", "ikke en dato"), b("z", "2026-09-17T09:00:00Z", { company_id: null, advisor: "ukendt" })],
      virksomheder: [],
      nu: NU,
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "z", companyId: null, navn: UKENDT_VIRKSOMHED, raadgiver: null, klokken: "11:00" });
    expect(sessionLinjeTekst(r[0])).toBe("11:00 Ukendt virksomhed");
  });
  it("ordene og vinduet", () => {
    expect(SESSIONER_OVERSKRIFT).toBe("Sessioner i dag");
    expect(INGEN_SESSIONER_TEKST).toBe("Ingen sessioner i dag.");
    expect(klokkenKbh(new Date("2026-01-17T08:05:00Z"))).toBe("09:05"); // vintertid
    expect(SESSIONER_VINDUE_FOER_MS).toBe(24 * 60 * 60 * 1000);
    expect(SESSIONER_VINDUE_EFTER_MS).toBe(2 * 24 * 60 * 60 * 1000);
  });
});
