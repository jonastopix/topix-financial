import { describe, expect, it } from "vitest";
import {
  annoncepriser,
  erDaekket,
  forbrugsdaekning,
  kanStolesPaa,
  periodeOrd,
  sidsteDage,
  udaekketTekst,
  vinduesmuligheder,
  pris,
  STABIL_FRA,
  TROVAERDIG_FRA,
  type Annoncenavn,
  type Forbrugsdag,
} from "@/lib/webinar/annoncepriser";
import type { AnsoegerMail, Tilmelding } from "@/lib/webinar/dashboard";

/**
 * Prisen pr. led (udkast 19/9-2026). Det, der testes hårdest, er de to måder
 * et tal kan lyve på: en division med nul, og en division med ét.
 */
const NU = new Date("2026-09-19T08:00:00.000Z");
const T15 = "2026-09-15T08:00:00.000Z";
const T22 = "2026-09-22T08:00:00.000Z";
const AD_A = "120249061667400694";
const AD_B = "120248713786520694";
const KAMP = "120200000000000001";

const UDEN_SPOR = {
  utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null,
  fbclid: null, origin: null, first_origin: null, referrer: null, first_referrer: null,
  widget_source: null, by: null, land: null, enhed: null, tidszone: null,
} as const;

const R = (r: Partial<Tilmelding> & { email: string }): Tilmelding => ({
  ewebinar_id: `id-${r.email}-${r.utm_content ?? "x"}`,
  navn: null, webinar_id: "w1", webinar_titel: null,
  session_tid: T15, session_type: "Scheduled",
  registreret_at: "2026-09-10T09:00:00.000Z",
  state: null, sidste_action: null, attended: null, subscribed: null,
  set_procent: null, set_procent_kilde: null,
  ...UDEN_SPOR, ...r,
});
const A = (email: string): AnsoegerMail => ({ email, indsendt_at: "2026-09-18T10:00:00.000Z", trin: "ny", virksomhed_slutdato: null });
const M = (email: string): AnsoegerMail => ({ email, indsendt_at: "2026-09-18T10:00:00.000Z", trin: "underskrevet", virksomhed_slutdato: "2027-09-18" });
/**
 * Forbrugsdagens standard-dato er DEN SAMME dag som R()'s standard
 * `registreret_at` (10/9). Det er ikke kosmetik: efter rettelsen 19/9 regnes
 * prisen over ét vindue i begge ender, så en fixture med forbrug den 15. og
 * tilmeldinger den 10. beskriver netop den fejl, rettelsen forbyder — og de
 * ti prøver, der brugte den, fejlede med rette.
 */
const D = (ad_id: string, oere: number, dato = "2026-09-10", campaign_id: string | null = KAMP): Forbrugsdag =>
  ({ ad_id, campaign_id, dato, valuta: "DKK", forbrug_oere: oere });
const N = (ad_id: string, navn: string, kampagne_navn = "Webinar sep"): Annoncenavn =>
  ({ ad_id, campaign_id: KAMP, navn, kampagne_navn });

describe("pris — en division med nul er ikke nul", () => {
  it("antal 0 giver null, ikke 0 og ikke uendelig", () => {
    const p = pris(100_000, 0);
    expect(p.oerePrStk).toBeNull();
    expect(p.tillid).toBe("ingen");
    expect(p.forbrugOere).toBe(100_000);
  });

  it("regner prisen og runder til hele øre", () => {
    expect(pris(100_000, 8).oerePrStk).toBe(12_500);
    expect(pris(100_000, 3).oerePrStk).toBe(33_333);
  });

  it("tilliden trapper ved de to navngivne grænser", () => {
    expect(pris(1000, 1).tillid).toBe("tynd");
    expect(pris(1000, TROVAERDIG_FRA - 1).tillid).toBe("tynd");
    expect(pris(1000, TROVAERDIG_FRA).tillid).toBe("indikativ");
    expect(pris(1000, STABIL_FRA - 1).tillid).toBe("indikativ");
    expect(pris(1000, STABIL_FRA).tillid).toBe("stabil");
  });

  it("kun indikativ og stabil kan der regnes videre på", () => {
    expect(kanStolesPaa(pris(1000, 0))).toBe(false);
    expect(kanStolesPaa(pris(1000, 1))).toBe(false);
    expect(kanStolesPaa(pris(1000, TROVAERDIG_FRA))).toBe(true);
  });

  it("ugyldige tal bliver til nul, ikke til NaN", () => {
    for (const [f, n] of [[Number.NaN, 5], [-100, 5], [1000, Number.NaN], [1000, -3]] as const) {
      const p = pris(f, n);
      expect(Number.isNaN(p.forbrugOere)).toBe(false);
      expect(p.oerePrStk === null || Number.isFinite(p.oerePrStk)).toBe(true);
    }
  });
});

