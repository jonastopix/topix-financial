import { describe, expect, it } from "vitest";
import { ADGANGSKODE_MIN_SCORE, NAVN_MAKS, initialer, loginMetoder, styrkeOrd, tjekAdgangskode, validerNavn } from "@/lib/konto";
import { getPasswordScore } from "@/components/PasswordStrengthIndicator";

describe("validerNavn", () => {
  it("trimmer og folder mellemrum; tomt og for langt afvises", () => {
    expect(validerNavn("  Jonas   Herlev ")).toEqual({ ok: true, navn: "Jonas Herlev" });
    expect(validerNavn("   ")).toEqual({ ok: false, fejl: "Skriv dit navn." });
    expect(validerNavn("x".repeat(NAVN_MAKS + 1)).ok).toBe(false);
    expect(validerNavn("x".repeat(NAVN_MAKS)).ok).toBe(true);
  });
});

describe("tjekAdgangskode — Settings' tre tjek, i rækkefølge, plus «samme som før»", () => {
  const score = (p: string) => getPasswordScore(p);
  it("kræver nuværende, ny, styrke ≥ 2, ens gentagelse, og forskellig fra nuværende", () => {
    expect(tjekAdgangskode({ nuvaerende: "", ny: "Ny1!", gentag: "Ny1!", score: 4 })).toEqual({ ok: false, fejl: "Indtast din nuværende adgangskode." });
    expect(tjekAdgangskode({ nuvaerende: "gammel", ny: "", gentag: "", score: 0 })).toEqual({ ok: false, fejl: "Skriv en ny adgangskode." });
    expect(tjekAdgangskode({ nuvaerende: "gammel", ny: "kort", gentag: "kort", score: score("kort") }).ok).toBe(false);
    expect(tjekAdgangskode({ nuvaerende: "gammel", ny: "Langtkodeord1", gentag: "Langtkodeord2", score: score("Langtkodeord1") })).toEqual({ ok: false, fejl: "De to adgangskoder er ikke ens." });
    expect(tjekAdgangskode({ nuvaerende: "Langtkodeord1", ny: "Langtkodeord1", gentag: "Langtkodeord1", score: 3 }).ok).toBe(false);
    expect(tjekAdgangskode({ nuvaerende: "gammel", ny: "Langtkodeord1", gentag: "Langtkodeord1", score: score("Langtkodeord1") })).toEqual({ ok: true });
  });
  it("husets score: 8 tegn + stort + tal = 3; kun små bogstaver = 1 (for svag)", () => {
    expect(ADGANGSKODE_MIN_SCORE).toBe(2);
    expect(score("Langtkodeord1")).toBe(3);
    expect(score("langtkodeord")).toBe(1);
    expect(styrkeOrd(score("langtkodeord"))).toBe("Svag");
    expect(styrkeOrd(2)).toBe("Rimelig");
    expect(styrkeOrd(3)).toBe("God");
    expect(styrkeOrd(4)).toBe("Stærk");
  });
});

describe("loginMetoder og initialer", () => {
  it("læser identities", () => {
    expect(loginMetoder([{ provider: "email" }])).toEqual({ harAdgangskode: true, harGoogle: false, googleEmail: null });
    expect(loginMetoder([{ provider: "email" }, { provider: "google", identity_data: { email: "j@gmail.com" } }])).toEqual({ harAdgangskode: true, harGoogle: true, googleEmail: "j@gmail.com" });
    expect(loginMetoder(null)).toEqual({ harAdgangskode: false, harGoogle: false, googleEmail: null });
  });
  it("initialer som Settings", () => {
    expect(initialer("Jonas Herlev")).toBe("JH");
    expect(initialer("  morten  ")).toBe("M");
    expect(initialer("")).toBe("?");
  });
});
