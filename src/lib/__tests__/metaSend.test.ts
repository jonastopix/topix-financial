import { describe, expect, it } from "vitest";
import {
  AFTRYK_FORM, alarmNoegle, alarmTekst, type AnsoegningTilMeta, BRUGERDATA_NOEGLER, brugerdataNoegler, bygFbc, bygFbcFelt,
  bygFbpFelt, bygPayload, doem, doemMetaSvar, erIVindue, erKunAftryk, erNoegleSubkode, erRaaTal, erTestEventCode, eventId,
  fbcKilde, findForbudteNoegler, FORBUDTE_NOEGLER, HASHEDE_NOEGLER, hashBrugerdata, laasErAktiv, maaForsoeges, META_DATASET_ID,
  META_EVENT, META_LAND, META_SEND_TOKEN_NAVN, META_VINDUE_DAGE, NOEGLE_SUBKODER, normaliserBrugerdata, normaliserEmail,
  normaliserNavn, normaliserTelefon, senderRigtigt, SPRUNGET_GRUNDE,
} from "../../../supabase/functions/_shared/metaSend.ts";
import { laesUserAgent, sporMedUserAgent, USER_AGENT_MAKS } from "../../../supabase/functions/_shared/ansoegningUserAgent.ts";

/**
 * Metas Conversions API fra platformen (udkast 21/9-2026 aften, UDVIDET 22/9) — de rene regler:
 * payloaden (kun de tilladte felter; ingen UHASHET persondata — prøve på det FAKTISKE objekt),
 * normaliseringen efter Metas egne regler, hashningen, fbc/fbp, event_id, 7-dagesreglen, låsen,
 * sprunget-over-grundene, fravalget, idempotensen, user_agent for alle.
 */
const ID = "3f6c2a10-1111-4111-8111-111111111111";
const NU = new Date("2026-09-22T09:30:00Z");
/**
 * PRØVEVÆRDIER, DER IKKE KAN KOLLIDERE (lærdom 21/9): CVR'et 12345678 er en delstreng af et
 * Meta-annonce-id, og lækprøven slog falsk alarm. Derfor et rigtigt, adskilt sæt her.
 */
const PERSON = { navn: "Anna Andersen", email: "anna@firma.dk", telefon: "+4540506070", cvr: "45281736", ip: "203.0.113.7", svar: "Vi mangler overblik" };
const R = (o: Partial<AnsoegningTilMeta> = {}): AnsoegningTilMeta => ({
  id: ID, created_at: "2026-09-21T19:00:00.000Z", indsendt_at: "2026-09-22T08:45:00.000Z",
  fbclid: "IwAR0abcDEF_123-xyz", landing: "https://app.theboardroom.dk/ansoeg?utm_source=fb&fbclid=IwAR0abcDEF_123-xyz&kilde=direkte",
  user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  email: PERSON.email, navn: PERSON.navn, telefon: PERSON.telefon,
  fbp: "fb.1.1790017100000.1234567890", fbc_cookie: "fb.1.1790017100000.IwARcookieVaerdi", meta_fravalg: false,
  ...o,
});
const AFTRYK = "a".repeat(64);
/** En hasher, prøven kan regne med: 64 hex, forskellig pr. input, og synlig i påstandene. */
const hash = async (v: string): Promise<string> => {
  let h = 0n;
  for (const c of v) h = (h * 131n + BigInt(c.codePointAt(0) ?? 0)) % (2n ** 256n);
  return h.toString(16).padStart(64, "0").slice(-64);
};

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

