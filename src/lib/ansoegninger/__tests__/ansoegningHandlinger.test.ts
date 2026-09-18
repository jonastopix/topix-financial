import { describe, expect, it } from "vitest";
import { bekraeftOverskrift, erGyldigPauseDato, erGyldigtAftaleLink, knapperFor, LUKKEAARSAGER_TIL_VALG, standardPauseTil } from "@/lib/ansoegninger/ansoegningHandlinger";

const ctx = (trin: Parameters<typeof knapperFor>[0]["trin"], paaPause = false) => ({ trin, paaPause, lukketFraTrin: null });

describe("ansoegningHandlinger — knapperne følger afgoerOvergang (fladen gætter ikke)", () => {
  it("ny: de to store er «Indkald til samtale» og «Afvis»; ingen tilbud (direkte tilbud findes ikke)", () => {
    const k = knapperFor(ctx("ny"));
    expect(k.filter((x) => x.stor).map((x) => x.handling)).toEqual(["tal_med_dem", "afvis"]);
    expect(k.map((x) => x.handling)).not.toContain("tilbud");
    expect(k.map((x) => x.handling)).not.toContain("underskrevet");
    expect(k.find((x) => x.handling === "afvis")!.bekraeft).toBe(true);
    expect(k.find((x) => x.handling === "tal_med_dem")!.bekraeft).toBe(false);
  });
  it("afholdt: «Send aftalegrundlag» (kræver link) og «Afslut» (bekræftes)", () => {
    const k = knapperFor(ctx("afholdt"));
    expect(k.filter((x) => x.stor).map((x) => x.handling)).toEqual(["tilbud", "afslag"]);
    expect(k.find((x) => x.handling === "tilbud")!.kraeverAftaleUrl).toBe(true);
    expect(k.find((x) => x.handling === "afslag")!.bekraeft).toBe(true);
  });
  it("indkaldt/booket: ingen store knapper — kun reserven (luk; afholdt fra booket)", () => {
    expect(knapperFor(ctx("indkaldt")).filter((x) => x.stor)).toEqual([]);
    expect(knapperFor(ctx("indkaldt")).map((x) => x.handling)).toEqual(["saet_pause", "luk"]);
    expect(knapperFor(ctx("booket")).map((x) => x.handling)).toEqual(["afholdt", "saet_pause", "luk"]);
  });
  it("aftalegrundlag_sendt: «Underskrevet på papir» (bekræftes) og luk; underskrevet: ingen knapper; lukket: kun genåbn", () => {
    const k = knapperFor(ctx("aftalegrundlag_sendt"));
    expect(k.map((x) => x.handling)).toEqual(["underskrevet", "saet_pause", "luk"]);
    expect(k[0].bekraeft).toBe(true);
    expect(knapperFor(ctx("underskrevet"))).toEqual([]);
    expect(knapperFor({ trin: "lukket", paaPause: false, lukketFraTrin: "indkaldt" }).map((x) => x.handling)).toEqual(["genaabn"]);
  });
  it("luk kræver årsag; kun trak_sig/dublet/andet kan vælges (afslagene har egne knapper, resten er køens)", () => {
    expect(knapperFor(ctx("ny")).find((x) => x.handling === "luk")!.kraeverAarsag).toBe(true);
    expect([...LUKKEAARSAGER_TIL_VALG]).toEqual(["trak_sig", "dublet", "andet"]);
  });
  it("saet_pause: reserve fra alle åbne trin, bekræftes med dato (standard tre måneder frem); hedder «Flyt pausen» med en pause i forvejen", () => {
    for (const trin of ["ny", "indkaldt", "booket", "afholdt", "aftalegrundlag_sendt"] as const) {
      const k = knapperFor(ctx(trin)).find((x) => x.handling === "saet_pause")!;
      expect(k).toMatchObject({ stor: false, bekraeft: true, kraeverDato: true, tekst: "Sæt på pause" });
      expect(knapperFor(ctx(trin, true)).find((x) => x.handling === "saet_pause")!.tekst).toBe("Flyt pausen");
    }
    expect(knapperFor(ctx("underskrevet"))).toEqual([]);
    expect(knapperFor({ trin: "lukket", paaPause: false, lukketFraTrin: null }).map((x) => x.handling)).toEqual(["genaabn"]);
    // Lukket: kun genåbn — abonnementet er taget ud (Jonas 18/9), så et nej har ingen knap efter sig
    expect(knapperFor({ trin: "lukket", paaPause: false, lukketFraTrin: "ny" }).map((x) => x.handling)).toEqual(["genaabn"]);
    expect(knapperFor(ctx("ny")).find((x) => x.handling === "afvis")!.kraeverAfslagsgrund).toBe(true);
    expect(knapperFor(ctx("afholdt")).find((x) => x.handling === "afslag")!.kraeverAfslagsgrund).toBe(true);
    const nu = new Date("2026-09-18T10:00:00Z");
    expect(standardPauseTil(nu)).toBe("2026-12-18");
    expect(erGyldigPauseDato("2026-12-10", nu)).toBe(true);
    expect(erGyldigPauseDato("2026-09-18", nu)).toBe(false);
    expect(erGyldigPauseDato("10/12-2026", nu)).toBe(false);
  });
  it("genoptag (18/9 aften): «Genoptag nu» kun med en pause — reserve, uden dialog, foran «Flyt pausen»; ikke uden pause, ikke på lukket/underskrevet", () => {
    for (const trin of ["ny", "indkaldt", "booket", "afholdt", "aftalegrundlag_sendt"] as const) {
      const med = knapperFor(ctx(trin, true)).map((x) => x.handling);
      expect(med.indexOf("genoptag")).toBeGreaterThanOrEqual(0);
      expect(med.indexOf("genoptag")).toBeLessThan(med.indexOf("saet_pause"));
      expect(knapperFor(ctx(trin, true)).find((x) => x.handling === "genoptag")).toMatchObject({ tekst: "Genoptag nu", stor: false, farlig: false, bekraeft: false, kraeverDato: false });
      expect(knapperFor(ctx(trin)).map((x) => x.handling)).not.toContain("genoptag");
    }
    expect(knapperFor(ctx("indkaldt", true)).map((x) => x.handling)).toEqual(["genoptag", "saet_pause", "luk"]);
    expect(knapperFor(ctx("underskrevet", true))).toEqual([]);
    expect(knapperFor({ trin: "lukket", paaPause: true, lukketFraTrin: "ny" }).map((x) => x.handling)).toEqual(["genaabn"]);
  });
  it("overskrift og link-dom", () => {
    expect(bekraeftOverskrift(knapperFor(ctx("ny"))[1], "Nordic Byg ApS")).toBe("Afvis — Nordic Byg ApS?");
    expect(erGyldigtAftaleLink("https://app.theboardroom.dk/aftale?token=x")).toBe(true);
    expect(erGyldigtAftaleLink("http://x.dk")).toBe(false);
    expect(erGyldigtAftaleLink("")).toBe(false);
  });
});
