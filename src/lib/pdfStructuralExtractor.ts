/**
 * Client-side PDF Structural Extractor — Rev 7 Architecture
 *
 * Uses pdfjs-dist to extract true positional data from PDF binaries.
 * Produces PdfStructuralPayload with x/y coordinates, column slots,
 * and header anchoring.
 *
 * This runs in the BROWSER only — the edge function receives the
 * resulting JSON payload, not the raw PDF binary.
 */

import * as pdfjsLib from "pdfjs-dist";
import type {
  PdfStructuralPayload,
  PdfStructuralToken,
  PdfStructuralRow,
  PdfColumnProfile,
} from "./pdfStructuralTypes";

// ── Constants ──

/** Y-proximity threshold for grouping tokens into rows (PDF points) */
const ROW_Y_THRESHOLD = 3;

/** Danish number pattern for identifying numeric tokens */
const DK_NUM_RE = /^-?[\d.]+,\d{2}$/;

/** Header anchor patterns for column detection */
const HEADER_ANCHORS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /perioden/i, label: "Perioden" },
  { pattern: /år\s*til\s*dato/i, label: "År til dato" },
  { pattern: /saldo/i, label: "Saldo" },
  { pattern: /debet/i, label: "Debet" },
  { pattern: /kredit/i, label: "Kredit" },
];

/** Subtotal label patterns */
const SUBTOTAL_RE = /\b(i alt|total|dækningsbidrag|resultat|aktiver|passiver|egenkapital|gæld)\b/i;

// ── SHA-256 Hash ──

async function computeSha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Token Extraction ──

interface RawToken {
  text: string;
  x: number;
  y: number;
  width: number;
  page: number;
}

async function extractRawTokens(
  pdf: pdfjsLib.PDFDocumentProxy
): Promise<RawToken[]> {
  const tokens: RawToken[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    for (const item of content.items) {
      // Skip non-text items (marked content, etc.)
      if (!("str" in item) || !item.str.trim()) continue;

      const textItem = item as any;
      const transform = textItem.transform;
      if (!transform || transform.length < 6) continue;

      tokens.push({
        text: textItem.str,
        x: transform[4],
        y: transform[5],
        width: textItem.width || 0,
        page: pageNum,
      });
    }
  }

  return tokens;
}

// ── Row Grouping ──

function groupTokensIntoRows(
  tokens: RawToken[],
  pageNumber: number
): PdfStructuralRow[] {
  // Filter to this page and sort by y descending (PDF: y=0 is bottom, but text flows top-to-bottom)
  const pageTokens = tokens
    .filter((t) => t.page === pageNumber)
    .sort((a, b) => b.y - a.y); // Top of page first (higher y = higher on page)

  if (pageTokens.length === 0) return [];

  // Group by y-proximity
  const groups: RawToken[][] = [];
  let currentGroup: RawToken[] = [pageTokens[0]];
  let currentY = pageTokens[0].y;

  for (let i = 1; i < pageTokens.length; i++) {
    const token = pageTokens[i];
    if (Math.abs(token.y - currentY) <= ROW_Y_THRESHOLD) {
      currentGroup.push(token);
    } else {
      groups.push(currentGroup);
      currentGroup = [token];
      currentY = token.y;
    }
  }
  groups.push(currentGroup);

  // Convert to PdfStructuralRow
  return groups.map((group, idx) => {
    // Sort tokens left-to-right within row
    group.sort((a, b) => a.x - b.x);

    const yValues = group.map((t) => t.y);
    const medianY = yValues[Math.floor(yValues.length / 2)];

    // Concatenate row text for header/subtotal detection
    const rowText = group.map((t) => t.text).join(" ");

    const structTokens: PdfStructuralToken[] = group.map((t) => ({
      text: t.text,
      x: t.x,
      y: t.y,
      width: t.width,
      page: t.page,
      column_slot: null,
      column_slot_confidence: "LOW" as const,
    }));

    return {
      row_index: idx,
      row_group_id: `p${pageNumber}_r${idx}`,
      y_position: medianY,
      page: pageNumber,
      tokens: structTokens,
      is_header: isHeaderRow(rowText),
      is_subtotal: SUBTOTAL_RE.test(rowText),
    };
  });
}

function isHeaderRow(text: string): boolean {
  return HEADER_ANCHORS.some((a) => a.pattern.test(text));
}

// ── Column Detection ──

function isNumericToken(text: string): boolean {
  const cleaned = text.trim().replace(/\s/g, "");
  return DK_NUM_RE.test(cleaned) || /^-?\d+$/.test(cleaned);
}

