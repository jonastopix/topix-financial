import { describe, expect, it } from "vitest";
import {
  ANMODNINGER_PR_IP_PR_TIME,
  ANMODNINGER_PR_TIME_I_ALT,
  doemAnmodning,
  erAaben,
  forSnartIgen,
  harDeltaget,
  INDSEND_PAUSE_MIN,
  indsendVej,
  KLOKKE_BODY,
  klokkeTitel,
  loftetNaaet,
  normaliserTelefon,
  OPBEVARING_DAGE,
  SAMTYKKE_ORDLYD,
  slettesAt,
  sorterAnmodninger,
  TOKEN_GYLDIG_DAGE,
  tokenUdloebet,
  visTelefon,
} from "@/lib/opkald/dom";
import { afgoerRingKnap, RING_TEKST, tolkRingFejl } from "@/lib/opkald/side";
import { raadgiverSti } from "@/lib/hjemmebane/klokke";
import { byggRingToken, laesRingToken, ringOpUrlHvisSecret, ringUrl } from "../../../supabase/functions/_shared/ringToken.ts";
import { byggFremmoede } from "../../../supabase/functions/_shared/webinarHaendelser.ts";
import { byggHaendelse, HAENDELSE } from "../../../supabase/functions/_shared/klaviyoHaendelser.ts";

/** «Må vi ringe til dig?» (2/10-2026) — den rene dom, tokenet og fladens ord. */

describe("opkaldDom — nummeret", () => {
  it("danske numre i de former, folk skriver dem → E.164", () => {
    for (const n of ["20123456", "20 12 34 56", "+45 20 12 34 56", "+4520123456", "0045 20123456", "45 20 12 34 56", "20-12-34-56", "(+45) 20.12.34.56"]) {
      expect(normaliserTelefon(n)).toBe("+4520123456");
    }
  });
  it("alt andet er null — aldrig et rået tal", () => {
    // 0 og 1 som første ciffer er ikke et dansk abonnentnummer; 45 20123456 (10 cifre) accepteres, 4520123456 med ekstra er ikke.
    for (const n of ["", " ", "2012345", "201234567", "02345678", "12345678", "20123456a", "+46 70 123 45 67", "0020123456", null, undefined, 20123456, {}]) {
      expect(normaliserTelefon(n)).toBeNull();
    }
  });
  it("visTelefon skriver «12 34 56 78»", () => {
    expect(visTelefon("+4520123456")).toBe("20 12 34 56");
    expect(visTelefon(null)).toBe("");
  });
});

describe("opkaldDom — anmodningen", () => {
  const ok = { navn: "  Mette   Hansen ", telefon: "20 12 34 56", samtykke: { kryds: true, ordlyd: SAMTYKKE_ORDLYD } };
  it("en rigtig anmodning: navnet trimmet, nummeret E.164, ordlyden ordret", () => {
    expect(doemAnmodning(ok)).toEqual({ ok: true, navn: "Mette Hansen", telefon: "+4520123456", ordlyd: SAMTYKKE_ORDLYD });
  });
  it("krydset skal være boolean true — «true» som streng, 1 eller et tomt kryds afvises", () => {
    for (const kryds of [false, "true", 1, null, undefined]) {
      expect(doemAnmodning({ ...ok, samtykke: { kryds, ordlyd: SAMTYKKE_ORDLYD } })).toEqual({ ok: false, grund: "samtykke" });
    }
    expect(doemAnmodning({ ...ok, samtykke: true })).toEqual({ ok: false, grund: "samtykke" });
  });
  it("ordlyden skal være tegn for tegn den kendte — ellers ved vi ikke, hvad de sagde ja til", () => {
    expect(doemAnmodning({ ...ok, samtykke: { kryds: true, ordlyd: SAMTYKKE_ORDLYD + " " } })).toEqual({ ok: false, grund: "ordlyd" });
    expect(doemAnmodning({ ...ok, samtykke: { kryds: true, ordlyd: SAMTYKKE_ORDLYD.toLowerCase() } })).toEqual({ ok: false, grund: "ordlyd" });
    expect(doemAnmodning({ ...ok, samtykke: { kryds: true } })).toEqual({ ok: false, grund: "ordlyd" });
  });
  it("navn og nummer", () => {
    expect(doemAnmodning({ ...ok, navn: "" })).toEqual({ ok: false, grund: "navn" });
    expect(doemAnmodning({ ...ok, navn: "x".repeat(81) })).toEqual({ ok: false, grund: "navn" });
    expect(doemAnmodning({ ...ok, telefon: "1234" })).toEqual({ ok: false, grund: "telefon" });
  });
  it("ordlyden er Jonas' sætning og nævner begge rådgivere og The Boardroom", () => {
    expect(SAMTYKKE_ORDLYD).toBe("Ja, Morten eller Jonas må ringe til mig om The Boardroom");
  });
});

