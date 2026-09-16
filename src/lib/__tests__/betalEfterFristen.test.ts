import { describe, expect, it } from "vitest";
import {
  afgoerEfterFristen,
  BETAL_FAKTURAEN,
  EFTER_FRISTEN_TITEL,
  erSikkertFakturalink,
  formaterFrist,
} from "@/lib/betalEfterFristen";

// DE TYVE (12), 16/9: /betal må aldrig sige «vi har sendt» før stemplet
// faktura_sendt_at er sat — teksten følger stemplet, ikke dagene. Og
// mailadressen står ALDRIG på siden: ingen streng fra dommen bærer et «@».

const FRIST = "2026-10-22";
const SENDT = "2026-10-23";
const LINK = "https://invoice.stripe.com/i/acct_x/test_y?s=ap";

describe("formaterFrist — «YYYY-MM-DD» til dansk dato uden new Date()", () => {
  it("2026-10-02 → 2. oktober 2026", () => {
    expect(formaterFrist("2026-10-02")).toBe("2. oktober 2026");
  });
  it("1. januar og 31. december", () => {
    expect(formaterFrist("2027-01-01")).toBe("1. januar 2027");
    expect(formaterFrist("2026-12-31")).toBe("31. december 2026");
  });
  it.each(["", "2026", "2026-13-01", "2026-00-10", "i går", "2026-10"])("ulæseligt %j gives uændret tilbage", (raa) => {
    expect(formaterFrist(raa)).toBe(raa);
  });
});

describe("afgoerEfterFristen — FØR afsendelse: «Fristen udløb {frist}. Du får en faktura … Pladsen står stadig klar til dig.», ingen knap", () => {
  it("ikke sendt (null): teksten ordret, tilstand faktura_paa_vej, knap null", () => {
    const d = afgoerEfterFristen({ frist: FRIST, faktura_sendt_den: null, faktura_url: null });
    expect(d).toEqual({
      tilstand: "faktura_paa_vej",
      titel: "Fristen er passeret",
      tekst: "Fristen udløb 22. oktober 2026. Du får en faktura på det fulde beløb. Pladsen står stadig klar til dig.",
      knap: null,
    });
  });
  it("felterne mangler helt (frontend før migrationen): samme svar — «du får», aldrig «vi har sendt»", () => {
    const d = afgoerEfterFristen({ frist: FRIST, faktura_sendt_den: undefined, faktura_url: undefined });
    expect(d.tilstand).toBe("faktura_paa_vej");
    expect(d.tekst).toContain("Du får en faktura");
    expect(d.tekst).not.toContain("har sendt");
  });
  it("et link uden stempel giver INGEN knap — stemplet afgør, ikke linket", () => {
    const d = afgoerEfterFristen({ frist: FRIST, faktura_sendt_den: null, faktura_url: LINK });
    expect(d.tilstand).toBe("faktura_paa_vej");
    expect(d.knap).toBeNull();
  });
  it("frist null/tom (fail-safe): «Fristen er udløbet. Du får …» — aldrig «undefined» i teksten", () => {
    for (const frist of [null, undefined, "", "  "]) {
      const d = afgoerEfterFristen({ frist, faktura_sendt_den: null, faktura_url: null });
      expect(d.tekst).toBe("Fristen er udløbet. Du får en faktura på det fulde beløb. Pladsen står stadig klar til dig.");
      expect(d.tekst).not.toContain("undefined");
    }
  });
});

describe("afgoerEfterFristen — EFTER afsendelse: «Vi har sendt fakturaen på mail den {dato}. Pladsen står stadig klar til dig.» + «Betal fakturaen»", () => {
  it("sendt med link: teksten ordret, knappen med Stripes link", () => {
    const d = afgoerEfterFristen({ frist: FRIST, faktura_sendt_den: SENDT, faktura_url: LINK });
    expect(d).toEqual({
      tilstand: "faktura_sendt",
      titel: "Fristen er passeret",
      tekst: "Vi har sendt fakturaen på mail den 23. oktober 2026. Pladsen står stadig klar til dig.",
      knap: { label: "Betal fakturaen", href: LINK },
    });
  });
  it("sendt uden link: datoen står, knappen er null", () => {
    const d = afgoerEfterFristen({ frist: FRIST, faktura_sendt_den: SENDT, faktura_url: null });
    expect(d.tilstand).toBe("faktura_sendt");
    expect(d.tekst).toBe("Vi har sendt fakturaen på mail den 23. oktober 2026. Pladsen står stadig klar til dig.");
    expect(d.knap).toBeNull();
  });
  it("kun https:// bliver en knap — http, javascript, tom, mellemrum og vrøvl giver null", () => {
    for (const url of ["http://invoice.stripe.com/i/x", "javascript:alert(1)", "", " ", `${LINK} `, "invoice.stripe.com/i/x", "ftp://x"]) {
      expect(afgoerEfterFristen({ frist: FRIST, faktura_sendt_den: SENDT, faktura_url: url }).knap, url).toBeNull();
      expect(erSikkertFakturalink(url), url).toBe(false);
    }
    expect(erSikkertFakturalink(LINK)).toBe(true);
  });
  it("sendt-datoen der ikke kan læses gives uændret (som formaterFrist) — siden crasher ikke", () => {
    const d = afgoerEfterFristen({ frist: FRIST, faktura_sendt_den: "snart", faktura_url: null });
    expect(d.tekst).toBe("Vi har sendt fakturaen på mail den snart. Pladsen står stadig klar til dig.");
  });
});

describe("mailadressen står aldrig på siden — ingen streng fra dommen bærer «@»", () => {
  const tilstande = [
    { frist: FRIST, faktura_sendt_den: null, faktura_url: null },
    { frist: null, faktura_sendt_den: null, faktura_url: null },
    { frist: FRIST, faktura_sendt_den: SENDT, faktura_url: null },
    { frist: FRIST, faktura_sendt_den: SENDT, faktura_url: LINK },
  ];
  it.each(tilstande)("%j", (input) => {
    const d = afgoerEfterFristen(input);
    expect(d.titel).not.toContain("@");
    expect(d.tekst).not.toContain("@");
    expect(d.knap?.label ?? "").not.toContain("@");
  });
  it("konstanterne er ordret", () => {
    expect(EFTER_FRISTEN_TITEL).toBe("Fristen er passeret");
    expect(BETAL_FAKTURAEN).toBe("Betal fakturaen");
  });
});
