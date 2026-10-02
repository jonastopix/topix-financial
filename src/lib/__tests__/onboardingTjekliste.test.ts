import { describe, it, expect } from "vitest";
import {
  byggTjekliste,
  MAAL_PUNKT_FRA,
  maalPunktGaelder,
  MANGLER_TEKST,
  TJEKLISTE_RAEKKEFOELGE,
  TJEKLISTE_STED,
  TJEKLISTE_STED_LABEL,
  TJEKLISTE_STIER,
  type TjeklisteInput,
  type TjeklistePunktId,
} from "../onboardingTjekliste";
import { SEKS_STEDER } from "@/lib/hjemmebane/hbNav";
import { STEDS_SAETNINGER, type Sted } from "@/lib/hjemmebane/stedsSaetninger";

// SEKS PUNKTER, SEKS STEDER (2/10-2026): de otte gamle punkter (velkomst,
// profil, praesentation, virksomhed, rapport, handout, besked, deling) blev
// seks i menuens rækkefølge med rådgiveren som nr. 2. Dommene for «gjort» er
// de gamle; to punkter er sammenlagt (boardroom = velkomst + virksomhed,
// netvaerk = profil + praesentation), «deling» er ude, og «maal» er nyt — og
// findes kun for medlemmer fra MAAL_PUNKT_FRA (filhovedet). Testene
// nedenfor er de gamle, flyttet til de nye punkter — ingen dom er slækket.

/** Nyt medlem (efter MAAL_PUNKT_FRA): seks punkter. */
const NYT_SIDEN = "2026-10-05T09:00:00.000Z";
/** Medlem fra før grænsen: fem punkter (maal udgår). */
const GAMMELT_SIDEN = "2026-09-22T09:00:00.000Z";

const TOM: TjeklisteInput = {
  har_velkomstvideo: true,
  velkomstvideo_set_at: null,
  kan_oprette_traad: true,
  har_praesentation: false,
  ask_me_about: null,
  avatar_url: null,
  website: null,
  industry_label: null,
  cvr_number: null,
  antal_rapporter: 0,
  antal_godkendte: 0,
  antal_udfyldte_handouts: 0,
  last_member_message_at: null,
  medlem_siden: NYT_SIDEN,
  maal: [],
};

const FULD: TjeklisteInput = {
  har_velkomstvideo: true,
  velkomstvideo_set_at: "2026-09-02T10:00:00.000Z",
  kan_oprette_traad: true,
  har_praesentation: true,
  ask_me_about: "Likviditet og prissætning i håndværk.",
  avatar_url: "https://x/avatars/u/avatar?v=1",
  website: "https://firma.dk",
  industry_label: "Håndværk",
  cvr_number: "12345678",
  antal_rapporter: 1,
  antal_godkendte: 1,
  antal_udfyldte_handouts: 1,
  last_member_message_at: "2026-09-02T11:00:00.000Z",
  medlem_siden: NYT_SIDEN,
  maal: [{ status: "active", bekraeftet_at: "2026-10-06T10:00:00.000Z" }],
};

const ALLE_ID: TjeklistePunktId[] = ["boardroom", "raadgiver", "tal", "maal", "netvaerk", "akademi"];

function gjortAf(input: TjeklisteInput): Record<TjeklistePunktId, boolean> {
  const ud = byggTjekliste(input);
  return Object.fromEntries(ud.punkter.map((p) => [p.id, p.gjort])) as Record<TjeklistePunktId, boolean>;
}

const punkt = (input: TjeklisteInput, id: TjeklistePunktId, nu?: Date) => byggTjekliste(input, nu).punkter.find((p) => p.id === id)!;

