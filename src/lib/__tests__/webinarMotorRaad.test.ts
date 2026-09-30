import { describe, expect, it } from "vitest";
import { laasDom, offentligLaasAaben, offentligTilmeldDom, OFFENTLIG_LAAS_NOEGLE, tilmeldDom } from "@/lib/webinarMotor/tilmelding";
import { bagLaasen, naesteSessioner } from "@/lib/webinarMotor/sessionplan";
import { HANDLING_LOFT_PR_TIME, HANDLING_LOFT_VINDUE_MS, handlingUnderLoft } from "@/lib/webinarMotor/puls";
import { SET_PROCENT_KILDE_MOTOR } from "@/lib/webinarMotor/fremmoede";
import * as webDash from "@/lib/webinar/dashboard";
import * as denoDash from "../../../supabase/functions/_shared/webinarDashboard.ts";
import * as denoTil from "../../../supabase/functions/_shared/webinarMotor/tilmelding.ts";
import * as denoPlan from "../../../supabase/functions/_shared/webinarMotor/sessionplan.ts";
import * as denoPuls from "../../../supabase/functions/_shared/webinarMotor/puls.ts";

/**
 * Det tekniske råds fund i webinarmotoren (30/9-2026, dom «RET FØRST») —
 * dommene. Kildeværnet med mutationer står i webinarMotorRaad.guard.test.ts.
 *
 *   1 (HØJ)    offentligTilmeldDom flytter ALDRIG; en anden session er en NY række.
 *   2 (MELLEM) enumeration: sessionens afvisninger før «kendt», for alle.
 *   3 (MELLEM) loftet pr. (tilmelding, time) på spørgsmål og reaktioner.
 *   4 (MELLEM) låsen webinarmotor_offentlig_aktiv (fail-closed).
 *   5 (MELLEM) /webinar-dommen tæller aldrig den interne prøvesession.
 *   8 (LAV)    ét navn for set_procent_kilde.
 */

const T0 = Date.parse("2026-10-01T09:00:00.000Z");
const DAG = 86_400_000;
const maal = { id: "S2", status: "planlagt", starterMs: T0 + 7 * DAG, slutMs: T0 + 7 * DAG + 5_400_000, kapacitet: null, tilmeldte: 0 };

describe("fund 1 — den offentlige tilmelding flytter aldrig", () => {
  it("mailen på en ANDEN, ikke-begyndt session → NY række (den token-beviste dom ville flytte)", () => {
    const andre = [{ id: "r1", sessionId: "S1", sessionStarterMs: T0 + DAG }];
    expect(offentligTilmeldDom("S2", andre, maal, T0)).toEqual({ art: "ny" });
    // Kontrast: gen_tilmeld (tokenet beviser personen) flytter stadig.
    expect(tilmeldDom("S2", andre, maal, T0)).toEqual({ art: "flyt", id: "r1", fraSessionId: "S1" });
  });
  it("samme session → «kendt» med rækkens id (rækken røres ikke)", () => {
    expect(offentligTilmeldDom("S2", [{ id: "r1", sessionId: "S2", sessionStarterMs: maal.starterMs }], maal, T0)).toEqual({ art: "kendt", id: "r1" });
  });
  it("dommen kan aldrig svare «flyt» — prøvet over alle kombinationer", () => {
    const eks = [[], [{ id: "a", sessionId: "S1", sessionStarterMs: T0 + DAG }], [{ id: "b", sessionId: "S2", sessionStarterMs: maal.starterMs }], [{ id: "c", sessionId: null, sessionStarterMs: null }]];
    const statusser = ["planlagt", "aaben", "aflyst", "afholdt"];
    for (const e of eks) for (const st of statusser) for (const nu of [T0, maal.slutMs + 1]) {
      const art = offentligTilmeldDom("S2", e, { ...maal, status: st }, nu).art;
      expect(["ny", "kendt", "afvis"]).toContain(art);
    }
  });
  it("paritet: Deno-spejlet svarer ens", () => {
    const e = [{ id: "r1", sessionId: "S1", sessionStarterMs: T0 + DAG }];
    expect(denoTil.offentligTilmeldDom("S2", e, maal, T0)).toEqual(offentligTilmeldDom("S2", e, maal, T0));
  });
});

