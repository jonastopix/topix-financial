import { describe, expect, it } from "vitest";
import {
  annoncespor,
  brokOgPct,
  dageOrd,
  kildeAf,
  kunPaaFbclid,
  naesteWebinar,
  pct,
  taelDeltagelse,
  webinarDashboard,
  type AnsoegerMail,
  type Tilmelding,
} from "@/lib/webinar/dashboard";

/**
 * FLADEN MOD DE RIGTIGE TAL (målt i prod 19/9-2026, efter at importen havde
 * skrevet). Ikke en opfundet fixture: hvert tal herunder er Jonas' måling, og
 * testen fejler hvis fladen viser noget andet.
 *
 *   594 tilmeldinger · ét webinar · tre kampagner
 *   utm_source: «fb» 336 · «facebook» 179 · «ig» 51 · direkte 24   (= 590)
 *   578 bærer et fbclid
 *   29 har en procent, alle fra august-kampagnen «Webinar | Adv+ | OM»,
 *      gennemsnit 78 %
 *
 * TO STEDER HVOR MÅLINGEN IKKE GÅR OP, OG HVAD FIXTUREN GØR VED DET:
 *
 * 1. De fire sidste. 336 + 179 + 51 + 24 = 590, ikke 594. De fire står ikke i
 *    målingen. Fixturen giver dem en kilde vi IKKE oversætter
 *    («nyhedsbrev-uge38»), hvilket samtidig beviser reglen: en ukendt kilde
 *    står som annoncøren skrev den og havner aldrig i en «andet»-spand.
 *
 * 2. Fbclid overstiger utm. 578 bærer et fbclid, men kun 336 + 179 + 51 = 566
 *    er utm-mærket fb/facebook/ig. Mindst 12 rækker har altså klik-id'et UDEN
 *    utm_source. Fixturen lægger de 12 hos de 24 «direkte» — det er præcis
 *    det tilfælde kildeAf skal ramme rigtigt, og grunden til at «direkte»
 *    ender på 12 og ikke 24.
 */

const WEBINAR = "w-boardroom-1";
const TITEL = "Sådan får du styr på tallene";
const NU = new Date("2026-09-19T08:00:00.000Z");
const SESSION_22_9 = "2026-09-22T08:00:00.000Z";
const SESSION_AUG = "2026-08-26T08:00:00.000Z";

/** Ansøger der ikke blev medlem · ansøger der gjorde (underskrevet OG betalt). */
const A = (email: string, indsendt_at = "2026-09-18T10:00:00.000Z"): AnsoegerMail =>
  ({ email, indsendt_at, trin: "ny", virksomhed_slutdato: null });
const M = (email: string, indsendt_at = "2026-09-18T10:00:00.000Z"): AnsoegerMail =>
  ({ email, indsendt_at, trin: "underskrevet", virksomhed_slutdato: "2027-09-18" });

const K_AUG = "Webinar | Adv+ | OM";
const K_BRED = "Webinar | Sep | Bred";
const K_RETARGET = "Webinar | Sep | Retarget";

/**
 * De 29 procenter. Gennemsnittet er målingens 78 PRÆCIST (summen er
 * 29 × 78 = 2262), og værdierne ligger med vilje på begge sider af
 * 75 %-grænsen: 19 nåede den, 10 gjorde ikke. Ét gennemsnit på 78 kan
 * dække over begge dele — derfor viser fladen både «så det færdigt» og
 * gennemsnittet, aldrig kun det ene.
 */
const PROCENTER = [
  ...Array(10).fill(95), ...Array(9).fill(80), ...Array(9).fill(60), 52,
] as number[];

const TOMT = {
  utm_medium: null, utm_content: null, utm_term: null,
  origin: null, first_origin: null, referrer: null, first_referrer: null,
  widget_source: "topix-webinar-side", by: "Aarhus", land: "DK",
  enhed: "Mobile", tidszone: "Europe/Copenhagen",
} as const;

