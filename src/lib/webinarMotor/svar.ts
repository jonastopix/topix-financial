/**
 * webinarMotor/svar — beviset i hvert svar og værnet mod persondata (skive 1, 30/9-2026).
 *
 * Spejlet ORDRET i supabase/functions/_shared/webinarMotor/svar.ts
 * (paritetstest src/lib/__tests__/webinarMotor.paritet.test.ts). Nul imports.
 */

/**
 * Beviset for udrulningen (CLAUDE.md «Deployment af edge functions»): hvert
 * svar fra motorens functions bærer `motor: MOTOR_VERSION`. Kun den nye kode
 * kan svare med det. Skifter ved hver skive, der ændrer et svar.
 */
export const MOTOR_VERSION = "boardroom-1";

/**
 * Nøgler, der ALDRIG må stå i et svar fra webinar-tilmeld, webinar-rum eller
 * webinar-puls — hvor dybt i objektet de end ligger. Tilmeldingens personfelter
 * og annoncespor (samme ånd som webinarDelingSvar.ts) + motorens egne
 * (ip_dagshash, user_agent, fornavn). Seerens egen hilsen («Hej Anne») er
 * skive 3's beslutning og går så gennem en navngiven undtagelse — ikke gennem
 * et hul her.
 */
export const MOTOR_FORBUDTE_NOEGLER = [
  "email", "navn", "fornavn", "ewebinar_id", "ip", "ip_dagshash", "user_agent",
  "fbclid", "fbp", "fbc", "fbc_cookie", "ga_client_id",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "origin", "first_origin", "referrer", "first_referrer", "by", "land", "enhed", "tidszone",
  "join_link", "kalender_link", "replay_link", "raa", "set_bits", "synlig_bits", "enhed_tilstand",
] as const;

/** Stierne (a.b[0].c) til enhver forbudt nøgle — tom liste = rent. Går hele træet, også arrays. */
export function findMotorForbudte(obj: unknown, sti = ""): string[] {
  if (obj === null || typeof obj !== "object") return [];
  const ud: string[] = [];
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => ud.push(...findMotorForbudte(v, `${sti}[${i}]`)));
    return ud;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const her = sti ? `${sti}.${k}` : k;
    if ((MOTOR_FORBUDTE_NOEGLER as readonly string[]).includes(k)) ud.push(her);
    ud.push(...findMotorForbudte(v, her));
  }
  return ud;
}
