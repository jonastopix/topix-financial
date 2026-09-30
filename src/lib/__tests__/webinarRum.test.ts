import { describe, expect, it } from "vitest";
import { type Interaktion, seerTidslinje } from "@/lib/webinarMotor/interaktioner";
import { findMotorForbudte, findMotorForbudteMed, MOTOR_VERSION, NAVNGIVNE_UNDTAGELSER } from "@/lib/webinarMotor/svar";
import { positionDom, type SessionUr } from "@/lib/webinarMotor/ur";
import { DELTAGERTOKEN_FORM } from "@/lib/webinarMotor/token";
import type { PulsRaa } from "@/lib/webinarMotor/puls";
import { MIN_KALD_AFSTAND_MS, MAKS_PULSER_PR_KALD } from "@/lib/webinarMotor/puls";
import {
  gaarIndAfSigSelv,
  glatForskydning,
  GLAT_SKRIDT_MS,
  lokalPosition,
  type RumTider,
  senIndgang,
  skalHenteTilstand,
  urFraTider,
  visningsFase,
} from "@/lib/webinarRum/fase";
import {
  byggPuls,
  efterSvar,
  laegIKoe,
  maaSendes,
  MIN_AFSTAND_MS,
  PULS_ROLIG_MS,
  PULS_SPILLER_MS,
  PULS_SPOERGSMAAL_MS,
  pulsInterval,
  SPOERGSMAAL_VINDUE_MS,
  ventTil,
} from "@/lib/webinarRum/pulsplan";
import {
  afspillerTilstand,
  annoncering,
  autoplayDom,
  BUFFER_EFTER_MS,
  forbindelsesDom,
  kortPaaSkaermen,
  mindsteRundtur,
  nedtaellingTekst,
  overlayDom,
  resterendeSek,
} from "@/lib/webinarRum/overlay";
import { ansoegUrl, icsUrl, kalenderLinks, laesTilmeldSpor, laesWt, sessionTekst, klokkeTekst, udenToken, vaelgToken, validerTilmelding } from "@/lib/webinarRum/links";
import { FELT } from "@/components/webinarRum/stil";

/**
 * Seerens flade, skive 2 (30/9-2026): de rene domme i src/lib/webinarRum/ og
 * motorens tre tilføjelser (seerTidslinje, de navngivne undtagelser, versionen).
 * Tiden gives ind overalt.
 */

const START = Date.parse("2026-10-13T09:00:00Z"); // tirsdag 13/10 kl. 11.00 dansk
const UR: SessionUr = { starterMs: START, varighedSek: 3600, introSek: 60, lobbyMin: 15, exitrumMin: 15 };
const iso = (ms: number) => new Date(ms).toISOString();
const TIDER: RumTider = {
  lobby_aabner_at: iso(START - 15 * 60_000),
  starter_at: iso(START),
  afspilning_start_at: iso(START + 60_000),
  afspilning_slut_at: iso(START + 60_000 + 3_600_000),
  exitrum_slut_at: iso(START + 60_000 + 3_600_000 + 15 * 60_000),
};

// ── fase ─────────────────────────────────────────────────────────────────────

