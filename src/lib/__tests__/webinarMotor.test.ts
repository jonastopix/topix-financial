import { describe, expect, it } from "vitest";
import { SET_GRAENSE_PROCENT } from "../../../supabase/functions/_shared/webinarDom.ts";
import { icsEscape } from "@/lib/kalenderfil";
import {
  embedParametre,
  embedUdloebSek,
  faarEmbed,
  positionDom,
  senIndgangDom,
  SET_GRAENSE_PROCENT_MOTOR,
  type SessionUr,
  urForskydning,
} from "@/lib/webinarMotor/ur";
import { spoleDom } from "@/lib/webinarMotor/spolning";
import {
  antalStykker,
  bitsTilProcent,
  faldkurve,
  fraPgHex,
  harBit,
  laesPulsKrop,
  type PulsAnker,
  pulsDom,
  pulsLoft,
  pulsServerTid,
  saetBits,
  taelBits,
  tilPgHex,
  tomBitmap,
  visAntalIRummet,
} from "@/lib/webinarMotor/puls";
import {
  aktiveInteraktioner,
  betingelseOpfyldt,
  ctaVindue,
  doemSvar,
  type Interaktion,
  interaktionSkema,
  kapitler,
  laesTidslinje,
  somSeerSer,
  svarKanModtages,
  type Tidslinje,
} from "@/lib/webinarMotor/interaktioner";
import { naesteSessioner } from "@/lib/webinarMotor/sessionplan";
import { laesTilmeldInput, platformEwebinarId, tilmeldDom } from "@/lib/webinarMotor/tilmelding";
import { bygIcs, erTvetydigVaegtid, foldIcsLinje, icsTekst, icsTidLinje } from "@/lib/webinarMotor/ics";
import { byggDeltagertoken, DELTAGERTOKEN_FORM, ensIKonstantTid, laesDeltagertoken, rumSti } from "@/lib/webinarMotor/token";
import { findMotorForbudte, MOTOR_VERSION } from "@/lib/webinarMotor/svar";

/**
 * Webinarmotoren, skive 1 (30/9-2026): de rene domme med kanterne fra
 * spec'en §C4 — sommertid 25/10, sen indgang på præcis 25 %, en puls der
 * springer 30 s frem, to enheder der overlapper, en puls efter videoens slut,
 * en session der ikke er begyndt, en ics-linje på 200 tegn med æøå, tokenets
 * konstanttidssammenligning, huller, dubletter og 500 seere.
 */

const T0 = Date.parse("2026-10-13T09:00:00Z"); // tirsdag 13/10 kl. 11:00 dansk
const SES: SessionUr = { starterMs: T0, varighedSek: 3600, introSek: 0, lobbyMin: 15, exitrumMin: 15 };