describe("byggTjekliste — yderpunkterne", () => {
  it("alt tomt → seks punkter, alle gjort=false, antal_gjort 0, faerdig false", () => {
    const ud = byggTjekliste(TOM);
    expect(ud.punkter).toHaveLength(6);
    expect(ud.punkter.every((p) => p.gjort === false)).toBe(true);
    expect(ud.antal_gjort).toBe(0);
    expect(ud.antal_i_alt).toBe(6);
    expect(ud.faerdig).toBe(false);
  });

  it("alt udfyldt → alle true, antal_gjort 6, faerdig true", () => {
    const ud = byggTjekliste(FULD);
    expect(ud.punkter.every((p) => p.gjort === true)).toBe(true);
    expect(ud.antal_gjort).toBe(6);
    expect(ud.faerdig).toBe(true);
  });

  it("gjorte punkter med mangler-liste har en tom liste", () => {
    const ud = byggTjekliste(FULD);
    for (const id of ["boardroom", "tal", "maal", "netvaerk"] as TjeklistePunktId[]) {
      expect(ud.punkter.find((p) => p.id === id)?.mangler).toEqual([]);
    }
  });
});

describe("byggTjekliste — hvert punkt for sig: kun det punkts felter sat, kun det punkt bliver true", () => {
  const kunEt: { id: TjeklistePunktId; input: Partial<TjeklisteInput> }[] = [
    // boardroom = velkomst + virksomhed — BEGGE halvdele.
    { id: "boardroom", input: { velkomstvideo_set_at: FULD.velkomstvideo_set_at, website: FULD.website, industry_label: FULD.industry_label, cvr_number: FULD.cvr_number } },
    { id: "raadgiver", input: { last_member_message_at: FULD.last_member_message_at } },
    { id: "tal", input: { antal_rapporter: 1, antal_godkendte: 1 } },
    { id: "maal", input: { maal: FULD.maal } },
    // netvaerk = profil (tekst OG foto, 17/9 Jonas «C») + præsentation — BEGGE halvdele.
    { id: "netvaerk", input: { ask_me_about: FULD.ask_me_about, avatar_url: FULD.avatar_url, har_praesentation: true } },
    { id: "akademi", input: { antal_udfyldte_handouts: 1 } },
  ];

  for (const c of kunEt) {
    it(`kun ${c.id}`, () => {
      const gjort = gjortAf({ ...TOM, ...c.input });
      for (const id of ALLE_ID) {
        expect(gjort[id]).toBe(id === c.id);
      }
      expect(byggTjekliste({ ...TOM, ...c.input }).antal_gjort).toBe(1);
    });
  }
});

describe("byggTjekliste — punkt 1 «Dit Boardroom» = velkomsten + virksomheden (sammenlagt 2/10)", () => {
  it("intet gjort: mangler er velkomsten først, så website, branche, CVR — og stien er velkomsten (sti '', åbnes i boksen)", () => {
    const p = punkt(TOM, "boardroom");
    expect(p.gjort).toBe(false);
    expect(p.mangler).toEqual([MANGLER_TEKST.velkomst, MANGLER_TEKST.website, MANGLER_TEKST.branche, MANGLER_TEKST.cvr]);
    expect(MANGLER_TEKST.velkomst).toBe("at se velkomsten");
    expect(p.sti).toBe("");
    expect(p.titel).toBe("Se velkomsten og udfyld din virksomhed");
  });

  it("velkomsten set, virksomheden tom: IKKE gjort, mangler de tre felter, og stien er nu /settings", () => {
    const p = punkt({ ...TOM, velkomstvideo_set_at: FULD.velkomstvideo_set_at }, "boardroom");
    expect(p.gjort).toBe(false);
    expect(p.mangler).toEqual([MANGLER_TEKST.website, MANGLER_TEKST.branche, MANGLER_TEKST.cvr]);
    expect(p.sti).toBe("/settings");
  });

  it("virksomheden udfyldt, velkomsten ikke set: IKKE gjort — mangler kun velkomsten, stien er videoen", () => {
    const p = punkt({ ...TOM, website: FULD.website, industry_label: FULD.industry_label, cvr_number: FULD.cvr_number }, "boardroom");
    expect(p.gjort).toBe(false);
    expect(p.mangler).toEqual([MANGLER_TEKST.velkomst]);
    expect(p.sti).toBe("");
  });

  it("virksomhed: website og CVR men ikke branche → mangler er præcis branchen (velkomsten set)", () => {
    const p = punkt({ ...TOM, velkomstvideo_set_at: FULD.velkomstvideo_set_at, website: FULD.website, cvr_number: FULD.cvr_number }, "boardroom");
    expect(p.gjort).toBe(false);
    expect(p.mangler).toEqual([MANGLER_TEKST.branche]);
  });

  it("virksomhed: et website på « » er ikke et website — alle tre mangler i fast rækkefølge", () => {
    const p = punkt({ ...TOM, velkomstvideo_set_at: FULD.velkomstvideo_set_at, website: " ", industry_label: "\t", cvr_number: "" }, "boardroom");
    expect(p.gjort).toBe(false);
    expect(p.mangler).toEqual([MANGLER_TEKST.website, MANGLER_TEKST.branche, MANGLER_TEKST.cvr]);
  });

  it("men en værdi med mellemrum omkring tæller", () => {
    expect(gjortAf({ ...FULD, website: "  https://firma.dk  " }).boardroom).toBe(true);
  });

  // UDEN VIDEO INGEN VELKOMST (Jonas 2/9: «Vi viser ikke tomt indhold»).
  it("uden video: velkomsten er ikke en del af punktet — titlen er «Udfyld din virksomhed», stien /settings, og stemplet tæller ikke", () => {
    const p = punkt({ ...TOM, har_velkomstvideo: false }, "boardroom");
    expect(p.titel).toBe("Udfyld din virksomhed");
    expect(p.sti).toBe("/settings");
    expect(p.mangler).toEqual([MANGLER_TEKST.website, MANGLER_TEKST.branche, MANGLER_TEKST.cvr]);
    // Virksomheden alene gør punktet — med eller uden stempel.
    const kunVirksomhed = { ...TOM, har_velkomstvideo: false, website: FULD.website, industry_label: FULD.industry_label, cvr_number: FULD.cvr_number };
    expect(punkt(kunVirksomhed, "boardroom").gjort).toBe(true);
    expect(punkt({ ...kunVirksomhed, velkomstvideo_set_at: FULD.velkomstvideo_set_at }, "boardroom").gjort).toBe(true);
    // Antallet er stadig seks — ingen punkter udgår uden video.
    expect(byggTjekliste({ ...TOM, har_velkomstvideo: false }).antal_i_alt).toBe(6);
    expect(byggTjekliste({ ...FULD, har_velkomstvideo: false, velkomstvideo_set_at: null }).faerdig).toBe(true);
  });
});

