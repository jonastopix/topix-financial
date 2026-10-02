/**
 * src/hooks/maalPladsdom.ts — måler, hvilken regel databasen tæller pladserne
 * på Dine mål efter (lib/hjemmebane/maalPladsdom.ts; migration 20261002220000).
 *
 * Ét RPC-kald, maal_pladser_kun_bekraeftede(), cachet i fem minutter: svaret
 * ændrer sig kun, når en migration køres. PGRST202 («Could not find the
 * function» — migrationen ikke kørt) og ENHVER anden fejl dømmes «alle»
 * (laesPladsdom) — aldrig kastet: pladsdommen er et ord i hovedlinjen, ikke
 * en forudsætning for siden. Hvorfor «alle» er den sikre side står i lib'en.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { laesPladsdom, PLADSDOM_RPC, type Pladsdom } from "@/lib/hjemmebane/maalPladsdom";

export const PLADSDOM_KEY = ["maal", "pladsdom"] as const;
export const PLADSDOM_STALE_MS = 5 * 60_000;

/** Reglen, målt i databasen — «alle», indtil migrationen er kørt (eller ved fejl). Kaster aldrig. */
export async function hentMaalPladsdom(): Promise<Pladsdom> {
  try {
    // RPC'en står ikke i de genererede typer før migrationen — derfor `as any` (sidenSidst-mønstret).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)(PLADSDOM_RPC);
    if (error && error.code !== "PGRST202") console.warn("[maalPladsdom] RPC fejlede — dømmer «alle»:", error);
    return laesPladsdom(data, error);
  } catch (fejl) {
    console.warn("[maalPladsdom] RPC kastede — dømmer «alle»:", fejl);
    return "alle";
  }
}

/** Reglen som hook; «alle» mens den henter (den gamle, konservative tekst). */
export function useMaalPladsdom(): Pladsdom {
  const q = useQuery({ queryKey: PLADSDOM_KEY, queryFn: hentMaalPladsdom, staleTime: PLADSDOM_STALE_MS, retry: false });
  return q.data ?? "alle";
}