describe("ur — rummet og positionen", () => {
  it("grænsen for «set» er husets ENE tal (webinarDom.SET_GRAENSE_PROCENT)", () => {
    expect(SET_GRAENSE_PROCENT_MOTOR).toBe(SET_GRAENSE_PROCENT);
  });

  it("en session, der ikke er begyndt: før lobby, lobby, og nedtællingen", () => {
    const foer = positionDom(SES, T0 - 20 * 60_000);
    expect(foer.rum).toBe("foer_lobby");
    expect(foer.forventetPosSek).toBe(0);
    expect(foer.sekTilStart).toBe(1200);
    expect(positionDom(SES, T0 - 15 * 60_000).rum).toBe("lobby"); // præcis ved lobby-åbning
    expect(positionDom(SES, T0 - 1).rum).toBe("lobby");
    expect(positionDom(SES, T0).rum).toBe("afspilning"); // uden intro starter afspilningen ved start
  });

  it("intro, afspilning, exitrum og afsluttet — halvåbne grænser", () => {
    const s = { ...SES, introSek: 60 };
    expect(positionDom(s, T0).rum).toBe("intro");
    expect(positionDom(s, T0 + 30_000).introPosSek).toBe(30);
    expect(positionDom(s, T0 + 30_000).forventetPosSek).toBe(0);
    expect(positionDom(s, T0 + 60_000).rum).toBe("afspilning");
    expect(positionDom(s, T0 + 90_000).forventetPosSek).toBe(30);
    expect(positionDom(s, T0 + 60_000 + 3600_000).rum).toBe("exitrum");
    expect(positionDom(s, T0 + 60_000 + 3600_000).forventetPosSek).toBe(3600);
    expect(positionDom(s, T0 + 60_000 + 3600_000 + 15 * 60_000).rum).toBe("afsluttet");
    expect(positionDom({ ...s, status: "aflyst" }, T0 + 90_000).rum).toBe("aflyst");
  });

  it("SOMMERTIDSSKIFTET 25/10 midt i en session flytter intet: positionen er forskellen mellem to øjeblikke", () => {
    // 25/10-2026 kl. 02:30 sommertid = 00:30 UTC; kl. 03:00 CEST bliver 02:00 CET (01:00 UTC).
    const start = Date.parse("2026-10-25T00:30:00Z");
    const s = { ...SES, starterMs: start };
    expect(positionDom(s, Date.parse("2026-10-25T01:15:00Z")).forventetPosSek).toBe(45 * 60);
    expect(positionDom(s, Date.parse("2026-10-25T01:29:59Z")).rum).toBe("afspilning");
    expect(positionDom(s, Date.parse("2026-10-25T01:30:00Z")).rum).toBe("exitrum");
  });

  it("sen indgang: PRÆCIS 25 % kan stadig nå 75 %; ét sekund mere kan ikke", () => {
    expect(senIndgangDom(900, 3600)).toEqual({ kanNaaSet: true, tilbydNaeste: false, andelForbi: 0.25 });
    expect(senIndgangDom(901, 3600).kanNaaSet).toBe(false);
    expect(senIndgangDom(901, 3600).tilbydNaeste).toBe(true);
    expect(senIndgangDom(0, 3600).kanNaaSet).toBe(true);
    expect(senIndgangDom(10, 0).kanNaaSet).toBe(false); // ingen varighed = ingen løfter
  });

  it("urets forskydning: den korteste rundtur vinder", () => {
    expect(urForskydning([])).toBe(0);
    expect(urForskydning([
      { sendtMs: 1000, modtagetMs: 1400, serverMs: 5000 }, // rtt 400 → 5000 − 1200 = 3800
      { sendtMs: 2000, modtagetMs: 2100, serverMs: 6000 }, // rtt 100 → 6000 − 2050 = 3950
      { sendtMs: 3000, modtagetMs: 2900, serverMs: 1 }, // negativ rtt ignoreres
    ])).toBe(3950);
  });

  it("embed: kun i intro og afspilning, udløb = exitrummets slut + 30 min, t i hele sekunder", () => {
    expect(faarEmbed("lobby")).toBe(false);
    expect(faarEmbed("intro")).toBe(true);
    expect(faarEmbed("afspilning")).toBe(true);
    expect(faarEmbed("exitrum")).toBe(false);
    expect(embedUdloebSek(SES)).toBe((T0 + 3600_000 + 15 * 60_000 + 30 * 60_000) / 1000);
    expect(embedParametre(123.9)).toMatch(/&t=123$/);
    expect(embedParametre(-5)).toMatch(/&t=0$/);
    expect(embedParametre(0)).toContain("showSpeed=false");
  });
});

describe("spolning — pause er tilladt, spoling er ikke", () => {
  it("inden for 3 s er alt ok", () => {
    expect(spoleDom(100, 102.9, "spiller", null, 0)).toEqual({ art: "ok" });
  });
  it("spolet frem → hop til serverens position", () => {
    expect(spoleDom(100, 130, "spiller", null, 0)).toEqual({ art: "hop", til: 100, grund: "frem" });
    expect(spoleDom(100, 130, "pause", null, 0)).toEqual({ art: "hop", til: 100, grund: "frem" });
  });
  it("bagud: hop under afspilning, men pausen står (Tilbage til live er seerens valg)", () => {
    expect(spoleDom(100, 80, "spiller", null, 0)).toEqual({ art: "hop", til: 100, grund: "bagud" });
    expect(spoleDom(100, 80, "pause", null, 0)).toEqual({ art: "ok" });
  });
  it("aldrig et hop under buffering, og højst ét pr. 8 s", () => {
    expect(spoleDom(100, 130, "buffer", null, 0)).toEqual({ art: "vent", grund: "buffer" });
    expect(spoleDom(100, 130, "spiller", 10_000, 17_999)).toEqual({ art: "vent", grund: "hysterese" });
    expect(spoleDom(100, 130, "spiller", 10_000, 18_000).art).toBe("hop");
  });
});

