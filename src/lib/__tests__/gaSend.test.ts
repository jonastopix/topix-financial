import { describe, expect, it } from "vitest";
import {
  alarmNoegle, alarmTekst, type AnsoegningTilGa, bygPayload, doem, doemGaSvar, ENGAGEMENT_TIME_MSEC, erIVindue, eventId,
  findForbudteNoegler, FORBUDTE_NOEGLER, GA_DEBUG_STI, GA_EVENT_NAVN, GA_HOST, GA_JOIN_TIMER, GA_MEASUREMENT_ID,
  GA_SEND_SECRET_NAVN, GA_STI, GA_VINDUE_TIMER, kanJoines, laasErAktiv, maaForsoeges, PARAMETER_NAVNE, senderRigtigt,
  skalSkriveSpor, SPOR_UDFALD, SPRUNGET_GRUNDE, VAERDI_MAKS,
} from "../../../supabase/functions/_shared/gaSend.ts";

/**
 * Google Analytics fra platformen (udkast 21/9-2026 aften) — de rene regler:
 * payloaden (kun de tilladte felter; ingen persondata — prøve på det FAKTISKE objekt),
 * client_id/session_id, 72- og 48-timersgrænserne, låsen, sprunget-over-grundene,
 * idempotensen uden forsøgsloft, og valideringssvaret.
 */
const ID = "3f6c2a10-1111-4111-8111-111111111111";
const NU = new Date("2026-09-22T09:30:00Z");
const R = (o: Partial<AnsoegningTilGa> = {}): AnsoegningTilGa => ({
  id: ID, created_at: "2026-09-21T19:00:00.000Z", indsendt_at: "2026-09-22T08:45:00.000Z",
  ga_client_id: "1234567890.1695300000", ga_session_id: "1758480000",
  kilde: "direkte", utm_source: "fb", utm_medium: "paid", utm_campaign: "120212345678901234",
  utm_content: "120299999999999999", utm_term: null,
  ...o,
});
/**
 * Ansøgerens egne oplysninger — må aldrig optræde som værdi i det, vi sender.
 * CVR og telefon er valgt, så de IKKE er delstrenge af fixturens annonce-id'er: første
 * udgave brugte «12345678», som står inde i utm_campaign «120212345678901234», og prøven
 * råbte om en lækage, der ikke var der. En værdi-prøve skal vælge værdier, der ikke kan
 * kollidere — ellers lærer man at ignorere den.
 */
const PERSON = { navn: "Anna Andersen", email: "anna@firma.dk", telefon: "+4540506070", cvr: "45281736", svar: "Vi mangler overblik", ua: "Mozilla/5.0 (iPhone)" };

describe("gaSend — ejendommen, navnene og nøglen", () => {
  it("EU-værten, de to stier, measurement-id og secret-navnet", () => {
    expect(GA_HOST).toBe("region1.google-analytics.com");
    expect(GA_STI).toBe("/mp/collect");
    expect(GA_DEBUG_STI).toBe("/debug/mp/collect");
    expect(GA_MEASUREMENT_ID).toBe("G-6LHR66CDJ4");
    expect(GA_SEND_SECRET_NAVN).toBe("GA4_SEND_SECRET");
    expect(GA_SEND_SECRET_NAVN).not.toBe("GA4_API_SECRET"); // sitets eget navn — to projekter, to secrets
  });
  it("hændelsesnavnene er hjemmesidens to, ≤ 40 tegn og ikke reserverede; event_id er vores eget spor", () => {
    expect(GA_EVENT_NAVN.started).toBe("application_started");
    expect(GA_EVENT_NAVN.submitted).toBe("application_submitted");
    for (const n of Object.values(GA_EVENT_NAVN)) {
      expect(n.length).toBeLessThanOrEqual(40);
      expect(["session_start", "first_visit", "first_open", "user_engagement", "error"]).not.toContain(n);
    }
    expect(eventId(ID, "started")).toBe(`${ID}:started`);
    expect(eventId(ID, "submitted")).toBe(`${ID}:submitted`);
  });
  it("parameternavnene bryder ingen af Googles reserverede præfikser (_, firebase_, ga_, google_, gtag.)", () => {
    for (const n of PARAMETER_NAVNE) {
      expect(n.length).toBeLessThanOrEqual(40);
      expect(/^(_|firebase_|ga_|google_|gtag\.)/.test(n)).toBe(false);
    }
    expect([...PARAMETER_NAVNE]).toEqual(["kilde", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]);
  });
});

