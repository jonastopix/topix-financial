import { describe, expect, it } from "vitest";
import {
  afviger,
  erKlaviyoDato,
  KLAVIYO_DATO_FORM,
  klaviyoDato,
  naesteSessionPrMail,
  PROFIL_FELT_DATO,
  PROFIL_FELT_TEKST,
  PROFIL_FELTER,
  profilVaerdier,
  webinarTekst,
} from "../../../supabase/functions/_shared/klaviyoDato.ts";
import { bygProfilKrop, PROFIL_ALARM_AARSAG, PROFIL_STI, profilAlarmNoegle, profilAlarmTekst, skrivProfil, taelUdfald, type ProfilSkriver } from "../../../supabase/functions/_shared/klaviyoProfil.ts";

/**
 * Webinarets tidspunkt på Klaviyo-profilen (udkast 21/9-2026) — de rene funktioner:
 *   1. klaviyoDato: «YYYY-MM-DD HH:MM:SS» i dansk tid — sommertid, vintertid (25/10-2026), midnat; aldrig T/Z
 *   2. webinarTekst: «tirsdag 13. oktober kl. 11.00» — kl. 9.00 (ikke 09.00), alle ugedage, alle måneder
 *   3. naesteSessionPrMail: tidligste kommende session pr. mail; replay/null og fortid tæller ikke
 *   4. afviger: kun ændringer skrives
 *   5. kroppen til /profile-import/: sæt begge felter, eller unset begge — og fail-closed på formen
 */

