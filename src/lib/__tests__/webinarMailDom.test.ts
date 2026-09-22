import { describe, expect, it } from "vitest";
import {
  ARTER, BEKRAEFTELSE_FRA, BEKRAEFTELSE_FRA_MS, doemMail, erAfmeldtIEwebinar,
  googleKalenderUrl, kbhTilUtc, noegle, outlookKalenderUrl, PLANEN, planlaegKoersel,
  planlagtTid, SEN_TILMELDING_NAADE_MS,
  type MailArt, type Tilmeldt,
} from "@/lib/webinar/mailDom";

/**
 * Hvem får hvilken før-webinar-mail hvornår (22/9-2026).
 *
 * Sessionen i prøverne er 13/10-2026 kl. 11:00 DANSK (sommertid, UTC+2) =
 * 09:00Z — Jonas' rigtige næste session.
 */
const SESSION = "2026-10-13T09:00:00.000Z";
const dansk = (s: string) => new Date(s);

const R = (r: Partial<Tilmeldt> & { email: string }): Tilmeldt => ({
  ewebinar_id: `id-${r.email}`,
  navn: "Test Person",
  session_tid: SESSION,
  // Efter BEKRAEFTELSE_FRA, så de gamle prøver måler det, de altid har målt.
  registreret_at: "2026-09-23T08:00:00.000Z",
  webinar_titel: "Webinar med Morten Larsen",
  subscribed: "subscribed",
  sidste_action: "Registered",
  join_link: "https://topix.ewebinar.com/webinar/x/join/abc",
  kalender_link: "https://api.ewebinar.com/v1/attendees/12345/ics",
  replay_link: null,
  ...r,
});

describe("planlagtTid — de fem tidspunkter, i dansk tid", () => {
  it("syv_dage, tre_dage og en_dag: kl. 08:00 dansk på kalenderdagen før", () => {
    // 13/10 minus 7 dage = 6/10 kl. 08:00 dansk = 06:00Z (sommertid).
    expect(planlagtTid(SESSION, "syv_dage")!.toISOString()).toBe("2026-10-06T06:00:00.000Z");
    expect(planlagtTid(SESSION, "tre_dage")!.toISOString()).toBe("2026-10-10T06:00:00.000Z");
    expect(planlagtTid(SESSION, "en_dag")!.toISOString()).toBe("2026-10-12T06:00:00.000Z");
  });

  it("dagen: kl. 07:30 dansk samme dag", () => {
    expect(planlagtTid(SESSION, "dagen")!.toISOString()).toBe("2026-10-13T05:30:00.000Z");
  });

  it("en_time: præcis 60 minutter før — absolut, ikke en klokkeslæt-regel", () => {
    expect(planlagtTid(SESSION, "en_time")!.toISOString()).toBe("2026-10-13T08:00:00.000Z");
  });

  it("SOMMERTID: en session EFTER skiftet regnes i vintertid (UTC+1)", () => {
    // Danmark stiller uret tilbage natten til søndag 25/10-2026.
    // Session 27/10 kl. 11:00 dansk = 10:00Z. Syv dage før er 20/10 (sommertid)
    // kl. 08:00 dansk = 06:00Z — altså IKKE 07:00Z.
    const efter = "2026-10-27T10:00:00.000Z";
    expect(planlagtTid(efter, "syv_dage")!.toISOString()).toBe("2026-10-20T06:00:00.000Z");
    // Og «dagen» samme dag er efter skiftet: 07:30 dansk = 06:30Z.
    expect(planlagtTid(efter, "dagen")!.toISOString()).toBe("2026-10-27T06:30:00.000Z");
  });

  it("en ulæselig session_tid giver null — aldrig et gæt", () => {
    expect(planlagtTid("ikke en dato", "dagen")).toBeNull();
    expect(planlagtTid("", "syv_dage")).toBeNull();
  });

  it("kbhTilUtc rammer begge sider af sommertidsskiftet", () => {
    expect(kbhTilUtc(2026, 10, 24, 8, 0).toISOString()).toBe("2026-10-24T06:00:00.000Z"); // sommertid
    expect(kbhTilUtc(2026, 10, 26, 8, 0).toISOString()).toBe("2026-10-26T07:00:00.000Z"); // vintertid
  });
});

