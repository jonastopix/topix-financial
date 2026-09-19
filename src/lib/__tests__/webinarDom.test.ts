/**
 * webinarDom (udkast 19/9): plukket af eWebinars payload, dommen «har set /
 * delvist / mødte ikke op» UDLEDT AF TALLET (≥ 75 %), fletningen (procenten
 * går aldrig ned), ordene til rådgiveren og tallene pr. person.
 *
 * Fixturen er ewebinar.com/help/webhook's dokumenterede eksempel (målt
 * 19/9) — uden nogen procent, som dokumentationen er.
 */
import { describe, expect, it } from "vitest";
import {
  bedsteGrad,
  datoKort,
  doemSetGrad,
  findProcent,
  fletTilmelding,
  plukTilmelding,
  SET_GRAENSE_PROCENT,
  somProcent,
  tilmeldingTekst,
  webinarLinje,
  webinarModSvar,
  webinarTal,
  type WebinarTilmelding,
} from "@/lib/webinarDom";

/** Dokumentationens eksempel, ordret felter (help/webhook, 19/9). */
const EKSEMPEL = {
  id: "abCD1234Efg56",
  ip: "123.456.7.8",
  city: "New Jersey",
  name: "John Doe",
  tags: ["Sales", "Lead", "Onboarding"],
  email: "John.Doe@defaultmail.com",
  state: "Registered",
  action: "Registered",
  origin: "https://ilove.ewebinar.com/webinar/ewebinar-overview-and-demo-24842",
  source: "Widget",
  teamId: 1,
  country: "US",
  attended: "Hasn't started",
  joinLink: "https://ilove.ewebinar.com/webinar/1234/join/1234",
  lastName: "Doe",
  referrer: "https://app.ewebinar.com/",
  timezone: "New Jersey/America",
  firstName: "John",
  webinarId: 14166,
  attendeeId: "abCD1234Efg56",
  replayLink: "https://ilove.ewebinar.com/webinar/1234/replay/1234",
  subscribed: "Subscribed",
  firstOrigin: "https://ilove.ewebinar.com/webinar/ewebinar-overview-and-demo-24842",
  sessionTime: "2024-05-10T08:25:00.000Z",
  sessionType: "JustInTime",
  webinarTitle: "eWebinar Overview and Demo",
  emailVerified: "true",
  firstReferrer: "https://app.ewebinar.com/",
  moderatorName: "Melissa Kwan",
  checkedConsent: "Yes",
  moderatorEmail: "support@ewebinar.com",
  registeredTime: "2024-05-10T08:24:01.263Z",
  allWebinarsLink: "https://ilove.ewebinar.com",
  registrationLink: "https://ilove.ewebinar.com/webinar/ewebinar-overview-and-demo-24842",
  addToCalendarLink: "https://api.ewebinar.com/v1/attendees/12345/ics",
  registrationAnswers: "-- Registration form answers --\n\nChecked consent checkbox: Yes\n",
  deviceTypeWhenRegistered: "Desktop",
};

const NU = new Date("2026-09-19T12:00:00Z");

function raekke(over: Partial<WebinarTilmelding> = {}): WebinarTilmelding {
  return {
    ewebinar_id: "r1",
    email: "a@b.dk",
    navn: "A B",
    webinar_id: "14166",
    webinar_titel: "Mortens webinar",
    session_tid: "2026-09-22T17:00:00Z",
    session_type: "Scheduled",
    registreret_at: "2026-09-10T08:00:00Z",
    state: "Registered",
    sidste_action: "Registered",
    attended: null,
    subscribed: null,
    set_procent: null,
    set_procent_kilde: null,
    ...over,
  };
}

