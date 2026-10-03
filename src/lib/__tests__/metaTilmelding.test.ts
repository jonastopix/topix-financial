import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../../supabase/functions/_shared/aftryk.ts";
import { AFTRYK_FORM, findForbudteNoegler, META_VINDUE_DAGE } from "../../../supabase/functions/_shared/metaSend.ts";
import {
  bygTilmeldingPayload, doemTilmelding, hashTilmeldingBrugerdata, laesWebinarLaas, normaliserTilmeldingBrugerdata,
  TILMELDING_ART, TILMELDING_CONTENT_NAME, TILMELDING_EVENT_NAME, TILMELDING_GRUNDE, tilmeldingBrugerdataNoegler,
  tilmeldingEventId, tilmeldingFbc, tilmeldingFbcKilde, tilmeldingSenderRigtigt, type TilmeldingTilMeta,
  tomtTilmeldingResultat, WEBINAR_META_LAAS_NOEGLE,
} from "../../../supabase/functions/_shared/metaTilmelding.ts";

/**
 * Webinarmotorens tilmeldinger til Metas Conversions API (udkast 3/10-2026) — de rene regler.
 * Prøveværdierne er adskilte fra ansøgningsprøvernes (lærdom 21/9: et CVR var en delstreng af
 * et annonce-id).
 */
const ID = "7a1b2c3d-2222-4222-8222-222222222222";
const NU = new Date("2026-11-03T09:00:00Z");
const PERSON = { fornavn: "Bente Marie", email: "  Bente@Eksempel.DK " };
const T = (o: Partial<TilmeldingTilMeta> = {}): TilmeldingTilMeta => ({
  id: ID, kilde_system: "platform", intern: null, via: null, registreret_at: "2026-11-01T18:30:00.000Z",
  email: PERSON.email, fornavn: PERSON.fornavn, fbclid: "IwAR9tilmeldXYZ_1-2", fbp: "fb.1.1790000000000.123456789",
  fbc_cookie: null, origin: "https://topix.dk/webinar?utm_source=fb", user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)",
  afmeldt: false, fravalgt: false, ...o,
});

describe("metaTilmelding — dommen", () => {
  it("en rigtig, ny motor-tilmelding i vinduet sendes med registreret_at som tid", () => {
    const d = doemTilmelding(T(), NU);
    expect(d).toEqual({ ok: true, tid: new Date("2026-11-01T18:30:00.000Z") });
  });
  it("eWebinar, intern, afmeldt og fravalgt dømmes FØR alt andet", () => {
    // Uden user agent OG uden landing — de fire skal stadig vinde.
    const tom = { user_agent: null, origin: null };
    expect(doemTilmelding(T({ ...tom, kilde_system: "ewebinar" }), NU)).toEqual({ ok: false, grund: "ikke_platform" });
    expect(doemTilmelding(T({ ...tom, intern: "true" }), NU)).toEqual({ ok: false, grund: "intern" });
    expect(doemTilmelding(T({ ...tom, intern: true }), NU)).toEqual({ ok: false, grund: "intern" });
    expect(doemTilmelding(T({ ...tom, afmeldt: true }), NU)).toEqual({ ok: false, grund: "afmeldt" });
    expect(doemTilmelding(T({ ...tom, fravalgt: true }), NU)).toEqual({ ok: false, grund: "fravalgt" });
    // Rækkefølgen: intern før afmeldt
    expect(doemTilmelding(T({ intern: "true", afmeldt: true }), NU)).toEqual({ ok: false, grund: "intern" });
  });
  it("en gen-tilmelding fra rummet sendes aldrig (origin er den første formulars side)", () => {
    expect(doemTilmelding(T({ via: "gen_tilmeld" }), NU)).toEqual({ ok: false, grund: "gen_tilmelding" });
  });
  it("uden user agent eller landing er det ingen website-hændelse — sprunget over, aldrig system_generated", () => {
    expect(doemTilmelding(T({ user_agent: "  " }), NU)).toEqual({ ok: false, grund: "ingen_user_agent" });
    expect(doemTilmelding(T({ origin: "" }), NU)).toEqual({ ok: false, grund: "ingen_landing" });
  });
  it("Metas 7-dagesvindue: ældre end 7 dage eller i fremtiden er for_gammel; ingen tid er ingen_tidspunkt", () => {
    const grænse = new Date(NU.getTime() - META_VINDUE_DAGE * 86_400_000).toISOString();
    expect(doemTilmelding(T({ registreret_at: grænse }), NU).ok).toBe(true);
    expect(doemTilmelding(T({ registreret_at: new Date(Date.parse(grænse) - 1).toISOString() }), NU)).toEqual({ ok: false, grund: "for_gammel" });
    expect(doemTilmelding(T({ registreret_at: "2026-11-04T00:00:00Z" }), NU)).toEqual({ ok: false, grund: "for_gammel" });
    expect(doemTilmelding(T({ registreret_at: null }), NU)).toEqual({ ok: false, grund: "ingen_tidspunkt" });
  });
  it("hver grund har en tæller i svaret", () => {
    const r = tomtTilmeldingResultat(null);
    for (const g of TILMELDING_GRUNDE) expect(r.sprunget[g]).toBe(0);
    expect(r.sprunget.allerede_sendt).toBe(0);
    expect(r.port).toBe("laesefejl");
    expect(r.sender_rigtigt).toBe(false);
  });
});