describe("webinarRum/fase — uret bygget tilbage fra serverens tider", () => {
  it("urFraTider giver PRÆCIS serverens ur: samme positionDom på alle grænser", () => {
    const ur = urFraTider(TIDER, false)!;
    expect(ur).toMatchObject({ starterMs: START, introSek: 60, varighedSek: 3600, lobbyMin: 15, exitrumMin: 15 });
    for (const t of [START - 16 * 60_000, START - 15 * 60_000, START - 1, START, START + 59_999, START + 60_000, START + 1_860_000, START + 3_660_000, START + 4_559_999, START + 4_560_000]) {
      expect(positionDom(ur, t)).toEqual(positionDom(UR, t));
    }
  });
  it("aflyst vinder over uret; ugyldige eller omvendte tider giver null", () => {
    expect(positionDom(urFraTider(TIDER, true)!, START + 120_000).rum).toBe("aflyst");
    expect(urFraTider({ ...TIDER, starter_at: "x" }, false)).toBeNull();
    expect(urFraTider({ ...TIDER, afspilning_slut_at: TIDER.afspilning_start_at }, false)).toBeNull();
  });
  it("lokalPosition lægger forskydningen til klientens ur", () => {
    const ur = urFraTider(TIDER, false)!;
    // Klientens ur går 5 s bagud: serveren siger 11.02.00, klienten 11.01.55.
    const p = lokalPosition(ur, START + 115_000, 5000);
    expect(p.rum).toBe("afspilning");
    expect(p.forventetPosSek).toBe(60);
  });
  it("glatForskydning: første gælder straks, derefter ±250 ms, over 5 s springes der", () => {
    expect(glatForskydning(null, 1234)).toBe(1234);
    expect(glatForskydning(1000, 1100)).toBe(1100);
    expect(glatForskydning(1000, 2000)).toBe(1000 + GLAT_SKRIDT_MS);
    expect(glatForskydning(1000, -500)).toBe(1000 - GLAT_SKRIDT_MS);
    expect(glatForskydning(1000, 7000)).toBe(7000);
  });
  it("visningsFase: hvert rum har sin skærm", () => {
    const f = (rum: Parameters<typeof visningsFase>[0]["rum"], ekstra: Partial<Parameters<typeof visningsFase>[0]> = {}) =>
      visningsFase({ rum, kanNaaSet: null, seAlligevel: false, gaaetInd: false, ...ekstra });
    expect(f("foer_lobby")).toBe("venter");
    expect(f("lobby")).toBe("vaerelse");
    expect(f("intro")).toBe("gaa_ind");
    expect(f("afspilning", { kanNaaSet: true })).toBe("gaa_ind");
    expect(f("afspilning", { kanNaaSet: false })).toBe("sen_indgang");
    expect(f("afspilning", { kanNaaSet: false, seAlligevel: true })).toBe("gaa_ind");
    expect(f("afspilning", { kanNaaSet: false, gaaetInd: true })).toBe("live");
    expect(f("intro", { gaaetInd: true })).toBe("live");
    expect(f("exitrum")).toBe("exitrum");
    expect(f("afsluttet")).toBe("afsluttet");
    expect(f("aflyst")).toBe("aflyst");
  });
  it("sen indgang på PRÆCIS 25 % kan stadig nå «set»; lige over kan ikke", () => {
    const ur = urFraTider(TIDER, false)!;
    const paa25 = positionDom(ur, START + 60_000 + 900_000);
    expect(paa25.forventetPosSek).toBe(900);
    expect(senIndgang(paa25, 3600)).toBe(true);
    expect(senIndgang(positionDom(ur, START + 60_000 + 901_000), 3600)).toBe(false);
    expect(senIndgang(positionDom(ur, START - 1000), 3600)).toBeNull();
  });
  it("gaarIndAfSigSelv: kun fra venteværelset og kun ind i intro/afspilning", () => {
    expect(gaarIndAfSigSelv("vaerelse", "intro")).toBe(true);
    expect(gaarIndAfSigSelv("vaerelse", "afspilning")).toBe(true);
    expect(gaarIndAfSigSelv("venter", "afspilning")).toBe(false);
    expect(gaarIndAfSigSelv(null, "afspilning")).toBe(false);
    expect(gaarIndAfSigSelv("vaerelse", "lobby")).toBe(false);
  });
  it("skalHenteTilstand: kun når en grænse er krydset", () => {
    expect(skalHenteTilstand("lobby", "lobby")).toBe(false);
    expect(skalHenteTilstand("lobby", "intro")).toBe(true);
    expect(skalHenteTilstand("intro", "afspilning")).toBe(true);
    expect(skalHenteTilstand(null, "lobby")).toBe(false);
  });
  it("sommertidsskiftet (25/10) midt i sessionen flytter intet: positionen er forskellen mellem to øjeblikke", () => {
    const s = Date.parse("2026-10-25T00:30:00Z"); // 02:30 sommertid → skiftet sker 01:00Z
    const tider: RumTider = {
      lobby_aabner_at: iso(s - 15 * 60_000), starter_at: iso(s), afspilning_start_at: iso(s),
      afspilning_slut_at: iso(s + 3_600_000), exitrum_slut_at: iso(s + 3_600_000 + 60_000),
    };
    expect(lokalPosition(urFraTider(tider, false)!, s + 45 * 60_000, 0).forventetPosSek).toBe(2700);
  });
});

// ── pulsplan ─────────────────────────────────────────────────────────────────

