/**
 * useVirksomhed — ÉN samlet, company-nøglet datahentning til virksomheds-
 * siden (/virksomhed/:companyId, raadgiverfladen-design.md §3.3, §4, §11
 * pkt. 5). Etape 1: det blok 1 («Hvad skal du vide nu») og blok 7
 * («Aftalen») kræver.
 *
 * PRINCIPPET (§3.3): virksomheden er en aftale, medlemmet er en adgang.
 * Alt slås op fra companies.id og udad — INTET er gated på et user_id-
 * opslag. En virksomhed uden medlemmer (Din økonomiafdeling, Two Socks,
 * WESDEX, målt 3/9) er en gyldig tilstand: medlemslisten er tom, siden
 * tegnes. Findes virksomheden ikke, er `findesIkke` sand.
 *
 * MÅLT 4/9: en naiv side laver 18 netværkskald. Her: ét Promise.all med
 * tolv company-nøglede hentninger (én runde), plus profiles til navnene i
 * en ANDEN runde (kun når der er medlemmer — der er ingen FK fra
 * company_members til profiles at embedde over, jf. Members.tsx' separate
 * hentning), plus useCompanyFacts (egen query, genbrugt uændret).
 *
 * FACTS OG data_basis-GUARDEN: facts kommer gennem useCompanyFacts, som
 * selv læser data_basis i sin select (useCompanyFacts.ts:53) og bærer den
 * på hver CompanyFact-række. Denne fil læser ikke facts-tabellen selv og
 * står derfor ikke i FORVENTEDE_UNDTAGELSER; dommen (momErGyldig m.m.)
 * ligger hos aftageren, som har data_basis på hvert punkt.
 *
 * Mønster for de company-nøglede hentninger: BoardroomView (company_actions
 * :1685, milestones :1619, useCompanyFacts :11) og AgentForslagPanel
 * (agent_runs/agent_proposals :112-121). RLS: advisor-policies tillader
 * company-nøglet læsning på alle tolv kilder (målt 4/9).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyFacts, type CompanyFact } from "@/hooks/useCompanyFacts";
import type { FejletTraek } from "@/lib/traek";

export interface VirksomhedsMedlem {
  user_id: string;
  role: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
}

export interface VirksomhedsInvitation {
  id: string;
  email: string;
  status: string;
  created_at: string;
  accepted_at: string | null;
}

export interface VirksomhedsSamtale {
  id: string;
  last_message_at: string | null;
  awaiting_reply_from: string | null;
  assigned_advisor_id: string | null;
}

/** company_traek — ALLE træk (betalte og fejlede) til «Betaling»-linjen. */
export interface VirksomhedsTraek extends FejletTraek {
  status: string;
  art: string | null;
  betalt_at: string | null;
  periode_slut: string | null;
}

export interface VirksomhedsPeriode {
  id: string;
  art: string;
  betalingsmodel: string;
  beloeb_oere: number;
  periode_start: string;
  periode_slut: string;
  note: string | null;
}

export interface VirksomhedsData {
  company: {
    id: string;
    name: string;
    cvr_number: string | null;
    industry_label: string | null;
    contact_person: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    status: string | null;
    is_legat: boolean;
    contract_start_date: string | null;
    contract_end_date: string | null;
    subscription_status: string | null;
    subscription_current_period_end: string | null;
    indgangspris_oere: number | null;
    fornyelsespris_oere: number | null;
    created_at: string;
  };
  medlemmer: VirksomhedsMedlem[];
  invitationer: VirksomhedsInvitation[];
  samtaler: VirksomhedsSamtale[];
  budgetter: { period: string; category: string; budget_amount: number }[];
  milestones: { deadline: string | null; status: string }[];
  handouts: { levers: unknown; status: string; module: string }[];
  /** company_actions der venter: open/proposed/active (BoardroomView:1686). */
  opgaver: { id: string; title: string; status: string; priority: string; due_date: string | null }[];
  /** agent_proposals uden decided_at — motorens definition (virksomhedsSignaler.ts:135). */
  agentforslagVenter: number;
  traek: VirksomhedsTraek[];
  perioder: VirksomhedsPeriode[];
  betalingslink: {
    prisniveau_oere: number | null;
    underskrevet_at: string;
    betalingsmail_sendt_at: string | null;
    sidste_paamindelse_dag: number | null;
    faktura_sendt_at: string | null;
  } | null;
  fornyelse: { beslutning: string; note: string | null; besluttet_at: string } | null;
}

