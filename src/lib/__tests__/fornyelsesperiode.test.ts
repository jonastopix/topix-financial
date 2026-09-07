import { describe, it, expect } from "vitest";
import { beregnFornyelsesperiode, tolvMaanederFrem } from "../fornyelsesperiode";

/**
 * Regnestykket besluttet 7/9 (Jonas): betaling FØR eller PÅ slutdatoen
 * giver gammel slutdato + 12 måneder (den der handler tidligt mister
 * ingen dage); betaling EFTER giver betalingsdagen + 12 måneder (dagene
 * uden adgang gives ikke tilbage). Grænsen er <= i hele UTC-kalenderdage.
 * Betalingsdagen gives som Date og læses som UTC-kalenderdag; alle
 * tidspunkter herunder er UTC, så suiten er ens lokalt og under TZ=UTC.
 */
const GAMMEL = "2026-09-29";

describe("beregnFornyelsesperiode — de to grene (Jonas' eksempler 7/9)", () => {
  it("før slutdatoen: gammel 2026-09-29, betalt 2026-09-07 → ny 2027-09-29, periode fra den gamle slutdato", () => {
    const ud = beregnFornyelsesperiode(GAMMEL, new Date("2026-09-07T10:00:00.000Z"));
    expect(ud).toEqual({ periode_start: "2026-09-29", periode_slut: "2027-09-29", gren: "foer_udloeb" });
  });

  it("efter slutdatoen: gammel 2026-09-29, betalt 2026-10-05 → ny 2027-10-05, periode fra betalingsdagen", () => {
    const ud = beregnFornyelsesperiode(GAMMEL, new Date("2026-10-05T10:00:00.000Z"));
    expect(ud).toEqual({ periode_start: "2026-10-05", periode_slut: "2027-10-05", gren: "efter_udloeb" });
  });

  it("periode_slut er altid periode_start + 12 måneder — i begge grene", () => {
    for (const betalt of ["2026-09-07", "2026-09-29", "2026-09-30", "2026-10-13"]) {
      const ud = beregnFornyelsesperiode(GAMMEL, new Date(`${betalt}T12:00:00.000Z`));
      expect(ud.periode_slut).toBe(tolvMaanederFrem(ud.periode_start));
    }
  });
});

describe("beregnFornyelsesperiode — grænsen fra begge sider", () => {
  it("betaling PRÆCIS på slutdatoen hører til før-grenen (<=): ny slutdato = gammel + 12", () => {
    const ud = beregnFornyelsesperiode(GAMMEL, new Date("2026-09-29T00:00:00.000Z"));
    expect(ud).toEqual({ periode_start: "2026-09-29", periode_slut: "2027-09-29", gren: "foer_udloeb" });
  });

  it("betaling sidst på slutdagen (23:59 UTC) er stadig PÅ slutdatoen — kalenderdag, ikke tidsstempel", () => {
    const ud = beregnFornyelsesperiode(GAMMEL, new Date("2026-09-29T23:59:59.000Z"));
    expect(ud.gren).toBe("foer_udloeb");
    expect(ud.periode_slut).toBe("2027-09-29");
  });

  it("betaling dagen efter slutdatoen (00:00 UTC) er efter-grenen: ny slutdato = betalingsdag + 12", () => {
    const ud = beregnFornyelsesperiode(GAMMEL, new Date("2026-09-30T00:00:00.000Z"));
    expect(ud).toEqual({ periode_start: "2026-09-30", periode_slut: "2027-09-30", gren: "efter_udloeb" });
  });

  it("dagen før slutdatoen er før-grenen, og dagen efter er efter-grenen — samme gamle slutdato", () => {
    expect(beregnFornyelsesperiode(GAMMEL, new Date("2026-09-28T12:00:00.000Z")).gren).toBe("foer_udloeb");
    expect(beregnFornyelsesperiode(GAMMEL, new Date("2026-09-30T12:00:00.000Z")).gren).toBe("efter_udloeb");
  });

  it("gammel slutdato som tidsstempel læses som UTC-kalenderdag", () => {
    const ud = beregnFornyelsesperiode("2026-09-29T00:00:00+00:00", new Date("2026-09-29T12:00:00.000Z"));
    expect(ud).toEqual({ periode_start: "2026-09-29", periode_slut: "2027-09-29", gren: "foer_udloeb" });
  });
});

