import { describe, it, expect } from "vitest";
import {
  byggTjekliste,
  MANGLER_TEKST,
  TJEKLISTE_RAEKKEFOELGE,
  TJEKLISTE_STIER,
  type TjeklisteInput,
  type TjeklistePunktId,
} from "../onboardingTjekliste";

const TOM: TjeklisteInput = {
  har_velkomstvideo: true,
  velkomstvideo_set_at: null,
  ask_me_about: null,
  website: null,
  industry_label: null,
  cvr_number: null,
  antal_rapporter: 0,
  antal_godkendte: 0,
  antal_udfyldte_handouts: 0,
  last_member_message_at: null,
};

const FULD: TjeklisteInput = {
  har_velkomstvideo: true,
  velkomstvideo_set_at: "2026-09-02T10:00:00.000Z",
  ask_me_about: "Likviditet og prissætning i håndværk.",
  website: "https://firma.dk",
  industry_label: "Håndværk",
  cvr_number: "12345678",
  antal_rapporter: 1,
  antal_godkendte: 1,
  antal_udfyldte_handouts: 1,
  last_member_message_at: "2026-09-02T11:00:00.000Z",
};

const ALLE_ID: TjeklistePunktId[] = ["velkomst", "profil", "virksomhed", "rapport", "handout", "besked"];

function gjortAf(input: TjeklisteInput): Record<TjeklistePunktId, boolean> {
  const ud = byggTjekliste(input);
  return Object.fromEntries(ud.punkter.map((p) => [p.id, p.gjort])) as Record<TjeklistePunktId, boolean>;
}

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
    expect(ud.punkter.find((p) => p.id === "profil")?.mangler).toEqual([]);
    expect(ud.punkter.find((p) => p.id === "virksomhed")?.mangler).toEqual([]);
  });
});

