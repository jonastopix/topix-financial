import { describe, expect, it } from "vitest";
import { bekraeftOverskrift, erGyldigtAftaleLink, knapperFor, LUKKEAARSAGER_TIL_VALG } from "@/lib/ansoegninger/ansoegningHandlinger";

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
    expect(knapperFor(ctx("indkaldt")).map((x) => x.handling)).toEqual(["luk"]);
    expect(knapperFor(ctx("booket")).map((x) => x.handling)).toEqual(["afholdt", "luk"]);
  });
  it("aftalegrundlag_sendt: «Underskrevet på papir» (bekræftes) og luk; underskrevet: ingen knapper; lukket: kun genåbn", () => {
    const k = knapperFor(ctx("aftalegrundlag_sendt"));
    expect(k.map((x) => x.handling)).toEqual(["underskrevet", "luk"]);
    expect(k[0].bekraeft).toBe(true);
    expect(knapperFor(ctx("underskrevet"))).toEqual([]);
    expect(knapperFor({ trin: "lukket", paaPause: false, lukketFraTrin: "indkaldt" }).map((x) => x.handling)).toEqual(["genaabn"]);
  });
  it("luk kræver årsag; kun trak_sig/dublet/andet kan vælges (afslagene har egne knapper, resten er køens)", () => {
    expect(knapperFor(ctx("ny")).find((x) => x.handling === "luk")!.kraeverAarsag).toBe(true);
    expect([...LUKKEAARSAGER_TIL_VALG]).toEqual(["trak_sig", "dublet", "andet"]);
  });
  it("overskrift og link-dom", () => {
    expect(bekraeftOverskrift(knapperFor(ctx("ny"))[1], "Nordic Byg ApS")).toBe("Afvis — Nordic Byg ApS?");
    expect(erGyldigtAftaleLink("https://app.theboardroom.dk/aftale?token=x")).toBe(true);
    expect(erGyldigtAftaleLink("http://x.dk")).toBe(false);
    expect(erGyldigtAftaleLink("")).toBe(false);
  });
});
