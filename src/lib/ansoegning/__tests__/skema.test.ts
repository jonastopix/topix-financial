import { describe, expect, it } from "vitest";
import {
  afgoerFremdrift,
  afgoerKilde,
  ansatteTekst,
  cvrSaetning,
  FELTER,
  FEJL,
  HJEMMESIDE_INGEN,
  normaliserHjemmeside,
  normaliserTelefon,
  OMSAETNINGSINTERVALLER,
  SKAERME,
  stiftetAarAf,
  TEKST_MIN,
  TOMME_SVAR,
  validerAlle,
  validerDel,
  validerFelt,
  type AnsoegningsSvar,
} from "@/lib/ansoegning/skema";

// De rene domme bag /ansoeg: validering pr. felt, fremdrift, kilde og
// CVR-sætningen. Samme kode kører i ansoegning-gem (paritetstesten).

const LANG = "Vi har travlt hele tiden, men der er aldrig penge tilbage når måneden er omme og lønnen er betalt.";

const FULDT: AnsoegningsSvar = {
  cvr: "12345678",
  hjemmeside: "https://nordicbyg.dk",
  omsaetningsinterval: "D",
  antal_ansatte: 14,
  navn: "Anders Andersen",
  email: "anders@nordicbyg.dk",
  telefon: "+4512345678",
  udfordring: LANG,
  proevet: LANG,
  om_tolv_maaneder: LANG,
  start_tidspunkt: "hurtigst_muligt",
  set_webinar: "ja",
};