describe("byggTjekliste — punkt 5 «Netværket» = profilen (tekst OG foto) + præsentationen (sammenlagt 2/10)", () => {
  // OMSKREVET MED VILJE 17/9-2026 (forside PR 4b, Jonas ordret «C»): fotoet er et krav —
  // flyttet 2/10 fra punktet «profil» til «netvaerk»; dommen (profilUdfyldt) er den samme.
  it("tekst, foto og præsentation mangler → gjort=false, mangler nævner alle tre (teksten først), stien er profilen", () => {
    const p = punkt(TOM, "netvaerk");
    expect(p.gjort).toBe(false);
    expect(p.mangler).toEqual([MANGLER_TEKST.ask_me_about, MANGLER_TEKST.foto, MANGLER_TEKST.praesentation]);
    expect(MANGLER_TEKST.foto).toBe("et foto");
    expect(MANGLER_TEKST.praesentation).toBe("et opslag om hvem du er");
    expect(p.titel).toBe("Fortæl, hvad man kan spørge dig om — og sig hej");
    expect(p.beskrivelse).toBe("Et foto, hvad de andre kan spørge dig om — og et opslag om hvem du er.");
    expect(p.sti).toBe("/settings?fane=profil");
  });

  it("ask_me_about alene er IKKE nok — fotoet mangler (17/9, Jonas «C»); fotoet alene heller ikke", () => {
    expect(punkt({ ...TOM, ask_me_about: FULD.ask_me_about, har_praesentation: true }, "netvaerk").mangler).toEqual([MANGLER_TEKST.foto]);
    expect(punkt({ ...TOM, avatar_url: FULD.avatar_url, har_praesentation: true }, "netvaerk").mangler).toEqual([MANGLER_TEKST.ask_me_about]);
  });

  it("profilen udfyldt, præsentationen mangler: IKKE gjort — mangler er opslaget, og stien er nu composeren", () => {
    const p = punkt({ ...TOM, ask_me_about: FULD.ask_me_about, avatar_url: FULD.avatar_url }, "netvaerk");
    expect(p.gjort).toBe(false);
    expect(p.mangler).toEqual([MANGLER_TEKST.praesentation]);
    expect(p.sti).toBe("/community?praesentation=1");
  });

  it("præsenteret, profilen tom: IKKE gjort — stien er profilen", () => {
    const p = punkt({ ...TOM, har_praesentation: true }, "netvaerk");
    expect(p.gjort).toBe(false);
    expect(p.mangler).toEqual([MANGLER_TEKST.ask_me_about, MANGLER_TEKST.foto]);
    expect(p.sti).toBe("/settings?fane=profil");
  });

  it("tomme strenge og mellemrum tæller ikke som udfyldt — men en værdi med mellemrum omkring tæller", () => {
    expect(punkt({ ...FULD, ask_me_about: "   " }, "netvaerk").mangler).toEqual([MANGLER_TEKST.ask_me_about]);
    expect(punkt({ ...FULD, avatar_url: "  " }, "netvaerk").mangler).toEqual([MANGLER_TEKST.foto]);
    expect(gjortAf({ ...FULD, ask_me_about: " Likviditet. " }).netvaerk).toBe(true);
  });

  // Præsentationen findes kun for dem der kan oprette en tråd (11/9, kort 60).
  it("uden trådret er præsentationen ikke en del af punktet: titel og beskrivelse er profilens, har_praesentation tæller ikke", () => {
    const p = punkt({ ...TOM, kan_oprette_traad: false }, "netvaerk");
    expect(p.titel).toBe("Fortæl, hvad man kan spørge dig om");
    expect(p.beskrivelse).toBe("Et foto, og hvad de andre kan spørge dig om.");
    expect(p.mangler).toEqual([MANGLER_TEKST.ask_me_about, MANGLER_TEKST.foto]);
    const kunProfil = { ...TOM, kan_oprette_traad: false, ask_me_about: FULD.ask_me_about, avatar_url: FULD.avatar_url };
    expect(punkt(kunProfil, "netvaerk").gjort).toBe(true);
    expect(punkt({ ...kunProfil, har_praesentation: true }, "netvaerk").gjort).toBe(true);
    expect(byggTjekliste({ ...TOM, kan_oprette_traad: false }).antal_i_alt).toBe(6);
    expect(byggTjekliste({ ...FULD, kan_oprette_traad: false, har_praesentation: false }).faerdig).toBe(true);
  });

  it("beskrivelsen lover intet udkast (praesentationPladsholder.guard, 16/9)", () => {
    for (const traad of [true, false]) {
      const p = punkt({ ...TOM, kan_oprette_traad: traad }, "netvaerk");
      expect(p.beskrivelse).not.toMatch(/udkast/i);
      expect(p.beskrivelse).not.toContain("vi har skrevet");
    }
  });
});

