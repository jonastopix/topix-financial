import { describe, expect, it } from "vitest";
import {
  AFHOLDT_TITLE, datoOrd, FELT_ORD, FILTER_MAERKER, laesMaerkeParam, MAERKE_ORD, MAERKE_PARAM, maerkeOverskrift, prikTitle, sessionOrd, sidstTekst, tomMaerkeTekst,
} from "@/lib/hjemmebane/overblikOrd";
import { AKTIVITETS_FELTER, type SessionDom } from "@/lib/medlemsOverblik";

const dom = (status: SessionDom["status"], start: string | null = null): SessionDom => ({ raadgiver: "morten", status, retAt: null, tid: start ? { start, slut: start } : null });

describe("overblikOrd — sessionerne i klare ord", () => {
  it("de syv tilstande", () => {
    expect(sessionOrd(dom("ikke_brugt"))).toEqual({ tekst: "Ikke booket", title: null });
    expect(sessionOrd(dom("link_sendt"))).toEqual({ tekst: "Link sendt", title: null });
    expect(sessionOrd(dom("booket", "2026-10-02T09:00:00Z"))).toEqual({ tekst: "Booket 2/10", title: null });
    expect(sessionOrd(dom("booket"))).toEqual({ tekst: "Booket", title: "tidspunktet er ikke registreret" });
    expect(sessionOrd(dom("afholdt", "2026-09-15T09:00:00Z"))).toEqual({ tekst: "Afholdt 15/9", title: AFHOLDT_TITLE });
    expect(sessionOrd(dom("afholdt")).title).toBe("udledt: sessionen var booket, og tiden er passeret");
    expect(sessionOrd(dom("aflyst")).tekst).toBe("Aflyst");
    expect(sessionOrd(dom("markeret_uden_booking")).tekst).toBe("Markeret (ingen booking)");
    expect(sessionOrd(dom("ikke_omfattet")).tekst).toBe("Ikke omfattet");
  });
});

describe("overblikOrd — filtret i URL'en", () => {
  it("kun de fire filtre læses; alt andet er null", () => {
    expect(MAERKE_PARAM).toBe("maerke");
    expect([...FILTER_MAERKER]).toEqual(["traenger", "ingen_session_endnu", "ikke_i_gang", "ingen_bruger"]);
    for (const m of FILTER_MAERKER) expect(laesMaerkeParam(m)).toBe(m);
    expect(laesMaerkeParam("ingen_login")).toBeNull();
    expect(laesMaerkeParam("x")).toBeNull();
    expect(laesMaerkeParam(null)).toBeNull();
  });
  it("overskrift og tom linje", () => {
    expect(maerkeOverskrift("traenger", 4)).toBe("Trænger · 4 virksomheder");
    expect(maerkeOverskrift("ingen_bruger", 1)).toBe("Ingen bruger · 1 virksomhed");
    expect(tomMaerkeTekst("ikke_i_gang")).toBe("Ingen virksomheder under «Ikke i gang» lige nu.");
    expect(MAERKE_ORD.ingen_session_endnu).toBe("Ingen session endnu");
  });
});

describe("overblikOrd — aktivitetens ord", () => {
  it("alle ni felter har et ord, og prikkens title er «<felt>: <dato>»", () => {
    for (const f of AKTIVITETS_FELTER) expect(FELT_ORD[f], f).toBeTruthy();
    expect(prikTitle("login", { sidst: "2026-09-12T08:00:00Z", dage: 17, iVinduet: true })).toBe("Login: 12. sep.");
    expect(prikTitle("maal", { sidst: "2026-07-01T08:00:00Z", dage: 90, iVinduet: false })).toBe("Mål rørt: 1. jul. (over 30 dage)");
    expect(prikTitle("community", { sidst: null, dage: null, iVinduet: false })).toBe("Community: ingen");
  });
  it("kolonnerne: dato, eller de rolige ord for aldrig", () => {
    expect(datoOrd("2026-12-24T20:00:00Z")).toBe("24. dec.");
    expect(datoOrd("x")).toBeNull();
    expect(sidstTekst("logget ind", { sidst: "2026-09-12T08:00:00Z", dage: 17, iVinduet: true })).toBe("12. sep.");
    expect(sidstTekst("logget ind", { sidst: null, dage: null, iVinduet: false })).toBe("Aldrig logget ind");
    expect(sidstTekst("godkendt rapport", { sidst: null, dage: null, iVinduet: false })).toBe("Ingen godkendt rapport");
  });
});
