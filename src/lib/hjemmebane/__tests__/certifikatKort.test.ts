import { describe, expect, it } from "vitest";
import { certifikatDom, type CertifikatInput } from "@/lib/certifikat/dom";
import { CERTIFIKAT_KORT, certifikatKort, laastLinje, omDage } from "@/lib/hjemmebane/certifikatKort";

// Kortet læser HUSETS dom — tiden gives ind til dommen (certifikatDom(input, nu)).
const medlem = (kontraktStart: string | null, over: Partial<CertifikatInput> = {}): CertifikatInput => ({
  isAdvisor: false, membershipTier: "full", eligible: true, kontraktStart, ...over,
});
const kort = (input: CertifikatInput, nu: Date) => certifikatKort({ loading: false, fejl: null, dom: certifikatDom(input, nu) });

describe("certifikatKort — låst med nedtælling", () => {
  // Start 22/10-2025 → 12 mdr. 22/10-2026 → åbner 15/10-2026 (7 dage før).
  it("enkelt eksempel: 2/10-2026 kl. 12 dansk → om 13 dage (d. 15. oktober 2026)", () => {
    const k = kort(medlem("2025-10-22"), new Date("2026-10-02T10:00:00Z"));
    expect(k).toEqual({
      tilstand: "laast",
      titel: "Boardroom-certifikat · låst",
      linje: "Åbner ugen før dine 12 måneders medlemskab — om 13 dage (d. 15. oktober 2026)",
      dage: 13,
      dato: "15. oktober 2026",
    });
  });

  it("«om 1 dag» dagen før — også kl. 23.59 dansk (21.59Z)", () => {
    const k = kort(medlem("2025-10-22"), new Date("2026-10-14T21:59:00Z"));
    expect(k?.tilstand).toBe("laast");
    if (k?.tilstand !== "laast") return;
    expect(k.dage).toBe(1);
    expect(k.linje).toBe("Åbner ugen før dine 12 måneders medlemskab — om 1 dag (d. 15. oktober 2026)");
  });

  it("DST-skift (29/3-2026) mellem i dag og åbningen: hele danske kalenderdage", () => {
    // Start 8/4-2025 → 12 mdr. 8/4-2026 → åbner 1/4-2026.
    expect(kort(medlem("2025-04-08"), new Date("2026-03-25T11:00:00Z"))).toMatchObject({ tilstand: "laast", dage: 7, dato: "1. april 2026" });
    // 23.30 dansk den 25/3 (vintertid, 22.30Z) er stadig den 25. → 7.
    expect(kort(medlem("2025-04-08"), new Date("2026-03-25T22:30:00Z"))).toMatchObject({ dage: 7 });
    // 00.10 dansk den 26/3 (23.10Z den 25.) er den 26. → 6 — dansk dato, ikke UTC.
    expect(kort(medlem("2025-04-08"), new Date("2026-03-25T23:10:00Z"))).toMatchObject({ dage: 6 });
    // Efter skiftet (sommertid, UTC+2): 31/3 kl. 00.30 dansk = 30/3 22.30Z → 1.
    expect(kort(medlem("2025-04-08"), new Date("2026-03-30T22:30:00Z"))).toMatchObject({ dage: 1 });
  });

  it("DST-skift om efteråret (25/10-2026)", () => {
    // Start 3/11-2025 → 12 mdr. 3/11-2026 → åbner 27/10-2026.
    expect(kort(medlem("2025-11-03"), new Date("2026-10-24T10:00:00Z"))).toMatchObject({ dage: 3, dato: "27. oktober 2026" });
    expect(kort(medlem("2025-11-03"), new Date("2026-10-26T10:00:00Z"))).toMatchObject({ dage: 1 });
  });

  it("ordene", () => {
    expect(omDage(1)).toBe("om 1 dag");
    expect(omDage(2)).toBe("om 2 dage");
    expect(laastLinje(5, "1. maj 2027")).toBe("Åbner ugen før dine 12 måneders medlemskab — om 5 dage (d. 1. maj 2027)");
  });
});

describe("certifikatKort — klar", () => {
  it("dagen det åbner (15/10 kl. 00.05 dansk = 14/10 22.05Z) → klar med link", () => {
    expect(kort(medlem("2025-10-22"), new Date("2026-10-14T22:05:00Z"))).toEqual({
      tilstand: "klar", titel: CERTIFIKAT_KORT.klarTitel, link: "Dit certifikat er klar — hent det", sti: "/certifikat",
    });
  });
  it("efter åbningen og efter 12-månedersdatoen → stadig klar", () => {
    expect(kort(medlem("2025-10-22"), new Date("2026-10-20T10:00:00Z"))?.tilstand).toBe("klar");
    expect(kort(medlem("2025-10-22"), new Date("2027-03-01T10:00:00Z"))?.tilstand).toBe("klar");
  });
});

describe("certifikatKort — intet kort (fail-closed)", () => {
  const nu = new Date("2026-10-02T10:00:00Z");
  it("mens det henter, ved fejl og uden dom", () => {
    const dom = certifikatDom(medlem("2025-10-22"), nu);
    expect(certifikatKort({ loading: true, fejl: null, dom })).toBeNull();
    expect(certifikatKort({ loading: false, fejl: "nej", dom })).toBeNull();
    expect(certifikatKort({ loading: false, fejl: null, dom: null })).toBeNull();
    expect(certifikatKort({ loading: false, fejl: null, dom: undefined })).toBeNull();
  });
  it("ikke berettiget: rådgiver, abonnent, udløbet, fravalg", () => {
    expect(kort(medlem("2025-10-22", { isAdvisor: true }), nu)).toBeNull();
    expect(kort(medlem("2025-10-22", { membershipTier: "subscriber" }), nu)).toBeNull();
    expect(kort(medlem("2025-10-22", { membershipTier: "expired" }), nu)).toBeNull();
    expect(kort(medlem("2025-10-22", { membershipTier: null }), nu)).toBeNull();
    expect(kort(medlem("2025-10-22", { eligible: false }), nu)).toBeNull();
  });
  it("ukendt startdato: null, tom, ugyldig", () => {
    expect(kort(medlem(null), nu)).toBeNull();
    expect(kort(medlem(""), nu)).toBeNull();
    expect(kort(medlem("2025-02-31"), nu)).toBeNull();
    expect(kort(medlem("2025-10-22T00:00:00Z"), nu)).toBeNull();
  });
  it("en låst dom med 0 dage (i utakt med sig selv) giver intet kort", () => {
    const dom = certifikatDom(medlem("2025-10-22"), nu);
    if (dom.synlig !== true) throw new Error("forventede synlig");
    expect(certifikatKort({ loading: false, fejl: null, dom: { synlig: true, status: { ...dom.status, daysUntilUnlock: 0 } } })).toBeNull();
  });
});