describe("doemMail — rækkefølgen er fail-closed", () => {
  const basis = { sessionTid: SESSION, email: "a@x.dk", registreretAt: "2026-09-23T08:00:00.000Z", afmeldt: false, alleredeSendt: false };

  it("sender, når tidspunktet er passeret og intet taler imod", () => {
    const d = doemMail({ ...basis, art: "syv_dage", nu: dansk("2026-10-06T06:00:01.000Z") });
    expect(d.send).toBe(true);
  });

  it("afmeldt slår ALT — også en mail, der ellers ville gå", () => {
    const d = doemMail({ ...basis, art: "syv_dage", afmeldt: true, nu: dansk("2026-10-06T06:00:01.000Z") });
    expect(d).toEqual({ send: false, art: "syv_dage", grund: "afmeldt" });
  });

  it("allerede sendt sendes ikke igen", () => {
    const d = doemMail({ ...basis, art: "syv_dage", alleredeSendt: true, nu: dansk("2026-10-06T06:00:01.000Z") });
    expect(d).toEqual({ send: false, art: "syv_dage", grund: "allerede_sendt" });
  });

  it("uden session_tid, og uden en brugbar mail, sendes intet", () => {
    expect(doemMail({ ...basis, art: "dagen", sessionTid: null, nu: dansk(SESSION) })).toEqual({ send: false, art: "dagen", grund: "ingen_session" });
    expect(doemMail({ ...basis, art: "dagen", email: "ikke en mail", nu: dansk(SESSION) })).toEqual({ send: false, art: "dagen", grund: "ingen_mail" });
    expect(doemMail({ ...basis, art: "dagen", email: null, nu: dansk(SESSION) })).toEqual({ send: false, art: "dagen", grund: "ingen_mail" });
  });

  it("før tidspunktet: endnu_ikke", () => {
    const d = doemMail({ ...basis, art: "syv_dage", nu: dansk("2026-10-06T05:59:00.000Z") });
    expect(d).toEqual({ send: false, art: "syv_dage", grund: "endnu_ikke" });
  });

  it("SEN TILMELDING: «om en uge» sendes ikke til en, der meldte sig i går", () => {
    // Fire dage før sessionen er syv_dage-tidspunktet passeret for tre døgn siden.
    const d = doemMail({ ...basis, art: "syv_dage", nu: dansk("2026-10-09T10:00:00.000Z") });
    expect(d).toEqual({ send: false, art: "syv_dage", grund: "for_sent" });
  });

  it("nåden er to timer — inden for den går mailen stadig", () => {
    const tid = planlagtTid(SESSION, "syv_dage")!.getTime();
    expect(doemMail({ ...basis, art: "syv_dage", nu: new Date(tid + SEN_TILMELDING_NAADE_MS - 60_000) }).send).toBe(true);
    expect(doemMail({ ...basis, art: "syv_dage", nu: new Date(tid + SEN_TILMELDING_NAADE_MS + 60_000) }).send).toBe(false);
  });

  it("«dagen» og «en_time» går ALDRIG efter starten", () => {
    for (const art of ["dagen", "en_time"] as MailArt[]) {
      const d = doemMail({ ...basis, art, nu: dansk("2026-10-13T09:00:00.000Z") });
      expect(d, art).toEqual({ send: false, art, grund: "sessionen_begyndt" });
    }
    // Og et minut før starten går «en_time» stadig (inden for nåden).
    expect(doemMail({ ...basis, art: "en_time", nu: dansk("2026-10-13T08:59:00.000Z") }).send).toBe(true);
  });

  it("de tre første må gerne gå efter starten — de kan ikke, fordi de er for sent", () => {
    // Reglen «kraeverIkkeBegyndt» gælder kun de to sidste; for de tre første er
    // det nåden, der lukker døren. Begge veje ender med «ingen mail».
    // Bekræftelsen er med her siden 22/9: den har ingen nåde-regel, så
    // «sessionen er begyndt» er den eneste tidsdør, der lukker den.
    expect(PLANEN.filter((p) => p.kraeverIkkeBegyndt).map((p) => p.art)).toEqual(["bekraeftelse", "dagen", "en_time"]);
    expect(doemMail({ ...basis, art: "en_dag", nu: dansk("2026-10-13T12:00:00.000Z") })).toEqual({ send: false, art: "en_dag", grund: "for_sent" });
  });
});

