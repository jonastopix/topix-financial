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

    // KJ Auto: Combined Balance/PnL pattern with "Nummer"/"Navn" columns
    const row1 = headerRows[1]?.[0]?.toString() || "";
    if (/balance/i.test(row1)) {
      const hasNummer = row4.some?.((c: any) => /nummer/i.test(c?.toString?.() || ""));
      const hasNavn = row4.some?.((c: any) => /^navn$/i.test(c?.toString?.() || ""));
      if (hasNummer && hasNavn) {
        // Check for KJ-specific patterns (company name, account range)
        const companyName = headerRows[0]?.[0]?.toString() || "";
        if (/kj\s*auto/i.test(companyName)) {
          evidence.push("KJ Auto company name + combined Balance/PnL structure");
          return {
            source_system: "kj_auto",
            document_type: "combined",
            confidence: "HIGH",
            evidence,
          };
        }

        // Generic combined balance/PnL (same structure, different company)
        evidence.push("Combined Balance/PnL XLSX structure (Nummer/Navn columns)");
        return {
          source_system: "unknown",
          document_type: "combined",
          confidence: "MEDIUM",
          evidence,
        };
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
