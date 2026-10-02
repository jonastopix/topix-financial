import { describe, expect, it } from "vitest";
import {
  EGET_KORT_LINK_TO,
  HJAELPERE_LOFT,
  HJAELPER_MAKS_TEGN,
  dagsnummer,
  hjaelperLinje,
  vaelgHjaelpere,
  visHjaelpere,
  type HjaelperProfil,
} from "../communityHjaelpere";
import { PROFIL_STI } from "../profilUdfyldt";

/* «Hvem kan hjælpe med …» — «Spørg mig om»-kortene i Community (2/10-2026). */

const p = (user_id: string, full_name: string, ask_me_about: string | null, is_advisor = false): HjaelperProfil => ({
  user_id,
  full_name,
  avatar_url: null,
  ask_me_about,
  is_advisor,
});

const ALLE = [
  p("mig", "Mig Selv", null),
  p("a", "Anne", "eksport til Tyskland"),
  p("b", "Bent", "den første sælger"),
  p("c", "Carl", "generationsskifte"),
  p("d", "Dorte", "webshop"),
  p("r", "Jonas", "alt", true),
  p("e", "Erik", "   "),
];

describe("vaelgHjaelpere", () => {
  it("kun medlemmer med tekst, aldrig rådgivere, aldrig læseren, højst HJAELPERE_LOFT", () => {
    const h = vaelgHjaelpere(ALLE, "mig", new Date("2026-10-02T10:00:00Z"));
    expect(h.andre).toHaveLength(HJAELPERE_LOFT);
    expect(h.andre.every((x) => !x.is_advisor && x.user_id !== "mig" && (x.ask_me_about ?? "").trim() !== "")).toBe(true);
    expect(h.mig?.user_id).toBe("mig");
  });

  it("tre eller færre kandidater: alle vises, alfabetisk", () => {
    const h = vaelgHjaelpere([p("b", "Bent", "x"), p("a", "Anne", "y"), p("mig", "Mig", null)], "mig", new Date());
    expect(h.andre.map((x) => x.user_id)).toEqual(["a", "b"]);
  });

  it("vinduet flytter én plads pr. dansk kalenderdag, og alle kommer forbi", () => {
    const d1 = new Date("2026-10-02T10:00:00Z");
    const d2 = new Date("2026-10-03T10:00:00Z");
    const h1 = vaelgHjaelpere(ALLE, "mig", d1).andre.map((x) => x.user_id);
    const h2 = vaelgHjaelpere(ALLE, "mig", d2).andre.map((x) => x.user_id);
    expect(h1).not.toEqual(h2);
    expect(h2[0]).toBe(["a", "b", "c", "d"][(["a", "b", "c", "d"].indexOf(h1[0]) + 1) % 4]);
    // Samme dag, samme vindue — også kl. 23:30 dansk (21:30Z) og 00:30 dansk næste dag er to dage.
    expect(vaelgHjaelpere(ALLE, "mig", new Date("2026-10-02T21:30:00Z")).andre.map((x) => x.user_id)).toEqual(h1);
    expect(vaelgHjaelpere(ALLE, "mig", new Date("2026-10-02T22:30:00Z")).andre.map((x) => x.user_id)).toEqual(h2);
  });

  it("rådgiveren som læser får intet eget kort; en læser uden for kataloget heller ikke", () => {
    expect(vaelgHjaelpere(ALLE, "r", new Date()).mig).toBeNull();
    expect(vaelgHjaelpere(ALLE, "ukendt", new Date()).mig).toBeNull();
    expect(vaelgHjaelpere(ALLE, null, new Date()).mig).toBeNull();
  });
});

describe("dagsnummer", () => {
  it("dansk kalenderdag: 22:30Z 2/10 er 3/10 dansk", () => {
    expect(dagsnummer(new Date("2026-10-02T22:30:00Z")) - dagsnummer(new Date("2026-10-02T10:00:00Z"))).toBe(1);
  });
});

describe("hjaelperLinje", () => {
  it("én sætning, højst HJAELPER_MAKS_TEGN, aldrig klippet midt i et ord; null uden tekst", () => {
    expect(hjaelperLinje({ ask_me_about: "Eksport til Tyskland. Og told." })).toBe("Eksport til Tyskland.");
    const lang = "ord ".repeat(60).trim();
    const linje = hjaelperLinje({ ask_me_about: lang })!;
    expect(linje.length).toBeLessThanOrEqual(HJAELPER_MAKS_TEGN);
    expect(linje.endsWith("…")).toBe(true);
    expect(hjaelperLinje({ ask_me_about: null })).toBeNull();
    expect(hjaelperLinje({ ask_me_about: "  " })).toBeNull();
  });
});

describe("visHjaelpere og linket", () => {
  it("tegnes når der er et andet kort ELLER læseren er medlem", () => {
    expect(visHjaelpere({ andre: [], mig: null })).toBe(false);
    expect(visHjaelpere({ andre: [], mig: p("mig", "Mig", null) })).toBe(true);
    expect(visHjaelpere({ andre: [p("a", "Anne", "x")], mig: null })).toBe(true);
  });
  it("«Skriv én linje» fører til profilfanen — samme sti som alle andre nudges", () => {
    expect(EGET_KORT_LINK_TO).toBe(PROFIL_STI);
  });
});