/** 594 rækker sat sammen så hver enkelt af målingens fordelinger går op. */
function prod(): Tilmelding[] {
  // Kilderne, præcis som målt — plus de fire uforklarede til sidst.
  const kilder: Array<string | null> = [
    ...Array(336).fill("fb"), ...Array(179).fill("facebook"), ...Array(51).fill("ig"),
    ...Array(24).fill(null), ...Array(4).fill("nyhedsbrev-uge38"),
  ];
  expect(kilder).toHaveLength(594);

  // Kampagnerne: august først (de 29 med procent bor der), så de to i september.
  const kampagner = [...Array(60).fill(K_AUG), ...Array(380).fill(K_BRED), ...Array(154).fill(K_RETARGET)];
  expect(kampagner).toHaveLength(594);

  return kilder.map((kilde, i) => {
    const kampagne = kampagner[i];
    const iAugust = kampagne === K_AUG;
    // De 29 der faktisk så med.
    const serPct = iAugust && i < 29 ? PROCENTER[i] : null;
    // 578 fbclid: alle utm-mærkede fb/facebook/ig (566) + 12 af de «direkte».
    const erUtmFacebook = kilde === "fb" || kilde === "facebook" || kilde === "ig";
    const fbclid = erUtmFacebook || (kilde === null && i >= 566 && i < 578) ? `IwAR-${i}` : null;
    return {
      ewebinar_id: `reg-${i}`,
      email: `person-${i}@x.dk`,
      navn: `Person ${i}`,
      webinar_id: WEBINAR,
      webinar_titel: TITEL,
      session_tid: iAugust ? SESSION_AUG : SESSION_22_9,
      session_type: "Scheduled",
      registreret_at: iAugust ? "2026-08-20T09:00:00.000Z" : "2026-09-18T09:00:00.000Z",
      state: iAugust ? (serPct === null ? "Missed" : serPct >= 75 ? "Watched" : "Joined") : "Registered",
      sidste_action: null,
      attended: null,
      subscribed: "Subscribed",
      set_procent: serPct,
      set_procent_kilde: serPct === null ? null : "watchedPercent",
      utm_source: kilde,
      utm_campaign: kampagne,
      fbclid,
      ...TOMT,
    };
  });
}

const RAEKKER = prod();

describe("prod-fixturen er målingen, ikke en tilnærmelse", () => {
  it("594 rækker, ét webinar, tre kampagner", () => {
    expect(RAEKKER).toHaveLength(594);
    expect(new Set(RAEKKER.map((r) => r.webinar_id)).size).toBe(1);
    expect(new Set(RAEKKER.map((r) => r.utm_campaign)).size).toBe(3);
    expect(new Set(RAEKKER.map((r) => r.email)).size).toBe(594);
  });

  it("de rå utm-tal og fbclid-tallet er dem Jonas målte", () => {
    const tael = (v: string | null) => RAEKKER.filter((r) => r.utm_source === v).length;
    expect(tael("fb")).toBe(336);
    expect(tael("facebook")).toBe(179);
    expect(tael("ig")).toBe(51);
    expect(tael(null)).toBe(24);
    expect(RAEKKER.filter((r) => r.fbclid !== null)).toHaveLength(578);
    expect(RAEKKER.filter((r) => r.set_procent !== null)).toHaveLength(29);
  });

  it("de 29 procenter summerer til 29 × 78 og ligger på begge sider af grænsen", () => {
    expect(PROCENTER).toHaveLength(29);
    expect(PROCENTER.reduce((a, b) => a + b, 0)).toBe(29 * 78);
    expect(PROCENTER.filter((p) => p >= 75)).toHaveLength(19);
    expect(PROCENTER.filter((p) => p < 75)).toHaveLength(10);
  });
});

describe("«fb» og «facebook» er ÉT navn for samme kilde", () => {
  it("begge stavemåder — og «meta» — bliver til Facebook", () => {
    for (const v of ["fb", "facebook", "Facebook", "FB", "meta"]) {
      expect(kildeAf({ ...RAEKKER[0], utm_source: v })).toBe("Facebook");
    }
  });

  it("de to stavemåder lægges sammen til ÉN linje på 515, ikke to på 336 og 179", () => {
    const s = annoncespor(RAEKKER, new Set(), NU, true);
    const facebook = s.kilder.filter((k) => k.navn === "Facebook");
    expect(facebook).toHaveLength(1);
    expect(facebook[0].tilmeldte).toBe(336 + 179 + 12); // + de 12 på fbclid alene
    expect(s.kilder.map((k) => k.navn)).not.toContain("fb");
    expect(s.kilder.map((k) => k.navn)).not.toContain("facebook");
  });

  it("de rå værdier står stadig ved linjen — oversættelsen skjuler ikke hvad der stod", () => {
    const s = annoncespor(RAEKKER, new Set(), NU, true);
    expect(s.kilder.find((k) => k.navn === "Facebook")?.raa).toEqual(["facebook", "fb"]);
  });
});

