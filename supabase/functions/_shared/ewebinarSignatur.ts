/**
 * ewebinarSignatur — beviset for at en besked kommer fra eWebinar (udkast
 * 19/9-2026, ~/Downloads/udkast-ewebinar-webhook/README.md).
 *
 * FORMEN (Jonas 19/9, målt i eWebinar; api.ewebinar.com/docs/openapi.json
 * bekræfter headernavnet og at hemmeligheden er en «hex-encoded 256-bit
 * HMAC secret», rotérbar, vist én gang):
 *   X-EWebinar-Signature: t=<unix>,v1=<hex>
 *   HMAC-SHA256 over «<X-EWebinar-Timestamp>.<rå body>»
 * Samme «t=,v1=»-form som Stripe og Calendly; verifyStripeSignature /
 * verifyCalendlySignature er forbilledet. To forskelle, begge med vilje:
 *
 *   1. TIDSSTEMPLET kan komme to steder: sin egen header (X-EWebinar-Timestamp)
 *      og som t= i signaturen. Jonas' spec siger headeren; er den der ikke,
 *      bruges t=. Er begge der og forskellige, prøves headeren først.
 *   2. NØGLEFORMEN er ikke målt: «hex-encoded» kan betyde at HMAC-nøglen er
 *      de 32 rå bytes bag hex-strengen — eller at hex-strengen selv (64 ASCII-
 *      tegn) er nøglen, som hos Stripe. Vi prøver UTF-8-strengen først (Stripe/
 *      Calendly-formen) og derefter de afkodede bytes, hvis hemmeligheden ser
 *      ud som hex. Svaret siger hvilken form der matchede — webhooken logger
 *      det, så det er målt efter første rigtige kald, og listen kan kortes ned.
 *
 * Sammenligningen er i konstant tid (_shared/konstantTidLighed.ts) — bedre
 * end `===`, som Stripe/Calendly-kopierne stadig bruger (målt 14/9).
 *
 * Ingen IO, ingen Deno-afhængighed: kun globalThis.crypto.subtle — testes i
 * vitest fra src/lib/__tests__/ewebinarSignatur.test.ts.
 */
import { erKonstantTidLig } from "./konstantTidLighed.ts";

export type Noegleform = "utf8" | "hex";

export type SignaturDom =
  | { ok: true; form: Noegleform; t: string }
  | { ok: false; grund: "ingen_header" | "header_uden_t_eller_v1" | "intet_tidsstempel" | "matcher_ikke" };

/** «t=1726700000,v1=abc…» → { t, v1 }; null hvis formen ikke holder. */
export function parseSignaturHeader(header: string | null | undefined): { t: string; v1: string } | null {
  if (!header) return null;
  const dele = header.split(",").map((d) => d.trim());
  const t = dele.find((d) => d.startsWith("t="))?.slice(2);
  const v1 = dele.find((d) => d.startsWith("v1="))?.slice(3);
  if (!t || !v1) return null;
  return { t, v1: v1.toLowerCase() };
}

function hexTilBytes(hex: string): Uint8Array {
  const ud = new Uint8Array(hex.length / 2);
  for (let i = 0; i < ud.length; i++) ud[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return ud;
}

/** De nøgleformer en hemmelighed kan have: altid UTF-8; også rå bytes når den er ren hex af lige længde. */
export function noegleformer(secret: string): Array<{ form: Noegleform; bytes: Uint8Array }> {
  const former: Array<{ form: Noegleform; bytes: Uint8Array }> = [{ form: "utf8", bytes: new TextEncoder().encode(secret) }];
  const s = secret.trim();
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0 && s.length >= 32) former.push({ form: "hex", bytes: hexTilBytes(s.toLowerCase()) });
  return former;
}

export async function hmacSha256Hex(noegle: Uint8Array, tekst: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey("raw", noegle as unknown as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(tekst));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Bevis beskeden ægte. `rawBody` er req.text() — ALDRIG en genserialiseret
 * JSON (det brækker signaturen). Returnerer hvilken nøgleform og hvilket
 * tidsstempel der matchede, eller grunden til afvisningen.
 */
export async function verifyEwebinarSignature(input: {
  rawBody: string;
  signaturHeader: string | null | undefined;
  tidsstempelHeader: string | null | undefined;
  secret: string;
}): Promise<SignaturDom> {
  if (!input.signaturHeader) return { ok: false, grund: "ingen_header" };
  const sig = parseSignaturHeader(input.signaturHeader);
  if (!sig) return { ok: false, grund: "header_uden_t_eller_v1" };
  const tidsstempler = [...new Set([input.tidsstempelHeader?.trim() || null, sig.t].filter((t): t is string => !!t))];
  if (tidsstempler.length === 0) return { ok: false, grund: "intet_tidsstempel" };
  for (const t of tidsstempler) {
    const signeret = `${t}.${input.rawBody}`;
    for (const { form, bytes } of noegleformer(input.secret)) {
      const forventet = await hmacSha256Hex(bytes, signeret);
      if (erKonstantTidLig(forventet, sig.v1)) return { ok: true, form, t };
    }
  }
  return { ok: false, grund: "matcher_ikke" };
}
