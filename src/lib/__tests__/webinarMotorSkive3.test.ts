import { describe, expect, it } from "vitest";
import {
  budgetTilladerFremmoede,
  efterRettelse,
  FREMMOEDE_MARGIN_MS,
  fremmoedeDom,
  fremmoedeRettelse,
  PULS_OPBEVARING_DAGE,
  pulsGraenseMs,
  SENESTE_START_MS,
  sessionForGammel,
  sessionKlarTilDom,
} from "@/lib/webinarMotor/fremmoede";
import { erMotorId, mailVejDom, type MotorOpslag, motorTilmeldingId, tomtMotorMailTal } from "@/lib/webinarMotor/mail";
import { erInternAdresse, internDom, platformEwebinarId } from "@/lib/webinarMotor/tilmelding";
import { naesteSessioner } from "@/lib/webinarMotor/sessionplan";
import { APP_URL, byggDeltagertoken, kalenderSti, laesDeltagertoken, rumSti, tilmeldSti } from "@/lib/webinarMotor/token";
import { bygIcs, icsBeskrivelse } from "@/lib/webinarMotor/ics";
import { sessionTider } from "@/lib/webinarMotor/ur";
import { doemSetGrad } from "@/lib/webinarDom";
import { afgoerOvergang } from "../../../supabase/functions/_shared/webinarHaendelser.ts";
import {
  kanUdgive,
  kopierTilKladde,
  laesInteraktionForm,
  laesSessionForm,
  laesTidskode,
  laesWebinarForm,
  slugFraTitel,
  tidskode,
  versioner,
} from "@/lib/webinarMotorAdmin/opsaetning";

/**
 * Webinarmotoren skive 3 (30/9-2026): fremmødet fra bitmappen, mailvejen,
 * den interne prøvesession og rådgiverens opsætning — de rene domme.
 */

const ID = "11111111-2222-4333-8444-555555555555";
const SESSION_TID = "2026-10-13T09:00:00Z";
const EFTER = new Date("2026-10-13T11:00:00Z");