async function hentVirksomhed(companyId: string): Promise<VirksomhedsData | null> {
  const [
    companyRes, membersRes, invitationsRes, convsRes, budgetRes, milestonesRes,
    handoutsRes, actionsRes, proposalsRes, traekRes, perioderRes, linkRes, fornyelseRes,
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, cvr_number, industry_label, contact_person, contact_email, contact_phone, status, is_legat, contract_start_date, contract_end_date, subscription_status, subscription_current_period_end, indgangspris_oere, fornyelsespris_oere, created_at")
      .eq("id", companyId)
      .maybeSingle(),
    supabase.from("company_members").select("user_id, role").eq("company_id", companyId),
    supabase
      .from("company_invitations")
      .select("id, email, status, created_at, accepted_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("conversations")
      .select("id, last_message_at, awaiting_reply_from, assigned_advisor_id")
      .eq("company_id", companyId),
    supabase.from("budget_targets").select("period, category, budget_amount").eq("company_id", companyId),
    supabase.from("milestones").select("deadline, status").eq("company_id", companyId),
    supabase.from("handouts").select("levers, status, module").eq("company_id", companyId),
    supabase
      .from("company_actions")
      .select("id, title, status, priority, due_date")
      .eq("company_id", companyId)
      .in("status", ["open", "proposed", "active"])
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("agent_proposals")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("decided_at", null),
    supabase
      .from("company_traek")
      .select("company_id, stripe_invoice_id, beloeb_oere, fejlet_at, forsoeg, naeste_forsoeg_at, fejl_kode, fejl_decline_code, fejl_besked, hosted_invoice_url, faktura_nummer, periode_start, periode_slut, status, art, betalt_at")
      .eq("company_id", companyId)
      .order("periode_start", { ascending: false })
      .limit(100),
    supabase
      .from("company_perioder")
      .select("id, art, betalingsmodel, beloeb_oere, periode_start, periode_slut, note")
      .eq("company_id", companyId)
      .order("periode_start", { ascending: false }),
    supabase
      .from("company_betalingslink")
      .select("prisniveau_oere, underskrevet_at, betalingsmail_sendt_at, sidste_paamindelse_dag, faktura_sendt_at")
      .eq("company_id", companyId)
      .maybeSingle(),
    supabase
      .from("company_fornyelse")
      .select("beslutning, note, besluttet_at")
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);

  if (companyRes.error) throw companyRes.error;
  if (!companyRes.data) return null;

  // Anden runde — kun navnene. Tom medlemsliste → ingen kald, tom liste.
  const memberRows = membersRes.data ?? [];
  const profileByUser = new Map<string, { full_name: string; email: string | null; avatar_url: string | null }>();
  if (memberRows.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, avatar_url")
      .in("user_id", memberRows.map((m) => m.user_id));
    for (const p of profiles ?? []) profileByUser.set(p.user_id, p);
  }

  return {
    company: companyRes.data,
    medlemmer: memberRows.map((m) => ({
      user_id: m.user_id,
      role: m.role,
      full_name: profileByUser.get(m.user_id)?.full_name || "Ukendt",
      email: profileByUser.get(m.user_id)?.email ?? null,
      avatar_url: profileByUser.get(m.user_id)?.avatar_url ?? null,
    })),
    invitationer: invitationsRes.data ?? [],
    samtaler: convsRes.data ?? [],
    budgetter: budgetRes.data ?? [],
    milestones: milestonesRes.data ?? [],
    handouts: handoutsRes.data ?? [],
    opgaver: actionsRes.data ?? [],
    agentforslagVenter: proposalsRes.count ?? 0,
    traek: (traekRes.data ?? []) as VirksomhedsTraek[],
    perioder: perioderRes.data ?? [],
    betalingslink: linkRes.data ?? null,
    fornyelse: fornyelseRes.data ?? null,
  };
}

export function useVirksomhed(companyId: string | undefined) {
  const { user, isAdvisor } = useAuth();
  const facts = useCompanyFacts(companyId);
  const query = useQuery({
    queryKey: ["virksomhed", companyId],
    queryFn: () => hentVirksomhed(companyId!),
    enabled: !!user && !!isAdvisor && !!companyId,
    staleTime: 2 * 60_000,
  });
  return {
    data: query.data ?? null,
    facts: (facts.data ?? []) as CompanyFact[],
    isLoading: query.isLoading || facts.isLoading,
    isError: query.isError,
    /** Sand når opslaget lykkedes og virksomheden ikke findes (eller RLS skjuler den). */
    findesIkke: query.isSuccess && query.data === null,
  };
}