describe("fund 2 — ingen orakel for «er X tilmeldt»", () => {
  const kendt = [{ id: "r1", sessionId: "S2", sessionStarterMs: maal.starterMs }];
  it("en afholdt session svarer «forbi» for en kendt mail præcis som for en ukendt", () => {
    const efter = maal.slutMs + 1;
    expect(offentligTilmeldDom("S2", kendt, { ...maal, status: "afholdt" }, efter)).toEqual(offentligTilmeldDom("S2", [], { ...maal, status: "afholdt" }, efter));
    expect(offentligTilmeldDom("S2", kendt, maal, efter)).toEqual({ art: "afvis", grund: "forbi" });
  });
  it("aflyst og fuld: samme svar for kendt og ukendt", () => {
    expect(offentligTilmeldDom("S2", kendt, { ...maal, status: "aflyst" }, T0)).toEqual({ art: "afvis", grund: "aflyst" });
    expect(offentligTilmeldDom("S2", kendt, { ...maal, kapacitet: 2, tilmeldte: 2 }, T0)).toEqual({ art: "afvis", grund: "fuld" });
    expect(offentligTilmeldDom("S2", [], { ...maal, kapacitet: 2, tilmeldte: 2 }, T0)).toEqual({ art: "afvis", grund: "fuld" });
  });
  it("låsen dømmes ens for kendt og ukendt — den får hverken mail eller rækker", () => {
    expect(laasDom(false, false)).toEqual({ ok: false, grund: "ikke_aaben" });
  });
});

