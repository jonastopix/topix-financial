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

// 15/9 (PR 3): inputtet bærer også vinduesstemplerne og abonnementsfelterne
// (alle null her — tilstanden før slutdato er uændret af dem).
const TOMME_VINDUER = { vindue_1_sendt_at: null, vindue_2_sendt_at: null, subscription_status: null, subscription_current_period_end: null } as const;

const input = (dageTilSlut: number | null, over: Partial<FornyelsesvarselInput> = {}): FornyelsesvarselInput => ({
  contract_end_date: dageTilSlut === null ? null : slutdatoOmDage(dageTilSlut),
  beslutning: "tilbyd",
  varsel_1_sendt_at: null,
  varsel_2_sendt_at: null,
  ...TOMME_VINDUER,
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

  // ÆNDRET 15/9 (PR 3, Jonas' valg A): efter slutdato med «tilbyd» og inde i
  // de 14 dage er der nu VINDUESMAILS — dag 1 og dag 10 er vindue 1. Før:
  // «dagen efter slutdato: intet … tilbuddet er tilstandsmotorens sag»
  // (input(-1) → null, "intet: slutdatoen er passeret for 1 dag siden";
  // input(-10) → "… 10 dage siden"). Varslerne 1 og 2 sendes stadig kun
  // før/på slutdatoen.
  it("dagen efter slutdato med tilbyd: VINDUE 1 (15/9) — dag 1 og dag 10 er begge vindue 1", () => {
    expect(afgoerForfaldentVarsel(input(-1), NU)).toEqual({
      varsel: "vindue_1",
      grund: "vindue 1 forfaldent: slutdatoen er passeret for 1 dag siden; kan forlænge til og med dag 14",
      dage_til_udloeb: -1,
    });
    expect(afgoerForfaldentVarsel(input(-10), NU)).toMatchObject({ varsel: "vindue_1", dage_til_udloeb: -10 });
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
      it(`slutdato ${slutdato}, nu ${nu.toISOString().slice(0, 10)}: intet FØR slutdato (blokeret_af uden_for_ordningen); efter slutdato vindue 1 (15/9)`, () => {
        const ud = afgoerForfaldentVarsel({ contract_end_date: slutdato, beslutning: "tilbyd", varsel_1_sendt_at: null, varsel_2_sendt_at: null, ...TOMME_VINDUER }, nu);
        if (ud.dage_til_udloeb !== null && ud.dage_til_udloeb >= 0) {
          expect(ud.varsel).toBeNull();
          expect(ud.blokeret_af).toBe("uden_for_ordningen");
          expect(ud.grund).toBe(`intet: uden for ordningen — slutdatoen ${slutdato} er på eller før 2026-09-10, og medlemmet kan ikke forny`);
        } else if (ud.dage_til_udloeb !== null) {
          // ÆNDRET 15/9 (PR 3): før vandt gren 4 (passeret → intet) også her.
          // afgoerFornyelsestilstand dømmer udløbet FØR ordningens grænse, så
          // en udløbet «tilbyd» inden for 14 dage er udloebet_tilbyd (tilbuddet
          // står i gaten — bevist for Studio Mini) og får vindue 1/2; dag 15+ intet.
          const dagEfter = -ud.dage_til_udloeb;
          if (dagEfter <= 10) expect(ud.varsel).toBe("vindue_1");
          else if (dagEfter <= 14) expect(ud.varsel).toBe("vindue_2");
          else expect(ud.varsel).toBeNull();
          expect(ud.blokeret_af).toBeUndefined();
        }
      });
    }
  }

  it("CARMA STUDIO 7/9 kl. 11:57: slutdato 7/9, tilbyd, intet sendt → INTET (dag 0, som før gav varsel 2)", () => {
    const ud = afgoerForfaldentVarsel(
      { contract_end_date: "2026-09-07", beslutning: "tilbyd", varsel_1_sendt_at: null, varsel_2_sendt_at: null, ...TOMME_VINDUER },
      new Date("2026-09-07T11:57:00.000Z"),
    );
    expect(ud).toEqual({
      varsel: null,
      grund: "intet: uden for ordningen — slutdatoen 2026-09-07 er på eller før 2026-09-10, og medlemmet kan ikke forny",
      dage_til_udloeb: 0,
      blokeret_af: "uden_for_ordningen",
    });
  });

  // ÆNDRET 15/9 (PR 3): «passeret slutdato» (1/9 set fra 5/9 = dag 4) er nu
  // vindue 1, ikke «intet» — men bærer stadig IKKE blokeret_af (gren 4 er
  // afgjort før gren 5). Før: begge kald gav varsel null uden blokeret_af.
  it("gren 1-4 vinder stadig før gren 5: tilbyd_ikke og passeret slutdato bærer IKKE blokeret_af — passeret med tilbyd er vindue 1", () => {
    const nu = new Date("2026-09-05T12:00:00.000Z");
    expect(afgoerForfaldentVarsel({ contract_end_date: "2026-09-07", beslutning: "tilbyd_ikke", varsel_1_sendt_at: null, varsel_2_sendt_at: null, ...TOMME_VINDUER }, nu).blokeret_af).toBeUndefined();
    const passeret = afgoerForfaldentVarsel({ contract_end_date: "2026-09-01", beslutning: "tilbyd", varsel_1_sendt_at: null, varsel_2_sendt_at: null, ...TOMME_VINDUER }, nu);
    expect(passeret.blokeret_af).toBeUndefined();
    expect(passeret.varsel).toBe("vindue_1");
  });
});

