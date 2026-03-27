import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageCircle, ThumbsUp, AlertCircle, Target, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";

const PulseCheckin = () => {
  const { user, companyId, isAdvisor: rawAdvisor } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const navigate = useNavigate();
  const [wentWell, setWentWell] = useState("");
  const [challenge, setChallenge] = useState("");
  const [milestoneProgress, setMilestoneProgress] = useState(50);
  const [saving, setSaving] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);

  const now = new Date();
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const periodLabel = now.toLocaleDateString("da-DK", { month: "long", year: "numeric" });

  useEffect(() => {
    if (!user || !companyId) return;
    (supabase
      .from("pulse_checkins" as any)
      .select("id")
      .eq("company_id", companyId)
      .eq("period_key", periodKey)
      .maybeSingle() as any)
      .then(({ data }: any) => { if (data) setAlreadyDone(true); });
  }, [user, companyId, periodKey]);

  if (isAdvisor) return <Navigate to="/" replace />;

  const handleSubmit = async () => {
    if (!user || !companyId) return;
    setSaving(true);
    const { error } = await (supabase
      .from("pulse_checkins" as any)
      .upsert({
        company_id: companyId,
        user_id: user.id,
        period_key: periodKey,
        went_well: wentWell.trim() || null,
        biggest_challenge: challenge.trim() || null,
        milestone_progress: milestoneProgress,
      }, { onConflict: "company_id,period_key" }) as any);
    setSaving(false);
    if (error) { toast.error("Noget gik galt. Prøv igen."); return; }
    toast.success("Check-in gemt!");
    supabase.functions.invoke("send-slack-report-notification", {
      body: {
        event: "pulse_checkin_received",
        companyId,
        periodKey,
      },
    }).catch(() => {});
    navigate("/");
  };

  if (alreadyDone) {
    return (
      <AppLayout>
        <div className="text-center py-12 animate-fade-in">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-5">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-display font-bold text-foreground mb-2">
            Check-in for {periodLabel} er sendt
          </h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
            Dine rådgivere kan nu se din opdatering og vil tage den med
            i deres sparring med dig.
          </p>
          <button
            onClick={() => setAlreadyDone(false)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
          >
            Opdatér alligevel
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-4">
            <MessageCircle className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground mb-2">
            Månedlig check-in · {periodLabel}
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            2 minutter der hjælper os med at give dig den bedste sparring.
            Dine svar er kun synlige for dig og dine rådgivere.
          </p>
        </div>

        {/* Field 1 */}
        <div className="glass-card rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <ThumbsUp className="h-3.5 w-3.5 text-primary" />
            </div>
            <label className="text-sm font-semibold text-foreground">
              Hvad er gået godt denne måned?
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">
            En ordre, et nyt samarbejde, en beslutning du er stolt af,
            en medarbejder der har gjort det godt — stort eller småt.
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
        <div className="glass-card rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-7 w-7 rounded-lg bg-chart-warning/10 flex items-center justify-center shrink-0">
              <AlertCircle className="h-3.5 w-3.5 text-chart-warning" />
            </div>
            <label className="text-sm font-semibold text-foreground">
              Hvad er din største udfordring lige nu?
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">
            Det er her vi kan hjælpe mest. Jo mere konkret du er,
            des bedre sparring kan vi give dig.
          </p>
          <textarea
            value={challenge}
            onChange={e => setChallenge(e.target.value)}
            rows={3}
            placeholder="Skriv her..."
            className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50 resize-none"
          />
        </div>

        {/* Field 3 — milestone progress */}
        <div className="glass-card rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <Target className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <label className="text-sm font-semibold text-foreground">
              Hvor langt er du med dine milestones?
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">
            Samlet vurdering af din fremgang mod de mål du har sat.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground w-16">Ikke startet</span>
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={milestoneProgress}
                onChange={e => setMilestoneProgress(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground w-16 text-right">Fuldt nået</span>
          </div>
          <div className="mt-3 text-center">
            <span className="text-2xl font-display font-bold text-foreground">
              {milestoneProgress}%
            </span>
            <span className="text-xs text-muted-foreground ml-1">fremgang</span>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving || (!wentWell.trim() && !challenge.trim())}
          className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Gemmer...</>
          ) : (
            <>Send check-in til rådgiverne <ChevronRight className="h-4 w-4" /></>
          )}
        </button>
        <p className="text-center text-[11px] text-muted-foreground mt-3">
          Dine rådgivere modtager besked og vil følge op hvis relevant.
        </p>
      </div>
    </AppLayout>
  );
};

export default PulseCheckin;
