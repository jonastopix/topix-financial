/**
 * ansoegningUserAgent — browserens user agent på ansøgningen (udkast meta-send, Jonas
 * 21/9-2026 aften, pkt. 2). Ren, Deno-fri (vitest: src/lib/__tests__/metaSend.test.ts).
 *
 * FOR ALLE, IKKE KUN ANNONCE-ANSØGERE (rettet 22/9-2026, udkast-meta-udvidelse pkt. 4).
 * Før gemte vi den KUN, når fbclid var sat — fordi kun annonce-ansøgere blev sendt til Meta.
 * Nu sendes ALLE ansøgninger (pkt. 11), og Meta kræver client_user_agent for website-hændelser
 * («The client_user_agent is required for website events shared using the Conversions API»).
 * En ansøgning uden user agent kan derfor slet ikke sendes — den springes over med grunden
 * «ingen_user_agent». Webinarvejen (annonce → topix.dk → mail → /ansoeg?kilde=webinar) bærer
 * intet klik-id, og den var netop den, der faldt ud på den gamle betingelse.
 *
 * Afkortes som aftale_spor (≤ 512 tegn). Skrives af ansoegning-gem i SAMME fail-softe
 * update som annoncesporet (gemAnnoncespor) — aldrig i insert'en.
 */
import type { Annoncespor } from "./ansoegningSkema.ts";

export const USER_AGENT_MAKS = 512;

/** Headeren user-agent, trimmet og afkortet; tom → null. */
export function laesUserAgent(req: { headers: { get(n: string): string | null } }): string | null {
  const ua = (req.headers.get("user-agent") ?? "").trim().slice(0, USER_AGENT_MAKS);
  return ua === "" ? null : ua;
}

/**
 * Sporet + user_agent for ALLE (22/9). Er der ingen user agent, kommer feltet slet ikke med —
 * heller ikke som null: en update, der skriver null hen over en tidligere gemt værdi, ville
 * fjerne det, vi allerede havde.
 */
export function sporMedUserAgent(spor: Annoncespor, userAgent: string | null): Record<string, string | null> {
  return userAgent === null ? { ...spor } : { ...spor, user_agent: userAgent };
}