describe("gaSend — 72 timer bagud, 48 timer for at blive joinet", () => {
  it("vinduet: inden for 72 t ja, præcis 72 t ja, 72 t + 1 s nej, fremtid nej", () => {
    expect(GA_VINDUE_TIMER).toBe(72);
    expect(erIVindue(new Date(NU.getTime() - 3_600_000), NU)).toBe(true);
    expect(erIVindue(new Date(NU.getTime() - 72 * 3_600_000), NU)).toBe(true);
    expect(erIVindue(new Date(NU.getTime() - 72 * 3_600_000 - 1000), NU)).toBe(false);
    expect(erIVindue(new Date(NU.getTime() + 60_000), NU)).toBe(false);
  });
  it("join-grænsen er 48 t: en hændelse på 50 timer sendes stadig, men kan ikke joines", () => {
    expect(GA_JOIN_TIMER).toBe(48);
    const halvtreds = new Date(NU.getTime() - 50 * 3_600_000);
    expect(erIVindue(halvtreds, NU)).toBe(true);
    expect(kanJoines(halvtreds, NU)).toBe(false);
    expect(kanJoines(new Date(NU.getTime() - 47 * 3_600_000), NU)).toBe(true);
    expect(kanJoines(new Date(NU.getTime() - 48 * 3_600_000), NU)).toBe(true);
  });
  it("dommen: started bruger created_at, submitted bruger indsendt_at — hver med sit vindue", () => {
    const gammel = R({ created_at: "2026-09-15T10:00:00.000Z" });
    expect(doem(gammel, "started", NU)).toEqual({ ok: false, grund: "for_gammel" });
    expect(doem(gammel, "submitted", NU)).toEqual({ ok: true, tid: new Date("2026-09-22T08:45:00.000Z") });
    expect(doem(R(), "started", NU)).toEqual({ ok: true, tid: new Date("2026-09-21T19:00:00.000Z") });
  });
});

describe("gaSend — sprunget over med grund (uden samtykke sendes intet)", () => {
  it("de fire grunde", () => {
    expect([...SPRUNGET_GRUNDE]).toEqual(["ingen_ga_client_id", "ikke_indsendt", "ingen_tidspunkt", "for_gammel"]);
    expect(doem(R({ ga_client_id: null }), "started", NU)).toEqual({ ok: false, grund: "ingen_ga_client_id" });
    expect(doem(R({ ga_client_id: "  " }), "started", NU)).toEqual({ ok: false, grund: "ingen_ga_client_id" });
    expect(doem(R({ indsendt_at: null }), "submitted", NU)).toEqual({ ok: false, grund: "ikke_indsendt" });
    expect(doem(R({ indsendt_at: null }), "started", NU).ok).toBe(true); // en kladde: started sendes, submitted ikke
    expect(doem(R({ created_at: "ikke en dato" }), "started", NU)).toEqual({ ok: false, grund: "ingen_tidspunkt" });
  });
});