describe("fordelingen over fire kilder — og de 12 på fbclid alene", () => {
  const s = annoncespor(RAEKKER, new Set(), NU, true);

  it("rækkefølgen er størst først, og hver linje har sin andel af de 594", () => {
    expect(s.personer).toBe(594);
    expect(s.kilder.map((k) => [k.navn, k.tilmeldte])).toEqual([
      ["Facebook", 527],
      ["Instagram", 51],
      ["direkte", 12],
      ["nyhedsbrev-uge38", 4],
    ]);
    expect(s.kilder.reduce((n, k) => n + k.tilmeldte, 0)).toBe(594);
  });

  it("andelen er regnet i dommen, så søjlen kan tegnes uden at fladen regner", () => {
    const [fb, ig, direkte, nyhedsbrev] = s.kilder;
    expect(pct(fb.andelAfHelhed)).toBe("89 %");
    expect(pct(ig.andelAfHelhed)).toBe("9 %");
    expect(pct(direkte.andelAfHelhed)).toBe("2 %");
    // 4 af 594 er 0,673 %. Den gamle heltalsafrunding skrev «1 %» og gjorde
    // fire personer til flere end de er; decimalreglen (19/9) siger 0,7 %.
    expect(pct(nyhedsbrev.andelAfHelhed)).toBe("0,7 %");
    // Andelene summerer til 1 — ingen person er talt to gange eller tabt.
    expect(s.kilder.reduce((n, k) => n + (k.andelAfHelhed ?? 0), 0)).toBeCloseTo(1);
  });

  it("de 12 med fbclid uden utm er talt som Facebook, og tallet kan efterprøves", () => {
    expect(RAEKKER.filter(kunPaaFbclid)).toHaveLength(12);
    expect(s.kunFbclid).toBe(12);
    // Uden reglen ville de 12 have stået som «direkte» og Facebook set 12 for lav.
    const uden = RAEKKER.map((r) => ({ ...r, fbclid: null }));
    expect(annoncespor(uden, new Set(), NU, true).kilder.find((k) => k.navn === "direkte")?.tilmeldte).toBe(24);
    expect(annoncespor(uden, new Set(), NU, true).kunFbclid).toBe(0);
  });

  it("en ukendt kilde står som annoncøren skrev den — ingen «andet»-spand", () => {
    expect(s.kilder.map((k) => k.navn)).toContain("nyhedsbrev-uge38");
    expect(s.kilder.map((k) => k.navn)).not.toContain("andet");
  });
});

describe("de tre kampagner", () => {
  const s = annoncespor(RAEKKER, new Set(), NU, true);

  it("tre linjer, størst først, hver med sin andel af de 594", () => {
    expect(s.kampagner.map((k) => [k.navn, k.tilmeldte])).toEqual([
      [K_BRED, 380],
      [K_RETARGET, 154],
      [K_AUG, 60],
    ]);
    expect(pct(s.kampagner[0].andelAfHelhed)).toBe("64 %");
    expect(pct(s.kampagner[2].andelAfHelhed)).toBe("10 %");
  });

  it("august-kampagnen er den ENESTE der har set noget — de 29, delt 19 / 10", () => {
    const aug = s.kampagner.find((k) => k.navn === K_AUG);
    expect(aug?.moedteOp).toBe(29);
    expect(aug?.saaFaerdigt).toBe(19);
    expect(aug?.delvist).toBe(10);
    expect(aug?.medProcent).toBe(29);
    for (const k of s.kampagner.filter((x) => x.navn !== K_AUG)) {
      expect(k.moedteOp).toBe(0);
      expect(k.saaFaerdigt).toBe(0);
    }
  });

  it("annoncens andel måles mod SIN kampagne, ikke mod alle 594", () => {
    // Ingen utm_content i prod endnu: én «uden annonce» pr. kampagne, altså 100 %.
    for (const k of s.kampagner) {
      expect(k.annoncer).toHaveLength(1);
      expect(k.annoncer[0].andelAfHelhed).toBe(1);
    }
  });
});

