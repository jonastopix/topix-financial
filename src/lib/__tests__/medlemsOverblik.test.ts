import { describe, expect, it } from "vitest";
import {
  AKTIVITET_VINDUE_DAGE,
  AKTIVITETS_FELTER,
  aktivitetAf,
  aktiviteterAf,
  erNytMedlem,
  harMaerke,
  IKKE_OMFATTET_FRA,
  MAERKE_VAEGT,
  overbliksDom,
  sammenlignOverblik,
  sessionStatus,
  TRAENGER_GODKENDT_DAGE,
  TRAENGER_LOGIN_DAGE,
  type AktivitetsInput,
  type SessionDom,
  type SessionRaekke,
} from "@/lib/medlemsOverblik";
import { STILSTAND_LAENGE_DAGE } from "@/lib/forsidensDom";
import { NY_TIL_DAGE, TRIN_1_DAGE } from "@/lib/ikkeIGang";

/**
 * Medlemsoverblikket (29/9-2026) — motoren. Sessionsgrenene (inkl. de to
 * «uden række»-tilfælde), aktivitetsvinduet fra begge sider, og dommen.
 */

const NU = new Date("2026-09-29T10:00:00Z");
const MS_DAG = 86_400_000;
const dageFoer = (n: number, fra = NU) => new Date(fra.getTime() - n * MS_DAG).toISOString();
const raekke = (status: string, start: string | null = null, slut: string | null = null, created = dageFoer(3)): SessionRaekke => ({ status, start_tid: start, slut_tid: slut, created_at: created });

