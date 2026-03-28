import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useAppConfig } from "@/hooks/useAppConfig";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Settings2,
  Save,
  Loader2,
  Activity,
  Trophy,
  Type,
  RotateCcw,
  ShieldCheck,
  Shield,
  UserPlus,
  Trash2,
  Send,
  CheckCircle2,
  Clock,
  RefreshCw,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  APP_BRANDING,
  PERFORMANCE_SCORE,
  GAMIFICATION,
} from "@/lib/appConfig";

interface AdvisorEntry {
  email: string;
  name: string;
  status: 'active' | 'pending';
  isAdmin: boolean;
  created_at?: string;
}

const AdminConfig = () => {
  const { isAdvisor, isAdmin } = useAuth();
  const { branding, performanceScore, gamification, meetings, updateConfig } = useAppConfig();

  const [saving, setSaving] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleCircleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-circle", {
        body: { action: "sync" },
      });
      if (error) {
        toast.error("Synkronisering fejlede");
      } else {
        toast.success(`Synkronisering færdig — ${data?.stats?.members_synced ?? 0} medlemmer opdateret`);
      }
    } catch {
      toast.error("Synkronisering fejlede");
    } finally {
      setSyncing(false);
    }
  };

  // ─── Advisor management state ───────────────────────────
  const [advisors, setAdvisors] = useState<AdvisorEntry[]>([]);
  const [advisorsLoading, setAdvisorsLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  // ─── Branding state ─────────────────────────────────────
  const [brandForm, setBrandForm] = useState({
    name: "",
    shortName: "",
    advisorLabel: "",
    chatPlaceholder: "",
  });

  useEffect(() => {
    setBrandForm({
      name: branding.name || "",
      shortName: branding.shortName || "",
      advisorLabel: branding.advisorLabel || "",
      chatPlaceholder: branding.chatPlaceholder || "",
    });
  }, [branding.name, branding.shortName, branding.advisorLabel, branding.chatPlaceholder]);

  // ─── Performance Score state ────────────────────────────
  const [perfForm, setPerfForm] = useState({
    weights: [0.3, 0.25, 0.25, 0.2] as number[],
    growthMultiplier: 2,
    marginMultiplier: 2,
    profitMultiplier: 3,
    liquidityMonths: 6,
    defaultSalaryFallback: 50000,
  });

  useEffect(() => {
    setPerfForm({
      weights: [...(performanceScore.weights || [0.3, 0.25, 0.25, 0.2])],
      growthMultiplier: performanceScore.growthMultiplier ?? 2,
      marginMultiplier: performanceScore.marginMultiplier ?? 2,
      profitMultiplier: performanceScore.profitMultiplier ?? 3,
      liquidityMonths: performanceScore.liquidityMonths ?? 6,
      defaultSalaryFallback: performanceScore.defaultSalaryFallback ?? 50000,
    });
  }, [performanceScore.growthMultiplier, performanceScore.marginMultiplier, performanceScore.profitMultiplier, performanceScore.liquidityMonths, performanceScore.defaultSalaryFallback]);

  // ─── Gamification state ─────────────────────────────────
  const [gamForm, setGamForm] = useState({
    pointsPerReport: 10,
    pointsPerMilestone: 25,
    levels: [] as { threshold: number; label: string; emoji: string }[],
  });

  useEffect(() => {
    setGamForm({
      pointsPerReport: gamification.pointsPerReport ?? 10,
      pointsPerMilestone: gamification.pointsPerMilestone ?? 25,
      levels: [...(gamification.levels || [])].map((l) => ({ ...l })),
    });
  }, [gamification.pointsPerReport, gamification.pointsPerMilestone, gamification.levels]);

  // ─── Meetings state ─────────────────────────────────────
  const [meetingDate, setMeetingDate] = useState<string>(
    meetings.next_meeting_date || ""
  );

  useEffect(() => {
    setMeetingDate(meetings.next_meeting_date || "");
  }, [meetings.next_meeting_date]);

  // ─── Load advisors ─────────────────────────────────────
  const loadAdvisors = async () => {
    setAdvisorsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-advisor", {
        body: { action: "list", email: "placeholder" },
      });
      if (error) throw error;
      setAdvisors(data.advisors || []);
    } catch (err: any) {
      console.error("Load advisors error:", err);
    } finally {
      setAdvisorsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) loadAdvisors();
  }, [isAdmin]);

  const handleInviteAdvisor = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-advisor", {
        body: { action: "invite", email: inviteEmail.trim() },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast.success(data.message);
      setInviteEmail("");
      loadAdvisors();
    } catch (err: any) {
      let message = err?.message || "Kunne ikke invitere advisor";

      if (err?.context && typeof err.context.json === "function") {
        try {
          const payload = await err.context.json();
          if (payload?.error) {
            message = payload.error;
          }
        } catch {
          // ignore parsing error and use fallback message
        }
      }

      toast.error(message);
      setInviting(false);
    }
  };

  const handleRemoveAdvisor = async (email: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-advisor", {
        body: { action: "remove", email },
      });
      if (error) throw error;
      toast.success(data.message || "Advisor fjernet");
      loadAdvisors();
    } catch (err: any) {
      toast.error(err.message || "Kunne ikke fjerne advisor");
    }
  };

  const handleToggleAdmin = async (email: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-advisor", {
        body: { action: "toggle-admin", email },
      });
      if (error) throw error;
      toast.success(data.message);
      loadAdvisors();
    } catch (err: any) {
      toast.error(err.message || "Kunne ikke ændre admin-rolle");
    }
  };

  if (!isAdmin) return <Navigate to="/" replace />;

  const handleSave = async (
    key: "branding" | "performance_score" | "gamification" | "meetings",
    value: any
  ) => {
    setSaving(key);
    try {
      await updateConfig(key, value);
      toast.success("Konfiguration gemt");
    } catch {
      toast.error("Kunne ikke gemme");
    }
    setSaving(null);
  };


  const weightLabels = ["Vækstrate", "Bruttomargin", "Nettoresultat", "Likviditet"];

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
          <Settings2 className="h-6 w-6 text-primary" />
          Platform-konfiguration
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Administrer globale indstillinger for hele platformen
        </p>
      </div>

      <div className="grid gap-6 max-w-3xl">
        {/* ─── Advisors ────────────────────────────────── */}
        <section className="glass-card rounded-xl p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h2 className="font-display font-semibold text-foreground">Rådgivere</h2>
            </div>
          </div>

          {/* Invite form */}
          <div className="flex gap-2 mb-4">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email på ny rådgiver..."
              onKeyDown={(e) => e.key === "Enter" && handleInviteAdvisor()}
              className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              onClick={handleInviteAdvisor}
              disabled={inviting || !inviteEmail.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Invitér
            </button>
          </div>

          <p className="text-[10px] text-muted-foreground mb-4">
            Hvis brugeren allerede har en konto, får de advisor-rollen med det samme. Ellers sendes en invitation.
          </p>

          {/* Advisor list */}
          {advisorsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : advisors.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Ingen rådgivere endnu</p>
          ) : (
            <div className="space-y-2">
              {advisors.map((a) => (
                <div
                  key={a.email}
                  className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      {a.status === 'active' ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <Clock className="h-4 w-4 text-chart-warning" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {a.name || a.email}
                      </p>
                      {a.name && (
                        <p className="text-xs text-muted-foreground">{a.email}</p>
                      )}
                    </div>
                    {a.status === 'pending' && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-chart-warning/15 text-chart-warning text-[10px] font-semibold">
                        <Send className="h-2.5 w-2.5" /> Afventer signup
                      </span>
                    )}
                    {a.status === 'active' && (
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        a.isAdmin
                          ? "bg-primary/15 text-primary"
                          : "bg-secondary text-muted-foreground"
                      }`}>
                        {a.isAdmin ? <Shield className="h-2.5 w-2.5" /> : <ShieldCheck className="h-2.5 w-2.5" />}
                        {a.isAdmin ? "Admin" : "Advisor"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {a.status === 'active' && (
                      <button
                        onClick={() => handleToggleAdmin(a.email)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          a.isAdmin
                            ? "text-primary hover:text-primary/70 hover:bg-primary/10"
                            : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                        }`}
                        title={a.isAdmin ? "Fjern admin-rolle" : "Gør til admin"}
                      >
                        <Shield className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Fjern advisor-rolle"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Fjern advisor-rolle?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Er du sikker på, at du vil fjerne advisor-rollen fra <strong>{a.name || a.email}</strong>? Denne handling kan ikke fortrydes.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuller</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRemoveAdvisor(a.email)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Fjern
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ─── Branding ───────────────────────────────────── */}
        <section className="glass-card rounded-xl p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-primary" />
              <h2 className="font-display font-semibold text-foreground">Branding</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setBrandForm({
                    name: APP_BRANDING.name,
                    shortName: APP_BRANDING.shortName,
                    advisorLabel: APP_BRANDING.advisorLabel,
                    chatPlaceholder: APP_BRANDING.chatPlaceholder,
                  })
                }
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Nulstil til standard"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleSave("branding", brandForm)}
                disabled={saving === "branding"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving === "branding" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Gem
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              { key: "name", label: "App-navn" },
              { key: "shortName", label: "Kort navn (logo)" },
              { key: "advisorLabel", label: "Rådgiver-label" },
              { key: "chatPlaceholder", label: "Chat-placeholder" },
            ] as const).map((field) => (
              <div key={field.key}>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  {field.label}
                </label>
                <input
                  type="text"
                  value={brandForm[field.key]}
                  onChange={(e) =>
                    setBrandForm((p) => ({ ...p, [field.key]: e.target.value }))
                  }
                  maxLength={100}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            ))}
          </div>
        </section>

        {/* ─── Performance Score ────────────────────────── */}
        <section className="glass-card rounded-xl p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="font-display font-semibold text-foreground">Performance Score</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setPerfForm({
                    weights: [...PERFORMANCE_SCORE.weights],
                    growthMultiplier: PERFORMANCE_SCORE.growthMultiplier,
                    marginMultiplier: PERFORMANCE_SCORE.marginMultiplier,
                    profitMultiplier: PERFORMANCE_SCORE.profitMultiplier,
                    liquidityMonths: PERFORMANCE_SCORE.liquidityMonths,
                    defaultSalaryFallback: PERFORMANCE_SCORE.defaultSalaryFallback,
                  })
                }
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Nulstil til standard"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleSave("performance_score", perfForm)}
                disabled={saving === "performance_score"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving === "performance_score" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Gem
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Scoring-vægte (skal summe til 1.0)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {perfForm.weights.map((w, i) => (
                  <div key={i}>
                    <label className="text-[10px] text-muted-foreground mb-1 block">
                      {weightLabels[i]}
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      value={w}
                      onChange={(e) => {
                        const next = [...perfForm.weights];
                        next[i] = parseFloat(e.target.value) || 0;
                        setPerfForm((p) => ({ ...p, weights: next }));
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                ))}
              </div>
              {Math.abs(perfForm.weights.reduce((s, w) => s + w, 0) - 1) > 0.01 && (
                <p className="text-[10px] text-destructive mt-1">
                  ⚠ Vægtene summer til{" "}
                  {perfForm.weights.reduce((s, w) => s + w, 0).toFixed(2)} — bør være 1.00
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { key: "growthMultiplier", label: "Vækst-multiplikator" },
                { key: "marginMultiplier", label: "Margin-multiplikator" },
                { key: "profitMultiplier", label: "Profit-multiplikator" },
                { key: "liquidityMonths", label: "Likviditets-måneder" },
              ] as const).map((field) => (
                <div key={field.key}>
                  <label className="text-[10px] text-muted-foreground mb-1 block">
                    {field.label}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={perfForm[field.key]}
                    onChange={(e) =>
                      setPerfForm((p) => ({
                        ...p,
                        [field.key]: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Gamification ─────────────────────────────── */}
        <section className="glass-card rounded-xl p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-chart-warning" />
              <h2 className="font-display font-semibold text-foreground">Gamification</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setGamForm({
                    pointsPerReport: GAMIFICATION.pointsPerReport,
                    pointsPerMilestone: GAMIFICATION.pointsPerMilestone,
                    levels: [...GAMIFICATION.levels].map((l) => ({ ...l })),
                  })
                }
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Nulstil til standard"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleSave("gamification", gamForm)}
                disabled={saving === "gamification"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving === "gamification" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Gem
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Point pr. rapport
                </label>
                <input
                  type="number"
                  min="0"
                  value={gamForm.pointsPerReport}
                  onChange={(e) =>
                    setGamForm((p) => ({
                      ...p,
                      pointsPerReport: parseInt(e.target.value) || 0,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Point pr. milestone
                </label>
                <input
                  type="number"
                  min="0"
                  value={gamForm.pointsPerMilestone}
                  onChange={(e) =>
                    setGamForm((p) => ({
                      ...p,
                      pointsPerMilestone: parseInt(e.target.value) || 0,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3">Niveauer</p>
              <div className="space-y-2">
                {gamForm.levels.map((level, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <input
                      type="text"
                      value={level.emoji}
                      maxLength={4}
                      onChange={(e) => {
                        const next = [...gamForm.levels];
                        next[i] = { ...next[i], emoji: e.target.value };
                        setGamForm((p) => ({ ...p, levels: next }));
                      }}
                      className="w-14 px-2 py-1.5 rounded-lg bg-background border border-border text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <input
                      type="number"
                      min="0"
                      value={level.threshold}
                      onChange={(e) => {
                        const next = [...gamForm.levels];
                        next[i] = {
                          ...next[i],
                          threshold: parseInt(e.target.value) || 0,
                        };
                        setGamForm((p) => ({ ...p, levels: next }));
                      }}
                      className="w-20 px-2 py-1.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Points"
                    />
                    <input
                      type="text"
                      value={level.label}
                      maxLength={30}
                      onChange={(e) => {
                        const next = [...gamForm.levels];
                        next[i] = { ...next[i], label: e.target.value };
                        setGamForm((p) => ({ ...p, levels: next }));
                      }}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Niveau-navn"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── Møder ───────────────────────────────────────── */}
        <section className="glass-card rounded-xl p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display font-semibold text-foreground">Næste boardroom-møde</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vises på alle members' dashboard som nedtælling til mødet
              </p>
            </div>
            <button
              onClick={async () => {
                setSaving("meetings");
                await handleSave("meetings", { next_meeting_date: meetingDate || null });
                setSaving(null);
              }}
              disabled={saving === "meetings"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving === "meetings" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Gem dato
            </button>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Dato for næste møde</label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {meetingDate && (
              <p className="text-xs text-muted-foreground">
                Vises som: {new Date(meetingDate).toLocaleDateString("da-DK", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric"
                })}
              </p>
            )}
            {!meetingDate && (
              <p className="text-xs text-muted-foreground italic">
                Ingen dato sat — mødekortet vises ikke på dashboard
              </p>
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
};

export default AdminConfig;