describe("NUL DATA — tre tilstande, ingen af dem er «0 kr.»", () => {
  const tomInd = { tilmeldinger: [], ansoegninger: [], dage: [], annoncer: [] };

  it("«mangler» og «tom» bæres uændret videre til fladen", () => {
    expect(annoncepriser({ ...tomInd, tilstand: "mangler" }, NU).tilstand).toBe("mangler");
    expect(annoncepriser({ ...tomInd, tilstand: "tom" }, NU).tilstand).toBe("tom");
  });

  it("uden forbrug er harForbrug falsk — også når der ER dage med nul", () => {
    expect(annoncepriser({ ...tomInd, tilstand: "tom" }, NU).harForbrug).toBe(false);
    const medNuldage = annoncepriser({ ...tomInd, dage: [D(AD_A, 0)], tilstand: "har" }, NU);
    expect(medNuldage.harForbrug).toBe(false);
    expect(medNuldage.vindue).toEqual({ fra: "2026-09-10", til: "2026-09-10" });
  });

  it("UDEN forbrug findes der intet vindue — og så tælles intet (ny præmis 19/9)", () => {
    // Før rettelsen viste vi antal uden en periode. Det kan vi ikke længere:
    // uden forbrug er der ingen dækning, og et antal uden et vindue kan ikke
    // holdes op mod noget. Fladen viser i stedet tilstandens sætning.
    const d = annoncepriser(
      { tilmeldinger: [R({ email: "a@x.dk", utm_content: AD_A })], ansoegninger: [], dage: [], annoncer: [], tilstand: "tom" },
      NU,
    );
    expect(d.vindue).toBeNull();
    expect(d.daekket).toBe(false);
    expect(d.samlet.prPrTilmelding.tillid).toBe("udaekket");
    // Tilmeldingernes eget spænd står der stadig — det er en kendsgerning.
    expect(d.tilmeldingsspan).toEqual({ fra: "2026-09-10", til: "2026-09-10" });
  });

  it("alt tomt kaster ikke og giver ingen NaN", () => {
    const d = annoncepriser({ ...tomInd, tilstand: "mangler" }, NU);
    expect(d.samlet.prPrMedlem.oerePrStk).toBeNull();
    expect(d.perAnnonce).toEqual([]);
    expect(d.perKampagne).toEqual([]);
    expect(d.vindue).toBeNull();
  });
});

