import { describe, expect, it } from "vitest";
import { SIGNUP_FEJL_TEKSTER, signupFejl } from "@/lib/signupFejl";
import { KONTAKT_ADRESSE } from "@/lib/kontaktadresse";

// 30/9 (m28-signupfejl-en-linje): koden dømmer FØRST, teksten bagefter.
// Koderne er slået op i Supabase Auths fejlkode-dokumentation (kilden står i
// signupFejl.ts). En rigtig CFO kunne ikke oprette sin konto 28/9, og alle
// fejl fik samme sætning.

const T = SIGNUP_FEJL_TEKSTER;

describe("signupFejl — koden først", () => {
  it("weak_password uden grunde → den generelle adgangskodetekst", () => {
    expect(signupFejl({ code: "weak_password", message: "Password should be at least 6 characters." })).toEqual({
      tekst: T.svagAdgangskode,
      skiftTilLogin: false,
    });
  });

  it("weak_password med grunde: length, characters, pwned — hver sin sætning, i fast rækkefølge", () => {
    expect(signupFejl({ code: "weak_password", reasons: ["length"] }).tekst).toBe(`Adgangskoden er ikke stærk nok. ${T.forKort}`);
    expect(signupFejl({ code: "weak_password", reasons: ["characters"] }).tekst).toBe(`Adgangskoden er ikke stærk nok. ${T.forFaaTegn}`);
    expect(signupFejl({ code: "weak_password", reasons: ["pwned"] }).tekst).toBe(`Adgangskoden er ikke stærk nok. ${T.kendtFraLaek}`);
    expect(signupFejl({ code: "weak_password", reasons: ["pwned", "length", "characters"] }).tekst).toBe(
      `Adgangskoden er ikke stærk nok. ${T.forKort} ${T.forFaaTegn} ${T.kendtFraLaek}`,
    );
  });

  it("grundene læses både som klientens `reasons` og som serverens `weak_password.reasons`", () => {
    expect(signupFejl({ code: "weak_password", weak_password: { reasons: ["pwned"] } }).tekst).toContain(T.kendtFraLaek);
    expect(signupFejl({ code: "weak_password", reasons: ["length"], weak_password: { reasons: ["pwned"] } }).tekst).toContain(T.forKort);
  });

  it("ukendte grunde, ikke-strenge og ikke-lister ignoreres → den generelle tekst", () => {
    for (const reasons of [["noget_nyt"], [1, null], "length", {}, [], null, undefined]) {
      expect(signupFejl({ code: "weak_password", reasons }).tekst).toBe(T.svagAdgangskode);
    }
  });

  it("over_email_send_rate_limit og over_request_rate_limit → vent og prøv igen", () => {
    expect(signupFejl({ code: "over_email_send_rate_limit", message: "email rate limit exceeded" })).toEqual({
      tekst: T.forMangeMails,
      skiftTilLogin: false,
    });
    expect(signupFejl({ code: "over_request_rate_limit", status: 429 })).toEqual({ tekst: T.forMangeForsoeg, skiftTilLogin: false });
  });

  it("signup_disabled og email_provider_disabled → lukket, skriv til kontakt", () => {
    for (const code of ["signup_disabled", "email_provider_disabled"]) {
      expect(signupFejl({ code, message: "Signups not allowed for this instance" })).toEqual({
        tekst: T.lukketForOprettelse,
        skiftTilLogin: false,
      });
    }
    expect(T.lukketForOprettelse).toContain(KONTAKT_ADRESSE);
  });

  it("user_already_exists og email_exists → log ind, skiftTilLogin true", () => {
    for (const code of ["user_already_exists", "email_exists"]) {
      expect(signupFejl({ code, message: "hvad som helst" })).toEqual({ tekst: T.alleredeRegistreret, skiftTilLogin: true });
    }
  });

  it("email_address_invalid, email_address_not_authorized og validation_failed", () => {
    expect(signupFejl({ code: "email_address_invalid" })).toEqual({ tekst: T.mailAfvist, skiftTilLogin: false });
    expect(signupFejl({ code: "email_address_not_authorized" })).toEqual({ tekst: T.mailIkkeGodkendt, skiftTilLogin: false });
    expect(T.mailIkkeGodkendt).toContain(KONTAKT_ADRESSE);
    expect(signupFejl({ code: "validation_failed" })).toEqual({ tekst: T.formatFejl, skiftTilLogin: false });
  });

  it("koden vinder over beskeden, også når beskeden ville have givet en anden dom", () => {
    expect(signupFejl({ code: "weak_password", message: "User already registered" }).skiftTilLogin).toBe(false);
    expect(signupFejl({ code: "user_already_exists", message: "Database error saving new user" }).tekst).toBe(T.alleredeRegistreret);
  });

  it("koden normaliseres (store bogstaver, mellemrum)", () => {
    expect(signupFejl({ code: "  WEAK_PASSWORD " }).tekst).toBe(T.svagAdgangskode);
  });

  it("en ukendt kode falder tilbage på beskeden: «Database error saving new user» med code unexpected_failure er stadig «ingen invitation»", () => {
    expect(signupFejl({ code: "unexpected_failure", status: 500, message: "Database error saving new user" })).toEqual({
      tekst: T.ingenInvitation,
      skiftTilLogin: false,
    });
    expect(signupFejl({ code: "unexpected_failure", message: "User already registered" }).skiftTilLogin).toBe(true);
  });

  it("en ukendt kode uden kendt besked → den nuværende tekst med kontaktvej, aldrig rå", () => {
    const dom = signupFejl({ code: "en_kode_vi_ikke_kender", status: 500, message: "Something exploded" });
    expect(dom).toEqual({ tekst: T.ukendt, skiftTilLogin: false });
    expect(dom.tekst).toContain(KONTAKT_ADRESSE);
    expect(dom.tekst).not.toContain("exploded");
  });

  it("en fejl uden code (kun message) dømmes som før, også som objekt", () => {
    expect(signupFejl({ message: "User already registered" }).skiftTilLogin).toBe(true);
    expect(signupFejl({ code: null, message: "Database error saving new user" }).tekst).toBe(T.ingenInvitation);
    expect(signupFejl({ message: "Password should be at least 6 characters" }).tekst).toBe(T.ukendt);
    expect(signupFejl({})).toEqual({ tekst: T.ukendt, skiftTilLogin: false });
  });

  it("alle tekster: dansk, ingen personlig adresse, ingen rå engelsk", () => {
    for (const t of Object.values(T)) {
      expect(t).not.toMatch(/registered|database|error|rate limit|password should/i);
      expect(t).not.toMatch(/jonas@|morten@|@topix\.dk|@molainvest\.dk/);
    }
  });
});
