import { describe, expect, it } from "vitest";
import { kbhTilUtc } from "@/lib/hverdage";
import { afgoerOvergang } from "@/lib/ansoegningTrin";
import {
  afgoerSending,
  idempotensnoegle,
  KOE_SKABELONER,
  PAUSE_MAANEDER,
  pauseTil,
  planlaegTrappe,
  TRAPPER,
} from "@/lib/rykkerkoe";

// Rykkerkøens regler (Jonas 18/9) — hver regel har sin describe-blok.
const ID = "11111111-1111-4111-8111-111111111111";
const kl = (dato: string, time: number, minut = 0) => kbhTilUtc(dato, time, minut).toISOString();

describe("rykkerkoe — trapperne som Jonas satte dem", () => {
  it("indkaldt: dag 0 indkaldelsen, rykker dag 2, 4, 7, 11 → lukkes «svarer ikke» dag 14", () => {
    expect(TRAPPER.indkaldt.map((t) => [t.dag, t.handling])).toEqual([
      [0, "send_mail"], [2, "send_mail"], [4, "send_mail"], [7, "send_mail"], [11, "send_mail"], [14, "luk_svarer_ikke"],
    ]);
  });
  it("booket: dagen før kl. 10 + samme morgen kl. 07 + «afholdt» ved sluttid", () => {
    expect(TRAPPER.booket.map((t) => [t.dag, t.klokke ?? null, t.handling])).toEqual([
      [-1, 10, "send_mail"], [0, 7, "send_mail"], [0, null, "marker_afholdt"],
    ]);
  });
  it("aftalegrundlag: dag 0 selve aftalegrundlaget, rykker dag 2, 5, 9, 14 → udløber dag 21", () => {
    expect(TRAPPER.aftalegrundlag.map((t) => [t.dag, t.handling])).toEqual([
      [0, "send_mail"], [2, "send_mail"], [5, "send_mail"], [9, "send_mail"], [14, "send_mail"], [21, "udloeb"],
    ]);
  });
  it("pause: én række til rådgiveren efter tre måneder — ingen mail til ansøgeren", () => {
    expect(PAUSE_MAANEDER).toBe(3);
    expect(TRAPPER.pause).toEqual([{ trinNr: 0, dag: 0, maaneder: 3, handling: "pause_slut", skabelon: null, modtager: "raadgiver" }]);
    expect(pauseTil(kbhTilUtc("2026-09-18", 12, 0))).toBe("2026-12-18");
  });
  it("kladde (Jonas D6): B's påmindelse som trappe — én mail dag 2 fra sidste gem, ingen cron for sig", () => {
    expect(TRAPPER.kladde).toEqual([{ trinNr: 0, dag: 2, handling: "send_mail", skabelon: "ansoegning-kladde-paamindelse", modtager: "ansoeger" }]);
    const gem = kbhTilUtc("2026-09-18", 21, 15); // fredag aften
    const rk = planlaegTrappe({ ansoegningId: ID, trappe: "kladde", anker: gem, nu: gem });
    expect(rk.map((r) => r.planlagt_til)).toEqual([kl("2026-09-21", 10)]); // søndag → mandag kl. 10
    // Et nyt gem = nyt anker = ny nøgle; den gamle række annulleres af planlaegKladde.
    expect(planlaegTrappe({ ansoegningId: ID, trappe: "kladde", anker: new Date(gem.getTime() + 60_000), nu: gem })[0].idempotensnoegle).not.toBe(rk[0].idempotensnoegle);
  });
  it("ingen trappe efter underskrift — betalingsforløbet er platformens eksisterende", () => {
    expect(Object.keys(TRAPPER).sort()).toEqual(["aftalegrundlag", "booket", "indkaldt", "kladde", "pause"]);
    expect(KOE_SKABELONER.some((s) => /betal|faktura|underskr/.test(s))).toBe(false);
  });
});

