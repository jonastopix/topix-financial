/**
 * src/hooks/onlineMedlemmer.ts
 *
 * Rådgiveren henter friske HJERTESLAG og slår navn, billede og virksomhed op
 * med sin egen RLS (30/9-2026; migration 20260930120000_online_hjerteslag.sql:
 * SELECT-politikken «Raadgivere ser hjerteslag»; modellen og regnestykket i
 * src/lib/hjemmebane/online.ts). Erstatter lytningen på Presence-kanalen fra
 * 16/9 — ingen realtime-kanal tilbage.
 *
 * TO DELE:
 *   useOnlineMedlemmer(aktiv)  — react-query over hentOnlineIds:
 *                                online_hjerteslag_friske(ONLINE_VINDUE_S)
 *                                (serverens ur) → onlineIds. Genhentes hvert
 *                                ONLINE_GENHENT_MS og ved fokus.
 *                                status: henter (før første svar) · live
 *                                (svar) · fejl (hentningen fejlede — også en
 *                                genhentning: et gammelt svar må ikke stå som
 *                                «nu») — fejl og tom er to beskeder.
 *   hentOnlineDom(ids)         — én hentning (react-query i fladen, nøglen bærer
 *                                id'erne): profiles (user_id, full_name,
 *                                avatar_url — «Advisors can view all profiles»),
 *                                company_members og companies for netop de
 *                                id'er, og rådgiver-id'erne
 *                                (get_all_advisor_profiles, som ubesvaredeOpslag).
 *                                Alle gennem kraevRaekker: en fejl bliver en
 *                                HentningsFejl med kildens navn, og fladen viser
 *                                husets fejltekst — aldrig «ingen online».
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import {
  ONLINE_FRISKE_FUNKTION,
  ONLINE_GENHENT_MS,
  ONLINE_TABEL,
  ONLINE_VINDUE_S,
  onlineIds,
  type OnlineDomInput,
  type OnlineMedlemskab,
  type OnlineProfil,
  type OnlineStatus,
  type OnlineVirksomhed,
} from "@/lib/hjemmebane/online";

export interface OnlineKanal {
  status: OnlineStatus;
  /** Sorterede, unikke bruger-id'er med friske hjerteslag (tom før første svar). */
  ids: string[];
}

export const ONLINE_IDS_KEY = ["forside", "online-hjerteslag"] as const;

type FriskeSvar = { data: { user_id: unknown }[] | null; error: { message: string } | null };

/** Friske hjerteslag, målt mod serverens ur (SECURITY INVOKER — RLS afgør). */
export async function hentOnlineIds(): Promise<string[]> {
  const res = (await supabase.rpc(ONLINE_FRISKE_FUNKTION as never, { vindue_sekunder: ONLINE_VINDUE_S } as never)) as unknown as FriskeSvar;
  return onlineIds(kraevRaekker(res, ONLINE_TABEL));
}

export function useOnlineMedlemmer(aktiv: boolean): OnlineKanal {
  const q = useQuery({
    queryKey: ONLINE_IDS_KEY,
    queryFn: hentOnlineIds,
    enabled: aktiv,
    refetchInterval: ONLINE_GENHENT_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
    // Feltet blinker ikke: mellem to hentninger står det forrige svar.
    placeholderData: keepPreviousData,
  });
  const status: OnlineStatus = q.isError ? "fejl" : q.data ? "live" : "henter";
  return { status, ids: q.data ?? [] };
}

/** Nøglen bærer id'erne, så en ny online giver ét nyt opslag — og intet når ingen er online. */
export const ONLINE_DOM_KEY = (ids: readonly string[]) => ["forside", "online-medlemmer", ids.join(",")] as const;

export async function hentOnlineDom(ids: readonly string[]): Promise<Omit<OnlineDomInput, "ids">> {
  if (ids.length === 0) return { profiler: [], medlemskaber: [], virksomheder: [], raadgiverIds: [] };
  const liste = [...ids];
  const [profilRes, medlemRes, raadgivereRes] = await Promise.all([
    supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", liste),
    supabase.from("company_members").select("user_id, company_id").in("user_id", liste),
    supabase.rpc("get_all_advisor_profiles"),
  ]);
  const profiler = kraevRaekker(profilRes, "profiles") as OnlineProfil[];
  const medlemskaber = kraevRaekker(medlemRes, "company_members") as OnlineMedlemskab[];
  const raadgiverIds = (kraevRaekker(raadgivereRes, "get_all_advisor_profiles") as { user_id: string }[])
    .map((r) => r.user_id)
    .filter(Boolean);

  const companyIds = [...new Set(medlemskaber.map((m) => m.company_id))];
  const virksomhedRes =
    companyIds.length === 0
      ? { data: [] as OnlineVirksomhed[], error: null }
      : await supabase.from("companies").select("id, name, is_legat, er_kunde").in("id", companyIds);
  const virksomheder = kraevRaekker(virksomhedRes, "companies") as OnlineVirksomhed[];

  return { profiler, medlemskaber, virksomheder, raadgiverIds };
}
