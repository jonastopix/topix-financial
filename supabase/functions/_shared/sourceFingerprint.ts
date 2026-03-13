/**
 * Source-System Fingerprinting — Phase 2
 *
 * Separates known-source detection from template matching.
 * Known sources MUST resolve via deterministic templates only — AI is forbidden.
 * Unknown sources may fall through to AI extraction.
 */

import type { SourceSystem, DocumentType } from "./semanticTypes.ts";

export interface SourceFingerprint {
  source_system: SourceSystem;
  document_type: DocumentType;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  evidence: string[];
}

/**
 * Detect source system from file metadata and content.
 * This runs BEFORE template matching to gate AI fallback.
 */
export function detectSourceSystem(
  fileName: string,
  fileType: "pdf" | "xlsx" | "xls" | "csv",
  rawText?: string,
  headerRows?: any[][]
): SourceFingerprint {
  const evidence: string[] = [];
  const fileNameLower = fileName.toLowerCase();

  // ── PDF fingerprinting ──
  if (fileType === "pdf" && rawText) {
    // e-conomic: footer URL
    if (/secure\.e-conomic\.com/i.test(rawText)) {
      evidence.push("e-conomic footer URL detected");

      let docType: DocumentType = "unknown";
      if (/saldobalance/i.test(rawText)) {
        docType = "saldobalance";
        evidence.push("'Saldobalance' header found");
      } else if (/resultatopgørelse/i.test(rawText) && !/saldobalance/i.test(rawText)) {
        docType = "resultatopgoerelse";
        evidence.push("'Resultatopgørelse' header found (no saldobalance)");
      }

      return { source_system: "economic", document_type: docType, confidence: "HIGH", evidence };
    }

    // Dinero: branding
    if (/\bdinero\b/i.test(rawText)) {
      evidence.push("Dinero branding detected in PDF text");
      return {
        source_system: "dinero",
        document_type: "resultatopgoerelse",
        confidence: "MEDIUM",
        evidence,
      };
    }
  }

  // ── CSV fingerprinting ──
  if (fileType === "csv" && rawText) {
    // Dinero CSV: "Konto;Kontonavn;Beløb" header
    if (/^.*Konto;Kontonavn;Beløb/im.test(rawText)) {
      evidence.push("Dinero CSV header pattern: Konto;Kontonavn;Beløb");
      return {
        source_system: "dinero",
        document_type: "resultatopgoerelse",
        confidence: "HIGH",
        evidence,
      };
    }
  }

  // ── XLSX fingerprinting ──
  if ((fileType === "xlsx" || fileType === "xls") && headerRows && headerRows.length >= 5) {
    // e-conomic XLSX: "Resultatopgørelse" header + "Konto"/"Tekst" columns
    const row0 = headerRows[0]?.[0]?.toString() || "";
    const row4 = headerRows[4] || [];

    // Check for e-conomic XLSX P&L pattern
    if (/resultatopgørelse/i.test(row0)) {
      const hasKonto = row4.some?.((c: any) => /^konto$/i.test(c?.toString?.() || ""));
      const hasTekst = row4.some?.((c: any) => /^tekst$/i.test(c?.toString?.() || ""));
      if (hasKonto || hasTekst) {
        evidence.push("e-conomic XLSX header: Resultatopgørelse + Konto/Tekst columns");
        return {
          source_system: "economic",
          document_type: "resultatopgoerelse",
          confidence: "HIGH",
          evidence,
        };
      }
    }

    // Combined DK: Balance/PnL pattern with "Nummer"/"Navn" columns
    // Structural detection — company-name-agnostic. Any file with:
    //   Row 1: contains "balance" (case-insensitive)
    //   Row 4: has "Nummer" + "Navn" columns
    //   Row 4: has a third column with period info (non-empty)
    // is treated as the combined_dk family.
    const row1 = headerRows[1]?.[0]?.toString() || "";
    if (/balance/i.test(row1)) {
      const hasNummer = row4.some?.((c: any) => /nummer/i.test(c?.toString?.() || ""));
      const hasNavn = row4.some?.((c: any) => /^navn$/i.test(c?.toString?.() || ""));
      if (hasNummer && hasNavn) {
        // Additional structural guard: row 4 must have a period/date column (col 2+)
        const hasPeriodCol = row4.length >= 3 && row4[2] != null && row4[2].toString().trim() !== "";
        if (!hasPeriodCol) {
          evidence.push("Nummer/Navn columns found but no period column — not combined_dk");
        } else {
          evidence.push("Combined DK XLSX structure: Balance + Nummer/Navn + period column");
          return {
            source_system: "combined_dk",
            document_type: "combined",
            confidence: "HIGH",
            evidence,
          };
        }
      }
    }
  }

  // ── No match ──
  evidence.push("No known source fingerprint matched");
  return {
    source_system: "unknown",
    document_type: "unknown",
    confidence: "LOW",
    evidence,
  };
}

/**
 * Check if AI extraction is allowed for this source.
 * Known supported sources MUST use deterministic templates — AI is forbidden.
 */
export function isAiAllowed(fingerprint: SourceFingerprint): boolean {
  return fingerprint.source_system === "unknown";
}
