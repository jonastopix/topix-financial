/**
 * ÉN regel for den gratis 1:1-session (2/10-2026 aften — Jonas: «Uanset hvordan og hvorfor, hvis man har en
 * gratis 1:1 session, uanset om det er med Morten, Jonas eller begge, så skal det fremgå.»; docs/forside-v3.md
 * «Målt i prod 2/10 — 1:1-reglerne var uenige»).
 *
 * SPEJLET BYTE-ENS i supabase/functions/_shared/sessionRet.ts (paritetstest i src/lib/__tests__/sessionRet.test.ts):
 * backenden (create-free-intro-booking) booker efter PRÆCIS denne dom, og fladerne (forsidens «Til gode»,
 * /book-session, rådgiverens «Mangler at booke») viser den. Før stod der tre regler: backenden og /book-session
 * krævede kolonnen NULL, rådgiverens forside lod et TILBUD overtrumfe en ældre «brugt» — målt 2/10: fem tilbudte
 * Jonas-sessioner (1/10 13:43–13:44) havde alle `jonas_session_used_at` ≤ tilbuddet og kunne ikke bookes (409).
 *
 * REN, ingen imports (Deno og Vite læser samme fil).
 */

export type SessionRaadgiver = "morten" | "jonas";

export interface SessionRetKilde {
  intro_session_used_at: string | null | undefined;
  jonas_session_used_at: string | null | undefined;
  /** companies.jonas_session_tilbudt_at (migration 20261001110000). Udeladt = intet tilbud. */
  jonas_session_tilbudt_at?: string | null | undefined;
}

/**
 * Et tilbud overtrumfer en ældre «brugt» (Jonas 1/10-2026 13:46). Regnestykket: tilbudt_at sat OG
 * brugt_at ≤ tilbudt_at → brugt-markeringen er fra FØR tilbuddet og tæller ikke (null = ikke brugt).
 * Kun en brug EFTER tilbuddet (brugt_at > tilbudt_at — bookingen selv, Calendly-webhooken eller et senere
 * flueben) gør sessionen brugt. Uden tilbud, eller et tidsstempel der ikke kan læses: kolonnen som den står.
 */
export function jonasRetEfterTilbud(brugtAt: string | null | undefined, tilbudtAt: string | null | undefined): string | null {
  const brugt = brugtAt ?? null;
  if (!tilbudtAt || brugt === null) return brugt;
  const b = Date.parse(brugt);
  const t = Date.parse(tilbudtAt);
  if (!Number.isFinite(b) || !Number.isFinite(t)) return brugt;
  return b > t ? brugt : null;
}

/** Hvornår retten TÆLLER som brugt — null = ikke brugt (til gode, når medlemmet er berettiget). */
export function retBrugtAt(raadgiver: SessionRaadgiver, c: SessionRetKilde): string | null {
  return raadgiver === "morten"
    ? (c.intro_session_used_at ?? null)
    : jonasRetEfterTilbud(c.jonas_session_used_at, c.jonas_session_tilbudt_at);
}

/** Er retten til gode? (Berettigelsen — fuldt medlem — dømmes af kalderen med computeMembershipTier.) */
export function retTilGode(raadgiver: SessionRaadgiver, c: SessionRetKilde): boolean {
  return retBrugtAt(raadgiver, c) === null;
}