describe("1. klaviyoDato — Klaviyos datoform i dansk tid", () => {
  it("22/9 kl. 9 dansk (07:00Z, sommertid) og 13/10 kl. 11 dansk (09:00Z)", () => {
    expect(klaviyoDato(new Date("2026-09-22T07:00:00Z"))).toBe("2026-09-22 09:00:00");
    expect(klaviyoDato(new Date("2026-10-13T09:00:00Z"))).toBe("2026-10-13 11:00:00");
  });
  it("vintertid: 25/10-2026 skifter kl. 03:00 → 02:00 — før og efter, og 26/10 er UTC+1", () => {
    expect(klaviyoDato(new Date("2026-10-25T00:30:00Z"))).toBe("2026-10-25 02:30:00"); // CEST, UTC+2
    expect(klaviyoDato(new Date("2026-10-25T01:30:00Z"))).toBe("2026-10-25 02:30:00"); // CET, UTC+1 — samme vægur-tid
    expect(klaviyoDato(new Date("2026-10-25T07:00:00Z"))).toBe("2026-10-25 08:00:00");
    expect(klaviyoDato(new Date("2026-10-26T10:00:00Z"))).toBe("2026-10-26 11:00:00");
    expect(klaviyoDato(new Date("2026-03-29T01:30:00Z"))).toBe("2026-03-29 03:30:00"); // sommertid begynder 02:00 → 03:00
  });
  it("midnat dansk tid — «00:00:00», ikke «24:00:00»; sekunder bevares", () => {
    expect(klaviyoDato(new Date("2026-10-24T22:00:00Z"))).toBe("2026-10-25 00:00:00");
    expect(klaviyoDato(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01 00:00:00");
    expect(klaviyoDato(new Date("2026-09-22T07:15:42Z"))).toBe("2026-09-22 09:15:42");
  });
  it("aldrig T, aldrig Z — formen er præcis 19 tegn, og erKlaviyoDato dømmer den", () => {
    for (const iso of ["2026-09-22T07:00:00Z", "2026-10-25T01:30:00Z", "2026-01-01T00:00:00Z", "2026-07-15T21:59:59Z"]) {
      const s = klaviyoDato(new Date(iso));
      expect(s).toMatch(KLAVIYO_DATO_FORM);
      expect(s).not.toMatch(/[TZ]/);
      expect(s).toHaveLength(19);
      expect(erKlaviyoDato(s)).toBe(true);
    }
    expect(erKlaviyoDato("2026-09-22T07:00:00Z")).toBe(false);
    expect(erKlaviyoDato("2026-09-22T09:00:00")).toBe(false);
    expect(erKlaviyoDato("09/22/2026")).toBe(false);
    expect(erKlaviyoDato("2026-09-22")).toBe(false);
    expect(erKlaviyoDato(null)).toBe(false);
    expect(() => klaviyoDato(new Date("ugyldig"))).toThrow();
  });
});

describe("2. webinarTekst — «tirsdag 13. oktober kl. 11.00»", () => {
  it("de to sessioner: kl. 9.00 uden foranstillet nul, kl. 11.00", () => {
    expect(webinarTekst(new Date("2026-09-22T07:00:00Z"))).toBe("tirsdag 22. september kl. 9.00");
    expect(webinarTekst(new Date("2026-10-13T09:00:00Z"))).toBe("tirsdag 13. oktober kl. 11.00");
  });
  it("midnat er kl. 0.00; minutter altid to cifre; vintertid", () => {
    expect(webinarTekst(new Date("2026-10-24T22:00:00Z"))).toBe("søndag 25. oktober kl. 0.00");
    expect(webinarTekst(new Date("2026-11-03T13:05:00Z"))).toBe("tirsdag 3. november kl. 14.05");
    expect(webinarTekst(new Date("2026-10-25T01:30:00Z"))).toBe("søndag 25. oktober kl. 2.30");
  });
  it("alle syv ugedage (21.–27. september 2026) på dansk med små bogstaver", () => {
    const ugedage = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];
    for (let i = 0; i < 7; i++) {
      expect(webinarTekst(new Date(`2026-09-${21 + i}T08:00:00Z`))).toBe(`${ugedage[i]} ${21 + i}. september kl. 10.00`);
    }
  });
  it("alle tolv måneder på dansk", () => {
    const maaneder = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
    for (let m = 0; m < 12; m++) {
      const d = new Date(Date.UTC(2026, m, 15, 12, 0, 0));
      expect(webinarTekst(d)).toMatch(new RegExp(`^[a-zæøå]+ 15\\. ${maaneder[m]} kl\\. 1[34]\\.00$`));
    }
  });
  it("profilVaerdier giver begge felter af SAMME øjeblik — og null for «ingen kommende session»", () => {
    expect(profilVaerdier(new Date("2026-10-13T09:00:00Z"))).toEqual({ tb_naeste_webinar: "2026-10-13 11:00:00", tb_naeste_webinar_tekst: "tirsdag 13. oktober kl. 11.00" });
    expect(profilVaerdier(null)).toBeNull();
    expect(PROFIL_FELTER).toEqual([PROFIL_FELT_DATO, PROFIL_FELT_TEKST]);
    expect(PROFIL_FELT_DATO).toBe("tb_naeste_webinar");
  });
});

describe("3. naesteSessionPrMail — tidligste KOMMENDE session pr. mail", () => {
  const NU = new Date("2026-09-21T12:00:00Z");
  it("to sessioner: den tidligste kommende vinder; fortid og replay (null) tæller ikke; mailen normaliseres", () => {
    const m = naesteSessionPrMail([
      { email: "A@b.dk ", session_tid: "2026-10-13T09:00:00Z" },
      { email: "a@b.dk", session_tid: "2026-09-22T07:00:00Z" },
      { email: "a@b.dk", session_tid: "2026-08-25T07:00:00Z" }, // passeret
      { email: "a@b.dk", session_tid: null }, // replay
      { email: "c@d.dk", session_tid: "2026-08-25T07:00:00Z" }, // kun fortid → ikke i kortet
      { email: "e@f.dk", session_tid: null }, // kun replay → ikke i kortet
      { email: "g@h.dk", session_tid: "ikke en dato" },
    ], NU);
    expect([...m.keys()]).toEqual(["a@b.dk"]);
    expect(m.get("a@b.dk")!.toISOString()).toBe("2026-09-22T07:00:00.000Z");
  });
  it("præcis nu er ikke kommende; ét sekund efter er", () => {
    expect(naesteSessionPrMail([{ email: "a@b.dk", session_tid: NU.toISOString() }], NU).size).toBe(0);
    expect(naesteSessionPrMail([{ email: "a@b.dk", session_tid: "2026-09-21T12:00:01Z" }], NU).size).toBe(1);
  });
  it("efter 22/9: den, der også er tilmeldt 13/10, flyttes til 13/10; den, der kun var tilmeldt 22/9, falder ud", () => {
    const rk = [
      { email: "begge@x.dk", session_tid: "2026-09-22T07:00:00Z" },
      { email: "begge@x.dk", session_tid: "2026-10-13T09:00:00Z" },
      { email: "kun22@x.dk", session_tid: "2026-09-22T07:00:00Z" },
    ];
    const efter = naesteSessionPrMail(rk, new Date("2026-09-22T10:00:00Z"));
    expect([...efter.keys()]).toEqual(["begge@x.dk"]);
    expect(profilVaerdier(efter.get("begge@x.dk")!)!.tb_naeste_webinar).toBe("2026-10-13 11:00:00");
  });
});

describe("4. afviger — kun ændringer skrives", () => {
  const V = { tb_naeste_webinar: "2026-10-13 11:00:00", tb_naeste_webinar_tekst: "tirsdag 13. oktober kl. 11.00" };
  it("aldrig skrevet + ønsket værdi → skriv; samme værdi → ikke; anden værdi → skriv", () => {
    expect(afviger(V, null)).toBe(true);
    expect(afviger(V, { ...V })).toBe(false);
    expect(afviger(V, { ...V, tb_naeste_webinar: "2026-09-22 09:00:00" })).toBe(true);
    expect(afviger(V, { ...V, tb_naeste_webinar_tekst: "anden tekst" })).toBe(true);
  });
  it("ingen kommende session: fjern kun, hvis der står noget; aldrig skrevet eller allerede fjernet → intet", () => {
    expect(afviger(null, null)).toBe(false);
    expect(afviger(null, { tb_naeste_webinar: null, tb_naeste_webinar_tekst: null })).toBe(false);
    expect(afviger(null, V)).toBe(true);
    expect(afviger(null, { tb_naeste_webinar: null, tb_naeste_webinar_tekst: "rest" })).toBe(true);
  });
});

describe("5. kroppen til POST /profile-import/ og skrivProfil", () => {
  const V = { tb_naeste_webinar: "2026-10-13 11:00:00", tb_naeste_webinar_tekst: "tirsdag 13. oktober kl. 11.00" };
  it("sæt: data.type profile, email små bogstaver, BEGGE felter i properties; fjern: meta.patch_properties.unset med BEGGE", () => {
    expect(bygProfilKrop(" Lisbeth@X.dk", V)).toEqual({ data: { type: "profile", attributes: { email: "lisbeth@x.dk", properties: { tb_naeste_webinar: V.tb_naeste_webinar, tb_naeste_webinar_tekst: V.tb_naeste_webinar_tekst } } } });
    expect(bygProfilKrop("a@b.dk", null)).toEqual({ data: { type: "profile", attributes: { email: "a@b.dk" }, meta: { patch_properties: { unset: ["tb_naeste_webinar", "tb_naeste_webinar_tekst"] } } } });
    expect(PROFIL_STI).toBe("/profile-import/");
  });

  function fake() {
    const raekker: Record<string, unknown>[] = [];
    const skriver: ProfilSkriver = { from: () => ({ upsert: async (r: unknown) => { raekker.push(r as Record<string, unknown>); return { error: null }; } }) };
    return { skriver, raekker };
  }
  const svar = (status: number, body = "") => async () => new Response(body, { status });

  it("201 og 200 er ok: kroppen sendes til /profile-import/ med revisionen, og tilstanden bærer værdierne + skrevet_at", async () => {
    for (const status of [201, 200]) {
      const { skriver, raekker } = fake();
      const kaldt: { url: string; init: RequestInit }[] = [];
      const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => { kaldt.push({ url: String(url), init: init! }); return svar(status)(); }) as unknown as typeof fetch;
      const r = await skrivProfil(skriver, "pk_test", "a@b.dk", V, { fetchImpl, nuDato: new Date("2026-09-21T12:00:00Z") });
      expect(r.sendt).toBe(true);
      expect(r.spor.status).toBe(status);
      expect(kaldt[0].url).toBe("https://a.klaviyo.com/api/profile-import/");
      expect((kaldt[0].init.headers as Record<string, string>).revision).toBe("2026-07-15");
      expect(JSON.parse(String(kaldt[0].init.body))).toEqual(bygProfilKrop("a@b.dk", V));
      expect(raekker).toHaveLength(1);
      expect(raekker[0]).toMatchObject({ email: "a@b.dk", udfald: "ok", status, tb_naeste_webinar: V.tb_naeste_webinar, tb_naeste_webinar_tekst: V.tb_naeste_webinar_tekst, skrevet_at: "2026-09-21T12:00:00.000Z", forsoegt_at: "2026-09-21T12:00:00.000Z" });
    }
  });
  it("fjernelse: unset-kroppen sendes, og tilstanden sætter begge værdier til null", async () => {
    const { skriver, raekker } = fake();
    const r = await skrivProfil(skriver, "pk_test", "a@b.dk", null, { fetchImpl: svar(200) as unknown as typeof fetch, nuDato: new Date("2026-09-21T12:00:00Z") });
    expect(r.sendt).toBe(true);
    expect(r.krop).toEqual(bygProfilKrop("a@b.dk", null));
    expect(raekker[0]).toMatchObject({ udfald: "ok", tb_naeste_webinar: null, tb_naeste_webinar_tekst: null });
  });
  it("fejl (429, 500, ingen nøgle): tilstanden bærer udfaldet, men IKKE værdierne — så prøves igen", async () => {
    for (const [status, udfald] of [[429, "loft"], [500, "fejl"], [401, "noegle_afvist"]] as const) {
      const { skriver, raekker } = fake();
      const r = await skrivProfil(skriver, "pk_test", "a@b.dk", V, { fetchImpl: svar(status, "nej") as unknown as typeof fetch });
      expect(r.sendt).toBe(false);
      expect(r.spor.udfald).toBe(udfald);
      expect(raekker[0]).toMatchObject({ udfald, status });
      expect("tb_naeste_webinar" in raekker[0]).toBe(false);
      expect("skrevet_at" in raekker[0]).toBe(false);
    }
    const { skriver, raekker } = fake();
    const r = await skrivProfil(skriver, null, "a@b.dk", V, { fetchImpl: svar(200) as unknown as typeof fetch });
    expect(r.spor.udfald).toBe("ingen_noegle");
    expect(raekker[0]).toMatchObject({ udfald: "ingen_noegle" });
  });
  it("FAIL-CLOSED: en dato med T/Z sendes ALDRIG — udfald ugyldig, intet kald, rækken skrevet", async () => {
    const { skriver, raekker } = fake();
    let kaldt = 0;
    const fetchImpl = (async () => { kaldt++; return new Response("", { status: 200 }); }) as unknown as typeof fetch;
    const r = await skrivProfil(skriver, "pk_test", "a@b.dk", { ...V, tb_naeste_webinar: "2026-10-13T09:00:00Z" }, { fetchImpl });
    expect(r.sendt).toBe(false);
    expect(r.spor.udfald).toBe("ugyldig");
    expect(r.spor.grund).toContain("ikke Klaviyos datoform");
    expect(kaldt).toBe(0);
    expect(raekker[0]).toMatchObject({ udfald: "ugyldig" });
  });
});

