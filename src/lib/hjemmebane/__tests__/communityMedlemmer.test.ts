import { describe, expect, it } from "vitest";
import {
  TEASER_MAKS_TEGN,
  harProfiltekst,
  medlemMetaLinje,
  medlemTeaser,
  ordnMedlemsSpor,
  type SporMedlem,
} from "@/lib/hjemmebane/communityMedlemmer";

const m = (overrides: Partial<SporMedlem> & { user_id: string; full_name: string }): SporMedlem => ({
  company_name: null,
  industry_label: null,
  ask_me_about: null,
  working_on: null,
  is_advisor: false,
  ...overrides,
});

describe("ordnMedlemsSpor — alle medlemmer, profiltekst først, dig selv løftet ud", () => {
  const profiler = [
    m({ user_id: "ole", full_name: "Ole", ask_me_about: null }),
    m({ user_id: "sarah", full_name: "Sarah", ask_me_about: "Webshop og logistik." }),
    m({ user_id: "anna", full_name: "Anna", ask_me_about: "  " }),
    m({ user_id: "bo", full_name: "Bo", ask_me_about: "Salg til det offentlige." }),
    m({ user_id: "jonas", full_name: "Jonas", is_advisor: true, ask_me_about: "Alt." }),
    m({ user_id: "mig", full_name: "Mig", ask_me_about: "Mit felt." }),
  ];

  it("rådgivere er ikke med; profiltekst først, alfabetisk inden for gruppen", () => {
    const spor = ordnMedlemsSpor(profiler, "mig");
    expect(spor.andre.map((p) => p.user_id)).toEqual(["bo", "sarah", "anna", "ole"]);
    expect(spor.andre.some((p) => p.is_advisor)).toBe(false);
  });

  it("den indloggede står i mig, ikke i andre", () => {
    const spor = ordnMedlemsSpor(profiler, "mig");
    expect(spor.mig?.user_id).toBe("mig");
    expect(spor.andre.find((p) => p.user_id === "mig")).toBeUndefined();
  });

  it("en rådgiver som indlogget får mig = null (står ikke i Netværkets medlemsgren)", () => {
    expect(ordnMedlemsSpor(profiler, "jonas").mig).toBeNull();
  });

  it("uden bruger-id: mig = null, alle medlemmer i andre", () => {
    const spor = ordnMedlemsSpor(profiler, null);
    expect(spor.mig).toBeNull();
    expect(spor.andre).toHaveLength(5);
  });

  it("dansk sortering: Æ efter Z, ikke før A", () => {
    const spor = ordnMedlemsSpor(
      [m({ user_id: "1", full_name: "Æble" }), m({ user_id: "2", full_name: "Zebra" }), m({ user_id: "3", full_name: "Anders" })],
      null,
    );
    expect(spor.andre.map((p) => p.full_name)).toEqual(["Anders", "Zebra", "Æble"]);
  });

  it("ingen skjules: medlemmer uden tekst er med", () => {
    const spor = ordnMedlemsSpor(profiler, null);
    expect(spor.andre.filter((p) => !harProfiltekst(p)).map((p) => p.user_id)).toEqual(["anna", "ole"]);
  });
});

describe("harProfiltekst", () => {
  it("kun ask_me_about tæller, og kun med indhold", () => {
    expect(harProfiltekst({ ask_me_about: "Noget." })).toBe(true);
    expect(harProfiltekst({ ask_me_about: "   " })).toBe(false);
    expect(harProfiltekst({ ask_me_about: null })).toBe(false);
  });
});

describe("medlemMetaLinje", () => {
  it("virksomhed · branche, dele udelades, tom → null", () => {
    expect(medlemMetaLinje({ company_name: "Fjeldgaard ApS", industry_label: "Webshop" })).toBe("Fjeldgaard ApS · Webshop");
    expect(medlemMetaLinje({ company_name: "Fjeldgaard ApS", industry_label: null })).toBe("Fjeldgaard ApS");
    expect(medlemMetaLinje({ company_name: null, industry_label: null })).toBeNull();
  });
});

describe("medlemTeaser — én sætning om hvad man kan spørge om", () => {
  it("ask_me_about først, working_on som fallback, ellers null", () => {
    expect(medlemTeaser({ ask_me_about: "Spørg om moms. Og om told.", working_on: "x" })).toBe("Spørg om moms.");
    expect(medlemTeaser({ ask_me_about: "  ", working_on: "Bygger en ny webshop" })).toBe("Bygger en ny webshop");
    expect(medlemTeaser({ ask_me_about: null, working_on: null })).toBeNull();
  });

  it("holder sig under grænsen og klipper ved ord", () => {
    const lang = Array.from({ length: 40 }, (_, i) => `ord${i}`).join(" ");
    const t = medlemTeaser({ ask_me_about: lang, working_on: null })!;
    expect(t.length).toBeLessThanOrEqual(TEASER_MAKS_TEGN);
    expect(t.endsWith("…")).toBe(true);
    expect(lang.startsWith(t.slice(0, -1))).toBe(true);
  });
});
