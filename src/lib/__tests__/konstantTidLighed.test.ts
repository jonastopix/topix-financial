import { describe, expect, it } from "vitest";
import { erKonstantTidLig } from "../../../supabase/functions/_shared/konstantTidLighed.ts";

// Hjælperen bag monday-webhookens URL-vej (_shared/mondayVaern.ts, 14/9-2026).
// Den importeres direkte fra Deno-kopien — der findes ingen frontend-kopi, og
// funktionen har hverken IO eller Deno-afhængighed. Testene låser DOMMEN
// (lig/ulig); at tiden er konstant kan ikke måles pålideligt i en test og
// står som form i filhovedet.

describe("erKonstantTidLig — dommen", () => {
  it("to ens strenge er lige", () => {
    expect(erKonstantTidLig("abc", "abc")).toBe(true);
    expect(erKonstantTidLig("a".repeat(64), "a".repeat(64))).toBe(true);
  });

  it("samme længde, ét tegn forskelligt — først, midt og sidst — er ulige", () => {
    expect(erKonstantTidLig("xbc", "abc")).toBe(false);
    expect(erKonstantTidLig("axc", "abc")).toBe(false);
    expect(erKonstantTidLig("abx", "abc")).toBe(false);
  });

  it("forskellig længde er altid ulig, også når den korte er et præfiks", () => {
    expect(erKonstantTidLig("abc", "abcd")).toBe(false);
    expect(erKonstantTidLig("abcd", "abc")).toBe(false);
    expect(erKonstantTidLig("abc", "ab")).toBe(false);
  });

  it("tom streng: lig tom, ulig alt andet", () => {
    expect(erKonstantTidLig("", "")).toBe(true);
    expect(erKonstantTidLig("", "a")).toBe(false);
    expect(erKonstantTidLig("a", "")).toBe(false);
  });

  it("sammenligner bytes, ikke tegn — æøå og emoji", () => {
    expect(erKonstantTidLig("nøgle-æøå", "nøgle-æøå")).toBe(true);
    expect(erKonstantTidLig("nøgle-æøå", "nøgle-aeoeaa")).toBe(false);
    expect(erKonstantTidLig("🔑", "🔑")).toBe(true);
    expect(erKonstantTidLig("🔑", "🔒")).toBe(false);
  });

  it("er symmetrisk", () => {
    const par: Array<[string, string]> = [["a", "b"], ["abc", "abcd"], ["", "x"], ["same", "same"]];
    for (const [a, b] of par) expect(erKonstantTidLig(a, b)).toBe(erKonstantTidLig(b, a));
  });
});
