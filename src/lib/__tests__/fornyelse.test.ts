import { describe, it, expect } from "vitest";
import {
  afgoerFornyelsestilstand,
  FORNYELSES_VINDUE_DAGE,
  type FornyelseInput,
} from "../fornyelse";

/**
 * Fast "nu" i alle tests: 2026-08-11 kl. 10:00 UTC. Dage-beregningen kører
 * på UTC-komponenter, så resultaterne skal være identiske lokalt (CET/CEST)
 * og under TZ=UTC — suiten køres i begge tilstande i CI-flowet.
 */
const NU = new Date("2026-08-11T10:00:00.000Z");

/** Slutdato præcis n kalenderdage efter NU (date-only, som companies-kolonnen). */
function slutdatoOmDage(n: number): string {
  const d = new Date(Date.UTC(2026, 7, 11) + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const input = (overrides: Partial<FornyelseInput> = {}): FornyelseInput => ({
  contract_end_date: slutdatoOmDage(90),
  subscription_status: null,
  subscription_current_period_end: null,
  beslutning: null,
  ...overrides,
});

describe("afgoerFornyelsestilstand — de otte statusværdier", () => {
  it("ingen_slutdato: contract_end_date = null → tier no_date, dage = null", () => {
    const ud = afgoerFornyelsestilstand(input({ contract_end_date: null }), NU);
    expect(ud).toEqual({ status: "ingen_slutdato", dage_til_udloeb: null, tier: "no_date" });
  });

  it("selvbetjener: udløbet kontrakt + aktivt abonnement → egen tilstand, ikke almindelig fornyelse", () => {
    const ud = afgoerFornyelsestilstand(
      input({
        contract_end_date: slutdatoOmDage(-30),
        subscription_status: "active",
        subscription_current_period_end: "2026-12-01T00:00:00.000Z",
        beslutning: "tilbyd", // selv en truffet beslutning ændrer ikke tilstanden
      }),
      NU,
    );
    expect(ud.status).toBe("selvbetjener");
    expect(ud.tier).toBe("subscriber");
    expect(ud.dage_til_udloeb).toBe(-30);
  });

  it("udloebet_uden_beslutning: tier expired og beslutning null", () => {
    const ud = afgoerFornyelsestilstand(input({ contract_end_date: slutdatoOmDage(-10) }), NU);
    expect(ud).toEqual({ status: "udloebet_uden_beslutning", dage_til_udloeb: -10, tier: "expired" });
  });

  it("udloebet_besluttet: tier expired og beslutning sat (begge værdier)", () => {
    for (const beslutning of ["tilbyd", "tilbyd_ikke"] as const) {
      const ud = afgoerFornyelsestilstand(
        input({ contract_end_date: slutdatoOmDage(-10), beslutning }),
        NU,
      );
      expect(ud.status).toBe("udloebet_besluttet");
      expect(ud.tier).toBe("expired");
    }
  });

  it("beslutning_mangler: fuldt medlem, i vinduet, ingen beslutning", () => {
    const ud = afgoerFornyelsestilstand(input({ contract_end_date: slutdatoOmDage(30) }), NU);
    expect(ud).toEqual({ status: "beslutning_mangler", dage_til_udloeb: 30, tier: "full" });
  });

  it("klar_til_tilbud: fuldt medlem, i vinduet, beslutning tilbyd", () => {
    const ud = afgoerFornyelsestilstand(
      input({ contract_end_date: slutdatoOmDage(30), beslutning: "tilbyd" }),
      NU,
    );
    expect(ud.status).toBe("klar_til_tilbud");
  });

  it("klar_til_afsked: fuldt medlem, i vinduet, beslutning tilbyd_ikke", () => {
    const ud = afgoerFornyelsestilstand(
      input({ contract_end_date: slutdatoOmDage(30), beslutning: "tilbyd_ikke" }),
      NU,
    );
    expect(ud.status).toBe("klar_til_afsked");
  });

  it("i_god_tid: fuldt medlem, mere end 60 dage til udløb", () => {
    const ud = afgoerFornyelsestilstand(input({ contract_end_date: slutdatoOmDage(90) }), NU);
    expect(ud).toEqual({ status: "i_god_tid", dage_til_udloeb: 90, tier: "full" });
  });
});

describe("afgoerFornyelsestilstand — grænser", () => {
  it("præcis 60 dage til udløb → i vinduet (beslutning_mangler)", () => {
    const ud = afgoerFornyelsestilstand(
      input({ contract_end_date: slutdatoOmDage(FORNYELSES_VINDUE_DAGE) }),
      NU,
    );
    expect(ud.dage_til_udloeb).toBe(60);
    expect(ud.status).toBe("beslutning_mangler");
  });

  it("61 dage til udløb → i_god_tid", () => {
    const ud = afgoerFornyelsestilstand(
      input({ contract_end_date: slutdatoOmDage(FORNYELSES_VINDUE_DAGE + 1) }),
      NU,
    );
    expect(ud.dage_til_udloeb).toBe(61);
    expect(ud.status).toBe("i_god_tid");
  });

  it("præcis udløbsdagen: dage = 0, tier er expired (date-only midnat er passeret)", () => {
    // computeMembershipTier bruger strengt '>' mod kl. 00:00 UTC på dagen,
    // så på selve udløbsdagen kl. 10 er medlemskabet allerede udløbet.
    const ud = afgoerFornyelsestilstand(input({ contract_end_date: slutdatoOmDage(0) }), NU);
    expect(ud.dage_til_udloeb).toBe(0);
    expect(ud.status).toBe("udloebet_uden_beslutning");
    expect(ud.tier).toBe("expired");
  });

  it("en beslutning truffet i god tid ændrer ikke status før vinduet", () => {
    for (const beslutning of ["tilbyd", "tilbyd_ikke"] as const) {
      const ud = afgoerFornyelsestilstand(
        input({ contract_end_date: slutdatoOmDage(90), beslutning }),
        NU,
      );
      expect(ud.status).toBe("i_god_tid");
    }
  });

  it("tidszone-uafhængighed: nu tæt på lokal midnat giver samme dage-tal (UTC-komponenter)", () => {
    // 23:30 UTC er allerede "i morgen" i dansk lokal tid — dage-beregningen
    // må ikke skifte med maskinens tidszone.
    const sentPaaDagen = new Date("2026-08-11T23:30:00.000Z");
    const ud = afgoerFornyelsestilstand(input({ contract_end_date: "2026-10-10" }), sentPaaDagen);
    expect(ud.dage_til_udloeb).toBe(60);
    expect(ud.status).toBe("beslutning_mangler");
  });

  it("eksporterer vinduet som navngiven konstant", () => {
    expect(FORNYELSES_VINDUE_DAGE).toBe(60);
  });
});
