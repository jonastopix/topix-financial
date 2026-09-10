/**
 * Eventmailene (10/9): hvem der får publiceringsmailen, dommen om «om en
 * time», og beskedernes form. Læser Deno-siden direkte (ren fil).
 */
import { describe, expect, it } from "vitest";
import {
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
    expect(b).toMatchObject({ type: "event_reminder", title: "Om en time: Live sparring: likviditet", dedup_key: "event_reminder:e1:c", deep_link: "/events/e1" });
    expect(b.body).toMatch(/^Kl\. 10[.:]30\. Mødelink: https:\/\/meet\.google\.com\/abc$/);
    expect(omEnTimeBesked({ ...e, meet_url: null }).body).toMatch(/^Kl\. 10[.:]30\.$/);
  });
});