describe("webinarRum/pulsplan — hvornår og hvad", () => {
  it("interval: 15 s spiller, 60 s ellers, 5 s mens et spørgsmål venter (højst 10 min)", () => {
    expect(pulsInterval("spiller", null, 0)).toBe(PULS_SPILLER_MS);
    expect(pulsInterval("pause", null, 0)).toBe(PULS_ROLIG_MS);
    expect(pulsInterval("lobby", null, 0)).toBe(PULS_ROLIG_MS);
    expect(pulsInterval("pause", 1000, 1000 + 60_000)).toBe(PULS_SPOERGSMAAL_MS);
    expect(pulsInterval("spiller", 1000, 1000 + SPOERGSMAAL_VINDUE_MS)).toBe(PULS_SPILLER_MS);
  });
  it("aldrig tættere end serverens loft (+ margen)", () => {
    expect(MIN_AFSTAND_MS).toBeGreaterThan(MIN_KALD_AFSTAND_MS);
    expect(maaSendes(null, 0)).toBe(true);
    expect(maaSendes(1000, 1000 + MIN_AFSTAND_MS - 1)).toBe(false);
    expect(maaSendes(1000, 1000 + MIN_AFSTAND_MS)).toBe(true);
    expect(ventTil(1000, 1500)).toBe(MIN_AFSTAND_MS - 500);
    expect(ventTil(null, 1500)).toBe(0);
  });
  const p = (seq: number): PulsRaa => ({ enhed_id: "enhed-123", seq, klient_ms: seq, pos_sek: seq, tilstand: "spiller", synlig: true, lyd: true, korrigeret: false });
  it("køen holder de NYESTE fire, og kvitterede pulser fjernes kun ved et svar", () => {
    let k: PulsRaa[] = [];
    for (let i = 1; i <= 6; i++) k = laegIKoe(k, p(i));
    expect(k.map((x) => x.seq)).toEqual([3, 4, 5, 6]);
    expect(k.length).toBe(MAKS_PULSER_PR_KALD);
    expect(efterSvar(k, [p(3), p(4)], false).map((x) => x.seq)).toEqual([3, 4, 5, 6]);
    expect(efterSvar(k, [p(3), p(4)], true).map((x) => x.seq)).toEqual([5, 6]);
  });
  it("byggPuls: uden for hovedvideoen er tilstanden «lobby» og positionen 0 (intet anker på introens tal)", () => {
    const f = { enhedId: "enhed-123", seq: 7, klientMs: 1234.6, posSek: 42.12345, synlig: true, lyd: true, korrigeret: true };
    expect(byggPuls({ ...f, tilstand: "spiller", iHovedvideo: true })).toEqual({ enhed_id: "enhed-123", seq: 7, klient_ms: 1235, pos_sek: 42.123, tilstand: "spiller", synlig: true, lyd: true, korrigeret: true });
    expect(byggPuls({ ...f, tilstand: "spiller", iHovedvideo: false })).toMatchObject({ pos_sek: 0, tilstand: "lobby", lyd: false });
    expect(byggPuls({ ...f, tilstand: "spiller", iHovedvideo: true, posSek: Number.NaN }).pos_sek).toBe(0);
  });
  it("pulsens nøgler er PRÆCIS serverens — ingen «forventet»", () => {
    const b = byggPuls({ enhedId: "enhed-123", seq: 1, klientMs: 1, posSek: 1, tilstand: "pause", iHovedvideo: true, synlig: false, lyd: false, korrigeret: false });
    expect(Object.keys(b).sort()).toEqual(["enhed_id", "klient_ms", "korrigeret", "lyd", "pos_sek", "seq", "synlig", "tilstand"]);
  });
});

// ── overlay ──────────────────────────────────────────────────────────────────

