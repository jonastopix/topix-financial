/**
 * src/hooks/netvaerketsRaekker.ts — Netværkets rækker som ÉN delt query (2/10-2026).
 *
 * `useNetvaerketsRaekker()` er get_member_directory gennem listMemberDirectory
 * (tjenestekonti filtreret dér, src/lib/tjenestekonto.ts) under nøglen
 * NETVAERK_KEY = ["member-directory"] med samme staleTime som /medlemmer og
 * medlemssporet i Community (CommunityMedlemmer) — cachen deles, intet nyt
 * kald. Community-feedet læser rækkerne til to ting: hvem der er rådgiver
 * (is_advisor → «ubesvaret»-dommen, communitySpoergsmaal.ts) og hvem der har
 * skrevet «Spørg mig om» (ask_me_about → «Hvem kan hjælpe med …»,
 * communityHjaelpere.ts).
 *
 * HVORFOR EN HOOK OG IKKE EN IMPORT I CommunityView: praesentationPladsholder.guard
 * dom 3 forbyder CommunityView at importere fra lib/hjemmebane/memberProfile —
 * præsentationsvejen må ikke læse PROFILEN (getMyMemberProfile) for at
 * forudfylde composeren (Jonas 16/9). Kataloget er ikke profilen, men værnet
 * dømmer på import-stien; hooken holder grænsen synlig: CommunityView får
 * rækkerne, aldrig egen profil.
 */
import { useQuery } from "@tanstack/react-query";
import { listMemberDirectory } from "@/lib/hjemmebane/memberProfile";

export const NETVAERK_KEY = ["member-directory"] as const;
export const NETVAERK_STALE_MS = 5 * 60_000;

export function useNetvaerketsRaekker() {
  return useQuery({
    queryKey: NETVAERK_KEY,
    queryFn: listMemberDirectory,
    staleTime: NETVAERK_STALE_MS,
  });
}
