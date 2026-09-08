import { describe, expect, it } from "vitest";
import { formatDanskDato, kanFortryde, kvittering, sletteDato, sletteknapTekst } from "@/lib/sletteKvittering";
import { afgoerSletning, SLETTEFRIST_ANMODNING_DAGE } from "@/lib/sletning";

const NOW = new Date("2026-09-08T14:30:00Z");

function dageFraNow(n: number): string {
  return new Date(NOW.getTime() + n * 86_400_000).toISOString();
}

describe("sletteKvittering — datoen er motorens", () => {
  it("en anmodning i dag giver en dato syv dage frem", () => {
    expect(sletteDato(NOW)).toBe("2026-09-15");
    expect(SLETTEFRIST_ANMODNING_DAGE).toBe(7);
  });

  it("datoen regnes på UTC-kalenderdagen — sent på aftenen dansk tid flytter ikke dagen", () => {
    // 21:30 UTC = 23:30 dansk sommertid, stadig 8/9 i UTC
    expect(sletteDato("2026-09-08T21:30:00Z")).toBe("2026-09-15");
    // 23:30 UTC = 01:30 dansk 9/9 — men motoren regner UTC, og det gør kvitteringen også
    expect(sletteDato("2026-09-08T23:30:00Z")).toBe("2026-09-15");
  });

  it("kvitteringens dato er præcis motorens frist for vej «anmodning» — alle dage −3…+10", () => {
    for (let n = -3; n <= 10; n++) {
      const anmodet = dageFraNow(n);
      const dom = afgoerSletning(
        { contract_end_date: null, offboarding_requested_at: anmodet, beslutning: null, status: null, data_slettet_at: null, subscription_status: null, subscription_current_period_end: null },
        NOW,
      );
      expect(sletteDato(anmodet)).toBe(dom.frist);
    }
  });

  it("formateres som husets datoer: «15. september 2026»", () => {
    expect(formatDanskDato("2026-09-15")).toBe("15. september 2026");
    expect(formatDanskDato("2026-01-02T00:00:00Z")).toBe("2. januar 2026");
    expect(formatDanskDato("ikke en dato")).toBe("");
  });

  it("fortrydelsesretten: dag 6 efter anmodning kan fortryde, dag 7 kan ikke — samme grænse som motoren", () => {
    expect(kanFortryde(dageFraNow(-6), NOW)).toBe(true);
    expect(kanFortryde(dageFraNow(-7), NOW)).toBe(false);
    expect(kanFortryde(NOW, NOW)).toBe(true);
    expect(kanFortryde(null, NOW)).toBe(false);
  });

  it("kvitteringen siger datoen, at ingen kontakter dem, og fortrydelsesretten", () => {
    const k = kvittering(NOW, NOW)!;
    expect(k.slettesDen).toBe("15. september 2026");
    expect(k.slettesDenIso).toBe("2026-09-15");
    expect(k.kanFortryde).toBe(true);
    expect(k.tekst).toBe("Din data slettes den 15. september 2026. Det sker automatisk — ingen kontakter dig først.");
    expect(k.fortrydelse).toContain("Indtil da kan du fortryde");
    expect(k.tekst + k.fortrydelse).not.toMatch(/hverdage|kontakter dig inden/);
  });

  it("på slettedagen siger kvitteringen at fristen er udløbet", () => {
    const k = kvittering(dageFraNow(-7), NOW)!;
    expect(k.kanFortryde).toBe(false);
    expect(k.fortrydelse).toContain("udløbet");
  });

  it("ulæselig dato giver null, ikke en løgn", () => {
    expect(kvittering("hvad som helst", NOW)).toBeNull();
    expect(sletteDato(undefined)).toBeNull();
  });

  it("knapteksten bærer fristen fra motoren, ikke et hårdkodet tal", () => {
    expect(sletteknapTekst()).toContain(`${SLETTEFRIST_ANMODNING_DAGE} dage`);
    expect(sletteknapTekst()).not.toMatch(/hverdage/);
  });
});
