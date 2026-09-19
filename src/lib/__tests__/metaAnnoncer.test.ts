import { describe, expect, it } from "vitest";
import {
  DAGE_BAGUD,
  doemKobling,
  dubletter,
  erMetaObjektId,
  GRAPH_VERSION,
  heltalAf,
  erUkendtFelt,
  FELTER_MINIMALT,
  FELTER_PR_TYPE,
  insightsUrl,
  isoDato,
  kommatalAf,
  oereAf,
  opslagbareIder,
  opslagUrl,
  tilAnnoncekort,
  tilDagsraekker,
  typeRaekkefoelge,
  udenToken,
  vindue,
  type Koblingslinje,
} from "@/lib/metaAnnoncer";

// Den rene del af Meta-hentningen (19/9-2026, recon-meta-annoncer).
// Tallene i prøverne er Jonas' målte: 597 tilmeldinger, 11 utm_content, 3 utm_campaign.

describe("erMetaObjektId og opslagbareIder", () => {
  it("de rigtige id'er fra prod genkendes", () => {
    expect(erMetaObjektId("120249061667400694")).toBe(true); // utm_content
    expect(erMetaObjektId("120248713786520694")).toBe(true); // utm_campaign
  });

  it("alt der ikke kan slås op, falder udenfor — også det der ligner", () => {
    for (const v of ["", "   ", "sommer-kampagne", "3", "12345678", "120249061667400694x", "1202 4906", null, undefined]) {
      expect(erMetaObjektId(v)).toBe(false);
    }
    // Mellemrum omkring et gyldigt id er stadig et gyldigt id.
    expect(erMetaObjektId("  120249061667400694  ")).toBe(true);
  });

  it("opslagbareIder trimmer, fjerner dubletter og bevarer rækkefølgen", () => {
    expect(opslagbareIder(["120249061667400694", "  120249061667400694 ", "fb-ad-1", null, "120248713786520694"]))
      .toEqual(["120249061667400694", "120248713786520694"]);
  });
});

describe("vindue — sidste syv døgn, og aldrig i dag", () => {
  it("i dag tages ikke med: dagens tal er ufærdige", () => {
    const nu = new Date("2026-10-19T05:00:00Z");
    expect(vindue(nu)).toEqual({ since: "2026-10-12", until: "2026-10-18" });
  });

  it("vinduet er præcis DAGE_BAGUD døgn", () => {
    const v = vindue(new Date("2026-10-19T05:00:00Z"));
    const dage = (Date.parse(v.until) - Date.parse(v.since)) / 86_400_000 + 1;
    expect(dage).toBe(DAGE_BAGUD);
  });

  it("virker hen over et månedsskift og et årsskift", () => {
    expect(vindue(new Date("2026-11-03T05:00:00Z"))).toEqual({ since: "2026-10-27", until: "2026-11-02" });
    expect(vindue(new Date("2027-01-02T05:00:00Z"))).toEqual({ since: "2026-12-26", until: "2027-01-01" });
  });

  it("isoDato regner på UTC — ikke på maskinens tidszone", () => {
    expect(isoDato(new Date("2026-10-19T23:30:00Z"))).toBe("2026-10-19");
    expect(isoDato(new Date("2026-10-19T00:30:00Z"))).toBe("2026-10-19");
  });
});

describe("pengene — heltal, og aldrig et gæt", () => {
  it("Metas decimalstreng bliver til øre", () => {
    expect(oereAf("123.45")).toBe(12345);
    expect(oereAf("0")).toBe(0);
    expect(oereAf("0.00")).toBe(0);
    expect(oereAf("1000")).toBe(100000);
    expect(oereAf(12.5)).toBe(1250);
  });

  it("afrunding til nærmeste øre", () => {
    expect(oereAf("0.005")).toBe(1);
    expect(oereAf("0.004")).toBe(0);
  });

  it("det ulæselige giver null, ALDRIG 0 — et nulforbrug og et ulæst forbrug er ikke det samme", () => {
    for (const v of ["", "  ", "abc", "1,5", "1.2.3", null, undefined, {}, NaN]) {
      expect(oereAf(v)).toBeNull();
    }
  });

  it("heltalAf og kommatalAf følger samme regel", () => {
    expect(heltalAf("4210")).toBe(4210);
    expect(heltalAf("12.6")).toBe(13);
    expect(heltalAf("x")).toBeNull();
    expect(kommatalAf("1.37")).toBeCloseTo(1.37);
    expect(kommatalAf("x")).toBeNull();
  });
});

