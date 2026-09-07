import { describe, it, expect } from "vitest";
import {
  FORNYELSE_CALENDLY_URL,
  FORNYELSE_FORSIDE_URL,
  LABEL_VARSEL_1,
  LABEL_VARSEL_2,
  varsel1Mail,
  varsel2Mail,
} from "../../../supabase/functions/_shared/fornyelsesMail.ts";

// Fornyelsens to varsler (7/9): rene funktioner i _shared, testet herfra
// som opslagsMail.test.ts. Datoen og beløbet kommer formateret ind;
// virksomhedens navn escapes af layoutet.

const PHILBERT = { fornavn: "Philip", virksomhed: "PHILBERT ApS", slutDato: "29. september 2026", beloebKr: 20000 };

describe("varsel 1 — 30 dage før", () => {
  const m = varsel1Mail(PHILBERT);

  it("emnet bærer datoen", () => {
    expect(m.subject).toBe("Dit år med The Boardroom slutter 29. september 2026");
  });

  it("indholdet: tiltale, virksomhed, dato, pris, «mister ingen dage»", () => {
    expect(m.html).toContain("Kære Philip,");
    expect(m.html).toContain("PHILBERT ApS");
    expect(m.html).toContain("slutter 29. september 2026");
    expect(m.html).toContain("20.000 kr. ekskl. moms");
    expect(m.html).toContain("mister ingen dage");
  });

  it("knappen hedder som båndet og peger på forsiden — ikke på Stripe", () => {
    expect(m.html).toContain("Forny medlemskabet");
    expect(m.html).toContain(`href="${FORNYELSE_FORSIDE_URL}"`);
    expect(m.html).not.toMatch(/stripe\.com|checkout\.|Betal nu/);
  });

  it("Calendly-linket står som almindeligt link, med «tag en snak med Jonas»", () => {
    expect(FORNYELSE_CALENDLY_URL).toBe("https://calendly.com/topix-jonas/fornyelse");
    expect(m.html).toContain(FORNYELSE_CALENDLY_URL);
    expect(m.html).toContain("tag en snak med Jonas");
  });

  it("uden fornavn: «Kære,» — aldrig «Kære ,»", () => {
    const html = varsel1Mail({ ...PHILBERT, fornavn: null }).html;
    expect(html).toContain("Kære,");
    expect(html).not.toContain("Kære ,");
  });

  it("et virksomhedsnavn med & og < escapes", () => {
    const html = varsel1Mail({ ...PHILBERT, virksomhed: "Friends & Fries <ApS>" }).html;
    expect(html).toContain("Friends &amp; Fries &lt;ApS&gt;");
    expect(html).not.toContain("<ApS>");
  });

  it("skæve beløb: hele kroner med punktum, ingen «by Topix»", () => {
    expect(varsel1Mail({ ...PHILBERT, beloebKr: 15000 }).html).toContain("15.000 kr.");
    expect(m.html).not.toContain("by Topix");
  });
});

describe("varsel 2 — 7 dage eller færre før", () => {
  const m = varsel2Mail({ ...PHILBERT, dageTilUdloeb: 7 });

  it("kortere: datoen, prisen, knappen — ingen Calendly, ingen ny information", () => {
    expect(m.subject).toBe("Påmindelse: dit medlemskab slutter 29. september 2026");
    expect(m.html).toContain("Hej Philip,");
    expect(m.html).toContain("slutter 29. september 2026");
    expect(m.html).toContain("20.000 kr. ekskl. moms");
    expect(m.html).toContain("Forny medlemskabet");
    expect(m.html).toContain(`href="${FORNYELSE_FORSIDE_URL}"`);
    expect(m.html).not.toContain(FORNYELSE_CALENDLY_URL);
    expect(m.html).not.toContain("mister ingen dage");
  });

  it("er kortere end varsel 1", () => {
    expect(m.html.length).toBeLessThan(varsel1Mail(PHILBERT).html.length);
  });

  // Emnet siger det man selv ville sige (besluttet 7/9): dag 0 «i dag»,
  // dag 1 «i morgen», dag 2-7 datoen. Brødteksten følger med, og bærer
  // datoen som præcisering på dag 0 og 1. Grænserne låses fra begge sider.
  const carma = { ...PHILBERT, fornavn: "Carla", virksomhed: "CARMA STUDIO", slutDato: "7. september 2026" };

  it("dag 0: «i dag» i emnet, «i dag, 7. september 2026» i teksten", () => {
    const d0 = varsel2Mail({ ...carma, dageTilUdloeb: 0 });
    expect(d0.subject).toBe("Påmindelse: dit medlemskab slutter i dag");
    expect(d0.html).toContain("slutter i dag, 7. september 2026");
    expect(d0.subject).not.toContain("Om en uge");
  });

  it("dag 1: «i morgen» i emnet og i teksten, med datoen", () => {
    const d1 = varsel2Mail({ ...carma, dageTilUdloeb: 1 });
    expect(d1.subject).toBe("Påmindelse: dit medlemskab slutter i morgen");
    expect(d1.html).toContain("slutter i morgen, 7. september 2026");
  });

  it("dag 2 og dag 7: datoen i emnet og i teksten — ikke «i morgen», ikke «om en uge»", () => {
    for (const dage of [2, 7]) {
      const d = varsel2Mail({ ...carma, dageTilUdloeb: dage });
      expect(d.subject).toBe("Påmindelse: dit medlemskab slutter 7. september 2026");
      expect(d.html).toContain("slutter 7. september 2026,");
      expect(d.html).not.toContain("i morgen");
      expect(d.html).not.toContain("i dag,");
    }
  });

  it("dagtal null (motoren kunne ikke læse datoen): datoformen, aldrig et gæt", () => {
    expect(varsel2Mail({ ...carma, dageTilUdloeb: null }).subject).toBe("Påmindelse: dit medlemskab slutter 7. september 2026");
  });
});

describe("labels til email_send_log (næste PR)", () => {
  it("to forskellige labels, så varsel 1 og 2 kan skelnes i loggen", () => {
    expect(LABEL_VARSEL_1).toBe("fornyelse-varsel1");
    expect(LABEL_VARSEL_2).toBe("fornyelse-varsel2");
    expect(LABEL_VARSEL_1).not.toBe(LABEL_VARSEL_2);
  });
});
