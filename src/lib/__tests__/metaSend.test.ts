import { describe, expect, it } from "vitest";
import {
  alarmNoegle, alarmTekst, type AnsoegningTilMeta, bygFbc, bygPayload, doem, doemMetaSvar, erIVindue, erTestEventCode, eventId,
  findForbudteNoegler, FORBUDTE_NOEGLER, laasErAktiv, maaForsoeges, META_DATASET_ID, META_EVENT, META_SEND_TOKEN_NAVN,
  META_VINDUE_DAGE, senderRigtigt, SPRUNGET_GRUNDE,
} from "../../../supabase/functions/_shared/metaSend.ts";
import { laesUserAgent, sporMedUserAgent, USER_AGENT_MAKS } from "../../../supabase/functions/_shared/ansoegningUserAgent.ts";

/**
 * Metas Conversions API fra platformen (udkast 21/9-2026 aften) — de rene regler:
 * payloaden (kun de tilladte felter; ingen persondata — prøve på det FAKTISKE objekt),
 * fbc, event_id, 7-dagesreglen, låsen, sprunget-over-grundene, idempotensen,
 * user_agent kun med fbclid.
 */
const ID = "3f6c2a10-1111-4111-8111-111111111111";
const NU = new Date("2026-09-22T09:30:00Z");
const R = (o: Partial<AnsoegningTilMeta> = {}): AnsoegningTilMeta => ({
  id: ID, created_at: "2026-09-21T19:00:00.000Z", indsendt_at: "2026-09-22T08:45:00.000Z",
  fbclid: "IwAR0abcDEF_123-xyz", landing: "https://app.theboardroom.dk/ansoeg?utm_source=fb&fbclid=IwAR0abcDEF_123-xyz&kilde=direkte",
  user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  ...o,
});
const AFTRYK = "a".repeat(64);
// Det, der ALDRIG må stå i payloaden — som værdier (ansøgerens egne) og som nøgler.
const PERSON = { navn: "Anna Andersen", email: "anna@firma.dk", telefon: "+4512345678", cvr: "12345678", ip: "203.0.113.7", svar: "Vi mangler overblik" };

describe("metaSend — fbc og event_id", () => {
  it("fbc = fb.1.<ms da fbclid blev set>.<fbclid> — indeks 1 er Metas regel for server-genereret uden cookie", () => {
    expect(bygFbc("IwAR0abc", new Date("2026-09-21T19:00:00.000Z"))).toBe("fb.1.1790017200000.IwAR0abc");
    expect(bygFbc("x", new Date(1554763741205))).toBe("fb.1.1554763741205.x"); // Metas eget eksempel-tidspunkt
  });
  it("event_id = <ansøgnings-id>:started / :submitted; content_name som hjemmesidens gamle tags", () => {
    expect(eventId(ID, "started")).toBe(`${ID}:started`);
    expect(eventId(ID, "submitted")).toBe(`${ID}:submitted`);
    expect(META_EVENT.started).toEqual({ event_name: "Lead", content_name: "application_started" });
    expect(META_EVENT.submitted).toEqual({ event_name: "Lead", content_name: "application_submitted" });
    expect(META_DATASET_ID).toBe("858180112996496");
    expect(META_SEND_TOKEN_NAVN).toBe("META_SEND_TOKEN");
  });
});

describe("metaSend — 7-dagesreglen («The event_time can be up to 7 days before you send an event»)", () => {
  it("inden for vinduet: ja; præcis 7 dage: ja; 7 dage + 1 s: nej; i fremtiden: nej", () => {
    expect(META_VINDUE_DAGE).toBe(7);
    expect(erIVindue(new Date(NU.getTime() - 3 * 86_400_000), NU)).toBe(true);
    expect(erIVindue(new Date(NU.getTime() - 7 * 86_400_000), NU)).toBe(true);
    expect(erIVindue(new Date(NU.getTime() - 7 * 86_400_000 - 1000), NU)).toBe(false);
    expect(erIVindue(new Date(NU.getTime() + 60_000), NU)).toBe(false);
  });
  it("dommen: started bruger created_at, submitted bruger indsendt_at — hver med sit vindue", () => {
    const gammel = R({ created_at: "2026-09-10T10:00:00.000Z", indsendt_at: "2026-09-22T08:45:00.000Z" });
    expect(doem(gammel, "started", NU)).toEqual({ ok: false, grund: "for_gammel" });
    expect(doem(gammel, "submitted", NU)).toEqual({ ok: true, tid: new Date("2026-09-22T08:45:00.000Z") });
    expect(doem(R(), "started", NU)).toEqual({ ok: true, tid: new Date("2026-09-21T19:00:00.000Z") });
  });
});

