import { describe, expect, it } from "vitest";
import {
  VIRKSOMHEDSNAVN_MAKS,
  afgoerSletKnap,
  bilagTekst,
  datoOrd,
  tolkPrisFejl,
  tolkPrisSvar,
  validerVirksomhedsnavn,
} from "@/lib/virksomhedsStamdata";

// De tre stamdata-handlinger på virksomhedssiden (10/9): omdøb, prisniveau,
// slet. Dommene og ordene låses her; skrivevejene bor i hooks/useVirksomhed.

describe("validerVirksomhedsnavn", () => {
  it("trimmer og godtager et nyt navn", () => {
    expect(validerVirksomhedsnavn("  Bastant Design ApS ", "Bastant Design")).toEqual({ ok: true, navn: "Bastant Design ApS" });
  });
  it("afviser tomt, for langt og uændret", () => {
    expect(validerVirksomhedsnavn("   ", "X")).toEqual({ ok: false, fejl: "Skriv et navn." });
    expect(validerVirksomhedsnavn("a".repeat(VIRKSOMHEDSNAVN_MAKS + 1), "X")).toEqual({ ok: false, fejl: "Navnet må højst være 200 tegn." });
    expect(validerVirksomhedsnavn("a".repeat(VIRKSOMHEDSNAVN_MAKS), "X").ok).toBe(true);
    expect(validerVirksomhedsnavn(" Bastant Design ", "Bastant Design")).toEqual({ ok: false, fejl: "Det er allerede navnet." });
  });
});

describe("tolkPrisFejl — ordret som IndgangsSektion", () => {
  it("409/allerede sat → info og genhent", () => {
    expect(tolkPrisFejl(409, null)).toEqual({ tone: "info", tekst: "Prisen er allerede sat.", genhent: true });
    expect(tolkPrisFejl(null, { error: "prisniveau_allerede_sat" }).tone).toBe("info");
  });
  it("404/ingen betalingslink → fejl og genhent", () => {
    expect(tolkPrisFejl(404, null)).toEqual({ tone: "error", tekst: "Virksomheden er ikke i indgangen.", genhent: true });
  });
  it("400/ukendt prisniveau → fejl med teknisk detalje", () => {
    expect(tolkPrisFejl(400, { error: "ukendt_prisniveau", detalje: "5000000 er ikke et prispunkt" })).toEqual({
      tone: "error", tekst: "Prisniveauet blev afvist af serveren", beskrivelse: "5000000 er ikke et prispunkt", genhent: false,
    });
    expect(tolkPrisFejl(400, null).beskrivelse).toBe("ukendt fejl (status 400)");
  });
  it("403 → ingen adgang; alt andet → prøv igen", () => {
    expect(tolkPrisFejl(403, null).tekst).toBe("Du har ikke adgang til at sætte prisen.");
    expect(tolkPrisFejl(500, null)).toEqual({ tone: "error", tekst: "Prisen kunne ikke sættes lige nu. Prøv igen om lidt.", genhent: false });
  });
});

describe("tolkPrisSvar", () => {
  it("dag0 → succes; mail fejlede → advarsel; ok uden mail → info; ellers fejl", () => {
    expect(tolkPrisSvar({ ok: true, mail: "dag0" })).toEqual({ tone: "success", tekst: "Prisen er sat, og betalingsmailen er sendt.", genhent: true });
    expect(tolkPrisSvar({ ok: true, mail_fejlede: true }).tone).toBe("warning");
    expect(tolkPrisSvar({ ok: true })).toEqual({ tone: "info", tekst: "Prisen er sat. Mailen blev ikke sendt, fordi der ikke var noget at sende.", genhent: true });
    expect(tolkPrisSvar(null).tone).toBe("error");
    expect(tolkPrisSvar({ ok: false }).tone).toBe("error");
  });
});

describe("afgoerSletKnap — vej 1, som medlemmets eget «slet min data»", () => {
  const NU = new Date(Date.UTC(2026, 8, 10, 10)); // 10/9 kl. 10 UTC
  const basis = {
    contract_end_date: "2027-03-01",
    offboarding_requested_at: null,
    beslutning: null,
    status: "active",
    data_slettet_at: null,
    subscription_status: null,
    subscription_current_period_end: null,
  };
  it("ingen stempel: kan bede — teksten siger fristen og arkivsporet", () => {
    const d = afgoerSletKnap(basis, NU);
    expect(d.tilstand).toBe("kan_bede");
    expect(d.kanFortryde).toBe(false);
    expect(d.tekst).toContain("7 dages frist");
    expect(d.tekst).toContain("arkivspor");
  });
  it("bedt om i dag: anmodet, frist om 7 dage, kan fortrydes", () => {
    const d = afgoerSletKnap({ ...basis, offboarding_requested_at: "2026-09-10T08:00:00Z" }, NU);
    expect(d).toEqual({
      tilstand: "anmodet",
      tekst: "Der er bedt om sletning 10. september 2026. Medlemsdata slettes 17. september 2026; indtil da kan det fortrydes.",
      frist: "2026-09-17",
      kanFortryde: true,
    });
  });
  it("fristen udløbet: anmodet, kan IKKE fortrydes — slettefunktionen tager den", () => {
    const d = afgoerSletKnap({ ...basis, offboarding_requested_at: "2026-09-01T08:00:00Z" }, NU);
    expect(d.tilstand).toBe("anmodet");
    expect(d.kanFortryde).toBe(false);
    expect(d.tekst).toContain("Fristen udløb 8. september 2026");
  });
  it("aktiv kontrakt ændrer ikke vej 1 (en anmodning er en anmodning)", () => {
    const d = afgoerSletKnap({ ...basis, contract_end_date: "2027-09-01", offboarding_requested_at: "2026-09-10T08:00:00Z" }, NU);
    expect(d.tilstand).toBe("anmodet");
    expect(d.frist).toBe("2026-09-17");
  });
  it("allerede slettet: slettet, med dato og vej, ingen fortrydelse", () => {
    const d = afgoerSletKnap({ ...basis, data_slettet_at: "2026-09-08T10:05:00Z", data_slettet_vej: "anmodning" }, NU);
    expect(d).toEqual({ tilstand: "slettet", tekst: "Medlemsdata slettet 8. september 2026 (efter anmodning). Rækken står som arkivspor.", frist: null, kanFortryde: false });
    expect(afgoerSletKnap({ ...basis, data_slettet_at: "2026-09-08T10:05:00Z" }, NU).tekst).toBe("Medlemsdata slettet 8. september 2026. Rækken står som arkivspor.");
  });
});

describe("datoOrd og bilagTekst", () => {
  it("datoOrd læser både ISO og YYYY-MM-DD som UTC-kalenderdag", () => {
    expect(datoOrd("2026-09-17")).toBe("17. september 2026");
    expect(datoOrd("2026-12-31T23:30:00Z")).toBe("31. december 2026");
    expect(datoOrd("nej")).toBeNull();
    expect(datoOrd(null)).toBeNull();
  });
  it("bilagTekst siger hvad der bliver stående", () => {
    expect(bilagTekst(0, 0, false)).toBe("Der er intet bilag registreret på virksomheden; navn, CVR og kontraktperiode bliver stående.");
    expect(bilagTekst(1, 0, false)).toBe("Bilaget bliver stående: 1 periode. Navn, CVR og kontraktperiode bliver også stående.");
    expect(bilagTekst(2, 3, true)).toBe("Bilaget bliver stående: 2 perioder, 3 træk og betalingslinket. Navn, CVR og kontraktperiode bliver også stående.");
  });
});
