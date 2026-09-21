/**
 * src/lib/hjemmebane/eventSvarApi.ts — rådgiverens svaroversigt på et event
 * (udkast 21/9-2026). KUN for rådgiver/admin: RPC'en get_event_svaroversigt
 * (migration 20260921210000) afviser selv alle uden has_role advisor, så
 * fladen kan ikke lokke tal ud af den. Medlemmernes deltagerliste er
 * listEventParticipants i akademiApi.ts (get_event_participants) og er
 * urørt — kildeværnet eventSvar.guard låser, at akademiApi.ts og
 * medlemskomponenterne aldrig kalder denne RPC.
 *
 * RPC'en er ikke i de genererede typer endnu — deraf as any-kaldet (samme
 * mønster som get_event_participants).
 */
import { supabase } from "@/integrations/supabase/client";
import { taelGrupper, type Svargruppe } from "@/lib/hjemmebane/eventSvar";

export interface SvarRaekke {
  gruppe: Svargruppe;
  user_id: string;
  full_name: string | null;
  company_name: string | null;
}

export interface Svaroversigt {
  raekker: SvarRaekke[];
  tal: Record<Svargruppe, number>;
}

/** Overskrifterne på fladen — ét sted. */
export const GRUPPE_ORD: Record<Svargruppe, string> = {
  tilmeldt: "Tilmeldt",
  kan_ikke: "Kan ikke",
  har_ikke_svaret: "Har ikke svaret",
};

export async function hentEventSvaroversigt(eventId: string): Promise<Svaroversigt> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase.rpc("get_event_svaroversigt" as any, { p_event_id: eventId });
  if (error) throw new Error(error.message);
  const raekker = ((data ?? []) as SvarRaekke[]).map((r) => ({
    gruppe: r.gruppe,
    user_id: r.user_id,
    full_name: r.full_name ?? null,
    company_name: r.company_name ?? null,
  }));
  return { raekker, tal: taelGrupper(raekker) };
}