describe("puls — kun serverens ur giver kredit", () => {
  const anker = (posSek: number, serverMs: number, tilstand = "spiller"): PulsAnker => ({ posSek, serverMs, tilstand });

  it("et normalt stræk: 0 → 15 s giver stykke 0–2", () => {
    expect(pulsDom(anker(0, 0), { posSek: 15, tilstand: "spiller" }, 15_000, 15, 3600)).toEqual({ stykker: [0, 2], grund: "ok" });
  });

  it("en puls, der SPRINGER 30 s frem på 15 s, giver ingen kredit", () => {
    expect(pulsDom(anker(100, 0), { posSek: 130, tilstand: "spiller" }, 15_000, 130, 3600).grund).toBe("for_hurtigt");
  });

  it("en spolet position (langt fra serverens) giver ingen kredit", () => {
    expect(pulsDom(anker(500, 0), { posSek: 515, tilstand: "spiller" }, 15_000, 100, 3600).grund).toBe("spolet");
  });

  it("uden anker, med et anker på pause, eller fra lobbyen: ingen kredit", () => {
    expect(pulsDom(null, { posSek: 15, tilstand: "spiller" }, 15_000, 15, 3600).grund).toBe("intet_anker");
    expect(pulsDom(anker(0, 0, "pause"), { posSek: 15, tilstand: "spiller" }, 15_000, 15, 3600).grund).toBe("ikke_spiller");
    expect(pulsDom(anker(0, 0), { posSek: 0, tilstand: "lobby" }, 15_000, 0, 3600).grund).toBe("ikke_spiller");
  });

  it("en pause- eller slut-puls krediterer strækket OP TIL sig selv", () => {
    expect(pulsDom(anker(0, 0), { posSek: 10, tilstand: "pause" }, 10_000, 10, 3600).stykker).toEqual([0, 1]);
  });

  it("en stillestående puls (samme position) giver ingen kredit — heller ikke et halvt stykke", () => {
    expect(pulsDom(anker(12, 0), { posSek: 12, tilstand: "pause" }, 15_000, 12, 3600)).toEqual({ stykker: null, grund: "intet_nyt" });
  });

  it("baglæns giver ingen kredit", () => {
    expect(pulsDom(anker(100, 0), { posSek: 90, tilstand: "spiller" }, 15_000, 90, 3600).grund).toBe("tilbage");
  });

  it("en puls EFTER videoens slut afkortes til sidste stykke", () => {
    // 3600 s = 720 stykker (0–719).
    expect(pulsDom(anker(3590, 0), { posSek: 3605, tilstand: "slut" }, 15_000, 3600, 3600).stykker).toEqual([718, 719]);
  });

  it("batch: klientens ur giver kun afstanden, aldrig mere tid end serveren har set", () => {
    expect(pulsServerTid(100_000, 50_000, 40_000, 80_000)).toBe(90_000);
    expect(pulsServerTid(100_000, 50_000, 0, 80_000)).toBe(80_000); // holdt på ankeret
    expect(pulsServerTid(100_000, 50_000, 60_000, null)).toBe(100_000); // aldrig efter nu
  });

  it("loftet: 1 s mellem kald pr. enhed, højst 5 enheder", () => {
    expect(pulsLoft([], "a", null, 0)).toBe("ok");
    expect(pulsLoft(["a"], "a", 1000, 1999)).toBe("for_tidligt");
    expect(pulsLoft(["a"], "a", 1000, 2000)).toBe("ok");
    expect(pulsLoft(["a", "b", "c", "d", "e"], "f", null, 0)).toBe("for_mange_enheder");
    expect(pulsLoft(["a", "b", "c", "d", "e"], "e", null, 0)).toBe("ok");
  });
});

describe("bitmappen — Postgres' nummerering, aldrig dobbelt kredit", () => {
  it("bit i ligger i byte ⌊i/8⌋ med masken 1 << (i mod 8) — som get_bit på bytea", () => {
    // Postgres-dokumentationens eksempel: get_bit('\x1234abcd'::bytea, 30) → 1.
    const b = fraPgHex("\\x1234abcd");
    expect(harBit(b, 30)).toBe(true);
    expect(harBit(b, 0)).toBe(false); // 0x12 = 0001 0010
    expect(harBit(b, 1)).toBe(true);
    expect(tilPgHex(b)).toBe("\\x1234abcd");
    expect(fraPgHex(null).length).toBe(0);
    expect(fraPgHex("\\xzz").length).toBe(0);
  });

  it("TO ENHEDER, DER OVERLAPPER, giver foreningen — ikke summen", () => {
    const n = antalStykker(3600);
    const a = saetBits(tomBitmap(3600), 0, 99, n);
    const b = saetBits(a.bits, 50, 149, n);
    expect(a.nye).toBe(100);
    expect(b.nye).toBe(50);
    expect(taelBits(b.bits, n)).toBe(150);
  });

  it("DUBLETTER: samme stræk to gange giver nul nye bits", () => {
    const n = antalStykker(3600);
    const a = saetBits(tomBitmap(3600), 10, 20, n);
    expect(saetBits(a.bits, 10, 20, n).nye).toBe(0);
  });

  it("HULLER står som huller", () => {
    const n = antalStykker(60); // 12 stykker
    let bits = saetBits(tomBitmap(60), 0, 3, n).bits;
    bits = saetBits(bits, 8, 11, n).bits;
    expect([...Array(n).keys()].map((i) => (harBit(bits, i) ? 1 : 0)).join("")).toBe("111100001111");
    expect(bitsTilProcent(taelBits(bits, n), 60)).toBe(66.67);
  });

  it("set_procent: hele videoen = 100, sidste stykke afkortes ved varigheden, aldrig over 100", () => {
    expect(bitsTilProcent(antalStykker(3601), 3601)).toBe(100); // 721 stykker · 5 = 3605 → afkortet til 3601
    expect(bitsTilProcent(540, 3600)).toBe(75);
    expect(bitsTilProcent(0, 3600)).toBe(0);
    expect(bitsTilProcent(10, 0)).toBe(0);
  });

  it("saetBits rører ikke originalen og holder sig inden for videoen", () => {
    const n = antalStykker(20); // 4
    const o = tomBitmap(20);
    const r = saetBits(o, -5, 100, n);
    expect(taelBits(o, n)).toBe(0);
    expect(r.nye).toBe(4);
  });
});