describe("webinarRum/overlay — lagene over afspilleren", () => {
  it("kontrolbjælken dækkes altid i live; «Tilbage til live» på pause; «Tryk for lyd», når der spilles uden lyd", () => {
    expect(overlayDom({ visning: "live", afspiller: "spiller", muted: false, klar: true })).toEqual({ daekKontroller: true, visTilbageTilLive: false, visTrykForLyd: false });
    expect(overlayDom({ visning: "live", afspiller: "pause", muted: true, klar: true })).toEqual({ daekKontroller: true, visTilbageTilLive: true, visTrykForLyd: false });
    expect(overlayDom({ visning: "live", afspiller: "spiller", muted: true, klar: true }).visTrykForLyd).toBe(true);
    expect(overlayDom({ visning: "live", afspiller: "spiller", muted: true, klar: false }).visTrykForLyd).toBe(false);
    expect(overlayDom({ visning: "vaerelse", afspiller: "pause", muted: true, klar: true })).toEqual({ daekKontroller: false, visTilbageTilLive: false, visTrykForLyd: false });
  });
  it("iPhone-dommen: på pause efter ventetiden → spil uden lyd; spiller uden lyd → tryk for lyd", () => {
    expect(autoplayDom(true, false)).toBe("spil_uden_lyd");
    expect(autoplayDom(true, true)).toBe("spil_uden_lyd");
    expect(autoplayDom(false, true)).toBe("tryk_for_lyd");
    expect(autoplayDom(false, false)).toBe("ok");
  });
  it("afspillerens tilstand: en «spiller» uden timeupdate i 2,5 s er «buffer»", () => {
    expect(afspillerTilstand("play", 1000, 1000 + BUFFER_EFTER_MS)).toBe("spiller");
    expect(afspillerTilstand("play", 1000, 1001 + BUFFER_EFTER_MS)).toBe("buffer");
    expect(afspillerTilstand("pause", 0, 99_999)).toBe("pause");
    expect(afspillerTilstand("ended", 0, 1)).toBe("slut");
    expect(afspillerTilstand(null, null, 1)).toBe("pause");
  });
  const iv = (id: string, art: Interaktion["art"], fra: number, til: number | null, ekstra: Partial<Interaktion> = {}): Interaktion => ({
    id, art, vis_fra_sek: fra, vis_til_sek: til, placering: "overlay", indhold: {}, betingelse: null, udloeber_kilde: null, ...ekstra,
  });
  it("kortene: serverens egen dom på serverens position, minus lukkede og minus arter uden kort", () => {
    const t = [iv("a", "poll", 100, 200), iv("b", "cta", 150, null), iv("c", "haand", 100, null), iv("d", "reaktion", 0, null), iv("e", "feedback", 0, null, { placering: "exitrum" }),
      iv("f", "poll", 100, null, { betingelse: { min_set_procent: 50 } })];
    const k = { svar: {}, setProcent: 10 };
    expect(kortPaaSkaermen(t, "afspilning", 160, k, new Set()).map((i) => i.id)).toEqual(["a", "b"]);
    expect(kortPaaSkaermen(t, "afspilning", 160, { ...k, setProcent: 60 }, new Set()).map((i) => i.id)).toEqual(["a", "f", "b"]);
    expect(kortPaaSkaermen(t, "afspilning", 160, k, new Set(["a"])).map((i) => i.id)).toEqual(["b"]);
    expect(kortPaaSkaermen(t, "afspilning", 99, k, new Set()).map((i) => i.id)).toEqual([]);
    expect(kortPaaSkaermen(t, "exitrum", 3600, k, new Set()).map((i) => i.id)).toEqual(["e"]);
  });
  it("nedtællingen: mm:ss, t:mm:ss, dage — og skærmlæseren får kun milepælene", () => {
    expect(nedtaellingTekst(299)).toBe("04:59");
    expect(nedtaellingTekst(3899)).toBe("1:04:59");
    expect(nedtaellingTekst(2 * 86_400 + 3 * 3600 + 5)).toBe("2 d. 3 t.");
    expect(nedtaellingTekst(-5)).toBe("00:00");
    expect(annoncering(600)).toBe("Webinaret starter om 10 minutter.");
    expect(annoncering(60)).toBe("Webinaret starter om et minut.");
    expect(annoncering(3600)).toBe("Webinaret starter om en time.");
    expect(annoncering(10)).toBe("Webinaret starter om 10 sekunder.");
    expect(annoncering(599)).toBeNull();
    expect(annoncering(0)).toBeNull();
  });
  it("CTA'ens frist: kun en sand, og aldrig under nul", () => {
    expect(resterendeSek(null, 0)).toBeNull();
    expect(resterendeSek(10_000, 0)).toBe(10);
    expect(resterendeSek(10_000, 9_001)).toBe(1);
    expect(resterendeSek(10_000, 10_000)).toBeNull();
  });
  it("forbindelsen er MÅLT: mindste rundtur, og ingen dom uden en måling", () => {
    expect(mindsteRundtur([])).toBeNull();
    expect(mindsteRundtur([{ sendtMs: 0, modtagetMs: 400 }, { sendtMs: 1000, modtagetMs: 1120 }, { sendtMs: 5, modtagetMs: 1 }])).toBe(120);
    expect(forbindelsesDom(null).niveau).toBe("ukendt");
    expect(forbindelsesDom(120)).toEqual({ niveau: "god", tekst: "Forbindelsen er god (120 ms)" });
    expect(forbindelsesDom(500).niveau).toBe("ok");
    expect(forbindelsesDom(900).niveau).toBe("langsom");
  });
});