describe("byggTjekliste — punkt 3 «Dine tal» er gjort ved GODKENDELSE, ikke ved upload (rettet 9/9)", () => {
  // Instruks F (16/9): 22/9-2026 — de tre seneste afsluttede måneder er juni, juli og august; september er ikke omme.
  const NU = new Date("2026-09-22T10:00:00Z");
  const rapport = (input: TjeklisteInput) => punkt(input, "tal", NU);

  it("nul rapporter: ikke gjort, ingen mangler-linje — månederne ved navn, én fil pr. måned, også fra før medlemskabet", () => {
    const p = rapport({ ...TOM, antal_rapporter: 0, antal_godkendte: 0 });
    expect(p.gjort).toBe(false);
    expect(p.mangler).toEqual([]);
    expect(p.titel).toBe("Upload og godkend din første rapport");
    expect(p.beskrivelse).toBe("Upload juni, juli og august — én fil pr. måned, også fra før du blev medlem.");
    // Månederne følger «nu»: 1/10 er september omme; 5/1 er det oktober–december.
    const beskrivelse = (nu: Date) => punkt({ ...TOM }, "tal", nu).beskrivelse;
    expect(beskrivelse(new Date("2026-10-01T07:00:00Z"))).toBe("Upload juli, august og september — én fil pr. måned, også fra før du blev medlem.");
    expect(beskrivelse(new Date("2027-01-05T07:00:00Z"))).toBe("Upload oktober, november og december — én fil pr. måned, også fra før du blev medlem.");
  });

  it("uploadet en AFSLUTTET måned, ikke godkendt: IKKE gjort — «Mangler: at godkende tallene», stien er rapporteringen (/reports)", () => {
    const p = rapport({ ...TOM, antal_rapporter: 3, antal_godkendte: 0, upload_perioder: ["2026-08", "2026-07", "2026-06"] });
    expect(p.gjort).toBe(false);
    expect(p.mangler).toEqual([MANGLER_TEKST.godkendelse]);
    expect(MANGLER_TEKST.godkendelse).toBe("at godkende tallene");
    expect(p.beskrivelse).toBe("Rapporten er uploadet — godkend tallene, så de kommer i spil.");
    expect(p.sti).toBe("/reports");
  });

  it("uden upload_perioder (ældre kalder): som før — enhver upload er «godkend tallene»", () => {
    const p = rapport({ ...TOM, antal_rapporter: 3, antal_godkendte: 0 });
    expect(p.mangler).toEqual([MANGLER_TEKST.godkendelse]);
    expect(p.beskrivelse).toContain("godkend tallene");
  });

  // Instruks F (16/9): september-tal i september er limbo — «godkend tallene» er en lukket dør.
  it("KUN uploads af måneder der ikke er omme: «kan først godkendes når den er omme. Upload {måneder} imens.» og Mangler «en afsluttet måned»", () => {
    const p = rapport({ ...TOM, antal_rapporter: 1, antal_godkendte: 0, upload_perioder: ["2026-09"] });
    expect(p.gjort).toBe(false);
    expect(p.beskrivelse).toBe("Den måned du har uploadet, kan først godkendes når den er omme. Upload juni, juli og august imens.");
    expect(p.mangler).toEqual([MANGLER_TEKST.afsluttet_maaned]);
    expect(MANGLER_TEKST.afsluttet_maaned).toBe("en afsluttet måned");
    expect(p.sti).toBe("/reports");
    expect(rapport({ ...TOM, antal_rapporter: 2, antal_godkendte: 0, upload_perioder: ["2026-09", "2026-10"] }).mangler).toEqual([MANGLER_TEKST.afsluttet_maaned]);
  });

  it("blandet (én afsluttet + én for tidlig), eller en upload uden læselig periode: «godkend tallene» som før (beslutning 5)", () => {
    expect(rapport({ ...TOM, antal_rapporter: 2, antal_godkendte: 0, upload_perioder: ["2026-09", "2026-08"] }).mangler).toEqual([MANGLER_TEKST.godkendelse]);
    expect(rapport({ ...TOM, antal_rapporter: 1, antal_godkendte: 0, upload_perioder: [null] }).mangler).toEqual([MANGLER_TEKST.godkendelse]);
    expect(rapport({ ...TOM, antal_rapporter: 2, antal_godkendte: 0, upload_perioder: ["2026-09", null] }).mangler).toEqual([MANGLER_TEKST.godkendelse]);
  });

  it("grænsen er dansk tid: september-uploaden bliver «godkend tallene» kl. 00:00 den 1/10, ikke før", () => {
    const input = { ...TOM, antal_rapporter: 1, antal_godkendte: 0, upload_perioder: ["2026-09"] };
    expect(punkt(input, "tal", new Date("2026-09-30T21:59:59Z")).mangler).toEqual([MANGLER_TEKST.afsluttet_maaned]);
    expect(punkt(input, "tal", new Date("2026-09-30T22:00:00Z")).mangler).toEqual([MANGLER_TEKST.godkendelse]);
  });

  it("godkendt: gjort, ingen mangler — også med en for-tidlig upload ved siden af, og også uden upload-tælling (rapporten slettet efter godkendelse)", () => {
    expect(rapport({ ...TOM, antal_rapporter: 2, antal_godkendte: 1, upload_perioder: ["2026-09", "2026-08"] })).toMatchObject({ gjort: true, mangler: [] });
    expect(rapport({ ...TOM, antal_rapporter: 1, antal_godkendte: 1 })).toMatchObject({ gjort: true, mangler: [] });
    expect(rapport({ ...TOM, antal_rapporter: 0, antal_godkendte: 1 }).gjort).toBe(true);
  });

  it("tællinger: 0 er ikke gjort, negative tal er heller ikke gjort", () => {
    expect(gjortAf({ ...TOM, antal_rapporter: 0 }).tal).toBe(false);
    expect(gjortAf({ ...TOM, antal_udfyldte_handouts: -1 }).akademi).toBe(false);
  });

  it("uploadet-ikke-godkendt holder tjeklisten åben — fokuskortet går ikke videre", () => {
    const t = byggTjekliste({ ...FULD, antal_godkendte: 0 });
    expect(t.faerdig).toBe(false);
    expect(t.antal_gjort).toBe(t.antal_i_alt - 1);
  });
});