describe("hele kæden — fra annonce til medlem", () => {
  const tilmeldinger = [
    R({ email: "a@x.dk", utm_content: AD_A, session_tid: T15, set_procent: 90 }),
    R({ email: "b@x.dk", utm_content: AD_A, session_tid: T15, set_procent: 90 }),
    R({ email: "c@x.dk", utm_content: AD_A, session_tid: T15, state: "Missed" }),
    R({ email: "d@x.dk", utm_content: AD_B, session_tid: T15, set_procent: 90 }),
  ];
  const dage = [D(AD_A, 300_000), D(AD_A, 100_000, "2026-09-16"), D(AD_B, 200_000)];
  const ind = { tilmeldinger, ansoegninger: [M("a@x.dk"), A("d@x.dk")], dage, annoncer: [N(AD_A, "Annonce A"), N(AD_B, "Annonce B")], tilstand: "har" as const };

  it("pr. annonce: forbrug, antal og fire priser", () => {
    const d = annoncepriser(ind, NU);
    const a = d.perAnnonce.find((x) => x.noegle === `id:${AD_A}`);
    expect(a?.navn).toBe("Annonce A");
    expect(a?.forbrugOere).toBe(400_000);
    expect(a).toMatchObject({ tilmeldte: 3, deltagere: 2, ansoegte: 1, medlemmer: 1 });
    expect(a?.prPrTilmelding.oerePrStk).toBe(Math.round(400_000 / 3));
    expect(a?.prPrDeltager.oerePrStk).toBe(200_000);
    expect(a?.prPrAnsoegning.oerePrStk).toBe(400_000);
    expect(a?.prPrMedlem.oerePrStk).toBe(400_000);
  });

  it("ET medlem giver en TYND pris — den vises, men er markeret", () => {
    const d = annoncepriser(ind, NU);
    const a = d.perAnnonce.find((x) => x.noegle === `id:${AD_A}`);
    expect(a?.prPrMedlem.antal).toBe(1);
    expect(a?.prPrMedlem.tillid).toBe("tynd");
    expect(kanStolesPaa(a!.prPrMedlem)).toBe(false);
  });

  it("annoncen uden medlemmer får INGEN pris pr. medlem — ikke «0 kr.»", () => {
    const b = annoncepriser(ind, NU).perAnnonce.find((x) => x.noegle === `id:${AD_B}`);
    expect(b?.medlemmer).toBe(0);
    expect(b?.prPrMedlem.oerePrStk).toBeNull();
    expect(b?.prPrAnsoegning.oerePrStk).toBe(200_000);
  });

  it("i alt lægger forbruget sammen og tæller personer, ikke rækker", () => {
    const d = annoncepriser(ind, NU);
    expect(d.samlet.forbrugOere).toBe(600_000);
    expect(d.samlet.tilmeldte).toBe(4);
    expect(d.samlet.medlemmer).toBe(1);
  });

  it("sorteret efter forbrug, størst først", () => {
    expect(annoncepriser(ind, NU).perAnnonce.map((x) => x.noegle)).toEqual([`id:${AD_A}`, `id:${AD_B}`]);
  });

  it("samme person to gange tælles ÉN gang — ved sin FØRSTE tilmelding", () => {
    const d = annoncepriser({
      ...ind,
      // Forbruget dækker BEGGE tilmeldingsdage, så det er tilskrivningen der
      // prøves her — ikke vinduet (det har sin egen blok nedenfor).
      dage: [D(AD_A, 300_000, "2026-09-01"), D(AD_B, 200_000, "2026-09-10")],
      tilmeldinger: [
        R({ email: "z@x.dk", ewebinar_id: "r1", utm_content: AD_A, registreret_at: "2026-09-01T09:00:00.000Z" }),
        R({ email: "z@x.dk", ewebinar_id: "r2", utm_content: AD_B, registreret_at: "2026-09-10T09:00:00.000Z" }),
      ],
      ansoegninger: [],
    }, NU);
    expect(d.samlet.tilmeldte).toBe(1);
    expect(d.perAnnonce.find((x) => x.noegle === `id:${AD_A}`)?.tilmeldte).toBe(1);
    expect(d.perAnnonce.find((x) => x.noegle === `id:${AD_B}`)?.tilmeldte).toBe(0);
  });
});

describe("KÆDEBRUDDENE — talt, ikke skjult", () => {
  it("tilmelding uden utm_content kan aldrig knyttes til en annonce", () => {
    const d = annoncepriser({
      tilmeldinger: [R({ email: "a@x.dk" }), R({ email: "b@x.dk", utm_content: AD_A })],
      ansoegninger: [], dage: [D(AD_A, 100_000)], annoncer: [], tilstand: "har",
    }, NU);
    expect(d.brud.udenAnnoncemaerke).toBe(1);
    expect(d.brud.personer).toBe(2);
    // men den tæller stadig med i «i alt» — pengene gav også hende.
    expect(d.samlet.tilmeldte).toBe(2);
  });

  it("et mærke der ikke ligner et Meta-id tælles for sig — makroen er ikke sat", () => {
    const d = annoncepriser({
      tilmeldinger: [R({ email: "a@x.dk", utm_content: "sommer-kampagne" }), R({ email: "b@x.dk", utm_content: "3" })],
      // Forbrug på samme dag som tilmeldingerne — ellers findes der intet
      // vindue, og bruddene ville ikke kunne tælles.
      ansoegninger: [], dage: [D(AD_A, 100_000)], annoncer: [], tilstand: "har",
    }, NU);
    expect(d.brud.maerkeErIkkeId).toBe(2);
    expect(d.brud.udenAnnoncemaerke).toBe(0);
    // Ingen af de to mærker bliver til en annoncelinje — de KAN ikke slås op.
    expect(d.perAnnonce.map((x) => x.noegle)).not.toContain("navn:sommer-kampagne");
    expect(d.perAnnonce.map((x) => x.noegle)).not.toContain("navn:3");
    // AD_A står der derimod, fordi den har forbrug uden en eneste tilmelding.
    expect(d.perAnnonce.map((x) => x.noegle)).toEqual([`id:${AD_A}`]);
    expect(d.perAnnonce[0].tilmeldte).toBe(0);
  });

  it("annonce med forbrug uden tilmeldinger vises som en linje med nuller — det er dens pointe", () => {
    const d = annoncepriser({
      tilmeldinger: [], ansoegninger: [], dage: [D(AD_A, 500_000)], annoncer: [N(AD_A, "Spildt")], tilstand: "har",
    }, NU);
    expect(d.brud.forbrugUdenTilmeldinger).toBe(1);
    const a = d.perAnnonce[0];
    expect(a.forbrugOere).toBe(500_000);
    expect(a.tilmeldte).toBe(0);
    expect(a.prPrTilmelding.oerePrStk).toBeNull();
  });

  it("tilmelding der peger på en annonce uden forbrug tælles også", () => {
    const d = annoncepriser({
      tilmeldinger: [R({ email: "a@x.dk", utm_content: AD_A })],
      // Forbrug på en ANDEN annonce: vinduet findes, men AD_A har intet forbrug.
      ansoegninger: [], dage: [D(AD_B, 100_000)], annoncer: [], tilstand: "har",
    }, NU);
    expect(d.brud.udenForbrug).toBe(1);
  });
});

