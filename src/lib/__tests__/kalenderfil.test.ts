import { describe, expect, it } from "vitest";
import {
  bygKalenderfil,
  foldLinje,
  icsEscape,
  kalenderBeskrivelse,
  kalenderfilnavn,
  kanFoejeTilKalender,
  KALENDER_INTET_LINK_LINJE,
  tilIcsTid,
  type KalenderEvent,
} from "@/lib/kalenderfil";

const BASIS = "https://app.theboardroom.dk";
const NU = new Date("2026-09-10T12:00:00Z");

const event = (over: Partial<KalenderEvent> = {}): KalenderEvent => ({
  id: "3f1c2a40-0000-4000-8000-000000000001",
  title: "Live sparring: likviditet, øl & ål",
  description: "Vi går tallene igennem; medbring din seneste rapport.",
  starts_at: "2026-09-15T08:30:00Z",
  ends_at: "2026-09-15T09:30:00Z",
  meet_url: "https://meet.google.com/abc-defg-hij",
  status: "published",
  ...over,
});

/** Læser et felt ud af den foldede fil: folder linjer sammen og fjerner iCalendar-escapes, så påstandene kan skrives i klartekst. */
const felt = (ics: string, navn: string): string | null => {
  const ufoldet = ics.replace(/\r\n[ \t]/g, "");
  const m = ufoldet.split("\r\n").find((l) => l.startsWith(`${navn}:`));
  if (!m) return null;
  return m.slice(navn.length + 1).replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
};

/** Det rå felt, uden unescape — til at efterprøve selve escapingen. */
const raatFelt = (ics: string, navn: string): string | null => {
  const ufoldet = ics.replace(/\r\n[ \t]/g, "");
  const m = ufoldet.split("\r\n").find((l) => l.startsWith(`${navn}:`));
  return m ? m.slice(navn.length + 1) : null;
};

describe("bygKalenderfil — titel, tid, varighed og link", () => {
  it("bærer titel, start og slut i UTC, og DTSTAMP fra nu", () => {
    const ics = bygKalenderfil(event(), BASIS, NU);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(felt(ics, "SUMMARY")).toBe("Live sparring: likviditet, øl & ål");
    expect(raatFelt(ics, "SUMMARY")).toBe("Live sparring: likviditet\\, øl & ål");
    expect(felt(ics, "DTSTART")).toBe("20260915T083000Z");
    expect(felt(ics, "DTEND")).toBe("20260915T093000Z");
    expect(felt(ics, "DTSTAMP")).toBe("20260910T120000Z");
    expect(felt(ics, "UID")).toBe("event-3f1c2a40-0000-4000-8000-000000000001@app.theboardroom.dk");
  });
  it("uden ends_at: varigheden er fasedommens 90 minutter", () => {
    const ics = bygKalenderfil(event({ ends_at: null }), BASIS, NU);
    expect(felt(ics, "DTEND")).toBe("20260915T100000Z");
  });
  it("KRAVET: Meet-linket står BÅDE i LOCATION og i DESCRIPTION, og eventsiden står i beskrivelsen", () => {
    const ics = bygKalenderfil(event(), BASIS, NU);
    expect(felt(ics, "LOCATION")).toBe("https://meet.google.com/abc-defg-hij");
    expect(felt(ics, "URL")).toBe("https://meet.google.com/abc-defg-hij");
    const beskrivelse = felt(ics, "DESCRIPTION")!;
    expect(beskrivelse).toContain("Google Meet: https://meet.google.com/abc-defg-hij");
    expect(beskrivelse).toContain("Eventet på The Boardroom: https://app.theboardroom.dk/events/3f1c2a40-0000-4000-8000-000000000001");
    expect(beskrivelse.startsWith("Vi går tallene igennem; medbring din seneste rapport.")).toBe(true);
    expect(raatFelt(ics, "DESCRIPTION")!.startsWith("Vi går tallene igennem\\; medbring")).toBe(true);
  });
  it("uden Meet-link: aftalen har stadig vejen til eventsiden — i LOCATION, URL og beskrivelsen — og siger at linket kommer", () => {
    const ics = bygKalenderfil(event({ meet_url: null }), BASIS, NU);
    const side = "https://app.theboardroom.dk/events/3f1c2a40-0000-4000-8000-000000000001";
    expect(felt(ics, "LOCATION")).toBe(side);
    expect(felt(ics, "URL")).toBe(side);
    const beskrivelse = felt(ics, "DESCRIPTION")!;
    expect(beskrivelse).toContain(KALENDER_INTET_LINK_LINJE);
    expect(beskrivelse).toContain(`Eventet på The Boardroom: ${side}`);
    expect(beskrivelse).not.toContain("Google Meet:");
  });
  it("uden beskrivelse: kun link-linjerne, ingen tomme afsnit", () => {
    expect(kalenderBeskrivelse({ id: "x", description: "  ", meet_url: "https://meet.google.com/q" }, BASIS)).toBe(
      "Google Meet: https://meet.google.com/q\n\nEventet på The Boardroom: https://app.theboardroom.dk/events/x",
    );
  });
  it("basis-URL med skråstreg til sidst giver ikke dobbelt skråstreg", () => {
    expect(kalenderBeskrivelse({ id: "x", meet_url: null }, "https://app.theboardroom.dk/")).toContain("https://app.theboardroom.dk/events/x");
  });
});

describe("kanFoejeTilKalender — kommende og igangværende ja, afholdt og aflyst nej", () => {
  it("kommende: ja", () => expect(kanFoejeTilKalender(event(), NU)).toBe(true));
  it("igangværende (live): ja", () => expect(kanFoejeTilKalender(event(), new Date("2026-09-15T08:45:00Z"))).toBe(true));
  it("præcis ved sluttiden: stadig ja (fasedommen: live til og med sluttid)", () => expect(kanFoejeTilKalender(event(), new Date("2026-09-15T09:30:00Z"))).toBe(true));
  it("afholdt: nej", () => expect(kanFoejeTilKalender(event(), new Date("2026-09-15T09:30:01Z"))).toBe(false));
  it("aflyst: nej, også selv om det er kommende", () => expect(kanFoejeTilKalender(event({ status: "cancelled" }), NU)).toBe(false));
});

describe("iCalendar-detaljerne", () => {
  it("escape: backslash, semikolon, komma og linjeskift", () => {
    expect(icsEscape("a;b,c\\d\nе")).toBe("a\\;b\\,c\\\\d\\nе");
  });
  it("tid: UTC uden bindestreger, kolonner og millisekunder", () => {
    expect(tilIcsTid("2026-12-31T23:59:59.123Z")).toBe("20261231T235959Z");
    expect(tilIcsTid(new Date("2026-01-01T00:00:00Z"))).toBe("20260101T000000Z");
  });
  it("folder linjer over 75 oktetter — talt i bytes, så æøå ikke sprænger grænsen", () => {
    const lang = "DESCRIPTION:" + "æ".repeat(100);
    const foldet = foldLinje(lang);
    for (const l of foldet.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(foldet.replace(/\r\n /g, "")).toBe(lang);
    expect(foldLinje("kort")).toBe("kort");
  });
  it("filnavn: slug med danske tegn omskrevet", () => {
    expect(kalenderfilnavn("Live sparring: likviditet, øl & ål")).toBe("the-boardroom-live-sparring-likviditet-oel-aal.ics");
    expect(kalenderfilnavn("   ")).toBe("the-boardroom-event.ics");
  });
});
