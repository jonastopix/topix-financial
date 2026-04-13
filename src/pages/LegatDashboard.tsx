import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, Lock, Calendar, MessageSquare,
  Target, ChevronRight, Sparkles, Clock,
} from "lucide-react";

const HANDOUT_MODULES = [
  { key: "overordnet", label: "Intro & Målsætning", day: 1, description: "Sæt retningen for de næste 12 måneder og identificér dine vigtigste løftestænger." },
  { key: "bogholderi", label: "Bogholderi & Økonomi", day: 3, description: "Få styr på tallene og forstå hvad de fortæller dig om din forretning." },
  { key: "administration", label: "Administration & Kundeservice", day: 5, description: "Strømlin driften og byg systemer der frigiver din tid." },
  { key: "salg", label: "Salg", day: 7, description: "Identificér dine bedste salgsmuligheder og sæt konkrete mål." },
  { key: "marketing", label: "Marketing", day: 9, description: "Find de kanaler der virker for din forretning og prioritér dem." },
] as const;

export default function LegatDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: enrollment, isLoading } = useQuery({
    queryKey: ["legat-enrollment", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await (supabase as any)
        .from("legat_enrollments")
        .select("*, companies(name)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: handouts = [] } = useQuery({
    queryKey: ["legat-handouts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("handouts")
        .select("module, status")
        .eq("user_id", user.id);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: momentumMilestone } = useQuery({
    queryKey: ["legat-momentum-milestone", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await (supabase as any)
        .from("milestones")
        .select("id, title, progress, status")
        .eq("user_id", user.id)
        .eq("source", "legat")
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const currentDay = enrollment ? Math.min(
    Math.max(
      Math.floor((Date.now() - new Date(enrollment.start_date).getTime()) / 86400000) + 1,
      1
    ),
    10
  ) : 1;

  const getHandoutStatus = (moduleKey: string) => {
    const h = handouts.find((hh: any) => hh.module === moduleKey);
    return h?.status || "not_started";
  };

  const isUnlocked = (day: number) => currentDay >= day;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </AppLayout>
    );
  }

  if (!enrollment) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto p-6 text-center">
          <p className="text-muted-foreground">Dit legatforløb kunne ikke findes.</p>
        </div>
      </AppLayout>
    );
  }

  const completedHandouts = handouts.filter((h: any) => h.status === "completed").length;
  const progressPct = Math.round((completedHandouts / 5) * 100);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            The Boardroom Legat
            <span>· Dag {currentDay} af 10</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Dit forløb
          </h1>
          <p className="text-muted-foreground">
            {enrollment.companies?.name || ""}
          </p>
        </div>

        {/* Progress bar */}
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">Forløbsprogress</span>
            <span className="text-muted-foreground">{completedHandouts} / 5 handouts</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            {[1, 3, 5, 7, 9, 10].map(d => (
              <span key={d} className={currentDay >= d ? "text-primary font-medium" : ""}>
                Dag {d}
              </span>
            ))}
          </div>
        </div>

        {/* Momentumkald milestone */}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground">Book dit Momentumkald</h3>
              <p className="text-sm text-muted-foreground">
                {momentumMilestone?.progress === 100
                  ? "Booket — vi glæder os til at tale med dig!"
                  : "Book et 30-minutters kald med Jonas — det er dit første skridt."}
              </p>
            </div>
            {momentumMilestone?.progress !== 100 && (
              <Button
                size="sm"
                onClick={() => window.open("https://theboardroom.dk/momentumkald", "_blank")}
              >
                Book nu →
              </Button>
            )}
            {momentumMilestone?.progress === 100 && (
              <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
            )}
          </div>
        </div>

        {/* Handouts */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Dine moduler</h2>
          {HANDOUT_MODULES.map((module) => {
            const unlocked = isUnlocked(module.day);
            const status = getHandoutStatus(module.key);
            const completed = status === "completed";
            const inProgress = status === "in_progress";

            return (
              <div
                key={module.key}
                className={`rounded-xl border p-4 transition-colors ${unlocked ? "bg-card hover:bg-accent/50 cursor-pointer" : "bg-muted/30 opacity-60"}`}
                onClick={() => {
                  if (unlocked) navigate("/handouts");
                }}
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    {completed ? (
                      <CheckCircle2 className="h-6 w-6 text-green-500" />
                    ) : unlocked ? (
                      <Clock className="h-6 w-6 text-primary" />
                    ) : (
                      <Lock className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${unlocked ? "text-foreground" : "text-muted-foreground"}`}>
                        {module.label}
                      </span>
                      {!unlocked && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          <Lock className="h-3 w-3" /> Dag {module.day}
                        </span>
                      )}
                      {completed && (
                        <span className="text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">Færdig</span>
                      )}
                      {inProgress && (
                        <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">I gang</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{module.description}</p>
                  </div>
                  {unlocked && !completed && (
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Chat link */}
        <div
          className="rounded-xl border bg-card p-4 flex items-center gap-4 hover:bg-accent/50 cursor-pointer transition-colors"
          onClick={() => navigate("/chat")}
        >
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">Chat med Jonas</h3>
            <p className="text-sm text-muted-foreground">Stil spørgsmål undervejs i forløbet</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        </div>

        {/* Milestones link */}
        <div
          className="rounded-xl border bg-card p-4 flex items-center gap-4 hover:bg-accent/50 cursor-pointer transition-colors"
          onClick={() => navigate("/milestones")}
        >
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">Dine mål</h3>
            <p className="text-sm text-muted-foreground">Se milestones fra dine handouts</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        </div>

      </div>
    </AppLayout>
  );
}