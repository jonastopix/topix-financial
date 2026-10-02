/**
 * src/hooks/communityAdgang.ts — er den indloggede en GÆST i Community?
 * (lib/hjemmebane/communityAdgang.ts; migration 20261002242000; Jonas 14/9:
 * «En gæst ser Community, men skriver ikke»).
 *
 * Læser egen virksomheds fem felter (vis_i_netvaerk, is_legat,
 * contract_end_date, is_demo, data_slettet_at) gennem medlemmets eksisterende
 * SELECT på companies — samme række, useAuth allerede henter tier af.
 *
 * KUN DEN AKTIVE VIRKSOMHED (bevidst, docs/adgangsdomme.md §7): SQL-dommen ser
 * ALLE brugerens medlemskaber, men medlemmets SELECT på companies er
 * «Members can view own company» (id = user_company_id(auth.uid()), LIMIT 1) —
 * klienten kan ikke læse de andre rækker. En bruger i BÅDE en gæste- og en
 * medlemsvirksomhed dømmes derfor efter den aktive. Rådgiveren er aldrig gæst
 * (ingen virksomhed, eller has_role bærer alt); uden companyId er svaret
 * false (som i dag).
 *
 * UDFALD (GaestDom): null mens den henter (composeren og grænsen vises
 * ikke); true = gæst; false = som i dag. En FEJL i hentningen er false — den
 * gamle adfærd (gæsten ser composeren og får databasens afvisning) er den
 * mindst skadelige af de to fejl: det modsatte ville tage composeren fra et
 * fuldt medlem.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { erCommunityGaest, type GaestDom, type VirksomhedTilCommunity } from "@/lib/hjemmebane/communityAdgang";

export const COMMUNITY_GAEST_KEY = (companyId: string | null) => ["community", "gaest", companyId] as const;
export const COMMUNITY_GAEST_FELTER = "vis_i_netvaerk, is_legat, contract_end_date, is_demo, data_slettet_at";

/** Egen virksomheds gæstedom — kaster aldrig (fejl → false, se filhovedet). */
export async function hentCommunityGaest(companyId: string): Promise<boolean> {
  const { data, error } = await supabase.from("companies").select(COMMUNITY_GAEST_FELTER).eq("id", companyId).maybeSingle();
  if (error) {
    console.warn("[communityAdgang] gæstedommen kunne ikke hentes — dømmer «ikke gæst» (som i dag):", error);
    return false;
  }
  if (!data) return false;
  const v = data as unknown as VirksomhedTilCommunity;
  return erCommunityGaest({
    vis_i_netvaerk: v.vis_i_netvaerk ?? null,
    is_legat: v.is_legat === true,
    contract_end_date: v.contract_end_date ?? null,
    is_demo: v.is_demo ?? null,
    data_slettet_at: v.data_slettet_at ?? null,
  });
}

export function useCommunityGaest(): GaestDom {
  const { isAdvisor, companyId, companyResolution } = useAuth();
  const aktiv = !isAdvisor && Boolean(companyId);
  const q = useQuery({
    queryKey: COMMUNITY_GAEST_KEY(companyId),
    queryFn: () => hentCommunityGaest(companyId as string),
    enabled: aktiv,
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (isAdvisor) return false;
  // Virksomhedsopslaget kører endnu (companyId er null, ikke «ingen»): ukendt — så composeren ikke
  // blinker frem for en gæst, før hendes virksomhed er kendt. «none»/«failed» = som i dag.
  if (!companyId) return companyResolution === "pending" ? null : false;
  return q.data ?? null;
}