describe("rykkerkoe — planlægning: hverdage, aldrig efter 16, aldrig weekend (regel 2)", () => {
  it("indkaldt startet fredag 18/9 kl. 14:37: dag 0 nu, dag 2 (søndag) → mandag kl. 10, resten på hverdage kl. 10", () => {
    const nu = kbhTilUtc("2026-09-18", 14, 37);
    const rk = planlaegTrappe({ ansoegningId: ID, trappe: "indkaldt", anker: nu, nu });
    expect(rk.map((r) => [r.trin_nr, r.planlagt_til])).toEqual([
      [0, nu.toISOString()], // dag 0: kl. 10 er passeret, vi er i vinduet → nu
      [1, kl("2026-09-21", 10)],
      [2, kl("2026-09-22", 10)],
      [3, kl("2026-09-25", 10)],
      [4, kl("2026-09-29", 10)],
      [5, kl("2026-10-02", 10)],
    ]);
    expect(rk.every((r) => r.ansoegning_id === ID && r.trappe === "indkaldt")).toBe(true);
    expect(rk[0]).toMatchObject({ handling: "send_mail", skabelon: "ansoegning-indkaldelse", modtager: "ansoeger" });
    expect(rk[5]).toMatchObject({ handling: "luk_svarer_ikke", skabelon: null });
  });

  it("dag 0-mailen følger også vinduet: «tal med dem» kl. 17 → indkaldelsen næste hverdag kl. 07", () => {
    const nu = kbhTilUtc("2026-09-18", 17, 0); // fredag
    const rk = planlaegTrappe({ ansoegningId: ID, trappe: "indkaldt", anker: nu, nu });
    expect(rk[0].planlagt_til).toBe(kl("2026-09-21", 7));
    expect(rk[1].planlagt_til).toBe(kl("2026-09-21", 10)); // dag 2 = søndag → mandag
  });

  it("rykkere lander aldrig på en helligdag: aftalegrundlag sendt 30/3-2026 → dag 2 (1/4, onsdag) ok, dag 5 (4/4 lørdag) → 7/4 efter påske", () => {
    const nu = kbhTilUtc("2026-03-30", 9, 0);
    const rk = planlaegTrappe({ ansoegningId: ID, trappe: "aftalegrundlag", anker: nu, nu });
    expect(rk.map((r) => r.planlagt_til)).toEqual([
      kl("2026-03-30", 10), kl("2026-04-01", 10), kl("2026-04-07", 10), kl("2026-04-08", 10), kl("2026-04-13", 10), kl("2026-04-20", 10),
    ]);
    expect(rk[5]).toMatchObject({ handling: "udloeb", trin_nr: 5 });
  });

  it("booket: samtale mandag 21/9 kl. 09 booket fredag → «i morgen» fredag kl. 10, «i dag» mandag kl. 07, afholdt ved sluttid", () => {
    const samtale = kbhTilUtc("2026-09-21", 9, 0);
    const slut = kbhTilUtc("2026-09-21", 9, 45);
    const nu = kbhTilUtc("2026-09-18", 9, 30);
    const rk = planlaegTrappe({ ansoegningId: ID, trappe: "booket", anker: samtale, samtaleSlut: slut, nu });
    expect(rk.map((r) => [r.handling, r.planlagt_til])).toEqual([
      ["send_mail", kl("2026-09-18", 10)],
      ["send_mail", kl("2026-09-21", 7)],
      ["marker_afholdt", slut.toISOString()],
    ]);
  });

  it("booket: rækker der allerede er passeret udelades; «afholdt» falder tilbage til start + 60 min", () => {
    const samtale = kbhTilUtc("2026-09-21", 9, 0);
    const nu = kbhTilUtc("2026-09-21", 8, 0); // bookede samme morgen
    const rk = planlaegTrappe({ ansoegningId: ID, trappe: "booket", anker: samtale, nu });
    expect(rk.map((r) => r.handling)).toEqual(["marker_afholdt"]);
    expect(rk[0].planlagt_til).toBe(kl("2026-09-21", 10));
  });

  it("booket: en samtale lørdag får ingen samme-morgen-mail (ikke hverdag), men «i morgen» fredag kl. 10", () => {
    const samtale = kbhTilUtc("2026-09-19", 10, 0);
    const nu = kbhTilUtc("2026-09-16", 10, 0);
    const rk = planlaegTrappe({ ansoegningId: ID, trappe: "booket", anker: samtale, nu });
    expect(rk.map((r) => [r.handling, r.planlagt_til])).toEqual([
      ["send_mail", kl("2026-09-18", 10)],
      ["marker_afholdt", kl("2026-09-19", 11)],
    ]);
  });

  it("pause: tre måneder frem, rykket til hverdag kl. 10 (18/12-2026 er fredag)", () => {
    const nu = kbhTilUtc("2026-09-18", 12, 0);
    const rk = planlaegTrappe({ ansoegningId: ID, trappe: "pause", anker: nu, nu });
    expect(rk).toHaveLength(1);
    expect(rk[0]).toMatchObject({ handling: "pause_slut", modtager: "raadgiver", planlagt_til: kl("2026-12-18", 10) });
    // 19/9 + 3 md. = 19/12 (lørdag) → mandag 21/12
    expect(planlaegTrappe({ ansoegningId: ID, trappe: "pause", anker: kbhTilUtc("2026-09-19", 12, 0), nu })[0].planlagt_til).toBe(kl("2026-12-21", 10));
  });
});