describe("beregnFornyelsesperiode — langt før og langt efter", () => {
  it("betaling 50 dage før slutdatoen mister ingen dage: ny slutdato = gammel + 12", () => {
    const ud = beregnFornyelsesperiode(GAMMEL, new Date("2026-08-10T12:00:00.000Z"));
    expect(ud).toEqual({ periode_start: "2026-09-29", periode_slut: "2027-09-29", gren: "foer_udloeb" });
  });

  it("betaling langt efter slutdatoen (100 dage) regnes fra betalingsdagen — funktionen dømmer ikke vinduet", () => {
    const ud = beregnFornyelsesperiode(GAMMEL, new Date("2027-01-07T12:00:00.000Z"));
    expect(ud).toEqual({ periode_start: "2027-01-07", periode_slut: "2028-01-07", gren: "efter_udloeb" });
  });
});

describe("beregnFornyelsesperiode — gammel slutdato null eller ulæselig", () => {
  it("null: ingen slutdato at være før — efter-grenen med betalingsdagen som anker (dagens regnestykke)", () => {
    const ud = beregnFornyelsesperiode(null, new Date("2026-10-05T10:00:00.000Z"));
    expect(ud).toEqual({ periode_start: "2026-10-05", periode_slut: "2027-10-05", gren: "efter_udloeb" });
  });

  it("ulæselig streng behandles som null", () => {
    const ud = beregnFornyelsesperiode("ikke-en-dato", new Date("2026-10-05T10:00:00.000Z"));
    expect(ud).toEqual({ periode_start: "2026-10-05", periode_slut: "2027-10-05", gren: "efter_udloeb" });
  });
});

describe("tolvMaanederFrem — 29. februar, reglen skrevet ud", () => {
  it("almindelig dag: samme kalenderdag året efter", () => {
    expect(tolvMaanederFrem("2026-09-29")).toBe("2027-09-29");
    expect(tolvMaanederFrem("2026-01-31")).toBe("2027-01-31");
    expect(tolvMaanederFrem("2027-02-28")).toBe("2028-02-28");
  });

  it("29. februar: dagen findes ikke året efter → 1. marts (slutdatoen er eksklusiv: adgang til og med 28/2)", () => {
    expect(tolvMaanederFrem("2028-02-29")).toBe("2029-03-01");
    expect(tolvMaanederFrem("2024-02-29")).toBe("2025-03-01");
  });

  it("29. februar gennem begge grene: gammel slutdato 29/2 (før), og betaling 29/2 (efter)", () => {
    const foer = beregnFornyelsesperiode("2028-02-29", new Date("2028-02-10T12:00:00.000Z"));
    expect(foer).toEqual({ periode_start: "2028-02-29", periode_slut: "2029-03-01", gren: "foer_udloeb" });
    const efter = beregnFornyelsesperiode("2028-02-01", new Date("2028-02-29T12:00:00.000Z"));
    expect(efter).toEqual({ periode_start: "2028-02-29", periode_slut: "2029-03-01", gren: "efter_udloeb" });
  });

  it("28. februar i et skudår ruller IKKE: 2028-02-28 → 2029-02-28", () => {
    expect(tolvMaanederFrem("2028-02-28")).toBe("2029-02-28");
  });

  it("31. december og nytår: årsskiftet håndteres på UTC-komponenter", () => {
    expect(tolvMaanederFrem("2026-12-31")).toBe("2027-12-31");
    const ud = beregnFornyelsesperiode("2026-12-31", new Date("2027-01-01T00:00:00.000Z"));
    expect(ud).toEqual({ periode_start: "2027-01-01", periode_slut: "2028-01-01", gren: "efter_udloeb" });
  });
});
