import { describe, expect, it } from "vitest";
import {
  A_TRIN_DAGE, B_TRIN_DAGE, B_VINDUE_STILLE_DAGE, LOGIN_LOG_FRA, VINDUE_DAGE,
  dageMellem, danskDato, doemStille, invitationstilstand, stilleTekst, taerskelA,
  type StilleBruger, type StilleInvitation, type StilleKontrakt, type StilleLogin,
} from "@/lib/stilleDom";

// De to klokker (20/9-2026) — én test pr. regel i filhovedet, én pr. trin, og
// teksterne med de faktiske navne og tal fra målingen som fixtures.

const NU = new Date("2026-09-20T12:00:00Z");
const k = (o: Partial<StilleKontrakt> = {}): StilleKontrakt => ({
  companyId: "c1", navn: "WESDEX", status: "active", erKunde: true, erLegat: false,
  periodeStart: "2026-01-29", periodeSlut: "2027-01-29", betalingsmodel: "rate12", prisEksMomsOere: 4_200_000,
  kontaktperson: "Jonas Wesley Kinana", kontaktEmail: "jonas@wesdex.dk", ...o,
});
const bruger = (o: Partial<StilleBruger> = {}): StilleBruger => ({ companyId: "c1", userId: "u1", navn: "Caspar Bennedsen", oprettetAt: "2026-04-08T09:00:00Z", ...o });
const login = (sidste: string, userId = "u1"): StilleLogin => ({ userId, sidsteLogin: sidste });
const inv = (o: Partial<StilleInvitation> = {}): StilleInvitation => ({ companyId: "c1", email: "jonas@wesdex.dk", status: "pending", sendtAt: "2026-09-01T08:00:00Z", accepteretAt: null, ...o });
const dagFoer = (dage: number, nu = NU) => new Date(nu.getTime() - dage * 86_400_000).toISOString();

describe("stilleDom — regel 1 og 2: grundmængden og det, et menneske har afgjort", () => {
  it("'tidligere' ringer aldrig — Pro-Vision og E-skilte er en beslutning", () => {
    expect(doemStille(k({ navn: "Pro-Vision ApS", status: "tidligere", periodeStart: "2025-09-21", periodeSlut: "2026-09-21" }), [], [], [], NU)).toEqual({ klokke: "tavs", grund: "ikke_aktiv" });
  });
  it("gratis og pris 0 ringer aldrig (Bastant Design)", () => {
    expect(doemStille(k({ betalingsmodel: "gratis", prisEksMomsOere: 0 }), [], [], [], NU)).toEqual({ klokke: "tavs", grund: "gratis" });
    expect(doemStille(k({ prisEksMomsOere: 0 }), [], [], [], NU)).toEqual({ klokke: "tavs", grund: "gratis" });
  });
  it("legat og ikke-kunde ringer aldrig; er_kunde null er fail-open", () => {
    expect(doemStille(k({ erLegat: true }), [], [], [], NU).klokke).toBe("tavs");
    expect(doemStille(k({ erKunde: false }), [], [], [], NU)).toEqual({ klokke: "tavs", grund: "ikke_kunde" });
    expect(doemStille(k({ erKunde: null }), [], [], [], NU).klokke).toBe("ingen_bruger");
  });
  it("slutdatoen er eksklusiv: et kontraktår, der slutter i dag, er uden for perioden", () => {
    expect(doemStille(k({ periodeStart: "2025-09-20", periodeSlut: "2026-09-20" }), [], [], [], NU)).toEqual({ klokke: "tavs", grund: "uden_for_periode" });
    expect(doemStille(k({ periodeStart: "2025-09-21", periodeSlut: "2026-09-21" }), [], [], [], NU).klokke).toBe("ingen_bruger");
  });
});