describe("metaSend — sprunget over med grund (uden fbclid, user agent eller landing sendes IKKE)", () => {
  it("de seks grunde", () => {
    expect([...SPRUNGET_GRUNDE]).toEqual(["ingen_fbclid", "ingen_user_agent", "ingen_landing", "ikke_indsendt", "ingen_tidspunkt", "for_gammel"]);
    expect(doem(R({ fbclid: null }), "started", NU)).toEqual({ ok: false, grund: "ingen_fbclid" });
    expect(doem(R({ fbclid: "  " }), "started", NU)).toEqual({ ok: false, grund: "ingen_fbclid" });
    expect(doem(R({ user_agent: null }), "started", NU)).toEqual({ ok: false, grund: "ingen_user_agent" });
    expect(doem(R({ landing: "" }), "started", NU)).toEqual({ ok: false, grund: "ingen_landing" });
    expect(doem(R({ indsendt_at: null }), "submitted", NU)).toEqual({ ok: false, grund: "ikke_indsendt" });
    expect(doem(R({ indsendt_at: null }), "started", NU).ok).toBe(true); // en kladde: started sendes, submitted ikke
    expect(doem(R({ created_at: "ikke en dato" }), "started", NU)).toEqual({ ok: false, grund: "ingen_tidspunkt" });
  });
});

