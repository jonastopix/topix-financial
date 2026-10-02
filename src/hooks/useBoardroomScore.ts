/**
 * useBoardroomScore — læser grundlaget for Boardroom Score med medlemmets
 * egen RLS og kører den rene motor (src/lib/boardroomScore, design i
 * docs/boardroom-score.md). Fladen: components/hjemmebane/boardroom/ScoreKort.tsx.
 *
 * Fem kilder:
 *   - financial_report_facts (period_key, data_basis, metrics, created_at).
 *     Egen hentning (useCompanyFacts vælger ikke created_at), samme policy.
 *   - maaned_foerste_godkendelse (period_key, foerst_godkendt_at) — HUKOMMELSEN
 *     om månedens første godkendelse (migration 20260930130000, rådets fund 1):
 *     «Erstat gammel data» og permanent sletning sletter facts-rækken, og en
 *     rettet måned får en ny række med created_at = now(). Hukommelsen skrives
 *     af en trigger, når en måned første gang bliver målt, og slettes aldrig
 *     af fladen. Første godkendelse = den tidligste af hukommelsen og
 *     created_at (tidligsteGodkendelse). committed_at læses ikke (SENESTE).
 *     Tabellen er ny (migration 20260930130000). FLADEN (30/9, ScoreKort):
 *     findes tabellen IKKE (PGRST205/42P01 — lib/manglendeTabel), svarer
 *     hentningen `{ tilstand: "afventer_migration" }` og kortet står roligt
 *     «på vej» — ingen score, ingen streak regnet på created_at alene (det
 *     var netop fejlen, hukommelsen retter). Kortet bliver rigtigt af sig
 *     selv, når migrationen er kørt. ENHVER anden fejl kaster stadig
 *     HentningsFejl — en fejl er ikke «ingen tal».
 *   - companies.contract_start_date — afgrænser disciplin og streak.
 *   - budget_targets: findes mindst én værdirække for indeværende år?
 *     (base-scenariet, period «YYYY-base-idx»; markører har ikke den form.)
 *   - milestones (skive 3, 2/10-2026 — Jonas 1/10: «flyt Score-pointet til Dine
 *     mål»): findes mindst ét mål, der taellerSomScoreMaal (aktivt · bekræftet ·
 *     med art · med frist · tal-mål med måltal og udgangspunkt —
 *     lib/hjemmebane/maalBekraeft.ts)? FAIL-SOFT: mangler kolonnen
 *     bekraeftet_at (42703/PGRST204 — migration 20261002100000 ikke kørt),
 *     læses kpi_targets som før («opfør dig som i dag»).
 *
 * Fejl er en fejl (husets regel): hver hentning kaster HentningsFejl med
 * kildens navn — et fejlet kald må ikke ligne «ingen tal» og give en
 * disciplin på 0.
 *
 * Uret (rådets fund 7): dommen afhænger af `nu` (frister, den åbne måned,
 * friskhed). Grundlaget genhentes hvert 5. minut, og dommen regnes om hvert
 * minut, så status skifter hen over en frist uden genindlæsning.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { HentningsFejl, kraevRaekker } from "@/lib/kraevRaekker";
import { erManglendeTabel } from "@/lib/manglendeTabel";
import { kbhDele } from "@/lib/hverdage";
import { boardroomScore, tidligsteGodkendelse, type ScoreDom, type ScoreGrundlag, type ScoreMaaned } from "@/lib/boardroomScore";
import { taellerSomScoreMaal, type MaalTilScore } from "@/lib/hjemmebane/maalBekraeft";
import { erManglendeKolonne } from "@/lib/manglendeTabel";
import type { Json } from "@/integrations/supabase/types";

/** Kolonnerne, Score læser af milestones (skive 3). bekraeftet_at er den, der kan mangle. */
export const SCORE_MAAL_KOLONNER = "status, bekraeftet_at, art, deadline, target_value, udgangspunkt";

/**
 * «Har virksomheden et mål?» til disciplinens 25 point — af Dine mål (skive 3).
 * Fail-soft: mangler kolonnen, tælles kpi_targets som før skive 3. Enhver anden
 * fejl kaster HentningsFejl.
 */
export async function hentHarMaal(companyId: string): Promise<boolean> {
  const maal = await supabase.from("milestones").select(SCORE_MAAL_KOLONNER).eq("company_id", companyId).eq("status", "active");
  if (maal.error && erManglendeKolonne(maal.error)) {
    const kpi = await supabase.from("kpi_targets").select("id", { count: "exact", head: true }).eq("company_id", companyId);
    if (kpi.error) throw new HentningsFejl("kpi_targets", kpi.error.message);
    return (kpi.count ?? 0) > 0;
  }
  if (maal.error) throw new HentningsFejl("milestones", maal.error.message);
  return ((maal.data ?? []) as unknown as MaalTilScore[]).some(taellerSomScoreMaal);
}