describe("opkaldDom — kun deltagere, loftet, 90 dage", () => {
  it("set og delvist har deltaget; mødte ikke op, tilmeldt og ukendt har ikke", () => {
    expect(harDeltaget("set")).toBe(true);
    expect(harDeltaget("delvist")).toBe(true);
    for (const g of ["moedte_ikke", "tilmeldt", "ukendt", null, undefined, ""]) expect(harDeltaget(g)).toBe(false);
  });
  it("loftet: nået ved tallet, og ALTID nået når tællingen fejlede", () => {
    expect(loftetNaaet(0, 0)).toBe(false);
    expect(loftetNaaet(ANMODNINGER_PR_IP_PR_TIME - 1, ANMODNINGER_PR_TIME_I_ALT - 1)).toBe(false);
    expect(loftetNaaet(ANMODNINGER_PR_IP_PR_TIME, 0)).toBe(true);
    expect(loftetNaaet(0, ANMODNINGER_PR_TIME_I_ALT)).toBe(true);
    expect(loftetNaaet(null, 0)).toBe(true);
    expect(loftetNaaet(0, null)).toBe(true);
  });
  it("rækken slettes 90 dage efter samtykket", () => {
    expect(OPBEVARING_DAGE).toBe(90);
    expect(slettesAt("2026-10-02T08:00:00.000Z")).toBe("2026-12-31T08:00:00.000Z");
  });
});