describe("metaTilmelding — payloaden", () => {
  it("event_id er «<tilmelding_id>:registration» — pixlens eventID skal være præcis samme streng (B3)", () => {
    expect(TILMELDING_ART).toBe("registration");
    expect(tilmeldingEventId(ID)).toBe(`${ID}:registration`);
  });
  it("em og fn (første ord) normaliseret — aldrig ln, ph eller country", () => {
    const raa = normaliserTilmeldingBrugerdata(T());
    expect(raa).toEqual({ em: "bente@eksempel.dk", fn: "bente" });
    expect(tilmeldingBrugerdataNoegler(raa)).toEqual(["em", "fn"]);
    expect(tilmeldingBrugerdataNoegler(normaliserTilmeldingBrugerdata(T({ email: "ikke-en-mail", fornavn: "" })))).toEqual([]);
  });
  it("den FAKTISKE payload: website-form, kun aftryk, ingen klartekst — værnet finder intet", async () => {
    const r = T();
    const tid = new Date(r.registreret_at as string);
    const hashet = await hashTilmeldingBrugerdata(normaliserTilmeldingBrugerdata(r), sha256Hex);
    const p = bygTilmeldingPayload(r, tid, await sha256Hex(r.id), hashet);
    expect(p.event_name).toBe(TILMELDING_EVENT_NAME);
    expect(p.event_name).toBe("CompleteRegistration");
    expect(p.action_source).toBe("website");
    expect(p.event_source_url).toBe("https://topix.dk/webinar?utm_source=fb");
    expect(p.event_time).toBe(Math.floor(tid.getTime() / 1000));
    expect(p.event_id).toBe(`${ID}:registration`);
    expect(p.custom_data).toEqual({ content_name: TILMELDING_CONTENT_NAME });
    expect(Object.keys(p.user_data).sort()).toEqual(["client_user_agent", "em", "external_id", "fbc", "fbp", "fn"]);
    expect(p.user_data.em?.[0]).toMatch(AFTRYK_FORM);
    expect(p.user_data.fn?.[0]).toMatch(AFTRYK_FORM);
    expect(p.user_data.external_id[0]).toMatch(AFTRYK_FORM);
    expect(findForbudteNoegler(p)).toEqual([]);
    const tekst = JSON.stringify(p);
    expect(tekst).not.toContain("bente");
    expect(tekst).not.toContain("Bente");
    expect(tekst).not.toContain("eksempel.dk");
    expect(tekst).not.toMatch(/client_ip_address|"ln"|"ph"|"country"/);
  });
  it("fbc i to led: URL'ens fbclid med registreret_at → _fbc-cookien ordret → intet", () => {
    const tid = new Date("2026-11-01T18:30:00.000Z");
    expect(tilmeldingFbc(T(), tid)).toBe(`fb.1.${tid.getTime()}.IwAR9tilmeldXYZ_1-2`);
    expect(tilmeldingFbcKilde(T())).toBe("klik_id");
    const cookie = "fb.1.1789000000000.AbC_xyz";
    expect(tilmeldingFbc(T({ fbclid: null, fbc_cookie: cookie }), tid)).toBe(cookie);
    expect(tilmeldingFbcKilde(T({ fbclid: null, fbc_cookie: cookie }))).toBe("cookie");
    expect(tilmeldingFbc(T({ fbclid: null, fbc_cookie: "noget andet" }), tid)).toBeNull();
    expect(tilmeldingFbcKilde(T({ fbclid: null, fbc_cookie: null }))).toBe("ingen");
  });
  it("uden fbc/fbp kommer nøglerne slet ikke med (et null er en værdi, ikke et fravær)", async () => {
    const r = T({ fbclid: null, fbp: null, fbc_cookie: null });
    const p = bygTilmeldingPayload(r, new Date(r.registreret_at as string), await sha256Hex(r.id), {});
    expect("fbc" in p.user_data).toBe(false);
    expect("fbp" in p.user_data).toBe(false);
  });
  it("en rå e-mail i landing fanges af værnet", async () => {
    const r = T({ origin: "https://topix.dk/webinar?email=bente@eksempel.dk" });
    const p = bygTilmeldingPayload(r, new Date(r.registreret_at as string), await sha256Hex(r.id), {});
    expect(findForbudteNoegler(p).join(" ")).toContain("rå e-mail");
  });
});

