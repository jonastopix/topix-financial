/**
 * Eventmailene (10/9): hvem der får publiceringsmailen, dommen om «om en
 * time», og beskedernes form. Læser Deno-siden direkte (ren fil).
 */
import { describe, expect, it } from "vitest";
import {
  erFlytning,
  flyttetBesked,
  erOmEnTime,
  OM_EN_TIME_FRA_MIN,
  OM_EN_TIME_TIL_MIN,
  omEnTimeBesked,
  publiceringsBesked,
  skalHavePubliceringsmail,
  vinduerFraBody,
} from "../../../supabase/functions/_shared/eventMails.ts";

const NU = new Date("2026-09-15T08:00:00Z");
const omMin = (m: number) => new Date(NU.getTime() + m * 60_000).toISOString();

describe("hvem får publiceringsmailen — spejl af get_event_non_responders", () => {
  const aktiv = { erAdvisor: false, aktivtMedlemskab: true, erLegat: false, harAktivtSvar: false };
  it("et aktivt medlem uden svar: ja", () => expect(skalHavePubliceringsmail(aktiv)).toBe(true));
  it("rådgiver: nej", () => expect(skalHavePubliceringsmail({ ...aktiv, erAdvisor: true })).toBe(false));
  it("udløbet medlemskab: nej", () => expect(skalHavePubliceringsmail({ ...aktiv, aktivtMedlemskab: false })).toBe(false));
  it("legat: nej", () => expect(skalHavePubliceringsmail({ ...aktiv, erLegat: true })).toBe(false));
  it("har allerede svaret (ja eller nej) — fx ved «Genåbn som publiceret»: nej", () =>
    expect(skalHavePubliceringsmail({ ...aktiv, harAktivtSvar: true })).toBe(false));
});

