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

describe("varsel 2 — 7 dage før", () => {
  const m = varsel2Mail(PHILBERT);

  it("kortere: datoen, prisen, knappen — ingen Calendly, ingen ny information", () => {
    expect(m.subject).toBe("Om en uge slutter dit år med The Boardroom");
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
});

describe("labels til email_send_log (næste PR)", () => {
  it("to forskellige labels, så varsel 1 og 2 kan skelnes i loggen", () => {
    expect(LABEL_VARSEL_1).toBe("fornyelse-varsel1");
    expect(LABEL_VARSEL_2).toBe("fornyelse-varsel2");
    expect(LABEL_VARSEL_1).not.toBe(LABEL_VARSEL_2);
  });
});
