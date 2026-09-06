import { describe, expect, it } from "vitest";
import { eventEndTime, eventMeetPhase, isEventPast } from "../eventPhase";

/** Fast "nu" + RELATIVE offsets (absolutte epoch-beregninger — aldrig
    kalenderdatoer; CI kører UTC, lokalt Europe/Copenhagen). */
const NOW = new Date(2026, 7, 7, 12, 0, 0);
const minutesFromNow = (minutes: number) =>
  new Date(NOW.getTime() + minutes * 60_000).toISOString();

describe("isEventPast — udledt afholdt-dom", () => {
  it("ends_at i fortiden → afholdt", () => {
    expect(
      isEventPast({ starts_at: minutesFromNow(-120), ends_at: minutesFromNow(-30) }, NOW),
    ).toBe(true);
  });

  it("ends_at i fremtiden → ikke afholdt (heller ikke selvom starten er passeret)", () => {
    expect(
      isEventPast({ starts_at: minutesFromNow(-30), ends_at: minutesFromNow(30) }, NOW),
    ).toBe(false);
  });

  it("ends_at null, start for 2 timer siden → afholdt (90 min-fallback er udløbet)", () => {
    expect(isEventPast({ starts_at: minutesFromNow(-120), ends_at: null }, NOW)).toBe(true);
  });

  it("ends_at null, start for 30 min siden → ikke afholdt endnu (inde i 90 min-vinduet)", () => {
    expect(isEventPast({ starts_at: minutesFromNow(-30), ends_at: null }, NOW)).toBe(false);
  });

  it("ends_at null, start i fremtiden → ikke afholdt", () => {
    expect(isEventPast({ starts_at: minutesFromNow(60), ends_at: null }, NOW)).toBe(false);
  });

  // ends_at FRAVÆRENDE (6/9-2026): de genererede typer udtrykker den
  // nullable kolonne som `ends_at?: string`. Reglen er at undefined og
  // null er det samme — «ingen sluttid» — og begge falder tilbage på
  // 90 min-vinduet. Events med ends_at rammes ikke.
  it("ends_at fraværende, start for 2 timer siden → afholdt (som null)", () => {
    expect(isEventPast({ starts_at: minutesFromNow(-120) }, NOW)).toBe(true);
  });

  it("ends_at fraværende, start for 30 min siden → ikke afholdt endnu (som null)", () => {
    expect(isEventPast({ starts_at: minutesFromNow(-30) }, NOW)).toBe(false);
  });

  it("ends_at undefined eksplicit → samme dom som null", () => {
    expect(
      isEventPast({ starts_at: minutesFromNow(-120), ends_at: undefined }, NOW),
    ).toBe(isEventPast({ starts_at: minutesFromNow(-120), ends_at: null }, NOW));
    expect(
      isEventPast({ starts_at: minutesFromNow(-30), ends_at: undefined }, NOW),
    ).toBe(isEventPast({ starts_at: minutesFromNow(-30), ends_at: null }, NOW));
  });
});

describe("eventEndTime — sluttids-udledningen", () => {
  it("ends_at vinder når den er sat", () => {
    const ends = minutesFromNow(45);
    expect(
      eventEndTime({ starts_at: minutesFromNow(-15), ends_at: ends }).toISOString(),
    ).toBe(ends);
  });

  it("ends_at null → starts_at + 90 minutter", () => {
    expect(
      eventEndTime({ starts_at: minutesFromNow(0), ends_at: null }).getTime(),
    ).toBe(NOW.getTime() + 90 * 60_000);
  });

  it("ends_at fraværende → starts_at + 90 minutter, byte for byte som null", () => {
    const udenFelt = eventEndTime({ starts_at: minutesFromNow(0) }).getTime();
    const medNull = eventEndTime({ starts_at: minutesFromNow(0), ends_at: null }).getTime();
    expect(udenFelt).toBe(NOW.getTime() + 90 * 60_000);
    expect(udenFelt).toBe(medNull);
  });

  it("ends_at sat vinder også når objektet ellers ligner en tom række", () => {
    const ends = minutesFromNow(200);
    expect(
      eventEndTime({ starts_at: minutesFromNow(0), ends_at: ends }).toISOString(),
    ).toBe(ends);
  });
});

describe("eventMeetPhase — Meet-knappens tre faser", () => {
  it("mere end 15 min før start → before", () => {
    expect(
      eventMeetPhase({ starts_at: minutesFromNow(16), ends_at: minutesFromNow(76) }, NOW),
    ).toBe("before");
  });

  it("midt i eventet → live", () => {
    expect(
      eventMeetPhase({ starts_at: minutesFromNow(-30), ends_at: minutesFromNow(30) }, NOW),
    ).toBe("live");
  });

  it("efter sluttiden → after", () => {
    expect(
      eventMeetPhase({ starts_at: minutesFromNow(-90), ends_at: minutesFromNow(-1) }, NOW),
    ).toBe("after");
  });

  it("grænsen: PRÆCIS 15 min før start → live", () => {
    expect(
      eventMeetPhase({ starts_at: minutesFromNow(15), ends_at: minutesFromNow(75) }, NOW),
    ).toBe("live");
  });

  it("grænsen: PRÆCIS ved sluttiden → stadig live (after er strengt efter)", () => {
    expect(
      eventMeetPhase({ starts_at: minutesFromNow(-60), ends_at: minutesFromNow(0) }, NOW),
    ).toBe("live");
  });

  it("ends_at null: 90 min-fallback bærer også faserne (2 timer efter start → after)", () => {
    expect(eventMeetPhase({ starts_at: minutesFromNow(-120), ends_at: null }, NOW)).toBe("after");
  });

  it("ends_at fraværende: samme tre faser som null (before / live / after)", () => {
    expect(eventMeetPhase({ starts_at: minutesFromNow(16) }, NOW)).toBe("before");
    expect(eventMeetPhase({ starts_at: minutesFromNow(-30) }, NOW)).toBe("live");
    expect(eventMeetPhase({ starts_at: minutesFromNow(-120) }, NOW)).toBe("after");
  });

  it("ends_at fraværende: grænsen ved start + 90 min er stadig live, ét ms efter er after", () => {
    const start = minutesFromNow(-90);
    expect(eventMeetPhase({ starts_at: start }, NOW)).toBe("live");
    expect(eventMeetPhase({ starts_at: start }, new Date(NOW.getTime() + 1))).toBe("after");
  });
});