describe("metaSend — normaliseringen efter Metas egne regler", () => {
  it("em: «Trim any leading and trailing spaces. Convert all characters to lowercase.»", () => {
    expect(normaliserEmail("  John_Smith@GMAIL.com ")).toBe("john_smith@gmail.com");
    expect(normaliserEmail("ANNA@Firma.DK")).toBe("anna@firma.dk");
    // Er det ikke en e-mail, sendes feltet slet ikke — hellere intet end et aftryk af noget forkert.
    for (const v of [null, undefined, "", "   ", "anna", "anna@firma", "a@b@c.dk", "@firma.dk"]) expect(normaliserEmail(v), String(v)).toBeNull();
  });
  it("ph: «Remove symbols, letters, and any leading zeros. Phone numbers must include a country code»", () => {
    expect(normaliserTelefon("(650)555-1212")).toBe("6505551212"); // Metas eget eksempel, uden landekode i input
    expect(normaliserTelefon("+45 40 50 60 70")).toBe("4540506070");
    expect(normaliserTelefon("0045 40506070")).toBe("4540506070"); // de foranstillede nuller væk
    expect(normaliserTelefon("40506070")).toBe("4540506070"); // otte cifre = dansk, landekoden sættes på
    expect(normaliserTelefon("tlf. 40 50 60 70")).toBe("4540506070"); // bogstaver væk
    for (const v of [null, undefined, "", "1234567", "0", "12345678901234567"]) expect(normaliserTelefon(v), String(v)).toBeNull();
  });
  it("fn/ln: «Lowercase only with no punctuation» — tegnsætning fjernes, æøå bliver stående (UTF-8)", () => {
    expect(normaliserNavn("Anna Andersen")).toEqual({ fn: "anna", ln: "andersen" });
    expect(normaliserNavn("  Anne-Marie   Bøgh-Sørensen ")).toEqual({ fn: "annemarie", ln: "bøghsørensen" });
    expect(normaliserNavn("Jens Peter Åkjær Nielsen")).toEqual({ fn: "jens", ln: "peteråkjærnielsen" });
    expect(normaliserNavn("Mary")).toEqual({ fn: "mary", ln: null }); // ét ord: intet efternavn — og intet tomt ln
    expect(normaliserNavn("O'Brien Jr.")).toEqual({ fn: "obrien", ln: "jr" });
    for (const v of [null, undefined, "", "   "]) expect(normaliserNavn(v), String(v)).toEqual({ fn: null, ln: null });
    expect(normaliserNavn("!!! ???")).toEqual({ fn: null, ln: null }); // kun tegnsætning → intet at sende
  });
  it("country: «the lowercase, 2-letter country codes in ISO 3166-1 alpha-2» — dk, altid", () => {
    expect(META_LAND).toBe("dk");
    expect(normaliserBrugerdata(R()).country).toBe("dk");
  });
  it("hele rækken normaliseret — og en kladde uden mail/navn giver null, ikke tom streng", () => {
    expect(normaliserBrugerdata(R())).toEqual({ em: "anna@firma.dk", ph: "4540506070", fn: "anna", ln: "andersen", country: "dk" });
    expect(normaliserBrugerdata(R({ email: null, navn: null, telefon: null }))).toEqual({ em: null, ph: null, fn: null, ln: null, country: "dk" });
    expect(normaliserBrugerdata(R({ email: "", navn: "  ", telefon: "  " }))).toEqual({ em: null, ph: null, fn: null, ln: null, country: "dk" });
  });
});

describe("metaSend — hashningen: kun de felter, ansøgningen HAR (aldrig et tomt eller uhashet felt)", () => {
  it("alle fem nøgler, hver som en etliste med ét aftryk", async () => {
    const h = await hashBrugerdata(normaliserBrugerdata(R()), hash);
    expect(Object.keys(h).sort()).toEqual(["country", "em", "fn", "ln", "ph"]);
    for (const [n, v] of Object.entries(h)) {
      expect(Array.isArray(v), n).toBe(true);
      expect(v).toHaveLength(1);
      expect(v![0], n).toMatch(AFTRYK_FORM);
    }
    expect(h.em![0]).toBe(await hash("anna@firma.dk"));
    expect(h.em![0]).not.toBe(h.ph![0]);
  });
  it("«application_started» på skærm 1: hverken mail, navn eller telefon findes endnu — kun country sendes", async () => {
    const raa = normaliserBrugerdata(R({ email: null, navn: null, telefon: null }));
    expect(brugerdataNoegler(raa)).toEqual(["country"]);
    const h = await hashBrugerdata(raa, hash);
    expect(Object.keys(h)).toEqual(["country"]);
    // Det, reglen findes for: INTET tomt felt. Et aftryk af "" ville matche ingen, men være en værdi.
    expect("em" in h).toBe(false);
    expect("ph" in h).toBe(false);
    expect("fn" in h).toBe(false);
  });
  it("kun fornavn givet: fn sendes, ln udelades helt", async () => {
    const h = await hashBrugerdata(normaliserBrugerdata(R({ navn: "Mary" })), hash);
    expect("fn" in h).toBe(true);
    expect("ln" in h).toBe(false);
  });
  it("nøglerne er præcis Metas fem, i den rækkefølge vi bygger dem", () => {
    expect([...BRUGERDATA_NOEGLER]).toEqual(["em", "ph", "fn", "ln", "country"]);
  });
});

