/**
 * PDF Structural Extraction Types — Rev 7 Architecture
 *
 * Shared contract between client-side extractor and edge function consumer.
 * IMPORTANT: This file MUST stay in sync with
 * supabase/functions/_shared/pdfStructuralTypes.ts
 *
 * True positional evidence from pdfjs-dist TextItem.transform.
 * Parser-level only — no business aliases, no sign logic.
 */

// ── Structural Token (one text fragment with true PDF coordinates) ──

export interface PdfStructuralToken {
  /** Raw text content from TextItem.str */
  text: string;
  /** X position from TextItem.transform[4] (PDF points) */
  x: number;
  /** Y position from TextItem.transform[5] (PDF points) */
  y: number;
  /** Rendered width from TextItem.width */
  width: number;
  /** 1-indexed page number */
  page: number;
  /** Assigned column slot (0-based), null if unassigned */
  column_slot: number | null;
  /** Confidence of column slot assignment */
  column_slot_confidence: "HIGH" | "MEDIUM" | "LOW";
}

// ── Structural Row (tokens grouped by y-proximity) ──

export interface PdfStructuralRow {
  /** 0-based row index within the page */
  row_index: number;
  /** Stable row group ID: "p{page}_r{row_index}" */
  row_group_id: string;
  /** Representative y position for this row (median of token y values) */
  y_position: number;
  /** 1-indexed page number */
  page: number;
  /** All tokens in this row, sorted left-to-right by x */
  tokens: PdfStructuralToken[];
  /** Whether this row contains column header text */
  is_header: boolean;
  /** Whether this row appears to be a subtotal/total line */
  is_subtotal: boolean;
}

// ── Column Profile (detected from header anchoring or positional clustering) ──

export interface PdfColumnProfile {
  /** Number of detected numeric column slots */
  slot_count: number;
  /** Human-readable labels for each slot, e.g. ["Perioden", "År til dato"] */
  slot_labels: string[];
  /** X-coordinate ranges for each slot */
  slot_x_ranges: Array<{ min: number; max: number }>;
  /** How columns were detected */
  detection_method: "header_anchor" | "positional_cluster";
  /** Overall confidence in column detection */
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

// ── Full Structural Payload ──

export interface PdfStructuralPayload {
  /** Schema version */
  version: "1.0";
  /** Structural pages with rows */
  pages: Array<{
    page_number: number;
    rows: PdfStructuralRow[];
  }>;
  /** Detected column profile */
  column_profile: PdfColumnProfile;
  /** Extraction metadata */
  metadata: {
    /** Total page count */
    page_count: number;
    /** Total token count across all pages */
    total_token_count: number;
    /** Total row count across all pages */
    total_row_count: number;
    /** SHA-256 hex digest of the raw PDF ArrayBuffer */
    content_hash: string;
    /** Original file name */
    source_file_name: string;
    /** ISO timestamp of extraction */
    extraction_timestamp: string;
  };
}

// ── Validation result from server-side validator ──

export interface PdfStructuralValidationResult {
  valid: boolean;
  errors: string[];
}
