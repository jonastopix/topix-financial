import { describe, it, expect } from "vitest";
import {
  afgoerForfaldentVarsel,
  VARSEL_1_DAGE_FOER,
  VARSEL_2_DAGE_FOER,
  type FornyelsesvarselInput,
} from "@/lib/fornyelsesvarsel";

// Fast «nu»: 1. oktober 2026 kl. 12:00 UTC (flyttet fra 1. september 7/9:
// med ordningen i kraft 10/9 ville slutdatoer 0–9 dage efter 1/9 ligge
// UDEN FOR ORDNINGEN og aldrig få et varsel — grænsen har sin egen blok). Dagene regnes i hele
// UTC-kalenderdage (fornyelse.ts), så resultatet er ens lokalt og under
// TZ=UTC.
const NU = new Date("2026-10-01T12:00:00.000Z");

/** Slutdato som «YYYY-MM-DD» præcis n kalenderdage efter NU (negativt = før). */
function slutdatoOmDage(n: number): string {
  return new Date(Date.UTC(2026, 9, 1) + n * 86_400_000).toISOString().slice(0, 10);
}

const SENDT = "2026-08-20T09:00:00.000Z";

const input = (dageTilSlut: number | null, over: Partial<FornyelsesvarselInput> = {}): FornyelsesvarselInput => ({
  contract_end_date: dageTilSlut === null ? null : slutdatoOmDage(dageTilSlut),
  beslutning: "tilbyd",
  varsel_1_sendt_at: null,
  varsel_2_sendt_at: null,
  ...over,
});

describe("konstanterne — besluttet 7/9", () => {
  it("varsel 1 ved 30 dage før, varsel 2 ved 7", () => {
    expect(VARSEL_1_DAGE_FOER).toBe(30);
    expect(VARSEL_2_DAGE_FOER).toBe(7);
  });
});

describe("grænsen for varsel 1: dag 31 og 30", () => {
  it("dag 31: intet — for tidligt", () => {
    expect(afgoerForfaldentVarsel(input(31), NU)).toEqual({
      varsel: null,
      grund: "intet: 31 dage til slutdato; varsel 1 forfalder om 1 dag",
      dage_til_udloeb: 31,
    });
  });

  it("dag 30: varsel 1 forfaldent", () => {
    expect(afgoerForfaldentVarsel(input(30), NU)).toEqual({
      varsel: 1,
      grund: "varsel 1 forfaldent: 30 dage til slutdato",
      dage_til_udloeb: 30,
    });
  });

  it("dag 30 med varsel 1 sendt: intet, og loggen siger hvornår", () => {
    expect(afgoerForfaldentVarsel(input(30, { varsel_1_sendt_at: SENDT }), NU)).toEqual({
      varsel: null,
      grund: "intet: varsel 1 allerede sendt 2026-08-20; varsel 2 forfalder om 23 dage",
      dage_til_udloeb: 30,
    });
  });
});

describe("grænsen for varsel 2: dag 8 og 7", () => {
  it("dag 8: stadig varsel 1's område — varsel 1 hvis ikke sendt, ellers intet", () => {
    expect(afgoerForfaldentVarsel(input(8), NU)).toMatchObject({ varsel: 1, dage_til_udloeb: 8 });
    expect(afgoerForfaldentVarsel(input(8, { varsel_1_sendt_at: SENDT }), NU)).toEqual({
      varsel: null,
      grund: "intet: varsel 1 allerede sendt 2026-08-20; varsel 2 forfalder om 1 dag",
      dage_til_udloeb: 8,
    });
  });

  it("dag 7: varsel 2 forfaldent når varsel 1 er sendt", () => {
    expect(afgoerForfaldentVarsel(input(7, { varsel_1_sendt_at: SENDT }), NU)).toEqual({
      varsel: 2,
      grund: "varsel 2 forfaldent: 7 dage til slutdato",
      dage_til_udloeb: 7,
    });
  });

  it("dag 0 (selve slutdagen) er stadig «7 eller færre»: varsel 2 kan sendes", () => {
    expect(afgoerForfaldentVarsel(input(0, { varsel_1_sendt_at: SENDT }), NU)).toMatchObject({
      varsel: 2,
      grund: "varsel 2 forfaldent: 0 dage til slutdato",
      dage_til_udloeb: 0,
    });
  });
});

describe("stemplerne", () => {
  it("begge stempler sat: intet, uanset dag", () => {
    for (const dage of [30, 7, 3, 0]) {
      const ud = afgoerForfaldentVarsel(input(dage, { varsel_1_sendt_at: SENDT, varsel_2_sendt_at: SENDT }), NU);
      expect(ud.varsel).toBeNull();
    }
    expect(afgoerForfaldentVarsel(input(3, { varsel_1_sendt_at: SENDT, varsel_2_sendt_at: "2026-08-25T08:00:00Z" }), NU).grund)
      .toBe("intet: varsel 2 allerede sendt 2026-08-25");
  });

  it("et ulæseligt stempel giver «ukendt dato» i loggen, ikke et nyt varsel", () => {
    expect(afgoerForfaldentVarsel(input(20, { varsel_1_sendt_at: "ikke-en-dato" }), NU).grund)
      .toBe("intet: varsel 1 allerede sendt ukendt dato; varsel 2 forfalder om 13 dage");
  });
});