describe("valutaen følger beløbet", () => {
  it("flere valutaer på samme linje bliver stående, så de ikke lægges sammen i tavshed", () => {
    const d = annoncepriser({
      tilmeldinger: [], ansoegninger: [],
      dage: [D(AD_A, 100_000), { ...D(AD_A, 50_000, "2026-09-16"), valuta: "EUR" }],
      annoncer: [], tilstand: "har",
    }, NU);
    expect(d.perAnnonce[0].valutaer).toEqual(["DKK", "EUR"]);
  });

  it("én valuta er én valuta", () => {
    const d = annoncepriser({ tilmeldinger: [], ansoegninger: [], dage: [D(AD_A, 100_000)], annoncer: [], tilstand: "har" }, NU);
    expect(d.perAnnonce[0].valutaer).toEqual(["DKK"]);
  });
});

describe("de kommende tæller ikke som deltagere", () => {
  it("en tilmelding til et webinar der ikke er afholdt, giver ingen pris pr. deltager", () => {
    const d = annoncepriser({
      tilmeldinger: [R({ email: "a@x.dk", utm_content: AD_A, session_tid: T22 })],
      ansoegninger: [], dage: [D(AD_A, 100_000)], annoncer: [], tilstand: "har",
    }, NU);
    expect(d.samlet.tilmeldte).toBe(1);
    expect(d.samlet.deltagere).toBe(0);
    expect(d.samlet.prPrDeltager.oerePrStk).toBeNull();
    expect(d.samlet.prPrTilmelding.oerePrStk).toBe(100_000);
  });
});

// ── VINDUET: fejlen Jonas fandt 19/9 ──────────────────────────────────────

describe("ét vindue i BEGGE ender — fejlen der gav en pris fem gange for lav", () => {
  /**
   * Prods form, forenklet til samme forhold: forbruget er hentet for ÉN uge
   * (12.–18. september), mens tilmeldingerne går tilbage til 17. august.
   * Den gamle kode delte hele forbruget med ALLE tilmeldinger.
   */
  const FORBRUG = [D(AD_A, 546_400, "2026-09-15")];
  const iUgen = [...Array(20).keys()].map((i) =>
    R({ email: `u${i}@x.dk`, utm_content: AD_A, registreret_at: `2026-09-1${5 + (i % 4)}T09:00:00.000Z` }));
  const foerUgen = [...Array(80).keys()].map((i) =>
    R({ email: `f${i}@x.dk`, utm_content: AD_A, registreret_at: `2026-08-${20 + (i % 9)}T09:00:00.000Z` }));
  const ind = { tilmeldinger: [...foerUgen, ...iUgen], ansoegninger: [], dage: FORBRUG, annoncer: [], tilstand: "har" as const };

  it("tæller KUN de tilmeldinger, der faldt i forbrugets vindue", () => {
    const d = annoncepriser(ind, NU);
    expect(d.vindue).toEqual({ fra: "2026-09-15", til: "2026-09-15" });
    // 15/9 alene: hver fjerde af de tyve i ugen.
    expect(d.samlet.tilmeldte).toBe(5);
    expect(d.samlet.forbrugOere).toBe(546_400);
    expect(d.samlet.prPrTilmelding.oerePrStk).toBe(546_400 / 5);
  });

  it("DEN GAMLE FEJL: havde vi delt med alle 100, var prisen blevet fem gange for lav", () => {
    const d = annoncepriser(ind, NU);
    const rigtig = d.samlet.prPrTilmelding.oerePrStk!;
    const gammelForkert = Math.round(546_400 / 100);
    expect(rigtig).toBeGreaterThan(gammelForkert * 4);
    expect(d.samlet.tilmeldte).not.toBe(100);
  });

  it("tilmeldingernes eget spænd står ved siden af, så forskellen kan SES", () => {
    const d = annoncepriser(ind, NU);
    expect(d.tilmeldingsspan?.fra).toBe("2026-08-20");
    expect(d.daekning).toEqual({ fra: "2026-09-15", til: "2026-09-15" });
  });
});