describe("fremmødet — eWebinars ord, så doemSetGrad og Klaviyo læser motoren uændret", () => {
  const reg = { state: "Registered", sidste_action: "Registered", set_procent: null };

  it("set 82 % → Watched · WatchedWebinar · 82, og graden er «set»", () => {
    const f = fremmoedeDom({ foerste_ind_at: "2026-10-13T09:01:00Z", set_procent: 82 }, { ...reg, state: "Joined" });
    expect(f).toEqual({ state: "Watched", sidste_action: "WatchedWebinar", set_procent: 82 });
    expect(doemSetGrad({ set_procent: f.set_procent, state: f.state, session_tid: SESSION_TID }, EFTER)).toBe("set");
  });
  it("set 20 % → Watched, men graden er «delvist» (tallet afgør, ikke ordet)", () => {
    const f = fremmoedeDom({ foerste_ind_at: "x", set_procent: "20.00" }, reg);
    expect(doemSetGrad({ set_procent: f.set_procent, state: f.state, session_tid: SESSION_TID }, EFTER)).toBe("delvist");
  });
  it("aldrig Watched uden en procent over nul: gik ind, intet set → Joined · Left → «delvist»", () => {
    const f = fremmoedeDom({ foerste_ind_at: "x", set_procent: 0 }, reg);
    expect(f).toEqual({ state: "Joined", sidste_action: "Left", set_procent: 0 });
    expect(doemSetGrad({ set_procent: 0, state: f.state, session_tid: SESSION_TID }, EFTER)).toBe("delvist");
  });
  it("kun lobbyen eller slet ikke → Missed · MissedWebinar → «moedte_ikke» efter sessionen", () => {
    expect(fremmoedeDom({ foerste_ind_at: null, set_procent: 0 }, reg)).toEqual({ state: "Missed", sidste_action: "MissedWebinar", set_procent: 0 });
    const f = fremmoedeDom(null, reg);
    expect(f).toEqual({ state: "Missed", sidste_action: "MissedWebinar", set_procent: null });
    expect(doemSetGrad({ set_procent: null, state: f.state, session_tid: SESSION_TID }, EFTER)).toBe("moedte_ikke");
  });
  it("procenten er den højeste af tilmeldingens og deltagelsens (pulsen skriver kun ved hele procentpoint)", () => {
    expect(fremmoedeDom({ foerste_ind_at: "x", set_procent: 74.6 }, { ...reg, set_procent: 74 }).set_procent).toBe(74.6);
    expect(fremmoedeDom({ foerste_ind_at: "x", set_procent: 10 }, { ...reg, set_procent: 12 }).set_procent).toBe(12);
  });

  it("rettelsen går kun frem: state i rang, procent op, og aldrig over en afmelding", () => {
    expect(fremmoedeRettelse(reg, { state: "Missed", sidste_action: "MissedWebinar", set_procent: null })).toEqual({ state: "Missed", sidste_action: "MissedWebinar" });
    expect(fremmoedeRettelse({ state: "Watched", sidste_action: "WatchedWebinar", set_procent: 90 }, { state: "Watched", sidste_action: "WatchedWebinar", set_procent: 90 })).toBeNull();
    expect(fremmoedeRettelse({ state: "Joined", sidste_action: "Joined", set_procent: 40 }, { state: "Missed", sidste_action: "MissedWebinar", set_procent: 0 })).toBeNull();
    expect(fremmoedeRettelse({ state: "Watched", sidste_action: "WatchedWebinar", set_procent: 50 }, { state: "Watched", sidste_action: "WatchedWebinar", set_procent: 50.4 })).toEqual({ set_procent: 50.4 });
    // «Unsubscribed» er afmeldingens port for Klaviyo — den overskrives aldrig.
    expect(fremmoedeRettelse({ state: "Joined", sidste_action: "Unsubscribed", set_procent: 10 }, { state: "Watched", sidste_action: "WatchedWebinar", set_procent: 80 })).toEqual({ state: "Watched", set_procent: 80 });
    expect(efterRettelse(reg, { state: "Missed" })).toEqual({ ...reg, state: "Missed" });
  });

  it("overgangen for Klaviyo: første dom fra intet → deltog / moedte_ikke; delvist → set igen; samme grad → intet", () => {
    expect(afgoerOvergang(null, "set")).toBe("deltog");
    expect(afgoerOvergang(null, "moedte_ikke")).toBe("moedte_ikke");
    expect(afgoerOvergang("delvist", "set")).toBe("deltog");
    expect(afgoerOvergang("set", "set")).toBe("ingen");
  });

  it("sessionen dømmes først exitrummets slut + 5 min — og ikke efter vinduet", () => {
    const tider = sessionTider({ starterMs: Date.parse(SESSION_TID), varighedSek: 3600, introSek: 0, lobbyMin: 15, exitrumMin: 15 });
    expect(sessionKlarTilDom(tider.exitrumSlutMs, tider.exitrumSlutMs + FREMMOEDE_MARGIN_MS - 1)).toBe(false);
    expect(sessionKlarTilDom(tider.exitrumSlutMs, tider.exitrumSlutMs + FREMMOEDE_MARGIN_MS)).toBe(true);
    expect(sessionKlarTilDom(NaN, 0)).toBe(false);
    expect(sessionForGammel(0, 7 * 86_400_000)).toBe(false);
    expect(sessionForGammel(0, 7 * 86_400_000 + 1)).toBe(true);
  });

  it("opbevaringen: 90 dage, grænsen regnet på den tid, der gives ind", () => {
    expect(PULS_OPBEVARING_DAGE).toBe(90);
    expect(pulsGraenseMs(Date.parse("2027-01-01T00:00:00Z"))).toBe(Date.parse("2026-10-03T00:00:00Z"));
  });

  it("budgettet: 60 000 − 5 000 − (5 000 + 3 000 + 5 000) = 42 000 ms", () => {
    expect(SENESTE_START_MS).toBe(42_000);
    expect(budgetTilladerFremmoede(42_000)).toBe(true);
    expect(budgetTilladerFremmoede(42_001)).toBe(false);
  });
});