describe("metaSend — fbc og fbp: klik-id'et har forrang, cookien sendes ordret", () => {
  const set = new Date("2026-09-21T19:00:00.000Z");
  it("URL'ens fbclid vinder over cookien", () => {
    expect(bygFbcFelt("IwAR0abc", "fb.1.1790017100000.IwARcookie", set)).toBe("fb.1.1790017200000.IwAR0abc");
    expect(fbcKilde("IwAR0abc", "fb.1.1790017100000.IwARcookie")).toBe("klik_id");
  });
  it("uden fbclid sendes _fbc ORDRET — ingen ændring af klik-id'et («do not apply any modifications»)", () => {
    expect(bygFbcFelt(null, "fb.1.1790017100000.IwARCookieVaerdi", set)).toBe("fb.1.1790017100000.IwARCookieVaerdi");
    expect(bygFbcFelt("  ", "fb.2.17.abcDEF-_", set)).toBe("fb.2.17.abcDEF-_");
    expect(fbcKilde(null, "fb.1.1790017100000.IwARcookie")).toBe("cookie");
  });
  it("en cookie uden Metas form sendes ikke — og uden nogen af delene sendes fbc slet ikke", () => {
    for (const c of [null, undefined, "", "fb.1.abc.def", "1.1.1.1", "fbq.1.2.3", "fb.1.2"]) {
      expect(bygFbcFelt(null, c, set), String(c)).toBeNull();
      expect(fbcKilde(null, c), String(c)).toBe("ingen");
    }
  });
  it("fbp: «version.subdomainIndex.creationTime.randomnumber» — sidste led er et TAL", () => {
    expect(bygFbpFelt("fb.1.1790017100000.1234567890")).toBe("fb.1.1790017100000.1234567890");
    for (const v of [null, "", "fb.1.1790017100000.IwARx", "fb.1.abc.1", "x.1.2.3"]) expect(bygFbpFelt(v), String(v)).toBeNull();
  });
});

describe("metaSend — sprunget over med grund (fravalg, user agent eller landing)", () => {
  it("de seks grunde — «ingen_fbclid» findes ikke længere (22/9: alle ansøgere sendes)", () => {
    expect([...SPRUNGET_GRUNDE]).toEqual(["fravalgt", "ingen_user_agent", "ingen_landing", "ikke_indsendt", "ingen_tidspunkt", "for_gammel"]);
    expect(SPRUNGET_GRUNDE).not.toContain("ingen_fbclid" as never);
    expect(doem(R({ meta_fravalg: true }), "started", NU)).toEqual({ ok: false, grund: "fravalgt" });
    expect(doem(R({ user_agent: null }), "started", NU)).toEqual({ ok: false, grund: "ingen_user_agent" });
    expect(doem(R({ landing: "" }), "started", NU)).toEqual({ ok: false, grund: "ingen_landing" });
    expect(doem(R({ indsendt_at: null }), "submitted", NU)).toEqual({ ok: false, grund: "ikke_indsendt" });
    expect(doem(R({ indsendt_at: null }), "started", NU).ok).toBe(true); // en kladde: started sendes, submitted ikke
    expect(doem(R({ created_at: "ikke en dato" }), "started", NU)).toEqual({ ok: false, grund: "ingen_tidspunkt" });
  });
  it("WEBINARVEJEN: uden klik-id, uden cookier — ansøgningen sendes nu (før: sprunget over)", () => {
    const webinar = R({ fbclid: null, fbc_cookie: null, fbp: null, landing: "https://app.theboardroom.dk/ansoeg?kilde=webinar" });
    expect(doem(webinar, "submitted", NU)).toEqual({ ok: true, tid: new Date("2026-09-22T08:45:00.000Z") });
  });
  it("FRAVALGET dømmes FØRST: en fravalgt ansøger uden user agent tælles som «fravalgt», ikke som noget andet", () => {
    expect(doem(R({ meta_fravalg: true, user_agent: null, landing: null }), "started", NU)).toEqual({ ok: false, grund: "fravalgt" });
    // null og false er ikke et fravalg — kolonnen har default false, og en gammel række kan være null.
    expect(doem(R({ meta_fravalg: null }), "started", NU).ok).toBe(true);
    expect(doem(R({ meta_fravalg: false }), "started", NU).ok).toBe(true);
  });
});

