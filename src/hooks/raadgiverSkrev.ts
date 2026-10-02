/**
 * src/hooks/raadgiverSkrev.ts
 *
 * Medlemmet ser, at en rådgiver lige har skrevet (Jonas 1/10). Modellen og
 * dommen står i src/lib/hjemmebane/raadgiverSkrev.ts; banneret i
 * components/hjemmebane/HbRaadgiverSkrev.tsx.
 *
 * KANALEN: samme mekanisme som MemberChatPane (Supabase Realtime
 * postgres_changes, event INSERT på public.messages; RLS afgør hvad
 * medlemmet modtager), filtreret til medlemmets egne samtaler
 * (samtaleFilter → conversation_id=in.(…)). Samtalerne hentes med
 * medlemmets egen RLS (conversations: id) — ingen ny tabel, intet skrives,
 * INTET markeres læst (ingen mark_messages_read her; læst sker først, når
 * medlemmet åbner chatten). Afsenderen slås op med
 * get_conversation_sender_profiles (samme RPC som MemberChatPane; den bærer
 * is_advisor). Fail-soft: en fejl giver intet banner, aldrig en fejltekst —
 * banneret er en høflighed, chatten og klokken er stadig vejen.
 *
 * Gaten (aktiv) gives af skallen: !!user && !isAdvisor (RÅ isAdvisor, som
 * hjerteslaget) — en rådgiver, også i «Se som medlem», og tjenestekontoen
 * (en rådgiverkonto) monterer aldrig lytningen.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BANNER_VARIGHED_MS,
  beskedUddrag,
  bannerTitel,
  erKandidat,
  samtaleFilter,
  skalViseBanner,
  staarIChatten,
  type NyBesked,
} from "@/lib/hjemmebane/raadgiverSkrev";

export interface RaadgiverBanner {
  beskedId: string;
  titel: string;
  uddrag: string;
}

type AfsenderRaekke = { user_id: string; full_name: string | null; is_advisor: boolean | null };

export function useRaadgiverSkrev(aktiv: boolean, userId: string | undefined, sti: string) {
  const [banner, setBanner] = useState<RaadgiverBanner | null>(null);
  const vist = useRef(new Set<string>());
  // Stien læses i callbacken gennem en ref, så kanalen ikke genopbygges ved
  // hver navigation inden for skallen.
  const stiRef = useRef(sti);
  stiRef.current = sti;

  const samtaler = useQuery({
    queryKey: ["raadgiver-skrev", "samtaler", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations").select("id");
      if (error) throw error;
      return (data ?? []).map((r: { id: string }) => r.id);
    },
    enabled: aktiv && !!userId,
    staleTime: 5 * 60_000,
  });
  const filter = samtaleFilter(samtaler.data ?? []);

  useEffect(() => {
    if (!aktiv || !userId || !filter) return;
    let afmonteret = false;
    const kanal = supabase
      .channel(`raadgiver-skrev-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter },
        async (payload) => {
          try {
            const ny = payload.new as NyBesked & { conversation_id: string };
            if (!ny?.id || vist.current.has(ny.id) || !erKandidat(ny, userId)) return;
            const { data } = await supabase.rpc("get_conversation_sender_profiles" as never, { _conversation_id: ny.conversation_id } as never);
            const afsender = ((data as unknown as AfsenderRaekke[] | null) ?? []).find((p) => p.user_id === ny.sender_id);
            const erRaadgiver = afsender ? afsender.is_advisor === true : null;
            if (afmonteret || !skalViseBanner({ besked: ny, egenId: userId, afsenderErRaadgiver: erRaadgiver, sti: stiRef.current })) return;
            vist.current.add(ny.id);
            setBanner({ beskedId: ny.id, titel: bannerTitel(afsender?.full_name), uddrag: beskedUddrag(ny.content) });
          } catch {
            // Fail-soft: intet banner.
          }
        },
      )
      .subscribe();
    return () => {
      afmonteret = true;
      supabase.removeChannel(kanal);
    };
  }, [aktiv, userId, filter]);

  // Banneret går af sig selv efter BANNER_VARIGHED_MS.
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), BANNER_VARIGHED_MS);
    return () => window.clearTimeout(t);
  }, [banner]);

  // Går medlemmet ind i chatten, forsvinder banneret.
  useEffect(() => {
    if (banner && staarIChatten(sti)) {
      setBanner(null);
    }
  }, [sti, banner]);

  const luk = useCallback(() => setBanner(null), []);
  return { banner, luk };
}