describe("sessionStatus — hver gren", () => {
  it("ret null → ikke_brugt, også når en gammel aflyst række findes (host-aflysning har genåbnet retten)", () => {
    expect(sessionStatus({ raadgiver: "morten", retAt: null, raekker: [], nu: NU })).toEqual({ raadgiver: "morten", retAt: null, tid: null, status: "ikke_brugt" });
    expect(sessionStatus({ raadgiver: "morten", retAt: undefined, raekker: [raekke("cancelled")], nu: NU }).status).toBe("ikke_brugt");
  });

  it("booking_sent → link_sendt", () => {
    expect(sessionStatus({ raadgiver: "morten", retAt: dageFoer(3), raekker: [raekke("booking_sent")], nu: NU }).status).toBe("link_sendt");
  });

  it("booked med slut i fremtiden → booket, med tid; booked uden tid → booket med tid null", () => {
    const d = sessionStatus({ raadgiver: "jonas", retAt: dageFoer(3), raekker: [raekke("booked", "2026-10-02T09:00:00Z", "2026-10-02T09:30:00Z")], nu: NU });
    expect(d).toEqual({ raadgiver: "jonas", retAt: dageFoer(3), status: "booket", tid: { start: "2026-10-02T09:00:00Z", slut: "2026-10-02T09:30:00Z" } });
    expect(sessionStatus({ raadgiver: "jonas", retAt: dageFoer(3), raekker: [raekke("booked")], nu: NU })).toMatchObject({ status: "booket", tid: null });
  });

  it("booked med slut passeret → afholdt (UDLEDT — introSession.erAfholdt); præcis nu er afholdt, et sekund før er booket", () => {
    expect(sessionStatus({ raadgiver: "morten", retAt: dageFoer(10), raekker: [raekke("booked", dageFoer(2), dageFoer(2))], nu: NU }).status).toBe("afholdt");
    expect(sessionStatus({ raadgiver: "morten", retAt: dageFoer(10), raekker: [raekke("booked", null, NU.toISOString())], nu: NU }).status).toBe("afholdt");
    expect(sessionStatus({ raadgiver: "morten", retAt: dageFoer(10), raekker: [raekke("booked", null, new Date(NU.getTime() + 1000).toISOString())], nu: NU }).status).toBe("booket");
  });

  it("cancelled med retten stadig sat → aflyst (invitee-aflysning: retten forbliver brugt)", () => {
    expect(sessionStatus({ raadgiver: "morten", retAt: dageFoer(10), raekker: [raekke("cancelled", dageFoer(1), dageFoer(1))], nu: NU })).toMatchObject({ status: "aflyst", tid: { start: dageFoer(1) } });
  });

  it("UDEN RÆKKE 1: Mortens ret sat uden række → markeret_uden_booking — uanset dato (årsagen er ikke målt)", () => {
    expect(sessionStatus({ raadgiver: "morten", retAt: "2026-07-01T10:00:00Z", raekker: [], nu: NU }).status).toBe("markeret_uden_booking");
    expect(sessionStatus({ raadgiver: "morten", retAt: "2026-09-20T10:00:00Z", raekker: [], nu: NU }).status).toBe("markeret_uden_booking");
  });

  it("UDEN RÆKKE 2: Jonas' ret sat FØR 14/9-2026 uden række → ikke_omfattet (de 23 fra 13/9 20:50–20:54 UTC); fra 14/9 → markeret_uden_booking", () => {
    expect(IKKE_OMFATTET_FRA).toBe("2026-09-14T00:00:00Z");
    expect(sessionStatus({ raadgiver: "jonas", retAt: "2026-09-13T20:52:00Z", raekker: [], nu: NU }).status).toBe("ikke_omfattet");
    expect(sessionStatus({ raadgiver: "jonas", retAt: "2026-09-13T23:59:59Z", raekker: [], nu: NU }).status).toBe("ikke_omfattet");
    expect(sessionStatus({ raadgiver: "jonas", retAt: "2026-09-14T00:00:00Z", raekker: [], nu: NU }).status).toBe("markeret_uden_booking");
    // En ulæselig ret-dato er ikke «før» — fail-closed til markeret_uden_booking.
    expect(sessionStatus({ raadgiver: "jonas", retAt: "ikke en tid", raekker: [], nu: NU }).status).toBe("markeret_uden_booking");
  });

  it("den NYESTE kendte række vinder; pending/paid/refunded tæller ikke som en inkluderet række", () => {
    const gammel = raekke("cancelled", null, null, dageFoer(30));
    const ny = raekke("booking_sent", null, null, dageFoer(2));
    expect(sessionStatus({ raadgiver: "morten", retAt: dageFoer(2), raekker: [gammel, ny], nu: NU }).status).toBe("link_sendt");
    expect(sessionStatus({ raadgiver: "morten", retAt: dageFoer(2), raekker: [ny, gammel], nu: NU }).status).toBe("link_sendt");
    expect(sessionStatus({ raadgiver: "jonas", retAt: "2026-09-20T10:00:00Z", raekker: [raekke("pending")], nu: NU }).status).toBe("markeret_uden_booking");
  });
});

describe("aktivitet — vinduet på 30 dage, fra begge sider", () => {
  it("tomt → intet; 29 dage er inde, 30 dage er ude; det seneste stempel vinder uanset rækkefølge", () => {
    expect(AKTIVITET_VINDUE_DAGE).toBe(30);
    expect(aktivitetAf([], NU)).toEqual({ sidst: null, dage: null, iVinduet: false });
    expect(aktivitetAf([dageFoer(29)], NU)).toEqual({ sidst: dageFoer(29), dage: 29, iVinduet: true });
    expect(aktivitetAf([dageFoer(30)], NU)).toEqual({ sidst: dageFoer(30), dage: 30, iVinduet: false });
    expect(aktivitetAf([dageFoer(45), dageFoer(2), dageFoer(90)], NU)).toMatchObject({ sidst: dageFoer(2), dage: 2, iVinduet: true });
    // Ulæselige stempler springes over; et stempel i fremtiden er «i dag».
    expect(aktivitetAf(["x", dageFoer(5)], NU).dage).toBe(5);
    expect(aktivitetAf([dageFoer(-1)], NU).dage).toBe(0);
  });

  it("aktiviteterAf giver alle ni felter — også dem, kalderen ikke gav", () => {
    const input = { login: [dageFoer(1)], godkendt_rapport: [dageFoer(40)] } as unknown as AktivitetsInput;
    const a = aktiviteterAf(input, NU);
    expect(Object.keys(a).sort()).toEqual([...AKTIVITETS_FELTER].sort());
    expect(a.login.iVinduet).toBe(true);
    expect(a.godkendt_rapport).toMatchObject({ dage: 40, iVinduet: false });
    // handouts er IKKE et felt (0/27 i nulpunktet, og pr. bruger — ikke virksomhed).
    expect("handouts" in a).toBe(false);
    for (const f of ["uploadet_rapport", "refleksion", "medlemsbesked", "event_tilmelding", "akademi", "community", "maal"] as const) expect(a[f], f).toEqual({ sidst: null, dage: null, iVinduet: false });
  });
});

