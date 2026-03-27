import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, ChevronRight, CheckCircle2 } from "lucide-react";

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
    // Notify advisors (fire and forget)
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
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-display font-bold text-foreground mb-2">
            Check-in allerede udfyldt
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm text-center mb-6">
            Du har allerede udfyldt dit check-in for {periodLabel}.
          </p>
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => setAlreadyDone(false)}
              className="text-sm text-primary hover:underline"
            >
              Opdater dit svar
            </button>
            <button onClick={() => navigate("/")} className="text-xs text-muted-foreground hover:underline">
              Tilbage til dashboard
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              Månedlig pulse
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            3 hurtige spørgsmål for {periodLabel} — tager 2 minutter
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Dine rådgivere læser dit svar inden næste boardroom-session.
          </p>
        </div>

        <div className="space-y-5">
          <div className="glass-card rounded-xl p-6">
            <label className="block text-sm font-semibold text-foreground mb-2">
              Hvad gik godt siden sidst?
            </label>
            <textarea
              value={wentWell}
              onChange={e => setWentWell(e.target.value)}
              placeholder="F.eks. en stor ordre, et nyt teammedlem, en milestone nået..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="glass-card rounded-xl p-6">
            <label className="block text-sm font-semibold text-foreground mb-2">
              Hvad er din største udfordring lige nu?
            </label>
            <textarea
              value={challenge}
              onChange={e => setChallenge(e.target.value)}
              placeholder="F.eks. rekruttering, likviditet, en svær kundesituation..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="glass-card rounded-xl p-6">
            <label className="block text-sm font-semibold text-foreground mb-3">
              Hvor langt er du på dit vigtigste milestone?
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={milestoneProgress}
                onChange={e => setMilestoneProgress(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-2xl font-bold text-primary min-w-[4rem] text-right">
                {milestoneProgress}%
              </span>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Gemmer..." : "Gem check-in"}
            {!saving && <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </AppLayout>
  );
};

export default PulseCheckin;
