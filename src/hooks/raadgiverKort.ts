/**
 * src/hooks/raadgiverKort.ts — data til forsidens «Din rådgiver»-kort
 * (2/10-2026 eftermiddag). Ordene og tiden bor i lib/hjemmebane/raadgiverKort.ts.
 *
 * TRE LÆSNINGER, INGEN SKRIVNING, INGEN LÆSEMARKERING:
 *   1. Samtalen: medlemmets virksomhedssamtale som MemberChatPane vælger den
 *      (company-scoped, nyeste last_message_at først — panelets auto-valg).
 *   2. Den seneste menneskelige besked i den (message_type «user»).
 *   3. Afsenderens navn: get_conversation_sender_profiles (samme RPC som
 *      panelet og banneret «har lige skrevet til dig») — fail-soft: uden navn
 *      står «Rådgiver»/«Medlem».
 * Rådgivernes fornavne til pladsholderen kommer fra hentSynligeRaadgiverProfiler
 * (tjenestekontoen filtreret fra — tjenestekonto.guard) — fail-soft: «dine
 * rådgivere». assigned_advisor_id læses ALDRIG (ingen tildeling, 1/10).
 *
 * FEJL ER IKKE TOM: fejler samtale- eller beskedopslaget, KASTER queryFn, og
 * kortet siger det — en fejlet hentning må ikke ligne «Skriv din første
 * besked» (kraevRaekker-ånden).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hentSynligeRaadgiverProfiler } from "@/hooks/tjenestekonti";
import type { AfsenderProfil } from "@/lib/hjemmebane/raadgiverKort";

export const RAADGIVER_KORT_KEY = ["forside", "raadgiver-kort"] as const;

export interface SenesteBesked {
  id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
}

export interface RaadgiverKortData {
  /** null = medlemmet har ingen samtale endnu. */
  samtaleId: string | null;
  /** null = ingen menneskelige beskeder endnu. */
  seneste: SenesteBesked | null;
  profiler: AfsenderProfil[];
}

export function raadgiverKortKey(companyId: string | null | undefined, userId: string | null | undefined) {
  return [...RAADGIVER_KORT_KEY, companyId ?? null, userId ?? null] as const;
}

export function useRaadgiverKort(companyId: string | null | undefined, userId: string | null | undefined, aktiv: boolean) {
  const kort = useQuery<RaadgiverKortData>({
    queryKey: raadgiverKortKey(companyId, userId),
    enabled: aktiv && !!companyId && !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const samtaleRes = await supabase
        .from("conversations")
        .select("id")
        .eq("company_id", companyId!)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (samtaleRes.error) throw new Error(`conversations: ${samtaleRes.error.message}`);
      const samtaleId = (samtaleRes.data as { id: string } | null)?.id ?? null;
      if (!samtaleId) return { samtaleId: null, seneste: null, profiler: [] };

      const beskedRes = await supabase
        .from("messages")
        .select("id, sender_id, content, created_at")
        .eq("conversation_id", samtaleId)
        .eq("message_type", "user")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (beskedRes.error) throw new Error(`messages: ${beskedRes.error.message}`);
      const seneste = (beskedRes.data as SenesteBesked | null) ?? null;

      let profiler: AfsenderProfil[] = [];
      if (seneste && seneste.sender_id !== userId) {
        try {
          const { data, error } = await supabase.rpc("get_conversation_sender_profiles" as never, { _conversation_id: samtaleId } as never);
          if (!error) profiler = (data as unknown as AfsenderProfil[] | null) ?? [];
        } catch {
          // Fail-soft: navnet falder tilbage (afsenderNavn).
        }
      }
      return { samtaleId, seneste, profiler };
    },
  });

  const raadgivere = useQuery<string[]>({
    queryKey: [...RAADGIVER_KORT_KEY, "raadgivere"],
    enabled: aktiv,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      try {
        return (await hentSynligeRaadgiverProfiler()).map((r) => r.full_name ?? "").filter(Boolean);
      } catch {
        return [];
      }
    },
  });

  return { kort, raadgiverNavne: raadgivere.data ?? [] };
}
