/**
 * src/hooks/onlineMedlemmer.ts
 *
 * Rådgiveren lytter på den private Presence-kanal ONLINE_KANAL og slår
 * navn, billede og virksomhed op med sin egen RLS (16/9,
 * plan-online-realtime.md §2; migration 20260917100000_online_presence.sql:
 * SELECT-politikken «Raadgivere ser online-medlemmer»). De rene dele —
 * presence-state → id'er, dommen over hvem der vises, ordene — bor i
 * src/lib/hjemmebane/online.ts.
 *
 * TO DELE:
 *   useOnlineMedlemmer(aktiv)  — kanalen. private: true; INGEN track (rådgiveren
 *                                er ikke «online medlem» og har ingen INSERT-ret).
 *                                sync/join/leave → presenceState() → onlineIds.
 *                                status: henter (før første sync) · live
 *                                (SUBSCRIBED) · fejl (CHANNEL_ERROR, TIMED_OUT,
 *                                CLOSED) — fejl og tom er to beskeder.
 *                                Cleanup: removeChannel (unsubscribe sender leave).
 *   hentOnlineDom(ids)         — én hentning (react-query i fladen, nøglen bærer
 *                                id'erne): profiles (user_id, full_name,
 *                                avatar_url — «Advisors can view all profiles»),
 *                                company_members og companies for netop de
 *                                id'er, og rådgiver-id'erne
 *                                (get_all_advisor_profiles, som ubesvaredeOpslag).
 *                                Alle gennem kraevRaekker: en fejl bliver en
 *                                HentningsFejl med kildens navn, og fladen viser
 *                                husets fejltekst — aldrig «ingen online».
 *
 * INGEN SQL-ændring ud over de to Realtime-politikker; ingen debug-kode
 * (beviset laves i browserens Netværk → WS-rammer, se rapporten).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import {
  ONLINE_KANAL,
  onlineIds,
  type OnlineDomInput,
  type OnlineMedlemskab,
  type OnlineProfil,
  type OnlineStatus,
  type OnlineVirksomhed,
} from "@/lib/hjemmebane/online";

export interface OnlineKanal {
  status: OnlineStatus;
  /** Sorterede, unikke bruger-id'er fra presence-state (tom før første sync). */
  ids: string[];
}

export function useOnlineMedlemmer(aktiv: boolean): OnlineKanal {
  const [status, setStatus] = useState<OnlineStatus>("henter");
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (!aktiv) return;
    let levende = true;
    setStatus("henter");
    const channel = supabase.channel(ONLINE_KANAL, { config: { private: true } });
    const laesState = () => {
      if (levende) setIds(onlineIds(channel.presenceState()));
    };
    channel
      .on("presence", { event: "sync" }, laesState)
      .on("presence", { event: "join" }, laesState)
      .on("presence", { event: "leave" }, laesState)
      .subscribe((s) => {
        if (!levende) return;
        if (s === "SUBSCRIBED") setStatus("live");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("fejl");
      });
    return () => {
      levende = false;
      void supabase.removeChannel(channel);
    };
  }, [aktiv]);

  return { status, ids };
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