describe("metaSend — payloaden: kun de tilladte felter, ingen persondata", () => {
  const p = bygPayload(R(), "submitted", new Date("2026-09-22T08:45:00.000Z"), AFTRYK);
  it("det faktiske objekt: præcis disse nøgler og værdier", () => {
    expect(p).toEqual({
      event_name: "Lead",
      event_time: 1790066700,
      event_id: `${ID}:submitted`,
      action_source: "website",
      event_source_url: "https://app.theboardroom.dk/ansoeg?utm_source=fb&fbclid=IwAR0abcDEF_123-xyz&kilde=direkte",
      user_data: { fbc: "fb.1.1790017200000.IwAR0abcDEF_123-xyz", external_id: [AFTRYK], client_user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" },
      custom_data: { content_name: "application_submitted" },
    });
    expect(Object.keys(p.user_data).sort()).toEqual(["client_user_agent", "external_id", "fbc"]);
    expect(Object.keys(p).sort()).toEqual(["action_source", "custom_data", "event_id", "event_name", "event_source_url", "event_time", "user_data"]);
  });
  it("ingen forbudt nøgle (em, ph, client_ip_address, navn, email, telefon, cvr, svar …) og ingen af ansøgerens værdier i JSON'en", () => {
    expect(findForbudteNoegler(p)).toEqual([]);
    const json = JSON.stringify(p);
    for (const v of Object.values(PERSON)) expect(json.includes(v), v).toBe(false);
    expect(json).not.toMatch(/@/);
    for (const n of ["em", "ph", "client_ip_address", "fbp", "email", "navn", "telefon", "cvr", "svar", "ga_client_id", "ga_session_id"]) expect(FORBUDTE_NOEGLER).toContain(n);
    // GA's id'er (21/9 aften) må aldrig følge med til Meta.
    expect(findForbudteNoegler({ ...p, user_data: { ...p.user_data, ga_client_id: "1.2" } })).toEqual(["user_data.ga_client_id"]);
    expect(findForbudteNoegler({ ...p, custom_data: { ...p.custom_data, ga_session_id: "3" } })).toEqual(["custom_data.ga_session_id"]);
  });
  it("fbc's tidspunkt er created_at (første gang vi så fbclid'et), også for submitted; user agent afkortes til 512", () => {
    const s = bygPayload(R({ user_agent: "x".repeat(700) }), "started", new Date("2026-09-21T19:00:00.000Z"), AFTRYK);
    expect(s.user_data.fbc).toBe("fb.1.1790017200000.IwAR0abcDEF_123-xyz");
    expect(p.user_data.fbc).toBe(s.user_data.fbc);
    expect(s.user_data.client_user_agent).toHaveLength(512);
    expect(s.event_time).toBe(1790017200);
  });
  it("VÆRNET VIRKER: en indsmuglet em/ph/ip/navn fanges med sin sti", () => {
    expect(findForbudteNoegler({ ...p, user_data: { ...p.user_data, em: ["hash"] } })).toEqual(["user_data.em"]);
    expect(findForbudteNoegler({ ...p, user_data: { ...p.user_data, client_ip_address: "1.2.3.4" } })).toEqual(["user_data.client_ip_address"]);
    expect(findForbudteNoegler({ ...p, custom_data: { ...p.custom_data, navn: "Anna" } })).toEqual(["custom_data.navn"]);
    expect(findForbudteNoegler({ data: [{ user_data: { ph: ["x"] } }] })).toEqual(["data[0].user_data.ph"]);
  });
});

describe("metaSend — låsen (bevisets, ikke juraens — Jonas 21/9-2026)", () => {
  it("kun true/\"true\" åbner; alt andet er lukket", () => {
    expect(laasErAktiv(true)).toBe(true);
    expect(laasErAktiv("true")).toBe(true);
    for (const v of [false, "false", null, undefined, 1, "ja", "TRUE", {}]) expect(laasErAktiv(v)).toBe(false);
  });
  it("sender rigtigt KUN med dry_run: false OG (låsen ELLER en testkode) — testkoden er tilladt uden lås", () => {
    expect(senderRigtigt({ dryRun: true, laasAktiv: true, testEventCode: "TEST123" })).toBe(false);
    expect(senderRigtigt({ dryRun: false, laasAktiv: false, testEventCode: null })).toBe(false);
    expect(senderRigtigt({ dryRun: false, laasAktiv: true, testEventCode: null })).toBe(true);
    expect(senderRigtigt({ dryRun: false, laasAktiv: false, testEventCode: "TEST123" })).toBe(true);
    expect(erTestEventCode("TEST12345")).toBe(true);
    for (const v of ["", "ab", "x".repeat(41), "TEST 1", 12, null]) expect(erTestEventCode(v)).toBe(false);
  });
});

describe("metaSend — idempotensen (sporet)", () => {
  it("sendt → aldrig igen; ugyldig → aldrig igen; ALT andet (ingen_noegle/fejl/timeout) → igen ved hver kørsel, uanset forsøg — intet loft (Metas 7 dage er loftet)", () => {
    expect(maaForsoeges(null)).toEqual({ ok: true });
    expect(maaForsoeges({ event_id: "x", udfald: "sendt", forsoeg: 1 })).toEqual({ ok: false, grund: "allerede_sendt" });
    expect(maaForsoeges({ event_id: "x", udfald: "ugyldig", forsoeg: 1 })).toEqual({ ok: false, grund: "ugyldig" });
    expect(maaForsoeges({ event_id: "x", udfald: "fejl", forsoeg: 2 })).toEqual({ ok: true });
    expect(maaForsoeges({ event_id: "x", udfald: "timeout", forsoeg: 6 })).toEqual({ ok: true });
    expect(maaForsoeges({ event_id: "x", udfald: "ingen_noegle", forsoeg: 1 })).toEqual({ ok: true });
    // 7 dage × 288 kørsler pr. døgn: ingen af dem giver op — kun doem («for_gammel») stopper.
    expect(maaForsoeges({ event_id: "x", udfald: "fejl", forsoeg: 7 * 288 })).toEqual({ ok: true });
    expect(maaForsoeges({ event_id: "x", udfald: "ingen_noegle", forsoeg: 2016 })).toEqual({ ok: true });
  });
  it("Metas svar dømmes på FEJLKODEN, med rigtige Graph API-kroppe: 2xx = sendt; 400+190 = ingen_noegle; 400+100 = ugyldig; 400+4 = fejl; 500 = fejl", () => {
    expect(doemMetaSvar(200, '{"events_received":1,"fbtrace_id":"abc"}')).toEqual({ udfald: "sendt", events_received: 1, fejl: null, kode: null });
    expect(doemMetaSvar(200, "ok")).toMatchObject({ udfald: "sendt", events_received: null });
    // Metas eget eksempel (error-handling-siden): 190 + OAuthException = nøglen — prøves igen, når secret'en er rettet.
    const k190 = '{"error":{"message":"Error validating access token: Session has expired","type":"OAuthException","code":190,"error_subcode":463,"fbtrace_id":"EJplcsCHuLu"}}';
    expect(doemMetaSvar(400, k190)).toEqual({ udfald: "ingen_noegle", events_received: null, fejl: "Error validating access token: Session has expired (kode 190/463)", kode: 190 });
    // Kode 100 = en rigtig fejl i payloaden — den eneste, der aldrig prøves igen.
    const k100 = '{"error":{"message":"Invalid parameter","type":"OAuthException","code":100,"error_subcode":2804003,"fbtrace_id":"A1"}}';
    expect(doemMetaSvar(400, k100)).toEqual({ udfald: "ugyldig", events_received: null, fejl: "Invalid parameter (kode 100/2804003)", kode: 100 });
    // Throttling bærer OGSÅ type OAuthException (Metas eksempel på kode 32) — det er midlertidigt, ikke nøglen.
    const k4 = '{"error":{"message":"(#4) Application request limit reached","type":"OAuthException","code":4,"fbtrace_id":"A2"}}';
    expect(doemMetaSvar(400, k4)).toEqual({ udfald: "fejl", events_received: null, fejl: "(#4) Application request limit reached (kode 4)", kode: 4 });
    expect(doemMetaSvar(400, '{"error":{"message":"(#32) Page request limit reached","type":"OAuthException","code":32,"fbtrace_id":"Fz54k3GZrio"}}').udfald).toBe("fejl");
    for (const kode of [1, 2, 17, 341, 613]) expect(doemMetaSvar(400, `{"error":{"message":"x","code":${kode}}}`).udfald).toBe("fejl");
    expect(doemMetaSvar(400, '{"error":{"message":"x","code":100,"is_transient":true}}').udfald).toBe("fejl");
    for (const kode of [10, 102, 200, 250, 299]) expect(doemMetaSvar(400, `{"error":{"message":"x","code":${kode}}}`).udfald).toBe("ingen_noegle");
    expect(doemMetaSvar(400, '{"error":{"message":"x","type":"OAuthException"}}').udfald).toBe("ingen_noegle");
    expect(doemMetaSvar(401, '{"error":{"message":"Invalid OAuth access token"}}').udfald).toBe("ingen_noegle");
    expect(doemMetaSvar(403, "forbidden").udfald).toBe("ingen_noegle");
    expect(doemMetaSvar(400, '{"error":{"message":"x","code":300}}').udfald).toBe("ugyldig");
    expect(doemMetaSvar(400, "not json")).toMatchObject({ udfald: "ugyldig", fejl: "not json", kode: null });
    expect(doemMetaSvar(500, "boom")).toMatchObject({ udfald: "fejl", kode: null });
    expect(doemMetaSvar(503, '{"error":{"message":"x","code":100}}').udfald).toBe("fejl");
  });
});

describe("metaSend — user agent gemmes KUN med fbclid (ansoegning-gem)", () => {
  const spor = { utm_source: "fb", utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null, fbclid: "IwAR0abc", landing: "https://app.theboardroom.dk/ansoeg", referrer: null };
  it("med fbclid: user_agent med i samme update; uden fbclid: ikke med (heller ikke som null)", () => {
    expect(sporMedUserAgent(spor, "Mozilla/5.0")).toEqual({ ...spor, user_agent: "Mozilla/5.0" });
    expect(sporMedUserAgent({ ...spor, fbclid: null }, "Mozilla/5.0")).toEqual({ ...spor, fbclid: null });
    expect("user_agent" in sporMedUserAgent({ ...spor, fbclid: null }, "Mozilla/5.0")).toBe(false);
    expect(sporMedUserAgent(spor, null)).toEqual({ ...spor, user_agent: null });
  });
  it("headeren læses trimmet og afkortet til 512; tom → null", () => {
    const req = (ua: string | null) => ({ headers: { get: (n: string) => (n === "user-agent" ? ua : null) } });
    expect(laesUserAgent(req("  Mozilla/5.0 "))).toBe("Mozilla/5.0");
    expect(laesUserAgent(req("x".repeat(600)))).toHaveLength(USER_AGENT_MAKS);
    expect(laesUserAgent(req(""))).toBeNull();
    expect(laesUserAgent(req(null))).toBeNull();
  });
});

describe("metaSend — alarmen (princip 1): én mail pr. døgn", () => {
  it("nøglen bærer den danske dato; teksten nævner nøglefejl, når den er der", () => {
    expect(alarmNoegle(new Date("2026-09-22T05:04:00Z"))).toBe("meta-send-alarm:2026-09-22");
    expect(alarmNoegle(new Date("2026-09-22T21:59:00Z"))).toBe("meta-send-alarm:2026-09-22"); // 23:59 dansk
    const t = alarmTekst([{ event_id: `${ID}:started`, udfald: "ingen_noegle", fejl: "Invalid OAuth access token", forsoeg: 1 }], NU);
    expect(t.emne).toBe("1 Meta-hændelse kunne ikke sendes — Conversions API har brug for et menneske");
    expect(t.titel).toBe("Meta: 1 Meta-hændelse kunne ikke sendes (2026-09-22)");
    expect(t.afsnit[1]).toContain("META_SEND_TOKEN");
    expect(t.afsnit[1]).toContain("prøves igen ved hver kørsel, så længe hændelsen er under 7 dage gammel");
    expect(t.blokke[0].tekst).toContain("ingen_noegle · forsøg 1 — Invalid OAuth access token");
    const u = alarmTekst([{ event_id: `${ID}:started`, udfald: "timeout", fejl: "ingen svar inden 8000 ms", forsoeg: 40 }], NU);
    expect(u.afsnit[1]).toContain("fejl/timeout prøves igen ved hver kørsel, så længe hændelsen er under 7 dage gammel");
    expect(u.afsnit[1]).not.toContain("seks");
    expect(u.tekst).not.toMatch(/op til seks|opgiv/);
  });
});
