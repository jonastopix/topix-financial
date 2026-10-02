/**
 * src/hooks/raadgiverKort.ts — data til forsidens «Din rådgiver»-kort
 * (2/10-2026 eftermiddag). Ordene og tiden bor i lib/hjemmebane/raadgiverKort.ts.
 *
 * TRE LÆSNINGER, INGEN SKRIVNING, INGEN LÆSEMARKERING:
 *   1. Rådgiverne: hentSynligeRaadgiverProfiler (tjenestekontoen filtreret fra
 *      — tjenestekonto.guard) — navne, portrætter, og HVEM der er rådgiver.
 *   2. Samtalen: medlemmets virksomhedssamtale som MemberChatPane vælger den
 *      (company-scoped, nyeste last_message_at først — panelets auto-valg).
 *   3. De seneste menneskelige beskeder i den (message_type «user»); kortet
 *      viser den nyeste fra en rådgiver (forside v3, nedenfor).
 * assigned_advisor_id læses ALDRIG (ingen tildeling, 1/10).
 *
 * FEJL ER IKKE TOM: fejler samtale- eller beskedopslaget, KASTER queryFn, og
 * kortet siger det — en fejlet hentning må ikke ligne «Skriv din første
 * besked» (kraevRaekker-ånden).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hentSynligeRaadgiverProfiler } from "@/hooks/tjenestekonti";
import { senesteFraRaadgiver, type KortBesked, type RaadgiverProfil } from "@/lib/hjemmebane/raadgiverKort";

export const RAADGIVER_KORT_KEY = ["forside", "raadgiver-kort"] as const;

export type SenesteBesked = KortBesked;

export interface RaadgiverKortData {
  /** null = medlemmet har ingen samtale endnu. */
  samtaleId: string | null;
  /** Den seneste besked FRA EN RÅDGIVER (forside v3) — null = ingen endnu. */
  seneste: SenesteBesked | null;
  /** De synlige rådgivere (navn + portræt) — ansigterne i kortets top. */
  raadgivere: RaadgiverProfil[];
}

export function raadgiverKortKey(companyId: string | null | undefined, userId: string | null | undefined) {
  return [...RAADGIVER_KORT_KEY, companyId ?? null, userId ?? null] as const;
}

/** Så mange beskeder læses for at finde den seneste fra en rådgiver (en lang tråd fra medlemmet skubber den ned). */
export const BESKEDER_LAEST = 50;

/**
 * FORSIDE V3 (2/10-2026 aften, docs/forside-v3.md §5): kortet viser den seneste besked FRA EN RÅDGIVER —
 * aldrig medlemmets egen. Rådgiverne er den synlige rådgiverliste (hentSynligeRaadgiverProfiler —
 * tjenestekontoen filtreret fra), hentet i SAMME queryFn: fejler den, KASTER hentningen (fail-closed — uden
 * listen kan vi ikke vide, hvem der er rådgiver, og kortet siger fejlen). De seneste BESKEDER_LAEST
 * menneskelige beskeder læses; den nyeste fra en på listen vælges (senesteFraRaadgiver, ren).
 */
export function useRaadgiverKort(companyId: string | null | undefined, userId: string | null | undefined, aktiv: boolean) {
  const kort = useQuery<RaadgiverKortData>({
    queryKey: raadgiverKortKey(companyId, userId),
    enabled: aktiv && !!companyId && !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const raadgivere: RaadgiverProfil[] = (await hentSynligeRaadgiverProfiler()).map((r) => ({
        user_id: r.user_id,
        full_name: r.full_name ?? null,
        avatar_url: (r as { avatar_url?: string | null }).avatar_url ?? null,
      }));
      const samtaleRes = await supabase
        .from("conversations")
        .select("id")
        .eq("company_id", companyId!)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (samtaleRes.error) throw new Error(`conversations: ${samtaleRes.error.message}`);
      const samtaleId = (samtaleRes.data as { id: string } | null)?.id ?? null;
      if (!samtaleId) return { samtaleId: null, seneste: null, raadgivere };

      const beskedRes = await supabase
        .from("messages")
        .select("id, sender_id, content, created_at, context_meta")
        .eq("conversation_id", samtaleId)
        .eq("message_type", "user")
        .order("created_at", { ascending: false })
        .limit(BESKEDER_LAEST);
      if (beskedRes.error) throw new Error(`messages: ${beskedRes.error.message}`);
      const seneste = senesteFraRaadgiver((beskedRes.data as unknown as SenesteBesked[] | null) ?? [], raadgivere);
      return { samtaleId, seneste, raadgivere };
    },
  });

  return { kort, raadgiverNavne: (kort.data?.raadgivere ?? []).map((r) => r.full_name ?? "").filter(Boolean) };
}
