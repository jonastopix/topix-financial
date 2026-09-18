/**
 * src/lib/aftryk.ts
 *
 * Spejlet ordret i supabase/functions/_shared/aftryk.ts — enhver ændring
 * her SKAL også laves der (paritetstest i
 * src/lib/__tests__/aftrykParitet.test.ts). Nul imports; bruger kun
 * globalThis.crypto.subtle, som findes i Deno, i browseren og i Node ≥ 19
 * (vitest kører på Node 20+).
 *
 * Aftrykket af aftalegrundlaget (Jonas 18/9, punkt 1): SHA-256 over den
 * KANONISKE tekst (underskriftDom.kanoniskTekst) som UTF-8, skrevet som 64
 * hex-tegn. Samme funktion som husets øvrige aftryk (pdfStructuralValidator
 * computeSha256Deno, pdfStructuralExtractor computeSha256) — blot over tekst.
 * Regnes ved afsendelsen og skrives på rækken; regnes IGEN ved underskriften
 * og skal være det samme, ellers underskrives der ikke (dokumentet er ikke
 * det, der blev sendt). Regnes over den færdige PDF som pdf_aftryk.
 */

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 64 hex-tegn, små bogstaver — formen alle aftryk i huset har. */
export function erAftryk(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
}

/** «a1b2 c3d4 …» i grupper af fire — til PDF-siden og mailen, så det kan læses op. */
export function formaterAftryk(hex: string): string {
  return hex.match(/.{1,4}/g)?.join(" ") ?? hex;
}

/** Hash af engangskoden: aldrig koden selv i databasen. Saltet er aftalens id. */
export function kodeHash(aftaleId: string, kode: string): Promise<string> {
  return sha256Hex(`${aftaleId}:${kode}`);
}