describe("URL'erne", () => {
  it("versionen er pinnet ét sted", () => {
    expect(GRAPH_VERSION).toBe("v26.0");
    expect(opslagUrl("120249061667400694", "T")).toContain("/v26.0/");
  });

  it("insights beder om én række pr. annonce pr. dag", () => {
    const u = insightsUrl("act_1", "T", { since: "2026-10-12", until: "2026-10-18" });
    expect(u).toContain("level=ad");
    expect(u).toContain("time_increment=1");
    expect(decodeURIComponent(u)).toContain('{"since":"2026-10-12","until":"2026-10-18"}');
  });

  it("tokenet kan fjernes af enhver URL, der logges", () => {
    expect(udenToken(opslagUrl("120249061667400694", "HEMMELIGT"))).not.toContain("HEMMELIGT");
    expect(udenToken(insightsUrl("act_1", "HEMMELIGT", { since: "a", until: "b" }))).not.toContain("HEMMELIGT");
    // Også på Metas eget paging-link, hvor tokenet står midt i.
    expect(udenToken("https://graph.facebook.com/v26.0/x?a=1&access_token=HEMMELIGT&after=abc")).toBe(
      "https://graph.facebook.com/v26.0/x?a=1&access_token=…&after=abc",
    );
  });
});

describe("tilDagsraekker", () => {
  const raa = [
    { ad_id: "120249061667400694", adset_id: "9", campaign_id: "120248713786520694", spend: "412.50", impressions: "10421", clicks: "212", inline_link_clicks: "180", reach: "8100", frequency: "1.29", date_start: "2026-10-12", date_stop: "2026-10-12" },
    { ad_id: "120249061667400694", adset_id: "9", campaign_id: "120248713786520694", spend: "0", impressions: "0", clicks: "0", date_start: "2026-10-13", date_stop: "2026-10-13" },
  ];

  it("oversætter tal, valuta og dato", () => {
    const { raekker, sprunget } = tilDagsraekker(raa, "DKK");
    expect(sprunget).toEqual([]);
    expect(raekker[0]).toMatchObject({
      ad_id: "120249061667400694", dato: "2026-10-12", valuta: "DKK",
      forbrug_oere: 41250, visninger: 10421, klik: 212, link_klik: 180, raekkevidde: 8100,
    });
    expect(raekker[0].frekvens).toBeCloseTo(1.29);
    // En dag med nul forbrug ER en dagsrække — den skal med.
    expect(raekker[1]).toMatchObject({ dato: "2026-10-13", forbrug_oere: 0 });
    expect(raekker[1].link_klik).toBeNull();
  });

  it("en række uden læsbart forbrug SPRINGES OVER — den gemmes ikke som 0", () => {
    const { raekker, sprunget } = tilDagsraekker(
      [...raa, { ad_id: "1", spend: "ikke et tal", date_start: "2026-10-14" }, { spend: "1", date_start: "2026-10-14" }, { ad_id: "2", spend: "1" }],
      "DKK",
    );
    expect(raekker).toHaveLength(2);
    expect(sprunget).toHaveLength(3);
    expect(sprunget[0]).toMatchObject({ ad_id: "1", dato: "2026-10-14" });
    expect(sprunget[0].grund).toContain("spend");
    expect(sprunget[1].grund).toContain("ad_id");
    expect(sprunget[2].grund).toContain("date_start");
  });

  it("tom ind giver tom ud — nul data er et gyldigt svar", () => {
    expect(tilDagsraekker([], "DKK")).toEqual({ raekker: [], sprunget: [] });
  });
});

describe("dubletter — værnet mod at time_increment=1 ikke gør, som vi tror", () => {
  it("to rækker for samme annonce samme dag findes", () => {
    const { raekker } = tilDagsraekker(
      [
        { ad_id: "a", spend: "1", date_start: "2026-10-12" },
        { ad_id: "a", spend: "2", date_start: "2026-10-12" },
        { ad_id: "a", spend: "3", date_start: "2026-10-13" },
        { ad_id: "b", spend: "4", date_start: "2026-10-12" },
      ],
      "DKK",
    );
    expect(dubletter(raekker)).toEqual(["a|2026-10-12"]);
  });

  it("den normale kørsel har ingen", () => {
    const { raekker } = tilDagsraekker(
      [{ ad_id: "a", spend: "1", date_start: "2026-10-12" }, { ad_id: "a", spend: "2", date_start: "2026-10-13" }],
      "DKK",
    );
    expect(dubletter(raekker)).toEqual([]);
  });
});

