/**
 * webhookSignatur — «t=<unix>,v1=<hex>»-signaturen, som Stripe og Calendly
 * begge sender (30/9-2026, sikkerhedsanalysen C7/F1).
 *
 * FØR: stripe-webhook og calendly-webhook havde hver sin kopi, der
 *   (1) sammenlignede HMAC-hex med `===` (lækker via tid, målt 14/9 i
 *       konstantTidLighed.ts' filhoved),
 *   (2) kun prøvede FØRSTE `v1=` (Stripe sender flere under nøglerotation), og
 *   (3) ikke tjekkede tidsstemplet — en opfanget, gyldig besked kunne
 *       genafspilles når som helst.
 *
 * NU: én funktion. HMAC-SHA256 over «<t>.<rå body>» med hemmeligheden som
 * UTF-8 (uændret — samme hemmelighed, samme form som før), sammenlignet i
 * konstant tid mod HVER v1 i headeren. Tidsvinduet er en parameter:
 *   - Stripe: 300 s — stripe-node's DEFAULT_TOLERANCE, og samme regel som
 *     SDK'en: afvis når (nu − t) > tolerancen. Stripe signerer HVER levering
 *     på ny (også gentagelser), så vinduet afviser aldrig en ægte levering.
 *   - Calendly: `null` = vinduet håndhæves IKKE (alderen returneres og logges).
 *     Calendlys dokumentation foreslår 3 min, men siger IKKE, om en gentaget
 *     levering signeres på ny (slået op 30/9: developer.calendly.com
 *     «Webhook Signatures»). Gør den ikke, ville et vindue afvise hver
 *     gentagelse, og Calendly sætter abonnementet `disabled` efter 24 timers
 *     fejl — det kan ikke genaktiveres. Alderen logges, så det kan MÅLES
 *     før vinduet slås til.
 *
 * Signaturen tjekkes FØR tidsstemplet (som SDK'en): et forfalsket kald får
 * «matcher_ikke», aldrig et svar om tid.
 *
 * Ingen IO, ingen Deno-afhængighed — testes i vitest fra src/lib/__tests__.
 */
import { erKonstantTidLig } from "./konstantTidLighed.ts";

/** stripe-node: `DEFAULT_TOLERANCE = 300` sekunder. */
export const STRIPE_TOLERANCE_SEK = 300;

export type TV1Dom =
  | { ok: true; alderSek: number }
  | {
    ok: false;
    grund: "ingen_hemmelighed" | "ingen_header" | "header_uden_t_eller_v1" | "ugyldigt_tidsstempel" | "matcher_ikke" | "for_gammel";
    alderSek?: number;
  };

/** «t=1492774577,v1=abc,v1=def» → { t, v1: [abc, def] }; null hvis t eller v1 mangler. */
export function parseTV1Header(header: string | null | undefined): { t: string; v1: string[] } | null {
  if (!header) return null;
  const dele = header.split(",").map((d) => d.trim());
  const t = dele.find((d) => d.startsWith("t="))?.slice(2);
  const v1 = dele.filter((d) => d.startsWith("v1=")).map((d) => d.slice(3).toLowerCase()).filter((s) => s.length > 0);
  if (!t || v1.length === 0) return null;
  return { t, v1 };
}

async function hmacHex(secret: string, tekst: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(tekst));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verificerTV1Signatur(input: {
  payload: string;
  header: string | null | undefined;
  secret: string | null | undefined;
  nuSek: number;
  /** null = vinduet håndhæves ikke (alderen returneres stadig). */
  toleranceSek: number | null;
}): Promise<TV1Dom> {
  if (!input.secret) return { ok: false, grund: "ingen_hemmelighed" };
  if (!input.header) return { ok: false, grund: "ingen_header" };
  const sig = parseTV1Header(input.header);
  if (!sig) return { ok: false, grund: "header_uden_t_eller_v1" };
  if (!/^\d{1,12}$/.test(sig.t)) return { ok: false, grund: "ugyldigt_tidsstempel" };

  const forventet = await hmacHex(input.secret, `${sig.t}.${input.payload}`);
  // Alle v1 prøves, og der returneres ikke tidligt — tiden afhænger ikke af, hvilken der matchede.
  let match = false;
  for (const v of sig.v1) match = erKonstantTidLig(forventet, v) || match;
  if (!match) return { ok: false, grund: "matcher_ikke" };

  // REGNESTYKKET (som stripe-node): alder = nu − t i sekunder; afvis når alder > tolerance.
  // En levering 301 s gammel afvises med 300 s; en med t i fremtiden (negativ alder) afvises ikke.
  const alderSek = input.nuSek - Number(sig.t);
  if (input.toleranceSek !== null && alderSek > input.toleranceSek) {
    return { ok: false, grund: "for_gammel", alderSek };
  }
  return { ok: true, alderSek };
}
