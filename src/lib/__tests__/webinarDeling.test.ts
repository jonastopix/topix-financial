import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  afvisningAf, delingsOversigt, delingsTilstand, delingsUrl, erDageGyldige, erTokenForm, erVindueValg, forlaengetUdloeb,
  MAKS_DAGE, rensNavn, SPOR_HAENDELSER, STANDARD_DAGE, tilBase64Url, TOKEN_BYTES, TOKEN_FORM, udloebEfter,
} from "@/lib/webinar/deling";
import { udenRaekker, webinarDashboard } from "@/lib/webinar/dashboard";
import { bygDeltSvar, findForbudteNoegler, findMailVaerdier, FORBUDTE_NOEGLER, MAIL_MOENSTER } from "../../../supabase/functions/_shared/webinarDelingSvar.ts";
import { FIXTURE } from "./webinarDashboard.paritet.test";

/**
 * /webinar delt med en ekstern (udkast 21/9-2026) — de rene regler: tokenets
 * form og kodning, dommen aktiv/udløbet/lukket, udløb og forlængelse, sporet,
 * listen — og PRØVEN PÅ DET FAKTISKE SVAR-OBJEKT: intet af tilmeldingens
 * personfelter, hverken som nøgle eller som værdi.
 */

const NU = new Date("2026-09-21T12:00:00Z");

describe("webinarDeling — tokenet", () => {
  it("32 bytes bliver 43 base64url-tegn uden udfyldning, og formen genkender dem", () => {
    const bytes = new Uint8Array(TOKEN_BYTES).map((_, i) => (i * 37 + 11) % 256);
    const t = tilBase64Url(bytes);
    expect(t).toHaveLength(43);
    expect(TOKEN_FORM.test(t)).toBe(true);
    expect(erTokenForm(t)).toBe(true);
    // Kendt vektor: "Man" → "TWFu"; [255,255,254] → "___-" (base64url, ikke base64).
    expect(tilBase64Url(new TextEncoder().encode("Man"))).toBe("TWFu");
    expect(tilBase64Url(new Uint8Array([255, 255, 254]))).toBe("___-");
    expect(tilBase64Url(new Uint8Array([255]))).toBe("_w");
  });
  it("forkert form afvises: for kort, for lang, uuid, +/=, tom, ikke-streng", () => {
    for (const d of ["", "a", "x".repeat(42), "x".repeat(44), "3f6c2a10-1111-4111-8111-111111111111", "x".repeat(42) + "+", "x".repeat(42) + "=", null, 42, undefined]) {
      expect(erTokenForm(d)).toBe(false);
    }
  });
  it("linket", () => {
    expect(delingsUrl("https://app.theboardroom.dk", "abc")).toBe("https://app.theboardroom.dk/delt/webinar?t=abc");
  });
});

describe("webinarDeling — dommen", () => {
  const r = { id: "d1", navn: "Konsulenten", oprettet_at: "2026-09-21T10:00:00Z", udloeber_at: "2026-12-20T10:00:00Z", lukket_at: null };
  it("aktiv før udløb; udløbet fra og med udloeber_at; lukket vinder", () => {
    expect(delingsTilstand(r, NU)).toBe("aktiv");
    expect(delingsTilstand(r, new Date("2026-12-20T10:00:00Z"))).toBe("udloebet");
    expect(delingsTilstand(r, new Date("2027-01-01T00:00:00Z"))).toBe("udloebet");
    expect(delingsTilstand({ ...r, lukket_at: "2026-09-21T11:00:00Z" }, NU)).toBe("lukket");
    expect(delingsTilstand({ ...r, lukket_at: "2026-09-21T11:00:00Z" }, new Date("2027-01-01T00:00:00Z"))).toBe("lukket");
    expect(delingsTilstand({ ...r, udloeber_at: "ikke en dato" }, NU)).toBe("udloebet");
  });
  it("standard 90 dage, højst 365, kun hele dage", () => {
    expect(STANDARD_DAGE).toBe(90);
    expect(MAKS_DAGE).toBe(365);
    for (const d of [1, 90, 365]) expect(erDageGyldige(d)).toBe(true);
    for (const d of [0, -1, 366, 1.5, "90", null, NaN]) expect(erDageGyldige(d)).toBe(false);
    expect(udloebEfter(NU, 90)).toBe("2026-12-20T12:00:00.000Z");
  });
  it("forlængelsen regnes fra det seneste af nu og det gamle udløb", () => {
    expect(forlaengetUdloeb("2026-12-20T10:00:00Z", 30, NU)).toBe("2027-01-19T10:00:00.000Z"); // fra det gamle udløb
    expect(forlaengetUdloeb("2026-09-01T10:00:00Z", 30, NU)).toBe("2026-10-21T12:00:00.000Z"); // udløbet → fra nu
    expect(forlaengetUdloeb("ugyldig", 30, NU)).toBe("2026-10-21T12:00:00.000Z");
  });
  it("afvisningen står i sporet med sin grund — kun for en KENDT deling; «afvist_ukendt» findes ikke", () => {
    expect(afvisningAf("udloebet")).toBe("afvist_udloebet");
    expect(afvisningAf("lukket")).toBe("afvist_lukket");
    expect([...SPOR_HAENDELSER]).toEqual(["oprettet", "forlaenget", "lukket", "vist", "afvist_udloebet", "afvist_lukket"]);
    expect((SPOR_HAENDELSER as readonly string[]).includes("afvist_ukendt")).toBe(false);
  });
  it("navn og periodevalg", () => {
    expect(rensNavn("  Marketing   konsulenten ")).toBe("Marketing konsulenten");
    expect(rensNavn("")).toBeNull();
    expect(rensNavn("x".repeat(81))).toBeNull();
    expect(rensNavn(12)).toBeNull();
    expect(erVindueValg("7dage")).toBe(true);
    expect(erVindueValg("alt")).toBe(false);
  });
});