describe("tilAnnoncekort", () => {
  it("plukker navn, tekst og billede ud af de indlejrede objekter", () => {
    const kort = tilAnnoncekort([
      {
        id: "120249061667400694", name: "Webinar — video A", status: "ACTIVE", effective_status: "ACTIVE",
        adset: { id: "9", name: "25-55 DK" },
        campaign: { id: "120248713786520694", name: "Webinar okt" },
        creative: { id: "c1", title: "Få styr på tallene", body: "Gratis webinar for SMV'er", image_url: "https://x/i.jpg", link_url: "https://theboardroom.dk" },
      },
    ]);
    expect(kort[0]).toMatchObject({
      ad_id: "120249061667400694", adset_id: "9", campaign_id: "120248713786520694",
      navn: "Webinar — video A", adsaet_navn: "25-55 DK", kampagne_navn: "Webinar okt",
      overskrift: "Få styr på tallene", brodtekst: "Gratis webinar for SMV'er", billede_url: "https://x/i.jpg",
    });
  });

  it("thumbnail bruges når image_url mangler (video-annoncer)", () => {
    const kort = tilAnnoncekort([{ id: "1", creative: { thumbnail_url: "https://x/t.jpg", video_id: "77" } }]);
    expect(kort[0]).toMatchObject({ billede_url: "https://x/t.jpg", video_id: "77" });
  });

  it("en annonce uden id springes over; tomme felter bliver null, ikke tom streng", () => {
    const kort = tilAnnoncekort([{ name: "uden id" }, { id: "1", name: "   " }]);
    expect(kort).toHaveLength(1);
    expect(kort[0].navn).toBeNull();
  });
});

