/**
 * webinarImport (udkast 19/9): engangsimportens dom. REST-formens feltnavne
 * oversat til webhookens, så ÉN plukker læser begge veje; feltrapporten der
 * er selve målingen; og de to små ting importen hviler på (erForskellig,
 * kanoniskJson).
 *
 * Fixturen er OpenAPI-spec'ens V2Registrant-felter (målt 19/9,
 * api.ewebinar.com/docs/openapi.json) — uden procent, som skemaet er.
 */
import { describe, expect, it } from "vitest";
import {
  erForskellig,
  feltRapport,
  feltRapportSomMarkdown,
  KENDTE_NOEGLER,
  kanoniskJson,
  plukRestRegistrant,
  somWebhookForm,
} from "../../../supabase/functions/_shared/webinarImport.ts";
import { fletTilmelding, plukTilmelding, type WebinarTilmelding } from "../../../supabase/functions/_shared/webinarDom.ts";

/** REST-formen, ordret efter V2Registrant-skemaet. */
const REST = {
  id: "abCD1234Efg56",
  firstName: "John",
  lastName: "Doe",
  email: "John.Doe@defaultmail.com",
  sessionTime: "2026-09-22T17:00:00.000Z",
  optOut: false,
  registeredAt: "2026-09-10T08:24:01.263Z",
  setId: "14166",
  webinarTitle: "Mortens webinar",
};

describe("somWebhookForm — REST-navne til webhook-navne", () => {
  it("setId → webinarId, registeredAt → registeredTime, optOut → subscribed", () => {
    const f = somWebhookForm(REST);
    expect(f.webinarId).toBe("14166");
    expect(f.registeredTime).toBe("2026-09-10T08:24:01.263Z");
    expect(f.subscribed).toBe("Subscribed");
    expect(somWebhookForm({ ...REST, optOut: true }).subscribed).toBe("Unsubscribed");
  });

  it("webhookens egne navne vinder, når begge er der (en payload der bærer begge sæt)", () => {
    const f = somWebhookForm({ ...REST, webinarId: "999", registeredTime: "2026-01-01T00:00:00Z", subscribed: "Subscribed" });
    expect(f.webinarId).toBe("999");
    expect(f.registeredTime).toBe("2026-01-01T00:00:00Z");
  });

  it("rører ikke felter vi ikke kender — de følger med til plukkeren og til loggen", () => {
    const f = somWebhookForm({ ...REST, totalWatchedPercent: 62, nytFelt: { dybt: "ok" } });
    expect(f.totalWatchedPercent).toBe(62);
    expect(f.nytFelt).toEqual({ dybt: "ok" });
  });

  it("optOut som ikke-boolean giver ingen subscribed (vi gætter ikke)", () => {
    expect(somWebhookForm({ ...REST, optOut: "nej" }).subscribed).toBeUndefined();
  });
});

