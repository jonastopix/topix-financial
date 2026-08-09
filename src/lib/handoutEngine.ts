import { supabase } from "@/integrations/supabase/client";
import type { HandoutModule } from "@/lib/handoutConfig";
import { notifyHandoutCompleted } from "@/lib/handoutNotify";

/** Handout-motoren (hb-handouts-byggeplan §2, PR 1): skrivevejene H1-H6
    flyttet ORDRET fra Handouts.tsx / HandoutDetail.tsx /
    HandoutLeverItem.tsx / HandoutAIFeedback.tsx — én sandhed for gammel
    flade og den kommende Hb-flade (budgetEngine-mønstret, ren flytning,
    nul adfærd). UI-tilstand (toasts, save-status, komponent-state)
    bliver i komponenterne; motoren ejer DB-kald, gates og payloads.
    H6 (notifyHandoutCompleted) er BEVIDST ikke flyttet — den
    eksisterende lib/handoutNotify kaldes herfra. */

export interface LeverMilestone {
  milestone_id: string;
  title: string;
  progress: number;
  status: string;
}

/** H1a — modul-detaljens rå række (HandoutDetail.loadData, første del). */
export async function loadHandout(userId: string, module: HandoutModule) {
  const { data } = await supabase
    .from("handouts")
    .select("*")
    .eq("user_id", userId)
    .eq("module", module)
    .maybeSingle();
  return data ?? null;
}

/** H1b — linkede løftestangs-milestones (HandoutDetail.loadData, anden del). */
export async function loadLeverMilestones(handoutId: string): Promise<Record<number, LeverMilestone>> {
  // Load lever milestones
  const { data: links } = await supabase
    .from("handout_lever_milestones" as any)
    .select("lever_index, milestone_id")
    .eq("handout_id", handoutId);

  const map: Record<number, LeverMilestone> = {};
  if (links && links.length > 0) {
    const msIds = (links as any[]).map((l: any) => l.milestone_id);
    const { data: milestones } = await supabase
      .from("milestones")
      .select("id, title, progress, status")
      .in("id", msIds);

    for (const link of links as any[]) {
      const ms = milestones?.find((m) => m.id === link.milestone_id);
      if (ms) {
        map[link.lever_index] = { milestone_id: ms.id, title: ms.title, progress: ms.progress, status: ms.status };
      }
    }
  }
  return map;
}

/** H1c — liste-fladens resuméer (Handouts.tsx' load: advisor ser
    virksomhedens rækker, medlem sine egne). */
export async function loadHandoutSummaries(args: {
  userId: string;
  companyId: string;
  isAdvisor: boolean;
}) {
  let query = supabase
    .from("handouts")
    .select("module, status, responses, checklist, levers, completed_at, user_id");
  if (args.isAdvisor) {
    query = query.eq("company_id", args.companyId);
  } else {
    query = query.eq("user_id", args.userId);
  }
  const { data } = await query;
  return data ?? [];
}

/** Fladt result-objekt (ikke discriminated union — tsconfig'ens
    strict:false narrower ikke på boolean-literals): skipped=true ⇒
    handoutId/error er null og intet er skrevet. */
export interface SaveHandoutResult {
  skipped: boolean;
  handoutId: string | null;
  error: { message: string } | null;
}

/** H2 — autosave-skrivevejen (HandoutDetail.save ordret): isOwner-gaten,
    status-afledningen af indhold, insert-vs-update på handoutId. */
