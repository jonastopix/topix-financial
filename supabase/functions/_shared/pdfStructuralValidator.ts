/**
 * Server-side PDF Structural Payload Validator — Rev 7 Architecture
 *
 * Deterministic validation of client-produced PdfStructuralPayload.
 * Rejects malformed, inconsistent, or suspicious payloads before
 * template consumption.
 *
 * Content hash verification happens separately in index.ts where
 * the stored PDF binary is accessible.
 */

import type {
  PdfStructuralPayload,
  PdfStructuralValidationResult,
} from "./pdfStructuralTypes.ts";

// ── Schema/Sanity Validation ──

export function validatePdfStructuralPayload(
  payload: unknown
): PdfStructuralValidationResult {
  const errors: string[] = [];

  // Type guard
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["Payload is not an object"] };
  }

  const p = payload as Record<string, unknown>;

  // ── Version ──
  if (p.version !== "1.0") {
    errors.push(`Invalid version: expected "1.0", got "${p.version}"`);
  }

  // ── Pages ──
  if (!Array.isArray(p.pages)) {
    errors.push("Missing or non-array 'pages'");
    return { valid: false, errors };
  }

  if (p.pages.length < 1) {
    errors.push("Payload has 0 pages (minimum 1)");
  }

  let totalRows = 0;
  let totalTokens = 0;
  let numericTokenCount = 0;

  for (let pageIdx = 0; pageIdx < (p.pages as any[]).length; pageIdx++) {
    const page = (p.pages as any[])[pageIdx];
    if (!page || typeof page !== "object") {
      errors.push(`pages[${pageIdx}] is not an object`);
      continue;
    }

    if (typeof page.page_number !== "number" || page.page_number < 1) {
      errors.push(`pages[${pageIdx}].page_number invalid: ${page.page_number}`);
    }

    if (!Array.isArray(page.rows)) {
      errors.push(`pages[${pageIdx}].rows is not an array`);
      continue;
    }

    for (let rowIdx = 0; rowIdx < page.rows.length; rowIdx++) {
      const row = page.rows[rowIdx];
      totalRows++;

      if (!row || typeof row !== "object") {
        errors.push(`pages[${pageIdx}].rows[${rowIdx}] is not an object`);
        continue;
      }

      if (typeof row.row_index !== "number") {
        errors.push(`Row ${rowIdx} on page ${pageIdx}: missing row_index`);
      }

      if (typeof row.y_position !== "number" || !isFinite(row.y_position)) {
        errors.push(`Row ${rowIdx} on page ${pageIdx}: y_position not finite`);
      }

      if (!Array.isArray(row.tokens)) {
        errors.push(`Row ${rowIdx} on page ${pageIdx}: tokens not array`);
        continue;
      }

      for (let tokIdx = 0; tokIdx < row.tokens.length; tokIdx++) {
        const token = row.tokens[tokIdx];
        totalTokens++;

        if (!token || typeof token !== "object") {
          errors.push(`Token ${tokIdx} in row ${rowIdx} page ${pageIdx}: not an object`);
          continue;
        }

        // Token sanity
        if (typeof token.text !== "string" || token.text.length === 0) {
          errors.push(`Token ${tokIdx} in row ${rowIdx} page ${pageIdx}: empty text`);
        }
        if (typeof token.x !== "number" || !isFinite(token.x) || token.x < 0) {
          errors.push(`Token ${tokIdx} in row ${rowIdx} page ${pageIdx}: x invalid (${token.x})`);
        }
        if (typeof token.y !== "number" || !isFinite(token.y) || token.y < 0) {
          errors.push(`Token ${tokIdx} in row ${rowIdx} page ${pageIdx}: y invalid (${token.y})`);
        }
        if (typeof token.width !== "number" || !isFinite(token.width) || token.width < 0) {
          errors.push(`Token ${tokIdx} in row ${rowIdx} page ${pageIdx}: width invalid (${token.width})`);
        }

        // Count numeric tokens
        if (token.column_slot !== null && token.column_slot !== undefined) {
          numericTokenCount++;
        }
      }
    }
  }

  // ── Structural completeness ──
  if (totalRows < 5) {
    errors.push(`Insufficient rows: ${totalRows} (minimum 5)`);
  }
  if (numericTokenCount < 1 && totalRows >= 5) {
    errors.push(`No numeric tokens with column_slot assigned`);
  }

  // ── Column profile ──
  if (!p.column_profile || typeof p.column_profile !== "object") {
    errors.push("Missing column_profile");
  } else {
    const cp = p.column_profile as Record<string, unknown>;
    if (typeof cp.slot_count !== "number" || cp.slot_count < 0) {
      errors.push(`Invalid column_profile.slot_count: ${cp.slot_count}`);
    }
    if (!Array.isArray(cp.slot_labels)) {
      errors.push("column_profile.slot_labels not array");
    }
    if (!Array.isArray(cp.slot_x_ranges)) {
      errors.push("column_profile.slot_x_ranges not array");
    }

    // Consistency: slot_count matches array lengths
    if (
      typeof cp.slot_count === "number" &&
      Array.isArray(cp.slot_labels) &&
      cp.slot_labels.length !== cp.slot_count
    ) {
      errors.push(
        `column_profile inconsistency: slot_count=${cp.slot_count} but slot_labels.length=${cp.slot_labels.length}`
      );
    }
    if (
      typeof cp.slot_count === "number" &&
      Array.isArray(cp.slot_x_ranges) &&
      cp.slot_x_ranges.length !== cp.slot_count
    ) {
      errors.push(
        `column_profile inconsistency: slot_count=${cp.slot_count} but slot_x_ranges.length=${cp.slot_x_ranges.length}`
      );
    }
  }

  // ── Metadata ──
  if (!p.metadata || typeof p.metadata !== "object") {
    errors.push("Missing metadata");
  } else {
    const m = p.metadata as Record<string, unknown>;
    if (typeof m.page_count !== "number" || m.page_count < 1) {
      errors.push(`Invalid metadata.page_count: ${m.page_count}`);
    }
    if (typeof m.content_hash !== "string" || m.content_hash.length !== 64) {
      errors.push(`Invalid metadata.content_hash: expected 64-char hex, got length ${(m.content_hash as string)?.length}`);
    }
    if (typeof m.source_file_name !== "string" || m.source_file_name.length === 0) {
      errors.push("Missing metadata.source_file_name");
    }

    // Page count consistency
    if (typeof m.page_count === "number" && Array.isArray(p.pages) && p.pages.length !== m.page_count) {
      errors.push(`Page count mismatch: metadata.page_count=${m.page_count} but pages.length=${(p.pages as any[]).length}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ── Content Hash Verification ──

export async function computeSha256Deno(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