describe("gaSend — payloaden: kun de tilladte felter, ingen persondata", () => {
  const p = bygPayload(R(), "submitted", new Date("2026-09-22T08:45:00.000Z"));
  it("det faktiske objekt: præcis disse nøgler og værdier", () => {
    expect(p).toEqual({
      client_id: "1234567890.1695300000",
      timestamp_micros: 1790066700000000,
      events: [{
        name: "application_submitted",
        params: {
          engagement_time_msec: 100,
          session_id: "1758480000",
          kilde: "direkte", utm_source: "fb", utm_medium: "paid",
          utm_campaign: "120212345678901234", utm_content: "120299999999999999",
        },
      }],
    });
    expect(Object.keys(p).sort()).toEqual(["client_id", "events", "timestamp_micros"]);
    expect(p.events).toHaveLength(1); // Google tillader 25; vi sender én ad gangen
    expect(ENGAGEMENT_TIME_MSEC).toBe(100); // Googles eksempelværdi — ikke en måling
  });
  it("timestamp_micros er MIKROsekunder, ikke millisekunder", () => {
    expect(p.timestamp_micros).toBe(Date.parse("2026-09-22T08:45:00.000Z") * 1000);
    expect(String(p.timestamp_micros)).toHaveLength(16);
  });
  it("session_id UDELADES, når vi ikke har et — et nyt id ville skabe en ny session", () => {
    const uden = bygPayload(R({ ga_session_id: null }), "started", NU);
    expect("session_id" in uden.events[0].params).toBe(false);
    expect(uden.events[0].params.engagement_time_msec).toBe(100);
    expect(bygPayload(R({ ga_session_id: "   " }), "started", NU).events[0].params.session_id).toBeUndefined();
  });
  it("tomme utm-felter udelades; værdier afkortes til Googles 100 tegn", () => {
    const tynd = bygPayload(R({ utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, kilde: "webinar" }), "started", NU);
    expect(Object.keys(tynd.events[0].params).sort()).toEqual(["engagement_time_msec", "kilde", "session_id"]);
    const lang = bygPayload(R({ utm_campaign: "x".repeat(250) }), "started", NU);
    expect(String(lang.events[0].params.utm_campaign)).toHaveLength(VAERDI_MAKS);
    expect(Object.keys(lang.events[0].params).length).toBeLessThanOrEqual(25); // Googles grænse
  });
  it("ingen forbudt nøgle, og ingen af ansøgerens værdier i JSON'en", () => {
    expect(findForbudteNoegler(p)).toEqual([]);
    const json = JSON.stringify(p);
    for (const v of Object.values(PERSON)) expect(json.includes(v), v).toBe(false);
    expect(json).not.toMatch(/@/);
    for (const n of ["email", "navn", "telefon", "cvr", "svar", "ip_hash", "user_agent", "fbclid", "user_id"]) expect(FORBUDTE_NOEGLER).toContain(n);
    // «name» er Googles eget felt på hændelsen og må ALDRIG stå på listen (fanget af denne prøve 21/9).
    expect(FORBUDTE_NOEGLER).not.toContain("name");
  });
  it("VÆRNET VIRKER: en indsmuglet mail, user agent eller fbclid fanges med sin sti", () => {
    expect(findForbudteNoegler({ ...p, events: [{ ...p.events[0], params: { ...p.events[0].params, email: "a@b.dk" } }] })).toEqual(["events[0].params.email"]);
    expect(findForbudteNoegler({ ...p, user_id: "x" })).toEqual(["user_id"]);
    expect(findForbudteNoegler({ a: { user_agent: null } })).toEqual(["a.user_agent"]);
    expect(findForbudteNoegler(null)).toEqual([]);
  });
});

describe("gaSend — låsen og debug", () => {
  it("kun true/\"true\" åbner låsen", () => {
    expect(laasErAktiv(true)).toBe(true);
    expect(laasErAktiv("true")).toBe(true);
    for (const v of [false, "false", null, undefined, 1, "ja", "TRUE", {}]) expect(laasErAktiv(v)).toBe(false);
  });
  it("sender kun med dry_run: false OG (låsen ELLER debug) — debug er tilladt uden lås", () => {
    expect(senderRigtigt({ dryRun: true, laasAktiv: true, debug: true })).toBe(false);
    expect(senderRigtigt({ dryRun: false, laasAktiv: false, debug: false })).toBe(false);
    expect(senderRigtigt({ dryRun: false, laasAktiv: true, debug: false })).toBe(true);
    expect(senderRigtigt({ dryRun: false, laasAktiv: false, debug: true })).toBe(true);
  });
});

describe("gaSend — idempotensen: intet forsøgsloft, vinduet er loftet", () => {
  it("sendt → aldrig igen (Google dedup'er ikke); ugyldig → aldrig igen; fejl/timeout prøves uanset forsøgstal", () => {
    expect(maaForsoeges(null)).toEqual({ ok: true });
    expect(maaForsoeges({ event_id: "x", udfald: "sendt", forsoeg: 1 })).toEqual({ ok: false, grund: "allerede_sendt" });
    expect(maaForsoeges({ event_id: "x", udfald: "ugyldig", forsoeg: 1 })).toEqual({ ok: false, grund: "ugyldig" });
    expect(maaForsoeges({ event_id: "x", udfald: "fejl", forsoeg: 2 })).toEqual({ ok: true });
    expect(maaForsoeges({ event_id: "x", udfald: "timeout", forsoeg: 99 })).toEqual({ ok: true });
    expect(maaForsoeges({ event_id: "x", udfald: "ingen_noegle", forsoeg: 500 })).toEqual({ ok: true });
  });
});

