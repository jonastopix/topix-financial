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
  velkomstvideo_set_at: null,
  avatar_url: null,
  ask_me_about: null,
  website: null,
  industry_label: null,
  cvr_number: null,
  antal_rapporter: 0,
  antal_udfyldte_handouts: 0,
  last_member_message_at: null,
};

const FULD: TjeklisteInput = {
  velkomstvideo_set_at: "2026-09-02T10:00:00.000Z",
  avatar_url: "https://x/storage/v1/object/public/avatars/u1/avatar",
  ask_me_about: "Likviditet og prissætning i håndværk.",
  website: "https://firma.dk",
  industry_label: "Håndværk",
  cvr_number: "12345678",
  antal_rapporter: 1,
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
    { id: "profil", input: { avatar_url: FULD.avatar_url, ask_me_about: FULD.ask_me_about } },
    { id: "virksomhed", input: { website: FULD.website, industry_label: FULD.industry_label, cvr_number: FULD.cvr_number } },
    { id: "rapport", input: { antal_rapporter: 1 } },
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
  it("profil: avatar men ikke ask_me_about → gjort=false, mangler nævner ask_me_about og IKKE billedet", () => {
    const ud = byggTjekliste({ ...TOM, avatar_url: FULD.avatar_url });
    const profil = ud.punkter.find((p) => p.id === "profil")!;
    expect(profil.gjort).toBe(false);
    expect(profil.mangler).toContain(MANGLER_TEKST.ask_me_about);
    expect(profil.mangler).not.toContain(MANGLER_TEKST.billede);
  });

  it("profil: ask_me_about men ikke avatar → mangler nævner billedet og IKKE ask_me_about", () => {
    const ud = byggTjekliste({ ...TOM, ask_me_about: FULD.ask_me_about });
    const profil = ud.punkter.find((p) => p.id === "profil")!;
    expect(profil.gjort).toBe(false);
    expect(profil.mangler).toEqual([MANGLER_TEKST.billede]);
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

  it("punkter uden delvis tilstand har ingen mangler-liste", () => {
    const ud = byggTjekliste(TOM);
    for (const id of ["velkomst", "rapport", "handout", "besked"] as TjeklistePunktId[]) {
      expect(ud.punkter.find((p) => p.id === id)?.mangler).toBeUndefined();
    }
  });
});

describe("byggTjekliste — tomme strenge og mellemrum tæller ikke som udfyldt", () => {
  it("profil: avatar_url og ask_me_about som tomme strenge / mellemrum", () => {
    const gjort = gjortAf({ ...TOM, avatar_url: "", ask_me_about: "   " });
    expect(gjort.profil).toBe(false);
    const profil = byggTjekliste({ ...TOM, avatar_url: "", ask_me_about: "   " }).punkter.find((p) => p.id === "profil")!;
    expect(profil.mangler).toEqual([MANGLER_TEKST.billede, MANGLER_TEKST.ask_me_about]);
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

  it("stierne: profil og virksomhed → /settings, rapport → /rapportering, handout → /handouts, besked → /chat, velkomst → tom", () => {
    const stier = Object.fromEntries(byggTjekliste(TOM).punkter.map((p) => [p.id, p.sti]));
    expect(stier).toEqual({
      velkomst: "",
      profil: "/settings",
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
