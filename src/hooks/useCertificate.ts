/**
 * useCertificate — alt, «Dit certifikat» (29/9-2026) skal vide, i ÉT opslag pr.
 * session: startdato og flag fra companies, hentningstallet fra
 * certificate_downloads, portrættet fra deling-portraetter (signeret URL — den
 * private bucket, «Fortæl det videre» også bruger; CORS målt 29/9: «*»), ellers
 * profiles.avatar_url. Dommen (lib/certifikat/dom.ts) regnes med `nu` = nu.
 *
 * Skallen kalder hooken på hver medlemsside for menupunktet, siden for alt —
 * samme cache-nøgle, så det er ét kald, ikke to. Hentningen er kun tændt for
 * fulde medlemmer med en virksomhed; for alle andre er dommen skjult uden et
 * kald (rådgivere, abonnenter, legat, udløbne — HANDOFF §3).
 *
 * FEJL SKJULER IKKE: en fejlet hentning giver `fejl` (siden viser en linje,
 * menuen intet punkt) — aldrig en tavs «ikke berettiget». Portrættet er
 * fail-soft (uden det falder vi til avataren, som DelingView); tælling og
 * flag er ikke (kraevRaekker-ånden: tom og fejlet må ikke ligne hinanden).
 *
 * Kolonnerne certificate_eligible og certificate_downloads er ikke i de
 * genererede typer, før Lovable har kørt migration 20260929190000 — derfor
 * `as any`, som useDelingHentet.ts. Fladen når ikke Update, før kolonnen er
 * målt i prod (CLAUDE.md «Nye migrations»).
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { hentPortraetUrl, tjekBilledfil, uploadPortraet } from "@/lib/delingsbilleder";
import { certifikatDom, certifikatMenu, type CertifikatDom, type CertifikatMenu } from "@/lib/certifikat/dom";
import { skrivHentning, taelHentninger, type HentningsFormat } from "@/lib/certifikat/hentninger";
import type { DesignId } from "@/components/hjemmebane/certifikat/types";

export const CERTIFIKAT_QUERY_KEY = "certifikat";

interface Opslag {
  kontraktStart: string | null;
  eligible: boolean;
  hentninger: number;
  /** Signeret URL fra deling-portraetter, eller null (intet gemt / fejlet — logget). */
  portraetUrl: string | null;
}

export interface Certifikat {
  loading: boolean;
  /** Sat når opslaget fejlede — dommen er da skjult, men det er en fejl, ikke et nej. */
  fejl: string | null;
  dom: CertifikatDom;
  menu: CertifikatMenu | null;
  navn: string;
  virksomhed: string;
  portraetUrl: string | null;
  uploadPortraet: (fil: File) => Promise<void>;
  /** Kaldes af siden EFTER en vellykket download. Fail-soft: logger, kaster aldrig. */
  logHentning: (design: DesignId, format: HentningsFormat) => Promise<void>;
}

const SKJULT_RAADGIVER: CertifikatDom = { synlig: false, grund: "raadgiver" };
const SKJULT_TIER: CertifikatDom = { synlig: false, grund: "ikke_fuldt_medlem" };

export function useCertificate(): Certifikat {
  const { user, profile, companyId, companyName, isAdvisor, membershipTier, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const omfattet = !isAdvisor && membershipTier === "full" && !!userId && !!companyId;

  const query = useQuery<Opslag>({
    queryKey: [CERTIFIKAT_QUERY_KEY, userId],
    enabled: omfattet,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("companies") as any)
        .select("contract_start_date, certificate_eligible")
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const kontraktStart = (data?.contract_start_date as string | null | undefined) ?? null;
      const eligible = data?.certificate_eligible === true;
      // Skallen kalder hooken på hver side for ALLE fulde medlemmer — de to
      // opslag mere (tælling, storage-listning) koster kun, når området
      // faktisk er synligt, og portrættet kun, når det er åbent (låst viser
      // intet portræt). Dommen regnes igen udenfor med et friskt `nu`.
      const foreloebig = certifikatDom({ isAdvisor: false, membershipTier: "full", eligible, kontraktStart }, new Date());
      if (foreloebig.synlig === false) return { kontraktStart, eligible, hentninger: 0, portraetUrl: null };
      const hentninger = await taelHentninger(supabase, userId!);
      let portraetUrl: string | null = null;
      if (foreloebig.status.state === "open") {
        try {
          portraetUrl = await hentPortraetUrl(userId!);
        } catch (e) {
          console.warn("[useCertificate] portrættet kunne ikke hentes — avataren bruges:", e instanceof Error ? e.message : e);
        }
      }
      return { kontraktStart, eligible, hentninger, portraetUrl };
    },
  });

  const dom: CertifikatDom = isAdvisor
    ? SKJULT_RAADGIVER
    : !omfattet
      ? SKJULT_TIER
      : query.data
        ? certifikatDom({ isAdvisor, membershipTier, eligible: query.data.eligible, kontraktStart: query.data.kontraktStart }, new Date())
        : { synlig: false, grund: "ikke_berettiget" };
  const fejl = query.error ? (query.error instanceof Error ? query.error.message : String(query.error)) : null;
  const menu = fejl || !query.data ? null : certifikatMenu(dom, query.data.hentninger);

  const upload = useCallback(
    async (fil: File) => {
      if (!userId) return;
      const tjek = tjekBilledfil(fil);
      if (tjek.ok === false) throw new Error(tjek.fejl);
      await uploadPortraet(userId, fil);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CERTIFIKAT_QUERY_KEY, userId] }),
        queryClient.invalidateQueries({ queryKey: ["deling", "portraet", userId] }),
      ]);
    },
    [userId, queryClient],
  );

  const logHentning = useCallback(
    async (design: DesignId, format: HentningsFormat) => {
      if (!userId) return;
      try {
        await skrivHentning(supabase, { userId, design, format });
        await queryClient.invalidateQueries({ queryKey: [CERTIFIKAT_QUERY_KEY, userId] });
      } catch (e) {
        console.warn("[useCertificate] hentningen kunne ikke logges — filen er hentet:", e instanceof Error ? e.message : e);
      }
    },
    [userId, queryClient],
  );

  return {
    loading: authLoading || (omfattet && query.isPending),
    fejl,
    dom,
    menu,
    navn: profile?.full_name ?? "",
    virksomhed: companyName ?? profile?.company_name ?? "",
    portraetUrl: query.data?.portraetUrl ?? (profile?.avatar_url || null),
    uploadPortraet: upload,
    logHentning,
  };
}
