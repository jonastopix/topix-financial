/**
 * De tre svargrupper på et event (udkast 21/9): dommen er ren og læses
 * direkte fra Deno-siden. Kanterne: afmeldt, afbud trukket tilbage, legat,
 * rådgiver, udløbet medlemskab, slutdagen.
 */
import { describe, expect, it } from "vitest";
import { delModtagere, doemSvargruppe, harAdgangEfterRls, SVARGRUPPER, taelGrupper } from "../../../supabase/functions/_shared/eventSvar.ts";

const NU = new Date("2026-09-21T12:00:00Z");
const aktiv = { is_legat: false, contract_end_date: "2026-12-31" };

describe("harAdgangEfterRls — events-RLS'ens regel (har_aktivt_medlemskab)", () => {
  it("aktivt medlemskab med slutdato i fremtiden: adgang", () => expect(harAdgangEfterRls([aktiv], NU)).toBe(true));
  it("legat: ingen adgang, uanset slutdato", () => expect(harAdgangEfterRls([{ ...aktiv, is_legat: true }], NU)).toBe(false));
  it("ingen slutdato (NULL): ingen adgang — fail-closed, modsat is_membership_active", () => expect(harAdgangEfterRls([{ ...aktiv, contract_end_date: null }], NU)).toBe(false));
  it("udløbet medlemskab: ingen adgang", () => expect(harAdgangEfterRls([{ ...aktiv, contract_end_date: "2026-09-01" }], NU)).toBe(false));
  it("slutdagen tæller med: slutdato = i dag giver adgang; i går giver ikke", () => {
    expect(harAdgangEfterRls([{ ...aktiv, contract_end_date: "2026-09-21" }], NU)).toBe(true);
    expect(harAdgangEfterRls([{ ...aktiv, contract_end_date: "2026-09-20" }], NU)).toBe(false);
  });
  it("ingen virksomheder: ingen adgang", () => expect(harAdgangEfterRls([], NU)).toBe(false));
  it("én aktiv blandt flere: adgang", () => expect(harAdgangEfterRls([{ ...aktiv, is_legat: true }, aktiv], NU)).toBe(true));
});

describe("doemSvargruppe — én person, én gruppe (eller ingen)", () => {
  const medAdgang = { erRaadgiver: false, harAdgang: true };
  it("tilmeldt: aktiv række med attending", () => {
    expect(doemSvargruppe({ ...medAdgang, raekke: { response: "attending", cancelled_at: null } })).toBe("tilmeldt");
  });
  it("kan ikke: aktiv række med declined", () => {
    expect(doemSvargruppe({ ...medAdgang, raekke: { response: "declined", cancelled_at: null } })).toBe("kan_ikke");
  });
  it("har ikke svaret: ingen række", () => {
    expect(doemSvargruppe({ ...medAdgang, raekke: null })).toBe("har_ikke_svaret");
  });
  it("afmeldt (cancelled_at sat på en attending-række): har ikke svaret", () => {
    expect(doemSvargruppe({ ...medAdgang, raekke: { response: "attending", cancelled_at: "2026-09-20T10:00:00Z" } })).toBe("har_ikke_svaret");
  });
  it("afbud trukket tilbage (cancelled_at sat på en declined-række): har ikke svaret", () => {
    expect(doemSvargruppe({ ...medAdgang, raekke: { response: "declined", cancelled_at: "2026-09-20T10:00:00Z" } })).toBe("har_ikke_svaret");
  });
  it("rådgiver: tæller aldrig — heller ikke som tilmeldt", () => {
    expect(doemSvargruppe({ erRaadgiver: true, harAdgang: true, raekke: { response: "attending", cancelled_at: null } })).toBeNull();
    expect(doemSvargruppe({ erRaadgiver: true, harAdgang: true, raekke: null })).toBeNull();
  });
  it("uden adgang (udløbet, legat): tæller ikke — heller ikke en gammel tilmelding", () => {
    expect(doemSvargruppe({ erRaadgiver: false, harAdgang: false, raekke: { response: "attending", cancelled_at: null } })).toBeNull();
    expect(doemSvargruppe({ erRaadgiver: false, harAdgang: false, raekke: null })).toBeNull();
  });
});

describe("taelGrupper og delModtagere — tekst A til de tilmeldte, tekst B til de andre", () => {
  const raekker = [
    { user_id: "a", gruppe: "tilmeldt" as const },
    { user_id: "b", gruppe: "kan_ikke" as const },
    { user_id: "c", gruppe: "har_ikke_svaret" as const },
    { user_id: "d", gruppe: "har_ikke_svaret" as const },
  ];
  it("tre grupper, i den rækkefølge fladen viser dem", () => expect(SVARGRUPPER).toEqual(["tilmeldt", "kan_ikke", "har_ikke_svaret"]));
  it("tæller pr. gruppe, nul for tomme", () => {
    expect(taelGrupper(raekker)).toEqual({ tilmeldt: 1, kan_ikke: 1, har_ikke_svaret: 2 });
    expect(taelGrupper([])).toEqual({ tilmeldt: 0, kan_ikke: 0, har_ikke_svaret: 0 });
  });
  it("deler i tilmeldte (A) og andre (B); én person står ét sted", () => {
    expect(delModtagere(raekker)).toEqual({ tilmeldte: ["a"], andre: ["b", "c", "d"] });
    // Skulle samme id stå to gange (to medlemskaber), vinder «tilmeldt», og id'et står kun én gang.
    expect(delModtagere([...raekker, { user_id: "a", gruppe: "har_ikke_svaret" }])).toEqual({ tilmeldte: ["a"], andre: ["b", "c", "d"] });
  });
  it("en ukendt gruppe-værdi fra basen tæller ingen steder", () => {
    expect(delModtagere([{ user_id: "x", gruppe: "spoegelse" as never }])).toEqual({ tilmeldte: [], andre: [] });
  });
});
