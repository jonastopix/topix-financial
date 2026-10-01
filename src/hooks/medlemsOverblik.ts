/**
 * src/hooks/medlemsOverblik.ts — datalaget til forsidens «Mangler at booke»
 * (29/9-2026; RaadgiverForsideView → ManglerAtBooke). Én hentning for ALLE
 * virksomheder, ikke én pr. række; reglerne bor i lib/medlemsOverblik.ts
 * (sessionStatus, byggOverblik, manglerAtBooke) — her hentes der kun.
 *
 * OPRYDNINGEN 29/9 (statusmailen droppet): hooken hentede 13 kilder + det
 * nyeste login pr. bruger til aktiviteten og mærke-dommen på /virksomheder og i
 * mailen. Begge er væk; «Mangler at booke» læser kun sessionerne, medlem-siden
 * og navnet — derfor hentes nu KUN companies, company_members og
 * session_bookings (amount_dkk 0). N og M er bevist uændrede på et fast
 * datasæt med alle de gamle kilder (__tests__/manglerAtBookeUaendret.test.ts).
 *
 * Egen nøgle, så en fejl her lader resten af forsiden stå (blokken siger det
 * med raadgiverHentefejlTekst).
 *
 * ALDRIG ET TAVST LOFT: hver kilde hentes side for side (hentAlleSider,
 * lib/budgetEngine — prod-beviset 24/8) med stabil orden, hver side gennem
 * kraevRaekker, så en fejl på side 2 kaster med kildens navn.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { hentAlleSider } from "@/lib/budgetEngine";
import { byggOverblik, type OverbliksKilder, type OverbliksRaekke } from "@/lib/medlemsOverblik";

// Typen re-eksporteres, så fladen kan importere den herfra.
export type { OverbliksRaekke };

export const MEDLEMS_OVERBLIK_QUERY_KEY = ["medlems-overblik"] as const;

type Svar<T> = { data: T[] | null; error: { message: string } | null };
/** Hver side gennem kraevRaekker: fejlen bærer kildens navn. */
const side = <T,>(kilde: string) => (res: Svar<T>) => ({ data: kraevRaekker(res, kilde), error: null });

export async function hentMedlemsOverblik(): Promise<Map<string, OverbliksRaekke>> {
  const nu = new Date();
  type Booking = OverbliksKilder["bookinger"][number] & { amount_dkk: number };
  const [companies, medlemmer, bookinger] = await Promise.all([
    // jonas_session_tilbudt_at (1/10, migration 20261001110000): skal være KØRT og MÅLT i prod før Update — ellers 42703 her.
    // .returns<…>(): kolonnen står ikke i types.ts, før Lovable regenererer den efter migrationen.
    // is_demo med: universfiltret i byggOverblik udelukker demo-virksomheden. name: forsidens navne, samme kolonne som /virksomheder.
    hentAlleSider<OverbliksKilder["companies"][number]>((fra, til) =>
      supabase.from("companies").select("id, name, status, is_legat, er_kunde, is_demo, intro_session_used_at, jonas_session_used_at, jonas_session_tilbudt_at").returns<OverbliksKilder["companies"][number][]>().order("id").range(fra, til).then(side("companies"))),
    hentAlleSider<OverbliksKilder["medlemmer"][number]>((fra, til) =>
      supabase.from("company_members").select("company_id, user_id, created_at").order("created_at", { ascending: true }).order("id").range(fra, til).then(side("company_members"))),
    hentAlleSider<Booking>((fra, til) =>
      supabase.from("session_bookings").select("company_id, advisor, amount_dkk, status, start_tid, slut_tid, created_at").eq("amount_dkk", 0).order("created_at").order("id").range(fra, til).then(side("session_bookings"))),
  ]);

  // Sammenkoblingen er motorens (byggOverblik) — ingen join her.
  return byggOverblik({ companies, medlemmer, bookinger }, nu);
}

export function useMedlemsOverblik(enabled: boolean) {
  return useQuery({
    queryKey: MEDLEMS_OVERBLIK_QUERY_KEY,
    queryFn: hentMedlemsOverblik,
    enabled,
    staleTime: 2 * 60_000,
  });
}
