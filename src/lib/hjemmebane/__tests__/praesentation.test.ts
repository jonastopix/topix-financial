/**
 * Præsentationen som onboarding-ritual (11/9, kort 60): kildeværdien er den
 * migrationen tillader, og konstanterne fladen og tjeklisten deler står
 * ordret. UDEN FORESLÅET TEKST (Jonas 16/9): composeren starter tom, og det
 * eneste fladen siger er pladsholderen — én neutral sætning uden eksempler.
 * Titlen «Hej, jeg er …» og skabelonen af profilens felter er slettet; de
 * testes ikke længere, fordi de ikke findes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  KILDE_PRAESENTATION,
  KILDE_PRAESENTATION_LABEL,
  PRAESENTATION_PARAM,
  PRAESENTATION_PLADSHOLDER,
  PRAESENTATION_STI,
} from "@/lib/hjemmebane/praesentation";

/* Værnet: kilde_type-værdien og migrationen skal blive ved med at passe
   sammen — glider én af dem, afviser CHECK'en indsendelsen i prod (23514)
   uden at nogen anden test ville se det. */
describe("kildeværn: 'praesentation' står i begge CHECK'er i migrationen", () => {
  const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260911120000_praesentation_kilde.sql"), "utf8");
  // Kun de udførte ALTER-sætninger — filhovedets FØR-værdier (uden
  // 'praesentation') må ikke kunne give et falsk grønt.
  const udfoert = migration
    .split("\n")
    .filter((linje) => !linje.trimStart().startsWith("--"))
    .join("\n");
  const vaerdiliste = udfoert.split("ADD CONSTRAINT community_traade_kilde_type_check")[1]?.split(";")[0] ?? "";
  const kombination = udfoert.split("ADD CONSTRAINT community_traade_kilde_check")[1]?.split(";")[0] ?? "";

  it("KILDE_PRAESENTATION er præcis strengen 'praesentation'", () => {
    expect(KILDE_PRAESENTATION).toBe("praesentation");
  });
  it("værdilisten: 'praesentation' ved siden af content_item og event", () => {
    expect(vaerdiliste).toContain(`'${KILDE_PRAESENTATION}'::text`);
    expect(vaerdiliste).toContain("'content_item'::text");
    expect(vaerdiliste).toContain("'event'::text");
  });
  it("kombinationen: grenen kilde_type = 'praesentation' uden kilde-id'er", () => {
    expect(kombination).toContain(`(kilde_type = '${KILDE_PRAESENTATION}'::text) AND (kilde_item_id IS NULL) AND (kilde_event_id IS NULL)`);
  });
  it("de to andre grene står ordret som prod (målt 11/9)", () => {
    expect(kombination).toContain("(kilde_type = 'content_item'::text) AND (kilde_item_id IS NOT NULL) AND (kilde_event_id IS NULL)");
    expect(kombination).toContain("(kilde_type = 'event'::text) AND (kilde_event_id IS NOT NULL) AND (kilde_item_id IS NULL)");
    expect(kombination).toContain("(kilde_type IS NULL) AND (kilde_item_id IS NULL) AND (kilde_event_id IS NULL)");
  });
});

describe("konstanterne fladen og tjeklisten deler", () => {
  it("tagget, parameteren og stien", () => {
    expect(KILDE_PRAESENTATION_LABEL).toBe("Præsentation");
    expect(PRAESENTATION_PARAM).toBe("praesentation");
    expect(PRAESENTATION_STI).toBe("/community?praesentation=1");
  });
});

describe("pladsholderen (Jonas 16/9): én neutral sætning, ingen eksempler", () => {
  it("er præcis teksten", () => {
    expect(PRAESENTATION_PLADSHOLDER).toBe("Fortæl med dine egne ord, hvem du er.");
  });
  it("foreslår ingenting: intet «fx», ingen tankestreg med eksempler, ingen «Hej, jeg er»", () => {
    expect(PRAESENTATION_PLADSHOLDER).not.toMatch(/\bfx\b/i);
    expect(PRAESENTATION_PLADSHOLDER).not.toContain("—");
    expect(PRAESENTATION_PLADSHOLDER).not.toContain("Hej, jeg er");
  });
});
