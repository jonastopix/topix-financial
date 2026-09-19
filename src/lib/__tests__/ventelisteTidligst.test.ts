import { describe, expect, it } from "vitest";
import { danskDatoAf, erTidligstNaaet, harTilbudUde, klarTilTilbud, naesteIKoen, venterPaaDato, type VentepladsRaekke } from "@/lib/ventelisteDom";

// «Tidligst»-datoen på en venteplads (18/9). Jonas om ABC hundeudstyr/Doggybed: «De skal
// tilbydes når Doggybed er ude, så tingene er efter bogen.» Målt: erPladsLedig siger «ledig»
// allerede ved «tilbyd ikke» (klar_til_afsked), FØR slutdatoen 13/10-2026 — datoen holder køen tilbage.
const r = (id: string, o: Partial<VentepladsRaekke> = {}): VentepladsRaekke => ({
  id, ansoegning_id: `a-${id}`, company_id: "c1", status: "venter", sat_at: "2026-09-18T10:00:00.000Z", afvist_at: null, ...o,
});
const ABC = r("abc", { afvist_at: "2025-09-16T10:04:27.000Z", tidligst_tilbud_at: "2026-10-13" });

/*
 * FØRST: eksporterne findes. Et bagstop foran bagstoppet — forsvinder en af
 * dommene ud af modulet, fejler denne ene prøve med det samme og med et
 * læseligt navn, i stedet for at fejlen viser sig som «X is not a function»
 * spredt ud over de otte prøver nedenfor. `tsc` fanger det også (TS2459), og
 * gør det i produktionskoden (AdvisorDashboard, VentelisteHandlinger) — værnet
 * her er hurtigere at læse, ikke mere dækkende.
 *
 * RETTET 19/9. Her stod før, at prøverne nedenfor havde været GRØNNE, mens
 * dommene var væk, og at vitest derfor kunne tie om en manglende export. Det
 * var forkert. Påstanden kom fra et andet vindue, som havde kørt `tsc` og
 * `vitest` to minutter fra hinanden i et arbejdstræ, der blev repareret
 * imellem de to kørsler — to tilstande læst som ét billede.
 *
 * Den kontrollerede efterprøvning (ren kopi, dette værn fjernet, `export`
 * fjernet fra de fire domme i BEGGE spejle) gav `8 failed | 1 passed` og
 * «danskDatoAf is not a function». Prøverne fejler højlydt. En prøve er kun
 * tavs, hvis den REFERERER en import uden at kalde den — disse kalder.
 *
 * Værnet bliver, fordi det fejler tidligere og mere læseligt. Det lukker
 * ingen hul, for der var intet.
 */
describe("eksporterne findes overhovedet", () => {
  it("alle fire domme er funktioner — ikke undefined", () => {
    expect(typeof danskDatoAf).toBe("function");
    expect(typeof erTidligstNaaet).toBe("function");
    expect(typeof klarTilTilbud).toBe("function");
    expect(typeof venterPaaDato).toBe("function");
    // Og de to, dommene bygger videre på (C's, urørte).
    expect(typeof naesteIKoen).toBe("function");
    expect(typeof harTilbudUde).toBe("function");
  });
});

describe("danskDatoAf — dansk dato uden imports", () => {
  it("UTC-midnat 12/10 er 13/10 00:00 dansk tid (CEST) → «2026-10-13»; 11:00 UTC 12/10 → «2026-10-12»", () => {
    expect(danskDatoAf(new Date("2026-10-12T22:00:00.000Z"))).toBe("2026-10-13");
    expect(danskDatoAf(new Date("2026-10-12T11:00:00.000Z"))).toBe("2026-10-12");
  });
});

describe("erTidligstNaaet", () => {
  it("ingen dato → nået; dagen før → ikke; selve dagen (dansk) → nået; dagen efter → nået", () => {
    expect(erTidligstNaaet(r("x"), new Date("2026-09-18T12:00:00Z"))).toBe(true);
    expect(erTidligstNaaet(ABC, new Date("2026-10-12T12:00:00Z"))).toBe(false);
    expect(erTidligstNaaet(ABC, new Date("2026-10-12T22:30:00Z"))).toBe(true); // 13/10 00:30 dansk tid
    expect(erTidligstNaaet(ABC, new Date("2026-11-01T12:00:00Z"))).toBe(true);
  });
  it("kun ventende holdes tilbage: en tilbudt række med fremtidig dato tæller stadig", () => {
    expect(erTidligstNaaet({ status: "tilbudt", tidligst_tilbud_at: "2099-01-01" }, new Date())).toBe(true);
  });
  it("ulæselig dato holder ikke tilbage (fail-open mod en tastefejl — rådgiveren trykker selv)", () => {
    expect(erTidligstNaaet(r("x", { tidligst_tilbud_at: "13/10-2026" }), new Date("2026-09-18T12:00:00Z"))).toBe(true);
  });
});

describe("klarTilTilbud + naesteIKoen — ABC/Doggybed-tilfældet", () => {
  const foer = new Date("2026-09-18T12:00:00Z");
  const paaDagen = new Date("2026-10-13T08:00:00Z");
  it("18/9: ABC er alene i Doggybeds kø, men må ikke tilbydes → køen er tom i dag, ABC står i venterPaaDato", () => {
    expect(naesteIKoen(klarTilTilbud([ABC], foer))).toBeNull();
    expect(venterPaaDato([ABC], foer).map((x) => x.id)).toEqual(["abc"]);
  });
  it("13/10: ABC er den næste", () => {
    expect(naesteIKoen(klarTilTilbud([ABC], paaDagen))?.id).toBe("abc");
    expect(venterPaaDato([ABC], paaDagen)).toEqual([]);
  });
  it("en yngre uden dato går foran den ældre med fremtidig dato — indtil datoen, så gælder ancienniteten igen", () => {
    const yngre = r("y", { afvist_at: "2026-03-01T00:00:00.000Z" });
    expect(naesteIKoen(klarTilTilbud([ABC, yngre], foer))?.id).toBe("y");
    expect(naesteIKoen(klarTilTilbud([ABC, yngre], paaDagen))?.id).toBe("abc");
  });
  it("et tilbud ude ses stadig efter filtret (harTilbudUde), så der aldrig tilbydes to", () => {
    const tilbudt = r("t", { status: "tilbudt" });
    expect(harTilbudUde(klarTilTilbud([ABC, tilbudt], foer))).toBe(true);
  });
});