describe("opkaldDom — klokken og listen", () => {
  it("titlen bærer navn og dato — aldrig nummeret", () => {
    expect(klokkeTitel("Mette Hansen", "2026-09-22T07:00:00.000Z")).toBe("Mette Hansen bad om et opkald — så webinaret 22/9");
    expect(klokkeTitel("Mette Hansen", null)).toBe("Mette Hansen bad om et opkald");
    expect(klokkeTitel("Mette Hansen", "ikke en tid")).toBe("Mette Hansen bad om et opkald");
    expect(KLOKKE_BODY).not.toMatch(/\d{8}|\+45/);
  });
  it("klokken fører til /opkald", () => {
    expect(raadgiverSti({ type: "opkald_anmodet", reference_type: "opkald", reference_id: "x", company_id: null })).toBe("/opkald");
  });
  it("åbne først, nyeste øverst", () => {
    const r = (id: string, oprettet: string, ringet: string | null) => ({ id, oprettet_at: oprettet, ringet_at: ringet });
    const liste = [r("a", "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z"), r("b", "2026-10-02T00:00:00Z", null), r("c", "2026-10-03T00:00:00Z", null)];
    expect(sorterAnmodninger(liste).map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(erAaben({ ringet_at: null })).toBe(true);
    expect(erAaben({ ringet_at: "2026-10-02T00:00:00Z" })).toBe(false);
  });
});

describe("ringToken — HMAC over tilmeldingens id, konstant tid", () => {
  const SECRET = "proeve-secret";
  it("rundtur: byg → læs giver samme id", async () => {
    const t = await byggRingToken(SECRET, " reg_123 ");
    expect(t).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(await laesRingToken(SECRET, t)).toEqual({ ok: true, ewebinarId: "reg_123" });
  });
  it("forkert secret, ændret id, forkert form, ingen secret → afvist med grund, aldrig kast", async () => {
    const t = await byggRingToken(SECRET, "reg_123");
    expect(await laesRingToken("anden", t)).toEqual({ ok: false, grund: "aftryk" });
    const [, aftryk] = t.split(".");
    const andetId = (await byggRingToken(SECRET, "reg_124")).split(".")[0];
    expect(await laesRingToken(SECRET, `${andetId}.${aftryk}`)).toEqual({ ok: false, grund: "aftryk" });
    expect(await laesRingToken(SECRET, "ikke-et-token")).toEqual({ ok: false, grund: "form" });
    expect(await laesRingToken(SECRET, null)).toEqual({ ok: false, grund: "form" });
    expect(await laesRingToken("", t)).toEqual({ ok: false, grund: "ingen_secret" });
  });
  it("linket peger på /ring-mig-op?t=…, og uden secret udstedes intet", async () => {
    expect(ringUrl("https://app.theboardroom.dk/", "a.b")).toBe("https://app.theboardroom.dk/ring-mig-op?t=a.b");
    expect(await ringOpUrlHvisSecret(undefined, "https://app.theboardroom.dk", "reg_1")).toBeNull();
    expect(await ringOpUrlHvisSecret(SECRET, "https://app.theboardroom.dk", "")).toBeNull();
    const url = await ringOpUrlHvisSecret(SECRET, "https://app.theboardroom.dk", "reg_1");
    expect(url).toMatch(/^https:\/\/app\.theboardroom\.dk\/ring-mig-op\?t=/);
  });
});

describe("«Deltog i webinar» bærer ring_op_url — på hændelsen OG på profilen; «Moedte ikke op» aldrig", () => {
  const input = (grad: "set" | "delvist" | "moedte_ikke") => ({
    ewebinarId: "reg_1", email: "a@b.dk", grad, setProcent: 80, webinarId: "w", webinarTitel: null, sessionTid: "2026-09-22T07:00:00.000Z", tid: new Date("2026-09-22T09:00:00.000Z"), ringOpUrl: "https://app.theboardroom.dk/ring-mig-op?t=a.b",
  });
  it("deltog: egenskaben er med i kroppen", () => {
    const h = byggFremmoede("deltog", input("set"))!;
    expect(h.egenskaber!.ring_op_url).toBe("https://app.theboardroom.dk/ring-mig-op?t=a.b");
    const krop = byggHaendelse(h) as Record<string, any>;
    expect(krop.data.attributes.properties.ring_op_url).toBe("https://app.theboardroom.dk/ring-mig-op?t=a.b");
    // Profilegenskaben (Jonas 08:17): i SAMME kald, på profile.data.attributes.properties.
    expect(krop.data.attributes.profile.data.attributes).toEqual({
      email: "a@b.dk",
      properties: { ring_op_url: "https://app.theboardroom.dk/ring-mig-op?t=a.b" },
    });
  });
  it("delvist set er også en deltager: profilen får linket", () => {
    const krop = byggHaendelse(byggFremmoede("deltog", input("delvist"))!) as Record<string, any>;
    expect(krop.data.attributes.profile.data.attributes.properties.ring_op_url).toMatch(/\/ring-mig-op\?t=/);
  });
  it("mødte ikke op: egenskaben er null og udelades — uanset hvad kalderen gav — og profilen røres ikke", () => {
    const h = byggFremmoede("moedte_ikke", input("moedte_ikke"))!;
    expect(h.egenskaber!.ring_op_url).toBeNull();
    const krop = byggHaendelse(h) as Record<string, any>;
    expect("ring_op_url" in krop.data.attributes.properties).toBe(false);
    expect(krop.data.attributes.profile.data.attributes).toEqual({ email: "a@b.dk" });
  });
  it("uden token (ingen secret): deltog går uændret, uden egenskaben og uden profilegenskaber", () => {
    const h = byggFremmoede("deltog", { ...input("set"), ringOpUrl: null })!;
    const krop = byggHaendelse(h) as Record<string, any>;
    expect("ring_op_url" in krop.data.attributes.properties).toBe(false);
    expect(krop.data.attributes.profile.data.attributes).toEqual({ email: "a@b.dk" });
  });
  it("en hændelse uden profilEgenskaber er byte-ens med før (intet tomt properties på profilen)", () => {
    const krop = byggHaendelse({ metric: HAENDELSE.badOmOpkald, email: "A@B.dk", uniktId: "x", egenskaber: { a: 1 }, tid: new Date("2026-10-02T06:00:00.000Z") });
    expect(krop).toEqual({
      data: {
        type: "event",
        attributes: {
          properties: { a: 1 },
          time: "2026-10-02T06:00:00.000Z",
          unique_id: "x",
          metric: { data: { type: "metric", attributes: { name: "Bad om opkald" } } },
          profile: { data: { type: "profile", attributes: { email: "a@b.dk" } } },
        },
      },
    });
  });
  it("«Bad om opkald» er en metric uden tal i navnet", () => {
    expect(HAENDELSE.badOmOpkald).toBe("Bad om opkald");
  });
});

describe("fladen — knappen og ordene", () => {
  it("knappen er inaktiv, til navn, nummer og kryds er på plads", () => {
    expect(afgoerRingKnap({ navn: "", telefonOk: true, kryds: true, arbejder: false })).toEqual({ ok: false, grund: "navn" });
    expect(afgoerRingKnap({ navn: "M", telefonOk: false, kryds: true, arbejder: false })).toEqual({ ok: false, grund: "telefon" });
    expect(afgoerRingKnap({ navn: "M", telefonOk: true, kryds: false, arbejder: false })).toEqual({ ok: false, grund: "kryds" });
    expect(afgoerRingKnap({ navn: "M", telefonOk: true, kryds: true, arbejder: true })).toEqual({ ok: false, grund: "arbejder" });
    expect(afgoerRingKnap({ navn: "M", telefonOk: true, kryds: true, arbejder: false })).toEqual({ ok: true, grund: null });
  });
  it("ordene lover «et par dage», ingen mail, ingen optagelse, og 90 dage står i forklaringen", () => {
    expect(RING_TEKST.takTekst).toContain("et par dage");
    expect(RING_TEKST.takTekst).toContain("ikke en mail");
    expect(RING_TEKST.samtykkeForklaring(OPBEVARING_DAGE)).toContain("90 dage");
    for (const v of Object.values(RING_TEKST)) expect(typeof v === "function" ? v(90) : v).not.toMatch(/optagelse/i);
  });
  it("functionens fejl bliver til én sætning", () => {
    expect(tolkRingFejl(400, { grund: "telefon" })).toMatch(/8 cifre/);
    expect(tolkRingFejl(403, null)).toBe(RING_TEKST.ukendtTekst);
    expect(tolkRingFejl(429, null)).toMatch(/om en time/);
    expect(tolkRingFejl(null, null)).toMatch(/Noget gik galt/);
    expect(tolkRingFejl(409, { grund: "allerede_anmodet" })).toBe(RING_TEKST.harAnmodet);
    expect(tolkRingFejl(429, { grund: "for_snart" })).toMatch(/10 minutter/);
    expect(RING_TEKST.ukendtTekst).toMatch(/udløbet/);
  });
});

describe("rådets fund 2/10 — linkets levetid (punkt 2)", () => {
  it("30 dage efter sessionens start: præcis grænsen er gyldig, ét ms efter ikke", () => {
    expect(TOKEN_GYLDIG_DAGE).toBe(30);
    const session = "2026-09-22T09:00:00.000Z";
    // 22/9 09:00Z + 30 × 86 400 000 ms = 22/10 09:00Z.
    expect(tokenUdloebet(session, new Date("2026-10-22T09:00:00.000Z"))).toBe(false);
    expect(tokenUdloebet(session, new Date("2026-10-22T09:00:00.001Z"))).toBe(true);
    expect(tokenUdloebet(session, new Date("2026-09-22T10:00:00.000Z"))).toBe(false);
  });
  it("ukendt eller ulæselig sessionstid er udløbet (fail-closed)", () => {
    expect(tokenUdloebet(null, new Date())).toBe(true);
    expect(tokenUdloebet(undefined, new Date())).toBe(true);
    expect(tokenUdloebet("ikke en dato", new Date())).toBe(true);
  });
});

describe("rådets fund 2/10 — gentaget indsend og den åbne anmodning (punkt 1 og 3)", () => {
  const nu = new Date("2026-10-02T10:00:00.000Z");
  it("10 minutter: 599 999 ms er for snart, 600 000 ms er ikke", () => {
    expect(INDSEND_PAUSE_MIN).toBe(10);
    expect(forSnartIgen("2026-10-02T09:50:00.001Z", nu)).toBe(true);
    expect(forSnartIgen("2026-10-02T09:50:00.000Z", nu)).toBe(false);
    expect(forSnartIgen(null, nu)).toBe(false);
    expect(forSnartIgen("vrøvl", nu)).toBe(true);
  });
  it("indsendVej: ny · for_snart (FØR alt andet) · aaben (overskrives aldrig) · genaabn (kun lukket)", () => {
    expect(indsendVej(null, nu)).toBe("ny");
    expect(indsendVej({ ringet_at: null, sidst_indsendt_at: "2026-10-02T09:55:00.000Z" }, nu)).toBe("for_snart");
    expect(indsendVej({ ringet_at: "2026-10-01T12:00:00.000Z", sidst_indsendt_at: "2026-10-02T09:55:00.000Z" }, nu)).toBe("for_snart");
    expect(indsendVej({ ringet_at: null, sidst_indsendt_at: "2026-10-01T09:00:00.000Z" }, nu)).toBe("aaben");
    expect(indsendVej({ ringet_at: "2026-10-01T12:00:00.000Z", sidst_indsendt_at: "2026-10-01T09:00:00.000Z" }, nu)).toBe("genaabn");
  });
});