describe("faldkurven og «i rummet»", () => {
  it("500 SEERE: kurven tæller de fremmødte, og andelen falder, hvor de går", () => {
    const n = antalStykker(3600);
    const bitmaps: Uint8Array[] = [];
    for (let i = 0; i < 500; i++) {
      // Seer i ser fra 0 til et sted mellem 25 % og 100 %; hver femte kommer aldrig.
      if (i % 5 === 0) { bitmaps.push(tomBitmap(3600)); continue; }
      const til = Math.floor(n * (0.25 + (0.75 * (i % 100)) / 99)) - 1;
      bitmaps.push(saetBits(tomBitmap(3600), 0, til, n).bits);
    }
    const k = faldkurve(bitmaps, 3600);
    expect(k.fremmoedte).toBe(400);
    expect(k.punkter).toHaveLength(720);
    expect(k.punkter[0].andel).toBe(1);
    expect(k.punkter[719].andel).toBeLessThan(k.punkter[400].andel as number);
    for (let i = 1; i < 720; i++) expect(k.punkter[i].antal).toBeLessThanOrEqual(k.punkter[i - 1].antal);
  });

  it("under 5 fremmødte ERSTATTER «for få» procenten", () => {
    const n = antalStykker(60);
    const k = faldkurve([saetBits(tomBitmap(60), 0, 3, n).bits], 60);
    expect(k.punkter[0]).toEqual({ stykke: 0, fraSek: 0, antal: 1, andel: null });
  });

  it("«X venter» vises først fra 10 — og aldrig pustet op", () => {
    expect(visAntalIRummet(9)).toBeNull();
    expect(visAntalIRummet(10)).toBe(10);
    expect(visAntalIRummet(237)).toBe(237);
  });
});

describe("pulsens krop — positionen er serverens", () => {
  const p = { enhed_id: "enhed-abc1", seq: 1, klient_ms: 1000, pos_sek: 15, tilstand: "spiller" };
  it("en gyldig krop læses, og standarderne er ærlige (synlig ja, lyd nej)", () => {
    const d = laesPulsKrop([p], undefined);
    expect(d.ok && d.pulser[0]).toMatchObject({ synlig: true, lyd: false, korrigeret: false });
  });
  it("en klient, der sender sin EGEN forventede position, afvises", () => {
    expect(laesPulsKrop([{ ...p, forventet_pos_sek: 15 }], [])).toEqual({ ok: false, fejl: "puls_felt" });
  });
  it("for mange pulser, forkert tilstand, en handling uden interaktion", () => {
    expect(laesPulsKrop([p, p, p, p, p], []).ok).toBe(false);
    expect(laesPulsKrop([{ ...p, tilstand: "hurtig" }], []).ok).toBe(false);
    expect(laesPulsKrop([], [{ klient_id: "klient-001", art: "svar" }]).ok).toBe(false);
    expect(laesPulsKrop([], [{ klient_id: "klient-001", art: "spoergsmaal", tekst: "   " }]).ok).toBe(false);
    expect(laesPulsKrop([], [{ klient_id: "klient-001", art: "spoergsmaal", tekst: "Hvad koster det?" }]).ok).toBe(true);
  });
});