describe("webinarDeling — listen udledes af sporet", () => {
  it("visninger tælles (kun «vist»), sidst set er den seneste, nyeste deling først", () => {
    const d = [
      { id: "a", navn: "A", oprettet_at: "2026-09-20T10:00:00Z", udloeber_at: "2026-12-19T10:00:00Z", lukket_at: null },
      { id: "b", navn: "B", oprettet_at: "2026-09-21T10:00:00Z", udloeber_at: "2026-09-21T11:00:00Z", lukket_at: null },
    ];
    const spor = [
      { deling_id: "a", tidspunkt: "2026-09-20T12:00:00Z", haendelse: "vist" },
      { deling_id: "a", tidspunkt: "2026-09-21T09:00:00Z", haendelse: "vist" },
      { deling_id: "a", tidspunkt: "2026-09-21T09:30:00Z", haendelse: "afvist_udloebet" },
      { deling_id: "a", tidspunkt: "2026-09-20T10:00:00Z", haendelse: "oprettet" },
      { deling_id: "b", tidspunkt: "2026-09-21T11:30:00Z", haendelse: "afvist_udloebet" },
    ];
    const l = delingsOversigt(d, spor, NU);
    expect(l.map((x) => x.id)).toEqual(["b", "a"]);
    expect(l[1]).toMatchObject({ tilstand: "aktiv", visninger: 2, sidst_set: "2026-09-21T09:00:00Z" });
    expect(l[0]).toMatchObject({ tilstand: "udloebet", visninger: 0, sidst_set: null });
  });
});