describe("gaSend — en debug-kørsel må aldrig efterlade en «sendt»-række (fejlen i #1073)", () => {
  it("debug: KUN valideringens NEJ skrives; en gyldig validering skriver intet", () => {
    expect(skalSkriveSpor("ugyldig", true)).toBe(true);
    for (const u of ["sendt", "fejl", "timeout", "ingen_noegle"] as const) expect(skalSkriveSpor(u, true), u).toBe(false);
  });
  it("rigtig kørsel: ALT skrives — uændret", () => {
    for (const u of SPOR_UDFALD) expect(skalSkriveSpor(u, false), u).toBe(true);
  });
  it("FEJLEN, prøvet som den ville være sket: validering → rigtig afsendelse springes IKKE over", () => {
    // Før rettelsen upsertede debug-kørslen {udfald: "sendt"}, og maaForsoeges sagde «allerede_sendt».
    expect(maaForsoeges({ event_id: "x", udfald: "sendt", forsoeg: 1 })).toEqual({ ok: false, grund: "allerede_sendt" });
    // Efter rettelsen skrives den række slet ikke — sporet er tomt, og hændelsen må sendes.
    expect(skalSkriveSpor("sendt", true)).toBe(false);
    expect(maaForsoeges(null)).toEqual({ ok: true });
  });
  it("valideringens NEJ blokerer stadig — også når det kom fra en debug-kørsel", () => {
    expect(skalSkriveSpor("ugyldig", true)).toBe(true);
    expect(maaForsoeges({ event_id: "x", udfald: "ugyldig", forsoeg: 1 })).toEqual({ ok: false, grund: "ugyldig" });
  });
});

describe("gaSend — svaret (Measurement Protocol svarer aldrig med fejlkoder)", () => {
  it("produktion: 2xx = sendt, uanset kroppen — en forkert nøgle ser præcis sådan ud", () => {
    expect(doemGaSvar(204, "", false)).toEqual({ udfald: "sendt", validering: null, fejl: null });
    expect(doemGaSvar(200, "hvad som helst", false).udfald).toBe("sendt");
  });
  it("debug: tom validationMessages = sendt (gyldig); beskeder = ugyldig med teksten", () => {
    expect(doemGaSvar(200, '{"validationMessages":[]}', true)).toEqual({ udfald: "sendt", validering: [], fejl: null });
    const svar = doemGaSvar(200, '{"validationMessages":[{"fieldPath":"events[0].params.session_id","description":"Ugyldig","validationCode":"VALUE_INVALID"}]}', true);
    expect(svar.udfald).toBe("ugyldig");
    expect(svar.validering).toHaveLength(1);
    expect(svar.fejl).toContain("VALUE_INVALID");
    expect(svar.fejl).toContain("events[0].params.session_id");
    expect(doemGaSvar(200, "ikke json", true).udfald).toBe("ugyldig");
  });
  it("401/403 = ingen_noegle; 5xx = fejl; 4xx = ugyldig", () => {
    expect(doemGaSvar(401, "", false).udfald).toBe("ingen_noegle");
    expect(doemGaSvar(403, "", true).udfald).toBe("ingen_noegle");
    expect(doemGaSvar(500, "boom", false).udfald).toBe("fejl");
    expect(doemGaSvar(400, "nej", false).udfald).toBe("ugyldig");
  });
});

describe("gaSend — alarmen (princip 1): én mail pr. døgn", () => {
  it("nøglen bærer den danske dato; teksten siger, at vinduet er loftet", () => {
    expect(alarmNoegle(new Date("2026-09-22T05:04:00Z"))).toBe("ga-send-alarm:2026-09-22");
    expect(alarmNoegle(new Date("2026-09-22T21:59:00Z"))).toBe("ga-send-alarm:2026-09-22"); // 23:59 dansk
    const t = alarmTekst([{ event_id: `${ID}:started`, udfald: "timeout", fejl: "intet svar inden 8000 ms", forsoeg: 3 }], NU);
    expect(t.emne).toBe("1 GA-hændelse kunne ikke sendes — Google Analytics har brug for et menneske");
    expect(t.titel).toBe("Google Analytics: 1 GA-hændelse kunne ikke sendes (2026-09-22)");
    expect(t.afsnit[1]).toContain("vinduet er loftet");
    expect(t.blokke[0].tekst).toContain("timeout · forsøg 3");
    const u = alarmTekst([{ event_id: "x", udfald: "ugyldig", fejl: "VALUE_REQUIRED", forsoeg: 1 }], NU);
    expect(u.afsnit[1]).toContain("validationMessages");
  });
});