describe("mailvejen — eWebinars rækker uændret, motorens får rum-link og egen .ics", () => {
  const o: MotorOpslag = { tilmeldingId: ID, kildeSystem: "platform", tokenVersion: 2, email: "anne@topix.dk", slug: "raad", titel: "Økonomi", vaertNavn: "Morten Larsen", starterMs: Date.parse(SESSION_TID), slutMs: Date.parse(SESSION_TID) + 3_600_000, icsSekvens: 0, sessionStatus: "planlagt" };

  it("et eWebinar-id er eWebinars vej — også uden opslag og uden secret", () => {
    expect(mailVejDom("2Gk9aZ", undefined, false)).toEqual({ vej: "ewebinar" });
    expect(mailVejDom("P-ikke-en-uuid", undefined, false)).toEqual({ vej: "ewebinar" });
    expect(erMotorId(platformEwebinarId(ID))).toBe(true);
    expect(motorTilmeldingId(platformEwebinarId(ID))).toBe(ID);
  });
  it("motorens række: opslaget skal sige platform, session og version — ellers ingen mail (ikke en eWebinar-reserve)", () => {
    const pid = platformEwebinarId(ID);
    expect(mailVejDom(pid, o, true)).toEqual({ vej: "motor", opslag: o });
    expect(mailVejDom(pid, undefined, true)).toEqual({ vej: "motor_uden_link", grund: "ikke_fundet" });
    expect(mailVejDom(pid, { ...o, kildeSystem: "ewebinar" }, true)).toEqual({ vej: "motor_uden_link", grund: "ikke_platform" });
    expect(mailVejDom(pid, { ...o, slug: null }, true)).toEqual({ vej: "motor_uden_link", grund: "ingen_session" });
    expect(mailVejDom(pid, { ...o, sessionStatus: "aflyst" }, true)).toEqual({ vej: "motor_uden_link", grund: "aflyst" });
    expect(mailVejDom(pid, o, false)).toEqual({ vej: "motor_uden_link", grund: "ingen_secret" });
    expect(tomtMotorMailTal().uden_link).toEqual({ ikke_fundet: 0, ikke_platform: 0, ingen_session: 0, ingen_secret: 0, aflyst: 0 });
  });
  it("linkene: rummet og kalenderen bærer et token, der kan læses — og er ens med rummets", async () => {
    const token = await byggDeltagertoken("hemmelig", ID, 2);
    const join = `${APP_URL}${rumSti("raad", token)}`;
    expect(join).toBe(`https://app.theboardroom.dk/w/raad?t=${token}`);
    expect(`${APP_URL}${kalenderSti("raad", token)}`).toBe(`https://app.theboardroom.dk/w/raad/kalender?t=${token}`);
    expect(await laesDeltagertoken("hemmelig", null, new URL(join).searchParams.get("t"))).toEqual({ ok: true, tilmeldingId: ID, version: 2, noegle: "nu" });
  });
  it(".ics'en er husets: vores UID, beskrivelsen med rummet, og ordet «optaget» står ikke i den", () => {
    const url = `${APP_URL}${rumSti("raad", "a.b")}`;
    const ics = bygIcs({ tilmeldingId: ID, sekvens: 0, metode: "REQUEST", startMs: o.starterMs!, slutMs: o.slutMs!, stempelMs: 0, titel: "Økonomi", beskrivelse: icsBeskrivelse(url, "Morten Larsen"), url, deltagerMail: o.email });
    expect(ics).toContain(`UID:${ID}@webinar.topix.dk`);
    expect(ics.replace(/\r\n /g, "")).toContain("Gå ind i rummet her: https://app.theboardroom.dk/w/raad?t=a.b");
    expect(ics).not.toMatch(/optaget|\blive\b/i);
  });
});

