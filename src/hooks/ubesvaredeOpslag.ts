/**
 * src/hooks/ubesvaredeOpslag.ts
 *
 * Hentningen bag forsidekortet «Ubesvarede opslag» (Jonas 16/9, valg B).
 * De rene dele — dommen, udsnittet, teksterne — bor i
 * src/lib/hjemmebane/ubesvaredeOpslag.ts. Mønstret er hooks/sidenSidst.ts:
 * én react-query-nøgle, egen hentning adskilt fra forsidens datalag, så en
 * fejl her ikke vælter dommen.
 *
 * TRE HENTNINGER, ÉN NØGLE: tråde fra de sidste 14 døgn (kun de kolonner
 * dommen læser), svar for netop de tråde (traad_id, forfatter_id, status)
 * og rådgiver-id'erne (get_all_advisor_profiles, som ProgressView) — plus
 * forfatternavnene fra profiles (rådgivere må læse alle, 20260223152943:45).
 * Alle fire går gennem kraevRaekker: en fejl bliver en HentningsFejl med
 * kildens navn, og kortet viser husets fejltekst — aldrig en tom liste der
 * ligner «alt besvaret». Kortet får data først når alt er hentet (én
 * query, Promise.all).
 *
 * INGEN SQL-ændring: læsningen er RLS'ens (advisors view all threads/
 * replies/profiles). Ingen invalidering af andre nøgler.
 */
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import {
  UBESVARET_VINDUE_MS,
  type UbesvaredeOpslagInput,
  type UbesvaretSvar,
  type UbesvaretTraad,
} from "@/lib/hjemmebane/ubesvaredeOpslag";

export const UBESVAREDE_OPSLAG_KEY = ["forside", "ubesvarede-opslag"] as const;

type TraadRaekke = Omit<UbesvaretTraad, "forfatter_navn">;

export async function hentUbesvaredeOpslag(nu: Date = new Date()): Promise<UbesvaredeOpslagInput> {
  const siden = new Date(nu.getTime() - UBESVARET_VINDUE_MS).toISOString();

  const [traadeRes, raadgivereRes] = await Promise.all([
    supabase
      .from("community_traade")
      .select("id, titel, forfatter_id, created_at, status, kilde_type")
      .eq("status", "aktiv")
      .gte("created_at", siden)
      .order("created_at", { ascending: false }),
    supabase.rpc("get_all_advisor_profiles"),
  ]);
  const traade = kraevRaekker(traadeRes, "community_traade") as TraadRaekke[];
  const raadgiverIds = (kraevRaekker(raadgivereRes, "get_all_advisor_profiles") as { user_id: string }[])
    .map((r) => r.user_id)
    .filter(Boolean);

  const traadIds = traade.map((t) => t.id);
  const forfatterIds = [...new Set(traade.map((t) => t.forfatter_id))];

  const [svarRes, profilRes] = await Promise.all([
    traadIds.length === 0
      ? Promise.resolve({ data: [] as UbesvaretSvar[], error: null })
      : supabase.from("community_svar").select("traad_id, forfatter_id, status").in("traad_id", traadIds),
    forfatterIds.length === 0
      ? Promise.resolve({ data: [] as { user_id: string; full_name: string | null }[], error: null })
      : supabase.from("profiles").select("user_id, full_name").in("user_id", forfatterIds),
  ]);
  const svar = kraevRaekker(svarRes, "community_svar") as UbesvaretSvar[];
  const profiler = kraevRaekker(profilRes, "profiles") as { user_id: string; full_name: string | null }[];
  const navnAf = new Map(profiler.map((p) => [p.user_id, p.full_name]));

  return {
    traade: traade.map((t) => ({ ...t, forfatter_navn: navnAf.get(t.forfatter_id) ?? null })),
    svar,
    raadgiverIds,
    nu,
  };
}
