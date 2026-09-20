/**
 * _shared/ewebinarProeve.ts — en prøve-tilmelding, der kan signeres og sendes.
 *
 * ── HVORFOR (20/9) ──────────────────────────────────────────────────────────
 * Fremmøde-hændelserne skal være i drift tirsdag kl. 12, og webhooken fyrer
 * kun, når eWebinar sender noget. Prøven skulle køres udefra med signerings-
 * nøglen — men Lovables secrets kan ikke vises, kun overskrives, og nøglen
 * findes IKKE i vault (målt 20/9: vault har præcis to navne,
 * `email_queue_service_role_key` og `supabase_url`).
 *
 * Nøglen findes ét sted: som edge-function-secret, læsbar for en function via
 * Deno.env. Så er svaret en function, der signerer INDEFRA og kalder den
 * rigtige webhook — kaldt fra SQL-editoren gennem `kald_edge`, som Jonas
 * allerede bruger. Nøglen forlader aldrig processen.
 *
 * ── DEN ER IKKE ET SIGNERINGS-ORAKEL ────────────────────────────────────────
 * Functionen tager IKKE en vilkårlig krop og signerer den. Den BYGGER kroppen
 * selv, her, med `webinarId` fastlåst til `PROEVE-webinar` og registrant-id
 * tvunget til at starte med `PROEVE-`. Kalderen vælger kun trin og mail.
 *
 * Det er den forskel, der gør den forsvarlig: med service-role-nøglen kan man
 * i forvejen skrive hvad som helst i basen — men man kan IKKE få webhooken til
 * at tro, at en RIGTIG tilmelding har ændret sig. Det kan man stadig ikke.
 */

export const PROEVE_PRAEFIKS = "PROEVE-";
export const PROEVE_WEBINAR_ID = "PROEVE-webinar";
export const PROEVE_SESSION = "2026-09-22T10:00:00.000Z";

export const TRIN = ["tilmeldt", "deltog", "moedte_ikke"] as const;
export type Trin = (typeof TRIN)[number];

/** Alt, prøven forstår. Andet afvises — se _shared/kendteFelter.ts. */
export const KENDTE_FELTER = ["trin", "email", "registrant_id"] as const;

export function erTrin(v: unknown): v is Trin {
  return typeof v === "string" && (TRIN as readonly string[]).includes(v);
}

/** Kun id'er, der SIGER de er prøver. Et rigtigt registrant-id kan aldrig passere. */
export function erProeveId(v: unknown): v is string {
  return typeof v === "string" && v.startsWith(PROEVE_PRAEFIKS) && v.length > PROEVE_PRAEFIKS.length && /^[A-Za-z0-9_-]+$/.test(v);
}

/** Hvad webhooken FORVENTES at svare for hvert trin — ikke fra en ny person. */
export const FORVENTET: Record<Trin, "ingen" | "deltog" | "moedte_ikke"> = {
  tilmeldt: "ingen",
  deltog: "deltog",
  moedte_ikke: "moedte_ikke",
};

/**
 * Registrant-objektet i præcis den form, `plukTilmelding` (webinarDom.ts)
 * læser: id, email, webinarId, state, action, sessionTime, watchedPercent.
 * Formen er den samme som proev-fremmoede.ts sendte udefra — flyttet herind.
 */
export function byggRegistrant(trin: Trin, registrantId: string, email: string, nu: Date): Record<string, unknown> {
  const basis = {
    id: registrantId,
    email,
    name: "Proeve Person",
    webinarId: PROEVE_WEBINAR_ID,
    webinarTitle: "PRØVE — må slettes",
    sessionTime: PROEVE_SESSION,
    sessionType: "live",
    registeredTime: nu.toISOString(),
  };
  if (trin === "tilmeldt") return { ...basis, state: "Registered", action: "Registered" };
  if (trin === "moedte_ikke") return { ...basis, state: "Missed", action: "Missed" };
  return { ...basis, state: "Watched", action: "Watched", watchedPercent: 82, attended: "82%" };
}

/** Headerne, som webhooken læser dem. `t=…,v1=…` er formen, parseSignaturHeader forstår. */
export function byggSignaturHeadere(tidsstempel: string, hex: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-EWebinar-Timestamp": tidsstempel,
    "X-EWebinar-Signature": `t=${tidsstempel},v1=${hex}`,
  };
}