describe("metaTilmelding — låsen og porten", () => {
  const S = { dryRun: false, port: "klar" as const, metaLaasAktiv: true, webinarLaasAktiv: true, testEventCode: null, tilmeldingId: null };
  it("begge låse åbne + porten klar + dry_run false → sender", () => expect(tilmeldingSenderRigtigt(S)).toBe(true));
  it("tørkørsel sender aldrig", () => expect(tilmeldingSenderRigtigt({ ...S, dryRun: true })).toBe(false));
  it("tilmeldingernes egen lås lukket → intet, selv med meta_send_aktiv åben", () =>
    expect(tilmeldingSenderRigtigt({ ...S, webinarLaasAktiv: false })).toBe(false));
  it("hovedafbryderen meta_send_aktiv lukket → intet, selv med den nye lås åben", () =>
    expect(tilmeldingSenderRigtigt({ ...S, metaLaasAktiv: false })).toBe(false));
  it("testkode ALENE sender ingen tilmeldinger — kun testkode + præcis én tilmelding", () => {
    const luk = { ...S, metaLaasAktiv: false, webinarLaasAktiv: false };
    expect(tilmeldingSenderRigtigt({ ...luk, testEventCode: "TEST123" })).toBe(false);
    expect(tilmeldingSenderRigtigt({ ...luk, testEventCode: "TEST123", tilmeldingId: ID })).toBe(true);
    expect(tilmeldingSenderRigtigt({ ...luk, tilmeldingId: ID })).toBe(false);
  });
  it("porten: uden låsens række (migrationen ikke kørt) eller ved læsefejl sendes intet — heller ikke med testkode", () => {
    for (const port of ["migration_mangler", "laesefejl"] as const) {
      expect(tilmeldingSenderRigtigt({ ...S, port })).toBe(false);
      expect(tilmeldingSenderRigtigt({ ...S, port, testEventCode: "TEST123", tilmeldingId: ID })).toBe(false);
    }
  });
  it("laesWebinarLaas: fejl → laesefejl/lukket; ingen række → migration_mangler/lukket; række → klar + værdien", () => {
    expect(WEBINAR_META_LAAS_NOEGLE).toBe("webinarmotor_meta_aktiv");
    expect(laesWebinarLaas({ fejl: true, raekke: { config_value: true } })).toEqual({ port: "laesefejl", aaben: false });
    expect(laesWebinarLaas({ fejl: false, raekke: null })).toEqual({ port: "migration_mangler", aaben: false });
    expect(laesWebinarLaas({ fejl: false, raekke: { config_value: false } })).toEqual({ port: "klar", aaben: false });
    expect(laesWebinarLaas({ fejl: false, raekke: { config_value: true } })).toEqual({ port: "klar", aaben: true });
    expect(laesWebinarLaas({ fejl: false, raekke: { config_value: "true" } })).toEqual({ port: "klar", aaben: true });
    expect(laesWebinarLaas({ fejl: false, raekke: { config_value: "ja" } })).toEqual({ port: "klar", aaben: false });
    expect(laesWebinarLaas({ fejl: false, raekke: { config_value: null } })).toEqual({ port: "klar", aaben: false });
  });
});