describe("6. alarmen — én mail pr. dansk kalenderdøgn, og teksten siger hvad der er galt", () => {
  it("nøglen bærer den danske DATO, ikke timen: tre kørsler samme døgn = samme nøgle; over midnat dansk tid = ny nøgle", () => {
    expect(profilAlarmNoegle(new Date("2026-09-23T07:17:00Z"))).toBe("klaviyo-profil-alarm:2026-09-23");
    expect(profilAlarmNoegle(new Date("2026-09-23T15:17:00Z"))).toBe("klaviyo-profil-alarm:2026-09-23");
    expect(profilAlarmNoegle(new Date("2026-09-23T21:17:00Z"))).toBe("klaviyo-profil-alarm:2026-09-23");
    expect(profilAlarmNoegle(new Date("2026-09-23T22:17:00Z"))).toBe("klaviyo-profil-alarm:2026-09-24"); // 00:17 dansk
    expect(profilAlarmNoegle(new Date("2026-12-01T23:17:00Z"))).toBe("klaviyo-profil-alarm:2026-12-02"); // vintertid: 00:17 dansk
  });
  it("udfaldene tælles op, flest først", () => {
    expect(taelUdfald([
      { email: "a@x.dk", udfald: "noegle_afvist", grund: "HTTP 403" },
      { email: "b@x.dk", udfald: "timeout", grund: null },
      { email: "c@x.dk", udfald: "noegle_afvist", grund: "HTTP 403" },
    ])).toEqual([{ udfald: "noegle_afvist", antal: 2 }, { udfald: "timeout", antal: 1 }]);
  });
  it("teksten: antal, udfaldene, de første tre mails med grund, og hvad der typisk er galt — titlen bærer datoen", () => {
    const fejlede = [1, 2, 3, 4].map((n) => ({ email: `p${n}@x.dk`, udfald: "noegle_afvist", grund: "HTTP 403" }));
    const t = profilAlarmTekst(fejlede, new Date("2026-09-23T07:17:00Z"));
    expect(t.emne).toBe("4 profilskrivninger til Klaviyo fejlede — webinarets tidspunkt står ikke på profilen");
    expect(t.titel).toBe("Klaviyo: 4 profilskrivninger fejlede (2026-09-23)");
    expect(t.afsnit[0]).toContain("fejlede 4 profilskrivninger. Udfald: noegle_afvist 4.");
    expect(t.blokke.slice(0, 3).map((b) => b.overskrift)).toEqual(["p1@x.dk", "p2@x.dk", "p3@x.dk"]);
    expect(t.blokke[0].tekst).toBe("noegle_afvist — HTTP 403");
    expect(t.blokke[3]).toEqual({ overskrift: "Hvad der typisk er galt ved «noegle_afvist»", tekst: PROFIL_ALARM_AARSAG.noegle_afvist });
    expect(PROFIL_ALARM_AARSAG.noegle_afvist).toContain("profiles:write");
    expect(t.tekst).toContain("p1@x.dk: noegle_afvist — HTTP 403");
    expect(t.tekst).not.toContain("p4@x.dk");
    const en = profilAlarmTekst([{ email: "a@x.dk", udfald: "timeout", grund: null }], new Date("2026-09-23T07:17:00Z"));
    expect(en.emne).toMatch(/^1 profilskrivning til Klaviyo fejlede/);
    expect(en.blokke[0].tekst).toBe("timeout");
  });
});