describe("plukTilmelding — dokumentationens eksempel", () => {
  it("plukker id, mail (små bogstaver), navn, webinar, session, tilstand — og ingen procent, for der er ingen", () => {
    const p = plukTilmelding(EKSEMPEL);
    expect(p.ok).toBe(true);
    if (p.ok === false) return;
    expect(p.tilmelding).toEqual({
      ewebinar_id: "abCD1234Efg56",
      email: "john.doe@defaultmail.com",
      navn: "John Doe",
      webinar_id: "14166",
      webinar_titel: "eWebinar Overview and Demo",
      session_tid: "2024-05-10T08:25:00.000Z",
      session_type: "JustInTime",
      registreret_at: "2024-05-10T08:24:01.263Z",
      state: "Registered",
      sidste_action: "Registered",
      attended: "Hasn't started",
      subscribed: "Subscribed",
      set_procent: null,
      set_procent_kilde: null,
    });
  });

  it("navnet falder tilbage på fornavn + efternavn; attendeeId dækker for id; sessionTime «replay» → ingen tid", () => {
    const p = plukTilmelding({ ...EKSEMPEL, id: undefined, name: "", sessionTime: "replay" });
    expect(p.ok).toBe(true);
    if (p.ok === false) return;
    expect(p.tilmelding.ewebinar_id).toBe("abCD1234Efg56");
    expect(p.tilmelding.navn).toBe("John Doe");
    expect(p.tilmelding.session_tid).toBeNull();
  });

  it("fejler kun uden id, mail eller webinarId — og siger hvilket", () => {
    expect(plukTilmelding(null)).toEqual({ ok: false, grund: "ikke_et_objekt" });
    expect(plukTilmelding([])).toEqual({ ok: false, grund: "ikke_et_objekt" });
    expect(plukTilmelding({ ...EKSEMPEL, id: undefined, attendeeId: undefined })).toEqual({ ok: false, grund: "uden_id" });
    expect(plukTilmelding({ ...EKSEMPEL, email: "  " })).toEqual({ ok: false, grund: "uden_email" });
    expect(plukTilmelding({ ...EKSEMPEL, webinarId: undefined })).toEqual({ ok: false, grund: "uden_webinar_id" });
  });
});

describe("findProcent / somProcent — procenten når (hvis) den kommer", () => {
  it("læser tal, «62», «62,5», «62 %»; afviser over 100, negative og tekst", () => {
    expect(somProcent(62)).toBe(62);
    expect(somProcent("62")).toBe(62);
    expect(somProcent("62,5")).toBe(62.5);
    expect(somProcent("62 %")).toBe(62);
    expect(somProcent("62%")).toBe(62);
    expect(somProcent(101)).toBeNull();
    expect(somProcent(-1)).toBeNull();
    expect(somProcent("Hasn't started")).toBeNull();
    expect(somProcent(true)).toBeNull();
  });

  it("finder en watched-/percent-nøgle på topniveau og ét niveau ned, «watched» først, og gemmer kilden", () => {
    expect(findProcent({ ...EKSEMPEL, watchedPercent: 62 })).toEqual({ procent: 62, kilde: "watchedPercent" });
    expect(findProcent({ ...EKSEMPEL, properties: { total_watched_percent: "78 %" } })).toEqual({ procent: 78, kilde: "properties.total_watched_percent" });
    expect(findProcent({ ...EKSEMPEL, percentComplete: 40, totalWatched: 55 })).toEqual({ procent: 55, kilde: "totalWatched" });
  });

  it("dokumentationens eksempel har ingen procent; link-/tidsnøgler og ikke-tal ignoreres", () => {
    expect(findProcent(EKSEMPEL)).toBeNull();
    expect(findProcent({ watchedReplayLink: "https://x", watchedTime: "2024-05-10T08:25:00.000Z", watched: "yes" })).toBeNull();
  });
});

describe("doemSetGrad — tallet først, så eWebinars ord", () => {
  it("grænsen er 75: 75 → set, 74.9 → delvist, 0.5 → delvist", () => {
    expect(SET_GRAENSE_PROCENT).toBe(75);
    expect(doemSetGrad(raekke({ set_procent: 75, state: "Joined" }), NU)).toBe("set");
    expect(doemSetGrad(raekke({ set_procent: 100, state: "Missed" }), NU)).toBe("set");
    expect(doemSetGrad(raekke({ set_procent: 74.9, state: "Watched" }), NU)).toBe("delvist");
    expect(doemSetGrad(raekke({ set_procent: 0.5, state: "Missed" }), NU)).toBe("delvist");
  });

  it("0 % er «intet tal endnu»: state afgør", () => {
    expect(doemSetGrad(raekke({ set_procent: 0, state: "Watched" }), NU)).toBe("set");
    expect(doemSetGrad(raekke({ set_procent: 0, state: "Missed" }), NU)).toBe("moedte_ikke");
  });

  it("uden tal: Watched → set, Joined → delvist, Missed/NotJoined → mødte ikke op, uanset store/små bogstaver", () => {
    expect(doemSetGrad(raekke({ state: "Watched" }), NU)).toBe("set");
    expect(doemSetGrad(raekke({ state: "joined" }), NU)).toBe("delvist");
    expect(doemSetGrad(raekke({ state: "Missed" }), NU)).toBe("moedte_ikke");
    expect(doemSetGrad(raekke({ state: "NotJoined" }), NU)).toBe("moedte_ikke");
  });

  it("Registered: fremtidig session → tilmeldt; forbi eller uden tid → ukendt", () => {
    expect(doemSetGrad(raekke({ session_tid: "2026-09-22T17:00:00Z" }), NU)).toBe("tilmeldt");
    expect(doemSetGrad(raekke({ session_tid: "2026-09-01T17:00:00Z" }), NU)).toBe("ukendt");
    expect(doemSetGrad(raekke({ session_tid: null, state: null }), NU)).toBe("ukendt");
  });
});

