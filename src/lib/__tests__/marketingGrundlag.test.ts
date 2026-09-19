import { describe, expect, it } from "vitest";
import {
  MANGLER, harVi, PRODUKT, JONAS, WEBINAR, TESTIMONIALS, MEDLEMSUDTALELSER,
  HAR_MEDLEMSUDTALELSER, KENDTE_CITATER, FORBUD, SPROG, BROEN,
} from "@/lib/marketing/grundlag";

// Grundlaget er ikke kode, der regner — det er fakta, der bliver sendt til mennesker.
// Prøverne her holder fast i de tre ting, en agent ellers ville gætte forkert på:
// prisen, det manglende, og hvad testimonials handler om.

describe("grundlag — prisen", () => {
  it("de to priser er IKKE det samme tal: 4.375 × 12 = 52.500, ikke 50.000", () => {
    expect(PRODUKT.pris.maaned_kr * 12).toBe(52500);
    expect(PRODUKT.pris.maaned_kr * 12).not.toBe(PRODUKT.pris.aar_kr);
    // Ratetillægget forklarer forskellen — og det står i grundlaget, så ingen
    // behøver regne baglæns for at forstå den.
    expect(Math.round(PRODUKT.pris.aar_kr * (1 + PRODUKT.pris.tillaeg_pct / 100))).toBe(52500);
  });
  it("advarslen står i grundlaget, ikke kun i et hoved", () => {
    expect(PRODUKT.pris.advarsel).toContain("52.500");
    expect(PRODUKT.pris.advarsel).toContain("ratetillæg");
  });
});

describe("grundlag — det, vi ikke har, står som MANGLER", () => {
  it("MANGLER er en værdi, ikke en tom streng", () => {
    expect(MANGLER).toBe("MANGLER");
    expect(harVi(MANGLER)).toBe(false);
    expect(harVi("noget")).toBe(true);
  });
  it("webinarets titel og de fire målgruppebeskrivelser er ikke opfundet", () => {
    expect(harVi(WEBINAR.titel)).toBe(false);
    expect(harVi(WEBINAR.maalgruppebeskrivelser)).toBe(false);
  });
  it("Jonas har ingen digtet historik", () => {
    expect(harVi(JONAS.historik)).toBe(false);
    expect(harVi(JONAS.loefte)).toBe(false);
  });
  it("de tre Morten-udtalelser mangler stadig ordlyd — medlemmernes er kommet (19/9)", () => {
    const udenOrdlyd = TESTIMONIALS.filter((t) => !harVi(t.citat)).map((t) => t.navn);
    expect(udenOrdlyd).toEqual(["Carsten Guldhammer", "Christoffer Hübertz", "Søren Guldager"]);
    // Værnet godkender kun nedskrevne citater. Listen er Mortens løfte + de to medlemmer.
    expect(KENDTE_CITATER).toHaveLength(3);
    expect(KENDTE_CITATER[0]).toBe("Jeg har lavet fejlene – så du slipper for dem.");
    expect(KENDTE_CITATER[1]).toContain("ro i maven");
    expect(KENDTE_CITATER[2]).toContain("God og brugbar undervisning");
  });
});

describe("grundlag — to kategorier, der aldrig må blandes", () => {
  it("tilladelsen står på hvert citat og følger kategorien", () => {
    for (const t of TESTIMONIALS) {
      expect(t.maa_bruges_som_medlemsbevis).toBe(t.kategori === "medlem");
    }
  });
  it("medlemsbeviset er Daniel og Peter — og kun dem", () => {
    expect(MEDLEMSUDTALELSER.map((t) => t.navn)).toEqual(["Daniel Sand", "Peter Holst Jacobsen"]);
    expect(HAR_MEDLEMSUDTALELSER).toBe(true);
  });
  it("de tre om Morten må ALDRIG være bevis for, at The Boardroom virker", () => {
    for (const navn of ["Carsten Guldhammer", "Christoffer Hübertz", "Søren Guldager"]) {
      const t = TESTIMONIALS.find((x) => x.navn === navn);
      expect(t?.kategori).toBe("om_morten");
      expect(t?.maa_bruges_som_medlemsbevis).toBe(false);
    }
  });
  it("alle bærer navn, titel og virksomhed — de er identificerbare mennesker", () => {
    for (const t of TESTIMONIALS) {
      expect(t.navn.length).toBeGreaterThan(3);
      expect(t.titel.length).toBeGreaterThan(2);
      expect(t.virksomhed.length).toBeGreaterThan(2);
    }
  });
});

describe("grundlag — broen fra webinar til medlemskab", () => {
  it("de to ting er hverken det samme eller ubeslægtede", () => {
    expect(BROEN.webinaret_handler_om).toContain("vækststrategi");
    expect(BROEN.medlemskabet_leverer_ogsaa).toContain("likviditet");
    expect(BROEN.broen_gaar_gennem).toBe("beslutningerne");
  });
  it("Daniels ord bærer broen: beslutninger, ikke bogføring", () => {
    const daniel = MEDLEMSUDTALELSER[0].citat as string;
    expect(daniel).toContain("økonomiske beslutninger");
    expect(daniel).toContain("budgetter og likviditet");
    expect(daniel.toLowerCase()).not.toContain("bogføring");
  });
});

describe("grundlag — rammen og sproget", () => {
  it("webinarets emner er de to områder og de fem spørgsmål — ikke regnskab", () => {
    const emner = WEBINAR.emner.join(" ");
    expect(emner).toContain("to områder");
    expect(emner).toContain("fem faste spørgsmål");
    expect(emner.toLowerCase()).not.toContain("regnskab");
    expect(emner.toLowerCase()).not.toContain("nøgletal");
  });
  it("forbuddene nævner de fejl, der faktisk blev begået 19/9", () => {
    const alt = FORBUD.join(" ");
    expect(alt).toContain("regnskab");
    expect(alt).toContain("52.500");
    expect(alt).toContain("citat");
  });
  it("sprogreglerne er målt, ikke ment", () => {
    expect(SPROG.maalt.udraabstegn_i_klaviyo).toBe(0);
    expect(SPROG.maalt.superlativer).toBe(0);
    expect(SPROG.maalt.korpus).toContain("19/9");
  });
  it("vejen ind har samtalen FØR aftalen", () => {
    const iSamtale = PRODUKT.vejen_ind.findIndex((s) => s.includes("taler med Jonas"));
    const iAftale = PRODUKT.vejen_ind.findIndex((s) => s.includes("aftale"));
    expect(iSamtale).toBeGreaterThanOrEqual(0);
    expect(iAftale).toBeGreaterThan(iSamtale);
  });
});