/** Hvor tit grundlaget genhentes, og hvor tit dommen regnes om af samme grundlag. */
export const GRUNDLAG_GENHENT_MS = 5 * 60_000;
export const DOM_UR_MS = 60_000;

function parseMetrics(raw: Json): Record<string, number | null> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (v === null) out[k] = null;
  }
  return out;
}

export const boardroomScoreKey = (companyId: string | undefined) => ["boardroom-score", "grundlag", companyId] as const;

/** Udfaldet af hentningen: grundlaget, eller «hukommelsens tabel findes ikke endnu» (migrationen ikke kørt). */
export type ScoreHentning = { tilstand: "klar"; grundlag: ScoreGrundlag } | { tilstand: "afventer_migration" };

/** Henter grundlaget som én query (fem kald), så fladen får ÉN isLoading/isError. */
export async function hentScoreGrundlag(companyId: string, nu: Date): Promise<ScoreHentning> {
  const aar = kbhDele(nu).aar;

  const facts = kraevRaekker(
    await supabase
      .from("financial_report_facts")
      .select("period_key, data_basis, metrics, created_at")
      .eq("company_id", companyId)
      .order("period_key", { ascending: true }),
    "financial_report_facts",
  );

  // Hukommelsen om første godkendelse. Tabellen er født i 20260930130000 og står
  // endnu ikke i types.ts (Lovable genererer typerne efter migrationen) — derfor `as any`.
  const hukommelseRes = await (supabase
    .from("maaned_foerste_godkendelse" as any)
    .select("period_key, foerst_godkendt_at")
    .eq("company_id", companyId) as any);
  // Migrationen ikke kørt → roligt «på vej», ikke en fejl og ikke en score uden hukommelse.
  if (hukommelseRes?.error && erManglendeTabel(hukommelseRes.error)) return { tilstand: "afventer_migration" };
  const hukommelse = kraevRaekker(hukommelseRes, "maaned_foerste_godkendelse") as { period_key: string; foerst_godkendt_at: string | null }[];
  const foersteGodkendt = new Map(hukommelse.map((h) => [h.period_key, h.foerst_godkendt_at]));

  const virksomhed = await supabase.from("companies").select("contract_start_date").eq("id", companyId).maybeSingle();
  if (virksomhed.error) throw new HentningsFejl("companies", virksomhed.error.message);

  // Én værdirække i base-scenariet for året rækker («YYYY-base-idx»). Markørerne
  // (__template__/__label__/__group__/__fravalgt__) bærer skabelonnøgle, label
  // eller gruppe i `period` og rammes ikke af mønstret — samme filter som
  // rådgiverforsidens budgetafvigelse (AdvisorDashboard, «%-base-%»).
  const budget = await supabase
    .from("budget_targets")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .like("period", `${aar}-base-%`);
  if (budget.error) throw new HentningsFejl("budget_targets", budget.error.message);

  const harMaal = await hentHarMaal(companyId);

  const maaneder: ScoreMaaned[] = facts.map((f) => ({
    key: f.period_key,
    basis: f.data_basis === "estimated" ? "estimated" : "measured",
    foersteGodkendtAt: tidligsteGodkendelse(foersteGodkendt.get(f.period_key), f.created_at),
    metrics: parseMetrics(f.metrics),
  }));

  return {
    tilstand: "klar",
    grundlag: {
      maaneder,
      kontraktStart: (virksomhed.data as { contract_start_date?: string | null } | null)?.contract_start_date ?? null,
      harBudgetForAaret: (budget.count ?? 0) > 0,
      harMaal,
    },
  };
}

export function useBoardroomScore(overrideCompanyId?: string): {
  dom: ScoreDom | null;
  grundlag: ScoreGrundlag | undefined;
  /** true, mens hukommelsens tabel ikke findes i drift (migration 20260930130000 ikke kørt) — fladen står roligt. */
  afventerMigration: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
} {
  const { user, companyId: authCompanyId } = useAuth();
  const companyId = overrideCompanyId ?? authCompanyId;

  const query = useQuery({
    queryKey: boardroomScoreKey(companyId),
    queryFn: () => hentScoreGrundlag(companyId!, new Date()),
    enabled: !!user && !!companyId,
    staleTime: GRUNDLAG_GENHENT_MS,
    refetchInterval: GRUNDLAG_GENHENT_MS,
  });

  // Uret: `nu` er en afhængighed af dommen — ellers står status stille hen over en frist.
  const [nuMs, setNuMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNuMs(Date.now()), DOM_UR_MS);
    return () => window.clearInterval(id);
  }, []);

  const grundlag = query.data?.tilstand === "klar" ? query.data.grundlag : undefined;
  const dom = useMemo(() => (grundlag ? boardroomScore(grundlag, new Date(nuMs)) : null), [grundlag, nuMs]);

  return {
    dom,
    grundlag,
    afventerMigration: query.data?.tilstand === "afventer_migration",
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