describe("fletTilmelding — ny vinder, null overskriver aldrig, procenten går aldrig ned", () => {
  const gammel = raekke({ state: "Watched", sidste_action: "WatchedWebinar", set_procent: 78, set_procent_kilde: "watchedPercent", attended: "Attended" });

  it("uden eksisterende: den nye", () => {
    expect(fletTilmelding(null, gammel)).toEqual(gammel);
  });

  it("«Left» efter «Watched» med lavere tal: state og action følger den nye, procenten bliver 78", () => {
    const ny = raekke({ state: "Joined", sidste_action: "Left", set_procent: 62, set_procent_kilde: "watchedPercent", attended: null });
    const f = fletTilmelding(gammel, ny);
    expect(f.state).toBe("Joined");
    expect(f.sidste_action).toBe("Left");
    expect(f.set_procent).toBe(78);
    expect(f.set_procent_kilde).toBe("watchedPercent");
    expect(f.attended).toBe("Attended");
  });

  it("uden tal i den nye: det gamle tal og dets kilde bliver; et højere tal vinder med sin kilde", () => {
    expect(fletTilmelding(gammel, raekke({ set_procent: null, set_procent_kilde: null })).set_procent).toBe(78);
    const f = fletTilmelding(gammel, raekke({ set_procent: 91, set_procent_kilde: "properties.total_watched_percent" }));
    expect(f.set_procent).toBe(91);
    expect(f.set_procent_kilde).toBe("properties.total_watched_percent");
  });
});

describe("ordene til rådgiveren", () => {
  it("datoKort i dansk tid: 22/9 for en session kl. 17 UTC (19 dansk), og 23/9 for 22:30 UTC", () => {
    expect(datoKort("2026-09-22T17:00:00Z")).toBe("22/9");
    expect(datoKort("2026-09-22T22:30:00Z")).toBe("23/9");
    expect(datoKort(null)).toBeNull();
    expect(datoKort("replay")).toBeNull();
  });

  it("«så 78 % af webinaret 22/9» · «så 62 % … (delvist)» · uden tal siges det", () => {
    expect(tilmeldingTekst(raekke({ set_procent: 78, state: "Watched" }), NU)).toBe("så 78 % af webinaret 22/9");
    expect(tilmeldingTekst(raekke({ set_procent: 62.4, state: "Joined" }), NU)).toBe("så 62 % af webinaret 22/9 (delvist)");
    expect(tilmeldingTekst(raekke({ state: "Watched" }), NU)).toBe("så webinaret 22/9 (procent ukendt)");
    expect(tilmeldingTekst(raekke({ state: "Joined" }), NU)).toBe("deltog i webinaret 22/9 (procent ukendt)");
    expect(tilmeldingTekst(raekke({ state: "Missed" }), NU)).toBe("tilmeldt webinaret 22/9, mødte ikke op");
    expect(tilmeldingTekst(raekke(), NU)).toBe("tilmeldt webinaret 22/9");
    expect(tilmeldingTekst(raekke({ session_tid: "2026-09-01T17:00:00Z" }), NU)).toBe("tilmeldt webinaret 1/9 (deltagelse ukendt)");
    expect(tilmeldingTekst(raekke({ session_tid: null, session_type: "Replay", state: "Watched", set_procent: 80 }), NU)).toBe("så 80 % af optagelsen");
  });

  it("webinarLinje: seneste session først, adskilt med ·; null uden tilmeldinger", () => {
    expect(webinarLinje([], NU)).toBeNull();
    const linje = webinarLinje([raekke({ session_tid: "2026-09-01T17:00:00Z", state: "Watched", set_procent: 78 }), raekke({ ewebinar_id: "r2" })], NU);
    expect(linje).toBe("tilmeldt webinaret 22/9 · så 78 % af webinaret 1/9");
  });

  it("webinarModSvar: kun det der er værd at sige", () => {
    expect(webinarModSvar("ja", [], NU)).toBe("sagde_ja_ingen_tilmelding");
    expect(webinarModSvar("nej", [], NU)).toBeNull();
    expect(webinarModSvar(null, [], NU)).toBeNull();
    const set = [raekke({ session_tid: "2026-09-01T17:00:00Z", set_procent: 78, state: "Watched" })];
    expect(webinarModSvar("ja", set, NU)).toBe("stemmer");
    expect(webinarModSvar("nej", set, NU)).toBe("sagde_nej_men_set");
    expect(webinarModSvar(null, set, NU)).toBeNull();
    const missed = [raekke({ session_tid: "2026-09-01T17:00:00Z", state: "Missed" })];
    expect(webinarModSvar("ja", missed, NU)).toBe("sagde_ja_moedte_ikke");
    expect(webinarModSvar("nej", missed, NU)).toBeNull();
    expect(webinarModSvar("ja", [raekke()], NU)).toBe("sagde_ja_ikke_maalt");
    expect(bedsteGrad([...missed, ...set], NU)).toBe("set");
  });
});