describe("interaktioner — hvad vises hvornår", () => {
  const cta: Interaktion = { id: "00000000-0000-4000-8000-000000000001", art: "cta", vis_fra_sek: 1800, vis_til_sek: 1900, placering: "overlay", indhold: { tekst: "Ansøg", knap: "Ansøg nu", maal: "ansoeg", nedtaelling: true }, betingelse: null, udloeber_kilde: null };
  const poll: Interaktion = { id: "00000000-0000-4000-8000-000000000002", art: "poll", vis_fra_sek: 600, vis_til_sek: 660, placering: "overlay", indhold: { spoergsmaal: "Hvor mange ansatte?", valg: ["1–5", "6–20", "21+"] }, betingelse: null, udloeber_kilde: null };
  const opfoelg: Interaktion = { ...poll, id: "00000000-0000-4000-8000-000000000003", vis_fra_sek: 700, vis_til_sek: 760, betingelse: { efter_svar: { interaktion_id: poll.id, valg: 2 } } };
  const feedback: Interaktion = { id: "00000000-0000-4000-8000-000000000004", art: "feedback", vis_fra_sek: 0, vis_til_sek: null, placering: "exitrum", indhold: { spoergsmaal: "Hvad tager du med?" }, betingelse: null, udloeber_kilde: null };
  const kapitel: Interaktion = { id: "00000000-0000-4000-8000-000000000005", art: "kapitel", vis_fra_sek: 300, vis_til_sek: null, placering: "sidepanel", indhold: { titel: "Likviditet" }, betingelse: null, udloeber_kilde: null };
  const quiz: Interaktion = { id: "00000000-0000-4000-8000-000000000006", art: "quiz", vis_fra_sek: 900, vis_til_sek: 960, placering: "overlay", indhold: { spoergsmaal: "?", valg: ["a", "b"], rigtigt: 1, forklaring: "fordi" }, betingelse: null, udloeber_kilde: null };
  const t: Tidslinje = { version: 1, interaktioner: [cta, poll, opfoelg, feedback, kapitel, quiz] };
  const k0 = { svar: {}, setProcent: 0 };

  it("serverens position afgør vinduet; exitrummets interaktioner kun i exitrummet", () => {
    expect(aktiveInteraktioner(t, "afspilning", 599, k0)).toEqual([]);
    expect(aktiveInteraktioner(t, "afspilning", 600, k0).map((i) => i.id)).toEqual([poll.id]);
    expect(aktiveInteraktioner(t, "afspilning", 660, k0)).toEqual([]); // vis_til er udenfor
    expect(aktiveInteraktioner(t, "lobby", 600, k0)).toEqual([]);
    expect(aktiveInteraktioner(t, "exitrum", 3600, k0).map((i) => i.id)).toEqual([feedback.id]);
    expect(aktiveInteraktioner(null, "afspilning", 600, k0)).toEqual([]);
  });

  it("betingelsen: kun to regler, og en ukendt viser INTET", () => {
    expect(aktiveInteraktioner(t, "afspilning", 700, k0)).toEqual([]);
    expect(aktiveInteraktioner(t, "afspilning", 700, { svar: { [poll.id]: { valg: [0, 2] } }, setProcent: 0 }).map((i) => i.id)).toEqual([opfoelg.id]);
    expect(betingelseOpfyldt({ min_set_procent: 50 }, { svar: {}, setProcent: 49.99 })).toBe(false);
    expect(betingelseOpfyldt({ min_set_procent: 50 }, { svar: {}, setProcent: 50 })).toBe(true);
    expect(betingelseOpfyldt({ hvis_regn: true }, k0)).toBe(false);
    expect(betingelseOpfyldt({ min_set_procent: 1, efter_svar: {} }, k0)).toBe(false);
  });

  it("kapitlerne er agendaen, ikke et overlay", () => {
    expect(kapitler(t)).toEqual([{ id: kapitel.id, fraSek: 300, titel: "Likviditet" }]);
    expect(aktiveInteraktioner(t, "afspilning", 300, k0).some((i) => i.art === "kapitel")).toBe(false);
  });

  it("svar modtages i vinduet + 30 s; feedback også efter exitrummet", () => {
    expect(svarKanModtages(poll, "afspilning", 689)).toBe(true);
    expect(svarKanModtages(poll, "afspilning", 690)).toBe(false);
    expect(svarKanModtages(poll, "afspilning", 599)).toBe(false);
    expect(svarKanModtages(feedback, "afsluttet", 3600)).toBe(true);
    expect(svarKanModtages(feedback, "afspilning", 100)).toBe(false);
  });

  it("CTA-VINDUET NÆGTER en nedtælling uden en kilde, vi ejer", () => {
    const kilder = { sessionSlutMs: 2_000_000, naesteSessionMs: null, optagFristMs: null };
    expect(ctaVindue(cta, kilder, 1_000_000)).toEqual({ nedtaelling: null, grund: "ingen_kilde" });
    expect(ctaVindue({ ...cta, udloeber_kilde: "session_slut" }, kilder, 1_000_000)).toEqual({ nedtaelling: { udloeberMs: 2_000_000, kilde: "session_slut" }, grund: "ok" });
    expect(ctaVindue({ ...cta, udloeber_kilde: "naeste_session" }, kilder, 1_000_000).grund).toBe("kilde_mangler_tid");
    expect(ctaVindue({ ...cta, udloeber_kilde: "session_slut" }, kilder, 2_000_000).grund).toBe("udloebet");
    expect(ctaVindue({ ...cta, indhold: { ...cta.indhold, nedtaelling: false }, udloeber_kilde: "session_slut" }, kilder, 0).grund).toBe("ingen_nedtaelling");
  });

  it("skemaerne: indhold og svar", () => {
    for (const i of t.interaktioner) expect(interaktionSkema(i.art, i.indhold)).toEqual({ ok: true });
    expect(interaktionSkema("cta", { tekst: "x", knap: "y", maal: "betal" }).ok).toBe(false);
    expect(interaktionSkema("quiz", { spoergsmaal: "?", valg: ["a", "b"], rigtigt: 2 }).ok).toBe(false);
    expect(interaktionSkema("pause_video", {}).ok).toBe(false);
    expect(doemSvar(poll, { valg: [2, 0] })).toEqual({ ok: true, svar: { valg: [0, 2] } });
    expect(doemSvar(poll, { valg: [3] }).ok).toBe(false);
    expect(doemSvar(poll, { valg: [1, 1] }).ok).toBe(false);
    expect(doemSvar(quiz, { valg: 1 })).toEqual({ ok: true, svar: { valg: 1, rigtigt: true } });
    expect(doemSvar(feedback, { stjerner: 5, tekst: "  God  " })).toEqual({ ok: true, svar: { stjerner: 5, tekst: "God" } });
    expect(doemSvar(feedback, { stjerner: 6 }).ok).toBe(false);
    expect(doemSvar(cta, { maal: "ikke_klar" })).toEqual({ ok: true, svar: { maal: "ikke_klar" } });
    expect(doemSvar(kapitel, {}).ok).toBe(false);
  });

  it("quiz' facit sendes først, når seeren har svaret", () => {
    expect(somSeerSer(quiz, false).indhold).toEqual({ spoergsmaal: "?", valg: ["a", "b"] });
    expect(somSeerSer(quiz, true).indhold).toMatchObject({ rigtigt: 1, forklaring: "fordi" });
    expect("betingelse" in somSeerSer(opfoelg, false)).toBe(false);
  });

  it("snapshot'et læses fail-closed: rækker, skemaet afviser, falder fra", () => {
    const snap = { version: 3, interaktioner: [cta, { ...poll, indhold: { spoergsmaal: "?" } }, { ...kapitel, placering: "bund" }] };
    expect(laesTidslinje(snap)?.interaktioner.map((i) => i.id)).toEqual([cta.id]);
    expect(laesTidslinje(null)).toBeNull();
    expect(laesTidslinje({ interaktioner: [] })).toBeNull();
  });
});