describe("grænsen fra den anden side: slutdato 2026-09-11 med tilbyd FÅR sit varsel", () => {
  const SLUT = "2026-09-11";
  const uden = { contract_end_date: SLUT, beslutning: "tilbyd" as const, varsel_1_sendt_at: null, varsel_2_sendt_at: null, ...TOMME_VINDUER };

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

// ── VINDUESMAILENE (15/9, PR 3 — Jonas' valg A; chattens C1–C2) ─────────────
//
// Efter slutdato, kun med «tilbyd» og tilstanden udloebet_tilbyd: dag 1–10
// vindue 1, dag 11–14 vindue 2 (uden vindue 1 → kun vindue 2), dag 15+
// intet (lukket). Abonnementsfelterne dømmer med: et aktivt abonnement er
// selvbetjener, ikke udløbet. CARMA STUDIO (slut 2026-09-11) konkret.
describe("vinduesmailene — dag 1–10 vindue 1, dag 11–14 vindue 2, dag 15+ intet", () => {
  const V1 = "2026-10-02T11:00:00.000Z";
  const V2 = "2026-10-12T11:00:00.000Z";

  it("dag 0 (slutdagen) med varsel 2 sendt: intet — dag 0 er varslernes, ikke vinduets", () => {
    const ud = afgoerForfaldentVarsel(input(0, { varsel_1_sendt_at: SENDT, varsel_2_sendt_at: SENDT }), NU);
    expect(ud.varsel).toBeNull();
    expect(ud.dage_til_udloeb).toBe(0);
  });

  it("dag 1: vindue 1; dag 10: vindue 1", () => {
    expect(afgoerForfaldentVarsel(input(-1), NU).varsel).toBe("vindue_1");
    expect(afgoerForfaldentVarsel(input(-10), NU)).toEqual({
      varsel: "vindue_1",
      grund: "vindue 1 forfaldent: slutdatoen er passeret for 10 dage siden; kan forlænge til og med dag 14",
      dage_til_udloeb: -10,
    });
  });

  it("dag 10 med vindue 1 stemplet: intet, og loggen siger hvornår vindue 2 forfalder", () => {
    expect(afgoerForfaldentVarsel(input(-10, { vindue_1_sendt_at: V1 }), NU)).toEqual({
      varsel: null,
      grund: "intet: slutdatoen er passeret for 10 dage siden — vindue 1 allerede sendt 2026-10-02; vindue 2 forfalder om 1 dag",
      dage_til_udloeb: -10,
    });
  });

  it("dag 11: vindue 2 — også uden vindue 1 (kun vindue 2, vindue 1 springes over)", () => {
    expect(afgoerForfaldentVarsel(input(-11, { vindue_1_sendt_at: V1 }), NU)).toEqual({
      varsel: "vindue_2",
      grund: "vindue 2 forfaldent: slutdatoen er passeret for 11 dage siden; tilbuddet lukker efter dag 14",
      dage_til_udloeb: -11,
    });
    expect(afgoerForfaldentVarsel(input(-11), NU)).toEqual({
      varsel: "vindue_2",
      grund: "vindue 2 forfaldent: slutdatoen er passeret for 11 dage siden; tilbuddet lukker efter dag 14 (vindue 1 springes over)",
      dage_til_udloeb: -11,
    });
    // og vindue 1 sendes ikke bagefter, når vindue 2 er sendt
    expect(afgoerForfaldentVarsel(input(-12, { vindue_2_sendt_at: V2 }), NU).grund).toBe("intet: slutdatoen er passeret for 12 dage siden — vindue 2 allerede sendt 2026-10-12");
  });

  it("dag 14: vindue 2 (sidste dag); dag 15: intet — tilbudsvinduet er lukket, uanset stempler", () => {
    expect(afgoerForfaldentVarsel(input(-14, { vindue_1_sendt_at: V1 }), NU).varsel).toBe("vindue_2");
    expect(afgoerForfaldentVarsel(input(-15), NU)).toEqual({
      varsel: null,
      grund: "intet: slutdatoen er passeret for 15 dage siden — tilbudsvinduet er lukket",
      dage_til_udloeb: -15,
    });
    expect(afgoerForfaldentVarsel(input(-15, { vindue_1_sendt_at: V1, vindue_2_sendt_at: V2 }), NU).varsel).toBeNull();
  });

  it("tilbyd_ikke og ingen beslutning: intet — også efter slutdato", () => {
    expect(afgoerForfaldentVarsel(input(-5, { beslutning: "tilbyd_ikke" }), NU)).toEqual({ varsel: null, grund: "intet: beslutningen er tilbyd_ikke", dage_til_udloeb: null });
    expect(afgoerForfaldentVarsel(input(-5, { beslutning: null }), NU).varsel).toBeNull();
  });

  it("aktivt abonnement efter slutdato: intet — medlemmet er selvbetjener, ikke udløbet (C2)", () => {
    const ud = afgoerForfaldentVarsel(input(-5, { subscription_status: "active", subscription_current_period_end: "2027-01-01T00:00:00.000Z" }), NU);
    expect(ud).toEqual({
      varsel: null,
      grund: "intet: slutdatoen er passeret for 5 dage siden — medlemmet er selvbetjener (aktivt abonnement)",
      dage_til_udloeb: -5,
    });
    // et udløbet abonnement gør ikke medlemmet til selvbetjener
    expect(afgoerForfaldentVarsel(input(-5, { subscription_status: "active", subscription_current_period_end: "2026-09-01T00:00:00.000Z" }), NU).varsel).toBe("vindue_1");
  });

  it("abonnementsfelterne ændrer INTET før slutdato (varslerne som i dag)", () => {
    const med = { subscription_status: "active", subscription_current_period_end: "2027-01-01T00:00:00.000Z" };
    expect(afgoerForfaldentVarsel(input(30, med), NU)).toEqual(afgoerForfaldentVarsel(input(30), NU));
    expect(afgoerForfaldentVarsel(input(7, { ...med, varsel_1_sendt_at: SENDT }), NU).varsel).toBe(2);
  });

  it("CARMA STUDIO (slut 2026-09-11, tilbyd, varsel 2 sendt 7/9): 12/9 vindue 1 (dag 1), 15/9 vindue 1 (dag 4), 21/9 vindue 1 (dag 10), 22/9 vindue 2 (dag 11), 25/9 vindue 2 (dag 14), 26/9 intet (dag 15)", () => {
    const carma: FornyelsesvarselInput = {
      contract_end_date: "2026-09-11",
      beslutning: "tilbyd",
      varsel_1_sendt_at: null,
      varsel_2_sendt_at: "2026-09-07T11:57:50.375Z",
      ...TOMME_VINDUER,
    };
    const paa = (dato: string, over: Partial<FornyelsesvarselInput> = {}) => afgoerForfaldentVarsel({ ...carma, ...over }, new Date(`${dato}T11:00:00.000Z`));
    expect(paa("2026-09-11").varsel).toBeNull(); // dag 0: varsel 2 allerede sendt
    expect(paa("2026-09-12")).toMatchObject({ varsel: "vindue_1", dage_til_udloeb: -1 });
    expect(paa("2026-09-15")).toMatchObject({ varsel: "vindue_1", dage_til_udloeb: -4 });
    expect(paa("2026-09-21")).toMatchObject({ varsel: "vindue_1", dage_til_udloeb: -10 });
    expect(paa("2026-09-21", { vindue_1_sendt_at: "2026-09-16T11:00:00.000Z" }).varsel).toBeNull();
    expect(paa("2026-09-22", { vindue_1_sendt_at: "2026-09-16T11:00:00.000Z" })).toMatchObject({ varsel: "vindue_2", dage_til_udloeb: -11 });
    expect(paa("2026-09-25", { vindue_1_sendt_at: "2026-09-16T11:00:00.000Z" })).toMatchObject({ varsel: "vindue_2", dage_til_udloeb: -14 });
    expect(paa("2026-09-26", { vindue_1_sendt_at: "2026-09-16T11:00:00.000Z" })).toMatchObject({ varsel: null, dage_til_udloeb: -15 });
  });
});