describe("dækningen afgør, hvad der kan regnes", () => {
  const uge = [D(AD_A, 500_000, "2026-09-12"), D(AD_A, 46_400, "2026-09-18")];

  it("forbrugsdaekning er min og maks dato", () => {
    expect(forbrugsdaekning(uge)).toEqual({ fra: "2026-09-12", til: "2026-09-18" });
    expect(forbrugsdaekning([])).toBeNull();
  });

  it("erDaekket er sand KUN når vinduet ligger helt inden for dækningen", () => {
    const d = { fra: "2026-09-12", til: "2026-09-18" };
    expect(erDaekket({ fra: "2026-09-13", til: "2026-09-17" }, d)).toBe(true);
    expect(erDaekket(d, d)).toBe(true);
    expect(erDaekket({ fra: "2026-09-11", til: "2026-09-18" }, d)).toBe(false); // for langt bagud
    expect(erDaekket({ fra: "2026-09-12", til: "2026-09-19" }, d)).toBe(false); // for langt frem
    expect(erDaekket(d, null)).toBe(false);
  });

  it("sidsteDage er INKLUSIVE i begge ender — 7 dage er syv dage", () => {
    const v = sidsteDage(7, new Date("2026-09-18T08:00:00.000Z"));
    expect(v).toEqual({ fra: "2026-09-12", til: "2026-09-18" });
  });

  it("et UDÆKKET vindue giver INGEN pris — ikke et forkert tal", () => {
    // 30 dage tilbage fra 19/9 rækker til 21/8; forbruget starter 12/9.
    const d = annoncepriser({
      tilmeldinger: [R({ email: "a@x.dk", utm_content: AD_A, registreret_at: "2026-09-14T09:00:00.000Z" })],
      ansoegninger: [], dage: uge, annoncer: [], tilstand: "har", valg: "30dage",
    }, NU);
    expect(d.daekket).toBe(false);
    expect(d.samlet.prPrTilmelding.tillid).toBe("udaekket");
    expect(d.samlet.prPrTilmelding.oerePrStk).toBeNull();
    for (const p of [d.samlet.prPrDeltager, d.samlet.prPrAnsoegning, d.samlet.prPrMedlem]) {
      expect(p.oerePrStk).toBeNull();
    }
  });

  it("mulighederne siger hvilke vinduer der KAN vælges", () => {
    const m = vinduesmuligheder(uge, NU);
    expect(m.find((x) => x.valg === "daekning")).toMatchObject({ daekket: true, vindue: { fra: "2026-09-12", til: "2026-09-18" } });
    // 19/9 er ikke i forbruget, så «sidste 7 dage» (13.–19.) rækker for langt frem.
    expect(m.find((x) => x.valg === "7dage")?.daekket).toBe(false);
    expect(m.find((x) => x.valg === "30dage")?.daekket).toBe(false);
  });

  it("uden forbrug kan INTET vindue vælges, og intet kan regnes", () => {
    const m = vinduesmuligheder([], NU);
    expect(m.every((x) => !x.daekket)).toBe(true);
    const d = annoncepriser({ tilmeldinger: [], ansoegninger: [], dage: [], annoncer: [], tilstand: "tom" }, NU);
    expect(d.daekket).toBe(false);
    expect(d.vindue).toBeNull();
  });
});