describe("rykkerkoe — idempotensnøglen (som stripe-webhookens)", () => {
  it("samme ansøgning + trappe + anker + trin → samme nøgle; nyt anker → nye nøgler", () => {
    const anker = kbhTilUtc("2026-09-18", 14, 37);
    expect(idempotensnoegle(ID, "indkaldt", anker, 2)).toBe(`ansoegning:${ID}:indkaldt:2026-09-18T12:37:00.000Z:2`);
    const a = planlaegTrappe({ ansoegningId: ID, trappe: "indkaldt", anker, nu: anker });
    const b = planlaegTrappe({ ansoegningId: ID, trappe: "indkaldt", anker, nu: new Date(anker.getTime() + 60_000) });
    expect(a.map((r) => r.idempotensnoegle)).toEqual(b.map((r) => r.idempotensnoegle));
    const c = planlaegTrappe({ ansoegningId: ID, trappe: "indkaldt", anker: new Date(anker.getTime() + 1), nu: anker });
    expect(new Set([...a, ...c].map((r) => r.idempotensnoegle)).size).toBe(a.length + c.length);
  });
  it("nøglerne inden for én trappe er alle forskellige", () => {
    const anker = kbhTilUtc("2026-09-18", 10, 0);
    for (const trappe of ["indkaldt", "booket", "aftalegrundlag", "pause"] as const) {
      const rk = planlaegTrappe({ ansoegningId: ID, trappe, anker, nu: kbhTilUtc("2026-09-10", 10, 0) });
      expect(new Set(rk.map((r) => r.idempotensnoegle)).size).toBe(rk.length);
    }
  });
});

describe("rykkerkoe — afgoerSending: vinduet (regel 2) og én mail pr. person pr. dag (regel 3)", () => {
  const planlagt = kbhTilUtc("2026-09-18", 10, 0);
  it("ikke forfalden → vent", () => {
    expect(afgoerSending({ nu: kbhTilUtc("2026-09-18", 9, 59), planlagtTil: planlagt, handling: "send_mail", modtagerHarFaaetMailIDag: false })).toEqual({ ok: false, grund: "ikke_forfalden" });
  });
  it("forfalden, i vinduet, ingen mail i dag → send", () => {
    expect(afgoerSending({ nu: kbhTilUtc("2026-09-18", 10, 5), planlagtTil: planlagt, handling: "send_mail", modtagerHarFaaetMailIDag: false })).toEqual({ ok: true });
  });
  it("forfalden men kl. 16:00 eller lørdag → udskyd til næste sendevindue (mandag 07)", () => {
    expect(afgoerSending({ nu: kbhTilUtc("2026-09-18", 16, 0), planlagtTil: planlagt, handling: "send_mail", modtagerHarFaaetMailIDag: false }))
      .toEqual({ ok: false, grund: "uden_for_vinduet", udskydTil: kbhTilUtc("2026-09-21", 7, 0) });
    expect(afgoerSending({ nu: kbhTilUtc("2026-09-19", 11, 0), planlagtTil: planlagt, handling: "send_mail", modtagerHarFaaetMailIDag: false }))
      .toMatchObject({ ok: false, grund: "uden_for_vinduet", udskydTil: kbhTilUtc("2026-09-21", 7, 0) });
  });
  it("modtageren har allerede fået en mail i dag → udskyd til næste hverdag kl. 10 (fredag → mandag)", () => {
    expect(afgoerSending({ nu: kbhTilUtc("2026-09-18", 11, 0), planlagtTil: planlagt, handling: "send_mail", modtagerHarFaaetMailIDag: true }))
      .toEqual({ ok: false, grund: "allerede_mail_i_dag", udskydTil: kbhTilUtc("2026-09-21", 10, 0) });
    expect(afgoerSending({ nu: kbhTilUtc("2026-09-17", 11, 0), planlagtTil: kbhTilUtc("2026-09-17", 10, 0), handling: "send_mail", modtagerHarFaaetMailIDag: true }))
      .toMatchObject({ udskydTil: kbhTilUtc("2026-09-18", 10, 0) });
  });
  it("interne handlinger (luk, udløb, afholdt, pause_slut) går når de er forfaldne — uanset vindue og dagsregel", () => {
    for (const handling of ["luk_svarer_ikke", "udloeb", "marker_afholdt", "pause_slut"] as const) {
      expect(afgoerSending({ nu: kbhTilUtc("2026-09-19", 23, 0), planlagtTil: planlagt, handling, modtagerHarFaaetMailIDag: true })).toEqual({ ok: true });
    }
  });
});

describe("rykkerkoe — regel 1: enhver reaktion annullerer resten af trappen (via overgangen)", () => {
  it("booking annullerer indkaldt-trappen; underskrift, lukning og «ikke nu» annullerer alle", () => {
    const c = { paaPause: false, lukketFraTrin: null };
    const book = afgoerOvergang("indkaldt", { art: "book" }, c);
    expect(book.ok && book.overgang.annuller).toEqual(["indkaldt"]);
    const under = afgoerOvergang("aftalegrundlag_sendt", { art: "underskrevet" }, c);
    expect(under.ok && under.overgang.annuller).toBe("alle");
    const ikkeNu = afgoerOvergang("aftalegrundlag_sendt", { art: "ikke_nu" }, c);
    expect(ikkeNu.ok && ikkeNu.overgang.annuller).toBe("alle");
    expect(ikkeNu.ok && ikkeNu.overgang.start).toEqual({ trappe: "pause", anker: "nu" });
  });
});