describe("plukRestRegistrant — samme plukker som webhooken", () => {
  it("plukker REST-registranten: id, mail i små bogstaver, navn fra for+efternavn, webinar fra setId", () => {
    const p = plukRestRegistrant(REST);
    expect(p.ok).toBe(true);
    if (p.ok === false) return;
    expect(p.tilmelding).toEqual({
      ewebinar_id: "abCD1234Efg56",
      email: "john.doe@defaultmail.com",
      navn: "John Doe",
      webinar_id: "14166",
      webinar_titel: "Mortens webinar",
      session_tid: "2026-09-22T17:00:00.000Z",
      session_type: null,
      registreret_at: "2026-09-10T08:24:01.263Z",
      state: null,
      sidste_action: null,
      attended: null,
      subscribed: "Subscribed",
      set_procent: null,
      set_procent_kilde: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      fbclid: null,
      origin: null,
      first_origin: null,
      referrer: null,
      first_referrer: null,
      widget_source: null,
      by: null,
      land: null,
      enhed: null,
      tidszone: null,
    });
  });

  it("procenten plukkes med webhookens egen findProcent — uanset hvad feltet hedder", () => {
    const p = plukRestRegistrant({ ...REST, totalWatchedPercent: "62 %" });
    expect(p.ok && p.tilmelding.set_procent).toBe(62);
    expect(p.ok && p.tilmelding.set_procent_kilde).toBe("totalWatchedPercent");
  });

  it("sessionTime «replay» → ingen tid; manglende setId → sprunget over med grund", () => {
    expect(plukRestRegistrant({ ...REST, sessionTime: "replay" })).toMatchObject({ ok: true });
    const p = plukRestRegistrant({ ...REST, sessionTime: "replay" });
    expect(p.ok && p.tilmelding.session_tid).toBeNull();
    expect(plukRestRegistrant({ ...REST, setId: undefined })).toEqual({ ok: false, grund: "uden_webinar_id" });
    expect(plukRestRegistrant({ ...REST, email: "" })).toEqual({ ok: false, grund: "uden_email" });
    expect(plukRestRegistrant(null)).toEqual({ ok: false, grund: "ikke_et_objekt" });
  });

  it("DE TO VEJE MØDES: webhook-payload og REST-registrant for samme person giver samme ewebinar_id og mail", () => {
    const webhook = plukTilmelding({ id: "abCD1234Efg56", email: "John.Doe@defaultmail.com", name: "John Doe", webinarId: 14166, state: "Watched", action: "WatchedWebinar", sessionTime: "2026-09-22T17:00:00.000Z" });
    const rest = plukRestRegistrant(REST);
    expect(webhook.ok && rest.ok).toBe(true);
    if (webhook.ok === false || rest.ok === false) return;
    expect(rest.tilmelding.ewebinar_id).toBe(webhook.tilmelding.ewebinar_id);
    expect(rest.tilmelding.email).toBe(webhook.tilmelding.email);
  });
});

describe("fletningen — importen må aldrig sænke det webhooken allerede ved", () => {
  const fraWebhook: WebinarTilmelding = {
    ewebinar_id: "abCD1234Efg56", email: "john.doe@defaultmail.com", navn: "John Doe",
    webinar_id: "14166", webinar_titel: "Mortens webinar", session_tid: "2026-09-22T17:00:00.000Z",
    session_type: "Scheduled", registreret_at: "2026-09-10T08:24:01.263Z",
    state: "Watched", sidste_action: "WatchedWebinar", attended: "Attended", subscribed: "Subscribed",
    set_procent: 78, set_procent_kilde: "watchedPercent",
    // Annoncesporet fra den oprindelige tilmelding — importen må ikke slette det.
    utm_source: "fb", utm_medium: "paid", utm_campaign: "webinar-sep", utm_content: "annonce-3", utm_term: null,
    fbclid: "IwAR-abc123", origin: "https://topix.dk/webinar?fbclid=IwAR-abc123", first_origin: null,
    referrer: "https://www.facebook.com/", first_referrer: null, widget_source: "topix-webinar-side",
    by: "Aarhus", land: "DK", enhed: "Mobile", tidszone: "Europe/Copenhagen",
  };

  it("import uden procent og uden state efter en webhook med begge: intet tabes", () => {
    const rest = plukRestRegistrant(REST);
    if (rest.ok === false) throw new Error("plukket fejlede");
    const flettet = fletTilmelding(fraWebhook, rest.tilmelding);
    expect(flettet.set_procent).toBe(78);
    expect(flettet.set_procent_kilde).toBe("watchedPercent");
    expect(flettet.state).toBe("Watched");
    expect(flettet.sidste_action).toBe("WatchedWebinar");
    expect(flettet.session_type).toBe("Scheduled");
    // ANNONCESPORET OVERLEVER importen: REST-svaret bærer det ikke, og null overskriver aldrig.
    expect(flettet.utm_campaign).toBe("webinar-sep");
    expect(flettet.fbclid).toBe("IwAR-abc123");
    expect(flettet.widget_source).toBe("topix-webinar-side");
    expect(erForskellig(fraWebhook, flettet)).toBe(false);
  });

  it("import MED et højere tal vinder — den er lige så gyldig en kilde", () => {
    const rest = plukRestRegistrant({ ...REST, totalWatchedPercent: 91 });
    if (rest.ok === false) throw new Error("plukket fejlede");
    const flettet = fletTilmelding(fraWebhook, rest.tilmelding);
    expect(flettet.set_procent).toBe(91);
    expect(erForskellig(fraWebhook, flettet)).toBe(true);
  });

  it("erForskellig: ny række er altid forskellig; ens felter er ikke", () => {
    expect(erForskellig(null, fraWebhook)).toBe(true);
    expect(erForskellig(fraWebhook, { ...fraWebhook })).toBe(false);
    expect(erForskellig(fraWebhook, { ...fraWebhook, navn: "J. Doe" })).toBe(true);
  });
});