describe("metaSend — payloaden: de tilladte felter, HASHET persondata, intet tomt felt", () => {
  it("det faktiske objekt: præcis disse nøgler og værdier", async () => {
    const hashet = await hashBrugerdata(normaliserBrugerdata(R()), hash);
    const p = bygPayload(R(), "submitted", new Date("2026-09-22T08:45:00.000Z"), AFTRYK, hashet);
    expect(p).toEqual({
      event_name: "Lead",
      event_time: 1790066700,
      event_id: `${ID}:submitted`,
      action_source: "website",
      event_source_url: "https://app.theboardroom.dk/ansoeg?utm_source=fb&fbclid=IwAR0abcDEF_123-xyz&kilde=direkte",
      user_data: {
        em: [await hash("anna@firma.dk")], ph: [await hash("4540506070")], fn: [await hash("anna")],
        ln: [await hash("andersen")], country: [await hash("dk")],
        external_id: [AFTRYK],
        client_user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        fbc: "fb.1.1790017200000.IwAR0abcDEF_123-xyz",
        fbp: "fb.1.1790017100000.1234567890",
      },
      custom_data: { content_name: "application_submitted" },
    });
    expect(Object.keys(p.user_data).sort()).toEqual(["client_user_agent", "country", "em", "external_id", "fbc", "fbp", "fn", "ln", "ph"]);
    expect(Object.keys(p).sort()).toEqual(["action_source", "custom_data", "event_id", "event_name", "event_source_url", "event_time", "user_data"]);
  });
  it("INTET FELT UDEN VÆRDI: uden cookier og uden mail/navn står nøglerne der slet ikke", async () => {
    const r = R({ email: null, navn: null, telefon: null, fbclid: null, fbc_cookie: null, fbp: null });
    const p = bygPayload(r, "started", new Date("2026-09-21T19:00:00.000Z"), AFTRYK, await hashBrugerdata(normaliserBrugerdata(r), hash));
    expect(Object.keys(p.user_data).sort()).toEqual(["client_user_agent", "country", "external_id"]);
    expect("fbc" in p.user_data).toBe(false);
    expect("fbp" in p.user_data).toBe(false);
    expect("em" in p.user_data).toBe(false);
    // Meta kræver mindst ét user_data-felt — external_id og country er der altid.
    expect(p.user_data.external_id).toEqual([AFTRYK]);
    expect(findForbudteNoegler(p)).toEqual([]);
  });
  it("ingen af ansøgerens egne værdier i JSON'en — hverken mail, telefon, navn, CVR eller svar", async () => {
    const p = bygPayload(R(), "submitted", NU, AFTRYK, await hashBrugerdata(normaliserBrugerdata(R()), hash));
    expect(findForbudteNoegler(p)).toEqual([]);
    const json = JSON.stringify(p);
    for (const v of Object.values(PERSON)) expect(json.includes(v), v).toBe(false);
    expect(json).not.toMatch(/@/);
    expect(json).not.toContain("Anna");
    expect(json).not.toContain("40506070");
    for (const n of ["client_ip_address", "email", "navn", "telefon", "cvr", "svar", "ga_client_id", "ga_session_id"]) expect(FORBUDTE_NOEGLER).toContain(n);
    // em/ph/fn/ln/country er IKKE længere forbudte nøgler — de er hashede nøgler.
    for (const n of ["em", "ph", "fn", "ln", "country"]) expect(FORBUDTE_NOEGLER).not.toContain(n as never);
    expect([...HASHEDE_NOEGLER]).toEqual(["em", "ph", "fn", "ln", "country", "external_id"]);
  });
  it("fbc's tidspunkt er created_at (første gang vi så fbclid'et), også for submitted; user agent afkortes til 512", async () => {
    const r = R({ user_agent: "x".repeat(700) });
    const s = bygPayload(r, "started", new Date("2026-09-21T19:00:00.000Z"), AFTRYK, await hashBrugerdata(normaliserBrugerdata(r), hash));
    expect(s.user_data.fbc).toBe("fb.1.1790017200000.IwAR0abcDEF_123-xyz");
    expect(s.user_data.client_user_agent).toHaveLength(512);
    expect(s.event_time).toBe(1790017200);
  });
  it("VÆRNET VIRKER: en uhashet værdi, en rå e-mail, et rået nummer eller en forbudt nøgle fanges med sin sti", async () => {
    const p = bygPayload(R(), "submitted", NU, AFTRYK, await hashBrugerdata(normaliserBrugerdata(R()), hash));
    // 1. den hashede nøgle med en RÅ værdi — præcis den fejl, reglen findes for
    expect(findForbudteNoegler({ ...p, user_data: { ...p.user_data, em: ["anna@firma.dk"] } }))
      .toEqual(["user_data.em: ikke et 64-tegns aftryk", "user_data.em[0]: rå e-mail"]);
    expect(findForbudteNoegler({ ...p, user_data: { ...p.user_data, ph: ["40506070"] } }))
      .toEqual(["user_data.ph: ikke et 64-tegns aftryk", "user_data.ph[0]: rå telefon/CVR"]);
    // 2. et TOMT felt — et aftryk af den tomme streng ville ikke fanges af hex-reglen, men en tom streng gør
    expect(findForbudteNoegler({ ...p, user_data: { ...p.user_data, fn: [""] } })).toEqual(["user_data.fn: ikke et 64-tegns aftryk"]);
    expect(findForbudteNoegler({ ...p, user_data: { ...p.user_data, ln: [] } })).toEqual(["user_data.ln: ikke et 64-tegns aftryk"]);
    expect(findForbudteNoegler({ ...p, user_data: { ...p.user_data, country: "dk" } })).toEqual(["user_data.country: ikke et 64-tegns aftryk"]);
    // 3. forbudte nøgler, hvor som helst
    expect(findForbudteNoegler({ ...p, user_data: { ...p.user_data, client_ip_address: "1.2.3.4" } })).toEqual(["user_data.client_ip_address: forbudt nøgle"]);
    expect(findForbudteNoegler({ ...p, custom_data: { ...p.custom_data, navn: "Anna" } })).toEqual(["custom_data.navn: forbudt nøgle"]);
    expect(findForbudteNoegler({ ...p, custom_data: { ...p.custom_data, ga_client_id: "1.2" } })).toEqual(["custom_data.ga_client_id: forbudt nøgle"]);
    // 4. en rå værdi gemt i et hvilket som helst felt — også midt i landing-URL'en
    expect(findForbudteNoegler({ ...p, event_source_url: "https://app.theboardroom.dk/ansoeg?mail=anna@firma.dk" }))
      .toEqual(["event_source_url: rå e-mail"]);
    expect(findForbudteNoegler({ ...p, custom_data: { content_name: "lead +45 40 50 60 70" } }))
      .toEqual(["custom_data.content_name: rå telefon/CVR"]);
    expect(findForbudteNoegler({ data: [{ user_data: { em: ["x"] } }] })).toEqual(["data[0].user_data.em: ikke et 64-tegns aftryk"]);
  });
  it("VÆRNET SLÅR IKKE FALSK ALARM: fbc, fbp, user agent, uuid og aftryk er ikke rå værdier", () => {
    expect(erRaaTal("fb.1.1790017200000.IwAR0abc")).toBe(false);
    expect(erRaaTal("fb.1.1790017100000.1234567890")).toBe(false);
    expect(erRaaTal(AFTRYK)).toBe(false);
    expect(erRaaTal("1790066700")).toBe(true); // et bart tal ER et rået tal — derfor er event_time et NUMBER
    expect(erRaaTal("1234567")).toBe(false); // syv cifre er hverken telefon eller CVR
    expect(erKunAftryk([AFTRYK])).toBe(true);
    expect(erKunAftryk(AFTRYK)).toBe(true);
    expect(erKunAftryk(["A".repeat(64)])).toBe(false); // store bogstaver er ikke husets aftryk
    expect(erKunAftryk([])).toBe(false);
  });
});