describe("erAfmeldtIEwebinar", () => {
  it("læser BÅDE subscribed og sidste_action, uden hensyn til store bogstaver", () => {
    expect(erAfmeldtIEwebinar({ subscribed: "Unsubscribed", sidste_action: "Registered" })).toBe(true);
    expect(erAfmeldtIEwebinar({ subscribed: "subscribed", sidste_action: "UNSUBSCRIBED" })).toBe(true);
    expect(erAfmeldtIEwebinar({ subscribed: "subscribed", sidste_action: "Joined" })).toBe(false);
    expect(erAfmeldtIEwebinar({ subscribed: null, sidste_action: null })).toBe(false);
  });
});

describe("planlaegKoersel — én person, uanset hvor mange registreringer", () => {
  const nu = dansk("2026-10-06T06:05:00.000Z"); // lige efter syv_dage-tidspunktet

  it("to registreringer på samme mail og session giver ÉN mail PR. ART", () => {
    const { sendinger } = planlaegKoersel({
      raekker: [R({ email: "a@x.dk", ewebinar_id: "r1" }), R({ email: "a@x.dk", ewebinar_id: "r2" })],
      afmeldte: new Set(), sendte: new Set(), nu,
    });
    // Ny præmis 22/9: bekræftelsen går også (den er forfalden straks), så der
    // er TO mails — men kun én af hver art, og kun én person.
    expect(sendinger.map((s) => s.art).sort()).toEqual(["bekraeftelse", "syv_dage"]);
    expect(new Set(sendinger.map((s) => s.email)).size).toBe(1);
    expect(new Set(sendinger.map((s) => `${s.email}|${s.sessionTid}|${s.art}`)).size).toBe(sendinger.length);
  });

  it("den registrering med FLEST links vinder — en gammel uden join_link slår ikke en ny med", () => {
    const { sendinger } = planlaegKoersel({
      raekker: [
        R({ email: "a@x.dk", ewebinar_id: "gammel", join_link: null, kalender_link: null }),
        R({ email: "a@x.dk", ewebinar_id: "ny" }),
      ],
      afmeldte: new Set(), sendte: new Set(), nu,
    });
    expect(sendinger[0].ewebinarId).toBe("ny");
    expect(sendinger[0].joinLink).toContain("join");
  });

  it("en afmelding på ÉN af personens rækker gælder personen", () => {
    const { sendinger, sprunget } = planlaegKoersel({
      raekker: [R({ email: "a@x.dk", ewebinar_id: "r1" }), R({ email: "a@x.dk", ewebinar_id: "r2", subscribed: "unsubscribed" })],
      afmeldte: new Set(), sendte: new Set(), nu,
    });
    expect(sendinger).toHaveLength(0);
    expect(sprunget.afmeldt).toBeGreaterThan(0);
  });

  it("vores EGEN afmeldingstabel gælder også", () => {
    const { sendinger } = planlaegKoersel({
      raekker: [R({ email: "a@x.dk" })], afmeldte: new Set(["a@x.dk"]), sendte: new Set(), nu,
    });
    expect(sendinger).toHaveLength(0);
  });

  it("allerede sendt springes over — nøglen er (mail, session, art)", () => {
    // Kun syv_dage er sendt: bekræftelsen står tilbage, for nøglen er pr. ART.
    const enSendt = planlaegKoersel({
      raekker: [R({ email: "a@x.dk" })],
      afmeldte: new Set(), sendte: new Set([noegle("a@x.dk", SESSION, "syv_dage")]), nu,
    });
    expect(enSendt.sendinger.map((s) => s.art)).toEqual(["bekraeftelse"]);
    // Begge sendt: intet tilbage.
    const beggeSendt = planlaegKoersel({
      raekker: [R({ email: "a@x.dk" })],
      afmeldte: new Set(),
      sendte: new Set([noegle("a@x.dk", SESSION, "syv_dage"), noegle("a@x.dk", SESSION, "bekraeftelse")]),
      nu,
    });
    expect(beggeSendt.sendinger).toHaveLength(0);
  });

  it("rækker uden session_tid tæller slet ikke med", () => {
    const { sendinger } = planlaegKoersel({
      raekker: [R({ email: "a@x.dk", session_tid: null })], afmeldte: new Set(), sendte: new Set(), nu,
    });
    expect(sendinger).toHaveLength(0);
  });

  it("mails sorteres ældste planlagte først", () => {
    const senere = "2026-10-20T09:00:00.000Z";
    const { sendinger } = planlaegKoersel({
      raekker: [R({ email: "b@x.dk", session_tid: senere }), R({ email: "a@x.dk" })],
      afmeldte: new Set(), sendte: new Set(), nu: dansk("2026-10-13T08:05:00.000Z"),
    });
    for (let i = 1; i < sendinger.length; i++) {
      expect(sendinger[i - 1].planlagt <= sendinger[i].planlagt).toBe(true);
    }
  });

  it("ARTER og PLANEN er den samme liste i den samme rækkefølge", () => {
    expect(PLANEN.map((p) => p.art)).toEqual([...ARTER]);
    expect(ARTER).toEqual(["bekraeftelse", "syv_dage", "tre_dage", "en_dag", "dagen", "en_time"]);
  });
});

