/**
 * Eventmailene (10/9): hvem der får publiceringsmailen, dommen om «om en
 * time», og beskedernes form. Læser Deno-siden direkte (ren fil).
 */
import { describe, expect, it } from "vitest";
import {
  erFlytning,
  flytningDedupKey,
  flyttetBesked,
  nytTidspunktBesked,
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

describe("flytning (udkast 18/9, tekster 21/9) — erFlytning, tekst A og tekst B", () => {
  const gemt = { starts_at: "2026-09-15T08:30:00Z", ends_at: "2026-09-15T09:30:00Z" };
  it("erFlytning: samme øjeblik i anden skrivemåde er ingen flytning; ny start, ny slut eller fjernet slut er", () => {
    expect(erFlytning(gemt, { starts_at: "2026-09-15T10:30:00+02:00" })).toBe(false);
    expect(erFlytning(gemt, {})).toBe(false);
    expect(erFlytning(gemt, { starts_at: "2026-09-16T08:30:00Z" })).toBe(true);
    expect(erFlytning(gemt, { ends_at: "2026-09-15T10:00:00Z" })).toBe(true);
    expect(erFlytning(gemt, { ends_at: null })).toBe(true);
    expect(erFlytning({ starts_at: gemt.starts_at, ends_at: null }, { ends_at: null })).toBe(false);
  });
  const e = { id: "e1", title: "Live sparring: likviditet", starts_at: "2026-09-22T09:00:00Z", meet_url: "https://meet.google.com/abc" };
  const GAMMEL = "2026-09-15T08:30:00Z";
  it("tekst A (tilmeldte) — flyttetBesked ordret som godkendt af Jonas 21/9, med mødelink", () => {
    const b = flyttetBesked(e, GAMMEL);
    expect(b.type).toBe("event_flyttet");
    expect(b.priority).toBe("important");
    expect(b.title).toBe("Ny tid: Live sparring: likviditet");
    expect(b.body).toBe(
      "Vi har flyttet sessionen til tirsdag 22. september kl. 11.00. Den var sat til tirsdag 15. september kl. 10.30. Passer det stadig? Hvis ikke, kan du melde afbud på eventsiden. Mødelinket er det samme. Har du lagt den i din kalender, så hent den igen fra eventsiden.",
    );
    expect(b.deep_link).toBe("/events/e1");
    expect(b.reference_id).toBe("e1");
    expect(b.dedup_key).toBe("event_flyttet:e1:2026-09-22T09:00:00.000Z");
  });
  it("tekst A uden mødelink: sætningen om mødelinket udelades, kalenderlinjen bliver", () => {
    const b = flyttetBesked({ ...e, meet_url: null }, GAMMEL);
    expect(b.body).toBe(
      "Vi har flyttet sessionen til tirsdag 22. september kl. 11.00. Den var sat til tirsdag 15. september kl. 10.30. Passer det stadig? Hvis ikke, kan du melde afbud på eventsiden. Har du lagt den i din kalender, så hent den igen fra eventsiden.",
    );
    expect(b.body).not.toContain("Mødelinket");
  });
  it("tekst B (kan ikke + har ikke svaret) — nytTidspunktBesked ordret som godkendt af Jonas 21/9; mødelinket nævnes aldrig", () => {
    const b = nytTidspunktBesked(e, GAMMEL);
    expect(b.type).toBe("event_nyt_tidspunkt");
    expect(b.priority).toBe("important");
    expect(b.title).toBe("Nyt tidspunkt: Live sparring: likviditet");
    expect(b.body).toBe("Sessionen er flyttet til tirsdag 22. september kl. 11.00 (før tirsdag 15. september kl. 10.30). Måske passer det bedre nu — du kan tilmelde dig på eventsiden.");
    expect(nytTidspunktBesked({ ...e, meet_url: null }, GAMMEL).body).toBe(b.body);
    expect(b.deep_link).toBe("/events/e1");
    expect(b.reference_id).toBe("e1");
  });
  it("dedup: SAMME nøgle for A og B (én besked pr. person pr. ny tid); en anden ny tid giver en anden nøgle; skrivemåden er ligegyldig", () => {
    expect(nytTidspunktBesked(e, GAMMEL).dedup_key).toBe(flyttetBesked(e, GAMMEL).dedup_key);
    expect(flyttetBesked(e, GAMMEL).dedup_key).toBe(flytningDedupKey("e1", "2026-09-22T09:00:00Z"));
    expect(flytningDedupKey("e1", "2026-09-22T11:00:00+02:00")).toBe("event_flyttet:e1:2026-09-22T09:00:00.000Z");
    const a = flyttetBesked({ ...e, starts_at: "2026-09-22T09:00:00Z" }, GAMMEL);
    const c = flyttetBesked({ ...e, starts_at: "2026-09-23T09:00:00Z" }, GAMMEL);
    expect(a.dedup_key).not.toBe(c.dedup_key);
    // Den gamle tid står ikke i nøglen: samme nye tid fra to forskellige gamle tider er samme besked.
    expect(flyttetBesked(e, "2026-09-10T08:30:00Z").dedup_key).toBe(a.dedup_key);
  });
});