describe("den sene beslutning — begge forfaldne samtidig", () => {
  it("dag 5 uden stempler: varsel 2, ikke varsel 1 — og loggen siger at 1 springes over", () => {
    expect(afgoerForfaldentVarsel(input(5), NU)).toEqual({
      varsel: 2,
      grund: "varsel 2 forfaldent: 5 dage til slutdato (varsel 1 springes over: sen beslutning)",
      dage_til_udloeb: 5,
    });
  });

  it("dagen efter varsel 2 er sendt: varsel 1 sendes IKKE bagefter", () => {
    const ud = afgoerForfaldentVarsel(input(4, { varsel_2_sendt_at: SENDT }), NU);
    expect(ud).toEqual({ varsel: null, grund: "intet: varsel 2 allerede sendt 2026-08-20", dage_til_udloeb: 4 });
  });

  it("varsel 2 sendt, men NU er der (fx efter rettet slutdato) mere end 7 dage: varsel 1 sendes stadig ikke", () => {
    expect(afgoerForfaldentVarsel(input(20, { varsel_2_sendt_at: SENDT }), NU)).toEqual({
      varsel: null,
      grund: "intet: varsel 2 allerede sendt 2026-08-20, varsel 1 springes over; varsel 2 forfalder om 13 dage",
      dage_til_udloeb: 20,
    });
  });
});

describe("dem der aldrig får et varsel", () => {
  it("tilbyd_ikke: intet — vi sender kun til dem vi HAR besluttet at tilbyde", () => {
    expect(afgoerForfaldentVarsel(input(5, { beslutning: "tilbyd_ikke" }), NU)).toEqual({
      varsel: null,
      grund: "intet: beslutningen er tilbyd_ikke",
      dage_til_udloeb: null,
    });
  });

  it("ingen beslutning: intet", () => {
    expect(afgoerForfaldentVarsel(input(5, { beslutning: null }), NU)).toEqual({
      varsel: null,
      grund: "intet: ingen beslutning truffet",
      dage_til_udloeb: null,
    });
  });

  it("ingen slutdato: intet, og det er ikke en fejl", () => {
    expect(afgoerForfaldentVarsel(input(null), NU)).toEqual({
      varsel: null,
      grund: "intet: ingen slutdato",
      dage_til_udloeb: null,
    });
  });

  it("ulæselig slutdato: intet (fail-closed)", () => {
    expect(afgoerForfaldentVarsel(input(5, { contract_end_date: "ikke-en-dato" }), NU)).toEqual({
      varsel: null,
      grund: "intet: slutdatoen kan ikke læses",
      dage_til_udloeb: null,
    });
  });

  it("dagen efter slutdato: intet — et varsel om noget der er sket, er forkert; tilbuddet er tilstandsmotorens sag", () => {
    expect(afgoerForfaldentVarsel(input(-1), NU)).toEqual({
      varsel: null,
      grund: "intet: slutdatoen er passeret for 1 dag siden",
      dage_til_udloeb: -1,
    });
    expect(afgoerForfaldentVarsel(input(-10), NU).grund).toBe("intet: slutdatoen er passeret for 10 dage siden");
  });
});

describe("formen", () => {
  it("højst ét varsel pr. dag, og samme input giver samme output uden at mutere det", () => {
    const i = input(7);
    const foer = JSON.stringify(i);
    const a = afgoerForfaldentVarsel(i, NU);
    const b = afgoerForfaldentVarsel(i, NU);
    expect(a).toEqual(b);
    expect([1, 2, null]).toContain(a.varsel);
    expect(JSON.stringify(i)).toBe(foer);
  });

  it("nu tæt på UTC-midnat ændrer ikke dagtallet", () => {
    const sent = new Date("2026-10-01T23:30:00.000Z");
    expect(afgoerForfaldentVarsel(input(30), sent).dage_til_udloeb).toBe(30);
  });
});

