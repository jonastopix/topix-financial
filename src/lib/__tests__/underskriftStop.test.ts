import { describe, expect, it } from "vitest";
import { afgoerUnderskriftStop, beskrivVirksomheder } from "../../../supabase/functions/_shared/underskriftStop.ts";

// Pengekæden (C's recon 18/9, §4 + §8 pkt. 2 og 4): stop FØR aftalen sendes.
const V = { id: "c1", name: "Nordic Byg ApS", status: "active", contract_end_date: "2027-03-01" };
const W = { id: "c2", name: "Gammel ApS", status: "tidligere", contract_end_date: null };

describe("afgoerUnderskriftStop", () => {
  it("intet kendt → ingen stop", () => {
    expect(afgoerUnderskriftStop({ paaCvr: [], paaMail: [], bekraeftNyVirksomhed: false })).toEqual({ stop: null });
  });
  it("CVR findes som virksomhed → stop, ALDRIG til at bekræfte væk — heller ikke med flaget", () => {
    expect(afgoerUnderskriftStop({ paaCvr: [V], paaMail: [], bekraeftNyVirksomhed: false })).toEqual({ stop: "cvr_findes_som_virksomhed", virksomheder: [V], kanBekraeftes: false });
    expect(afgoerUnderskriftStop({ paaCvr: [V], paaMail: [V], bekraeftNyVirksomhed: true }).stop).toBe("cvr_findes_som_virksomhed");
  });
  it("mailen er kontakt på en virksomhed → stop der KAN bekræftes; med flaget → ingen stop (det bevidste valg)", () => {
    expect(afgoerUnderskriftStop({ paaCvr: [], paaMail: [W], bekraeftNyVirksomhed: false })).toEqual({ stop: "mail_findes_som_kontakt", virksomheder: [W], kanBekraeftes: true });
    expect(afgoerUnderskriftStop({ paaCvr: [], paaMail: [W], bekraeftNyVirksomhed: true })).toEqual({ stop: null });
  });
  it("beskrivVirksomheder: navn, status, kontrakt — uden kontrakt udelades den", () => {
    expect(beskrivVirksomheder([V, W])).toBe("«Nordic Byg ApS» (active, kontrakt til 2027-03-01); «Gammel ApS» (tidligere)");
  });
});
