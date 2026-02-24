import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useAppConfig } from "@/hooks/useAppConfig";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Settings2,
  Save,
  Loader2,
  Activity,
  Trophy,
  Type,
  RotateCcw,
} from "lucide-react";
import {
  APP_BRANDING,
  PERFORMANCE_SCORE,
  GAMIFICATION,
} from "@/lib/appConfig";

const AdminConfig = () => {
  const { isAdvisor } = useAuth();
  const { branding, performanceScore, gamification, updateConfig } = useAppConfig();

  const [saving, setSaving] = useState<string | null>(null);

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

  if (!isAdvisor) return <Navigate to="/" replace />;

  const handleSave = async (
    key: "branding" | "performance_score" | "gamification",
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
      </div>
    </AppLayout>
  );
};

export default AdminConfig;
