/**
 * useVirksomhed — ÉN samlet, company-nøglet datahentning til virksomheds-
 * siden (/virksomhed/:companyId, raadgiverfladen-design.md §3.3, §4, §11
 * pkt. 5). Etape 1: det blok 1 («Hvad skal du vide nu») og blok 7
 * («Aftalen») kræver. Etape 2: blok 5 («Tallene») og blok 6 («Aktivitet»)
 * — financial_reports og kpi_targets lagt i SAMME Promise.all, milestones
 * og handouts udvidet fra antal til rækker. Etape 3, blok 2 («Deres ord og
 * din forberedelse»): seneste pulse_checkins-række og
 * companies.application_context lagt i samme Promise.all.
 * Sessionsforberedelsen (ai-financial-feedback, request_type
 * "session_prep") gemmes INGEN steder — den er et AI-kald der kun
 * returneres — og hentes derfor ikke her; fladen beder om den på en knap.
 *
 * AKADEMI-FREMDRIFT ER IKKE MED (etape 2, målt 4/9): member_progress har
 * kun user_id, ingen company_id (types.ts:2379). Den kan ikke hentes
 * company-nøglet, og §3.3's «pr. medlem»-opslag er ikke besluttet for
 * den — så den hentes ikke, frem for at gætte. Blok 6 viser rapportering,
 * handouts og milestones.
 *
 * PRINCIPPET (§3.3): virksomheden er en aftale, medlemmet er en adgang.
 * Alt slås op fra companies.id og udad — INTET er gated på et user_id-
 * opslag. En virksomhed uden medlemmer (Din økonomiafdeling, Two Socks,
 * WESDEX, målt 3/9) er en gyldig tilstand: medlemslisten er tom, siden
 * tegnes. Findes virksomheden ikke, er `findesIkke` sand.
 *
 * MÅLT 4/9: en naiv side laver 18 netværkskald. Her: ét Promise.all med
 * sytten company-nøglede hentninger (én runde), plus profiles til navnene i
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Json } from "@/integrations/supabase/types";
import { useCompanyFacts, type CompanyFact } from "@/hooks/useCompanyFacts";
import type { FejletTraek } from "@/lib/traek";
import { KPI_DEFS } from "@/lib/kpiDefs";
import { KPI_FALLBACK_TARGETS } from "@/lib/appConfig";
import type { ResolvedTargets } from "@/hooks/useKpiTargets";

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
    /** Ansøgningen som den blev skrevet ved oprettelsen (monday-webhook /
        import-application): current_situation, goals, help_needed m.fl.
        Statisk — designets §4 blok 2 vil have den SAMMENFATTET og gemt i
        egen kolonne; den findes ikke endnu, så rå jsonb indtil da. */
    application_context: Json | null;
  };
  /** Seneste refleksion (pulse_checkins) — medlemmets egne ord, samme
      kolonner som MemberDetail.tsx:238-244. null når der ingen er. */
  refleksion: {
    went_well: string | null;
    biggest_challenge: string | null;
    help_needed: string | null;
    milestone_progress: number | null;
    created_at: string;
    period_key: string;
  } | null;
  medlemmer: VirksomhedsMedlem[];
  invitationer: VirksomhedsInvitation[];
  samtaler: VirksomhedsSamtale[];
  budgetter: { period: string; category: string; budget_amount: number }[];
  milestones: { id: string; title: string; deadline: string | null; progress: number; status: string }[];
  /** user_id: ejeren af handout-rækken — HandoutDetail/loadHandout er nøglet
      på user_id, så «åbn handout» åbner det medlem der faktisk udfyldte det. */
  handouts: { levers: unknown; status: string; module: string; completed_at: string | null; user_id: string }[];
  /** financial_reports company-nøglet (BoardroomView:1604-1609), nyeste først, uden slettede. */
  rapporter: {
    id: string;
    file_name: string;
    file_path: string;
    report_type: string;
    status: string;
    report_period: string | null;
    uploaded_at: string;
    processed_at: string | null;
    manual_override_status: string | null;
    manual_report_period_key: string | null;
    manual_report_period_label: string | null;
  }[];
  /** Rapport-kommentarer (blok 6): messages med context_type = "report" i
      virksomhedens samtaler, ældste først — samme rækker som
      MemberDetail.tsx:510-516 læser pr. rapport. Nøglet på context_id
      (rapport-id). Hentet via conversations!inner(company_id), så de
      ligger i samme Promise.all uden først at kende samtale-id'erne. */
  rapportKommentarer: {
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    context_id: string | null;
    created_at: string;
  }[];
  /** Rådgivernavne pr. user_id (get_all_advisor_profiles) — til «Tildelt» i blok 4. */
  raadgiverNavne: Record<string, string>;
  /** KPI-mål pr. nøgle — DB-værdi ellers KPI_FALLBACK_TARGETS, ordret som useKpiTargets:36-47. */
  kpiMaal: ResolvedTargets;
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
    rapporterRes, kpiMaalRes, refleksionRes, kommentarRes, raadgivereRes,
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, cvr_number, industry_label, contact_person, contact_email, contact_phone, status, is_legat, contract_start_date, contract_end_date, subscription_status, subscription_current_period_end, indgangspris_oere, fornyelsespris_oere, created_at, application_context")
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
    supabase
      .from("milestones")
      .select("id, title, deadline, progress, status")
      .eq("company_id", companyId)
      .order("deadline", { ascending: true })
      .limit(200),
    // handouts på company_id — samme nøgle som loadHandoutSummaries bruger
    // for rådgivere (handoutEngine.ts:68-69).
    supabase.from("handouts").select("levers, status, module, completed_at, user_id").eq("company_id", companyId),
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
    // Rapportlisten (blok 6): kun de kolonner listen læser — ai_analysis,
    // raw_extracted_data og blobs hentes ikke (MemberDetail.tsx:370-378-
    // lærdommen). Loft 50, nyeste først.
    supabase
      .from("financial_reports")
      .select("id, file_name, file_path, report_type, status, report_period, uploaded_at, processed_at, manual_override_status, manual_report_period_key, manual_report_period_label")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: false })
      // Loft 200 (fra 50, 4/9): blok 6 viser nu HELE listen foldet sammen
      // efter de nyeste, og MemberDetail viste 200. Tungeste virksomhed
      // er langt under (målt i /members: reportCount-loftet på 1000 rammes
      // aldrig); 200 er samme loft som milestones ovenfor.
      .limit(200),
    supabase.from("kpi_targets").select("kpi_key, target_value, target_label").eq("company_id", companyId),
    // Seneste refleksion (blok 2) — samme select og orden som
    // MemberDetail.tsx:238-244; company-nøglet, én række.
    supabase
      .from("pulse_checkins")
      .select("went_well, biggest_challenge, help_needed, milestone_progress, created_at, period_key")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Rapport-kommentarer (blok 6). messages har ingen company_id; i stedet
    // for at vente på samtale-id'erne (som MemberDetail:495-503 gør i en
    // anden runde) filtreres på den embeddede samtale — FK
    // messages_conversation_id_fkey, `!inner` gør embeddet til et krav.
    // RLS: «Advisors can view all messages». Loft 500: kommentarer pr.
    // virksomhed er få (én pr. rapport-samtale).
    supabase
      .from("messages")
      .select("id, conversation_id, sender_id, content, context_id, created_at, conversations!inner(company_id)")
      .eq("context_type", "report")
      .eq("conversations.company_id", companyId)
      .order("created_at", { ascending: true })
      .limit(500),
    // Rådgivernes navne til «Tildelt: {rådgiver}» (blok 4). conversations
    // har ingen FK på assigned_advisor_id at embedde over, og id'et kendes
    // først når samtalerne er hentet — så alle rådgivere hentes i SAMME
    // runde via RPC'en forsiden bruger (AdvisorDashboard:370), og navnet
    // slås op i kode. Få rækker (rådgivere + admins).
    supabase.rpc("get_all_advisor_profiles"),
  ]);

  // KPI-mål: DB-værdi hvis den findes, ellers fallback — ordret som
  // useKpiTargets:36-47, men i denne hentning frem for en egen useQuery.
  const dbMaal = new Map((kpiMaalRes.data ?? []).map((t) => [t.kpi_key, t]));
  const kpiMaal: ResolvedTargets = {};
  for (const def of KPI_DEFS) {
    const ut = dbMaal.get(def.key);
    kpiMaal[def.key] = ut
      ? { value: Number(ut.target_value), label: ut.target_label }
      : (KPI_FALLBACK_TARGETS[def.key] || { value: 0, label: "—" });
  }

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

  const raadgiverNavne: Record<string, string> = {};
  for (const r of ((raadgivereRes.data ?? []) as { user_id: string; full_name: string | null }[])) {
    if (r.user_id && r.full_name) raadgiverNavne[r.user_id] = r.full_name;
  }

  return {
    company: companyRes.data,
    raadgiverNavne,
    refleksion: refleksionRes.data ?? null,
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
    rapporter: rapporterRes.data ?? [],
    rapportKommentarer: (kommentarRes.data ?? []).map((m) => ({
      id: m.id,
      conversation_id: m.conversation_id,
      sender_id: m.sender_id,
      content: m.content,
      context_id: m.context_id,
      created_at: m.created_at,
    })),
    kpiMaal,
  };
}

export function useVirksomhed(companyId: string | undefined) {
  const { user, isAdvisor } = useAuth();
  const queryClient = useQueryClient();
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
    /** Hent virksomheden igen efter en skrivning (EditCompanyDialog). Løftet
        er først opfyldt når den aktive query ER hentet igen — AWAIT den før
        en dialog lukkes (OVERLEVERING DEL 4: `void invalidateQueries` lukker
        før tilstanden er hentet, og fladen viser det gamle i et render). */
    invalider: async () => {
      await queryClient.invalidateQueries({ queryKey: ["virksomhed", companyId] });
    },
  };
}