describe("de 29 procenter: gennemsnit 78, og ikke ét gennemsnit over 594", () => {
  it("august-sessionen viser 60 tilmeldte, 29 der så det færdigt, 31 der ikke mødte op", () => {
    const d = webinarDashboard({ tilmeldinger: RAEKKER, ansoegninger: [], sporKolonnerFindes: true }, NU);
    expect(d.afholdte).toHaveLength(1);
    const aug = d.afholdte[0];
    expect(aug.sessionTid).toBe(SESSION_AUG);
    expect(aug).toMatchObject({ tilmeldte: 60, moedteOp: 29, saaFaerdigt: 19, delvist: 10, moedteIkke: 31, ukendt: 0 });
    expect(aug.gennemsnitProcent).toBe(78);
    expect(aug.medProcent).toBe(29);
    expect(pct(aug.fremmoedeAndel)).toBe("48 %");
    expect(pct(aug.gennemfoerselAndel)).toBe("66 %");
  });

  it("gennemsnittet vejes på de 29, ALDRIG på de 594 — «målt på N» står ved siden af", () => {
    const d = taelDeltagelse(RAEKKER, NU);
    expect(d.medProcent).toBe(29);
    expect(d.gennemsnitProcent).toBe(78);
    expect(d.tilmeldte).toBe(594);
  });
});

describe("det næste webinar — de 534 til 22/9, ikke de 594", () => {
  it("tæller PRÆCIS 22/9-sessionen og siger hvor mange kommende sessioner der er", () => {
    const n = naesteWebinar(RAEKKER, NU);
    expect(n?.sessionTid).toBe(SESSION_22_9);
    expect(n?.personer).toBe(534);
    expect(n?.kommendeSessioner).toBe(1);
    expect(n?.kommendeIAlt).toBe(534);
    expect(n?.omHvorLaenge).toBe("om 3 dage");
    expect(n?.titel).toBe(TITEL);
  });

  it("august-folkene er IKKE talt med i det næste — og ikke omvendt", () => {
    const d = webinarDashboard({ tilmeldinger: RAEKKER, ansoegninger: [], sporKolonnerFindes: true }, NU);
    expect((d.naeste?.personer ?? 0) + d.samlet.tilmeldte).toBe(594);
    expect(d.samlet.tilmeldte).toBe(60);
  });

  it("med to kommende sessioner viser fladen begge tal, så 534 ikke læses som «vi mangler»", () => {
    const delt = RAEKKER.map((r, i) =>
      r.session_tid === SESSION_22_9 && i % 2 === 0 ? { ...r, session_tid: "2026-09-29T08:00:00.000Z" } : r,
    );
    const n = naesteWebinar(delt, NU);
    expect(n?.sessionTid).toBe(SESSION_22_9);
    expect(n?.kommendeSessioner).toBe(2);
    expect(n?.kommendeIAlt).toBe(534);
    expect(n?.personer).toBeLessThan(534);
  });
});

describe("ansøgningerne oven på de rigtige tal", () => {
  it("koblingen rammer pr. kilde og pr. kampagne, ikke kun i alt", () => {
    // Ti ansøgere: fem fra Facebook-blokken, fem fra Instagram-blokken.
    const ansoegere = [...Array(5).keys()].map((i) => A(`person-${i}@x.dk`))
      .concat([...Array(5).keys()].map((i) => A(`person-${515 + i}@x.dk`)));
    const d = webinarDashboard({ tilmeldinger: RAEKKER, ansoegninger: ansoegere, sporKolonnerFindes: true }, NU);
    expect(d.kobling).toMatchObject({ tilmeldte: 594, ansoegte: 10, ansoegereIAlt: 10 });
    expect(d.spor.kilder.find((k) => k.navn === "Facebook")?.ansoegte).toBe(5);
    expect(d.spor.kilder.find((k) => k.navn === "Instagram")?.ansoegte).toBe(5);
    expect(d.spor.kampagner.find((k) => k.navn === K_AUG)?.ansoegte).toBe(5);
  });
});

// ── Jonas' fire + mine tre, målt på de rigtige tal ────────────────────────

