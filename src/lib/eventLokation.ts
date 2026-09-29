/**
 * src/lib/eventLokation.ts — hvor et event holdes (29/9-2026, kort «Events har ingen lokation»).
 *
 * KILDEN: events.lokation (text, nullable; migration 20260929210000_event_lokation.sql). Et fysisk
 * event skal kunne sige hvor; før stod kun «Online», når der var et Meet-link (meet_url).
 *
 * `as any`: kolonnen står ikke i src/integrations/supabase/types.ts, før Lovable har regenereret
 * typerne efter migrationen — samme mønster som `.select("response" as any)` og `(data as any)?.response`
 * i src/lib/hjemmebane/akademiApi.ts (getMyEventResponse). Alle læsninger går gennem `eventLokation`,
 * så der kun er ÉT sted at fjerne castet, når typerne er regenereret.
 *
 * VISNINGSREGLEN (eventStedDele): online (Meet-link) → «Online»; lokation → selve adressen;
 * begge → begge, «Online» først; ingen → ingenting.
 */

/** Maks. tegn i editorfeltet. */
export const LOKATION_MAKS_TEGN = 200;

/** Lokationen, trimmet — eller null. Tom streng og blanktegn er «ingen lokation». */
export function eventLokation(event: unknown): string | null {
  const raa = (event as any)?.lokation;
  if (typeof raa !== "string") return null;
  const ren = raa.trim();
  return ren === "" ? null : ren;
}

/** Stedet som dele til meta-linjer: ["Online"?, lokation?]. Tom liste = intet at vise. */
export function eventStedDele(event: { meet_url?: string | null }): string[] {
  const dele: string[] = [];
  if (event.meet_url) dele.push("Online");
  const lokation = eventLokation(event);
  if (lokation) dele.push(lokation);
  return dele;
}

/** Editorens validering: null = gyldig, ellers fejlteksten. Tom er gyldig (feltet er valgfrit). */
export function validerLokation(lokation: string | null | undefined): string | null {
  if (!lokation) return null;
  if (lokation.trim().length > LOKATION_MAKS_TEGN) return `Lokationen må højst være ${LOKATION_MAKS_TEGN} tegn`;
  return null;
}