describe("webinarDeling — svaret til den eksterne bærer ingen persondata", () => {
  const ind = { ...FIXTURE, sporKolonnerFindes: true, tilstand: "har" as const, hentning: { sidste_koersel: "2026-09-21T03:33:00Z", sidste_udfald: "ok", sidste_fejl: null, hentet_til: "2026-09-20" }, valg: "daekning" as const };
  const NU_FIX = new Date("2026-09-19T08:00:00.000Z");
  const svar = bygDeltSvar(ind, NU_FIX);
  const json = JSON.stringify(svar);

  it("ingen forbudt nøgle i det faktiske svar-objekt", () => {
    expect(findForbudteNoegler(svar)).toEqual([]);
    expect(FORBUDTE_NOEGLER).toContain("email");
    expect(FORBUDTE_NOEGLER).toContain("raekker");
  });
  it("ingen af fixturens mails, navne, byer, enheder, fbclid, origin/referrer findes som værdi", () => {
    for (const r of FIXTURE.tilmeldinger) {
      for (const v of [r.email, r.navn, r.by, r.land, r.enhed, r.fbclid, r.origin, r.referrer, r.widget_source, r.tidszone, r.ewebinar_id]) {
        if (typeof v === "string" && v !== "") expect(json.includes(v), v).toBe(false);
      }
    }
    expect(json).not.toMatch(/@/);
  });
  it("BEDØMMELSEN går ud som TAL — eWebinars fritekst gør ikke", () => {
    // Fixturen bærer to interactionsSummary-tekster (Erik 5, Frida 4). Svaret skal
    // bære dommen — 4,5 på sessionen 15/9 — og ALDRIG teksten selv: den er eWebinars
    // rå payload om personen, og den delte side er en ekstern.
    expect(json).not.toContain("Interactions");
    expect(json).not.toContain("Del din feedback");
    expect(json).not.toContain("calltoaction");
    expect(json).not.toContain("interactions");
    const s15 = svar.dashboard.afholdte.find((a) => a.dato === "15/9");
    expect(s15?.bedoemmelse?.stemmer).toBe(2);
    expect(s15?.bedoemmelse?.gennemsnitTekst).toBe("4,5");
    expect(s15?.bedoemmelse?.fordeling.map((t) => t.antal)).toEqual([0, 0, 0, 1, 1]);
  });
  it("men tallene, annonce-/kampagnenavnene og webinartitlen ER der — som på /webinar", () => {
    // 6 personer siden 22/9: de fire oprindelige + Erik og Frida, som bærer bedømmelsen.
    expect(svar.dashboard.personer).toBe(6);
    expect(svar.dashboard.naeste?.personer).toBe(2);
    expect(svar.dashboard.naeste?.titel).toBe("Sådan får du styr på tallene");
    expect(json).toContain("Annonce A");
    expect(json).toContain("Webinar sep");
    expect(svar.priser.samlet.forbrugOere).toBe(400000);
    expect(svar.valg).toBe("daekning");
  });
  it("MÅLSTREGERNE (1/10-2026) går ud som TAL — feltet `maalstreger` er beviset for udrulningen", () => {
    expect(svar.maalstreger.kilde).toBe("Nicklas, 1/10");
    expect(svar.maalstreger.linjer.map((l) => l.noegle)).toEqual(["fremmoede", "ansoegere_blandt_set", "pris_pr_ansoegning", "pris_pr_medlem"]);
    // Fixturen: 4 afholdte personer (15/9) — under 5, så «for få» ERSTATTER procenten.
    expect(svar.maalstreger.linjer[0]).toMatchObject({ vaerdi: "for_faa", naevner: 4 });
    expect(findForbudteNoegler(svar.maalstreger)).toEqual([]);
    expect(JSON.stringify(svar.maalstreger)).not.toMatch(/@/);
    // Samme vindue uanset periodevælgeren: «Hele perioden».
    const syv = bygDeltSvar({ ...ind, valg: "7dage" }, NU_FIX);
    expect(syv.maalstreger).toEqual(svar.maalstreger);
  });
  it("udenRaekker fjerner PRÆCIS naeste.raekker — og intet andet", () => {
    const fuld = webinarDashboard({ tilmeldinger: FIXTURE.tilmeldinger, ansoegninger: FIXTURE.ansoegninger, sporKolonnerFindes: true }, NU_FIX);
    expect(fuld.naeste?.raekker.length).toBe(2);
    const uden = udenRaekker(fuld);
    expect("raekker" in (uden.naeste ?? {})).toBe(false);
    const { raekker: _r, ...naesteUden } = fuld.naeste!;
    expect(uden).toEqual({ ...fuld, naeste: naesteUden });
    expect(udenRaekker({ ...fuld, naeste: null }).naeste).toBeNull();
  });
  it("VÆRNET VIRKER: en rå række et sted i svaret fanges med sin sti", () => {
    expect(findForbudteNoegler({ ...svar, x: { liste: [{ email: "a@b.dk" }] } })).toEqual(["x.liste[0].email"]);
    expect(findForbudteNoegler({ ...svar, dashboard: { ...svar.dashboard, naeste: { ...svar.dashboard.naeste, raekker: [] } } })).toEqual(["dashboard.naeste.raekker"]);
    expect(findForbudteNoegler({ a: { fbclid: null } })).toEqual(["a.fbclid"]);
    expect(findForbudteNoegler(null)).toEqual([]);
  });
  it("VÆRN NR. 2 (B5): det rigtige svar har INGEN mail som værdi — hverken med eller uden forbrug", () => {
    expect(findMailVaerdier(svar)).toEqual([]);
    expect(findMailVaerdier(bygDeltSvar({ ...ind, dage: [], tilstand: "tom" as const, hentning: null }, NU_FIX))).toEqual([]);
  });
  it("VÆRN NR. 2 VIRKER: en mail som værdi under et uskyldigt navn fanges med sin sti — aldrig værdien", () => {
    const fund = findMailVaerdier({ ...svar, dashboard: { ...svar.dashboard, titel: "kontakt anna@firma.dk" } });
    expect(fund).toEqual(["dashboard.titel"]);
    expect(fund.join(" ")).not.toMatch(/@/);
    expect(findMailVaerdier({ a: [{ b: ["x", "bo@x.dk"] }] })).toEqual(["a[0].b[1]"]);
    expect(findMailVaerdier("c@d.dk")).toEqual(["(rod)"]);
    expect(findMailVaerdier({ a: "ikke en mail @ her", b: "a@b", c: 42, d: null })).toEqual([]);
    expect(MAIL_MOENSTER.source).toBe("[^\\s@]+@[^\\s@]+\\.[^\\s@]+");
  });
  it("webinar-delt bruger BEGGE værn før svaret sendes", () => {
    const kode = readFileSync(resolve(process.cwd(), "supabase/functions/webinar-delt/index.ts"), "utf8");
    const i = kode.indexOf("findMailVaerdier(svar)");
    expect(kode.indexOf("findForbudteNoegler(svar)")).toBeGreaterThan(0);
    expect(i).toBeGreaterThan(kode.indexOf("findForbudteNoegler(svar)"));
    expect(i).toBeLessThan(kode.indexOf("return json({ ok: true"));
  });
});
