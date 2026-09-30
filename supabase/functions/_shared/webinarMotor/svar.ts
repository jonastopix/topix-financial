/**
 * webinarMotor/svar — beviset i hvert svar og værnet mod persondata (skive 1, 30/9-2026).
 *
 * Spejlet ORDRET i src/lib/webinarMotor/svar.ts
 * (paritetstest src/lib/__tests__/webinarMotor.paritet.test.ts). Nul imports.
 */

/**
 * Beviset for udrulningen (CLAUDE.md «Deployment af edge functions»): hvert
 * svar fra motorens functions bærer `motor: MOTOR_VERSION`. Kun den nye kode
 * kan svare med det. Skifter ved hver skive, der ændrer et svar: «boardroom-2»
 * (skive 2) bærer rummets `tidslinje`, `hilsen` og handlingerne `gen_tilmeld`
 * og `forudfyld`. «boardroom-3» (skive 3): «sessioner» kender den INTERNE
 * session (`session_id` i kroppen → `intern: true` i svaret), og
 * webinar-motor-cron svarer med samme markør.
 */
export const MOTOR_VERSION = "boardroom-3";

/**
 * Nøgler, der ALDRIG må stå i et svar fra webinar-tilmeld, webinar-rum eller
 * webinar-puls — hvor dybt i objektet de end ligger. Tilmeldingens personfelter
 * og annoncespor (samme ånd som webinarDelingSvar.ts) + motorens egne
 * (ip_dagshash, user_agent, fornavn). Seerens egen hilsen («Hej Anne») og
 * ansøgningens forudfyldning går gennem NAVNGIVNE_UNDTAGELSER — ikke gennem et
 * hul her.
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

/**
 * DE ENESTE steder, et personfelt må stå i et svar (skive 2, 30/9-2026) — og
 * kun til den, der har tokenet, dvs. personen selv:
 *   hilsen     «Hej Anne» i rummet og «Tak fordi du så med, Anne» i exitrummet
 *              (spec §A7/§A8) — fornavnet, intet andet.
 *   forudfyld  navn og mail til ansøgningen fra exitrummets knap (spec §A9) —
 *              så intet persondata står i en URL.
 * En undtagelse er en PRÆCIS sti, ikke en nøgle: «email» andetsteds i samme
 * svar fanges stadig. Kun webinar-rum bruger dem (webinarRum.guard).
 */
export const NAVNGIVNE_UNDTAGELSER = {
  hilsen: ["hilsen.fornavn"],
  forudfyld: ["forudfyld.navn", "forudfyld.email"],
} as const;
export type Undtagelse = keyof typeof NAVNGIVNE_UNDTAGELSER;

/** findMotorForbudte minus de præcise stier, én navngiven undtagelse tillader. */
export function findMotorForbudteMed(obj: unknown, undtagelse: Undtagelse | null): string[] {
  const tilladt: readonly string[] = undtagelse ? NAVNGIVNE_UNDTAGELSER[undtagelse] : [];
  return findMotorForbudte(obj).filter((s) => !tilladt.includes(s));
}
