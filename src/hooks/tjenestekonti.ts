/**
 * src/hooks/tjenestekonti.ts — hentningen bag tjenestekontiene (30/9-2026).
 * Dommene bor i src/lib/tjenestekonto.ts; her er kun Supabase-kaldene.
 *
 *   hentTjenestekonti()            — hele tabellen (user_id). Fejl → HentningsFejl
 *                                    «tjenestekonti» (kraevRaekker): en liste, der
 *                                    skulle være filtreret, vises hellere med
 *                                    husets fejltekst end med kontoen i.
 *   hentSynligeRaadgiverProfiler() — get_all_advisor_profiles UDEN tjenestekonti,
 *                                    de to kald parallelt. DEN vej til rådgiverne
 *                                    som personer (vælgere, «Dine rådgivere»).
 *   erTjenestekonto(userId)        — egen række; KASTER ved fejl, så useAuth kan
 *                                    falde tilbage på den normale logud-regel.
 *   useTjenestekonti()             — react-query om hentTjenestekonti.
 *
 * ÉN CACHE (30/9): hentTjenestekonti går gennem appens queryClient.fetchQuery
 * med TJENESTEKONTI_KEY og samme staleTime som useTjenestekonti — hver liste,
 * der filtrerer (Netværket, @-nævnelser, vælgerne …), deler ét opslag i ti
 * minutter i stedet for et kald hver. Klienten registreres af App.tsx
 * (brugTjenestekontiKlient); uden den (enhedstests) hentes direkte. Fejl caches
 * ikke — fetchQuery kaster, og næste kald prøver igen.
 *
 * Tabellen er ikke i de genererede typer endnu — deraf as any (samme mønster
 * som member_profiles i memberProfile.ts).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { synligeRaadgivere, tjenestekontoIds } from "@/lib/tjenestekonto";

export interface RaadgiverRaekke {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export const TJENESTEKONTI_KEY = ["tjenestekonti"] as const;
export const TJENESTEKONTI_STALE_MS = 10 * 60 * 1000;

let appensKlient: QueryClient | null = null;

/** Kaldes én gang af App.tsx med appens queryClient (se filhovedet «ÉN CACHE»). */
export function brugTjenestekontiKlient(klient: QueryClient): void {
  appensKlient = klient;
}

async function hentTjenestekontiDirekte(): Promise<Set<string>> {
  const res = await (supabase.from("tjenestekonti" as any).select("user_id") as any);
  return tjenestekontoIds(kraevRaekker(res, "tjenestekonti") as { user_id: string | null }[]);
}

export async function hentTjenestekonti(): Promise<Set<string>> {
  if (!appensKlient) return hentTjenestekontiDirekte();
  return appensKlient.fetchQuery({ queryKey: TJENESTEKONTI_KEY, queryFn: hentTjenestekontiDirekte, staleTime: TJENESTEKONTI_STALE_MS });
}

export async function hentSynligeRaadgiverProfiler(): Promise<RaadgiverRaekke[]> {
  const [raadgiverRes, tjenestekonti] = await Promise.all([
    supabase.rpc("get_all_advisor_profiles" as any) as any,
    hentTjenestekonti(),
  ]);
  return synligeRaadgivere(kraevRaekker(raadgiverRes, "get_all_advisor_profiles") as RaadgiverRaekke[], tjenestekonti);
}

export async function erTjenestekonto(userId: string): Promise<boolean> {
  const { data, error } = await (supabase.from("tjenestekonti" as any).select("user_id").eq("user_id", userId).maybeSingle() as any);
  if (error) throw new Error(`tjenestekonti: ${error.message}`);
  return !!data;
}

export function useTjenestekonti(enabled = true) {
  return useQuery({ queryKey: TJENESTEKONTI_KEY, queryFn: hentTjenestekontiDirekte, staleTime: TJENESTEKONTI_STALE_MS, enabled });
}
