import { describe, expect, it } from "vitest";
import { ALLE_TRIN_HAR_ORD, danskDato, danskDatoOrd, danskTidspunkt, erPaaPause, fornavnAf, GRUPPE_ORD, gruppeFor, grupperEfterTrin, grupperTilListe, hvadVenter, LISTE_RAEKKEFOELGE, LISTEGRUPPER, listeOverskrift, LUKKEAARSAG_ORD, taelVentende, TRIN_ORD, ventetid, venterPaaMenneske, virksomhedsnavnAf } from "@/lib/ansoegninger/ansoegningVisning";
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
    const nu = new Date("2026-09-25T10:00:00Z");
    expect(venterPaaMenneske("ny", null, nu)).toBe(true);
    expect(venterPaaMenneske("afholdt", null, nu)).toBe(true);
    expect(venterPaaMenneske("indkaldt", null, nu)).toBe(false);
    for (const g of LISTEGRUPPER) expect(GRUPPE_ORD[g]).toBeTruthy();
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

describe("ansoegningVisning — pausen (Jonas 18/9) og listens grupper", () => {
  const nu = new Date("2026-09-25T10:00:00Z"); // 25/9 dansk
  it("erPaaPause: kun en dato EFTER i dag (dansk); på dagen og før er pausen slut; venterPaaMenneske følger den", () => {
    expect(danskDato(nu)).toBe("2026-09-25");
    expect(erPaaPause("2026-12-10", nu)).toBe(true);
    expect(erPaaPause("2026-09-26", nu)).toBe(true);
    expect(erPaaPause("2026-09-25", nu)).toBe(false);
    expect(erPaaPause("2026-09-10", nu)).toBe(false);
    expect(erPaaPause(null, nu)).toBe(false);
    expect(venterPaaMenneske("afholdt", "2026-12-10", nu)).toBe(false);
    expect(venterPaaMenneske("afholdt", "2026-09-25", nu)).toBe(true);
    // 10/12 kl. 00:30 dansk = 9/12 23:30 UTC → ikke længere på pause
    expect(erPaaPause("2026-12-10", new Date("2026-12-09T23:30:00Z"))).toBe(false);
    expect(erPaaPause("2026-12-10", new Date("2026-12-09T21:00:00Z"))).toBe(true);
  });

  it("grupperTilListe: afholdt → ny → booket → indkaldt → aftalegrundlag → underskrevet → på pause → lukket; pausen vinder over trinnet; tomme udeladt", () => {
    const r = (id: string, trin: Parameters<typeof gruppeFor>[0]["trin"], trin_sat_at: string, paa_pause_til: string | null = null) => ({ id, trin, trin_sat_at, paa_pause_til });
    const rk = [
      r("l1", "lukket", "2026-09-01"), r("n1", "ny", "2026-09-10"), r("a1", "afholdt", "2026-09-12"), r("n2", "ny", "2026-09-15"),
      r("p1", "afholdt", "2026-09-10", "2026-12-10"), r("p2", "afholdt", "2026-09-11", "2026-11-01"), r("i1", "indkaldt", "2026-09-14"), r("b1", "booket", "2026-09-13"),
      r("a2", "afholdt", "2026-09-05", "2026-09-10"), // pause passeret → afholdt igen
    ];
    const g = grupperTilListe(rk, nu);
    expect(g.map((x) => x.gruppe)).toEqual(["afholdt", "ny", "booket", "indkaldt", "paa_pause", "lukket"]);
    // «blev medlem» (18/9 aften): underskrevet + virksomhedens slutdato → egen gruppe før lukket; uden slutdato → underskrevet
    const m = grupperTilListe([...rk, { ...r("u1", "underskrevet", "2026-09-16"), virksomhed_slutdato: "2027-09-16" }, r("u2", "underskrevet", "2026-09-17")], nu);
    expect(m.map((x) => x.gruppe)).toEqual(["afholdt", "ny", "booket", "indkaldt", "underskrevet", "paa_pause", "blev_medlem", "lukket"]);
    expect(m.find((x) => x.gruppe === "blev_medlem")!.raekker.map((x) => x.id)).toEqual(["u1"]);
    expect(m.find((x) => x.gruppe === "underskrevet")!.raekker.map((x) => x.id)).toEqual(["u2"]);
    expect(gruppeFor({ ...r("u3", "underskrevet", "2026-09-16", "2026-12-10"), virksomhed_slutdato: "2026-01-01" }, nu)).toBe("blev_medlem"); // betalt vinder over pausen — også en passeret slutdato: de BLEV medlem
    expect(LISTEGRUPPER).toEqual(["afholdt", "ny", "booket", "indkaldt", "aftalegrundlag_sendt", "underskrevet", "paa_pause", "blev_medlem", "lukket"]);
    expect(g[0].raekker.map((x) => x.id)).toEqual(["a1", "a2"]);
    expect(g[1].raekker.map((x) => x.id)).toEqual(["n2", "n1"]);
    expect(g[4].raekker.map((x) => x.id)).toEqual(["p2", "p1"]); // tidligste slutdato først
    expect(gruppeFor(r("x", "lukket", "2026-09-01", "2026-12-10"), nu)).toBe("lukket"); // lukket er lukket, også med en pausedato
    expect(taelVentende(rk, nu)).toBe(4); // a1, a2, n1, n2 — ikke p1/p2
  });

  it("overskriften tæller kun det der venter; ellers noget roligt", () => {
    expect(listeOverskrift(0, false)).toBe("Ansøgningerne");
    expect(listeOverskrift(0, true)).toBe("Ingen venter på jer lige nu.");
    expect(listeOverskrift(1, true)).toBe("Én venter på jeres beslutning.");
    expect(listeOverskrift(4, true)).toBe("4 venter på jeres beslutning.");
  });

  it("hvadVenter: kort, aldrig fritekst", () => {
    const b = { paa_pause_til: null, lukkeaarsag: null, rykkere_sendt: 0, samtale_start: null };
    expect(hvadVenter({ ...b, trin: "ny" }, nu)).toBe("tal med dem eller afvis?");
    expect(hvadVenter({ ...b, trin: "afholdt" }, nu)).toBe("tilbud eller afslag?");
    expect(hvadVenter({ ...b, trin: "afholdt", paa_pause_til: "2026-12-10" }, nu)).toBe("på pause til 10. december");
    expect(hvadVenter({ ...b, trin: "indkaldt", rykkere_sendt: 2 }, nu)).toBe("rykker 2 sendt");
    expect(hvadVenter({ ...b, trin: "indkaldt" }, nu)).toBe("indkaldelse sendt");
    expect(hvadVenter({ ...b, trin: "booket", samtale_start: "2026-09-28T07:00:00Z" }, nu)).toMatch(/^samtale 28\. september/);
    expect(hvadVenter({ ...b, trin: "lukket", lukkeaarsag: "svarer_ikke" }, nu)).toBe("svarede ikke");
    expect(hvadVenter({ ...b, trin: "underskrevet" }, nu)).toBe("venter på betaling");
    expect(hvadVenter({ ...b, trin: "underskrevet", virksomhed_slutdato: "2027-09-16" }, nu)).toBe("blev medlem · medlemskab til 16. september");
    expect(hvadVenter({ ...b, trin: "lukket", lukkeaarsag: "betalte_ikke" }, nu)).toBe("betalte ikke — lukket dag 60 efter underskriften");
    expect(danskDatoOrd("2026-12-10")).toBe("10. december");
  });
});