describe("periodeOrd og udaekketTekst — perioden skal kunne læses", () => {
  it("samme måned bliver til ét månedsnavn", () => {
    expect(periodeOrd({ fra: "2026-09-12", til: "2026-09-18" })).toBe("12.–18. september");
  });

  it("én dag er én dag; to måneder er to navne", () => {
    expect(periodeOrd({ fra: "2026-09-15", til: "2026-09-15" })).toBe("15. september");
    expect(periodeOrd({ fra: "2026-08-17", til: "2026-09-18" })).toBe("17. august – 18. september");
    expect(periodeOrd(null)).toBeNull();
  });

  it("den udækkede sætning nævner hvad vi FAKTISK har", () => {
    const t = udaekketTekst({ fra: "2026-08-21", til: "2026-09-19" }, { fra: "2026-09-12", til: "2026-09-18" });
    expect(t).toContain("12.–18. september");
    expect(t).toContain("kan ikke regnes");
  });

  it("uden forbrug siger den det, i stedet for at nævne et tomt spænd", () => {
    expect(udaekketTekst(null, null)).toContain("intet forbrug hentet");
  });
});

// ── KOBLINGEN: fejlen Jonas målte i prod 19/9 kl. 18.20 ───────────────────

describe("navne kobler — men kun ÉN gang", () => {
  const NAVN = "IMG | 11-maaneskin | 2026-08-17";
  /** Fire annoncer bærer det SAMME navn — præcis som i prod. */
  const FIRE = [
    { ad_id: "120240000000000001", campaign_id: KAMP, navn: NAVN, kampagne_navn: "Webinar sep" },
    { ad_id: "120240000000000002", campaign_id: KAMP, navn: NAVN, kampagne_navn: "Webinar sep" },
    { ad_id: "120240000000000003", campaign_id: KAMP, navn: NAVN, kampagne_navn: "Webinar sep" },
    { ad_id: "120240000000000004", campaign_id: KAMP, navn: NAVN, kampagne_navn: "Webinar sep" },
  ];
  const FORBRUG = [D("120240000000000001", 10_000), D("120240000000000002", 20_000), D("120240000000000003", 30_000), D("120240000000000004", 40_000)];
  /** 53 personer, alle med NAVNET i utm_content — ikke et id. */
  const TILMELDTE = [...Array(53).keys()].map((i) => R({ email: `n${i}@x.dk`, utm_content: NAVN }));
  const ind = { tilmeldinger: TILMELDTE, ansoegninger: [], dage: FORBRUG, annoncer: FIRE, tilstand: "har" as const };

  it("ÉN linje, ikke fire — og forbruget er lagt sammen", () => {
    const d = annoncepriser(ind, NU);
    const navnelinjer = d.perAnnonce.filter((l) => l.koblingsform === "navn");
    expect(navnelinjer).toHaveLength(1);
    expect(navnelinjer[0].navn).toBe(NAVN);
    expect(navnelinjer[0].annoncer).toBe(4);
    expect(navnelinjer[0].forbrugOere).toBe(100_000);
    expect(navnelinjer[0].tilmeldte).toBe(53);
  });

  it("DEN GAMLE FEJL: fire linjer med 53 hver ville give fire forskellige priser", () => {
    const d = annoncepriser(ind, NU);
    const l = d.perAnnonce.find((x) => x.koblingsform === "navn")!;
    // Rigtigt: 100.000 øre / 53.
    expect(l.prPrTilmelding.oerePrStk).toBe(Math.round(100_000 / 53));
    // Den naive join ville have givet 10.000/53, 20.000/53, 30.000/53, 40.000/53.
    for (const forkert of [10_000, 20_000, 30_000, 40_000]) {
      expect(l.prPrTilmelding.oerePrStk).not.toBe(Math.round(forkert / 53));
    }
  });

  it("de fire annoncer optræder IKKE også hver for sig", () => {
    const d = annoncepriser(ind, NU);
    for (const ad of ["120240000000000001", "120240000000000002", "120240000000000003", "120240000000000004"]) {
      expect(d.perAnnonce.map((l) => l.noegle)).not.toContain(`id:${ad}`);
    }
    expect(d.brud.delteNavne).toBe(1);
    expect(d.brud.kobletPaaNavn).toBe(53);
  });

  it("id VINDER over navn, når begge peger på samme annonce", () => {
    const d = annoncepriser({
      ...ind,
      tilmeldinger: [...TILMELDTE, R({ email: "id@x.dk", utm_content: "120240000000000001" })],
    }, NU);
    const viaId = d.perAnnonce.find((l) => l.noegle === "id:120240000000000001");
    const viaNavn = d.perAnnonce.find((l) => l.koblingsform === "navn");
    expect(viaId?.tilmeldte).toBe(1);
    expect(viaId?.forbrugOere).toBe(10_000);           // den nævntes forbrug er IKKE i navnegruppen
    expect(viaNavn?.forbrugOere).toBe(90_000);          // de tre øvrige
    expect(viaNavn?.annoncer).toBe(3);
  });
});

