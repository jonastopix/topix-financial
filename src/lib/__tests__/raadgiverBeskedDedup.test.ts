import { describe, expect, it } from "vitest";
import { type EksisterendeRaekke, raadgivereUdenRaekke } from "../../../supabase/functions/_shared/raadgiverBeskedTekst.ts";

/**
 * skrivRaadgiverBesked's dedup som ren dom (raadgivereUdenRaekke — writeren
 * læser read_at med og giver dedupKunUlaeste videre; klokkeCommunitySvar.guard
 * dom 5 låser koblingen). Jonas 21/9: standard = pr. rådgiver, uanset read_at
 * (uændret for alle kaldere); kunUlaeste = kun ulæste rækker spærrer — én ULÆST
 * klokke pr. tråd pr. rådgiver, og efter læsning giver næste svar en ny.
 * Rækkerne herunder er, hvad writeren ville have skrevet svar for svar.
 */
const JONAS = "11111111-1111-4111-8111-111111111111";
const MORTEN = "22222222-2222-4222-8222-222222222222";
const TRAAD = "33333333-3333-4333-8333-333333333333";
const R = (advisor_id: string, read_at: string | null = null): EksisterendeRaekke => ({ advisor_id, reference_id: TRAAD, title: "Anna har svaret i «X»", read_at });
const svar = { title: "Bo har svaret i «X»", reference_id: TRAAD };

describe("raadgivereUdenRaekke — kunUlaeste (community_svar)", () => {
  it("to svar før læsning = én ulæst klokke pr. rådgiver: første svar skriver til begge, andet svar til ingen", () => {
    expect(raadgivereUdenRaekke([JONAS, MORTEN], [], svar, true)).toEqual([JONAS, MORTEN]);
    const efterFoerste = [R(JONAS), R(MORTEN)];
    expect(raadgivereUdenRaekke([JONAS, MORTEN], efterFoerste, svar, true)).toEqual([]);
  });
  it("læst hos Jonas, ulæst hos Morten → nyt svar giver Jonas en ny, Morten ingen", () => {
    const rows = [R(JONAS, "2026-09-21T12:00:00Z"), R(MORTEN)];
    expect(raadgivereUdenRaekke([JONAS, MORTEN], rows, svar, true)).toEqual([JONAS]);
    // Og efter den nye (ulæst) hos Jonas: begge spærret igen.
    expect(raadgivereUdenRaekke([JONAS, MORTEN], [...rows, R(JONAS)], svar, true)).toEqual([]);
  });
  it("STANDARD (flaget udeladt eller falsk) er uændret: en læst række spærrer stadig — pr. rådgiver; fælles rækker tæller ikke", () => {
    const rows = [R(JONAS, "2026-09-21T12:00:00Z"), R(MORTEN)];
    expect(raadgivereUdenRaekke([JONAS, MORTEN], rows, svar)).toEqual([]);
    expect(raadgivereUdenRaekke([JONAS, MORTEN], rows, svar, false)).toEqual([]);
    expect(raadgivereUdenRaekke([JONAS, MORTEN], [{ advisor_id: null, reference_id: TRAAD, title: "x", read_at: null }], svar, true)).toEqual([JONAS, MORTEN]);
    // Uden reference_id dedup'es på titlen — og kunUlaeste gælder også dér.
    const drift = { title: "Driften: x" };
    expect(raadgivereUdenRaekke([JONAS], [{ advisor_id: JONAS, reference_id: null, title: "Driften: x", read_at: "2026-09-21T12:00:00Z" }], drift)).toEqual([]);
    expect(raadgivereUdenRaekke([JONAS], [{ advisor_id: JONAS, reference_id: null, title: "Driften: x", read_at: "2026-09-21T12:00:00Z" }], drift, true)).toEqual([JONAS]);
    // Rækker uden read_at-feltet (ældre kaldere af den rene dom) spærrer som før.
    expect(raadgivereUdenRaekke([JONAS], [{ advisor_id: JONAS, reference_id: TRAAD, title: "x" }], svar, true)).toEqual([]);
  });
});