describe("stilleDom — A · betalt, ingen bruger (regel 3, 4, 6, 7)", () => {
  it("tærsklerne er over det målte: onboarding max 54 dage (2026) → A1 ved 30 er en påmindelse, ikke en alarm", () => {
    expect(A_TRIN_DAGE).toEqual([30, 60, 90]);
    expect([1, 2, 3, 4, 5].map(taerskelA)).toEqual([30, 60, 90, 120, 150]);
  });
  it("Din Forsikringsret (15/9) ringer ikke, mens onboarding kører — dag 5 og dag 29 er tavse", () => {
    const df = k({ navn: "Din Forsikringsret", periodeStart: "2026-09-15", periodeSlut: "2027-09-15", prisEksMomsOere: 5_250_000 });
    expect(doemStille(df, [], [], [], NU)).toEqual({ klokke: "tavs", grund: "for_tidligt" });
    expect(doemStille(df, [], [], [], new Date("2026-10-14T12:00:00Z"))).toEqual({ klokke: "tavs", grund: "for_tidligt" });
  });
  it("trin 1 dag 30, trin 2 dag 60, trin 3 dag 90, derefter hvert 30. dag — og titlen er den samme hele trinnet (dedup)", () => {
    const df = k({ navn: "Din Forsikringsret", periodeStart: "2026-09-15", periodeSlut: "2027-09-15" });
    const d = (dage: number) => doemStille(df, [], [], [], new Date(Date.UTC(2026, 8, 15) + dage * 86_400_000));
    expect(d(30)).toMatchObject({ klokke: "ingen_bruger", trin: 1, taerskel: 30, dage: 30 });
    expect(d(59)).toMatchObject({ trin: 1, taerskel: 30 });
    expect(d(60)).toMatchObject({ trin: 2, taerskel: 60 });
    expect(d(90)).toMatchObject({ trin: 3, taerskel: 90 });
    expect(d(119)).toMatchObject({ trin: 3 });
    expect(d(120)).toMatchObject({ trin: 4, taerskel: 120 });
    expect(d(150)).toMatchObject({ trin: 5, taerskel: 150 });
    const t30 = stilleTekst(d(30), df, [], null)!.title;
    expect(t30).toBe("Din Forsikringsret: ingen bruger 30 dage efter betalingen 15. september 2026");
    expect(stilleTekst(d(59), df, [], null)!.title).toBe(t30);
    expect(stilleTekst(d(60), df, [], null)!.title).not.toBe(t30);
  });
  it("en bruger slukker A (regel 7) — også dag 30", () => {
    expect(doemStille(k(), [bruger()], [login(dagFoer(1))], [], NU).klokke).not.toBe("ingen_bruger");
  });
  it("regel 4: tre tilstande — ingen invitation · pending · udløbet — dømt af den seneste", () => {
    expect(invitationstilstand([])).toEqual({ tilstand: "ingen_invitation", invitation: null });
    expect(invitationstilstand([inv()]).tilstand).toBe("pending");
    expect(invitationstilstand([inv({ status: "expired", sendtAt: "2026-02-01T00:00:00Z" })]).tilstand).toBe("udloebet");
    // Den seneste afgør: en ny pending efter en udløbet er pending.
    expect(invitationstilstand([inv({ status: "expired", sendtAt: "2026-02-01T00:00:00Z" }), inv()]).tilstand).toBe("pending");
  });
  it("WESDEX i dag: 234 dage, trin 7 (tærskel 210), invitationen fra 1/9 er pending — teksten er en handling", () => {
    const dom = doemStille(k(), [], [], [inv()], NU);
    expect(dom).toMatchObject({ klokke: "ingen_bruger", trin: 7, taerskel: 210, dage: 234, tilstand: "pending" });
    const t = stilleTekst(dom, k(), [], null)!;
    expect(t.title).toBe("WESDEX: ingen bruger 210 dage efter betalingen 29. januar 2026");
    expect(t.body).toBe(
      "WESDEX har haft adgang i 210 dage uden en bruger — 42.000 kr. betalt, 115 kr. om dagen, de ikke får noget for. Ring til Jonas Wesley Kinana: en, der aldrig kom ind, fornyer sjældent, men det er ikke afgjort, før nogen har talt med dem. Er det afgjort, sæt virksomheden som tidligere, så klokken tier. Invitationen til jonas@wesdex.dk blev sendt 1. september 2026 og er ikke accepteret — send den igen, eller ring til Jonas Wesley Kinana.",
    );
  });
  it("trin 1 siger «send invitationen igen», ikke «det er gået galt» (TOFT tog 37 dage, TuaMea 54)", () => {
    const dk = k({ navn: "Din økonomiafdeling", periodeStart: "2026-02-25", periodeSlut: "2027-02-25", prisEksMomsOere: 4_000_000, kontaktperson: null, kontaktEmail: null });
    const nu30 = new Date("2026-03-27T12:00:00Z");
    const t = stilleTekst(doemStille(dk, [], [], [], nu30), dk, [], null)!;
    expect(t.body).toBe("Din økonomiafdeling har betalt 40.000 kr. og har ikke haft en bruger i en måned. Der er aldrig sendt en invitation — send den i dag.");
    expect(t.body).not.toMatch(/galt|alarm/i);
  });
  it("trin 2 regner prisen pr. dag; udløbet invitation nævnes med sin dato", () => {
    const ts = k({ navn: "Two Socks ApS", periodeStart: "2026-02-26", periodeSlut: "2027-02-26", kontaktperson: "Simon Frimann" });
    const nu60 = new Date("2026-04-27T12:00:00Z");
    const t = stilleTekst(doemStille(ts, [], [], [inv({ email: "simon@simonfrimann.dk", status: "expired", sendtAt: "2026-03-01T00:00:00Z" })], nu60), ts, [], null)!;
    expect(t.title).toBe("Two Socks ApS: ingen bruger 60 dage efter betalingen 26. februar 2026");
    expect(t.body).toBe(
      "Two Socks ApS har betalt 42.000 kr. for 60 dages adgang, ingen har brugt endnu — 115 kr. om dagen, de ikke får noget for. Invitationen til simon@simonfrimann.dk fra 1. marts 2026 er udløbet — send en ny, eller ring til Simon Frimann.",
    );
  });
});