describe("VÆRN: en tilmelding må aldrig ligge i mere end én række", () => {
  const NAVN = "delt navn";
  const opsaetninger: Array<{ hvad: string; ind: Parameters<typeof annoncepriser>[0] }> = [
    {
      hvad: "navne delt af flere annoncer",
      ind: {
        tilmeldinger: [...Array(10).keys()].map((i) => R({ email: `a${i}@x.dk`, utm_content: NAVN })),
        ansoegninger: [],
        dage: [D("120250000000000001", 10_000), D("120250000000000002", 20_000)],
        annoncer: [
          { ad_id: "120250000000000001", campaign_id: KAMP, navn: NAVN, kampagne_navn: "K" },
          { ad_id: "120250000000000002", campaign_id: KAMP, navn: NAVN, kampagne_navn: "K" },
        ],
        tilstand: "har",
      },
    },
    {
      hvad: "id og navn blandet",
      ind: {
        tilmeldinger: [
          R({ email: "x@x.dk", utm_content: "120250000000000001" }),
          R({ email: "y@x.dk", utm_content: NAVN }),
          R({ email: "z@x.dk", utm_content: "intet-match" }),
          R({ email: "w@x.dk" }),
        ],
        ansoegninger: [],
        dage: [D("120250000000000001", 10_000), D("120250000000000002", 20_000)],
        annoncer: [
          { ad_id: "120250000000000001", campaign_id: KAMP, navn: NAVN, kampagne_navn: "K" },
          { ad_id: "120250000000000002", campaign_id: KAMP, navn: NAVN, kampagne_navn: "K" },
        ],
        tilstand: "har",
      },
    },
  ];

  for (const { hvad, ind } of opsaetninger) {
    it(`summen af rækkernes tilmeldte overstiger aldrig antallet af personer — ${hvad}`, () => {
      const d = annoncepriser(ind, NU);
      const sum = d.perAnnonce.reduce((n, l) => n + l.tilmeldte, 0);
      expect(sum).toBeLessThanOrEqual(d.samlet.tilmeldte);
      const kampagnesum = d.perKampagne.reduce((n, l) => n + l.tilmeldte, 0);
      expect(kampagnesum).toBeLessThanOrEqual(d.samlet.tilmeldte);
    });

    it(`forbruget lægges aldrig sammen to gange — ${hvad}`, () => {
      const d = annoncepriser(ind, NU);
      const iAlt = ind.dage.reduce((n, x) => n + x.forbrug_oere, 0);
      expect(d.perAnnonce.reduce((n, l) => n + l.forbrugOere, 0)).toBe(iAlt);
      expect(d.perKampagne.reduce((n, l) => n + l.forbrugOere, 0)).toBe(iAlt);
      expect(d.samlet.forbrugOere).toBe(iAlt);
    });

    it(`hver annonce hører til PRÆCIS én linje — ${hvad}`, () => {
      const d = annoncepriser(ind, NU);
      expect(d.perAnnonce.reduce((n, l) => n + l.annoncer, 0)).toBe(ind.dage.length);
    });
  }
});

describe("et mærke der hverken er id eller kendt navn er stadig en blindgyde", () => {
  it("tælles i maerkeErIkkeId og bliver ikke til en linje", () => {
    const d = annoncepriser({
      tilmeldinger: [R({ email: "a@x.dk", utm_content: "findes-ikke" })],
      ansoegninger: [], dage: [D(AD_A, 100_000)], annoncer: [N(AD_A, "Rigtig")], tilstand: "har",
    }, NU);
    expect(d.brud.maerkeErIkkeId).toBe(1);
    expect(d.brud.kobletPaaNavn).toBe(0);
    expect(d.perAnnonce.map((l) => l.navn)).not.toContain("findes-ikke");
  });
});
