import { describe, expect, it } from "vitest";
import {
  afgoerInvitationslink,
  LINK_UKENDT_TEKST,
  SIGNUP_FEJL_TEKSTER,
  signupFejl,
  UGYLDIG_UUID_KODE,
} from "@/lib/signupFejl";
import { KONTAKT_ADRESSE } from "@/lib/kontaktadresse";

// Signup siger hvad der er galt (16/9 2026, w2 «de dårlige dage»). Målt i
// drift 16/9 i privat vindue: forvansket token → «Database error saving new
// user»; eksisterende mail → «User already registered». Begge rå, engelske,
// uden vej til «Log ind».

describe("afgoerInvitationslink — hvad opslaget gav", () => {
  const gyldig = { name: "Nordic By Hand ApS", logo_url: null, email: "x@y.dk", kontakt: null };

  it("uden token → ingen_token, uanset data/error", () => {
    expect(afgoerInvitationslink({ harToken: false, data: null, error: null })).toBe("ingen_token");
    expect(afgoerInvitationslink({ harToken: false, data: gyldig, error: null })).toBe("ingen_token");
    expect(afgoerInvitationslink({ harToken: false, data: null, error: { code: "22P02" } })).toBe("ingen_token");
  });

  it("data med name → gyldig (også hvis error skulle stå ved siden af)", () => {
    expect(afgoerInvitationslink({ harToken: true, data: gyldig, error: null })).toBe("gyldig");
    expect(afgoerInvitationslink({ harToken: true, data: gyldig, error: undefined })).toBe("gyldig");
    expect(afgoerInvitationslink({ harToken: true, data: { name: "X" }, error: { code: "x", message: "y" } })).toBe("gyldig");
  });

  it("token, men intet svar (data null/tom/uden name, ingen fejl) → ukendt — brugt eller slettet token", () => {
    expect(afgoerInvitationslink({ harToken: true, data: null, error: null })).toBe("ukendt");
    expect(afgoerInvitationslink({ harToken: true, data: undefined, error: null })).toBe("ukendt");
    expect(afgoerInvitationslink({ harToken: true, data: {}, error: null })).toBe("ukendt");
    expect(afgoerInvitationslink({ harToken: true, data: { name: "" }, error: null })).toBe("ukendt");
    expect(afgoerInvitationslink({ harToken: true, data: { name: "   " }, error: null })).toBe("ukendt");
    expect(afgoerInvitationslink({ harToken: true, data: "streng", error: null })).toBe("ukendt");
  });

  it("token der ikke er en uuid → Postgres 22P02 → ukendt (husets læsning: akademiApi.ts, memberProfile.ts, betalingstokenAuth.ts)", () => {
    expect(UGYLDIG_UUID_KODE).toBe("22P02");
    expect(
      afgoerInvitationslink({
        harToken: true,
        data: null,
        error: { code: "22P02", message: 'invalid input syntax for type uuid: "abc"' },
      }),
    ).toBe("ukendt");
  });

  it("enhver anden fejl (netværk, RLS, anden kode) → fejl", () => {
    expect(afgoerInvitationslink({ harToken: true, data: null, error: { code: "PGRST301", message: "JWT expired" } })).toBe("fejl");
    expect(afgoerInvitationslink({ harToken: true, data: null, error: { message: "Failed to fetch" } })).toBe("fejl");
    expect(afgoerInvitationslink({ harToken: true, data: null, error: { code: null, message: null } })).toBe("fejl");
    expect(afgoerInvitationslink({ harToken: true, data: null, error: {} })).toBe("fejl");
  });

  it("linjen over login-formen, ordret, med kontaktadressen fra lib/kontaktadresse", () => {
    expect(LINK_UKENDT_TEKST).toBe(
      "Linket er allerede brugt, eller det virker ikke længere. Har du oprettet din konto, så log ind herunder. Ellers skriv til kontakt@theboardroom.dk, så hjælper vi dig.",
    );
    expect(LINK_UKENDT_TEKST).toContain(KONTAKT_ADRESSE);
  });
});

describe("signupFejl — Supabases tekst → husets sætning", () => {
  it("«User already registered» → log ind i stedet, skiftTilLogin true", () => {
    expect(signupFejl("User already registered")).toEqual({
      tekst: "Der findes allerede en konto med den mail. Log ind i stedet — har du glemt adgangskoden, kan du nulstille den.",
      skiftTilLogin: true,
    });
  });

  it("«Database error saving new user» → ingen gyldig invitation, skiftTilLogin false", () => {
    expect(signupFejl("Database error saving new user")).toEqual({
      tekst: "Kontoen kunne ikke oprettes: der er ingen gyldig invitation til den mail. Skriv til kontakt@theboardroom.dk, så hjælper vi dig.",
      skiftTilLogin: false,
    });
  });

  it("store bogstaver og mellemrum i beskeden ændrer ikke dommen", () => {
    expect(signupFejl("  USER ALREADY REGISTERED \n")).toEqual(signupFejl("User already registered"));
    expect(signupFejl("database ERROR saving new USER   ")).toEqual(signupFejl("Database error saving new user"));
    expect(signupFejl("  user already registered")).toMatchObject({ skiftTilLogin: true });
  });

  it("en ukendt besked vises aldrig rå — den generelle sætning, skiftTilLogin false", () => {
    for (const raa of ["Password should be at least 6 characters", "Signup kræver en gyldig invitation. Kontakt din rådgiver for at få adgang.", "", "   ", null, undefined]) {
      const dom = signupFejl(raa);
      expect(dom).toEqual({ tekst: "Kontoen kunne ikke oprettes. Prøv igen, eller skriv til kontakt@theboardroom.dk.", skiftTilLogin: false });
      if (raa && raa.trim()) expect(dom.tekst).not.toContain(raa);
    }
  });

  it("en delvis match er ikke en match (præcis tekst, ikke indeholder)", () => {
    expect(signupFejl("User already registered — please log in")).toEqual({ tekst: SIGNUP_FEJL_TEKSTER.ukendt, skiftTilLogin: false });
    expect(signupFejl("Error: Database error saving new user")).toEqual({ tekst: SIGNUP_FEJL_TEKSTER.ukendt, skiftTilLogin: false });
  });

  it("alle tre tekster bærer kontaktadressen eller peger på login — ingen engelsk, ingen personlig adresse", () => {
    for (const t of Object.values(SIGNUP_FEJL_TEKSTER)) {
      expect(t).not.toMatch(/registered|database|error/i);
      expect(t).not.toMatch(/jonas@|morten@|@topix\.dk|@molainvest\.dk/);
    }
    expect(SIGNUP_FEJL_TEKSTER.ingenInvitation).toContain(KONTAKT_ADRESSE);
    expect(SIGNUP_FEJL_TEKSTER.ukendt).toContain(KONTAKT_ADRESSE);
    expect(SIGNUP_FEJL_TEKSTER.alleredeRegistreret).toContain("Log ind i stedet");
  });
});