describe("byggTjekliste — punkt 4 «Dine mål»: et AKTIVT, BEKRÆFTET mål (Dine måls egen dom, maalBekraeft.erBekraeftet)", () => {
  it("ingen mål: ikke gjort, ingen mangler, stien er Dine mål", () => {
    const p = punkt(TOM, "maal");
    expect(p).toMatchObject({ gjort: false, mangler: [], sti: "/milestones", titel: "Sæt dit første mål" });
    expect(p.beskrivelse).toBe("Ét mål med en frist — så ved vi begge, hvad vi arbejder hen imod.");
  });

  it("et aktivt bekræftet mål → gjort; et parkeret, nået eller ubekræftet mål tæller ikke", () => {
    expect(punkt({ ...TOM, maal: [{ status: "active", bekraeftet_at: "2026-10-06T10:00:00.000Z" }] }, "maal").gjort).toBe(true);
    expect(punkt({ ...TOM, maal: [{ status: "parked", bekraeftet_at: "2026-10-06T10:00:00.000Z" }] }, "maal").gjort).toBe(false);
    expect(punkt({ ...TOM, maal: [{ status: "completed", bekraeftet_at: "2026-10-06T10:00:00.000Z" }] }, "maal").gjort).toBe(false);
    expect(punkt({ ...TOM, maal: [{ status: "active", bekraeftet_at: null }] }, "maal").gjort).toBe(false);
    expect(punkt({ ...TOM, maal: [{ status: "active", bekraeftet_at: "  " }] }, "maal").gjort).toBe(false);
  });

  it("kolonnen ulæst (bekraeftet_at undefined — migration 20261002100000 ikke kørt): et aktivt mål tæller, som i Dine mål", () => {
    expect(punkt({ ...TOM, maal: [{ status: "active" }] }, "maal").gjort).toBe(true);
    expect(punkt({ ...TOM, maal: [{ status: "parked" }] }, "maal").gjort).toBe(false);
  });

  it("et aktivt mål venter på medlemmets ja (en rådgivers forslag): ikke gjort, mangler siger det, og beskrivelsen peger på det", () => {
    const p = punkt({ ...TOM, maal: [{ status: "active", bekraeftet_at: null }] }, "maal");
    expect(p.gjort).toBe(false);
    expect(p.mangler).toEqual([MANGLER_TEKST.bekraeftelse]);
    expect(p.beskrivelse).toBe("Et mål venter på dit ja — sig ja til det, eller sæt dit eget.");
    // Er ét mål bekræftet, er punktet gjort, selv om et andet venter.
    const begge = punkt({ ...TOM, maal: [{ status: "active", bekraeftet_at: null }, { status: "active", bekraeftet_at: "2026-10-06T10:00:00.000Z" }] }, "maal");
    expect(begge).toMatchObject({ gjort: true, mangler: [] });
  });

  it("udeladt maal (ældre kalder) = ingen mål = ikke gjort", () => {
    const { maal: _maal, ...uden } = TOM;
    void _maal;
    expect(punkt(uden, "maal").gjort).toBe(false);
  });
});

