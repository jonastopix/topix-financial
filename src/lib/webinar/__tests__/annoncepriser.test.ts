import { describe, expect, it } from "vitest";
import {
  annoncepriser,
  kanStolesPaa,
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
const D = (ad_id: string, oere: number, dato = "2026-09-15", campaign_id: string | null = KAMP): Forbrugsdag =>
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
    expect(medNuldage.periode).toEqual({ fra: "2026-09-15", til: "2026-09-15" });
  });

  it("tilmeldinger UDEN forbrug giver stadig antal — men ingen pris", () => {
    const d = annoncepriser(
      { tilmeldinger: [R({ email: "a@x.dk", utm_content: AD_A })], ansoegninger: [], dage: [], annoncer: [], tilstand: "tom" },
      NU,
    );
    expect(d.samlet.tilmeldte).toBe(1);
    expect(d.samlet.forbrugOere).toBe(0);
    expect(d.samlet.prPrTilmelding.oerePrStk).toBe(0);
  });

  it("alt tomt kaster ikke og giver ingen NaN", () => {
    const d = annoncepriser({ ...tomInd, tilstand: "mangler" }, NU);
    expect(d.samlet.prPrMedlem.oerePrStk).toBeNull();
    expect(d.perAnnonce).toEqual([]);
    expect(d.perKampagne).toEqual([]);
    expect(d.periode).toBeNull();
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
    const a = d.perAnnonce.find((x) => x.noegle === AD_A);
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
    const a = d.perAnnonce.find((x) => x.noegle === AD_A);
    expect(a?.prPrMedlem.antal).toBe(1);
    expect(a?.prPrMedlem.tillid).toBe("tynd");
    expect(kanStolesPaa(a!.prPrMedlem)).toBe(false);
  });

  it("annoncen uden medlemmer får INGEN pris pr. medlem — ikke «0 kr.»", () => {
    const b = annoncepriser(ind, NU).perAnnonce.find((x) => x.noegle === AD_B);
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
    expect(annoncepriser(ind, NU).perAnnonce.map((x) => x.noegle)).toEqual([AD_A, AD_B]);
  });

  it("samme person to gange tælles ÉN gang — ved sin FØRSTE tilmelding", () => {
    const d = annoncepriser({
      ...ind,
      tilmeldinger: [
        R({ email: "z@x.dk", ewebinar_id: "r1", utm_content: AD_A, registreret_at: "2026-09-01T09:00:00.000Z" }),
        R({ email: "z@x.dk", ewebinar_id: "r2", utm_content: AD_B, registreret_at: "2026-09-10T09:00:00.000Z" }),
      ],
      ansoegninger: [],
    }, NU);
    expect(d.samlet.tilmeldte).toBe(1);
    expect(d.perAnnonce.find((x) => x.noegle === AD_A)?.tilmeldte).toBe(1);
    expect(d.perAnnonce.find((x) => x.noegle === AD_B)?.tilmeldte).toBe(0);
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
      ansoegninger: [], dage: [], annoncer: [], tilstand: "har",
    }, NU);
    expect(d.brud.maerkeErIkkeId).toBe(2);
    expect(d.brud.udenAnnoncemaerke).toBe(0);
    expect(d.perAnnonce).toEqual([]);
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
      ansoegninger: [], dage: [], annoncer: [], tilstand: "har",
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
