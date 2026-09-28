import { describe, expect, it } from "vitest";
import { antalFraSvar, rejselinje, type RejseTal } from "@/lib/hjemmebane/rejselinje";
import { HentningsFejl } from "@/lib/kraevRaekker";

/**
 * Anerkendelseslinjen (28/9-2026): husets regel for de tre eksisterende dele,
 * uændret — og den fjerde, refleksionerne, efter præcis samme regel.
 */
const NUL: RejseTal = { rapporterIAar: 0, maalNaaet: 0, videoerGennemfoert: 0, refleksioner: 0 };

describe("rejselinje — de tre eksisterende dele, uændret", () => {
  it("alle nul → null (kortet beholder sin rolige sætning)", () => {
    expect(rejselinje(NUL)).toBeNull();
  });
  it("ental ved 1 i hver del", () => {
    expect(rejselinje({ ...NUL, rapporterIAar: 1, maalNaaet: 1, videoerGennemfoert: 1 })).toBe(
      "Og rejsen kan ses: 1 godkendt rapport i år · 1 mål nået · 1 video gennemført i Akademiet.",
    );
  });
  it("flertal ved flere", () => {
    expect(rejselinje({ ...NUL, rapporterIAar: 3, maalNaaet: 2, videoerGennemfoert: 5 })).toBe(
      "Og rejsen kan ses: 3 godkendte rapporter i år · 2 mål nået · 5 videoer gennemført i Akademiet.",
    );
  });
});

describe("rejselinje — den fjerde del: refleksionerne (Jonas 28/9)", () => {
  it("0 refleksioner → delen udelades, som de øvrige gør", () => {
    expect(rejselinje({ ...NUL, rapporterIAar: 3 })).toBe("Og rejsen kan ses: 3 godkendte rapporter i år.");
    expect(rejselinje({ ...NUL, rapporterIAar: 3 })).not.toMatch(/refleksion/);
  });
  it("1 refleksion → ental", () => {
    expect(rejselinje({ ...NUL, rapporterIAar: 3, refleksioner: 1 })).toBe(
      "Og rejsen kan ses: 3 godkendte rapporter i år · 1 refleksion.",
    );
  });
  it("flere → flertal", () => {
    expect(rejselinje({ ...NUL, rapporterIAar: 3, refleksioner: 4 })).toBe(
      "Og rejsen kan ses: 3 godkendte rapporter i år · 4 refleksioner.",
    );
  });
  it("står sidst — de tre eksisterende dele beholder deres plads", () => {
    expect(rejselinje({ rapporterIAar: 2, maalNaaet: 1, videoerGennemfoert: 3, refleksioner: 2 })).toBe(
      "Og rejsen kan ses: 2 godkendte rapporter i år · 1 mål nået · 3 videoer gennemført i Akademiet · 2 refleksioner.",
    );
  });
  it("refleksionerne alene er nok til en linje", () => {
    expect(rejselinje({ ...NUL, refleksioner: 2 })).toBe("Og rejsen kan ses: 2 refleksioner.");
  });
});

describe("antalFraSvar — antallet kommer fra databasens svar", () => {
  it("tallet er count, som databasen gav det", () => {
    expect(antalFraSvar("pulse_checkins", { count: 7, error: null })).toBe(7);
    expect(antalFraSvar("pulse_checkins", { count: 0, error: null })).toBe(0);
  });
  it("count null uden fejl er 0", () => {
    expect(antalFraSvar("pulse_checkins", { count: null, error: null })).toBe(0);
  });
  it("en fejl kaster med kildens navn — aldrig et stille 0", () => {
    expect(() => antalFraSvar("pulse_checkins", { count: null, error: { message: "boom" } })).toThrow(HentningsFejl);
    try {
      antalFraSvar("pulse_checkins", { count: 3, error: { message: "boom" } });
    } catch (e) {
      expect((e as HentningsFejl).kilde).toBe("pulse_checkins");
    }
  });
});