describe("doemKobling — trin 1's dom", () => {
  it("hver type bedes KUN om sine egne felter — det var fejlen 19/9", () => {
    // «objective» bor på kampagnen, «campaign» og «creative» på annoncen.
    // Blandes de, svarer Graph 400 «(#100) Tried accessing nonexisting field».
    expect(FELTER_PR_TYPE.ad).not.toContain("objective");
    expect(FELTER_PR_TYPE.campaign).not.toContain("creative");
    expect(FELTER_PR_TYPE.campaign).not.toContain("campaign{");
    expect(FELTER_PR_TYPE.adset).not.toContain("creative");
    // Og hver type bærer sit eget kendetegn.
    expect(FELTER_PR_TYPE.ad).toContain("creative{");
    expect(FELTER_PR_TYPE.campaign).toContain("objective");
    expect(FELTER_PR_TYPE.adset).toContain("optimization_goal");
    // Det minimale feltsæt skal kunne stå på alle tre.
    expect(FELTER_MINIMALT).toBe("id,name");
  });

  it("den forventede type prøves først — ét kald i det normale tilfælde", () => {
    expect(typeRaekkefoelge("utm_content")[0]).toBe("ad");
    expect(typeRaekkefoelge("utm_campaign")[0]).toBe("campaign");
    // Alle tre prøves, så et forkert mærket felt stadig kan afgøres.
    for (const felt of ["utm_content", "utm_campaign"] as const) {
      expect([...typeRaekkefoelge(felt)].sort()).toEqual(["ad", "adset", "campaign"]);
    }
  });

  it("«nonexisting field» er en TYPE-uenighed, ikke en fejl — så prøves den næste type", () => {
    expect(erUkendtFelt({ code: 100, message: "(#100) Tried accessing nonexisting field (objective) on node type (Ad)" })).toBe(true);
    expect(erUkendtFelt({ code: 100, message: "(#100) Tried accessing nonexisting field (campaign) on node type (Campaign)" })).toBe(true);
    // Alt andet er en rigtig fejl og må ikke få os til at prøve videre.
    expect(erUkendtFelt({ code: 803, message: "Some of the aliases you requested do not exist" })).toBe(false);
    expect(erUkendtFelt({ code: 190, message: "Invalid OAuth access token" })).toBe(false);
    expect(erUkendtFelt({ code: 100, message: "Invalid parameter" })).toBe(false);
    expect(erUkendtFelt(null)).toBe(false);
  });

  const linje = (o: Partial<Koblingslinje> & Pick<Koblingslinje, "vaerdi" | "felt" | "udfald">): Koblingslinje => ({
    navn: null, slags: null, tilmeldinger: 0, besked: null, ...o,
  });

  it("ét fundet annonce-id er nok til at bevise koblingen", () => {
    const dom = doemKobling(
      [
        linje({ vaerdi: "120249061667400694", felt: "utm_content", udfald: "fundet", slags: "ad", navn: "Video A", tilmeldinger: 210 }),
        linje({ vaerdi: "120249061667400695", felt: "utm_content", udfald: "ikke_fundet", tilmeldinger: 40 }),
        linje({ vaerdi: "120248713786520694", felt: "utm_campaign", udfald: "fundet", slags: "campaign", navn: "Webinar okt", tilmeldinger: 597 }),
      ],
      597,
    );
    expect(dom.bevist).toBe(true);
    expect(dom).toMatchObject({ annoncer_fundet: 1, annoncer_i_alt: 2, kampagner_fundet: 1, tilmeldinger_daekket: 210, tilmeldinger_i_alt: 597 });
    expect(dom.konklusion).toContain("BEVIST");
  });

  it("et id der findes, men ikke er en ANNONCE, beviser ingenting", () => {
    const dom = doemKobling([linje({ vaerdi: "1", felt: "utm_content", udfald: "fundet", slags: "campaign" })], 597);
    expect(dom.bevist).toBe(false);
    expect(dom.annoncer_fundet).toBe(0);
  });

  it("et NAVN er ikke en fejl — det bærer sin egen mærkat og skal ikke slås op (19/9)", () => {
    const dom = doemKobling(
      [linje({ vaerdi: "IMG | 08-kontoret-skaerm | 2026-08-17", felt: "utm_content", udfald: "navn", navn: "IMG | 08-kontoret-skaerm | 2026-08-17", tilmeldinger: 208 })],
      208,
    );
    expect(dom.navne).toBe(1);
    expect(dom.tilmeldinger_med_navn).toBe(208);
    expect(dom.tilmeldinger_uden_kilde).toBe(0);
    // Hverken bevist eller BRUDT — der var intet at prøve.
    expect(dom.bevist).toBe(false);
    expect(dom.konklusion).toContain("IKKE PRØVET");
    expect(dom.konklusion).not.toContain("IKKE BEVIST");
    expect(dom.konklusion).toContain("kan læses som de står");
  });

  it("DET MÅLTE BILLEDE 19/9: to id'er dækker 400, ni navne dækker resten af 608", () => {
    const dom = doemKobling(
      [
        linje({ vaerdi: "120249061667400694", felt: "utm_content", udfald: "fundet", slags: "ad", navn: "Video A", tilmeldinger: 260 }),
        linje({ vaerdi: "120249061667400695", felt: "utm_content", udfald: "fundet", slags: "ad", navn: "Video B", tilmeldinger: 140 }),
        ...Array.from({ length: 9 }, (_, i) =>
          linje({ vaerdi: `IMG | 08-mærkat-${i} | 2026-08-17`, felt: "utm_content", udfald: "navn", tilmeldinger: 208 / 9 })),
        linje({ vaerdi: "120248713786520694", felt: "utm_campaign", udfald: "fundet", slags: "campaign", navn: "Webinar okt", tilmeldinger: 608 }),
      ],
      608,
    );
    expect(dom.bevist).toBe(true);
    expect(dom.annoncer_fundet).toBe(2);
    // «af 2», ikke «af 11» — navnene blev aldrig slået op og tæller ikke som mislykkede.
    expect(dom.annoncer_i_alt).toBe(2);
    expect(dom.navne).toBe(9);
    expect(dom.tilmeldinger_daekket).toBe(400);
    expect(Math.round(dom.tilmeldinger_med_navn)).toBe(208);
    expect(Math.round(dom.tilmeldinger_uden_kilde)).toBe(0);
    expect(dom.konklusion).toContain("BEVIST");
    // Navnene nævnes OGSÅ i en grøn konklusion — ellers ligner de 208 et hul.
    expect(dom.konklusion).toContain("NAVNE");
  });

  it("er ingen af mærkaterne id'er OG ingen navne, er makroerne slet ikke sat", () => {
    const dom = doemKobling([], 597);
    expect(dom.konklusion).toContain("makroerne");
  });

  it("id'er der ligner, men ikke kan slås op: anden konto eller manglende adgang", () => {
    const dom = doemKobling([linje({ vaerdi: "120249061667400694", felt: "utm_content", udfald: "ikke_fundet", tilmeldinger: 597 })], 597);
    expect(dom.bevist).toBe(false);
    expect(dom.konklusion).toContain("IKKE BEVIST");
  });

  it("de to ikke-beviste udfald blandes ALDRIG sammen — vores opsætning mod tokenets adgang", () => {
    // Blandet: én værdi er ikke et id, én er, men blev ikke fundet.
    // Så ER der slået noget op — og svaret skal handle om adgangen, ikke om makroerne.
    const dom = doemKobling(
      [
        linje({ vaerdi: "sommer", felt: "utm_content", udfald: "navn", tilmeldinger: 12 }),
        linje({ vaerdi: "120249061667400694", felt: "utm_content", udfald: "ikke_fundet", tilmeldinger: 585 }),
      ],
      597,
    );
    expect(dom.konklusion).toContain("IKKE BEVIST");
    expect(dom.konklusion).not.toContain("makroerne");
  });

  it("nul linjer vælter ikke dommen", () => {
    expect(doemKobling([], 0).bevist).toBe(false);
  });
});