describe("sessionplan og tilmelding", () => {
  const s = (id: string, min: number, over: Partial<{ status: string; kapacitet: number | null; tilmeldte: number | null }> = {}) =>
    ({ id, starterMs: T0 + min * 60_000, status: "planlagt", type: "Scheduled", kapacitet: null, tilmeldte: null, ...over });

  it("de næste 3: planlagte/åbne, i fremtiden, ikke fulde, ældste først", () => {
    const valg = naesteSessioner([s("d", 400), s("a", 100), s("b", 200, { kapacitet: 10, tilmeldte: 10 }), s("c", 300), s("e", -5), s("f", 500, { status: "aflyst" }), s("g", 600)], T0);
    expect(valg.map((x) => x.id)).toEqual(["a", "c", "d"]);
  });

  const maal = { id: "S2", status: "planlagt", starterMs: T0 + 7 * 86_400_000, slutMs: T0 + 7 * 86_400_000 + 5_400_000, kapacitet: null, tilmeldte: 0 };

  it("samme mail + samme session er SAMME række — også efter sessionen", () => {
    expect(tilmeldDom("S2", [{ id: "r1", sessionId: "S2", sessionStarterMs: maal.starterMs }], { ...maal, status: "afholdt" }, maal.slutMs + 1)).toEqual({ art: "samme", id: "r1" });
  });

  it("en anden, ikke-begyndt session FLYTTES; en afholdt bliver historik", () => {
    expect(tilmeldDom("S2", [{ id: "r1", sessionId: "S1", sessionStarterMs: T0 + 86_400_000 }], maal, T0)).toEqual({ art: "flyt", id: "r1", fraSessionId: "S1" });
    expect(tilmeldDom("S2", [{ id: "r1", sessionId: "S0", sessionStarterMs: T0 - 86_400_000 }], maal, T0)).toEqual({ art: "ny" });
  });

  it("aflyst, forbi og fuld afvises; sen tilmelding er tilladt til exitrummet lukker", () => {
    expect(tilmeldDom("S2", [], { ...maal, status: "aflyst" }, T0)).toEqual({ art: "afvis", grund: "aflyst" });
    expect(tilmeldDom("S2", [], maal, maal.slutMs)).toEqual({ art: "afvis", grund: "forbi" });
    expect(tilmeldDom("S2", [], { ...maal, kapacitet: 2, tilmeldte: 2 }, T0)).toEqual({ art: "afvis", grund: "fuld" });
    expect(tilmeldDom("S2", [], maal, maal.starterMs + 60_000)).toEqual({ art: "ny" });
  });

  it("formularens felter: mailen normaliseres, ukendte former afvises", () => {
    const ok = laesTilmeldInput({ handling: "tilmeld", slug: "raadgivning-101", session_id: "00000000-0000-4000-8000-0000000000AA", fornavn: "  Anne  Sofie ", email: " Anne@Firma.DK ", utm_source: "fb", landing: "https://topix.dk/webinar?utm_source=fb" });
    expect(ok.ok && ok.input).toMatchObject({ email: "anne@firma.dk", fornavn: "Anne Sofie", sessionId: "00000000-0000-4000-8000-0000000000aa", samtykkeNyhedsbrev: false, spor: { utm_source: "fb", origin: "https://topix.dk/webinar?utm_source=fb", fbclid: null } });
    const fejl = laesTilmeldInput({ slug: "X", session_id: "nej", fornavn: "<b>", email: "a@b", samtykke_nyhedsbrev: "ja", utm_source: "x".repeat(201) });
    expect(fejl).toEqual({ ok: false, fejl: ["slug", "session_id", "fornavn", "email", "samtykke_nyhedsbrev", "utm_source"] });
    expect(platformEwebinarId("abc")).toBe("P-abc");
  });
});

