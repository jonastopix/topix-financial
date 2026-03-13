/**
 * Family-scope tests for requiresStructuralPdfPayload helper.
 * Proves the backend structural-required guard is family-specific.
 *
 * Run: deno test supabase/functions/extract-financial-data/family_scope_test.ts
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requiresStructuralPdfPayload } from "./index.ts";
import type { SourceFingerprint } from "../_shared/sourceFingerprint.ts";

// -- Test fingerprints --
const economicFingerprint: SourceFingerprint = {
  source_system: "economic",
  document_type: "resultatopgoerelse",
  confidence: "HIGH",
  evidence: ["e-conomic detected"],
};

const economicSaldobalanceFingerprint: SourceFingerprint = {
  source_system: "economic",
  document_type: "saldobalance",
  confidence: "HIGH",
  evidence: ["e-conomic saldobalance"],
};

const dineroFingerprint: SourceFingerprint = {
  source_system: "dinero",
  document_type: "resultatopgoerelse",
  confidence: "HIGH",
  evidence: ["Dinero detected"],
};

// -- Raw text samples --
const economicResultatText = `--- Side 1 ---
Rapporter » Regnskab »
Resultatopgørelse for perioden 01.01.26 - 31.01.26
secure.e-conomic.com`;

const economicSaldobalanceText = `--- Side 1 ---
Rapporter » Regnskab »
Saldobalance for perioden 01.02.26 - 28.02.26
RESULTATOPGØRELSE
Omsætning
AKTIVER I ALT
PASSIVER I ALT
secure.e-conomic.com`;

const economicBalanceWithAktiverText = `--- Side 1 ---
Balance rapport
AKTIVER
Anlægsaktiver
PASSIVER
secure.e-conomic.com`;

const dineroText = `Dinero - Resultatopgørelse
Omsætning
dinero.dk`;

const unknownText = `Some unknown financial report
Revenue
Expenses`;

// ── e-conomic resultatopgørelse PDF → true ──
Deno.test("e-conomic resultatopgørelse PDF → structuralRequired = true", () => {
  assertEquals(requiresStructuralPdfPayload(economicFingerprint, economicResultatText), true);
});

// ── e-conomic saldobalance PDF (via /saldobalance/i) → false ──
Deno.test("e-conomic saldobalance PDF → structuralRequired = false", () => {
  assertEquals(requiresStructuralPdfPayload(economicSaldobalanceFingerprint, economicSaldobalanceText), false);
});

// ── e-conomic balance with AKTIVER/PASSIVER → false ──
Deno.test("e-conomic balance with AKTIVER/PASSIVER → structuralRequired = false", () => {
  assertEquals(requiresStructuralPdfPayload(economicSaldobalanceFingerprint, economicBalanceWithAktiverText), false);
});

// ── Dinero PDF → false ──
Deno.test("Dinero PDF → structuralRequired = false", () => {
  assertEquals(requiresStructuralPdfPayload(dineroFingerprint, dineroText), false);
});

// ── Unknown/null fingerprint → false ──
Deno.test("null fingerprint → structuralRequired = false", () => {
  assertEquals(requiresStructuralPdfPayload(null, unknownText), false);
});

Deno.test("null fingerprint with resultatopgørelse text → structuralRequired = false", () => {
  assertEquals(requiresStructuralPdfPayload(null, economicResultatText), false);
});

// ── Case-insensitivity tests ──
Deno.test("SALDOBALANCE uppercase excluded", () => {
  const text = "SALDOBALANCE for perioden\nsecure.e-conomic.com\nresultatopg";
  assertEquals(requiresStructuralPdfPayload(economicFingerprint, text), false);
});

Deno.test("aktiver lowercase excluded", () => {
  const text = "aktiver\npassiver\nsecure.e-conomic.com\nresultatopg";
  assertEquals(requiresStructuralPdfPayload(economicFingerprint, text), false);
});

// ── Edge: e-conomic fingerprint but no resultatopg keyword → false ──
Deno.test("e-conomic fingerprint but no resultatopg keyword → false", () => {
  const text = "Some random e-conomic document\nsecure.e-conomic.com";
  assertEquals(requiresStructuralPdfPayload(economicFingerprint, text), false);
});
