/**
 * ansoegningVisning — sporet FØR ansøgningen findes (udkast 28/9-2026,
 * ~/Downloads/udkast-ansoegning-visning/README.md). Ren, Deno-fri: vitest
 * læser den (src/lib/__tests__/ansoegningVisning.test.ts), ansoegning-gem
 * bruger den i grenen «spor».
 *
 * HVORFOR: 17 klikkede «Ansøg» i webinaret 22/9, 6 rækker blev oprettet. En
 * række opstår først ved CVR-skærmens «Slå op», så alt før det var usynligt
 * (recon-ansoegning-frafald-hvorfor.md). Tre trin gør det synligt:
 *   vist    — introsiden er tegnet for en ny besøgende (ingen levende ansøgning)
 *   start   — «Start ansøgningen» er trykket
 *   tastet  — første tegn i CVR-feltet
 * og rækken selv (ansoegninger) er det fjerde. Et visnings-id (tilfældigt,
 * kun i sidens hukommelse) binder trinene sammen og sendes med «opret», så
 * rækken kan kobles til sin visning.
 *
 * INGEN PERSONDATA: sporet bærer kilde, kilde_raa, annoncesporet (samme otte
 * felter som ansøgningen), browserens user agent og IP'ens dagshash — aldrig
 * navn, e-mail, telefon, CVR, svar, rå IP eller et token. SPOR_KOLONNER er
 * de ENESTE nøgler, en række kan have (værn: ansoegningVisning.guard).
 *
 * RATE-GRÆNSE: højst SPOR_PR_IP_PR_TIME rækker pr. IP-dagshash pr. time og
 * SPOR_PR_TIME_I_ALT i alt. Tre trin pr. visning — loftet er ti gange
 * ansøgningens (OPRET_PR_IP_PR_TIME = 30), så et webinarhold bag én IP aldrig
 * rammer det. Kan vi ikke tælle, gemmer vi ikke (fail-closed).
 */
import { annoncesporAf, type Annoncespor, KILDER } from "./ansoegningSkema.ts";

export const VISNINGS_TRIN = ["vist", "start", "tastet"] as const;
export type VisningsTrin = (typeof VISNINGS_TRIN)[number];

export const SPOR_PR_IP_PR_TIME = 300;
export const SPOR_PR_TIME_I_ALT = 6000;
const RAA_MAKS = 120;

/** De eneste kolonner, en sporrække skrives med (ud over id, ansoegning_id og created_at). */
export const SPOR_KOLONNER = [
  "visning_id",
  "trin",
  "kilde",
  "kilde_raa",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "landing",
  "referrer",
  "user_agent",
  "ip_hash",
] as const;

export type SporRaekke = { visning_id: string; trin: VisningsTrin; kilde: string; kilde_raa: string | null; user_agent: string | null; ip_hash: string } & Annoncespor;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Et visnings-id er et uuid — alt andet afvises (og ved «opret» ignoreres det). */
export function erVisningsId(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function erVisningsTrin(v: unknown): v is VisningsTrin {
  return typeof v === "string" && (VISNINGS_TRIN as readonly string[]).includes(v);
}

/**
 * Body'en → sporrækken, eller en afvisning. Kilden snævres til KILDER («andet»
 * for alt ukendt), kilde_raa afkortes, annoncesporet dømmes af SAMME funktion
 * som ansøgningens (annoncesporAf). User agent og IP-hash kommer fra kalderen
 * (request-headerne), aldrig fra body'en.
 */
export function sporRaekkeAf(
  body: Record<string, unknown> | null | undefined,
  userAgent: string | null,
  ipHash: string,
): { ok: true; raekke: SporRaekke } | { ok: false; fejl: string } {
  if (!erVisningsId(body?.visning_id)) return { ok: false, fejl: "visning_id" };
  if (!erVisningsTrin(body?.trin)) return { ok: false, fejl: "trin" };
  const kildeInd = typeof body?.kilde === "string" ? body.kilde : "";
  const kilde = (KILDER as readonly string[]).includes(kildeInd) ? kildeInd : "andet";
  const kildeRaa = typeof body?.kilde_raa === "string" ? body.kilde_raa.trim().slice(0, RAA_MAKS) || null : null;
  return {
    ok: true,
    raekke: {
      visning_id: body!.visning_id as string,
      trin: body!.trin as VisningsTrin,
      kilde,
      kilde_raa: kildeRaa,
      ...annoncesporAf(body?.annoncespor),
      user_agent: userAgent,
      ip_hash: ipHash,
    },
  };
}

/** Rate-dommen: er loftet nået? Et ukendt antal (tællingen fejlede) er ALTID nået. */
export function loftetNaaet(antalIp: number | null, antalIAlt: number | null): boolean {
  if (antalIp === null || antalIAlt === null) return true;
  return antalIp >= SPOR_PR_IP_PR_TIME || antalIAlt >= SPOR_PR_TIME_I_ALT;
}