describe("fund 3 — loftet pr. (tilmelding, time)", () => {
  it("tallene og vinduet", () => {
    expect(HANDLING_LOFT_PR_TIME).toEqual({ spoergsmaal: 10, reaktion: 120 });
    expect(HANDLING_LOFT_VINDUE_MS).toBe(3_600_000);
  });
  it("den 10. spørgsmål går igennem, den 11. ikke; 120 reaktioner, ikke 121", () => {
    expect(handlingUnderLoft("spoergsmaal", 9)).toBe(true);
    expect(handlingUnderLoft("spoergsmaal", 10)).toBe(false);
    expect(handlingUnderLoft("reaktion", 119)).toBe(true);
    expect(handlingUnderLoft("reaktion", 120)).toBe(false);
  });
  it("et tal, der ikke kan stoles på, er et nej (fail-closed)", () => {
    for (const n of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(handlingUnderLoft("spoergsmaal", n)).toBe(false);
  });
  it("et helt kald med 10 spørgsmål over 5 tidligere: 5 går igennem (tælleren lægges til i kaldet)", () => {
    let talt = 5, ok = 0;
    for (let i = 0; i < 10; i++) if (handlingUnderLoft("spoergsmaal", talt)) { ok++; talt++; }
    expect(ok).toBe(5);
  });
  it("paritet", () => {
    for (const n of [0, 9, 10, 119, 120, -1]) {
      expect(denoPuls.handlingUnderLoft("spoergsmaal", n)).toBe(handlingUnderLoft("spoergsmaal", n));
      expect(denoPuls.handlingUnderLoft("reaktion", n)).toBe(handlingUnderLoft("reaktion", n));
    }
  });
});

describe("fund 4 — låsen foran de offentlige sessioner", () => {
  it("nøglen", () => expect(OFFENTLIG_LAAS_NOEGLE).toBe("webinarmotor_offentlig_aktiv"));
  it("kun true eller \"true\" åbner; fraværende, null og alt andet er lukket", () => {
    expect(offentligLaasAaben(true)).toBe(true);
    expect(offentligLaasAaben("true")).toBe(true);
    for (const v of [undefined, null, false, "false", "ja", 1, "TRUE", {}, []]) expect(offentligLaasAaben(v)).toBe(false);
  });
  it("laasDom: intern altid; offentlig kun med åben lås", () => {
    expect(laasDom(true, false)).toEqual({ ok: true });
    expect(laasDom(false, true)).toEqual({ ok: true });
    expect(laasDom(false, false)).toEqual({ ok: false, grund: "ikke_aaben" });
  });
  const s = (id: string, min: number, intern = false) => ({ id, starterMs: T0 + min * 60_000, status: "planlagt", type: "Scheduled", kapacitet: null, tilmeldte: null, intern });
  const liste = [s("o1", 100), s("i1", 200, true), s("o2", 300)];
  it("bagLaasen: lukket → kun interne; åben → alle", () => {
    expect(bagLaasen(liste, false).map((x) => x.id)).toEqual(["i1"]);
    expect(bagLaasen(liste, true).map((x) => x.id)).toEqual(["o1", "i1", "o2"]);
  });
  it("den offentlige liste er TOM med lukket lås — også for husets egne ser de kun den interne", () => {
    expect(naesteSessioner(bagLaasen(liste, false), T0)).toEqual([]);
    expect(naesteSessioner(bagLaasen(liste, false), T0, 3, true).map((x) => x.id)).toEqual(["i1"]);
    expect(naesteSessioner(bagLaasen(liste, true), T0).map((x) => x.id)).toEqual(["o1", "o2"]);
  });
  it("paritet", () => {
    expect(denoPlan.bagLaasen(liste, false)).toEqual(bagLaasen(liste, false));
    expect(denoTil.laasDom(false, false)).toEqual(laasDom(false, false));
    expect(denoTil.offentligLaasAaben("true")).toBe(true);
  });
});

describe("fund 5 — /webinar og delingen tæller aldrig den interne prøvesession", () => {
  const NU = new Date("2026-10-20T08:00:00.000Z");
  const T = "2026-10-13T09:00:00.000Z";
  const R = (email: string, ekstra: Partial<webDash.Tilmelding> = {}): webDash.Tilmelding => ({
    ewebinar_id: `id-${email}`, email, navn: "X", webinar_id: "w1", webinar_titel: "Titel", session_tid: T, session_type: "Scheduled",
    registreret_at: "2026-10-01T09:00:00.000Z", state: "Watched", sidste_action: null, attended: "true", subscribed: null, set_procent: 80, set_procent_kilde: "watchedPercentage",
    utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null, fbclid: null, origin: null, first_origin: null, referrer: null, first_referrer: null,
    widget_source: null, by: null, land: null, enhed: null, tidszone: null, ad_id_udledt: null, join_link: null, kalender_link: null, replay_link: null,
    ...ekstra,
  });
  const rigtige = [R("anna@firma.dk"), R("bo@firma.dk", { set_procent: 20 }), R("p@firma.dk", { ewebinar_id: "P-1" })];
  const interne = [R("jonas@topix.dk", { ewebinar_id: "P-2", intern: "true" }), R("morten@topix.dk", { ewebinar_id: "P-3", intern: true })];
  const ind = (t: webDash.Tilmelding[]) => ({ tilmeldinger: t, ansoegninger: [], sporKolonnerFindes: false });

  it("erInternTilmelding: kun mærket afgør — en platform-række uden mærke tæller", () => {
    expect(webDash.erInternTilmelding({ intern: "true" })).toBe(true);
    expect(webDash.erInternTilmelding({ intern: true })).toBe(true);
    for (const v of [undefined, null, "false", false, "ja"]) expect(webDash.erInternTilmelding({ intern: v as never })).toBe(false);
  });
  it("dommen med interne rækker = dommen uden dem", () => {
    const med = webDash.webinarDashboard(ind([...rigtige, ...interne]), NU);
    const uden = webDash.webinarDashboard(ind(rigtige), NU);
    expect(med).toEqual(uden);
    expect(med.personer).toBe(3);
  });
  it("kun interne rækker = en TOM side, ikke en session med to", () => {
    const d = webDash.webinarDashboard(ind(interne), NU);
    expect(d.tom).toBe(true);
    expect(d.personer).toBe(0);
    expect(d.afholdte).toEqual([]);
  });
  it("paritet: Deno-spejlet (delingen) svarer ens — også på de interne", () => {
    const i = ind([...rigtige, ...interne]);
    expect(denoDash.webinarDashboard(i, NU)).toEqual(webDash.webinarDashboard(i, NU));
    expect(denoDash.erInternTilmelding({ intern: "true" })).toBe(true);
  });
});

describe("fund 8 — ét navn for set_procent_kilde", () => {
  it("motorens kilde er bitmappen, ikke en version", () => {
    expect(SET_PROCENT_KILDE_MOTOR).toBe("boardroom-bitmap");
    expect(SET_PROCENT_KILDE_MOTOR).not.toMatch(/boardroom-\d/);
  });
});
