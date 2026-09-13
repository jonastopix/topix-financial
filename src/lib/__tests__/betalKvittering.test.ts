import { describe, expect, it } from "vitest";
import {
  afgoerKvittering,
  BETALT_PARAM,
  KVITTERING_GRAENSE_MS,
  KVITTERING_RETRY_MS,
  laesBetaltHint,
  skalHenteIgen,
  type KvitteringsStatus,
} from "@/lib/betalKvittering";

// Fund A (14/9): efter Stripes redirect med betalt=1 må /betal aldrig vise
// betalingsknapperne igen — den bekræfter, venter, og siger til sidst ærligt
// at bekræftelsen mangler. Dommen «betalt» ejes stadig af databasen.

const ALLE: KvitteringsStatus[] = [
  "henter", "ukendt", "fejl", "betalt", "afventer_pris", "klar_til_mail", "afventer_betaling", "frist_overskredet",
];

describe("laesBetaltHint — kun det checkout skriver", () => {
  it("parameternavnet er det opret-indgangs-checkout sætter", () => {
    expect(BETALT_PARAM).toBe("betalt");
  });
  it('"1" er hintet', () => {
    expect(laesBetaltHint("1")).toBe(true);
  });
  it.each([null, undefined, "", "0", "true", "yes", " 1", "1 "])("%j er ikke hintet", (raa) => {
    expect(laesBetaltHint(raa)).toBe(false);
  });
});

describe("afgoerKvittering — uden hint sker intet nyt", () => {
  it.each(ALLE)("status %s uden hint → ingen", (status) => {
    expect(afgoerKvittering({ betaltHint: false, status, overskredet: false })).toBe("ingen");
    expect(afgoerKvittering({ betaltHint: false, status, overskredet: true })).toBe("ingen");
  });
});

describe("afgoerKvittering — med hint", () => {
  it("betalt → ingen: databasens dom er faldet, skærm 7 er kvitteringen", () => {
    expect(afgoerKvittering({ betaltHint: true, status: "betalt", overskredet: false })).toBe("ingen");
    expect(afgoerKvittering({ betaltHint: true, status: "betalt", overskredet: true })).toBe("ingen");
  });
  it("ukendt → ingen: et link der ikke findes, får ingen kvittering", () => {
    expect(afgoerKvittering({ betaltHint: true, status: "ukendt", overskredet: false })).toBe("ingen");
    expect(afgoerKvittering({ betaltHint: true, status: "ukendt", overskredet: true })).toBe("ingen");
  });
  const venter: KvitteringsStatus[] = ["henter", "fejl", "afventer_pris", "klar_til_mail", "afventer_betaling", "frist_overskredet"];
  it.each(venter)("%s inden for vinduet → bekraefter (kvitterer straks, også mens første opslag kører)", (status) => {
    expect(afgoerKvittering({ betaltHint: true, status, overskredet: false })).toBe("bekraefter");
  });
  it.each(venter)("%s efter vinduet → ubekraeftet — aldrig tilbage til betalingsknapperne", (status) => {
    expect(afgoerKvittering({ betaltHint: true, status, overskredet: true })).toBe("ubekraeftet");
  });
  it("afventer_betaling er det kritiske tilfælde: webhooken er ikke landet → bekraefter, ikke ingen", () => {
    // Var svaret «ingen», ville Betal.tsx vise hovedskærmen med tre aktive knapper.
    expect(afgoerKvittering({ betaltHint: true, status: "afventer_betaling", overskredet: false })).not.toBe("ingen");
  });
});

describe("skalHenteIgen — kun mens vi bekræfter", () => {
  it("bekraefter → hent igen", () => expect(skalHenteIgen("bekraefter")).toBe(true));
  it("ubekraeftet → stop; udgangen er Tjek igen-knappen", () => expect(skalHenteIgen("ubekraeftet")).toBe(false));
  it("ingen → stop", () => expect(skalHenteIgen("ingen")).toBe(false));
});

describe("tallene følger fornyelses-låsen (Index.tsx)", () => {
  it("3 s mellem forsøg, 30 s vindue — cirka et halvt minut, og vinduet rummer flere forsøg", () => {
    expect(KVITTERING_RETRY_MS).toBe(3_000);
    expect(KVITTERING_GRAENSE_MS).toBe(30_000);
    expect(KVITTERING_GRAENSE_MS / KVITTERING_RETRY_MS).toBeGreaterThanOrEqual(5);
  });
});