describe("tragten på prod-tallene — hele historien på én linje", () => {
  it("regnes på august-sessionens 60, ikke på alle 594", () => {
    const d = webinarDashboard({ tilmeldinger: RAEKKER, ansoegninger: [], sporKolonnerFindes: true }, NU);
    expect(d.tragt.grundlag).toBe(60);
    expect(d.tragt.kommendeUdenfor).toBe(534);
    expect(d.tragt.trin.map((t) => [t.navn, t.antal])).toEqual([
      ["Tilmeldte", 60], ["Mødte op", 29], ["Så det færdigt", 19], ["Ansøgte", 0], ["Blev medlem", 0],
    ]);
    expect(pct(d.tragt.trin[1].andelAfFoer)).toBe("48 %");
    expect(pct(d.tragt.trin[2].andelAfFoer)).toBe("66 %");
  });

  it("de 534 der venter på tirsdag, står ALDRIG som frafald", () => {
    const d = webinarDashboard({ tilmeldinger: RAEKKER, ansoegninger: [], sporKolonnerFindes: true }, NU);
    // Havde de været med, ville «mødte op» have været 29 af 594 = 5 %.
    expect(d.tragt.trin[0].antal).not.toBe(594);
    expect(pct(d.tragt.trin[1].andelAfFoer)).not.toBe("5 %");
  });

  it("ÉN ansøger ud af de 60 giver 2 %, og ét medlem ud af én ansøger giver 100 %", () => {
    const d = webinarDashboard(
      { tilmeldinger: RAEKKER, ansoegninger: [M("person-0@x.dk")], sporKolonnerFindes: true },
      NU,
    );
    expect(d.tragt.trin[3]).toMatchObject({ navn: "Ansøgte", antal: 1 });
    expect(pct(d.tragt.trin[3].andelAfFoer)).toBe("5 %"); // 1 af de 19 der så det færdigt
    expect(d.tragt.trin[4]).toMatchObject({ navn: "Blev medlem", antal: 1 });
    expect(pct(d.tragt.trin[4].andelAfFoer)).toBe("100 %");
    expect(pct(d.tragt.trin[4].andelAfStart)).toBe("2 %");
  });
});

describe("ét lille tal i en stor bunke må ikke forsvinde", () => {
  it("1 ansøger ud af 594 tilmeldte er «0,2 %» — ikke «0 %»", () => {
    const d = webinarDashboard(
      { tilmeldinger: RAEKKER, ansoegninger: [A("person-300@x.dk")], sporKolonnerFindes: true },
      NU,
    );
    expect(d.kobling.ansoegte).toBe(1);
    expect(pct(d.kobling.andelAfTilmeldte)).toBe("0,2 %");
    expect(pct(d.kobling.andelAfTilmeldte)).not.toBe("0 %");
  });

  it("brøken står ved siden af, så 1 af 594 kan læses uden at regne", () => {
    expect(brokOgPct(1, 594)).toBe("1 af 594 · 0,2 %");
    expect(brokOgPct(29, 60)).toBe("29 af 60 · 48 %");
  });
});

describe("pr. session: ansøgte og blev medlem på prod-tallene", () => {
  it("august-sessionen bærer begge procenter, hver med sin egen nævner", () => {
    const ansoegere = [...Array(6).keys()].map((i) => (i < 2 ? M(`person-${i}@x.dk`) : A(`person-${i}@x.dk`)));
    const d = webinarDashboard({ tilmeldinger: RAEKKER, ansoegninger: ansoegere, sporKolonnerFindes: true }, NU);
    const aug = d.afholdte[0];
    expect(aug.ansoegte).toBe(6);
    expect(pct(aug.ansoegerAndel)).toBe("10 %"); // 6 af 60 TILMELDTE
    expect(aug.blevMedlem).toBe(2);
    expect(pct(aug.medlemAfAnsoegteAndel)).toBe("33 %"); // 2 af 6 ANSØGTE — ikke af 60
  });
});

describe("tiden fra tilmelding til ansøgning på prod-tallene", () => {
  it("august-folkene meldte sig 20/8; ansøger de 1/9, er der gået 12 dage", () => {
    const d = webinarDashboard(
      {
        tilmeldinger: RAEKKER,
        ansoegninger: [A("person-0@x.dk", "2026-09-01T09:00:00.000Z"), A("person-1@x.dk", "2026-09-03T09:00:00.000Z")],
        sporKolonnerFindes: true,
      },
      NU,
    );
    expect(d.tid.antal).toBe(2);
    expect(d.tid.hurtigsteDage).toBe(12);
    expect(d.tid.langsomsteDage).toBe(14);
    expect(d.tid.gennemsnitDage).toBe(13);
    expect(dageOrd(d.tid.gennemsnitDage)).toBe("13 dage");
  });

  it("i dag — nul ansøgninger — er tiden tom og siger det, uden at kaste", () => {
    const d = webinarDashboard({ tilmeldinger: RAEKKER, ansoegninger: [], sporKolonnerFindes: true }, NU);
    expect(d.tid).toMatchObject({ antal: 0, gennemsnitDage: null, medianDage: null, ansoegteFoerTilmelding: 0 });
  });
});