describe("stilleDom — B · ingen login (regel 3, 5, 7, 8)", () => {
  const bw = k({ navn: "Brick Works ApS", periodeStart: "2026-04-07", periodeSlut: "2027-04-07", kontaktperson: "Caspar Bennedsen" });
  it("tærsklen ligger over det største målte hul (78 dage, TOFT) og over p90 (68,8)", () => {
    expect(B_TRIN_DAGE).toEqual([90, 120, 150]);
    expect(B_TRIN_DAGE[0]).toBeGreaterThan(78);
    expect(B_VINDUE_STILLE_DAGE).toBe(30);
  });
  it("YKRG: 72 dage stille og kom tilbage — ved 60 ville klokken have ringet; ved 90 tier den", () => {
    expect(doemStille(k({ navn: "YKRG APS" }), [bruger()], [login(dagFoer(72))], [], NU)).toEqual({ klokke: "tavs", grund: "for_tidligt" });
    expect(doemStille(k(), [bruger()], [login(dagFoer(89))], [], NU).klokke).toBe("tavs");
    expect(doemStille(k(), [bruger()], [login(dagFoer(90))], [], NU)).toMatchObject({ klokke: "ingen_login", trin: 1, taerskel: 90 });
  });
  it("de fire fra målingen ringer alle: Brick Works 145 og TuaMea 138 → trin 2; Capture IT 97 og Homie 95 → trin 1", () => {
    expect(doemStille(bw, [bruger()], [login("2026-04-28T10:00:00Z")], [], NU)).toMatchObject({ klokke: "ingen_login", trin: 2, dage: 145, sidenDag: "2026-04-28", dageTilSlut: 199, iVinduet: false });
    expect(doemStille(k({ navn: "TuaMea" }), [bruger()], [login("2026-05-05T10:00:00Z")], [], NU)).toMatchObject({ trin: 2, dage: 138 });
    expect(doemStille(k({ navn: "Capture IT" }), [bruger()], [login("2026-06-15T10:00:00Z")], [], NU)).toMatchObject({ trin: 1, dage: 97 });
    expect(doemStille(k({ navn: "Homie" }), [bruger()], [login("2026-06-17T10:00:00Z")], [], NU)).toMatchObject({ trin: 1, dage: 95 });
  });
  it("et login nulstiller (regel 7): dag 10 efter nyt login er tavs 'aktiv' — og en ny episode giver en ny titel", () => {
    expect(doemStille(bw, [bruger()], [login(dagFoer(10))], [], NU)).toEqual({ klokke: "tavs", grund: "aktiv" });
    const a = stilleTekst(doemStille(bw, [bruger()], [login("2026-04-28T10:00:00Z")], [], NU), bw, [bruger()], null)!.title;
    const b = stilleTekst(doemStille(bw, [bruger()], [login("2026-05-20T10:00:00Z")], [], NU), bw, [bruger()], null)!.title;
    expect(a).toBe("Brick Works ApS: ingen login i 120 dage (siden 28. april 2026)");
    expect(b).toBe("Brick Works ApS: ingen login i 120 dage (siden 20. maj 2026)");
  });
  it("regel 5: sidste login på tværs af ALLE brugere — én aktiv bruger er nok (BR Roset har to)", () => {
    const to = [bruger(), bruger({ userId: "u2", navn: "Betina" })];
    expect(doemStille(bw, to, [login(dagFoer(200), "u1"), login(dagFoer(5), "u2")], [], NU)).toEqual({ klokke: "tavs", grund: "aktiv" });
    expect(doemStille(bw, to, [login(dagFoer(200), "u1"), login(dagFoer(95), "u2")], [], NU)).toMatchObject({ trin: 1, brugere: 2 });
  });
  it("regel 5: uden en eneste login-række regnes fra målingens begyndelse (2/3-2026) eller brugerens oprettelse — og teksten siger det", () => {
    expect(LOGIN_LOG_FRA).toBe("2026-03-02");
    const gammel = doemStille(bw, [bruger({ oprettetAt: "2026-01-10T00:00:00Z" })], [], [], NU);
    expect(gammel).toMatchObject({ klokke: "ingen_login", maaltFra: true, sidenDag: "2026-03-02", dage: 202, trin: 3 });
    expect(stilleTekst(gammel, bw, [bruger()], null)!.title).toBe("Brick Works ApS: ingen login i 150 dage (siden målingen begyndte 2. marts 2026)");
    const ny = doemStille(bw, [bruger({ oprettetAt: "2026-05-01T00:00:00Z" })], [], [], NU);
    expect(ny).toMatchObject({ maaltFra: true, sidenDag: "2026-05-01", dage: 142, trin: 2 });
  });
  it("regel 8 (B4): i beslutningsvinduet ringer den stille uanset trin — og den aktive tier", () => {
    const db = k({ navn: "doggybed", periodeStart: "2025-10-13", periodeSlut: "2026-10-13", kontaktperson: "Dan Ejlersen" });
    expect(VINDUE_DAGE).toBe(60);
    const stille = doemStille(db, [bruger()], [login("2026-08-16T10:00:00Z")], [], NU);
    expect(stille).toMatchObject({ klokke: "ingen_login", trin: 4, dage: 35, dageTilSlut: 23, iVinduet: true });
    expect(doemStille(db, [bruger()], [login(dagFoer(100))], [], NU)).toMatchObject({ trin: 4 });
    expect(doemStille(db, [bruger()], [login(dagFoer(10))], [], NU)).toEqual({ klokke: "tavs", grund: "aktiv" });
    const t = stilleTekst(stille, db, [bruger()], 2_000_000)!;
    expect(t.title).toBe("doggybed: i beslutningsvinduet uden login siden 16. august 2026");
    expect(t.body).toBe("doggybed er i beslutningsvinduet og har ikke været inde siden 16. august 2026. Fornyelse 13. oktober 2026 til 20.000 kr. Beslut i dag: tilbyd, tilbyd ikke — eller ring til Dan Ejlersen først.");
    expect(stilleTekst(stille, db, [bruger()], null)!.body).toContain("Fornyelse 13. oktober 2026. Beslut");
  });
  it("teksterne pr. trin: hvem · hvor længe · hvad det koster · hvornår det afgøres · hvad du gør", () => {
    const b1 = stilleTekst(doemStille(bw, [bruger()], [login("2026-06-15T10:00:00Z")], [], NU), bw, [bruger()], null)!;
    expect(b1.body).toBe("Brick Works ApS har ikke logget ind i tre måneder og fornyer 7. april 2027 — vinduet åbner 6. februar 2027. Ring til Caspar Bennedsen, før de beslutter sig uden os.");
    const b2 = stilleTekst(doemStille(bw, [bruger()], [login("2026-04-28T10:00:00Z")], [], NU), bw, [bruger()], null)!;
    expect(b2.body).toBe("Brick Works ApS har ikke været inde i fire måneder — de betaler 42.000 kr. for noget, de ikke ser. Fornyelse 7. april 2027. Ring til Caspar Bennedsen.");
    const b3 = stilleTekst(doemStille(bw, [bruger()], [login(dagFoer(150))], [], NU), bw, [bruger()], null)!;
    expect(b3.body).toBe("Brick Works ApS har ikke logget ind i fem måneder og fornyer 7. april 2027. Træf fornyelsesbeslutningen nu — tilbyd eller tilbyd ikke — ikke i vinduet 6. februar 2027. Ring til Caspar Bennedsen først.");
  });
  it("kontakten: kontaktperson, ellers brugerens navn, ellers mailen — Capture IT har kun en mail", () => {
    const ci = k({ navn: "Capture IT A/S", periodeStart: "2026-08-25", periodeSlut: "2027-08-25", prisEksMomsOere: 2_000_000, kontaktperson: null, kontaktEmail: "ms@captureit.dk" });
    const dom = doemStille(ci, [bruger({ navn: null })], [login("2026-06-15T10:00:00Z")], [], NU);
    expect(stilleTekst(dom, ci, [bruger({ navn: null })], null)!.body).toContain("Ring til ms@captureit.dk, før");
    expect(stilleTekst(dom, ci, [bruger({ navn: "Morten" })], null)!.body).toContain("Ring til Morten, før");
  });
});

describe("stilleDom — dage og datoer (regel 10)", () => {
  it("hele UTC-kalenderdage, uanset klokkeslæt", () => {
    expect(dageMellem("2026-04-28", "2026-09-20T23:59:00Z")).toBe(145);
    expect(dageMellem("2026-04-28T23:00:00Z", "2026-09-20T00:01:00Z")).toBe(145);
    expect(danskDato("2027-04-07")).toBe("7. april 2027");
  });
});

describe("stilleDom — regel 12: ingen bruger er ikke en dødsdom (KJ AUTO fornyede uden)", () => {
  it("ingen A-tekst siger «for ingenting», «tabt», «dødsdom» eller «gået galt» — alle siger, hvad du gør", () => {
    for (const dage of [30, 60, 90, 120, 210]) {
      const nu = new Date(Date.UTC(2026, 0, 29) + dage * 86_400_000);
      const t = stilleTekst(doemStille(k(), [], [], [inv()], nu), k(), [], null)!;
      expect(t.body).not.toMatch(/for ingenting|tabt|dødsdom|gået galt/i);
      expect(t.body).toMatch(/ring til|send/i);
    }
  });
});