describe("bekraeftelse — forfalden straks, men aldrig bagud", () => {
  const basis = { sessionTid: SESSION, email: "a@x.dk", registreretAt: "2026-09-23T08:00:00.000Z", afmeldt: false, alleredeSendt: false };

  it("er FØRST i ARTER og i PLANEN", () => {
    expect(ARTER[0]).toBe("bekraeftelse");
    expect(PLANEN[0].art).toBe("bekraeftelse");
    expect(PLANEN[0].straks).toBe(true);
  });

  it("går NU — også et halvt år før sessionen, og også dagen før", () => {
    for (const nu of ["2026-04-01T09:00:00Z", "2026-10-06T06:05:00Z", "2026-10-13T08:59:00Z"]) {
      const d = doemMail({ ...basis, art: "bekraeftelse", nu: dansk(nu) });
      expect(d.send, nu).toBe(true);
      // Tidspunktet i sporet er NU, ikke epoken.
      if (d.send === true) expect(d.planlagt.toISOString()).toBe(new Date(nu).toISOString());
    }
  });

  it("den er aldrig «for sent» — en ny tilmeldt får den også dagen før", () => {
    const d = doemMail({ ...basis, art: "bekraeftelse", nu: dansk("2026-10-12T23:00:00Z") });
    expect(d).toEqual({ send: true, art: "bekraeftelse", planlagt: dansk("2026-10-12T23:00:00Z") });
  });

  it("men ALDRIG efter sessionen er begyndt", () => {
    expect(doemMail({ ...basis, art: "bekraeftelse", nu: dansk("2026-10-13T09:00:00.000Z") }))
      .toEqual({ send: false, art: "bekraeftelse", grund: "sessionen_begyndt" });
  });

  it("og kun ÉN gang: sporet er den eneste dør, der lukker den", () => {
    expect(doemMail({ ...basis, art: "bekraeftelse", alleredeSendt: true, nu: dansk("2026-10-06T06:05:00Z") }))
      .toEqual({ send: false, art: "bekraeftelse", grund: "allerede_sendt" });
    expect(doemMail({ ...basis, art: "bekraeftelse", afmeldt: true, nu: dansk("2026-10-06T06:05:00Z") }))
      .toEqual({ send: false, art: "bekraeftelse", grund: "afmeldt" });
  });

  it("planlagtTid for «straks» er epoken — «forfalden siden altid»", () => {
    expect(planlagtTid(SESSION, "bekraeftelse")!.getTime()).toBe(0);
  });

  it("en ny tilmeldt får bekræftelsen OG de påmindelser, der stadig er i tide", () => {
    const { sendinger } = planlaegKoersel({
      raekker: [R({ email: "ny@x.dk" })], afmeldte: new Set(), sendte: new Set(),
      nu: dansk("2026-10-12T07:00:00.000Z"), // dagen før, efter en_dag-tidspunktet
    });
    const arter = sendinger.map((s) => s.art);
    expect(arter).toContain("bekraeftelse");
    expect(arter).toContain("en_dag");
    // «om en uge» og «om tre dage» er for sent — de kommer ikke med.
    expect(arter).not.toContain("syv_dage");
    expect(arter).not.toContain("tre_dage");
  });
});