describe("ics — husets egen invitation", () => {
  const base = { tilmeldingId: "11111111-2222-4333-8444-555555555555", sekvens: 0, metode: "REQUEST" as const, startMs: T0, slutMs: T0 + 3600_000, stempelMs: Date.parse("2026-09-30T08:00:00Z"), titel: "Økonomi, der giver ro", beskrivelse: "Gå ind her", url: "https://app.theboardroom.dk/w/raad?t=abc", deltagerMail: "anne@firma.dk" };

  it("escaping er husets (kalenderfil.icsEscape)", () => {
    for (const s of ["a;b,c\\d", "linje1\nlinje2", "æøå, «citat»; slut"]) expect(icsTekst(s)).toBe(icsEscape(s));
  });

  it("EN LINJE PÅ 200 TEGN MED ÆØÅ foldes ved 75 oktetter uden at dele et tegn", () => {
    const linje = `DESCRIPTION:${"æøå ".repeat(50)}`;
    expect(linje.length).toBeGreaterThanOrEqual(200);
    const foldet = foldIcsLinje(linje);
    const dele = foldet.split("\r\n");
    const enc = new TextEncoder();
    for (const d of dele) expect(enc.encode(d).length).toBeLessThanOrEqual(75);
    expect(dele.slice(1).every((d) => d.startsWith(" "))).toBe(true);
    expect(dele.map((d, i) => (i === 0 ? d : d.slice(1))).join("")).toBe(linje);
    expect(foldet).not.toContain("�");
  });

  it("Europe/Copenhagen med VTIMEZONE; stabil UID; SEQUENCE; RSVP=FALSE; alarm 15 min", () => {
    const ics = bygIcs(base);
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics).toContain("UID:11111111-2222-4333-8444-555555555555@webinar.topix.dk");
    expect(ics).toContain("DTSTART;TZID=Europe/Copenhagen:20261013T110000");
    expect(ics).toContain("DTEND;TZID=Europe/Copenhagen:20261013T120000");
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("SEQUENCE:0");
    expect(ics).toContain("ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:anne@firma.dk");
    expect(ics).toContain("TRIGGER:-PT15M");
    expect(ics).toContain("SUMMARY:Økonomi\\, der giver ro");
    expect(bygIcs({ ...base, stempelMs: base.stempelMs + 1 }).match(/UID:.*/)?.[0]).toBe(ics.match(/UID:.*/)?.[0]);
  });

  it("aflysning: METHOD:CANCEL, STATUS:CANCELLED, højere SEQUENCE, ingen alarm", () => {
    const ics = bygIcs({ ...base, metode: "CANCEL", sekvens: 2 });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).not.toContain("VALARM");
  });

  it("SOMMERTID 25/10: en tvetydig vægtid (02:30 findes to gange) skrives i UTC", () => {
    const foerste = Date.parse("2026-10-25T00:30:00Z"); // 02:30 CEST
    const anden = Date.parse("2026-10-25T01:30:00Z"); // 02:30 CET
    expect(erTvetydigVaegtid(foerste)).toBe(true);
    expect(erTvetydigVaegtid(anden)).toBe(true);
    expect(icsTidLinje("DTSTART", anden)).toBe("DTSTART:20261025T013000Z");
    expect(icsTidLinje("DTSTART", Date.parse("2026-10-25T02:30:00Z"))).toBe("DTSTART;TZID=Europe/Copenhagen:20261025T033000");
    expect(icsTidLinje("DTSTART", Date.parse("2026-03-29T01:30:00Z"))).toBe("DTSTART;TZID=Europe/Copenhagen:20260329T033000");
    expect(erTvetydigVaegtid(T0)).toBe(false);
  });
});