describe("den interne prøvesession (D2.7)", () => {
  it("kun husets domæner — præcist, ikke underdomæner eller lookalikes", () => {
    expect(erInternAdresse("Jonas@Topix.dk")).toBe(true);
    expect(erInternAdresse("a@theboardroom.dk")).toBe(true);
    expect(erInternAdresse("a@mail.topix.dk")).toBe(false);
    expect(erInternAdresse("a@topix.dk.evil.com")).toBe(false);
    expect(erInternAdresse("topix.dk")).toBe(false);
    expect(erInternAdresse("a@topix.dk@x.dk")).toBe(false);
  });
  it("internDom: offentlig = alle; intern = kun husets", () => {
    expect(internDom(false, "a@firma.dk")).toEqual({ ok: true });
    expect(internDom(true, "a@firma.dk")).toEqual({ ok: false, grund: "intern" });
    expect(internDom(true, "a@topix.dk")).toEqual({ ok: true });
  });
  it("naesteSessioner viser aldrig en intern session — medmindre kalderen siger medInterne", () => {
    const s = [
      { id: "i", starterMs: 10, status: "planlagt", type: "Scheduled", kapacitet: null, tilmeldte: null, intern: true },
      { id: "o", starterMs: 20, status: "planlagt", type: "Scheduled", kapacitet: null, tilmeldte: null },
    ];
    expect(naesteSessioner(s, 0).map((x) => x.id)).toEqual(["o"]);
    expect(naesteSessioner(s, 0, 3, true).map((x) => x.id)).toEqual(["i", "o"]);
  });
  it("prøvelinket peger på reserveformularen med sessionen valgt", () => {
    expect(tilmeldSti("raad", ID)).toBe(`/w/raad/tilmeld?session=${ID}`);
  });
});