describe("byggTjekliste — hvert punkt for sig: kun det ene felt sat, kun det punkt bliver true", () => {
  const kunEt: { id: TjeklistePunktId; input: Partial<TjeklisteInput> }[] = [
    { id: "velkomst", input: { velkomstvideo_set_at: FULD.velkomstvideo_set_at } },
    { id: "profil", input: { ask_me_about: FULD.ask_me_about } },
    { id: "virksomhed", input: { website: FULD.website, industry_label: FULD.industry_label, cvr_number: FULD.cvr_number } },
    { id: "rapport", input: { antal_rapporter: 1, antal_godkendte: 1 } },
    { id: "handout", input: { antal_udfyldte_handouts: 1 } },
    { id: "besked", input: { last_member_message_at: FULD.last_member_message_at } },
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

describe("byggTjekliste — delvist gjort", () => {
  it("profil: ask_me_about mangler → gjort=false, mangler er præcis det ene — intet om billedet (9/9)", () => {
    const ud = byggTjekliste(TOM);
    const profil = ud.punkter.find((p) => p.id === "profil")!;
    expect(profil.gjort).toBe(false);
    expect(profil.mangler).toEqual([MANGLER_TEKST.ask_me_about]);
    expect(profil.mangler!.join(" ")).not.toMatch(/billede/);
    expect(profil.beskrivelse).toBe("Hvad de andre kan spørge dig om.");
  });

  it("profil: ask_me_about alene er nok — billedet indgår ikke (bor på /konto)", () => {
    const ud = byggTjekliste({ ...TOM, ask_me_about: FULD.ask_me_about });
    const profil = ud.punkter.find((p) => p.id === "profil")!;
    expect(profil.gjort).toBe(true);
    expect(profil.mangler).toEqual([]);
  });

  it("virksomhed: website og CVR men ikke branche → mangler er præcis branchen", () => {
    const ud = byggTjekliste({ ...TOM, website: FULD.website, cvr_number: FULD.cvr_number });
    const v = ud.punkter.find((p) => p.id === "virksomhed")!;
    expect(v.gjort).toBe(false);
    expect(v.mangler).toEqual([MANGLER_TEKST.branche]);
  });

  it("virksomhed: intet sat → alle tre mangler, i fast rækkefølge website, branche, CVR", () => {
    const v = byggTjekliste(TOM).punkter.find((p) => p.id === "virksomhed")!;
    expect(v.mangler).toEqual([MANGLER_TEKST.website, MANGLER_TEKST.branche, MANGLER_TEKST.cvr]);
  });

  it("punkter uden delvis tilstand har ingen mangler-liste (rapport har en siden 9/9 — tom når intet er uploadet)", () => {
    const ud = byggTjekliste(TOM);
    for (const id of ["velkomst", "handout", "besked"] as TjeklistePunktId[]) {
      expect(ud.punkter.find((p) => p.id === id)?.mangler).toBeUndefined();
    }
    expect(ud.punkter.find((p) => p.id === "rapport")?.mangler).toEqual([]);
  });
});

describe("byggTjekliste — tomme strenge og mellemrum tæller ikke som udfyldt", () => {
  it("profil: ask_me_about som tom streng / mellemrum", () => {
    const gjort = gjortAf({ ...TOM, ask_me_about: "   " });
    expect(gjort.profil).toBe(false);
    const profil = byggTjekliste({ ...TOM, ask_me_about: "   " }).punkter.find((p) => p.id === "profil")!;
    expect(profil.mangler).toEqual([MANGLER_TEKST.ask_me_about]);
  });

  it("virksomhed: et website på « » er ikke et website", () => {
    const v = byggTjekliste({ ...TOM, website: " ", industry_label: "\t", cvr_number: "" }).punkter.find((p) => p.id === "virksomhed")!;
    expect(v.gjort).toBe(false);
    expect(v.mangler).toEqual([MANGLER_TEKST.website, MANGLER_TEKST.branche, MANGLER_TEKST.cvr]);
  });

  it("men en værdi med mellemrum omkring tæller", () => {
    const gjort = gjortAf({ ...FULD, website: "  https://firma.dk  ", ask_me_about: " Likviditet. " });
    expect(gjort.virksomhed).toBe(true);
    expect(gjort.profil).toBe(true);
  });

  it("tællinger: 0 er ikke gjort, negative tal er heller ikke gjort", () => {
    expect(gjortAf({ ...TOM, antal_rapporter: 0 }).rapport).toBe(false);
    expect(gjortAf({ ...TOM, antal_udfyldte_handouts: -1 }).handout).toBe(false);
  });
});

describe("byggTjekliste — «Dine tal» er gjort ved GODKENDELSE, ikke ved upload (rettet 9/9)", () => {
  const rapport = (input: TjeklisteInput) => byggTjekliste(input).punkter.find((p) => p.id === "rapport")!;

  it("nul rapporter: ikke gjort, ingen mangler-linje, upload-teksten", () => {
    const p = rapport({ ...TOM, antal_rapporter: 0, antal_godkendte: 0 });
    expect(p.gjort).toBe(false);
    expect(p.mangler).toEqual([]);
    expect(p.beskrivelse).toBe("Upload din første rapport, så tallene kommer i spil.");
  });

  it("uploadet men ikke godkendt: IKKE gjort — «Mangler: at godkende tallene», stien er rapporteringen", () => {
    const p = rapport({ ...TOM, antal_rapporter: 3, antal_godkendte: 0 });
    expect(p.gjort).toBe(false);
    expect(p.mangler).toEqual([MANGLER_TEKST.godkendelse]);
    expect(MANGLER_TEKST.godkendelse).toBe("at godkende tallene");
    expect(p.beskrivelse).toContain("godkend tallene");
    expect(p.sti).toBe("/rapportering");
  });

  it("godkendt: gjort, ingen mangler", () => {
    const p = rapport({ ...TOM, antal_rapporter: 1, antal_godkendte: 1 });
    expect(p.gjort).toBe(true);
    expect(p.mangler).toEqual([]);
  });

  it("godkendt uden upload-tælling (rapporten slettet efter godkendelse): stadig gjort — facts-rækken er handlingen", () => {
    expect(rapport({ ...TOM, antal_rapporter: 0, antal_godkendte: 1 }).gjort).toBe(true);
  });

  it("uploadet-ikke-godkendt holder tjeklisten åben — fokuskortet går ikke videre", () => {
    const t = byggTjekliste({ ...FULD, antal_godkendte: 0 });
    expect(t.faerdig).toBe(false);
    expect(t.antal_gjort).toBe(t.antal_i_alt - 1);
  });
});

describe("byggTjekliste — rækkefølge og stier er LÅST", () => {
  // Ændres rækkefølgen, ændres oplevelsen: først det platformen har brug
  // for (profil, virksomhed), så det de får noget ud af (rapport, handout),
  // så mennesket (besked). Videoen først, fordi den forklarer resten.
  it("punkternes id'er i den faste rækkefølge", () => {
    const ud = byggTjekliste(TOM);
    expect(ud.punkter.map((p) => p.id)).toEqual(["velkomst", "profil", "virksomhed", "rapport", "handout", "besked"]);
    expect([...TJEKLISTE_RAEKKEFOELGE]).toEqual(["velkomst", "profil", "virksomhed", "rapport", "handout", "besked"]);
  });

  it("rækkefølgen er den samme uanset input", () => {
    expect(byggTjekliste(FULD).punkter.map((p) => p.id)).toEqual(byggTjekliste(TOM).punkter.map((p) => p.id));
  });

  it("stierne: profil → /settings?fane=profil (fanen, ikke siden — 9/9), virksomhed → /settings, rapport → /rapportering, handout → /handouts, besked → /chat, velkomst → tom", () => {
    const stier = Object.fromEntries(byggTjekliste(TOM).punkter.map((p) => [p.id, p.sti]));
    expect(stier).toEqual({
      velkomst: "",
      profil: "/settings?fane=profil",
      virksomhed: "/settings",
      rapport: "/rapportering",
      handout: "/handouts",
      besked: "/chat",
    });
    expect(TJEKLISTE_STIER).toEqual(stier);
  });

  it("hvert punkt har titel og beskrivelse", () => {
    for (const p of byggTjekliste(TOM).punkter) {
      expect(p.titel.length).toBeGreaterThan(0);
      expect(p.beskrivelse.length).toBeGreaterThan(0);
    }
  });
});

describe("byggTjekliste — uden velkomstvideo udgår velkomsten (vi viser ikke tomt indhold)", () => {
  it("uden video: fem punkter, velkomst er ikke iblandt, antal_i_alt 5", () => {
    const ud = byggTjekliste({ ...TOM, har_velkomstvideo: false });
    expect(ud.punkter).toHaveLength(5);
    expect(ud.punkter.map((p) => p.id)).toEqual(["profil", "virksomhed", "rapport", "handout", "besked"]);
    expect(ud.punkter.some((p) => p.id === "velkomst")).toBe(false);
    expect(ud.antal_i_alt).toBe(5);
  });

  it("uden video tæller velkomstvideo_set_at ikke med — hverken som gjort eller ikke gjort", () => {
    const ud = byggTjekliste({ ...TOM, har_velkomstvideo: false, velkomstvideo_set_at: FULD.velkomstvideo_set_at });
    expect(ud.antal_gjort).toBe(0);
    expect(ud.antal_i_alt).toBe(5);
  });

  it("uden video er listen færdig når de fem er gjort", () => {
    const ud = byggTjekliste({ ...FULD, har_velkomstvideo: false, velkomstvideo_set_at: null });
    expect(ud.antal_gjort).toBe(5);
    expect(ud.faerdig).toBe(true);
  });

  it("med video: seks, i den kendte rækkefølge", () => {
    const ud = byggTjekliste({ ...TOM, har_velkomstvideo: true });
    expect(ud.punkter.map((p) => p.id)).toEqual(["velkomst", "profil", "virksomhed", "rapport", "handout", "besked"]);
    expect(ud.antal_i_alt).toBe(6);
  });
});