describe("overbliksDom — mærkerne og tærsklerne", () => {
  const session = (raadgiver: "morten" | "jonas", status: SessionDom["status"]): SessionDom => ({ raadgiver, status, tid: null, retAt: status === "ikke_brugt" ? null : dageFoer(5) });
  const aktiv = (login: number | null, godkendt: number | null) =>
    aktiviteterAf({
      login: login === null ? [] : [dageFoer(login)],
      godkendt_rapport: godkendt === null ? [] : [dageFoer(godkendt)],
      uploadet_rapport: [], refleksion: [], medlemsbesked: [], event_tilmelding: [], akademi: [], community: [], maal: [],
    }, NU);
  const bas = {
    nu: NU, antalBrugere: 2, medlemSiden: dageFoer(200),
    sessioner: { morten: session("morten", "afholdt"), jonas: session("jonas", "ikke_omfattet") },
    aktivitet: aktiv(3, 10), harMaaltRapport: true, antalUploads: 4,
  };

  it("tærsklerne: login 30 (aktivitetsvinduet), godkendt 60 (= forsidensDom.STILSTAND_LAENGE_DAGE)", () => {
    expect(TRAENGER_LOGIN_DAGE).toBe(30);
    expect(TRAENGER_GODKENDT_DAGE).toBe(60);
    expect(TRAENGER_GODKENDT_DAGE).toBe(STILSTAND_LAENGE_DAGE);
  });

  it("en aktiv virksomhed med afholdt Morten-session og ikke-omfattet Jonas-session: ingen mærker, vægt 0", () => {
    expect(overbliksDom(bas)).toEqual({ maerker: [], vaegt: 0 });
  });

  it("«trænger»: ingen login i 30 dage (dag 29 ikke, dag 30 ja) — kun når virksomheden har brugere", () => {
    expect(overbliksDom({ ...bas, aktivitet: aktiv(29, 10) }).maerker).toEqual([]);
    expect(overbliksDom({ ...bas, aktivitet: aktiv(30, 10) }).maerker).toEqual(["ingen_login", "traenger"]);
    expect(overbliksDom({ ...bas, aktivitet: aktiv(null, 10) }).maerker).toEqual(["ingen_login", "traenger"]);
    // Uden brugere er «ingen login» ikke et mærke — det er ingen_bruger.
    expect(overbliksDom({ ...bas, antalBrugere: 0, aktivitet: aktiv(null, 10) }).maerker).toEqual(["ingen_bruger"]);
  });

  it("«trænger»: ingen godkendt rapport i 60 dage (dag 59 ikke, dag 60 ja, aldrig ja)", () => {
    expect(overbliksDom({ ...bas, aktivitet: aktiv(3, 59) }).maerker).toEqual([]);
    expect(overbliksDom({ ...bas, aktivitet: aktiv(3, 60) }).maerker).toEqual(["ingen_godkendt_rapport", "traenger"]);
    expect(overbliksDom({ ...bas, aktivitet: aktiv(3, null) }).maerker).toEqual(["ingen_godkendt_rapport", "traenger"]);
    expect(overbliksDom({ ...bas, aktivitet: aktiv(31, 61) }).maerker).toEqual(["ingen_login", "ingen_godkendt_rapport", "traenger"]);
  });

  it("«ingen session endnu»: Morten ikke_brugt eller link_sendt; Jonas ikke_brugt KUN for et nyt medlem (fra 14/9)", () => {
    expect(overbliksDom({ ...bas, sessioner: { morten: session("morten", "ikke_brugt"), jonas: session("jonas", "ikke_omfattet") } }).maerker).toEqual(["ingen_session_endnu"]);
    expect(overbliksDom({ ...bas, sessioner: { morten: session("morten", "link_sendt"), jonas: session("jonas", "ikke_omfattet") } }).maerker).toEqual(["ingen_session_endnu"]);
    for (const s of ["booket", "afholdt", "aflyst", "markeret_uden_booking"] as const) {
      expect(overbliksDom({ ...bas, sessioner: { morten: session("morten", s), jonas: session("jonas", "ikke_omfattet") } }).maerker, s).toEqual([]);
    }
    // Jonas ikke_brugt: gammelt medlem → intet; nyt medlem → mærke.
    const jonasFri = { morten: session("morten", "afholdt"), jonas: session("jonas", "ikke_brugt") };
    expect(overbliksDom({ ...bas, sessioner: jonasFri }).maerker).toEqual([]);
    expect(overbliksDom({ ...bas, sessioner: jonasFri, medlemSiden: "2026-09-20T10:00:00Z", harMaaltRapport: true }).maerker).toEqual(["ingen_session_endnu"]);
    expect(erNytMedlem("2026-09-14T00:00:00Z")).toBe(true);
    expect(erNytMedlem("2026-09-13T23:59:59Z")).toBe(false);
    expect(erNytMedlem(null)).toBe(false);
  });

  it("«ikke i gang» kommer fra husets ikkeIGang: nyt medlem uden målt rapport, dag 7–90", () => {
    const ny = { ...bas, harMaaltRapport: false, antalUploads: 0, aktivitet: aktiv(1, null) };
    expect(overbliksDom({ ...ny, medlemSiden: dageFoer(TRIN_1_DAGE - 1) }).maerker).toEqual(["ingen_godkendt_rapport", "traenger"]);
    expect(overbliksDom({ ...ny, medlemSiden: dageFoer(TRIN_1_DAGE) }).maerker).toEqual(["ingen_godkendt_rapport", "traenger", "ikke_i_gang"]);
    expect(overbliksDom({ ...ny, medlemSiden: dageFoer(NY_TIL_DAGE + 1) }).maerker).toEqual(["ingen_godkendt_rapport", "traenger"]);
  });

  it("vægt og sortering: tungest først, derefter navn; filtre spørger harMaerke", () => {
    const a = overbliksDom({ ...bas, antalBrugere: 0, aktivitet: aktiv(null, null) });
    const b = overbliksDom({ ...bas, aktivitet: aktiv(45, 10) });
    const c = overbliksDom(bas);
    expect(a.vaegt).toBe(MAERKE_VAEGT.ingen_bruger + MAERKE_VAEGT.ingen_godkendt_rapport + MAERKE_VAEGT.traenger);
    expect(b.vaegt).toBe(MAERKE_VAEGT.ingen_login + MAERKE_VAEGT.traenger);
    expect(harMaerke(b, "traenger")).toBe(true);
    expect(harMaerke(c, "traenger")).toBe(false);
    const liste = [{ dom: c, navn: "Ceres" }, { dom: b, navn: "Bogense" }, { dom: a, navn: "Aarhus" }, { dom: c, navn: "Aabenraa" }].sort(sammenlignOverblik);
    // Dansk sortering: «Aa» er Å og står EFTER Z — Aabenraa efter Ceres ved lige vægt.
    expect(liste.map((x) => x.navn)).toEqual(["Aarhus", "Bogense", "Ceres", "Aabenraa"]);
  });
});