export async function saveHandout(args: {
  effectiveUserId: string | null | undefined;
  isOwner: boolean;
  module: HandoutModule;
  companyId: string | null;
  handoutId: string | null;
  responses: Record<string, string>;
  checklist: Record<string, boolean>;
  levers: string[];
}): Promise<SaveHandoutResult> {
  const { effectiveUserId, isOwner, module, companyId, handoutId } = args;
  const r = args.responses;
  const c = args.checklist;
  const l = args.levers;
  if (!effectiveUserId || !isOwner) return { skipped: true, handoutId: null, error: null };

  const hasContent = Object.values(r).some(v => v.trim()) || Object.values(c).some(v => v) || l.some(v => v.trim());
  const status = hasContent ? "in_progress" : "not_started";

  const payload: Record<string, any> = {
    user_id: effectiveUserId,
    module,
    responses: r,
    checklist: c,
    levers: l,
    status,
  };
  payload.company_id = companyId;

  if (handoutId) {
    const { error } = await supabase.from("handouts").update(payload).eq("id", handoutId);
    return { skipped: false, handoutId, error: error ?? null };
  } else {
    const { data, error } = await supabase.from("handouts").insert(payload as any).select("id").single();
    return { skipped: false, handoutId: (data as any)?.id ?? null, error: error ?? null };
  }
}

/** Fladt result-objekt (samme begrundelse som SaveHandoutResult). */
export interface ToggleCompletedResult {
  skipped: boolean;
  newStatus: "in_progress" | "completed" | null;
  error: { message: string } | null;
}

/** H3 — markér udfyldt/genåbn (HandoutDetail.toggleCompleted ordret);
    H6-notifikationen affyres her ved success + completed, som i kilden. */
export async function toggleHandoutCompleted(args: {
  handoutId: string | null;
  isOwner: boolean;
  isCompleted: boolean;
}): Promise<ToggleCompletedResult> {
  const { handoutId, isOwner, isCompleted } = args;
  if (!handoutId || !isOwner) return { skipped: true, newStatus: null, error: null };
  const newStatus: "in_progress" | "completed" = isCompleted ? "in_progress" : "completed";
  const update: Record<string, any> = { status: newStatus };
  // Always set a fresh completed_at so the UNIQUE(handout_id, completed_at)
  // idempotency key works correctly on uncomplete → re-complete cycles.
  if (newStatus === "completed") update.completed_at = new Date().toISOString();
  else update.completed_at = null;

  const { error } = await supabase.from("handouts").update(update).eq("id", handoutId);

  if (!error && newStatus === "completed") {
    // Server-side notification (Slack + advisor_notifications) — fire-and-forget
    notifyHandoutCompleted(handoutId);
  }

  return { skipped: false, newStatus, error: error ?? null };
}

/** H4 — løftestang → milestone + junction-rækken
    (HandoutLeverItem.createMilestone ordret; UNIQUE(handout_id,
    lever_index) i DB bærer idempotensen). Kaster ved fejl — kalderen
    ejer toast/fejlvisning som i kilden. */
export async function createLeverMilestone(args: {
  userId: string;
  companyId: string | null;
  handoutId: string;
  leverIndex: number;
  title: string;
}): Promise<{ milestoneId: string }> {
  const { userId, companyId, handoutId, leverIndex, title } = args;
  const insertData: Record<string, any> = { user_id: userId, title, source: "handout", company_id: companyId };
  const { data: ms, error: msErr } = await supabase
    .from("milestones")
    .insert(insertData as any)
    .select("id")
    .single();
  if (msErr) throw msErr;

  const { error: linkErr } = await supabase
    .from("handout_lever_milestones" as any)
    .insert({ handout_id: handoutId, lever_index: leverIndex, milestone_id: (ms as any).id });
  if (linkErr) throw linkErr;

  return { milestoneId: (ms as any).id };
}

/** H5 — AI-feedback-kaldet (HandoutAIFeedback.requestFeedback ordret,
    inkl. industry i body). Serveren skriver ai_feedback/ai_feedback_at;
    kalderen genindlæser. Kaster ved fejl. */
export async function requestHandoutAiFeedback(args: {
  handoutId: string;
  module: string;
  companyName?: string | null;
  industry?: string | null;
}): Promise<void> {
  const { error } = await supabase.functions.invoke("handout-ai-feedback", {
    body: { handout_id: args.handoutId, module: args.module, company_name: args.companyName, industry: args.industry },
  });
  if (error) throw error;
}
