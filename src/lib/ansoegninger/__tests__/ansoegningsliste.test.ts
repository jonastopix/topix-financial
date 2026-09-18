import { describe, expect, it } from "vitest";
import { dageSiden, filtrer, foersteLinje, matcherSoegning, sorterGruppe, STRIBE_ORD, STRIBE_RAEKKEFOELGE, stribeTal, tidTekst, venterPaa } from "@/lib/ansoegninger/ansoegningsliste";
import { LISTEGRUPPER } from "@/lib/ansoegninger/ansoegningVisning";

const nu = new Date("2026-09-25T10:00:00Z");
const r = (trin: Parameters<typeof venterPaa>[0]["trin"], dage: number, paa_pause_til: string | null = null, extra: Partial<Parameters<typeof filtrer>[0][number]> = {}) => ({
  trin, trin_sat_at: new Date(nu.getTime() - dage * 86_400_000).toISOString(), paa_pause_til, lukkeaarsag: null, lukket_at: null,
  navn: "Lisbeth Hansen", email: "l@nordicbyg.dk", cvr: "12345678", cvr_opslag: { navn: "Nordic Byg ApS" }, ...extra,
});

describe("ansoegningsliste — venter på os / vi venter på dem (den vigtigste sortering)", () => {
  it("ny og afholdt venter på os; indkaldt/booket/aftale/underskrevet venter på dem; pause og lukket venter ingen", () => {
    expect(venterPaa(r("ny", 3), nu)).toBe("os");
    expect(venterPaa(r("afholdt", 3), nu)).toBe("os");
    expect(venterPaa(r("indkaldt", 3), nu)).toBe("dem");
    expect(venterPaa(r("booket", 3), nu)).toBe("dem");
    expect(venterPaa(r("aftalegrundlag_sendt", 3), nu)).toBe("dem");
    expect(venterPaa(r("underskrevet", 3), nu)).toBe("dem");
    expect(venterPaa(r("underskrevet", 3, null, { virksomhed_slutdato: "2027-09-16" }), nu)).toBe("ingen"); // blev medlem (18/9 aften)
    expect(venterPaa(r("afholdt", 3, "2026-12-10"), nu)).toBe("ingen");
    expect(venterPaa(r("lukket", 3), nu)).toBe("ingen");
  });
  it("tidTekst siger hvem der skylder, og hvor længe", () => {
    expect(tidTekst(r("afholdt", 5), nu)).toBe("venter på os · 5 dage");
    expect(tidTekst(r("ny", 0), nu)).toBe("venter på os · i dag");
    expect(tidTekst(r("indkaldt", 1), nu)).toBe("vi venter på dem · 1 dag");
    expect(tidTekst(r("afholdt", 15, "2026-12-10"), nu)).toBe("på pause til 10. december");
    expect(tidTekst(r("lukket", 12), nu)).toBe("lukket · 12 dage siden");
    // 18/9 aften: underskrevet siger hvad der ventes på; betalt siger hvad de blev — ingen tæller, der vokser
    expect(tidTekst(r("underskrevet", 40), nu)).toBe("venter på betaling · 40 dage");
    expect(tidTekst(r("underskrevet", 40, null, { virksomhed_slutdato: "2027-09-16T00:00:00Z" }), nu)).toBe("blev medlem · medlemskab til 16. september");
    expect(dageSiden("nix", nu)).toBe(0);
  });
  it("sortering: længst ventende på os øverst; vi-venter ældste først; pause tidligste dato; lukkede nyeste først", () => {
    const os = sorterGruppe("afholdt", [r("afholdt", 2, null, { navn: "b" }), r("afholdt", 9, null, { navn: "a" }), r("afholdt", 5, null, { navn: "c" })]);
    expect(os.map((x) => x.navn)).toEqual(["a", "c", "b"]);
    const dem = sorterGruppe("indkaldt", [r("indkaldt", 1, null, { navn: "b" }), r("indkaldt", 7, null, { navn: "a" })]);
    expect(dem.map((x) => x.navn)).toEqual(["a", "b"]);
    const pause = sorterGruppe("paa_pause", [r("afholdt", 1, "2026-12-10", { navn: "b" }), r("afholdt", 1, "2026-11-01", { navn: "a" })]);
    expect(pause.map((x) => x.navn)).toEqual(["a", "b"]);
    const luk = sorterGruppe("lukket", [r("lukket", 20, null, { navn: "a" }), r("lukket", 3, null, { navn: "b" })]);
    expect(luk.map((x) => x.navn)).toEqual(["b", "a"]);
  });
});

describe("ansoegningsliste — striben, første linje, søgning, filter", () => {
  const alle = [r("ny", 1), r("afholdt", 4), r("afholdt", 15, "2026-12-10"), r("afholdt", 15, "2026-12-10"), r("indkaldt", 3), r("booket", 2), ...Array.from({ length: 10 }, () => r("lukket", 9, null, { lukkeaarsag: "svarer_ikke" }))];
  it("striben har ét tal pr. gruppe i flowets rækkefølge — også nuller — og ordene er korte", () => {
    const s = stribeTal(alle, nu);
    expect(s.map((x) => x.gruppe)).toEqual([...LISTEGRUPPER]);
    expect(Object.fromEntries(s.map((x) => [x.gruppe, x.antal]))).toEqual({ afholdt: 1, ny: 1, booket: 1, indkaldt: 1, aftalegrundlag_sendt: 0, underskrevet: 0, paa_pause: 2, blev_medlem: 0, lukket: 10 });
    expect(STRIBE_RAEKKEFOELGE).toEqual(["ny", "indkaldt", "booket", "afholdt", "aftalegrundlag_sendt", "underskrevet", "blev_medlem", "paa_pause", "lukket"]);
    const medlem = sorterGruppe("blev_medlem", [r("underskrevet", 30, null, { navn: "a", virksomhed_slutdato: "2027-08-01" }), r("underskrevet", 3, null, { navn: "b", virksomhed_slutdato: "2027-09-16" })]);
    expect(medlem.map((x) => x.navn)).toEqual(["b", "a"]); // nyeste medlem øverst
    for (const g of LISTEGRUPPER) expect(STRIBE_ORD[g].length).toBeLessThan(14);
  });
  it("foersteLinje: første ikke-tomme linje, klippet med …", () => {
    expect(foersteLinje("\n  Vi mangler overblik over likviditeten.\nOg mere.")).toBe("Vi mangler overblik over likviditeten.");
    expect(foersteLinje("x".repeat(120), 90)).toHaveLength(90);
    expect(foersteLinje("x".repeat(120), 90).endsWith("…")).toBe(true);
    expect(foersteLinje(null)).toBe("");
  });
  it("søgning på virksomhed, person, mail og CVR; filter fra striben", () => {
    expect(matcherSoegning(alle[0], "nordic")).toBe(true);
    expect(matcherSoegning(alle[0], "lisbeth")).toBe(true);
    expect(matcherSoegning(alle[0], "nordicbyg.dk")).toBe(true);
    expect(matcherSoegning(alle[0], "1234")).toBe(true);
    expect(matcherSoegning(alle[0], "zzz")).toBe(false);
    expect(matcherSoegning(alle[0], "  ")).toBe(true);
    expect(filtrer(alle, nu, "lukket", "")).toHaveLength(10);
    expect(filtrer(alle, nu, "paa_pause", "")).toHaveLength(2);
    expect(filtrer(alle, nu, null, "zzz")).toHaveLength(0);
    expect(filtrer(alle, nu, null, "")).toHaveLength(16);
  });
});