describe("«om en time» — vindue C", () => {
  it("60 minutter før: ja (fra inklusiv)", () => expect(erOmEnTime(omMin(60), NU)).toBe(true));
  it("75 minutter før: ja", () => expect(erOmEnTime(omMin(75), NU)).toBe(true));
  it("90 minutter før: nej (til eksklusiv)", () => expect(erOmEnTime(omMin(90), NU)).toBe(false));
  it("59 minutter før: nej — for tæt på, vinduet er passeret", () => expect(erOmEnTime(omMin(59), NU)).toBe(false));
  it("i gang eller afholdt: nej", () => {
    expect(erOmEnTime(omMin(0), NU)).toBe(false);
    expect(erOmEnTime(omMin(-30), NU)).toBe(false);
  });
  it("en kvarters-cron rammer vinduet mindst én gang for ethvert starttidspunkt", () => {
    expect(OM_EN_TIME_TIL_MIN - OM_EN_TIME_FRA_MIN).toBeGreaterThanOrEqual(15);
    for (let start = 0; start < 15; start++) {
      const startsAt = omMin(120 + start);
      let ramt = 0;
      for (let k = 0; k < 24; k++) if (erOmEnTime(startsAt, new Date(NU.getTime() + k * 15 * 60_000))) ramt++;
      expect(ramt).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("kørslens vinduer fra body — A og B som altid, C kun på forlangende", () => {
  it("tom body, ingen body, ukendt body: A+B", () => {
    expect(vinduerFraBody({})).toEqual({ ab: true, c: false });
    expect(vinduerFraBody(null)).toEqual({ ab: true, c: false });
    expect(vinduerFraBody({ vindue: "x" })).toEqual({ ab: true, c: false });
  });
  it("{ vindue: 'time' }: kun C", () => expect(vinduerFraBody({ vindue: "time" })).toEqual({ ab: false, c: true }));
});

describe("beskederne", () => {
  const e = { id: "e1", title: "Live sparring: likviditet", starts_at: "2026-09-15T08:30:00Z", meet_url: "https://meet.google.com/abc" };
  it("publicering: «Nyt event», dansk dato og tid, online, vejen til eventsiden, dedup uden vindue", () => {
    const b = publiceringsBesked(e);
    expect(b).toMatchObject({ type: "event_published", priority: "important", title: "Nyt event: Live sparring: likviditet", deep_link: "/events/e1", dedup_key: "event_published:e1", reference_type: "event", reference_id: "e1" });
    expect(b.body).toMatch(/^tirsdag 15\. september kl\. 10[.:]30 · Online\./);
    expect(b.body).toContain("føj det til din kalender fra eventsiden");
    expect(publiceringsBesked({ ...e, meet_url: null }).body).not.toContain("Online");
  });
  it("om en time: samme type og dedup-form som A og B, suffiks c, mødelink med når det findes", () => {
    const b = omEnTimeBesked(e);
    expect(b).toMatchObject({ type: "event_reminder", title: "Om en time: Live sparring: likviditet", dedup_key: "event_reminder:e1:c:2026-09-15T08:30:00.000Z", deep_link: "/events/e1" });
    // Rettet 18/9: nøglen bærer starttidspunktet — flyttes eventet, sendes C igen for den nye tid.
    expect(omEnTimeBesked({ ...e, starts_at: "2026-09-15T12:00:00Z" }).dedup_key).toBe("event_reminder:e1:c:2026-09-15T12:00:00.000Z");
    expect(omEnTimeBesked({ ...e, starts_at: "2026-09-15T10:30:00+02:00" }).dedup_key).toBe(b.dedup_key);
    expect(b.body).toMatch(/^Kl\. 10[.:]30\. Mødelink: https:\/\/meet\.google\.com\/abc$/);
    expect(omEnTimeBesked({ ...e, meet_url: null }).body).toMatch(/^Kl\. 10[.:]30\.$/);
  });
});

describe("flytning (udkast 18/9) — erFlytning og «Ny tid»-beskeden", () => {
  const gemt = { starts_at: "2026-09-15T08:30:00Z", ends_at: "2026-09-15T09:30:00Z" };
  it("erFlytning: samme øjeblik i anden skrivemåde er ingen flytning; ny start, ny slut eller fjernet slut er", () => {
    expect(erFlytning(gemt, { starts_at: "2026-09-15T10:30:00+02:00" })).toBe(false);
    expect(erFlytning(gemt, {})).toBe(false);
    expect(erFlytning(gemt, { starts_at: "2026-09-16T08:30:00Z" })).toBe(true);
    expect(erFlytning(gemt, { ends_at: "2026-09-15T10:00:00Z" })).toBe(true);
    expect(erFlytning(gemt, { ends_at: null })).toBe(true);
    expect(erFlytning({ starts_at: gemt.starts_at, ends_at: null }, { ends_at: null })).toBe(false);
  });
  it("flyttetBesked: «Ny tid», den nye tid først, så den gamle, mødelinket, kalenderlinjen, dedup med den nye starttid", () => {
    const b = flyttetBesked({ id: "e1", title: "Live sparring: likviditet", starts_at: "2026-09-22T09:00:00Z", meet_url: "https://meet.google.com/abc" }, "2026-09-15T08:30:00Z");
    expect(b.type).toBe("event_flyttet");
    expect(b.priority).toBe("important");
    expect(b.title).toBe("Ny tid: Live sparring: likviditet");
    expect(b.body).toBe("Sessionen er flyttet til tirsdag 22. september kl. 11.00. Den var sat til tirsdag 15. september kl. 10.30. Mødelinket er det samme. Har du lagt den i din kalender, så hent den igen fra eventsiden.");
    expect(b.deep_link).toBe("/events/e1");
    expect(b.dedup_key).toBe("event_flyttet:e1:2026-09-22T09:00:00.000Z");
  });
  it("uden mødelink: ingen linje om det; en anden ny tid giver en anden dedup-nøgle", () => {
    const a = flyttetBesked({ id: "e1", title: "X", starts_at: "2026-09-22T09:00:00Z" }, "2026-09-15T08:30:00Z");
    const c = flyttetBesked({ id: "e1", title: "X", starts_at: "2026-09-23T09:00:00Z" }, "2026-09-15T08:30:00Z");
    expect(a.body).not.toContain("Mødelinket");
    expect(a.dedup_key).not.toBe(c.dedup_key);
  });
});
