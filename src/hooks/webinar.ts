/**
 * Webinaret — I/O for eWebinar-tilmeldingerne (udkast 19/9-2026). Hook = I/O,
 * lib = dom (raadgiverOpgaver-mønstret): dommene (webinarLinje, webinarModSvar,
 * webinarTal) bor i src/lib/webinarDom.ts.
 *
 * Tabellerne (migration 20260919130000) skrives KUN af ewebinar-webhook
 * (service role); rådgivere har SELECT. `as any` som hooks/ansoegninger.ts,
 * indtil de genererede typer kender tabellerne.
 *
 * To hentninger: pr. mail (koblingen til ansøgningerne — ét opslag for hele
 * listen, fail-soft: fejler det, står ansøgningerne stadig, uden webinar-
 * linjen) og alle (tallet — kaster gennem kraevRaekker, for et tomt svar ville
 * være en løgn).
 */
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import type { WebinarTilmelding } from "@/lib/webinarDom";

/* eslint-disable @typescript-eslint/no-explicit-any */
const tabel = (navn: string) => supabase.from(navn as any) as any;

export const WEBINAR_TILMELDINGER_KEY = ["webinar-tilmeldinger"] as const;

export const TILMELDING_KOLONNER =
  "ewebinar_id, email, navn, webinar_id, webinar_titel, session_tid, session_type, registreret_at, state, sidste_action, attended, subscribed, set_procent, set_procent_kilde, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, origin, first_origin, referrer, first_referrer, widget_source, by, land, enhed, tidszone";

/** numeric kommer som streng fra PostgREST — tallet skal være et tal for dommen. */
function somRaekke(r: Record<string, unknown>): WebinarTilmelding {
  const p = r.set_procent;
  return { ...(r as unknown as WebinarTilmelding), set_procent: p === null || p === undefined ? null : Number(p) };
}

/** Alle tilmeldinger (til tallet). Kaster ved fejl. */
export async function hentWebinarTilmeldinger(): Promise<WebinarTilmelding[]> {
  const res = await tabel("webinar_tilmeldinger").select(TILMELDING_KOLONNER).order("session_tid", { ascending: false, nullsFirst: false }).limit(5000);
  return (kraevRaekker(res, "webinar_tilmeldinger") as Record<string, unknown>[]).map(somRaekke);
}

/**
 * Tilmeldinger pr. mail for en liste af mails (ansøgningerne) — ét opslag,
 * fail-soft: ved fejl logges den, og alle får en tom liste. Mails
 * normaliseres som webhooken (trim + små bogstaver).
 */
export async function hentWebinarTilmeldingerForEmails(emails: readonly (string | null | undefined)[]): Promise<Map<string, WebinarTilmelding[]>> {
  const kort = new Map<string, WebinarTilmelding[]>();
  const unikke = [...new Set(emails.map((e) => (e ?? "").trim().toLowerCase()).filter((e) => e !== ""))];
  if (unikke.length === 0) return kort;
  const res = await tabel("webinar_tilmeldinger").select(TILMELDING_KOLONNER).in("email", unikke).limit(5000);
  if (res.error) {
    console.error("[webinar] opslag på webinar_tilmeldinger fejlede:", res.error.message);
    return kort;
  }
  for (const raa of (res.data ?? []) as Record<string, unknown>[]) {
    const r = somRaekke(raa);
    kort.set(r.email, [...(kort.get(r.email) ?? []), r]);
  }
  return kort;
}
