import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ThumbsUp, AlertCircle, Target, ChevronRight, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";

interface PulseCheckinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
  inline?: boolean;
  periodKeyOverride?: string;
  periodLabelOverride?: string;
}

export default function PulseCheckinModal({ open, onOpenChange, onComplete, inline, periodKeyOverride, periodLabelOverride }: PulseCheckinModalProps) {
  const { user, companyId } = useAuth();
  const queryClient = useQueryClient();
  const { viewingAsMember } = useViewMode();
  const [wentWell, setWentWell] = useState("");
  const [challenge, setChallenge] = useState("");
  const [helpNeeded, setHelpNeeded] = useState("");

  const { data: milestoneData } = useQuery({
    queryKey: ["pulse-milestones", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("milestones")
        .select("progress, title, status")
        .eq("company_id", companyId)
        .eq("status", "active");
      return data || [];
    },
    enabled: !!companyId && open,
    staleTime: 60_000,
  });

  const autoProgress = milestoneData && milestoneData.length > 0
    ? Math.round(milestoneData.reduce((s, m) => s + (m.progress || 0), 0) / milestoneData.length)
    : null;
  const [saving, setSaving] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [existingAuthorId, setExistingAuthorId] = useState<string | null>(null);

  const { data: history } = useQuery({
    queryKey: ["pulse-history", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("pulse_checkins")
        .select("period_key, went_well, biggest_challenge, help_needed, created_at")
        .eq("company_id", companyId)
        .order("period_key", { ascending: false })
        .limit(6);
      return data || [];
    },
    enabled: !!companyId && open,
    staleTime: 5 * 60_000,
  });

  // Model B: the reflection is shared per company. If a colleague wrote/updated
  // the current period's row, resolve their name so we can tell the viewer.
  const isColleagueAuthored = !!existingAuthorId && existingAuthorId !== user?.id;
  const { data: authorName } = useQuery({
    queryKey: ["pulse-author", existingAuthorId],
    queryFn: async () => {
      if (!existingAuthorId) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", existingAuthorId)
        .maybeSingle();
      return data?.full_name ?? null;
    },
    enabled: isColleagueAuthored,
    staleTime: 5 * 60_000,
  });

  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodKey = periodKeyOverride ?? `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
  const periodLabel = periodLabelOverride ?? prevMonth.toLocaleDateString("da-DK", { month: "long", year: "numeric" });

  useEffect(() => {
    if (!user || !companyId || !open) return;
    // Reset before (re)loading so stale state from a previous period/open never
    // lingers (the modal instance is reused across opens in Reports.tsx).
    setAlreadyDone(false);
    setExistingAuthorId(null);
    setWentWell("");
    setChallenge("");
    setHelpNeeded("");
    // Guard against an out-of-order resolve: a slow query for an earlier period
    // must not overwrite a faster query started after it (re-open/period switch).
    let cancelled = false;
    supabase
      .from("pulse_checkins")
      .select("id, user_id, went_well, biggest_challenge, help_needed")
      .eq("company_id", companyId)
      .eq("period_key", periodKey)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setAlreadyDone(true);
          setExistingAuthorId(data.user_id ?? null);
          setWentWell(data.went_well || "");
          setChallenge(data.biggest_challenge || "");
          setHelpNeeded(data.help_needed || "");
        }
      });
    return () => { cancelled = true; };
  }, [user, companyId, periodKey, open]);

  const handleSubmit = async () => {
    if (!user) { toast.error("Du skal være logget ind for at gemme din refleksion."); return; }
    if (!companyId) { toast.error("Din konto er ikke knyttet til en virksomhed endnu. Genindlæs siden og prøv igen."); return; }
    setSaving(true);
    let error: unknown = null;
    try {
      const res = await supabase
        .from("pulse_checkins")
        .upsert({
          company_id: companyId,
          user_id: user.id,
          period_key: periodKey,
          went_well: wentWell.trim() || null,
          biggest_challenge: challenge.trim() || null,
          help_needed: helpNeeded.trim() || null,
          milestone_progress: autoProgress ?? null,
        }, { onConflict: "company_id,period_key" });
      error = res.error;
    } catch (e) {
      // Network-level rejection (not a returned {error}) would otherwise strand
      // the button on "Gemmer…" — catch it so we always clear saving + notify.
      console.error("[PulseCheckin] upsert threw:", e);
      error = e;
    } finally {
      setSaving(false);
    }
    if (error) { toast.error("Noget gik galt. Prøv igen."); return; }
    toast.success("Din refleksion er gemt!");
    queryClient.invalidateQueries({ queryKey: ["mobile-pulse-this-month"] });
    queryClient.invalidateQueries({ queryKey: ["pulse-this-month"] });
    supabase.functions.invoke("send-slack-report-notification", {
      body: { event: "pulse_checkin_received", companyId, periodKey },
    }).catch((err) => console.error("[PulseCheckin] Slack notification failed:", err));
    // Trigger agent to respond to pulse check-in — non-blocking
    supabase.functions.invoke("run-company-agent", {
      body: {
        company_id: companyId,
        trigger: "pulse_submitted",
        period_key: periodKey,
        period_label: periodLabel,
      },
    }).catch((err) => {
      console.warn("Agent pulse trigger failed (non-blocking):", err);
    });
    onComplete?.();
    onOpenChange(false);
  };

  const alreadyDoneContent = (
    <div className="text-center py-8 animate-fade-in">
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-5">
        <CheckCircle2 className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-xl font-display font-bold text-foreground mb-2">
        {isColleagueAuthored
          ? `Jeres refleksion for ${periodLabel} er sendt`
          : `Tak, din refleksion for ${periodLabel} er sendt`}
      </h2>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
        {isColleagueAuthored
          ? `${authorName || "En kollega"} har skrevet virksomhedens refleksion. Du kan opdatere den, hvis du vil tilføje noget.`
          : "Dine rådgivere kan nu se din opdatering og vil tage den med i deres sparring med dig."}
      </p>
      <button
        onClick={() => setAlreadyDone(false)}
        className="text-xs px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        Opdatér alligevel
      </button>
      {history && history.length > 1 && (
        <div className="mt-6 text-left space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Tidligere refleksioner
          </p>
          {history.slice(1, 4).map((h) => (
            <div key={h.period_key} className="rounded-lg bg-secondary/50 p-3 space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground">
                {new Date(h.created_at).toLocaleDateString("da-DK", { month: "long", year: "numeric" })}
              </p>
              {h.went_well && <p className="text-xs text-foreground">✅ {h.went_well}</p>}
              {h.biggest_challenge && <p className="text-xs text-foreground">⚠️ {h.biggest_challenge}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const formContent = (
    <>
      {inline && (
        <button
          onClick={() => onOpenChange(false)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Tilbage
        </button>
      )}

      <div className={inline ? "mb-4" : ""}>
        {inline ? (
          <div className="mb-1">
            <h2 className="text-lg font-semibold leading-none tracking-tight">Hvordan gik {periodLabel}?</h2>
            <p className="text-sm text-muted-foreground mt-1.5">2 minutter der hjælper os med at give dig den bedste sparring.</p>
          </div>
        ) : (
          <DialogHeader>
            <DialogTitle>Hvordan gik {periodLabel}?</DialogTitle>
            <DialogDescription>
              2 minutter der hjælper os med at give dig den bedste sparring.
            </DialogDescription>
          </DialogHeader>
        )}
      </div>

      {/* Colleague-authored notice (shared company reflection) */}
      {isColleagueAuthored && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5 mb-4 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <span>
            <span className="font-medium text-foreground">{authorName || "En kollega"}</span>{" "}
            har allerede skrevet virksomhedens refleksion for {periodLabel}. Du redigerer den fælles refleksion.
          </span>
        </div>
      )}

      {/* Field 1 */}
      <div className="rounded-xl border border-border p-4 mb-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ThumbsUp className="h-3.5 w-3.5 text-primary" />
          </div>
          <label className="text-sm font-semibold text-foreground">
            Hvad er gået godt denne måned?
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          En ordre, et nyt samarbejde, en beslutning du er stolt af — stort eller småt.
        </p>
        <textarea
          value={wentWell}
          onChange={e => setWentWell(e.target.value)}
          rows={3}
          placeholder="Skriv her..."
          className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50 resize-none"
        />
      </div>

      {/* Field 2 */}
      <div className="rounded-xl border border-border p-4 mb-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-7 w-7 rounded-lg bg-chart-warning/10 flex items-center justify-center shrink-0">
            <AlertCircle className="h-3.5 w-3.5 text-chart-warning" />
          </div>
          <label className="text-sm font-semibold text-foreground">
            Hvad er din største udfordring lige nu?
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Det er her vi kan hjælpe mest. Jo mere konkret du er, des bedre sparring kan vi give dig.
        </p>
        <textarea
          value={challenge}
          onChange={e => setChallenge(e.target.value)}
          rows={3}
          placeholder="Skriv her..."
          className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50 resize-none"
        />
      </div>

      {/* Field 2b — Help needed */}
      <div className="rounded-xl border border-border p-4 mb-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ChevronRight className="h-3.5 w-3.5 text-primary" />
          </div>
          <label className="text-sm font-semibold text-foreground">
            Hvad har du brug for hjælp til? <span className="text-muted-foreground font-normal text-xs">(valgfri)</span>
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Dette felt går direkte til dine rådgivere og hjælper dem med at forberede relevant sparring til dig.
        </p>
        <textarea
          value={helpNeeded}
          onChange={e => setHelpNeeded(e.target.value)}
          placeholder="Er der noget konkret du gerne vil have sparring på denne måned?"
          rows={2}
          className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50 resize-none"
        />
      </div>

      {/* Field 3 — Milestone fremgang */}
      <div className="rounded-xl border border-border p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <Target className="h-3.5 w-3.5 text-blue-500" />
          </div>
          <label className="text-sm font-semibold text-foreground">
            Dine milestones
          </label>
        </div>
        {autoProgress !== null ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{milestoneData?.length} aktive milestones</span>
              <span className="text-2xl font-display font-bold text-foreground">{autoProgress}%</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${autoProgress}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Beregnet automatisk fra dine aktive milestones. Opdatér fremgang under Milestones.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Du har ingen aktive milestones endnu.{" "}
            <a href="/milestones" className="text-primary hover:underline">Opret dine første mål →</a>
          </p>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={saving || (!wentWell.trim() && !challenge.trim() && !helpNeeded.trim())}
        className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        {saving ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Gemmer...</>
        ) : (
          <>Send til dine rådgivere <ChevronRight className="h-4 w-4" /></>
        )}
      </button>
      <p className="text-center text-[11px] text-muted-foreground mt-1">
        Dine rådgivere modtager besked og vil følge op hvis relevant.
      </p>
    </>
  );

  const content = alreadyDone ? alreadyDoneContent : formContent;

  if (inline) {
    return <div className="glass-card rounded-xl p-6">{content}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {content}
      </DialogContent>
    </Dialog>
  );
}