// ── Mål-punktet findes for nye medlemmer, og kun for dem (MAAL_PUNKT_FRA, 2/10) ──
// Samme regel som delingspunktet fik 14/9: et medlem, der var færdig,
// FORBLIVER færdig — listen åbner ikke igen for de eksisterende.
describe("byggTjekliste — «Sæt dit første mål» findes for nye medlemmer, og kun for dem", () => {
  const GAMMELT: TjeklisteInput = { ...TOM, medlem_siden: GAMMELT_SIDEN };

  it("grænsen er 3/10-2026 UTC-midnat, og dommen er ren: fra og med → ja, før → nej, null/ugyldig → nej", () => {
    expect(MAAL_PUNKT_FRA).toBe("2026-10-03T00:00:00.000Z");
    expect(maalPunktGaelder("2026-10-03T00:00:00.000Z")).toBe(true);
    expect(maalPunktGaelder(NYT_SIDEN)).toBe(true);
    expect(maalPunktGaelder("2026-10-02T23:59:59.999Z")).toBe(false);
    expect(maalPunktGaelder(GAMMELT_SIDEN)).toBe(false);
    expect(maalPunktGaelder(null)).toBe(false);
    expect(maalPunktGaelder(undefined)).toBe(false);
    expect(maalPunktGaelder("")).toBe(false);
    expect(maalPunktGaelder("ikke en dato")).toBe(false);
  });

  it("eksisterende medlem (før grænsen) eller uden dato: fem punkter, maal er ikke iblandt — også selv om et mål skulle findes", () => {
    const { medlem_siden: _siden, ...udenDato } = TOM;
    void _siden;
    for (const input of [GAMMELT, udenDato, { ...GAMMELT, maal: FULD.maal }]) {
      const ud = byggTjekliste(input);
      expect(ud.punkter.map((p) => p.id)).toEqual(["boardroom", "raadgiver", "tal", "netvaerk", "akademi"]);
      expect(ud.antal_i_alt).toBe(5);
    }
  });

  it("et medlem der var færdig før 2/10 (alle de gamle domme opfyldt), FORBLIVER færdig — uden et mål", () => {
    const foer = byggTjekliste({ ...FULD, medlem_siden: GAMMELT_SIDEN, maal: [] });
    expect(foer.faerdig).toBe(true);
    expect(foer.antal_gjort).toBe(5);
    expect(foer.antal_i_alt).toBe(5);
  });

  it("nyt medlem der har gjort alt det gamle er IKKE færdig før målet er sat — og så er hun", () => {
    const altGammelt = byggTjekliste({ ...FULD, maal: [] });
    expect(altGammelt.antal_gjort).toBe(5);
    expect(altGammelt.antal_i_alt).toBe(6);
    expect(altGammelt.faerdig).toBe(false);
    expect(byggTjekliste(FULD).faerdig).toBe(true);
  });

  it("de øvrige punkter er uændrede med og uden mål-punktet: samme id'er, titler, stier, gjort og beskrivelser", () => {
    const uden = byggTjekliste(GAMMELT).punkter;
    const med = byggTjekliste(TOM).punkter.filter((p) => p.id !== "maal");
    expect(med.map((p) => [p.id, p.titel, p.sti, p.gjort, p.beskrivelse, p.sted])).toEqual(uden.map((p) => [p.id, p.titel, p.sti, p.gjort, p.beskrivelse, p.sted]));
  });
});