describe("BEKRAEFTELSE_FRA — bekræftelsen sendes aldrig bagud", () => {
  const basis = { sessionTid: SESSION, email: "a@x.dk", afmeldt: false, alleredeSendt: false };
  // 22/9-2026 kl. 19:03 dansk = 17:03Z — øjeblikket eWebinars egen bekræftelse
  // blev slukket, og platformens tog over (Jonas 22/9 ca. 19:05).
  const ET_SEKUND_FOER = "2026-09-22T17:02:59.000Z";
  const PRAECIS = "2026-09-22T17:03:00.000Z";
  const NU = dansk("2026-09-23T09:00:00.000Z");

  it("konstanten er ét øjeblik, og det er 22/9-2026 17:03Z", () => {
    expect(BEKRAEFTELSE_FRA).toBe("2026-09-22T17:03:00Z");
    expect(BEKRAEFTELSE_FRA_MS).toBe(Date.parse("2026-09-22T17:03:00Z"));
    expect(new Date(BEKRAEFTELSE_FRA_MS).toISOString()).toBe("2026-09-22T17:03:00.000Z");
  });

  it("ET SEKUND FØR: ikke forfalden", () => {
    expect(doemMail({ ...basis, art: "bekraeftelse", registreretAt: ET_SEKUND_FOER, nu: NU }))
      .toEqual({ send: false, art: "bekraeftelse", grund: "for_tidlig_tilmelding" });
  });

  it("PRÆCIS på sekundet: forfalden — grænsen er med", () => {
    const d = doemMail({ ...basis, art: "bekraeftelse", registreretAt: PRAECIS, nu: NU });
    expect(d).toEqual({ send: true, art: "bekraeftelse", planlagt: NU });
  });

  it("NULL eller ulæselig: ikke forfalden (fail-closed)", () => {
    for (const reg of [null, undefined, "", "i går", "0000"]) {
      expect(doemMail({ ...basis, art: "bekraeftelse", registreretAt: reg, nu: NU }), String(reg))
        .toEqual({ send: false, art: "bekraeftelse", grund: "for_tidlig_tilmelding" });
    }
  });

  it("DE FEM PÅMINDELSER ER URØRTE — de går også til en gammel tilmelding", () => {
    // Samme tilmelding som den, bekræftelsen afvises på: 17:02:59Z, altså før
    // overtagelsen. Påmindelserne dømmes udelukkende på sessionens tidspunkt.
    for (const reg of [ET_SEKUND_FOER, null, undefined]) {
      expect(doemMail({ ...basis, art: "syv_dage", registreretAt: reg, nu: dansk("2026-10-06T06:05:00.000Z") }).send, `syv_dage/${reg}`).toBe(true);
      expect(doemMail({ ...basis, art: "tre_dage", registreretAt: reg, nu: dansk("2026-10-10T06:05:00.000Z") }).send, `tre_dage/${reg}`).toBe(true);
      expect(doemMail({ ...basis, art: "en_dag", registreretAt: reg, nu: dansk("2026-10-12T06:05:00.000Z") }).send, `en_dag/${reg}`).toBe(true);
      expect(doemMail({ ...basis, art: "dagen", registreretAt: reg, nu: dansk("2026-10-13T05:35:00.000Z") }).send, `dagen/${reg}`).toBe(true);
      expect(doemMail({ ...basis, art: "en_time", registreretAt: reg, nu: dansk("2026-10-13T08:05:00.000Z") }).send, `en_time/${reg}`).toBe(true);
    }
  });

  it("KØRSLEN: den gamle tilmeldte får påmindelsen, ikke bekræftelsen", () => {
    const { sendinger, sprunget } = planlaegKoersel({
      raekker: [
        R({ email: "gammel@x.dk", registreret_at: ET_SEKUND_FOER }),
        R({ email: "ny@x.dk", registreret_at: PRAECIS }),
      ],
      afmeldte: new Set(), sendte: new Set(),
      nu: dansk("2026-10-06T06:05:00.000Z"),
    });
    const arter = (mail: string) => sendinger.filter((s) => s.email === mail).map((s) => s.art).sort();
    expect(arter("gammel@x.dk")).toEqual(["syv_dage"]);
    expect(arter("ny@x.dk")).toEqual(["bekraeftelse", "syv_dage"]);
    expect(sprunget.for_tidlig_tilmelding).toBe(1);
  });

  it("KØRSLEN: en række uden registreret_at får heller ikke bekræftelsen", () => {
    const { sendinger, sprunget } = planlaegKoersel({
      raekker: [R({ email: "uden@x.dk", registreret_at: null })],
      afmeldte: new Set(), sendte: new Set(),
      nu: dansk("2026-10-06T06:05:00.000Z"),
    });
    expect(sendinger.map((s) => s.art)).toEqual(["syv_dage"]);
    expect(sprunget.for_tidlig_tilmelding).toBe(1);
  });
});