function detectColumnProfile(
  allRows: PdfStructuralRow[]
): PdfColumnProfile {
  // Strategy 1: Header anchor detection
  for (const row of allRows) {
    if (!row.is_header) continue;

    const anchorHits: Array<{ label: string; x: number; width: number }> = [];
    for (const token of row.tokens) {
      for (const anchor of HEADER_ANCHORS) {
        if (anchor.pattern.test(token.text)) {
          anchorHits.push({
            label: anchor.label,
            x: token.x,
            width: token.width,
          });
        }
      }
    }

    if (anchorHits.length >= 1) {
      // Build slot ranges centered on anchors
      const slotRanges = anchorHits.map((hit) => ({
        min: hit.x - 20,
        max: hit.x + hit.width + 20,
      }));

      return {
        slot_count: anchorHits.length,
        slot_labels: anchorHits.map((h) => h.label),
        slot_x_ranges: slotRanges,
        detection_method: "header_anchor",
        confidence: anchorHits.length >= 2 ? "HIGH" : "MEDIUM",
      };
    }
  }

  // Strategy 2: Positional clustering of numeric tokens
  const numericXPositions: number[] = [];
  for (const row of allRows) {
    if (row.is_header) continue;
    for (const token of row.tokens) {
      if (isNumericToken(token.text)) {
        numericXPositions.push(token.x);
      }
    }
  }

  if (numericXPositions.length < 3) {
    return {
      slot_count: 0,
      slot_labels: [],
      slot_x_ranges: [],
      detection_method: "positional_cluster",
      confidence: "LOW",
    };
  }

  // Simple k-means-like clustering: sort positions and find gaps
  numericXPositions.sort((a, b) => a - b);
  const clusters: Array<{ positions: number[] }> = [
    { positions: [numericXPositions[0]] },
  ];

  for (let i = 1; i < numericXPositions.length; i++) {
    const lastCluster = clusters[clusters.length - 1];
    const lastPos = lastCluster.positions[lastCluster.positions.length - 1];

    if (numericXPositions[i] - lastPos < 40) {
      // Same cluster
      lastCluster.positions.push(numericXPositions[i]);
    } else {
      // New cluster
      clusters.push({ positions: [numericXPositions[i]] });
    }
  }

  // Filter clusters with at least 3 members (noise reduction)
  const significantClusters = clusters.filter((c) => c.positions.length >= 3);

  if (significantClusters.length === 0) {
    return {
      slot_count: 0,
      slot_labels: [],
      slot_x_ranges: [],
      detection_method: "positional_cluster",
      confidence: "LOW",
    };
  }

  const slotRanges = significantClusters.map((c) => ({
    min: Math.min(...c.positions) - 10,
    max: Math.max(...c.positions) + 10,
  }));

  return {
    slot_count: significantClusters.length,
    slot_labels: significantClusters.map((_, i) => `Column ${i}`),
    slot_x_ranges: slotRanges,
    detection_method: "positional_cluster",
    confidence: significantClusters.length >= 2 ? "MEDIUM" : "LOW",
  };
}

// ── Column Slot Assignment ──

function assignColumnSlots(
  rows: PdfStructuralRow[],
  profile: PdfColumnProfile
): void {
  if (profile.slot_count === 0) return;

  for (const row of rows) {
    if (row.is_header) continue;

    for (const token of row.tokens) {
      if (!isNumericToken(token.text)) continue;

      // Find closest slot by x-position overlap
      let bestSlot: number | null = null;
      let bestDistance = Infinity;

      for (let slot = 0; slot < profile.slot_x_ranges.length; slot++) {
        const range = profile.slot_x_ranges[slot];
        const center = (range.min + range.max) / 2;
        const tokenCenter = token.x + token.width / 2;
        const distance = Math.abs(tokenCenter - center);

        // Check if token falls within range
        if (tokenCenter >= range.min && tokenCenter <= range.max) {
          if (distance < bestDistance) {
            bestSlot = slot;
            bestDistance = distance;
          }
        }
      }

      // Fallback: nearest slot if within reasonable distance
      if (bestSlot === null) {
        for (let slot = 0; slot < profile.slot_x_ranges.length; slot++) {
          const range = profile.slot_x_ranges[slot];
          const center = (range.min + range.max) / 2;
          const tokenCenter = token.x + token.width / 2;
          const distance = Math.abs(tokenCenter - center);

          if (distance < 50 && distance < bestDistance) {
            bestSlot = slot;
            bestDistance = distance;
          }
        }
      }

      if (bestSlot !== null) {
        token.column_slot = bestSlot;
        token.column_slot_confidence =
          profile.detection_method === "header_anchor"
            ? (bestDistance < 20 ? "HIGH" : "MEDIUM")
            : "MEDIUM";
      }
    }
  }
}

// ── Main Extractor ──

export async function extractPdfStructural(
  file: File
): Promise<PdfStructuralPayload> {
  const arrayBuffer = await file.arrayBuffer();

  // Compute SHA-256 content hash
  const contentHash = await computeSha256(arrayBuffer);

  // Open PDF
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  // Extract raw tokens
  const rawTokens = await extractRawTokens(pdf);

  // Group into rows per page
  const pages: PdfStructuralPayload["pages"] = [];
  let totalTokenCount = 0;
  let totalRowCount = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const rows = groupTokensIntoRows(rawTokens, pageNum);
    pages.push({ page_number: pageNum, rows });
    totalRowCount += rows.length;
    for (const row of rows) {
      totalTokenCount += row.tokens.length;
    }
  }

  // Flatten all rows for column detection
  const allRows = pages.flatMap((p) => p.rows);

  // Detect column profile
  const columnProfile = detectColumnProfile(allRows);

  // Assign column slots to numeric tokens
  assignColumnSlots(allRows, columnProfile);

  console.log(
    `[PdfStructural] ${pdf.numPages} pages, ${totalRowCount} rows, ${totalTokenCount} tokens, ${columnProfile.slot_count} column slots (${columnProfile.detection_method}, ${columnProfile.confidence})`
  );

  return {
    version: "1.0",
    pages,
    column_profile: columnProfile,
    metadata: {
      page_count: pdf.numPages,
      total_token_count: totalTokenCount,
      total_row_count: totalRowCount,
      content_hash: contentHash,
      source_file_name: file.name,
      extraction_timestamp: new Date().toISOString(),
    },
  };
}