describe("byggTjekliste — rækkefølge, steder og stier er LÅST (seks steder, 2/10)", () => {
  it("rækkefølgen er menuens seks steder (hbNav.SEKS_STEDER) med ÉN flytning: rådgiveren som nr. 2 — mennesket før tallene", () => {
    const menu = [...SEKS_STEDER];
    const forventet = [menu[0], menu[5], ...menu.slice(1, 5)];
    expect(forventet).toEqual(["Dit Boardroom", "Din rådgiver", "Dine tal", "Dine mål", "Netværket", "Akademiet"]);
    const ud = byggTjekliste(TOM);
    expect(ud.punkter.map((p) => TJEKLISTE_STED_LABEL[p.sted])).toEqual(forventet);
    expect([...TJEKLISTE_RAEKKEFOELGE]).toEqual(["boardroom", "raadgiver", "tal", "maal", "netvaerk", "akademi"]);
    expect(ud.punkter.map((p) => p.id)).toEqual([...TJEKLISTE_RAEKKEFOELGE]);
  });

  it("hvert punkt har sit eget sted, og stedets ord er menuens — ét punkt pr. sted, alle seks steder dækket", () => {
    const steder = byggTjekliste(TOM).punkter.map((p) => p.sted);
    expect(new Set(steder).size).toBe(6);
    expect(new Set(steder)).toEqual(new Set(Object.keys(STEDS_SAETNINGER) as Sted[]));
    expect(new Set(Object.values(TJEKLISTE_STED_LABEL))).toEqual(new Set(SEKS_STEDER));
    for (const p of byggTjekliste(TOM).punkter) expect(TJEKLISTE_STED[p.id]).toBe(p.sted);
  });

  it("rækkefølgen er den samme uanset input", () => {
    expect(byggTjekliste(FULD).punkter.map((p) => p.id)).toEqual(byggTjekliste(TOM).punkter.map((p) => p.id));
  });

  it("stierne (alt gjort): boardroom → /settings, raadgiver → /chat, tal → /reports, maal → /milestones, netvaerk → /community?praesentation=1, akademi → /akademiet (1/10: øvelsen bor i Akademiet, aldrig /handouts)", () => {
    const stier = Object.fromEntries(byggTjekliste(FULD).punkter.map((p) => [p.id, p.sti]));
    expect(stier).toEqual({
      boardroom: "/settings",
      raadgiver: "/chat",
      tal: "/reports",
      maal: "/milestones",
      netvaerk: "/community?praesentation=1",
      akademi: "/akademiet",
    });
    expect(TJEKLISTE_STIER).toEqual({
      velkomst: "",
      virksomhed: "/settings",
      raadgiver: "/chat",
      tal: "/reports",
      maal: "/milestones",
      profil: "/settings?fane=profil",
      praesentation: "/community?praesentation=1",
      akademi: "/akademiet",
    });
    expect(Object.values(TJEKLISTE_STIER).some((s) => s.startsWith("/handout"))).toBe(false);
  });

  it("hvert punkt har titel og beskrivelse, og teksten er kort, varm og i «du» — aldrig et «De» eller et udråbstegn", () => {
    for (const p of byggTjekliste(TOM).punkter) {
      expect(p.titel.length).toBeGreaterThan(0);
      expect(p.beskrivelse.length).toBeGreaterThan(0);
      expect(p.titel.length).toBeLessThanOrEqual(60);
      expect(`${p.titel} ${p.beskrivelse}`).not.toMatch(/!/);
      expect(`${p.titel} ${p.beskrivelse}`).not.toMatch(/\bDe\b|\bDem\b|\bDeres\b/);
    }
  });

  it("punkter uden delvis tilstand har ingen mangler-liste (raadgiver, akademi)", () => {
    const ud = byggTjekliste(TOM);
    for (const id of ["raadgiver", "akademi"] as TjeklistePunktId[]) {
      expect(ud.punkter.find((p) => p.id === id)?.mangler).toBeUndefined();
    }
  });

  it("«Fortæl det videre» er ude (Jonas 2/10): intet punkt hedder det, og intet peger på /deling", () => {
    const ud = byggTjekliste({ ...FULD, antal_godkendte: 0 });
    expect(ud.punkter.map((p) => p.titel)).not.toContain("Fortæl det videre");
    expect(ud.punkter.map((p) => p.sti)).not.toContain("/deling");
    expect(Object.values(TJEKLISTE_STIER)).not.toContain("/deling");
  });
});

describe("byggTjekliste — punkt 2 «Din rådgiver» og punkt 6 «Akademiet» (uændrede domme)", () => {
  it("raadgiver: gjort = last_member_message_at (triggeren sætter det kun for ikke-rådgivere), titel og sti", () => {
    const p = punkt(TOM, "raadgiver");
    expect(p).toMatchObject({ gjort: false, titel: "Skriv din første besked", sti: "/chat" });
    expect(p.titel).toMatch(/^Skriv/);
    expect(punkt({ ...TOM, last_member_message_at: FULD.last_member_message_at }, "raadgiver").gjort).toBe(true);
  });

  it("akademi: gjort = et udfyldt handout (antal_udfyldte_handouts > 0), titel og sti", () => {
    const p = punkt(TOM, "akademi");
    expect(p).toMatchObject({ gjort: false, titel: "Gennemfør din første lektion med øvelse", sti: "/akademiet" });
    expect(punkt({ ...TOM, antal_udfyldte_handouts: 1 }, "akademi").gjort).toBe(true);
  });
});