// ── links ────────────────────────────────────────────────────────────────────

const TOKEN = `${"A".repeat(27)}.${"b".repeat(43)}`;

describe("webinarRum/links — tokenet, kalenderen, ansøgningen, formen", () => {
  it("tokenet har motorens form; URL'ens vinder over det gemte; et ugyldigt er intet", () => {
    expect(DELTAGERTOKEN_FORM.test(TOKEN)).toBe(true);
    expect(vaelgToken(TOKEN, null)).toBe(TOKEN);
    expect(vaelgToken(null, TOKEN)).toBe(TOKEN);
    expect(vaelgToken("forkert", TOKEN)).toBe(TOKEN);
    expect(vaelgToken("forkert", "også forkert")).toBeNull();
  });
  it("udenToken fjerner KUN t — alt andet i adressen bliver", () => {
    expect(udenToken(`https://app.theboardroom.dk/w/salg?t=${TOKEN}&utm_source=fb#x`)).toBe("/w/salg?utm_source=fb#x");
    expect(udenToken(`https://app.theboardroom.dk/w/salg?t=${TOKEN}`)).toBe("/w/salg");
  });
  it("ansøgningen: tokenet i FRAGMENTET, kilde=webinar, intet andet — og det læses tilbage", () => {
    const u = ansoegUrl(TOKEN);
    expect(u).toBe(`/ansoeg?kilde=webinar#wt=${TOKEN}`);
    expect(new URL(u, "https://x.dk").search).toBe("?kilde=webinar");
    expect(laesWt(`#wt=${TOKEN}`)).toBe(TOKEN);
    expect(laesWt("#wt=forkert")).toBeNull();
    expect(laesWt("")).toBeNull();
    expect(laesWt(null)).toBeNull();
  });
  it("kalenderen: Google og Outlook med rummets link, .ics fra motoren", () => {
    const l = kalenderLinks({ titel: "Salg", starterAt: iso(START), rumUrl: `https://app.theboardroom.dk/w/salg?t=${TOKEN}`, supabaseUrl: "https://p.supabase.co/", token: TOKEN });
    expect(l.google).toContain("calendar.google.com");
    expect(l.google).toContain("20261013T090000Z");
    expect(l.outlook).toContain("outlook.office.com");
    expect(l.ics).toBe(`https://p.supabase.co/functions/v1/webinar-rum?handling=ics&t=${TOKEN}`);
    expect(icsUrl("https://p.supabase.co", TOKEN)).toBe(l.ics);
  });
  it("dansk tid uanset enhedens tidszone", () => {
    expect(sessionTekst(iso(START))).toBe("tirsdag 13. oktober kl. 11.00");
    expect(klokkeTekst(iso(START - 15 * 60_000))).toBe("10.45");
    expect(sessionTekst(iso(Date.parse("2026-11-03T10:00:00Z")))).toBe("tirsdag 3. november kl. 11.00");
    expect(sessionTekst("x")).toBe("");
  });
  it("formen siger det samme som serveren", () => {
    expect(validerTilmelding({ fornavn: "Anne", email: "anne@firma.dk", sessionId: "s" })).toEqual({});
    expect(Object.keys(validerTilmelding({ fornavn: " ", email: "anne@", sessionId: null })).sort()).toEqual(["email", "fornavn", "session"]);
    expect(validerTilmelding({ fornavn: "<b>", email: "a@b.dk", sessionId: "s" }).fornavn).toBeTruthy();
    expect(validerTilmelding({ fornavn: "Anne", email: " ANNE@Firma.DK ", sessionId: "s" })).toEqual({});
  });
  it("annoncesporet: utm og fbclid fra URL'en, landing uden token, referrer — aldrig cookier", () => {
    const q = new URLSearchParams(`utm_source=fb&utm_content=annonce-7&fbclid=IwAR0&t=${TOKEN}&andet=x`);
    const s = laesTilmeldSpor({ get: (n) => q.get(n), href: `https://app.theboardroom.dk/w/salg?${q}`, referrer: "https://facebook.com/" });
    expect(s).toEqual({ utm_source: "fb", utm_content: "annonce-7", fbclid: "IwAR0", landing: "https://app.theboardroom.dk/w/salg?utm_source=fb&utm_content=annonce-7&fbclid=IwAR0&andet=x", referrer: "https://facebook.com/" });
    expect(Object.keys(s)).not.toContain("fbp");
    expect(Object.keys(s)).not.toContain("ga_client_id");
  });
  it("felterne er 16 px (text-base) — under 16 px zoomer iOS ind", () => {
    expect(FELT).toContain("text-base");
    expect(FELT).not.toContain("text-[15px]");
  });
});