describe("webinarTal — pr. person, i alt og pr. webinar, og det næste", () => {
  const liste: WebinarTilmelding[] = [
    // a: så 1/9 (78 %) og er tilmeldt 22/9 igen → harSet + kommende
    raekke({ ewebinar_id: "a1", email: "a@x.dk", session_tid: "2026-09-01T17:00:00Z", state: "Watched", set_procent: 78 }),
    raekke({ ewebinar_id: "a2", email: "a@x.dk", session_tid: "2026-09-22T17:00:00Z" }),
    // b: 40 % → delvist
    raekke({ ewebinar_id: "b1", email: "b@x.dk", session_tid: "2026-09-01T17:00:00Z", state: "Left", set_procent: 40 }),
    // c: mødte ikke op 1/9, og to tilmeldinger til 22/9 (dublet) → moedteIkke + kommende, tæller én gang
    raekke({ ewebinar_id: "c1", email: "c@x.dk", session_tid: "2026-09-01T17:00:00Z", state: "Missed" }),
    raekke({ ewebinar_id: "c2", email: "c@x.dk", session_tid: "2026-09-22T17:00:00Z" }),
    raekke({ ewebinar_id: "c3", email: "c@x.dk", session_tid: "2026-09-22T17:00:00Z" }),
    // d: tilmeldt en SENERE session 29/9 → kommende, men ikke «det næste»
    raekke({ ewebinar_id: "d1", email: "d@x.dk", session_tid: "2026-09-29T17:00:00Z" }),
    // e: et andet webinar (optagelsen), 90 % → harSet
    raekke({ ewebinar_id: "e1", email: "e@x.dk", webinar_id: "999", webinar_titel: "Optagelsen", session_tid: null, session_type: "Replay", state: "Watched", set_procent: 90 }),
    // f: session forbi uden nyt → ukendt
    raekke({ ewebinar_id: "f1", email: "f@x.dk", session_tid: "2026-09-15T17:00:00Z" }),
  ];

  it("i alt: 6 personer · 2 har set · 1 delvist · 1 mødte ikke · 1 ukendt · 3 kommende · næste 22/9 med 2 personer", () => {
    const tal = webinarTal(liste, NU);
    expect(tal.personer).toBe(6);
    expect(tal.harSet).toBe(2);
    expect(tal.delvistSet).toBe(1);
    expect(tal.moedteIkke).toBe(1);
    expect(tal.ukendt).toBe(1);
    expect(tal.kommende).toBe(3);
    expect(tal.naeste).toEqual({ sessionTid: "2026-09-22T17:00:00.000Z", personer: 2 });
  });

  it("pr. webinar: største først; optagelsen for sig", () => {
    const tal = webinarTal(liste, NU);
    expect(tal.perWebinar.map((w) => [w.webinarId, w.titel, w.personer, w.harSet, w.kommende])).toEqual([
      ["14166", "Mortens webinar", 5, 1, 3],
      ["999", "Optagelsen", 1, 1, 0],
    ]);
  });

  it("tom liste: nuller og intet næste", () => {
    expect(webinarTal([], NU)).toEqual({ personer: 0, harSet: 0, delvistSet: 0, moedteIkke: 0, ukendt: 0, kommende: 0, naeste: null, perWebinar: [] });
  });
});
