/**
 * opkald/api — rådgiverens flade-lag for /opkald (2/10-2026): læs
 * anmodningerne, og det ene klik «Markér som ringet».
 *
 * RLS: kun rådgivere kan læse tabellen (has_role advisor), og UPDATE er
 * afgrænset til ringet_at/ringet_af af triggeren opkald_raadgiver_kolonnevaern
 * (migration 20261002270000) — ringet_af SKAL være auth.uid(). Derfor sendes
 * rådgiverens eget id med; en anden værdi afvises af databasen (42501).
 * Nummeret vises HER og kun her — det går aldrig i en klokke, en mail, Klaviyo
 * eller en deling.
 *
 * Tabellen står ikke i types.ts, før Lovable har genereret typerne efter
 * migrationen — derfor `as any`, som nyhederApi.
 */
import { supabase } from "@/integrations/supabase/client";
import { type Anmodning, sorterAnmodninger } from "@/lib/opkald/dom";

export const OPKALD_QUERY_KEY = ["opkald", "anmodninger"] as const;

interface Raekke extends Omit<Anmodning, "session_tid"> {
  webinar_tilmeldinger: { session_tid: string | null; webinar_titel: string | null } | null;
}

/** Alle anmodninger (åbne først, nyeste øverst). PGRST205/42P01 = migrationen er ikke kørt endnu. */
export async function hentAnmodninger(): Promise<Anmodning[]> {
  const { data, error } = await (supabase as any)
    .from("opkaldsanmodninger")
    .select("id, navn, telefon, samtykke_at, oprettet_at, ringet_at, ringet_af, webinar_tilmeldinger(session_tid, webinar_titel)")
    .order("oprettet_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const liste = ((data ?? []) as Raekke[]).map((r) => ({
    id: r.id,
    navn: r.navn,
    telefon: r.telefon,
    samtykke_at: r.samtykke_at,
    oprettet_at: r.oprettet_at,
    ringet_at: r.ringet_at,
    ringet_af: r.ringet_af,
    session_tid: r.webinar_tilmeldinger?.session_tid ?? null,
  }));
  return sorterAnmodninger(liste);
}

/** «Markér som ringet» — guardet på, at den stadig er åben (en allerede ringet række rammer nul). */
export async function markerRinget(id: string, raadgiverId: string): Promise<void> {
  const { data, error } = await (supabase as any)
    .from("opkaldsanmodninger")
    .update({ ringet_at: new Date().toISOString(), ringet_af: raadgiverId })
    .eq("id", id)
    .is("ringet_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Anmodningen er allerede markeret som ringet.");
}

/** Fortryd (samme kolonner, den anden vej) — hvis man ramte den forkerte. */
export async function fortrydRinget(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("opkaldsanmodninger")
    .update({ ringet_at: null, ringet_af: null })
    .eq("id", id)
    .not("ringet_at", "is", null);
  if (error) throw new Error(error.message);
}