describe("token — HMAC, intet gemt", () => {
  const S = "hemmelig-noegle-32-bytes-til-test-000";
  const ID = "11111111-2222-4333-8444-555555555555";

  it("rundtur: bygget token læses tilbage med id og version", async () => {
    const t = await byggDeltagertoken(S, ID, 1);
    expect(t).toMatch(DELTAGERTOKEN_FORM);
    expect(await laesDeltagertoken(S, null, t)).toEqual({ ok: true, tilmeldingId: ID, version: 1, noegle: "nu" });
    expect(rumSti("raad", t)).toBe(`/w/raad?t=${t}`);
  });

  it("en anden secret, en ændret version eller et ændret id afvises", async () => {
    const t = await byggDeltagertoken(S, ID, 1);
    expect(await laesDeltagertoken("en anden", null, t)).toEqual({ ok: false, grund: "aftryk" });
    const t2 = await byggDeltagertoken(S, ID, 2);
    const blandet = `${t2.split(".")[0]}.${t.split(".")[1]}`; // version 2's første del med version 1's aftryk
    expect(await laesDeltagertoken(S, null, blandet)).toEqual({ ok: false, grund: "aftryk" });
  });

  it("rotation: den forrige nøgle virker i overgangen", async () => {
    const t = await byggDeltagertoken("gammel-noegle", ID, 3);
    expect(await laesDeltagertoken(S, "gammel-noegle", t)).toEqual({ ok: true, tilmeldingId: ID, version: 3, noegle: "forrige" });
  });

  it("forkert form, ingen secret, version 0 — afvist uden at kaste", async () => {
    expect(await laesDeltagertoken(null, null, "x.y")).toEqual({ ok: false, grund: "ingen_secret" });
    for (const t of [undefined, 42, "", "abc.def", "a".repeat(27) + "." + "b".repeat(42)]) {
      expect((await laesDeltagertoken(S, null, t)).ok).toBe(false);
    }
    await expect(byggDeltagertoken(S, ID, 0)).rejects.toThrow();
    await expect(byggDeltagertoken(S, "ikke-et-uuid", 1)).rejects.toThrow();
    await expect(byggDeltagertoken("  ", ID, 1)).rejects.toThrow();
  });

  it("KONSTANT TID: sammenligningen løber hele vejen, også ved forskel i første byte og ved forskellig længde", () => {
    const a = new Uint8Array(32).fill(7);
    const b = new Uint8Array(32).fill(7);
    expect(ensIKonstantTid(a, b)).toBe(true);
    b[0] = 8;
    expect(ensIKonstantTid(a, b)).toBe(false);
    expect(ensIKonstantTid(a, a.slice(0, 31))).toBe(false);
    expect(ensIKonstantTid(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });
});

describe("svar — beviset og persondata", () => {
  it("motor-versionen er beviset", () => {
    expect(MOTOR_VERSION).toBe("boardroom-3");
  });
  it("findMotorForbudte finder persondata hvor dybt det end ligger", () => {
    expect(findMotorForbudte({ rum: "lobby", webinar: { titel: "x" } })).toEqual([]);
    expect(findMotorForbudte({ a: [{ b: { email: "x" } }], fornavn: "Anne", c: { ip_dagshash: "h" } })).toEqual(["a[0].b.email", "fornavn", "c.ip_dagshash"]);
  });
});