// ── motorens tilføjelser ─────────────────────────────────────────────────────

describe("webinarMotor, skive 2 — seerTidslinje, undtagelserne, versionen", () => {
  const quiz: Interaktion = { id: "q", art: "quiz", vis_fra_sek: 10, vis_til_sek: 60, placering: "overlay", indhold: { spoergsmaal: "?", valg: ["a", "b"], rigtigt: 1, forklaring: "fordi" }, betingelse: { min_set_procent: 10 }, udloeber_kilde: null };
  const kapitel: Interaktion = { id: "k", art: "kapitel", vis_fra_sek: 0, vis_til_sek: null, placering: "sidepanel", indhold: { titel: "Intro" }, betingelse: null, udloeber_kilde: null };
  const cta: Interaktion = { id: "c", art: "cta", vis_fra_sek: 5, vis_til_sek: null, placering: "overlay", indhold: { tekst: "Ansøg", knap: "Ansøg", maal: "ansoeg" }, betingelse: null, udloeber_kilde: null };
  it("hele tidslinjen uden kapitler, MED betingelsen, sorteret — quiz' facit først efter svar", () => {
    const t = { version: 3, interaktioner: [quiz, kapitel, cta] };
    const ud = seerTidslinje(t, {});
    expect(ud.map((i) => i.id)).toEqual(["c", "q"]);
    expect(ud[1].betingelse).toEqual({ min_set_procent: 10 });
    expect(ud[1].indhold).toEqual({ spoergsmaal: "?", valg: ["a", "b"] });
    expect(seerTidslinje(t, { q: { valg: 0 } })[1].indhold).toMatchObject({ rigtigt: 1, forklaring: "fordi" });
    expect(seerTidslinje(null, {})).toEqual([]);
  });
  it("undtagelserne er PRÆCISE stier: «email» andetsteds i samme svar fanges stadig", () => {
    expect(NAVNGIVNE_UNDTAGELSER).toEqual({ hilsen: ["hilsen.fornavn"], forudfyld: ["forudfyld.navn", "forudfyld.email"] });
    const ud = { motor: MOTOR_VERSION, forudfyld: { navn: "Anne", email: "a@b.dk" } };
    expect(findMotorForbudte(ud)).toEqual(["forudfyld.navn", "forudfyld.email"]);
    expect(findMotorForbudteMed(ud, "forudfyld")).toEqual([]);
    expect(findMotorForbudteMed({ ...ud, andet: { email: "x" } }, "forudfyld")).toEqual(["andet.email"]);
    expect(findMotorForbudteMed(ud, "hilsen")).toEqual(["forudfyld.navn", "forudfyld.email"]);
    expect(findMotorForbudteMed({ hilsen: { fornavn: "Anne", email: "a" } }, "hilsen")).toEqual(["hilsen.email"]);
    expect(findMotorForbudteMed({ hilsen: { fornavn: "Anne" } }, null)).toEqual(["hilsen.fornavn"]);
  });
  it("versionen er skive 2's — beviset i drift skelner den fra skive 1", () => {
    expect(MOTOR_VERSION).toBe("boardroom-2");
  });
});
