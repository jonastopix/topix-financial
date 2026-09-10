/**
 * Værnet mod dobbeltbetaling (10/9). Grænserne fra begge sider: det der
 * SKAL spærres (en anden session har allerede betalt perioden; kontrakten er
 * allerede forlænget) og det der SKAL igennem (fortryder og betaler en anden
 * model, fornyelse året efter, fornyelse efter udløb, egen gensendelse).
 */
import { describe, expect, it } from "vitest";
import { dageTilUdloeb, doemFornyelsesdublet, kalenderdag } from "../../../supabase/functions/_shared/fornyelsesVaern.ts";
import { FORNYELSES_VINDUE_DAGE } from "../../../supabase/functions/_shared/fornyelse.ts";

const NU = new Date("2026-09-10T12:00:00Z");
const indgang = { periode_start: "2025-10-01", periode_slut: "2026-10-01", art: "indgang", stripe_reference: "in_1" };

describe("doemFornyelsesdublet — det der skal igennem", () => {
  it("første fornyelse, betalt tidligt: ny start = gammel slut; slut = start er IKKE overlap", () => {
    const dom = doemFornyelsesdublet({ perioder: [indgang], nyPeriodeStart: "2026-10-01", contractEndDate: "2026-10-01", now: NU });
    expect(dom).toEqual({ dublet: false });
  });
  it("præcis på vinduets grænse (60 dage) er lovligt — som tilstandsdommen", () => {
    const slut = new Date(NU); slut.setUTCDate(slut.getUTCDate() + FORNYELSES_VINDUE_DAGE);
    const s = slut.toISOString().slice(0, 10);
    expect(doemFornyelsesdublet({ perioder: [{ ...indgang, periode_slut: s }], nyPeriodeStart: s, contractEndDate: s, now: NU })).toEqual({ dublet: false });
  });
  it("fornyelse ÅRET EFTER: alle perioders slut ≤ ny start, kontrakten inden for vinduet", () => {
    const fornyelse = { periode_start: "2026-10-01", periode_slut: "2027-10-01", art: "fornyelse", stripe_reference: "cs_1" };
    const dom = doemFornyelsesdublet({
      perioder: [indgang, fornyelse],
      nyPeriodeStart: "2027-10-01",
      contractEndDate: "2027-10-01",
      now: new Date("2027-08-15T09:00:00Z"),
    });
    expect(dom).toEqual({ dublet: false });
  });
  it("fornyelse EFTER udløb: ny start = betalingsdagen, efter alle slut", () => {
    const dom = doemFornyelsesdublet({ perioder: [indgang], nyPeriodeStart: "2026-10-08", contractEndDate: "2026-10-01", now: new Date("2026-10-08T09:00:00Z") });
    expect(dom).toEqual({ dublet: false });
  });
  it("fortryder og betaler en ANDEN model: første session blev aldrig betalt → ingen periode, dato uændret → igennem", () => {
    const dom = doemFornyelsesdublet({ perioder: [indgang], nyPeriodeStart: "2026-10-01", contractEndDate: "2026-10-01", now: NU });
    expect(dom.dublet).toBe(false);
  });
  it("egen session (gensendelse) tæller ikke som dublet", () => {
    const egen = { periode_start: "2026-10-01", periode_slut: "2027-10-01", art: "fornyelse", stripe_reference: "cs_egen" };
    const dom = doemFornyelsesdublet({ perioder: [indgang, egen], nyPeriodeStart: "2026-10-01", contractEndDate: "2026-10-01", now: NU, egenReference: "cs_egen" });
    expect(dom).toEqual({ dublet: false });
  });
  it("ingen perioder og ingen slutdato → igennem (dommen gætter ikke)", () => {
    expect(doemFornyelsesdublet({ perioder: [], nyPeriodeStart: "2026-10-01", contractEndDate: null, now: NU })).toEqual({ dublet: false });
  });
});

describe("doemFornyelsesdublet — det der skal spærres", () => {
  it("en ANDEN session har allerede skrevet perioden (webhook halvt udført: dato ikke sat) → periode_daekker_start", () => {
    const anden = { periode_start: "2026-10-01", periode_slut: "2027-10-01", art: "fornyelse", stripe_reference: "cs_anden" };
    const dom = doemFornyelsesdublet({ perioder: [indgang, anden], nyPeriodeStart: "2026-10-01", contractEndDate: "2026-10-01", now: NU, egenReference: "cs_egen" });
    expect(dom.dublet).toBe(true);
    if (dom.dublet) {
      expect(dom.grund).toBe("periode_daekker_start");
      expect(dom.detalje).toContain("cs_anden");
    }
  });
  it("kontrakten er allerede forlænget (webhook 1 kørte, session 2 kommer): ny start et år ude, men kontrakten er > 60 dage → kontrakt_uden_for_vinduet", () => {
    const fornyelse = { periode_start: "2026-10-01", periode_slut: "2027-10-01", art: "fornyelse", stripe_reference: "cs_1" };
    // beregnFornyelsesperiode ville nu give start 2027-10-01 (gammel slut) — ingen periode dækker den, men kontrakten røber det
    const dom = doemFornyelsesdublet({ perioder: [indgang, fornyelse], nyPeriodeStart: "2027-10-01", contractEndDate: "2027-10-01", now: NU, egenReference: "cs_2" });
    expect(dom.dublet).toBe(true);
    if (dom.dublet) expect(dom.grund).toBe("kontrakt_uden_for_vinduet");
  });
  it("én dag over vinduet spærrer; datoen rullet tilbage i hånden spærres af perioden", () => {
    const slut = new Date(NU); slut.setUTCDate(slut.getUTCDate() + FORNYELSES_VINDUE_DAGE + 1);
    const s = slut.toISOString().slice(0, 10);
    expect(doemFornyelsesdublet({ perioder: [], nyPeriodeStart: s, contractEndDate: s, now: NU }).dublet).toBe(true);
    // rådgiveren satte contract_end_date tilbage til 2026-10-01, men fornyelsen 2026-10-01 → 2027-10-01 er betalt
    const fornyelse = { periode_start: "2026-10-01", periode_slut: "2027-10-01", art: "fornyelse", stripe_reference: "cs_1" };
    const dom = doemFornyelsesdublet({ perioder: [fornyelse], nyPeriodeStart: "2026-10-01", contractEndDate: "2026-10-01", now: NU });
    expect(dom.dublet && dom.grund).toBe("periode_daekker_start");
  });
  it("perioden vinder over kontrakten når begge gælder (grunden peger på det konkrete spor)", () => {
    const fornyelse = { periode_start: "2026-10-01", periode_slut: "2027-10-01", art: "fornyelse", stripe_reference: "cs_1" };
    const dom = doemFornyelsesdublet({ perioder: [fornyelse], nyPeriodeStart: "2026-10-01", contractEndDate: "2027-10-01", now: NU });
    expect(dom.dublet && dom.grund).toBe("periode_daekker_start");
  });
});

describe("hjælperne", () => {
  it("kalenderdag læser tidsstempler og datoer som UTC-dag; dageTilUdloeb er UTC-kalenderdage", () => {
    expect(kalenderdag("2026-10-01T23:30:00+02:00")).toBe("2026-10-01");
    expect(kalenderdag("2026-10-01")).toBe("2026-10-01");
    expect(kalenderdag("ikke en dato")).toBeNull();
    expect(kalenderdag(null)).toBeNull();
    expect(dageTilUdloeb("2026-10-01", NU)).toBe(21);
    expect(dageTilUdloeb("2026-09-10", NU)).toBe(0);
    expect(dageTilUdloeb("bogus", NU)).toBeNull();
  });
});