describe("feltRapport — MÅLINGEN af hvad API'et sender", () => {
  it("tæller nøgler, typer og ikke-tomme, og markerer hvad vi ikke bruger", () => {
    const r = feltRapport([REST, { ...REST, id: "b2", lastName: "", webinarTitle: null }]);
    expect(r.registranter).toBe(2);
    const id = r.linjer.find((l) => l.noegle === "id")!;
    expect(id).toMatchObject({ typer: ["string"], antal: 2, ikkeTomme: 2, ukendt: false });
    const efternavn = r.linjer.find((l) => l.noegle === "lastName")!;
    expect(efternavn.ikkeTomme).toBe(1);
    const titel = r.linjer.find((l) => l.noegle === "webinarTitle")!;
    expect(titel.typer).toEqual(["null", "string"]);
    // Skemaets felter er alle kendte i dag:
    expect(r.ukendteNoegler).toEqual([]);
    expect(r.procentFundet).toEqual([]);
  });

  it("finder procent-kandidater — også ét niveau nede — og siger at de ikke bruges endnu", () => {
    const r = feltRapport([{ ...REST, watchedPercent: 62, properties: { total_watched_percent: "78 %" } }]);
    expect(r.procentFundet).toEqual(["properties.total_watched_percent", "watchedPercent"]);
    expect(r.ukendteNoegler).toContain("watchedPercent");
    const linje = r.linjer.find((l) => l.noegle === "watchedPercent")!;
    expect(linje).toMatchObject({ procentKandidat: true, ukendt: true, eksempel: "62" });
  });

  it("link-/tidsnøgler er ikke procent-kandidater, selv om de indeholder «watched»", () => {
    const r = feltRapport([{ ...REST, watchedReplayLink: "https://x", watchedTime: "2026-09-22T17:00:00Z" }]);
    expect(r.procentFundet).toEqual([]);
  });

  it("markdown-tabellen kan klistres i README og kalder procent-kandidater ud", () => {
    const md = feltRapportSomMarkdown(feltRapport([{ ...REST, watchedPercent: 62 }]));
    expect(md.split("\n")[0]).toBe("| felt | type(r) | har værdi | eksempel | bruges i dag |");
    expect(md).toContain("| `watchedPercent` | number | 1/1 | 62 | **NEJ — procent-kandidat** |");
    expect(md).toContain("| `email` |");
  });

  it("tåler tom liste og skrammel", () => {
    expect(feltRapport([])).toEqual({ registranter: 0, linjer: [], procentFundet: [], ukendteNoegler: [] });
    expect(feltRapport([null as unknown as Record<string, unknown>]).linjer).toEqual([]);
  });

  it("KENDTE_NOEGLER dækker begge navnesæt, så rapporten ikke kalder kendte felter ukendte", () => {
    for (const n of ["setId", "webinarId", "registeredAt", "registeredTime", "optOut", "subscribed", "attendeeId"]) {
      expect(KENDTE_NOEGLER).toContain(n);
    }
  });
});

describe("kanoniskJson — aftrykket må ikke afhænge af nøglerækkefølgen", () => {
  it("samme objekt, forskellig rækkefølge → samme tekst", () => {
    expect(kanoniskJson({ b: 1, a: 2 })).toBe(kanoniskJson({ a: 2, b: 1 }));
    expect(kanoniskJson({ a: { d: 1, c: [3, { f: 1, e: 2 }] } })).toBe(kanoniskJson({ a: { c: [3, { e: 2, f: 1 }] , d: 1 } }));
  });

  it("forskelligt indhold → forskellig tekst; undefined springes over", () => {
    expect(kanoniskJson({ a: 1 })).not.toBe(kanoniskJson({ a: 2 }));
    expect(kanoniskJson({ a: 1, b: undefined })).toBe(kanoniskJson({ a: 1 }));
    expect(kanoniskJson(null)).toBe("null");
    expect(kanoniskJson("x")).toBe('"x"');
  });
});