describe("metaSend — udvidelsen sender IKKE det, der allerede er sendt (pkt. 7)", () => {
  it("en hændelse i sporet som «sendt» prøves ikke igen — heller ikke for at få de nye felter med", () => {
    // Det, der ER sendt 21/9 med kun fbc + external_id, bliver stående sådan. Meta deduplikerer
    // ganske vist på event_id, men sporet er VORES sandhed, og maaForsoeges spørger kun det.
    expect(maaForsoeges({ event_id: `${ID}:submitted`, udfald: "sendt", forsoeg: 1 })).toEqual({ ok: false, grund: "allerede_sendt" });
    // Og «ugyldig» prøves heller ikke igen — den retter sig ikke af nye felter.
    expect(maaForsoeges({ event_id: `${ID}:started`, udfald: "ugyldig", forsoeg: 1 })).toEqual({ ok: false, grund: "ugyldig" });
    // Det, der ALDRIG er sendt, får de nye felter med ved første forsøg.
    expect(maaForsoeges(null)).toEqual({ ok: true });
    expect(maaForsoeges({ event_id: `${ID}:started`, udfald: "ingen_noegle", forsoeg: 9 })).toEqual({ ok: true });
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
    // 100/33 er IKKE en payloadfejl: Metas error-reference kalder den en manglende rettighed
    // («your access token is not added as a system user with appropriate permissions»).
    // Den skal prøves igen, når adgangen er givet — «ugyldig» ville tabe hændelsen for altid.
    const k100_33 = '{"error":{"message":"Unsupported post request. Object with ID \'858180112996496\' does not exist, cannot be loaded due to missing permissions, or does not support this operation. Please read the Graph API documentation at https://developers.facebook.com/docs/graph-api","type":"GraphMethodException","code":100,"error_subcode":33,"fbtrace_id":"A1b2C3d4E5f"}}';
    const dom100_33 = doemMetaSvar(400, k100_33);
    expect(dom100_33.udfald).toBe("ingen_noegle");
    expect(dom100_33.kode).toBe(100);
    expect(dom100_33.fejl).toContain("(kode 100/33)");
    expect(dom100_33.fejl).toContain("missing permissions");
    // Og den prøves igen — modsat «ugyldig».
    expect(maaForsoeges({ event_id: "x", udfald: dom100_33.udfald, forsoeg: 2 })).toEqual({ ok: true });
    // Parret er præcist: kode 100 med en ANDEN subkode er stadig en payloadfejl, og
    // subkode 33 under en anden kode er ikke automatisk en nøglefejl.
    expect(doemMetaSvar(400, '{"error":{"message":"x","code":100,"error_subcode":1234}}').udfald).toBe("ugyldig");
    expect(doemMetaSvar(400, '{"error":{"message":"x","code":100}}').udfald).toBe("ugyldig");
    expect(erNoegleSubkode(100, 33)).toBe(true);
    expect(erNoegleSubkode(100, 34)).toBe(false);
    expect(erNoegleSubkode(101, 33)).toBe(false);
    expect(erNoegleSubkode(null, 33)).toBe(false);
    expect(erNoegleSubkode(100, null)).toBe(false);
    expect(NOEGLE_SUBKODER.map(([k, sub]) => `${k}/${sub}`)).toEqual(["100/33"]);
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

describe("metaSend — user agent gemmes for ALLE (ansoegning-gem, vendt 22/9)", () => {
  const spor = { utm_source: "fb", utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null, fbclid: "IwAR0abc", landing: "https://app.theboardroom.dk/ansoeg", referrer: null };
  it("med OG uden fbclid: user_agent med i samme update — det var netop webinar-ansøgeren, der faldt ud før", () => {
    expect(sporMedUserAgent(spor, "Mozilla/5.0")).toEqual({ ...spor, user_agent: "Mozilla/5.0" });
    const udenKlik = { ...spor, fbclid: null, utm_source: null };
    expect(sporMedUserAgent(udenKlik, "Mozilla/5.0")).toEqual({ ...udenKlik, user_agent: "Mozilla/5.0" });
    expect("user_agent" in sporMedUserAgent(udenKlik, "Mozilla/5.0")).toBe(true);
  });
  it("ingen user agent: feltet kommer slet ikke med — en null må ikke skrive hen over det, vi har", () => {
    expect(sporMedUserAgent(spor, null)).toEqual({ ...spor });
    expect("user_agent" in sporMedUserAgent(spor, null)).toBe(false);
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
