import { describe, expect, it } from "vitest";
import {
  afsendelseUkendt, AKTIVE_ARTER, ARTER, baererInvitation, BEKRAEFTELSE_FRA, erPaamindelse, BEKRAEFTELSE_FRA_MS, doemMail, erAfmeldtIEwebinar,
  googleKalenderUrl, kbhTilUtc, MED_INVITATION, noegle, outlookKalenderUrl, PLANEN, planlaegKoersel,
  indhentningSlut, naesteTidssatteArt, planlagtTid, sammeDanskeDato, SEN_TILMELDING_NAADE_MS, UDGAAEDE_ARTER,
  type MailArt, type Plan, type Tilmeldt,
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

describe("planlagtTid — de fire tidspunkter, i dansk tid (tre_dage og dagen udgået 30/9)", () => {
  it("fjorten_dage, syv_dage og en_dag: kl. 08:00 dansk på kalenderdagen før", () => {
    // 13/10 minus 14 dage = 29/9 kl. 08:00 dansk = 06:00Z (sommertid).
    expect(planlagtTid(SESSION, "fjorten_dage")!.toISOString()).toBe("2026-09-29T06:00:00.000Z");
    // 13/10 minus 7 dage = 6/10 kl. 08:00 dansk = 06:00Z (sommertid).
    expect(planlagtTid(SESSION, "syv_dage")!.toISOString()).toBe("2026-10-06T06:00:00.000Z");
    expect(planlagtTid(SESSION, "en_dag")!.toISOString()).toBe("2026-10-12T06:00:00.000Z");
  });

  it("UDGÅET 30/9: tre_dage og dagen har intet tidspunkt — null, aldrig et gæt", () => {
    expect(planlagtTid(SESSION, "tre_dage")).toBeNull();
    expect(planlagtTid(SESSION, "dagen")).toBeNull();
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
    // Og «i morgen» 26/10 er efter skiftet: 08:00 dansk = 07:00Z.
    expect(planlagtTid(efter, "en_dag")!.toISOString()).toBe("2026-10-26T07:00:00.000Z");
    // «fjorten_dage» hen over skiftet begge veje: session 3/11 (vintertid) →
    // 20/10 (sommertid) 08:00 dansk = 06:00Z; session 10/11 → 27/10 (vintertid)
    // 08:00 dansk = 07:00Z. Kalenderdagen trækkes fra på den DANSKE dato.
    expect(planlagtTid("2026-11-03T10:00:00.000Z", "fjorten_dage")!.toISOString()).toBe("2026-10-20T06:00:00.000Z");
    expect(planlagtTid("2026-11-10T10:00:00.000Z", "fjorten_dage")!.toISOString()).toBe("2026-10-27T07:00:00.000Z");
  });

  it("en ulæselig session_tid giver null — aldrig et gæt", () => {
    expect(planlagtTid("ikke en dato", "en_dag")).toBeNull();
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
    expect(doemMail({ ...basis, art: "en_time", sessionTid: null, nu: dansk(SESSION) })).toEqual({ send: false, art: "en_time", grund: "ingen_session" });
    expect(doemMail({ ...basis, art: "en_time", email: "ikke en mail", nu: dansk(SESSION) })).toEqual({ send: false, art: "en_time", grund: "ingen_mail" });
    expect(doemMail({ ...basis, art: "en_time", email: null, nu: dansk(SESSION) })).toEqual({ send: false, art: "en_time", grund: "ingen_mail" });
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

  it("«en_time» går ALDRIG efter starten", () => {
    for (const art of ["en_time"] as MailArt[]) {
      const d = doemMail({ ...basis, art, nu: dansk("2026-10-13T09:00:00.000Z") });
      expect(d, art).toEqual({ send: false, art, grund: "sessionen_begyndt" });
    }
    // Og et minut før starten går «en_time» stadig (inden for nåden).
    expect(doemMail({ ...basis, art: "en_time", nu: dansk("2026-10-13T08:59:00.000Z") }).send).toBe(true);
  });

  it("UDGÅET 30/9: en art uden plads i PLANEN sendes aldrig — heller ikke på sit gamle tidspunkt", () => {
    // tre_dage 10/10 kl. 08:05 dansk og dagen 13/10 kl. 07:35 dansk — deres gamle tidspunkter.
    expect(doemMail({ ...basis, art: "tre_dage", nu: dansk("2026-10-10T06:05:00.000Z") })).toEqual({ send: false, art: "tre_dage", grund: "ingen_session" });
    expect(doemMail({ ...basis, art: "dagen", nu: dansk("2026-10-13T05:35:00.000Z") })).toEqual({ send: false, art: "dagen", grund: "ingen_session" });
  });

  it("de tidssatte påmindelser før «en_time» må gerne dømmes efter starten — de kan ikke, fordi de er for sent", () => {
    // Reglen «kraeverIkkeBegyndt» gælder kun en_time; for fjorten_dage, syv_dage og
    // en_dag er det nåden, der lukker døren. Begge veje ender med «ingen mail».
    // Bekræftelsen er med her siden 22/9: den har ingen nåde-regel, så
    // «sessionen er begyndt» er den eneste tidsdør, der lukker den.
    // («dagen» stod her til 30/9, hvor den udgik af PLANEN.)
    expect(PLANEN.filter((p) => p.kraeverIkkeBegyndt).map((p) => p.art)).toEqual(["bekraeftelse", "en_time"]);
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

  // Præmissen ændret 29/9 (Jonas): bekræftelser FØRST, derefter ældste planlagte.
  // En bekræftelse har planlagt = nu og ville ellers stå bagerst (se INDHENTNING nedenfor).
  it("mails sorteres: bekræftelser først, derefter ældste planlagte", () => {
    const senere = "2026-10-20T09:00:00.000Z";
    const { sendinger } = planlaegKoersel({
      raekker: [R({ email: "b@x.dk", session_tid: senere }), R({ email: "a@x.dk" })],
      afmeldte: new Set(), sendte: new Set(), nu: dansk("2026-10-13T08:05:00.000Z"),
    });
    const foersteIkkeBekraeftelse = sendinger.findIndex((s) => s.art !== "bekraeftelse");
    const bekraeftelser = sendinger.slice(0, foersteIkkeBekraeftelse === -1 ? sendinger.length : foersteIkkeBekraeftelse);
    const resten = sendinger.slice(bekraeftelser.length);
    expect(bekraeftelser.length).toBeGreaterThan(0);
    expect(bekraeftelser.every((s) => s.art === "bekraeftelse")).toBe(true);
    expect(resten.some((s) => s.art === "bekraeftelse")).toBe(false);
    expect(resten.length).toBeGreaterThan(0);
    for (let i = 1; i < resten.length; i++) {
      expect(resten[i - 1].planlagt <= resten[i].planlagt).toBe(true);
    }
  });

  it("AKTIVE_ARTER er PLANEN i PLANENs rækkefølge — fem arter (30/9)", () => {
    expect([...AKTIVE_ARTER]).toEqual(PLANEN.map((p) => p.art));
    expect([...AKTIVE_ARTER]).toEqual(["bekraeftelse", "fjorten_dage", "syv_dage", "en_dag", "en_time"]);
  });

  it("ARTER er stadig ordforrådet (CHECK'en), og AKTIVE + UDGÅEDE er præcis ARTER — uden overlap", () => {
    expect(ARTER).toEqual(["bekraeftelse", "fjorten_dage", "syv_dage", "tre_dage", "en_dag", "dagen", "en_time"]);
    expect([...UDGAAEDE_ARTER]).toEqual(["tre_dage", "dagen"]);
    expect(UDGAAEDE_ARTER.some((a) => AKTIVE_ARTER.includes(a))).toBe(false);
    expect(ARTER.filter((a) => AKTIVE_ARTER.includes(a) || UDGAAEDE_ARTER.includes(a))).toEqual([...ARTER]);
  });

  it("KØRSLEN på de udgåede arters gamle tidspunkter: intet sendes, og de tælles ikke som sprunget", () => {
    for (const nu of ["2026-10-10T06:05:00.000Z", "2026-10-13T05:35:00.000Z"]) {
      const { sendinger, sprunget } = planlaegKoersel({ raekker: [R({ email: "a@x.dk", registreret_at: "2026-09-10T08:00:00Z" })], afmeldte: new Set(), sendte: new Set(), nu: dansk(nu) });
      expect(sendinger, nu).toEqual([]);
      // Fem arter dømt, ikke syv: planlaegKoersel spørger aldrig om de udgåede.
      expect(Object.values(sprunget).reduce((a, b) => a + b, 0), nu).toBe(AKTIVE_ARTER.length);
    }
  });
});

describe("fjorten_dage — «om to uger», MED invitationen, til alle (Jonas 28/9)", () => {
  const basis = { sessionTid: SESSION, email: "a@x.dk", registreretAt: "2026-09-23T08:00:00.000Z", afmeldt: false, alleredeSendt: false };
  // 13/10 kl. 11:00 dansk minus 14 kalenderdage = 29/9 kl. 08:00 dansk = 06:00Z.
  const TIDSPUNKTET = "2026-09-29T06:00:00.000Z";
  const ET_SEKUND_FOER_FRA = "2026-09-22T17:02:59.000Z";

  it("står ANDEN i ARTER og i PLANEN — efter bekræftelsen, før «om en uge»", () => {
    expect(ARTER[1]).toBe("fjorten_dage");
    expect(PLANEN[1]).toEqual({ art: "fjorten_dage", dageFoer: 14, time: 8, minut: 0, indhentesSenestDageFoer: 8, kraeverIkkeBegyndt: false });
  });

  it("bærer invitationen — som bekræftelsen, og kun de to", () => {
    expect([...MED_INVITATION]).toEqual(["bekraeftelse", "fjorten_dage"]);
    expect(baererInvitation("fjorten_dage")).toBe(true);
    expect(baererInvitation("bekraeftelse")).toBe(true);
    for (const art of ["syv_dage", "tre_dage", "en_dag", "dagen", "en_time"] as MailArt[]) {
      expect(baererInvitation(art), art).toBe(false);
    }
    // Og alle arter i listen ER arter.
    for (const art of MED_INVITATION) expect(ARTER).toContain(art);
  });

  it("forfalder 29/9 kl. 08:00 dansk — ikke før", () => {
    expect(planlagtTid(SESSION, "fjorten_dage")!.toISOString()).toBe(TIDSPUNKTET);
    expect(doemMail({ ...basis, art: "fjorten_dage", nu: dansk("2026-09-28T12:00:00.000Z") }))
      .toEqual({ send: false, art: "fjorten_dage", grund: "endnu_ikke" });
    expect(doemMail({ ...basis, art: "fjorten_dage", nu: dansk("2026-09-29T05:59:59.000Z") }))
      .toEqual({ send: false, art: "fjorten_dage", grund: "endnu_ikke" });
    // Cronens første slot efter 08:00 er 08:09 dansk.
    expect(doemMail({ ...basis, art: "fjorten_dage", nu: dansk("2026-09-29T06:09:00.000Z") }))
      .toEqual({ send: true, art: "fjorten_dage", planlagt: dansk(TIDSPUNKTET) });
  });

  it("INGEN BEKRAEFTELSE_FRA-PORT: en tilmelding fra før 22/9 kl. 19:03 får den også — det er hele pointen", () => {
    for (const reg of [ET_SEKUND_FOER_FRA, "2026-08-01T10:00:00.000Z", null, undefined, ""]) {
      const d = doemMail({ ...basis, art: "fjorten_dage", registreretAt: reg, nu: dansk("2026-09-29T06:09:00.000Z") });
      expect(d.send, String(reg)).toBe(true);
    }
  });

  it("VINDUET RAMT SKÆVT: er tidspunktet passeret med mere end nåden (2 t), sendes den ALDRIG — for_sent", () => {
    // Samme regel som de andre påmindelser; der er intet smuthul for et helt hold.
    // 29/9 kl. 10:00:01 dansk = 08:00:01Z — ét sekund efter nåden.
    expect(doemMail({ ...basis, art: "fjorten_dage", nu: dansk("2026-09-29T08:00:01.000Z") }))
      .toEqual({ send: false, art: "fjorten_dage", grund: "for_sent" });
    // Og et døgn senere er den stadig for sent — den bliver aldrig «syv_dage».
    expect(doemMail({ ...basis, art: "fjorten_dage", nu: dansk("2026-09-30T08:00:00.000Z") }))
      .toEqual({ send: false, art: "fjorten_dage", grund: "for_sent" });
    // Inden for nåden går den: 09:59 dansk.
    expect(doemMail({ ...basis, art: "fjorten_dage", nu: dansk("2026-09-29T07:59:00.000Z") }).send).toBe(true);
  });

  it("må gerne dømmes efter sessionens start — den lukkes af nåden, ikke af «begyndt»", () => {
    expect(PLANEN.find((p) => p.art === "fjorten_dage")!.kraeverIkkeBegyndt).toBe(false);
    expect(doemMail({ ...basis, art: "fjorten_dage", nu: dansk("2026-10-13T12:00:00.000Z") }))
      .toEqual({ send: false, art: "fjorten_dage", grund: "for_sent" });
  });

  it("KØRSLEN 29/9 kl. 08:09: den gamle tilmeldte får fjorten_dage, og KUN den — bekræftelsen er stadig for tidlig", () => {
    const { sendinger, sprunget } = planlaegKoersel({
      raekker: [
        R({ email: "gammel@x.dk", registreret_at: ET_SEKUND_FOER_FRA }),
        R({ email: "ny@x.dk", registreret_at: "2026-09-23T08:00:00.000Z" }),
      ],
      afmeldte: new Set(), sendte: new Set(),
      nu: dansk("2026-09-29T06:09:00.000Z"),
    });
    const arter = (mail: string) => sendinger.filter((s) => s.email === mail).map((s) => s.art).sort();
    expect(arter("gammel@x.dk")).toEqual(["fjorten_dage"]);
    // Den nye ville også have fået bekræftelsen — men KUN fordi sporet er tomt
    // i prøven; i drift har hun en ok-række fra tilmeldingsdagen.
    expect(arter("ny@x.dk")).toEqual(["bekraeftelse", "fjorten_dage"]);
    expect(sprunget.for_tidlig_tilmelding).toBe(1);
    expect(sprunget.endnu_ikke).toBe(2 * 3); // syv_dage, en_dag, en_time for begge (tre_dage og dagen udgået 30/9)
  });

  it("KØRSLEN 6/10 (om en uge): fjorten_dage er for sent for alle og tælles som for_sent — aldrig sendt", () => {
    const { sendinger, sprunget } = planlaegKoersel({
      raekker: [R({ email: "a@x.dk" })], afmeldte: new Set(), sendte: new Set(),
      nu: dansk("2026-10-06T06:05:00.000Z"),
    });
    expect(sendinger.map((s) => s.art).sort()).toEqual(["bekraeftelse", "syv_dage"]);
    expect(sprunget.for_sent).toBe(1);
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
    // «om to uger», «om en uge» og «om tre dage» er for sent — de kommer ikke med.
    expect(arter).not.toContain("fjorten_dage");
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

  it("PÅMINDELSERNE ER URØRTE — de går også til en gammel tilmelding", () => {
    // Samme tilmelding som den, bekræftelsen afvises på: 17:02:59Z, altså før
    // overtagelsen. Påmindelserne dømmes udelukkende på sessionens tidspunkt.
    for (const reg of [ET_SEKUND_FOER, null, undefined]) {
      expect(doemMail({ ...basis, art: "fjorten_dage", registreretAt: reg, nu: dansk("2026-09-29T06:05:00.000Z") }).send, `fjorten_dage/${reg}`).toBe(true);
      expect(doemMail({ ...basis, art: "syv_dage", registreretAt: reg, nu: dansk("2026-10-06T06:05:00.000Z") }).send, `syv_dage/${reg}`).toBe(true);
      expect(doemMail({ ...basis, art: "en_dag", registreretAt: reg, nu: dansk("2026-10-12T06:05:00.000Z") }).send, `en_dag/${reg}`).toBe(true);
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

describe("INDHENTNING — en mail, VI fejlede med at sende, droppes ikke efter nåden (Jonas 29/9)", () => {
  // Sessionen 13/10 kl. 11:00 dansk (sommertid, UTC+2) = 09:00Z. Alle «nu» er skrevet
  // som UTC med den danske tid i kommentaren.
  const MAIL = "a@x.dk";
  const fejlet = (art: MailArt, session = SESSION, mail = MAIL) => new Set([noegle(mail, session, art)]);
  const dom = (art: MailArt, nu: string, ekstra: Partial<Parameters<typeof doemMail>[0]> = {}) =>
    doemMail({ art, sessionTid: SESSION, email: MAIL, registreretAt: "2026-09-23T08:00:00.000Z", afmeldt: false, alleredeSendt: false, nu: dansk(nu), ...ekstra });

  it("fjorten_dage 29/9 10:05 UDEN fejlet forsøg → for_sent (sen tilmelding, uændret)", () => {
    expect(dom("fjorten_dage", "2026-09-29T08:05:00.000Z")).toEqual({ send: false, art: "fjorten_dage", grund: "for_sent" });
  });

  it("fjorten_dage 29/9 10:05 MED fejlet forsøg → send, indhentning, planlagt = det oprindelige tidspunkt", () => {
    expect(dom("fjorten_dage", "2026-09-29T08:05:00.000Z", { fejlede: fejlet("fjorten_dage") }))
      .toEqual({ send: true, art: "fjorten_dage", planlagt: new Date("2026-09-29T06:00:00.000Z"), indhentning: true });
  });

  it("fjorten_dage 5/10 23:59 med fejlet → send (dagen før syv_dage)", () => {
    expect(dom("fjorten_dage", "2026-10-05T21:59:00.000Z", { fejlede: fejlet("fjorten_dage") }))
      .toMatchObject({ send: true, indhentning: true });
  });

  it("fjorten_dage 6/10 00:01 med fejlet → for_sent_efter_fejl (syv_dages danske dato)", () => {
    expect(dom("fjorten_dage", "2026-10-05T22:01:00.000Z", { fejlede: fejlet("fjorten_dage") }))
      .toEqual({ send: false, art: "fjorten_dage", grund: "for_sent_efter_fejl" });
  });

  it("fjorten_dage med fejlet OG allerede ok → allerede_sendt (går foran)", () => {
    expect(dom("fjorten_dage", "2026-09-29T08:05:00.000Z", { fejlede: fejlet("fjorten_dage"), alleredeSendt: true }))
      .toEqual({ send: false, art: "fjorten_dage", grund: "allerede_sendt" });
  });

  it("en_dag 12/10 11:00 med fejlet → send; 13/10 00:01 med fejlet → for_sent_efter_fejl", () => {
    expect(dom("en_dag", "2026-10-12T09:00:00.000Z", { fejlede: fejlet("en_dag") })).toMatchObject({ send: true, indhentning: true });
    expect(dom("en_dag", "2026-10-12T22:01:00.000Z", { fejlede: fejlet("en_dag") }))
      .toEqual({ send: false, art: "en_dag", grund: "for_sent_efter_fejl" });
  });

  it("30/9: syv_dage («om en uge») indhentes højst til og med 9/10 23:59 dansk — loftet 4 dage før, ikke en_dags dato", () => {
    // syv_dage 6/10 08:00 dansk → næste tidssatte art er en_dag 12/10 08:00 dansk, men
    // loftet (indhentesSenestDageFoer 4: 13/10 − 4 = 9/10) er tidligere og afgør.
    expect(naesteTidssatteArt("syv_dage")).toBe("en_dag");
    expect(PLANEN.find((p) => p.art === "syv_dage")?.indhentesSenestDageFoer).toBe(4);
    expect(indhentningSlut(SESSION, "syv_dage")?.toISOString()).toBe("2026-10-09T22:00:00.000Z");
    // 9/10 23:59 dansk (21:59Z) → send.
    expect(dom("syv_dage", "2026-10-09T21:59:00.000Z", { fejlede: fejlet("syv_dage") })).toMatchObject({ send: true, indhentning: true });
    // 10/10 00:00 dansk (9/10 22:00Z) — eksklusivt → for_sent_efter_fejl.
    expect(dom("syv_dage", "2026-10-09T22:00:00.000Z", { fejlede: fejlet("syv_dage") }))
      .toEqual({ send: false, art: "syv_dage", grund: "for_sent_efter_fejl" });
    // 10/10 12:00 og 11/10 23:59 dansk: FØR loftet ville de være sendt (til en_dags dato). Nu ikke.
    for (const nu of ["2026-10-10T10:00:00.000Z", "2026-10-11T21:59:00.000Z"]) {
      expect(dom("syv_dage", nu, { fejlede: fejlet("syv_dage") }), nu)
        .toEqual({ send: false, art: "syv_dage", grund: "for_sent_efter_fejl" });
    }
  });

  it("30/9: indhentningSlut pr. art for 13/10 kl. 11 — fjorten_dage 5/10 22:00Z · syv_dage 9/10 22:00Z · en_dag 12/10 22:00Z; ingen for straks, en_time, udgåede og ulæselig tid", () => {
    expect(indhentningSlut(SESSION, "fjorten_dage")?.toISOString()).toBe("2026-10-05T22:00:00.000Z");
    expect(indhentningSlut(SESSION, "syv_dage")?.toISOString()).toBe("2026-10-09T22:00:00.000Z");
    expect(indhentningSlut(SESSION, "en_dag")?.toISOString()).toBe("2026-10-12T22:00:00.000Z");
    for (const art of ["bekraeftelse", "en_time", "tre_dage", "dagen"] as MailArt[]) expect(indhentningSlut(SESSION, art), art).toBeNull();
    expect(indhentningSlut("ikke en tid", "syv_dage")).toBeNull();
    // Vintertid (UTC+1): session 10/11 kl. 11 dansk — syv_dage-loftet 6/11 23:59 dansk → slut 6/11 23:00Z.
    expect(indhentningSlut("2026-11-10T10:00:00.000Z", "syv_dage")?.toISOString()).toBe("2026-11-06T23:00:00.000Z");
  });

  it("30/9: hver tidssat påmindelse med en næste art (dageFoer) HAR et loft, mellem 1 og artens egne dage før", () => {
    for (const p of PLANEN) {
      if (p.straks === true || p.dageFoer === undefined) continue;
      expect(p.indhentesSenestDageFoer, p.art).toBeDefined();
      // Loftet er efter artens egen dag (eller samme dag) — ellers kunne den aldrig indhentes.
      expect(p.indhentesSenestDageFoer!, p.art).toBeLessThanOrEqual(p.dageFoer);
      expect(p.indhentesSenestDageFoer!, p.art).toBeGreaterThanOrEqual(1);
    }
  });

  it("30/9: et manglende loft er fail-closed — ingen indhentning", () => {
    const orig = PLANEN.find((p) => p.art === "syv_dage")!;
    const kopi = { ...orig };
    delete (kopi as { indhentesSenestDageFoer?: number }).indhentesSenestDageFoer;
    const i = (PLANEN as Plan[]).indexOf(orig);
    (PLANEN as Plan[])[i] = kopi;
    try {
      expect(indhentningSlut(SESSION, "syv_dage")).toBeNull();
      expect(dom("syv_dage", "2026-10-06T10:05:00.000Z", { fejlede: fejlet("syv_dage") }))
        .toEqual({ send: false, art: "syv_dage", grund: "for_sent_efter_fejl" });
    } finally {
      (PLANEN as Plan[])[i] = orig;
    }
  });

  it("30/9: en_dag → en_time (før: → dagen); vinduet er uændret til 12/10 23:59 dansk", () => {
    expect(naesteTidssatteArt("en_dag")).toBe("en_time");
    expect(dom("en_dag", "2026-10-12T21:59:00.000Z", { fejlede: fejlet("en_dag") })).toMatchObject({ send: true, indhentning: true });
    expect(dom("en_dag", "2026-10-12T22:01:00.000Z", { fejlede: fejlet("en_dag") }))
      .toEqual({ send: false, art: "en_dag", grund: "for_sent_efter_fejl" });
  });

  it("afmeldt med fejlet → afmeldt (går foran)", () => {
    expect(dom("fjorten_dage", "2026-09-29T08:05:00.000Z", { fejlede: fejlet("fjorten_dage"), afmeldt: true }))
      .toEqual({ send: false, art: "fjorten_dage", grund: "afmeldt" });
  });

  it("inden for nåden sendes den som altid — uden markør, også med et fejlet forsøg", () => {
    expect(dom("fjorten_dage", "2026-09-29T07:30:00.000Z", { fejlede: fejlet("fjorten_dage") }))
      .toEqual({ send: true, art: "fjorten_dage", planlagt: new Date("2026-09-29T06:00:00.000Z") });
  });

  it("et fejlet forsøg på en ANDEN art, en anden session eller en anden mail tæller ikke", () => {
    const nu = "2026-09-29T08:05:00.000Z";
    expect(dom("fjorten_dage", nu, { fejlede: fejlet("syv_dage") })).toMatchObject({ grund: "for_sent" });
    expect(dom("fjorten_dage", nu, { fejlede: fejlet("fjorten_dage", "2026-10-20T09:00:00.000Z") })).toMatchObject({ grund: "for_sent" });
    expect(dom("fjorten_dage", nu, { fejlede: fejlet("fjorten_dage", SESSION, "b@x.dk") })).toMatchObject({ grund: "for_sent" });
  });

  it("nøglen er noegle(): store bogstaver i mailen gør ingen forskel", () => {
    expect(dom("fjorten_dage", "2026-09-29T08:05:00.000Z", { email: "A@X.DK", fejlede: fejlet("fjorten_dage", SESSION, "a@x.dk") }))
      .toMatchObject({ send: true, indhentning: true });
  });

  it("en_time har ingen næste art: sessionen_begyndt afgør, som før", () => {
    expect(dom("en_time", "2026-10-13T10:05:00.000Z", { fejlede: fejlet("en_time") }))
      .toEqual({ send: false, art: "en_time", grund: "sessionen_begyndt" });
    expect(naesteTidssatteArt("en_time")).toBeNull();
    expect(naesteTidssatteArt("fjorten_dage")).toBe("syv_dage");
    expect(naesteTidssatteArt("bekraeftelse")).toBe("fjorten_dage");
  });

  it("bekræftelsen er urørt: et fejlet forsøg ændrer intet ved den", () => {
    const i = { art: "bekraeftelse" as MailArt, nu: "2026-10-01T08:00:00.000Z" };
    expect(dom(i.art, i.nu, { fejlede: fejlet("bekraeftelse") })).toEqual(dom(i.art, i.nu));
  });

  it("uden fejlede-input er dommen ordret som før 29/9", () => {
    for (const art of ARTER) for (const nu of ["2026-09-29T08:05:00.000Z", "2026-10-06T06:05:00.000Z", "2026-10-12T09:00:00.000Z", "2026-10-13T07:45:00.000Z"]) {
      expect(dom(art, nu, { fejlede: new Set() }), `${art}/${nu}`).toEqual(dom(art, nu));
    }
  });

  describe("vintertid — samme regel efter 25/10 (UTC+1)", () => {
    // Session 10/11 kl. 11:00 dansk (vintertid) = 10:00Z. fjorten_dage 27/10 kl. 08:00 dansk = 07:00Z;
    // syv_dage 3/11 kl. 08:00 dansk = 07:00Z.
    const VINTER = "2026-11-10T10:00:00.000Z";
    const v = (art: MailArt, nu: string, med: boolean) =>
      doemMail({ art, sessionTid: VINTER, email: MAIL, registreretAt: "2026-09-23T08:00:00.000Z", afmeldt: false, alleredeSendt: false, nu: dansk(nu), fejlede: med ? fejlet(art, VINTER) : undefined });
    it("27/10 10:05 dansk: uden fejlet for_sent, med fejlet send", () => {
      expect(v("fjorten_dage", "2026-10-27T09:05:00.000Z", false)).toMatchObject({ send: false, grund: "for_sent" });
      expect(v("fjorten_dage", "2026-10-27T09:05:00.000Z", true))
        .toEqual({ send: true, art: "fjorten_dage", planlagt: new Date("2026-10-27T07:00:00.000Z"), indhentning: true });
    });
    it("2/11 23:59 dansk send; 3/11 00:01 dansk for_sent_efter_fejl", () => {
      expect(v("fjorten_dage", "2026-11-02T22:59:00.000Z", true)).toMatchObject({ send: true, indhentning: true });
      expect(v("fjorten_dage", "2026-11-02T23:01:00.000Z", true)).toMatchObject({ send: false, grund: "for_sent_efter_fejl" });
    });
    it("hen over skiftet: session 3/11 — fjorten_dage 20/10 (sommertid), syv_dage 27/10 (vintertid)", () => {
      const S = "2026-11-03T10:00:00.000Z";
      const w = (nu: string) => doemMail({ art: "fjorten_dage", sessionTid: S, email: MAIL, registreretAt: null, afmeldt: false, alleredeSendt: false, nu: dansk(nu), fejlede: fejlet("fjorten_dage", S) });
      // 26/10 23:59 dansk = 22:59Z (vintertid) → stadig før syv_dages dato
      expect(w("2026-10-26T22:59:00.000Z")).toMatchObject({ send: true, indhentning: true });
      // 27/10 00:01 dansk = 26/10 23:01Z → syv_dages dato
      expect(w("2026-10-26T23:01:00.000Z")).toMatchObject({ send: false, grund: "for_sent_efter_fejl" });
      expect(sammeDanskeDato(dansk("2026-10-26T23:01:00.000Z"), dansk("2026-10-27T07:00:00.000Z"))).toBe(true);
    });
  });

  describe("planlaegKoersel — fejlede føres igennem", () => {
    it("en fejlet fjorten_dage indhentes og bærer markøren; uden fejlede tælles den for_sent", () => {
      const raekker = [R({ email: MAIL })];
      const nu = dansk("2026-09-29T08:05:00.000Z");
      const med = planlaegKoersel({ raekker, afmeldte: new Set(), sendte: new Set(), fejlede: fejlet("fjorten_dage"), nu });
      const s = med.sendinger.find((x) => x.art === "fjorten_dage");
      expect(s?.indhentning).toBe(true);
      expect(med.sprunget.for_sent).toBe(0);
      const uden = planlaegKoersel({ raekker, afmeldte: new Set(), sendte: new Set(), nu });
      expect(uden.sendinger.find((x) => x.art === "fjorten_dage")).toBeUndefined();
      expect(uden.sprunget.for_sent).toBe(1);
      expect(uden.sprunget.for_sent_efter_fejl).toBe(0);
    });
    it("en udløbet fejlet mail tælles som for_sent_efter_fejl, ikke for_sent", () => {
      const { sprunget } = planlaegKoersel({ raekker: [R({ email: MAIL })], afmeldte: new Set(), sendte: new Set(), fejlede: fejlet("fjorten_dage"), nu: dansk("2026-10-05T22:01:00.000Z") });
      expect(sprunget.for_sent_efter_fejl).toBe(1);
      expect(sprunget.for_sent).toBe(0);
    });
    it("RÆKKEFØLGEN (Jonas 29/9): 211 indhentede fjorten_dage + 1 ny bekræftelse → bekræftelsen er nr. 1", () => {
      // 211 gamle tilmeldinger (før BEKRAEFTELSE_FRA, så ingen bekræftelse til dem), hver med
      // et fejlet fjorten_dage-forsøg. Én ny tilmelding fra i dag uden noget sendt.
      const gamle = Array.from({ length: 211 }, (_, n) => R({ email: `g${String(n).padStart(3, "0")}@x.dk`, registreret_at: "2026-09-10T08:00:00.000Z" }));
      const ny = R({ email: "zz-ny@x.dk", registreret_at: "2026-09-29T08:00:00.000Z" });
      const fejlede = new Set(gamle.map((g) => noegle(g.email, SESSION, "fjorten_dage")));
      const { sendinger } = planlaegKoersel({ raekker: [...gamle, ny], afmeldte: new Set(), sendte: new Set(), fejlede, nu: dansk("2026-09-29T08:05:00.000Z") });
      expect(sendinger).toHaveLength(212);
      expect(sendinger[0]).toMatchObject({ email: "zz-ny@x.dk", art: "bekraeftelse" });
      expect(sendinger.slice(1).every((s) => s.art === "fjorten_dage" && s.indhentning === true)).toBe(true);
      // Under loftet på 90 er bekræftelsen blandt de første 90.
      expect(sendinger.slice(0, 90).some((s) => s.art === "bekraeftelse")).toBe(true);
    });

    it("efter bekræftelserne: ældste planlagte først, så mail", () => {
      const nu = dansk("2026-10-06T06:05:00.000Z"); // syv_dage lige forfalden (08:05 dansk)
      const a = R({ email: "a@x.dk", registreret_at: "2026-09-10T08:00:00.000Z" });
      const b = R({ email: "b@x.dk", registreret_at: "2026-10-06T06:00:00.000Z" });
      const fejlede = new Set([noegle("a@x.dk", SESSION, "fjorten_dage")]);
      const { sendinger } = planlaegKoersel({ raekker: [a, b], afmeldte: new Set(), sendte: new Set(), fejlede, nu });
      // b's bekræftelse først; så de to syv_dage (samme planlagt, sorteret på mail).
      expect(sendinger.map((s) => `${s.art}:${s.email}`)).toEqual(["bekraeftelse:b@x.dk", "syv_dage:a@x.dk", "syv_dage:b@x.dk"]);
    });

    it("en almindelig sending bærer ingen indhentning-nøgle", () => {
      const { sendinger } = planlaegKoersel({ raekker: [R({ email: MAIL })], afmeldte: new Set(), sendte: new Set(), nu: dansk("2026-09-29T06:05:00.000Z") });
      expect(sendinger.find((x) => x.art === "fjorten_dage")).not.toHaveProperty("indhentning");
    });
  });
});

// ── 29/9-2026: dubletværnet (mail-worstcase §4 P1-9 og P1-10) ───────────────

describe("KUN NÆRMESTE SESSION FÅR PÅMINDELSER (29/9)", () => {
  const SENERE = "2026-10-20T09:00:00.000Z"; // tirsdag 20/10 kl. 11 dansk
  const MAIL = "to@x.dk";
  const begge = [R({ email: MAIL }), R({ email: MAIL, session_tid: SENERE, ewebinar_id: "r2" })];
  const koer = (nu: string, raekker: Tilmeldt[] = begge) =>
    planlaegKoersel({ raekker, afmeldte: new Set(), sendte: new Set(), nu: dansk(nu) });

  it("erPaamindelse læses af PLANEN: alt undtagen «straks» (bekræftelsen)", () => {
    expect(ARTER.filter(erPaamindelse)).toEqual(["fjorten_dage", "syv_dage", "en_dag", "en_time"]);
    // De udgåede (30/9) er ikke påmindelser — de har ingen plan.
    for (const art of UDGAAEDE_ARTER) expect(erPaamindelse(art), art).toBe(false);
    expect(erPaamindelse("bekraeftelse")).toBe(false);
  });

  it("6/10 kl. 08:05: «om en uge» til 13/10 — og IKKE «om to uger» til 20/10 i samme minut", () => {
    const { sendinger, sprunget } = koer("2026-10-06T06:05:00.000Z");
    expect(sendinger.map((s) => `${s.art}:${s.sessionTid}`)).toEqual([
      `bekraeftelse:${SESSION}`, `bekraeftelse:${SENERE}`, `syv_dage:${SESSION}`,
    ]);
    // 20/10's fire påmindelser holdes alle tilbage (en af dem, fjorten_dage, var forfalden).
    expect(sprunget.senere_session).toBe(4);
  });

  it("BEKRÆFTELSEN går stadig pr. session — den er svaret på personens egen handling", () => {
    const { sendinger } = koer("2026-10-06T06:05:00.000Z");
    expect(sendinger.filter((s) => s.art === "bekraeftelse").map((s) => s.sessionTid).sort()).toEqual([SESSION, SENERE]);
  });

  it("uden den tidligere session får 20/10 sin «om to uger» som før", () => {
    const { sendinger, sprunget } = koer("2026-10-06T06:05:00.000Z", [begge[1]]);
    expect(sendinger.map((s) => s.art)).toEqual(["bekraeftelse", "fjorten_dage"]);
    expect(sprunget.senere_session).toBe(0);
  });

  it("13/10 kl. 10:00 (en time før): «om en time» til 13/10, intet til 20/10", () => {
    const gamle = [R({ email: MAIL, registreret_at: "2026-09-10T08:00:00Z" }), R({ email: MAIL, session_tid: SENERE, registreret_at: "2026-09-10T08:00:00Z" })];
    const { sendinger } = koer("2026-10-13T08:00:00.000Z", gamle);
    expect(sendinger.map((s) => `${s.art}:${s.sessionTid}`)).toEqual([`en_time:${SESSION}`]);
  });

  it("NÅR 13/10 ER BEGYNDT, OVERTAGER 20/10 — men «om en uge» (13/10 kl. 08) er passeret og indhentes IKKE", () => {
    const gamle = [R({ email: MAIL, registreret_at: "2026-09-10T08:00:00Z" }), R({ email: MAIL, session_tid: SENERE, registreret_at: "2026-09-10T08:00:00Z" })];
    const { sendinger, sprunget } = koer("2026-10-13T09:05:00.000Z", gamle); // 11:05 dansk
    expect(sendinger).toEqual([]);
    expect(sprunget.senere_session).toBe(0);
    // 20/10's fjorten_dage (6/10) og syv_dage (13/10 08:00, 3 t 5 min siden) er for_sent.
    expect(sprunget.for_sent).toBeGreaterThanOrEqual(2);
    // 17/10 kl. 08:05 (tre_dages gamle tidspunkt) går intet — den udgik 30/9.
    expect(koer("2026-10-17T06:05:00.000Z", gamle).sendinger).toEqual([]);
    // 19/10 kl. 08:00 går «i morgen» til 20/10 som normalt.
    const dag = koer("2026-10-19T06:05:00.000Z", gamle);
    expect(dag.sendinger.map((s) => `${s.art}:${s.sessionTid}`)).toEqual([`en_dag:${SENERE}`]);
  });

  it("et senere fejlet forsøg kan ikke indhentes forbi reglen — senere_session går foran nåden", () => {
    const fejlede = new Set([noegle(MAIL, SENERE, "fjorten_dage")]);
    const { sendinger, sprunget } = planlaegKoersel({ raekker: begge, afmeldte: new Set(), sendte: new Set(), fejlede, nu: dansk("2026-10-06T12:00:00.000Z") });
    expect(sendinger.some((s) => s.sessionTid === SENERE && s.art !== "bekraeftelse")).toBe(false);
    expect(sprunget.senere_session).toBeGreaterThan(0);
  });

  it("samme mail i forskellige store og små bogstaver er samme person", () => {
    const { sendinger } = koer("2026-10-06T06:05:00.000Z", [R({ email: "To@X.dk" }), R({ email: "to@x.dk", session_tid: SENERE, ewebinar_id: "r2" })]);
    expect(sendinger.filter((s) => s.art !== "bekraeftelse").map((s) => s.sessionTid)).toEqual([SESSION]);
  });

  it("doemMail: senereSession holder påmindelser tilbage, aldrig bekræftelsen", () => {
    const bas = { sessionTid: SENERE, email: MAIL, registreretAt: "2026-09-23T08:00:00Z", afmeldt: false, alleredeSendt: false, senereSession: true, nu: dansk("2026-10-06T06:05:00.000Z") };
    expect(doemMail({ ...bas, art: "fjorten_dage" })).toEqual({ send: false, art: "fjorten_dage", grund: "senere_session" });
    expect(doemMail({ ...bas, art: "bekraeftelse" }).send).toBe(true);
    expect(doemMail({ ...bas, art: "fjorten_dage", senereSession: false }).send).toBe(true);
  });
});

describe("INGEN BLIND GENSENDELSE: et ukendt udfald indhentes ikke (29/9)", () => {
  const MAIL = "u@x.dk";

  it("afsendelseUkendt: timeout, fejl uden status og 5xx er ukendte; tydelige afvisninger er det ikke", () => {
    expect(afsendelseUkendt({ udfald: "timeout", status: null })).toBe(true);
    expect(afsendelseUkendt({ udfald: "fejl", status: null })).toBe(true);
    expect(afsendelseUkendt({ udfald: "fejl", status: 500 })).toBe(true);
    expect(afsendelseUkendt({ udfald: "fejl", status: 503 })).toBe(true);
    expect(afsendelseUkendt({ udfald: "fejl", status: 404 })).toBe(false);
    expect(afsendelseUkendt({ udfald: "fejl", status: 413 })).toBe(false);
    for (const udfald of ["loft", "noegle_afvist", "ugyldig", "ingen_noegle"]) {
      expect(afsendelseUkendt({ udfald, status: null }), udfald).toBe(false);
      expect(afsendelseUkendt({ udfald, status: 429 }), udfald).toBe(false);
    }
    // Et loft kan komme med en 5xx-kode — Mailgun sagde stop, altså afvist.
    expect(afsendelseUkendt({ udfald: "loft", status: 503 })).toBe(false);
  });

  it("INDEN FOR NÅDEN: en timeout sendes IKKE igen ved næste kørsel (før 29/9 gjorde den)", () => {
    const nu = dansk("2026-10-06T06:10:00.000Z"); // 10 min efter syv_dage
    const raekker = [R({ email: MAIL, registreret_at: "2026-09-10T08:00:00Z" })];
    const ukendte = new Set([noegle(MAIL, SESSION, "syv_dage")]);
    const med = planlaegKoersel({ raekker, afmeldte: new Set(), sendte: new Set(), ukendte, nu });
    expect(med.sendinger).toEqual([]);
    expect(med.sprunget.levering_ukendt).toBe(1);
    // Uden kendskabet ville den gå igen — det er dubletten.
    const uden = planlaegKoersel({ raekker, afmeldte: new Set(), sendte: new Set(), nu });
    expect(uden.sendinger.map((s) => s.art)).toEqual(["syv_dage"]);
  });

  it("EFTER NÅDEN: et ukendt indhentes ikke — en tydelig afvisning gør stadig", () => {
    const nu = dansk("2026-09-29T12:00:00.000Z"); // fjorten_dage 4 t forsinket
    const k = noegle(MAIL, SESSION, "fjorten_dage");
    const raekker = [R({ email: MAIL, registreret_at: "2026-09-10T08:00:00Z" })];
    const ukendt = planlaegKoersel({ raekker, afmeldte: new Set(), sendte: new Set(), ukendte: new Set([k]), nu });
    expect(ukendt.sendinger).toEqual([]);
    expect(ukendt.sprunget.levering_ukendt).toBe(1);
    const afvist = planlaegKoersel({ raekker, afmeldte: new Set(), sendte: new Set(), fejlede: new Set([k]), nu });
    expect(afvist.sendinger).toMatchObject([{ art: "fjorten_dage", indhentning: true }]);
  });

  it("har nøglen BÅDE et ukendt og et afvist forsøg, vinder «ukendt»", () => {
    const k = noegle(MAIL, SESSION, "fjorten_dage");
    const d = doemMail({ art: "fjorten_dage", sessionTid: SESSION, email: MAIL, registreretAt: null, afmeldt: false, alleredeSendt: false, fejlede: new Set([k]), ukendte: new Set([k]), nu: dansk("2026-09-29T12:00:00.000Z") });
    expect(d).toEqual({ send: false, art: "fjorten_dage", grund: "levering_ukendt" });
  });

  it("BEKRÆFTELSEN (vurderet særskilt): heller ikke gensendt — hellere én manglende end en dublet med to invitationer", () => {
    const k = noegle(MAIL, SESSION, "bekraeftelse");
    const d = doemMail({ art: "bekraeftelse", sessionTid: SESSION, email: MAIL, registreretAt: "2026-09-29T08:00:00Z", afmeldt: false, alleredeSendt: false, ukendte: new Set([k]), nu: dansk("2026-09-29T08:05:00.000Z") });
    expect(d).toEqual({ send: false, art: "bekraeftelse", grund: "levering_ukendt" });
  });

  it("et ok-forsøg går foran: allerede_sendt, ikke levering_ukendt", () => {
    const k = noegle(MAIL, SESSION, "syv_dage");
    const d = doemMail({ art: "syv_dage", sessionTid: SESSION, email: MAIL, registreretAt: null, afmeldt: false, alleredeSendt: true, ukendte: new Set([k]), nu: dansk("2026-10-06T06:10:00.000Z") });
    expect(d).toEqual({ send: false, art: "syv_dage", grund: "allerede_sendt" });
  });

  it("nøglen er pr. art: et ukendt syv_dage holder ikke en_dag tilbage", () => {
    const d = doemMail({ art: "en_dag", sessionTid: SESSION, email: MAIL, registreretAt: null, afmeldt: false, alleredeSendt: false, ukendte: new Set([noegle(MAIL, SESSION, "syv_dage")]), nu: dansk("2026-10-12T06:05:00.000Z") });
    expect(d.send).toBe(true);
  });
});
