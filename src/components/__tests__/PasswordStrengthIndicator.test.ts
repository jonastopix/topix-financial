import { describe, it, expect } from "vitest";
import { getPasswordScore } from "@/components/PasswordStrengthIndicator";

describe("getPasswordScore", () => {
  const cases: Array<{ name: string; password: string; score: number }> = [
    { name: "empty string", password: "", score: 0 },
    { name: "7 lowercase chars (below length floor)", password: "abcdefg", score: 0 },
    { name: "8 lowercase chars (at length floor)", password: "abcdefgh", score: 1 },
    { name: "length + upper", password: "Abcdefgh", score: 2 },
    { name: "length + upper + digit", password: "Abcdefg1", score: 3 },
    { name: "length + upper + digit + special", password: "Abcdefg1!", score: 4 },
    { name: "uppercase only, too short", password: "ABC", score: 1 },
    { name: "digit only, too short", password: "12", score: 1 },

    // PR #18 — src/pages/Auth.tsx handleSignup afviser score < 2 med
    // "Vælg en stærkere adgangskode". Disse to cases låser tærsklen.
    { name: "PR #18 floor: score 1 (rejected by handleSignup)", password: "abcdefgh", score: 1 },
    { name: "PR #18 floor: score 2 (accepted by handleSignup)", password: "Abcdefgh", score: 2 },

    { name: "danish lowercase æøå count as special", password: "æøåabcde", score: 2 },
    { name: "danish uppercase Æ counts as special, not as A-Z", password: "Æbcdefgh", score: 2 },
    { name: "single space matches special", password: " ", score: 1 },
    { name: "tab inside 8-char password matches special", password: "\tabcdefg", score: 2 },
  ];

  for (const { name, password, score } of cases) {
    it(`${name} → ${score}`, () => {
      expect(getPasswordScore(password)).toBe(score);
    });
  }
});
