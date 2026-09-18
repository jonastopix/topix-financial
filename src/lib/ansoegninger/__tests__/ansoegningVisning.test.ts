import { describe, expect, it } from "vitest";
import { ALLE_TRIN_HAR_ORD, danskTidspunkt, fornavnAf, grupperEfterTrin, LISTE_RAEKKEFOELGE, LUKKEAARSAG_ORD, TRIN_ORD, ventetid, venterPaaMenneske, virksomhedsnavnAf } from "@/lib/ansoegninger/ansoegningVisning";
import { LUKKEAARSAGER, TRIN } from "@/lib/ansoegningTrin";

describe("ansoegningVisning — navn, ord, ventetid, grupper", () => {
  it("virksomhedsnavnAf: CVR-registrets navn, så ansøgerens, så mailen — aldrig tomt (som motoren)", () => {
    expect(virksomhedsnavnAf({ cvr_opslag: { navn: " Nordic Byg ApS " }, navn: "Lisbeth", email: "l@x.dk" })).toBe("Nordic Byg ApS");
    expect(virksomhedsnavnAf({ cvr_opslag: null, navn: "Lisbeth Hansen", email: "l@x.dk" })).toBe("Lisbeth Hansens virksomhed");
    expect(virksomhedsnavnAf({ cvr_opslag: {}, navn: "  ", email: "l@x.dk" })).toBe("l@x.dk");
    expect(virksomhedsnavnAf({ cvr_opslag: null, navn: null, email: null })).toBe("Ukendt virksomhed");
    expect(fornavnAf("Morten Larsen Hansen")).toBe("Morten");
    expect(fornavnAf("  ")).toBeNull();
  });

  it("alle syv trin og alle syv lukkeårsager har et ord; de to beslutningstrin står først i listen", () => {
    expect(ALLE_TRIN_HAR_ORD).toBe(true);
    for (const t of TRIN) expect(TRIN_ORD[t]).toBeTruthy();
    for (const l of LUKKEAARSAGER) expect(LUKKEAARSAG_ORD[l]).toBeTruthy();
    expect(LISTE_RAEKKEFOELGE.slice(0, 2)).toEqual(["ny", "afholdt"]);
    expect([...LISTE_RAEKKEFOELGE].sort()).toEqual([...TRIN].sort());
    expect(venterPaaMenneske("ny")).toBe(true);
    expect(venterPaaMenneske("afholdt")).toBe(true);
    expect(venterPaaMenneske("indkaldt")).toBe(false);
  });

  it("ventetid: i dag · i går · for N dage siden · for N uger siden; ulæselig → tom", () => {
    const nu = new Date("2026-09-25T12:00:00Z");
    expect(ventetid("2026-09-25T09:00:00Z", nu)).toBe("i dag");
    expect(ventetid("2026-09-24T09:00:00Z", nu)).toBe("i går");
    expect(ventetid("2026-09-20T09:00:00Z", nu)).toBe("for 5 dage siden");
    expect(ventetid("2026-09-01T09:00:00Z", nu)).toBe("for 3 uger siden");
    expect(ventetid("nix", nu)).toBe("");
  });

  it("danskTidspunkt er dansk tid med måned i ord", () => {
    expect(danskTidspunkt("2026-09-18T08:05:00Z")).toMatch(/18\. september/);
    expect(danskTidspunkt("2026-09-18T08:05:00Z")).toMatch(/10[.:]05/);
    expect(danskTidspunkt(null)).toBe("");
  });

  it("grupperEfterTrin: beslutningstrinnene først, nyeste først i hver gruppe, tomme grupper udeladt", () => {
    const r = (id: string, trin: "ny" | "afholdt" | "lukket", trin_sat_at: string) => ({ id, trin, trin_sat_at });
    const g = grupperEfterTrin([r("a", "lukket", "2026-09-01"), r("b", "ny", "2026-09-10"), r("c", "afholdt", "2026-09-12"), r("d", "ny", "2026-09-15")]);
    expect(g.map((x) => x.trin)).toEqual(["ny", "afholdt", "lukket"]);
    expect(g[0].raekker.map((x) => x.id)).toEqual(["d", "b"]);
  });
});