// ── Ordningens grænse: ingen varsler til nogen der ikke kan handle (7/9) ──
//
// CARMA STUDIO fik varsel 2 den 7/9 kl. 11:57 med en knap der ikke
// virkede: slutdato 7/9, ordningen i kraft 10/9 → afgoerFornyelsestilstand
// siger uden_for_ordningen, hent-fornyelsestilbud giver { tilbud: null },
// checkout 403, båndet vises ikke. Motoren her læste kun dagene af
// tilstanden, aldrig status. Nu spørger den — og tier med grund.
describe("uden for ordningen: slutdato på eller før 2026-09-10 får ALDRIG et varsel, uanset dage", () => {
  const paaEllerFoer = ["2026-09-10", "2026-09-09", "2026-09-07", "2026-08-31"];
  const nuer = [
    new Date("2026-08-01T12:00:00.000Z"), // 30–40 dage før: varsel 1-vinduet
    new Date("2026-09-01T12:00:00.000Z"), // 0–9 dage før: varsel 2-vinduet
    new Date("2026-09-07T11:57:00.000Z"), // CARMAs faktiske øjeblik
  ];
  for (const slutdato of paaEllerFoer) {
    for (const nu of nuer) {
      it(`slutdato ${slutdato}, nu ${nu.toISOString().slice(0, 10)}: intet, blokeret_af uden_for_ordningen`, () => {
        const ud = afgoerForfaldentVarsel({ contract_end_date: slutdato, beslutning: "tilbyd", varsel_1_sendt_at: null, varsel_2_sendt_at: null }, nu);
        // Efter slutdatoen vinder gren 4 (passeret) — den er også «intet».
        expect(ud.varsel).toBeNull();
        if (ud.dage_til_udloeb !== null && ud.dage_til_udloeb >= 0) {
          expect(ud.blokeret_af).toBe("uden_for_ordningen");
          expect(ud.grund).toBe(`intet: uden for ordningen — slutdatoen ${slutdato} er på eller før 2026-09-10, og medlemmet kan ikke forny`);
        }
      });
    }
  }

  it("CARMA STUDIO 7/9 kl. 11:57: slutdato 7/9, tilbyd, intet sendt → INTET (dag 0, som før gav varsel 2)", () => {
    const ud = afgoerForfaldentVarsel(
      { contract_end_date: "2026-09-07", beslutning: "tilbyd", varsel_1_sendt_at: null, varsel_2_sendt_at: null },
      new Date("2026-09-07T11:57:00.000Z"),
    );
    expect(ud).toEqual({
      varsel: null,
      grund: "intet: uden for ordningen — slutdatoen 2026-09-07 er på eller før 2026-09-10, og medlemmet kan ikke forny",
      dage_til_udloeb: 0,
      blokeret_af: "uden_for_ordningen",
    });
  });

  it("gren 1-4 vinder stadig før gren 5: tilbyd_ikke, ingen slutdato og passeret slutdato bærer IKKE blokeret_af", () => {
    const nu = new Date("2026-09-05T12:00:00.000Z");
    expect(afgoerForfaldentVarsel({ contract_end_date: "2026-09-07", beslutning: "tilbyd_ikke", varsel_1_sendt_at: null, varsel_2_sendt_at: null }, nu).blokeret_af).toBeUndefined();
    expect(afgoerForfaldentVarsel({ contract_end_date: "2026-09-01", beslutning: "tilbyd", varsel_1_sendt_at: null, varsel_2_sendt_at: null }, nu).blokeret_af).toBeUndefined();
  });
});

describe("grænsen fra den anden side: slutdato 2026-09-11 med tilbyd FÅR sit varsel", () => {
  const SLUT = "2026-09-11";
  const uden = { contract_end_date: SLUT, beslutning: "tilbyd" as const, varsel_1_sendt_at: null, varsel_2_sendt_at: null };

  it("30 dage før (12/8): varsel 1", () => {
    const ud = afgoerForfaldentVarsel(uden, new Date("2026-08-12T12:00:00.000Z"));
    expect(ud).toEqual({ varsel: 1, grund: "varsel 1 forfaldent: 30 dage til slutdato", dage_til_udloeb: 30 });
  });

  it("7 dage før (4/9), varsel 1 sendt: varsel 2", () => {
    const ud = afgoerForfaldentVarsel({ ...uden, varsel_1_sendt_at: SENDT }, new Date("2026-09-04T12:00:00.000Z"));
    expect(ud).toEqual({ varsel: 2, grund: "varsel 2 forfaldent: 7 dage til slutdato", dage_til_udloeb: 7 });
  });

  it("på selve slutdagen (11/9), varsel 1 sendt: varsel 2 — dagen efter ordningen begyndte", () => {
    const ud = afgoerForfaldentVarsel({ ...uden, varsel_1_sendt_at: SENDT }, new Date("2026-09-11T12:00:00.000Z"));
    expect(ud.varsel).toBe(2);
    expect(ud.blokeret_af).toBeUndefined();
  });

  it("i god tid (60+ dage før) bærer ikke blokeret_af — for tidligt, ikke blokeret", () => {
    const ud = afgoerForfaldentVarsel(uden, new Date("2026-06-01T12:00:00.000Z"));
    expect(ud.varsel).toBeNull();
    expect(ud.blokeret_af).toBeUndefined();
    expect(ud.grund).toMatch(/^intet: \d+ dage til slutdato; varsel 1 forfalder om/);
  });
});