describe("kalenderlinkene — de to former er forskellige, og det er med vilje", () => {
  const a = { titel: "Webinar med Morten Larsen", sessionTid: SESSION, joinLink: "https://topix.ewebinar.com/join/abc" };

  it("Google: dates=START/SLUT i YYYYMMDDTHHmmSSZ, begge dele", () => {
    const u = new URL(googleKalenderUrl(a)!);
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("dates")).toBe("20261013T090000Z/20261013T100000Z");
    expect(u.searchParams.get("text")).toBe(a.titel);
    expect(u.searchParams.get("details")).toContain(a.joinLink);
  });

  it("Outlook: startdt/enddt i ISO-formen med bindestreger og kolon", () => {
    const u = new URL(outlookKalenderUrl(a)!);
    expect(u.origin + u.pathname).toBe("https://outlook.office.com/calendar/0/deeplink/compose");
    expect(u.searchParams.get("path")).toBe("/calendar/action/compose");
    expect(u.searchParams.get("rru")).toBe("addevent");
    expect(u.searchParams.get("startdt")).toBe("2026-10-13T09:00:00Z");
    expect(u.searchParams.get("enddt")).toBe("2026-10-13T10:00:00Z");
  });

  it("uden join_link står der stadig et link — bare uden beskrivelse", () => {
    const uden = { ...a, joinLink: null };
    expect(new URL(googleKalenderUrl(uden)!).searchParams.get("details")).toBeNull();
    expect(googleKalenderUrl(uden)).toContain("dates=");
  });

  it("ulæselig session_tid giver null begge steder", () => {
    expect(googleKalenderUrl({ ...a, sessionTid: "x" })).toBeNull();
    expect(outlookKalenderUrl({ ...a, sessionTid: "x" })).toBeNull();
  });
});