describe("rådgiverens opsætning — formularerne", () => {
  const w = { titel: "Økonomi, der giver ro", slug: "okonomi", bunnyGuid: "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE", varighed: "52:10", vaertNavn: "Morten Larsen", lobbyMin: "15", exitrumMin: "15", ctaTid: "", ctaMaal: "ansoeg", ctaTekst: "", ctaKnap: "" };

  it("tidskoder begge veje", () => {
    expect(laesTidskode("52:10")).toBe(3130);
    expect(laesTidskode("1:02:03")).toBe(3723);
    expect(laesTidskode("90")).toBe(90);
    expect(laesTidskode("1:60")).toBeNull();
    expect(laesTidskode("abc")).toBeNull();
    expect(tidskode(3130)).toBe("52:10");
    expect(tidskode(3723)).toBe("1:02:03");
  });
  it("slug fra titlen (æøå)", () => {
    expect(slugFraTitel("Økonomi, der giver ro")).toBe("oekonomi-der-giver-ro");
  });
  it("webinaret: gyldigt uden CTA — som kladde, GUID med små bogstaver", () => {
    const d = laesWebinarForm(w);
    expect(d.ok).toBe(true);
    if (d.ok === true) {
      expect(d.vaerdi.webinar).toMatchObject({ slug: "okonomi", varighed_sek: 3130, status: "kladde", bunny_video_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" });
      expect(d.vaerdi.cta).toBeNull();
    }
  });
  it("webinaret: CTA-tid giver den første CTA i kladden; uden tekst afvises den; efter videoen afvises den", () => {
    const d = laesWebinarForm({ ...w, ctaTid: "41:30", ctaTekst: "Søg om en plads", ctaKnap: "Søg" });
    expect(d.ok === true && d.vaerdi.cta).toEqual({ art: "cta", vis_fra_sek: 2490, vis_til_sek: null, placering: "overlay", indhold: { tekst: "Søg om en plads", knap: "Søg", maal: "ansoeg" } });
    expect(laesWebinarForm({ ...w, ctaTid: "41:30" }).ok).toBe(false);
    expect(laesWebinarForm({ ...w, ctaTid: "59:00", ctaTekst: "x", ctaKnap: "y" }).ok).toBe(false);
    expect(laesWebinarForm({ ...w, ctaTid: "41:30", ctaTekst: "x", ctaKnap: "y", ctaMaal: "link" }).ok).toBe(false);
  });
  it("webinaret: forkert slug, GUID og varighed afvises med en grund pr. felt", () => {
    const d = laesWebinarForm({ ...w, slug: "Æ", bunnyGuid: "x", varighed: "0:30" });
    expect(d.ok === false && Object.keys(d.fejl).sort()).toEqual(["bunnyGuid", "slug", "varighed"]);
  });
  it("sessionen: dansk tid → UTC (sommer- og vintertid), i fremtiden, kapacitet valgfri", () => {
    const nu = new Date("2026-09-30T10:00:00Z");
    const sommer = laesSessionForm({ dato: "2026-10-13", tid: "11:00", intern: true, kapacitet: "" }, nu);
    expect(sommer).toEqual({ ok: true, vaerdi: { starter_at: "2026-10-13T09:00:00.000Z", intern: true, kapacitet: null, type: "Scheduled", status: "planlagt" } });
    const vinter = laesSessionForm({ dato: "2026-11-03", tid: "11:00", intern: false, kapacitet: "40" }, nu);
    expect(vinter.ok === true && vinter.vaerdi.starter_at).toBe("2026-11-03T10:00:00.000Z");
    expect(laesSessionForm({ dato: "2026-09-01", tid: "11:00", intern: true, kapacitet: "" }, nu).ok).toBe(false);
    expect(laesSessionForm({ dato: "2026-10-13", tid: "25:00", intern: true, kapacitet: "" }, nu).ok).toBe(false);
    expect(laesSessionForm({ dato: "2026-10-13", tid: "11:00", intern: true, kapacitet: "0" }, nu).ok).toBe(false);
  });
  it("interaktionen: dømt af SAMME interaktionSkema som serveren", () => {
    const base = { art: "poll", fra: "10:00", til: "", placering: "overlay", tekst: "Hvad fylder mest?", knap: "", maal: "ansoeg", valg: "Likviditet\nSkat\n", rigtigt: "" };
    expect(laesInteraktionForm(base, 3130)).toEqual({ ok: true, vaerdi: { art: "poll", vis_fra_sek: 600, vis_til_sek: null, placering: "overlay", indhold: { spoergsmaal: "Hvad fylder mest?", valg: ["Likviditet", "Skat"] } } });
    expect(laesInteraktionForm({ ...base, valg: "Kun ét" }, 3130).ok).toBe(false);
    expect(laesInteraktionForm({ ...base, art: "quiz", rigtigt: "2" }, 3130)).toMatchObject({ ok: true, vaerdi: { indhold: { rigtigt: 1 } } });
    expect(laesInteraktionForm({ ...base, art: "quiz", rigtigt: "3" }, 3130).ok).toBe(false);
    expect(laesInteraktionForm({ ...base, art: "cta", tekst: "Søg", knap: "Søg nu", maal: "ansoeg" }, 3130).ok).toBe(true);
    expect(laesInteraktionForm({ ...base, art: "cta", tekst: "Søg", knap: "Søg nu", maal: "link" }, 3130).ok).toBe(false);
    expect(laesInteraktionForm({ ...base, fra: "60:00" }, 3130).ok).toBe(false);
    expect(laesInteraktionForm({ ...base, til: "9:00" }, 3130).ok).toBe(false);
    expect(laesInteraktionForm({ ...base, art: "haand" }, 3130).ok).toBe(false);
  });
  it("versionerne: kladden er udgivet + 1; en tom kladde kan ikke udgives; kopien bærer kladdens version", () => {
    expect(versioner(0)).toEqual({ udgivet: 0, kladde: 1 });
    expect(versioner(3)).toEqual({ udgivet: 3, kladde: 4 });
    expect(kanUdgive(0)).toBe(false);
    expect(kanUdgive(1)).toBe(true);
    const k = kopierTilKladde([{ id: "x", art: "cta", vis_fra_sek: 1, vis_til_sek: null, placering: "overlay", indhold: { a: 1 } }], "w", 4);
    expect(k).toEqual([{ webinar_id: "w", version: 4, art: "cta", vis_fra_sek: 1, vis_til_sek: null, placering: "overlay", indhold: { a: 1 }, betingelse: null, udloeber_kilde: null }]);
  });
});