describe("skemaet — tolv felter, elleve skærme, syv intervaller", () => {
  it("alle felter står på præcis én skærm, i skemaets rækkefølge", () => {
    const paaSkaerme = SKAERME.flatMap((s) => s.felter);
    expect(paaSkaerme).toEqual([...FELTER]);
    expect(SKAERME).toHaveLength(11);
    expect(FELTER).toHaveLength(12);
  });

  it("de syv intervaller bærer Monday-boardets ordrette labels A–G", () => {
    expect(OMSAETNINGSINTERVALLER.map((o) => o.noegle)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(OMSAETNINGSINTERVALLER[0].monday).toBe("A) 0-499.999 kr.");
    expect(OMSAETNINGSINTERVALLER[6].monday).toBe("G) +20.000.000 kr.");
  });
});

describe("validerFelt — normaliseret værdi ved ok, dansk fejl ellers", () => {
  it("cvr: otte cifre, mellemrum og «DK» fjernes; alt andet afvises", () => {
    expect(validerFelt("cvr", " DK 12 34 56 78 ")).toEqual({ ok: true, vaerdi: "12345678" });
    expect(validerFelt("cvr", "1234567")).toEqual({ ok: false, fejl: FEJL.cvr });
    expect(validerFelt("cvr", "123456789")).toEqual({ ok: false, fejl: FEJL.cvr });
    expect(validerFelt("cvr", null)).toEqual({ ok: false, fejl: FEJL.cvr });
  });

  it("hjemmeside: normaliseres til https uden www; «» er svaret «vi har ingen»; null er ubesvaret", () => {
    expect(validerFelt("hjemmeside", "Nordicbyg.dk")).toEqual({ ok: true, vaerdi: "https://nordicbyg.dk" });
    expect(validerFelt("hjemmeside", "http://www.nordicbyg.dk/om/")).toEqual({ ok: true, vaerdi: "https://nordicbyg.dk/om" });
    expect(validerFelt("hjemmeside", HJEMMESIDE_INGEN)).toEqual({ ok: true, vaerdi: "" });
    expect(validerFelt("hjemmeside", null)).toEqual({ ok: false, fejl: FEJL.hjemmeside });
    expect(validerFelt("hjemmeside", "nordicbyg")).toEqual({ ok: false, fejl: FEJL.hjemmeside });
    expect(normaliserHjemmeside("javascript:alert(1)")).toBeNull();
  });

  it("omsætning, start og webinar: kun de kendte nøgler", () => {
    expect(validerFelt("omsaetningsinterval", "D")).toEqual({ ok: true, vaerdi: "D" });
    expect(validerFelt("omsaetningsinterval", "H")).toEqual({ ok: false, fejl: FEJL.omsaetningsinterval });
    expect(validerFelt("omsaetningsinterval", "D) 2.000.000-4.999.999 kr.")).toEqual({ ok: false, fejl: FEJL.omsaetningsinterval });
    expect(validerFelt("start_tidspunkt", "senere")).toEqual({ ok: true, vaerdi: "senere" });
    expect(validerFelt("start_tidspunkt", "i morgen")).toEqual({ ok: false, fejl: FEJL.start_tidspunkt });
    expect(validerFelt("set_webinar", "nej")).toEqual({ ok: true, vaerdi: "nej" });
    expect(validerFelt("set_webinar", true)).toEqual({ ok: false, fejl: FEJL.set_webinar });
  });

  it("ansatte: helt tal 0–999999, tusindpunktum tåles; tekst og negative afvises", () => {
    expect(validerFelt("antal_ansatte", "0")).toEqual({ ok: true, vaerdi: 0 });
    expect(validerFelt("antal_ansatte", 14)).toEqual({ ok: true, vaerdi: 14 });
    expect(validerFelt("antal_ansatte", "1.200")).toEqual({ ok: true, vaerdi: 1200 });
    expect(validerFelt("antal_ansatte", "-1")).toEqual({ ok: false, fejl: FEJL.antal_ansatte });
    expect(validerFelt("antal_ansatte", "ca. 10")).toEqual({ ok: false, fejl: FEJL.antal_ansatte });
    expect(validerFelt("antal_ansatte", "")).toEqual({ ok: false, fejl: FEJL.antal_ansatte });
  });

  it("navn: trimmet og med enkelte mellemrum, mindst to tegn", () => {
    expect(validerFelt("navn", "  Anders   Andersen ")).toEqual({ ok: true, vaerdi: "Anders Andersen" });
    expect(validerFelt("navn", "A")).toEqual({ ok: false, fejl: FEJL.navn });
  });

  it("email: små bogstaver; telefon: dansk ottecifret bliver +45, landekode tåles", () => {
    expect(validerFelt("email", " Anders@NordicByg.dk ")).toEqual({ ok: true, vaerdi: "anders@nordicbyg.dk" });
    expect(validerFelt("email", "anders@nordicbyg")).toEqual({ ok: false, fejl: FEJL.email });
    expect(validerFelt("telefon", "12 34 56 78")).toEqual({ ok: true, vaerdi: "+4512345678" });
    expect(validerFelt("telefon", "+45 12 34 56 78")).toEqual({ ok: true, vaerdi: "+4512345678" });
    expect(validerFelt("telefon", "0045 12345678")).toEqual({ ok: true, vaerdi: "+4512345678" });
    expect(validerFelt("telefon", "+46 70 123 45 67")).toEqual({ ok: true, vaerdi: "+46701234567" });
    expect(validerFelt("telefon", "1234567")).toEqual({ ok: false, fejl: FEJL.telefon });
    expect(normaliserTelefon("+45 1234")).toBeNull();
  });

  it(`de tre der filtrerer: mindst ${TEKST_MIN} tegn OG fem ord — «ikke for nemt»`, () => {
    expect(validerFelt("udfordring", LANG)).toEqual({ ok: true, vaerdi: LANG });
    expect(validerFelt("udfordring", "Likviditet.")).toEqual({ ok: false, fejl: FEJL.tekst_kort });
    expect(validerFelt("proevet", "a".repeat(60))).toEqual({ ok: false, fejl: FEJL.tekst_kort }); // 60 tegn, ét ord
    expect(validerFelt("om_tolv_maaneder", "x ".repeat(1100))).toEqual({ ok: false, fejl: FEJL.tekst_lang });
    expect(validerFelt("udfordring", "linje et\r\nlinje to og nogle flere ord så det bliver langt nok")).toEqual({
      ok: true,
      vaerdi: "linje et\nlinje to og nogle flere ord så det bliver langt nok",
    });
  });
});

describe("validerAlle og validerDel", () => {
  it("et fuldt svar er ok og normaliseret", () => {
    const r = validerAlle({ ...FULDT, email: "ANDERS@nordicbyg.dk", telefon: "12345678" });
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error("forventede ok");
    expect(r.svar.email).toBe("anders@nordicbyg.dk");
    expect(r.svar.telefon).toBe("+4512345678");
  });

  it("tomme svar giver én fejl pr. felt — tolv", () => {
    const r = validerAlle(TOMME_SVAR);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(Object.keys(r.fejl)).toHaveLength(12);
    else throw new Error("forventede fejl");
  });

  it("validerDel: kun kendte felter, null rydder, et ugyldigt felt afviser hele delen", () => {
    expect(validerDel({ navn: " Anders ", ukendt: "x" })).toEqual({ ok: true, svar: { navn: "Anders" } });
    expect(validerDel({ hjemmeside: null })).toEqual({ ok: true, svar: { hjemmeside: null } });
    expect(validerDel({ navn: "Anders", cvr: "12" })).toEqual({ ok: false, fejl: { cvr: FEJL.cvr } });
    expect(validerDel("tekst")).toEqual({ ok: false, fejl: {} });
    expect(validerDel([])).toEqual({ ok: false, fejl: {} });
  });
});

describe("afgoerFremdrift — dommen over de gemte svar, ikke skærmindekset", () => {
  it("tomt: 0 af 12, næste skærm 0", () => {
    expect(afgoerFremdrift(TOMME_SVAR)).toEqual({ besvarede: 0, ialt: 12, procent: 0, naesteSkaerm: 0, faerdig: false });
  });

  it("virksomheden færdig: 4 af 12, næste skærm er «navn» (indeks 4)", () => {
    const f = afgoerFremdrift({ ...TOMME_SVAR, cvr: "12345678", hjemmeside: "", omsaetningsinterval: "A", antal_ansatte: 0 });
    expect(f).toEqual({ besvarede: 4, ialt: 12, procent: 33, naesteSkaerm: 4, faerdig: false });
  });

  it("et hul midt i: næste skærm er hullet, selv om senere felter er svaret", () => {
    const f = afgoerFremdrift({ ...FULDT, email: null });
    expect(f.besvarede).toBe(11);
    expect(f.naesteSkaerm).toBe(5); // «kontakt» bærer email + telefon
    expect(f.faerdig).toBe(false);
  });

  it("fuldt: 12 af 12, næste skærm = antal skærme, færdig", () => {
    expect(afgoerFremdrift(FULDT)).toEqual({ besvarede: 12, ialt: 12, procent: 100, naesteSkaerm: SKAERME.length, faerdig: true });
  });
});

describe("afgoerKilde — parameter over utm over referrer", () => {
  it("?kilde= kendt → den; ukendt → andet med sporet", () => {
    expect(afgoerKilde({ kilde: "Webinar", utmSource: "linkedin", referrer: "https://l.facebook.com/" })).toEqual({ kilde: "webinar", raa: "webinar" });
    expect(afgoerKilde({ kilde: "nyhedsbrev", utmSource: null, referrer: null })).toEqual({ kilde: "andet", raa: "nyhedsbrev" });
  });

  it("utm_source: linkedin/webinar genkendes, resten er andet", () => {
    expect(afgoerKilde({ kilde: "", utmSource: "LinkedIn_post", referrer: null })).toEqual({ kilde: "linkedin", raa: "linkedin_post" });
    expect(afgoerKilde({ kilde: null, utmSource: "webinar-sept", referrer: null })).toEqual({ kilde: "webinar", raa: "webinar-sept" });
    expect(afgoerKilde({ kilde: null, utmSource: "google", referrer: null })).toEqual({ kilde: "andet", raa: "google" });
  });

  it("referrer: linkedin → linkedin, theboardroom.dk eller tom → direkte, andet værtsnavn → andet", () => {
    expect(afgoerKilde({ kilde: null, utmSource: null, referrer: "https://www.linkedin.com/feed/" })).toEqual({ kilde: "linkedin", raa: "www.linkedin.com" });
    expect(afgoerKilde({ kilde: null, utmSource: null, referrer: "https://lnkd.in/abc" })).toEqual({ kilde: "linkedin", raa: "lnkd.in" });
    expect(afgoerKilde({ kilde: null, utmSource: null, referrer: "https://theboardroom.dk/" })).toEqual({ kilde: "direkte", raa: "theboardroom.dk" });
    expect(afgoerKilde({ kilde: null, utmSource: null, referrer: "" })).toEqual({ kilde: "direkte", raa: null });
    expect(afgoerKilde({ kilde: null, utmSource: null, referrer: "https://www.google.com/" })).toEqual({ kilde: "andet", raa: "www.google.com" });
    expect(afgoerKilde({ kilde: null, utmSource: null, referrer: "ikke en url" })).toEqual({ kilde: "andet", raa: "ikke en url" });
  });

  it("sporet klippes til 120 tegn", () => {
    expect(afgoerKilde({ kilde: "x".repeat(300), utmSource: null, referrer: null }).raa).toHaveLength(120);
  });
});

describe("CVR-sætningen — det der vises tilbage", () => {
  it("«Nordic Byg ApS, stiftet 2019, 10–19 ansatte.»", () => {
    expect(cvrSaetning({ navn: "Nordic Byg ApS", stiftet_aar: 2019, antal_ansatte: "10-19", selskabsform: "Anpartsselskab", branche: null, status: "Aktiv", hjemmeside: null })).toBe(
      "Nordic Byg ApS, stiftet 2019, 10–19 ansatte.",
    );
  });

  it("uden år og ansatte: kun navnet", () => {
    expect(cvrSaetning({ navn: "Nordic Byg ApS", stiftet_aar: null, antal_ansatte: null, selskabsform: null, branche: null, status: null, hjemmeside: null })).toBe("Nordic Byg ApS.");
  });

  it("ansatteTekst: tal, interval, «+» og ukendt form", () => {
    expect(ansatteTekst("1")).toBe("1 ansat");
    expect(ansatteTekst("14")).toBe("14 ansatte");
    expect(ansatteTekst("10000+")).toBe("over 10.000 ansatte");
    expect(ansatteTekst("1000-1999")).toBe("1.000–1.999 ansatte");
    expect(ansatteTekst("mange")).toBe("mange ansatte");
    expect(ansatteTekst(null)).toBeNull();
  });

  it("stiftetAarAf splitter selv — aldrig new Date()", () => {
    expect(stiftetAarAf("2019-05-01")).toBe(2019);
    expect(stiftetAarAf("2019")).toBeNull();
    expect(stiftetAarAf(null)).toBeNull();
  });
});
