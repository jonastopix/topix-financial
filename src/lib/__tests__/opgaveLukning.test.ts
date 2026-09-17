import { describe, expect, it } from "vitest";
import { erLukket, fletKvitteringer, grundlagForLinje, laesKvittering, LUKNINGS_UDFALD, UDFALD_TEKST, type Kvittering } from "@/lib/opgaveLukning";

// Lukningen (Jonas 8/9): lukket holder på den opgave der er; noget NYT
// gør den levende igen. Grænserne: samme grundlag = lukket, andet
// grundlag = levende, ukendt nøgle = levende, ingen kvittering = levende.

const kv = (grundlag: Record<string, string>, udfald: Kvittering["udfald"] = "faerdiggjort"): Kvittering => ({
  udfald,
  grundlag,
  lukketAt: "2026-09-08T10:00:00Z",
});

describe("erLukket — grænserne", () => {
  it("samme grundlag = lukket (talsignal på samme periode)", () => {
    expect(erLukket({ noegle: "stikker_ud:omsaetningsfald_mom", grundlag: "2026-08" }, kv({ "stikker_ud:omsaetningsfald_mom": "2026-08" }))).toBe(true);
  });
  it("nyere periode = levende igen", () => {
    expect(erLukket({ noegle: "stikker_ud:omsaetningsfald_mom", grundlag: "2026-09" }, kv({ "stikker_ud:omsaetningsfald_mom": "2026-08" }))).toBe(false);
  });
  it("tavshed: samme sidste besked = lukket, ny besked = levende, «aldrig» er også et grundlag", () => {
    const k = kv({ tavshed: "2026-06-09T08:00:00Z", "tavshed-x": "aldrig" });
    expect(erLukket({ noegle: "tavshed", grundlag: "2026-06-09T08:00:00Z" }, k)).toBe(true);
    expect(erLukket({ noegle: "tavshed", grundlag: "2026-09-08T09:00:00Z" }, k)).toBe(false);
    expect(erLukket({ noegle: "tavshed", grundlag: "aldrig" }, kv({ tavshed: "aldrig" }))).toBe(true);
  });
  it("en nøgle kvitteringen ikke kendte = levende (grunden er ny)", () => {
    expect(erLukket({ noegle: "venter_i_samtalen", grundlag: "2026-09-08T09:00:00Z" }, kv({ tavshed: "aldrig" }))).toBe(false);
  });
  it("ingen kvittering = levende", () => {
    expect(erLukket({ noegle: "tavshed", grundlag: "aldrig" }, null)).toBe(false);
    expect(erLukket({ noegle: "tavshed", grundlag: "aldrig" }, undefined)).toBe(false);
  });
  it("«ikke relevant» lukker på samme vilkår som «færdiggjort»", () => {
    const g = { noegle: "fornyelse", grundlag: "klar_til_tilbud|tilbyd|2026-09-01T00:00:00Z|" };
    expect(erLukket(g, kv({ fornyelse: g.grundlag }, "ikke_relevant"))).toBe(true);
    expect(erLukket(g, kv({ fornyelse: "klar_til_tilbud|tilbyd|2026-09-01T00:00:00Z|2026-09-07T00:00:00Z" }, "ikke_relevant"))).toBe(false);
  });
  it("ligheden er streng — tomt grundlag mod manglende nøgle er levende", () => {
    expect(erLukket({ noegle: "indgang", grundlag: "" }, kv({}))).toBe(false);
    expect(erLukket({ noegle: "indgang", grundlag: "" }, kv({ indgang: "" }))).toBe(true);
  });
});

describe("grundlagForLinje og laesKvittering", () => {
  it("gemmer alle linjens grunde, nøgle → grundlag", () => {
    expect(grundlagForLinje([
      { noegle: "stikker_ud:omsaetningsfald_mom", grundlag: "2026-08" },
      { noegle: "stikker_ud:resultatfald_mom", grundlag: "2026-08" },
      { noegle: "tavshed", grundlag: "aldrig" },
    ])).toEqual({ "stikker_ud:omsaetningsfald_mom": "2026-08", "stikker_ud:resultatfald_mom": "2026-08", tavshed: "aldrig" });
  });
  it("læser en ny række; gamle snooze-rækker (uden udfald/grundlag) giver null", () => {
    expect(laesKvittering({ udfald: "faerdiggjort", grundlag: { tavshed: "aldrig", x: 3 }, acknowledged_at: "2026-09-08T10:00:00Z" }))
      .toEqual({ udfald: "faerdiggjort", grundlag: { tavshed: "aldrig" }, lukketAt: "2026-09-08T10:00:00Z" });
    expect(laesKvittering({ udfald: null, grundlag: null, acknowledged_at: "2026-06-11T10:00:00Z" })).toBeNull();
    expect(laesKvittering({ udfald: "klaret", grundlag: {}, acknowledged_at: null })).toBeNull();
    expect(laesKvittering({ udfald: "ikke_relevant", grundlag: ["a"], acknowledged_at: null })).toBeNull();
    expect(laesKvittering(null)).toBeNull();
  });
  it("de to udfald og deres ord", () => {
    expect(LUKNINGS_UDFALD).toEqual(["faerdiggjort", "ikke_relevant"]);
    expect(UDFALD_TEKST.faerdiggjort).toBe("Færdiggjort");
    expect(UDFALD_TEKST.ikke_relevant).toBe("Ikke relevant");
  });
});

describe("fletKvitteringer (PR 5, 17/9) — flere kvitteringer pr. virksomhed, nyeste vinder pr. nøgle", () => {
  const nyeste: Kvittering = { udfald: "faerdiggjort", grundlag: { tavshed: "2026-09-10T08:00:00Z" }, lukketAt: "2026-09-17T10:00:00Z" };
  const aeldre: Kvittering = { udfald: "ikke_relevant", grundlag: { ingen_maal: "ingen:0", tavshed: "2026-08-01T08:00:00Z" }, lukketAt: "2026-09-10T10:00:00Z" };

  it("tom liste → null; én → den selv", () => {
    expect(fletKvitteringer([])).toBeNull();
    expect(fletKvitteringer([nyeste])).toEqual(nyeste);
  });
  it("nøgler fra den ældre bevares (ingen mål er stadig lukket), fælles nøgler tager den nyeste; udfald og tid er den nyestes", () => {
    expect(fletKvitteringer([nyeste, aeldre])).toEqual({
      udfald: "faerdiggjort",
      grundlag: { tavshed: "2026-09-10T08:00:00Z", ingen_maal: "ingen:0" },
      lukketAt: "2026-09-17T10:00:00Z",
    });
  });
  it("det fejlen så ud som før (kun den nyeste række): «ingen mål» kvitteret, tavsheden lukket senere → ingen mål var levende igen", () => {
    const foer = nyeste; // den gamle læsning: første række pr. virksomhed vandt
    expect(erLukket({ noegle: "ingen_maal", grundlag: "ingen:0" }, foer)).toBe(false);
    expect(erLukket({ noegle: "ingen_maal", grundlag: "ingen:0" }, fletKvitteringer([nyeste, aeldre]))).toBe(true);
    // og et NYT grundlag er stadig levende:
    expect(erLukket({ noegle: "ingen_maal", grundlag: "ingen:1" }, fletKvitteringer([nyeste, aeldre]))).toBe(false);
  });
});
