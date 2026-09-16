import { useCallback, useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { postActivityMessage } from "@/lib/chatActivity";
import type { MilestoneCategory } from "@/lib/milestoneCategories";
import { afgoerMilepael, sammenlignAktive, statusEfterFremgang, type MilepaelDom, type MilepaelTilstand } from "@/lib/milepaelDom";
// Fase 2 («Én plan», 16/9): «højst tre aktive» håndhæves af databasen (trigger) — fladen oversætter fejlen til husets tekst.
import { maalFejlTekst } from "@/lib/hjemmebane/maalFejl";

/**
 * Datalaget for Hb-milestonefladen — en ren FLYTNING af logikken i
 * src/components/MilestonesList.tsx (:521-738) og src/pages/Milestones.tsx
 * (:49-123), uændret i adfærd: samme queries, samme skrivninger, samme
 * afledte status, samme konfetti, samme chat-aktivitetsbesked og samme
 * Slack-notifikationer (fuldført + deadline-påmindelse 3/7 dage). Den
 * gamle liste står urørt; denne fil er dens spejl uden JSX, så fladen
 * kun tegner. Etape 1 af konverteringen (4/9): siden, listen og
 * rækkerne — ikke portalerne.
 *
 * DOMMEN (8/9): tilstanden (færdig / i gang / ikke startet / parkeret /
 * FORFALDEN) dømmes IKKE her længere. Den gamle deriveStatus (progress
 * >= 100 → done) og sorteringens egen «hastende» (deadline > now) er
 * erstattet af src/lib/milepaelDom.ts — én sandhed for alle flader.
 * Hver række bærer sin dom (Milestone.dom), og status er dommens
 * overskrift. Skrivereglen ved fremgang (100 % → 'completed') bor også
 * i motoren (statusEfterFremgang).
 */

export type MilestoneStatus = MilepaelTilstand;

export interface Milestone {
  id: string;
  title: string;
  deadline: Date | null;
  /** Dommens overskrift — se dom for de enkelte sandheder. */
  status: MilestoneStatus;
  /** Én sandhed: afgoerMilepael(rå række, nu). */
  dom: MilepaelDom;
  description: string | null;
  source: string;
  source_report: string | null;
  progress: number;
  category: MilestoneCategory;
  baseline: string | null;
  dbStatus?: string;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  /** Fase 3 («Dine mål»): planens felter — fremdriftens stempel, nået-dato og oprettelse (lib/hjemmebane/planen.MaalRaekke). */
  progress_updated_at: string | null;
  completed_at: string | null;
  created_at: string;
}

/** Dommen for én række — kaldes ved hentning og efter hver lokal
    ændring, så Milestone.dom/status aldrig er ældre end felterne. */
function doem(m: Pick<Milestone, "dbStatus" | "progress" | "deadline">, nu: Date = new Date()): Pick<Milestone, "dom" | "status"> {
  const dom = afgoerMilepael({ status: m.dbStatus, progress: m.progress, deadline: m.deadline }, nu);
  return { dom, status: dom.tilstand };
}

/** Sorteringen af aktive milestones — motorens sammenlignAktive:
    forfaldne først (ældst først), så hastende (frist inden for 7 dage,
    fristdagen medregnet), så påbegyndte, så efter frist, så uden frist.
    Før (MilestonesList.tsx:590-611) var «hastende» deadline > now, så
    fristdagen selv hverken var hastende eller forfalden. */
export function sorterAktive(items: Milestone[], nu: Date = new Date()): Milestone[] {
  const raa = (m: Milestone) => ({ status: m.dbStatus, progress: m.progress, deadline: m.deadline });
  return [...items].sort((a, b) => sammenlignAktive(raa(a), raa(b), nu));
}

export interface NyMilestone {
  title: string;
  description: string;
  baseline: string;
  category: MilestoneCategory;
  deadline: Date | undefined;
  targetValue: string;
  unit: string;
}

interface Args {
  userId: string | null;
  companyId: string | null;
  /** Rådgiver (ikke i medlemsvisning): ingen deadline-påmindelser sendes. */
  isAdvisor: boolean;
}

export function useMilestones({ userId, companyId, isAdvisor }: Args) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Hentning: MilestonesList.tsx:527-556 (listen) + Milestones.tsx:53-57
  // (samtalen til aktivitetsbeskeden), slået sammen til ét kald.
  useEffect(() => {
    if (!userId && !companyId) return;
    let aktiv = true;
    const hent = async () => {
      setLoading(true);
      let query = supabase.from("milestones").select("*").order("created_at", { ascending: false });
      if (companyId) query = query.eq("company_id", companyId);
      else if (userId) query = query.eq("user_id", userId);
      const [{ data }, convRes] = await Promise.all([
        query,
        companyId
          ? supabase.from("conversations").select("id").eq("company_id", companyId).maybeSingle()
          : Promise.resolve({ data: null as { id: string } | null }),
      ]);
      if (!aktiv) return;
      type Raekke = {
        id: string; title: string; deadline: string | null; status: string; description: string | null;
        source: string; source_report: string | null; progress: number | null; category: string | null;
        baseline: string | null; target_value: number | null; current_value: number | null; unit: string | null;
        progress_updated_at: string | null; completed_at: string | null; created_at: string;
      };
      const nu = new Date();
      const mapped: Milestone[] = ((data || []) as unknown as Raekke[]).map((m) => ({
        id: m.id,
        title: m.title,
        deadline: m.deadline ? new Date(m.deadline) : null,
        dbStatus: m.status as string,
        ...doem({ dbStatus: m.status, progress: m.progress ?? 0, deadline: m.deadline ? new Date(m.deadline) : null }, nu),
        description: m.description,
        source: m.source,
        source_report: m.source_report,
        progress: m.progress ?? 0,
        category: (m.category || "other") as MilestoneCategory,
        baseline: m.baseline || null,
        target_value: m.target_value ?? null,
        current_value: m.current_value ?? null,
        unit: m.unit ?? null,
        progress_updated_at: m.progress_updated_at ?? null,
        completed_at: m.completed_at ?? null,
        created_at: m.created_at,
      }));
      setMilestones(mapped);
      setConversationId(convRes.data?.id ?? null);
      setLoading(false);
    };
    hent();
    return () => {
      aktiv = false;
    };
  }, [userId, companyId, refreshKey]);

  // Deadline-påmindelser (Slack) 3 og 7 dage før — MilestonesList.tsx:558-585.
  // Kun AKTIVE (dommen): før sprang den kun færdige (progress >= 100) over,
  // så parkerede med frist fik påmindelser om noget de havde lagt fra sig.
  useEffect(() => {
    if (isAdvisor) return;
    if (!milestones || !userId || !companyId) return;
    const now = new Date();
    const checkDays = [3, 7];
    for (const ms of milestones) {
      if (!ms.deadline || !ms.dom.aktiv) continue;
      const deadline = new Date(ms.deadline);
      const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (checkDays.includes(daysUntil)) {
        supabase.functions.invoke("send-slack-report-notification", {
          body: { event: "milestone_deadline_reminder", milestoneId: ms.id, milestoneTitle: ms.title, daysUntil, userId, companyId },
        }).catch((err) => console.error("[Milestones] Deadline reminder failed:", err));
      }
    }
  }, [milestones, userId, companyId, isAdvisor]);

  /** Fejring ved fuldførelse — MilestonesList.tsx:633-653, ordret. */
  const fejr = useCallback((title: string) => {
    if (conversationId && userId) {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
      postActivityMessage({ conversationId, senderId: userId, content: `🎯 Milestone gennemført: **${title}**`, contextType: "milestone", contextMeta: { title } });
    }
    toast.success("Målet er nået 🎉", { description: "Godt gået — det er sådan en plan bliver til noget.", duration: 5000 });
    if (companyId) {
      supabase.functions.invoke("send-slack-report-notification", {
        body: { event: "milestone_completed", companyId, milestoneTitle: title },
      }).catch((err) => console.error("[Milestones] Completion notification failed:", err));
    }
  }, [conversationId, userId, companyId]);

  /** MilestonesList.tsx:615-654. Parkerede opdateres ikke. */
  const saetFremgang = useCallback(async (id: string, newProgress: number) => {
    const oldMs = milestones.find((m) => m.id === id);
    if (!oldMs) return;
    if (oldMs.dom.parkeret) return;
    const wasNotDone = !oldMs.dom.faerdig;
    const dbStatus = statusEfterFremgang(newProgress);
    const ny = doem({ dbStatus, progress: newProgress, deadline: oldMs.deadline });
    setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, progress: newProgress, dbStatus, ...ny } : m)));
    const { error } = await supabase.from("milestones").update({
      progress: newProgress,
      status: dbStatus,
    }).eq("id", id);
    if (error) { toast.error("Kunne ikke opdatere fremgang"); return; }
    if (wasNotDone && ny.dom.faerdig) fejr(oldMs.title);
  }, [milestones, fejr]);

  /** MilestonesList.tsx:656-689. */
  const saetNuvaerendeVaerdi = useCallback(async (id: string, newCurrentValue: number) => {
    const ms = milestones.find((m) => m.id === id);
    if (!ms || !ms.target_value) return;
    const newProgress = Math.min(100, Math.round((newCurrentValue / ms.target_value) * 100));
    const dbStatus = statusEfterFremgang(newProgress);
    const wasNotDone = !ms.dom.faerdig;
    const ny = doem({ dbStatus, progress: newProgress, deadline: ms.deadline });
    setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, current_value: newCurrentValue, progress: newProgress, dbStatus, ...ny } : m)));
    // current_value står ikke i de genererede typer (samme cast som MilestonesList.tsx:672).
    const payload = { current_value: newCurrentValue, progress: newProgress, status: dbStatus };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("milestones").update(payload as any).eq("id", id);
    if (error) { toast.error("Kunne ikke opdatere fremgang"); return; }
    if (wasNotDone && ny.dom.faerdig) fejr(ms.title);
  }, [milestones, fejr]);

  /** MilestonesList.tsx:691-696. */
  const skiftFuldfoert = useCallback(async (id: string) => {
    const ms = milestones.find((m) => m.id === id);
    if (!ms) return;
    await saetFremgang(id, ms.dom.faerdig ? 0 : 100);
  }, [milestones, saetFremgang]);

  /** «Marker som nået» (fase 3, Jonas 16/9: medlemmet ejer sine mål) — status
      = 'completed', fremdriften røres IKKE (et mål kan nås på 40 %; på 100 %
      er det allerede nået). completed_at sættes af triggeren
      milestone_completed_at (fase 1). Fejringen er den samme som ved 100 %. */
  const markerNaaet = useCallback(async (id: string) => {
    const ms = milestones.find((m) => m.id === id);
    if (!ms || ms.dom.faerdig || ms.dom.parkeret) return;
    const { error } = await supabase.from("milestones").update({ status: "completed" }).eq("id", id);
    if (error) { toast.error("Kunne ikke markere målet som nået"); return; }
    setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, dbStatus: "completed", ...doem({ dbStatus: "completed", progress: m.progress, deadline: m.deadline }) } : m)));
    fejr(ms.title);
  }, [milestones, fejr]);

  /** Genhent listen — efter en skrivning uden om hooket (opgave-luk rykker målets fremdrift). */
  const genhent = useCallback(() => setRefreshKey((k) => k + 1), []);

  /** MilestonesList.tsx:698-703. */
  const slet = useCallback(async (id: string, title: string) => {
    const { error } = await supabase.from("milestones").delete().eq("id", id);
    if (error) { toast.error("Kunne ikke slette målet"); return; }
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    toast.success(`"${title}" er slettet`);
  }, []);

  /** MilestonesList.tsx:705-738, ordret — også parkering (status). */
  const opdaterFelt = useCallback(async (id: string, fields: Record<string, unknown>) => {
    const dbFields: Record<string, unknown> = {};
    const localFields: Record<string, unknown> = {};
    for (const key of ["title", "category", "baseline"] as const) {
      if (key in fields) { dbFields[key] = fields[key] || null; localFields[key] = fields[key] || null; }
    }
    if ("target_value" in fields) { dbFields.target_value = fields.target_value; localFields.target_value = fields.target_value; }
    if ("unit" in fields) { dbFields.unit = fields.unit || null; localFields.unit = fields.unit || null; }
    if ("description" in fields) { dbFields.description = fields.description || null; localFields.description = fields.description || null; }
    if ("deadline" in fields) {
      dbFields.deadline = fields.deadline ? (fields.deadline as Date).toISOString().split("T")[0] : null;
      localFields.deadline = fields.deadline || null;
    }
    if ("status" in fields) {
      dbFields.status = fields.status;
      localFields.dbStatus = fields.status;
    }
    // Fase 3: genåbning af et mål nået på 100 % uden skridt nulstiller fremdriften (som skiftFuldfoert gjorde).
    if ("progress" in fields && typeof fields.progress === "number") {
      dbFields.progress = fields.progress;
      localFields.progress = fields.progress;
    }
    const { error } = await supabase.from("milestones").update(dbFields).eq("id", id);
    // Aktivering af et parkeret mål kan ramme «højst tre» — husets tekst, ikke databasens.
    if (error) { toast.error(maalFejlTekst(error, "Kunne ikke gemme")); return; }
    // Dommen regnes om på den samlede række — status OG deadline kan være ændret.
    setMilestones((prev) => prev.map((m) => {
      if (m.id !== id) return m;
      const ny = { ...m, ...localFields } as Milestone;
      return { ...ny, ...doem(ny) };
    }));
    toast.success("Gemt");
  }, [milestones]);

  /** Oprettelse — Milestones.tsx:96-123, ordret. */
  const opret = useCallback(async (ny: NyMilestone): Promise<boolean> => {
    if (!ny.title.trim() || !userId || !companyId) return false;
    // Samme cast som Milestones.tsx:113 (target_value/current_value/unit).
    const payload = {
      title: ny.title.trim(),
      description: ny.description.trim() || null,
      baseline: ny.baseline.trim() || null,
      category: ny.category,
      deadline: ny.deadline ? ny.deadline.toISOString().split("T")[0] : null,
      company_id: companyId,
      user_id: userId,
      source: "manual",
      progress: 0,
      status: "active",
      target_value: ny.targetValue ? Number(ny.targetValue) : null,
      current_value: ny.targetValue ? 0 : null,
      unit: ny.unit.trim() || null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("milestones").insert(payload as any);
    // Det fjerde aktive mål afvises af databasen (trigger 20260917150000) — husets tekst, ikke databasens.
    if (error) { toast.error(maalFejlTekst(error, "Kunne ikke oprette målet")); return false; }
    toast.success("Målet er sat");
    setRefreshKey((k) => k + 1);
    return true;
  }, [userId, companyId]);

  return { milestones, loading, saetFremgang, saetNuvaerendeVaerdi, skiftFuldfoert, markerNaaet, slet, opdaterFelt, opret, genhent };
}
