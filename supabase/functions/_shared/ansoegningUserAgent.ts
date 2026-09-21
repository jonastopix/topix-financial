/**
 * ansoegningUserAgent — browserens user agent på ansøgningen (udkast meta-send, Jonas
 * 21/9-2026 aften, pkt. 2). Ren, Deno-fri (vitest: src/lib/__tests__/metaSend.test.ts).
 *
 * KUN NÅR fbclid ER SAT (dataminimering): Meta kræver client_user_agent for
 * website-hændelser («The client_user_agent is required for website events shared using
 * the Conversions API»), og kun annonce-ansøgere sendes — så kun de får den gemt.
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

/** Sporet + user_agent, KUN når fbclid er sat; ellers sporet alene (heller ikke user_agent: null). */
export function sporMedUserAgent(spor: Annoncespor, userAgent: string | null): Record<string, string | null> {
  return spor.fbclid ? { ...spor, user_agent: userAgent } : { ...spor };
}
