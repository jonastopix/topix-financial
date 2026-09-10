import { describe, expect, it } from "vitest";
import { eventEndTime, eventMeetPhase, isEventPast, eventNedtaelling } from "../eventPhase";

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

describe("eventNedtaelling — kalenderdage, ikke timer (fejlen set 10/9 kl. 08.49)", () => {
  // Lokale datoer: læserens døgn, som husets øvrige domme.
  const kl = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);
  const event = (starts: Date, ends?: Date) => ({ starts_at: starts.toISOString(), ends_at: ends?.toISOString() ?? null });

  it("i dag FØR tidspunktet: event kl. 11 set kl. 08.49 → «I dag» (var «I morgen»)", () => {
    expect(eventNedtaelling(event(kl(2026, 9, 10, 11), kl(2026, 9, 10, 12)), kl(2026, 9, 10, 8, 49))).toBe("I dag");
  });

  it("i dag EFTER starttidspunktet, før sluttiden → «I gang» (samme dom som Meet-knappen)", () => {
    expect(eventNedtaelling(event(kl(2026, 9, 10, 11), kl(2026, 9, 10, 12)), kl(2026, 9, 10, 11, 30))).toBe("I gang");
    // 15 min før start er også live
    expect(eventNedtaelling(event(kl(2026, 9, 10, 11), kl(2026, 9, 10, 12)), kl(2026, 9, 10, 10, 50))).toBe("I gang");
  });

  it("i dag efter sluttiden → null: eventet er afholdt og hører til i «Afholdte»", () => {
    expect(eventNedtaelling(event(kl(2026, 9, 10, 11), kl(2026, 9, 10, 12)), kl(2026, 9, 10, 12, 1))).toBeNull();
    // uden ends_at: 90 min-fallback
    expect(eventNedtaelling(event(kl(2026, 9, 10, 11)), kl(2026, 9, 10, 12, 31))).toBeNull();
    expect(eventNedtaelling(event(kl(2026, 9, 10, 11)), kl(2026, 9, 10, 12, 29))).toBe("I gang");
  });

  it("i morgen → «I morgen», også når der er under et døgn til (kl. 00.30 set kl. 23.00)", () => {
    expect(eventNedtaelling(event(kl(2026, 9, 11, 11)), kl(2026, 9, 10, 8, 49))).toBe("I morgen");
    expect(eventNedtaelling(event(kl(2026, 9, 11, 0, 30)), kl(2026, 9, 10, 23))).toBe("I morgen");
  });

  it("14 dage frem: 24/9 kl. 11 set 10/9 kl. 08.49 → «Om 14 dage» (var «Om 15 dage»)", () => {
    expect(eventNedtaelling(event(kl(2026, 9, 24, 11)), kl(2026, 9, 10, 8, 49))).toBe("Om 14 dage");
    // og uanset klokkeslæt på dagen
    expect(eventNedtaelling(event(kl(2026, 9, 24, 11)), kl(2026, 9, 10, 23, 59))).toBe("Om 14 dage");
    expect(eventNedtaelling(event(kl(2026, 9, 24, 11)), kl(2026, 9, 10, 0, 1))).toBe("Om 14 dage");
  });

  it("to dage frem → «Om 2 dage»", () => {
    expect(eventNedtaelling(event(kl(2026, 9, 12, 9)), kl(2026, 9, 10, 20))).toBe("Om 2 dage");
  });
});
