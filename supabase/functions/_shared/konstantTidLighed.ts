/**
 * Konstant-tid-sammenligning af to strenge.
 *
 * HVORFOR DEN FINDES: monday-webhook autentificerer en board-webhook på en
 * delt hemmelighed i URL'en (14/9-2026, _shared/mondayVaern.ts). En
 * almindelig `===` på strenge stopper ved første forskellige tegn, og
 * tiden det tager røber hvor mange tegn af hemmeligheden der var rigtige.
 * Målt 14/9: huset havde ingen konstant-tid-hjælper — de to
 * webhook-signaturer (Stripe, Calendly) sammenligner deres HMAC-hex med
 * `===`, og det eneste konstant-tid-tjek var `crypto.subtle.verify` i
 * monday-webhookens JWT-vej. En rå hemmelighed kan ikke gå gennem
 * `subtle.verify`, så sammenligningen skrives her, ét sted, og testes.
 *
 * FORMEN: begge strenge kodes som UTF-8, og hver byte XOR'es ind i én
 * akkumulator over den LÆNGSTE af de to længder — der returneres aldrig
 * tidligt, heller ikke ved forskellig længde. Længdeforskellen selv XOR'es
 * ind til sidst, så to strenge af forskellig længde aldrig er lige.
 *
 * FORBEHOLD: JavaScript giver ingen garanti mod at JIT'en optimerer;
 * dette er den sædvanlige best-effort-form (samme som Node's
 * timingSafeEqual bygger på for lige lange buffere), og den er bedre
 * end `===`, som med sikkerhed lækker.
 *
 * Ingen IO, ingen Deno-afhængighed — testes i vitest fra src/lib/__tests__.
 */

/** true når `a` og `b` er byte-for-byte ens; tiden afhænger kun af den længste længde. */
export function erKonstantTidLig(a: string, b: string): boolean {
  const koder = new TextEncoder();
  const ba = koder.encode(a);
  const bb = koder.encode(b);
  const laengde = Math.max(ba.length, bb.length);
  let forskel = ba.length ^ bb.length;
  for (let i = 0; i < laengde; i++) {
    // Uden for den korteste streng læses 0 — ingen tidlig return, ingen forgrening på indhold.
    forskel |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return forskel === 0;
}
