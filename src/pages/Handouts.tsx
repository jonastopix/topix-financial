import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardList, ArrowLeft, Lightbulb, ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLayout from "@/components/AppLayout";
import HandoutCard from "@/components/HandoutCard";
import HandoutDetail from "@/components/HandoutDetail";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import AdvisorCompanyPrompt from "@/components/AdvisorCompanyPrompt";
import { handoutConfigs, moduleOrder, type HandoutModule } from "@/lib/handoutConfig";
import { calcHandoutProgress } from "@/lib/handoutUtils";
import { useNavigationReset } from "@/hooks/useNavigationReset";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

interface HandoutSummary {
  module: HandoutModule;
  status: "not_started" | "in_progress" | "completed";
  progress: number;
  completedAt: string | null;
  levers: string[];
  checklist: Record<string, boolean>;
}

const Handouts = () => {
  const { user, companyId, isAdvisor: rawAdvisor, isLegat } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const [searchParams, setSearchParams] = useSearchParams();
  const [summaries, setSummaries] = useState<HandoutSummary[]>(
    moduleOrder.map(m => ({ module: m, status: "not_started" as const, progress: 0, completedAt: null, levers: [], checklist: {} }))
  );
  const [activeModule, setActiveModule] = useState<HandoutModule | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Resolved member userId for the selected company (advisor view)
  const [memberUserId, setMemberUserId] = useState<string | null>(null);
  // Per-module user_id from existing handout rows
  const [moduleUserMap, setModuleUserMap] = useState<Record<string, string>>({});
  // Legat module gating
  const { data: legatEnrollment } = useQuery({
    queryKey: ["legat-enrollment-handouts", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await (supabase as any)
        .from("legat_enrollments")
        .select("start_date, status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      return data;
    },
    enabled: !!user && isLegat,
  });

  const legatDay = legatEnrollment ? Math.min(
    Math.max(
      Math.floor((Date.now() - new Date(legatEnrollment.start_date).getTime()) / 86400000) + 1,
      1
    ),
    10
  ) : null;

  const LEGAT_UNLOCK_DAYS: Record<string, number> = {
    overordnet: 1, bogholderi: 3, administration: 5, salg: 7, marketing: 9,
  };

  const isModuleUnlocked = (moduleKey: string): boolean => {
    if (!isLegat || legatDay === null) return true;
    return legatDay >= (LEGAT_UNLOCK_DAYS[moduleKey] ?? 1);
  };

  
  // Deep-link support: ?module=bogholderi opens that handout directly
  useEffect(() => {
    const moduleParam = searchParams.get("module") as HandoutModule | null;
    if (moduleParam && moduleOrder.includes(moduleParam)) {
      setActiveModule(moduleParam);
      // Clear param so back navigation works cleanly
      setSearchParams({}, { replace: true });
    }
  }, []); // only on mount

  // Navigation reset: when sidebar is clicked while on this page, go back to list
  const resetKey = useNavigationReset();
  useEffect(() => {
    if (resetKey) {
      setActiveModule(null);
    }
  }, [resetKey]);

  // Resolve member userId for the selected company (advisor view only)
  // Use deterministic selection: oldest company_members row (first created member = owner)
  useEffect(() => {
    if (!isAdvisor || !companyId) {
      setMemberUserId(null);
      return;
    }
    supabase
      .from("company_members")
      .select("user_id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
      .limit(1)
      .then(({ data }) => {
        setMemberUserId(data?.[0]?.user_id || null);
      });
  }, [isAdvisor, companyId]);

  useEffect(() => {
    if (!user || !companyId) return;
    setIsLoading(true);
    const load = async () => {
      let query = supabase
        .from("handouts")
        .select("module, status, responses, checklist, levers, completed_at, user_id");
      if (isAdvisor) {
        query = query.eq("company_id", companyId!);
      } else {
        query = query.eq("user_id", user!.id);
      }
      const { data } = await query;

      // Build per-module user_id map for advisor deep-linking
      const userMap: Record<string, string> = {};
      const map = new Map((data || []).map(d => {
        userMap[d.module] = d.user_id;
        return [d.module, d];
      }));
      setModuleUserMap(userMap);

      setSummaries(moduleOrder.map(m => {
        const d = map.get(m);
        if (!d) return { module: m, status: "not_started" as const, progress: 0, completedAt: null, levers: [], checklist: {} };
        const config = handoutConfigs[m];
        const levers = (d.levers as string[]) || [];
        const progress = calcHandoutProgress(
          config,
          (d.responses as Record<string, string>) || {},
          (d.checklist as Record<string, boolean>) || {},
          levers
        );
        const checklist = (d.checklist as Record<string, boolean>) || {};
        return { module: m, status: d.status as HandoutSummary["status"], progress, completedAt: (d as any).completed_at || null, levers, checklist };
      }));
      setIsLoading(false);
    };
    load();
  }, [user, activeModule, companyId]);

  if (activeModule) {
    // Resolve the correct member userId for this module
    const resolvedUserId = isAdvisor
      ? (moduleUserMap[activeModule] || memberUserId)
      : undefined; // members use their own user.id via default

    // In advisor view, fail gracefully if we can't resolve a member
    if (isAdvisor && !resolvedUserId) {
      return (
        <AppLayout>
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-sm text-muted-foreground">
              Ingen medlemmer fundet for denne virksomhed. Handout kan ikke vises.
            </p>
            <Button variant="ghost" size="sm" onClick={() => setActiveModule(null)} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Tilbage
            </Button>
          </div>
        </AppLayout>
      );
    }

    return (
      <AppLayout>
        <HandoutDetail
          config={handoutConfigs[activeModule]}
          onBack={() => setActiveModule(null)}
          onModuleSelect={(m) => setActiveModule(m)}
          userId={resolvedUserId || undefined}
        />
      </AppLayout>
    );
  }

  const totalProgress = summaries.length > 0
    ? Math.round(summaries.reduce((s, h) => s + h.progress, 0) / summaries.length)
    : 0;
  const completedCount = summaries.filter(s => s.status === "completed").length;

  if (isAdvisor && !companyId) {
    return (
      <AppLayout>
        <AdvisorCompanyPrompt />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <ClipboardList className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
              Handouts
            </h1>
            <p className="text-sm text-muted-foreground">
              Udfyld dine handouts for hvert modul · {totalProgress}% samlet udfyldt
            </p>
          </div>
        </div>
      </div>

      {!isAdvisor && !isLoading && summaries.length > 0 && (
        <div className="glass-card rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Din fremgang</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {completedCount} af {summaries.length} moduler gennemført
              </p>
            </div>
            <span className="text-2xl font-display font-bold text-foreground">{totalProgress}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-500"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
          {totalProgress === 100 && (
            <p className="text-xs text-primary font-medium mt-2">
              🎉 Alle moduler gennemført — du har lagt et stærkt fundament
            </p>
          )}
        </div>
      )}

      {!isAdvisor && !isLoading && summaries.every(s => s.status === "not_started" && s.progress === 0) && (
        <div className="glass-card rounded-xl p-5 mb-6 flex items-start gap-4">
          <div className="p-2 rounded-lg bg-accent/50 shrink-0 mt-0.5">
            <Lightbulb className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground mb-1">Kom godt i gang med handouts</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Handouts hjælper dig med at strukturere og dokumentere de vigtigste områder i din virksomhed. Start med at sætte dine mål, og fortsæt derefter med bogholderiet.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setActiveModule("overordnet")}
            >
              Start med Målsætning 12 mdr. <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="glass-card rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <div className="flex justify-between">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {summaries.map(s => {
            const locked = !isModuleUnlocked(s.module);
            return (
              <div key={s.module} className="relative">
                {locked ? (
                  <div className="rounded-xl border border-border/40 bg-secondary/20 p-5 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                      <Lock className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-muted-foreground/70">
                        {s.module === "bogholderi" ? "Bogholderi & Økonomi" :
                         s.module === "administration" ? "Administration & Kundeservice" :
                         s.module === "salg" ? "Salg" :
                         s.module === "marketing" ? "Marketing" : s.module}
                      </p>
                      <p className="text-xs text-muted-foreground/50 mt-0.5">
                        Åbner på dag {LEGAT_UNLOCK_DAYS[s.module] ?? "?"} af dit forløb
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs text-muted-foreground/40 bg-secondary/60 px-2.5 py-1 rounded-full">
                        Dag {LEGAT_UNLOCK_DAYS[s.module] ?? "?"}
                      </span>
                    </div>
                  </div>
                ) : (
                <HandoutCard
                  config={handoutConfigs[s.module]}
                  status={s.status}
                  progress={s.progress}
                  completedAt={s.completedAt}
                  onClick={() => setActiveModule(s.module)}
                />
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isAdvisor && !isLoading && (() => {
        const allLevers = summaries.flatMap(s =>
          s.levers.map(lever => ({
            lever,
            module: s.module,
            moduleTitle: handoutConfigs[s.module]?.title || s.module,
          }))
        );

        return (
          <>
            {allLevers.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-1 w-6 rounded-full bg-primary" />
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-widest">
                    Dine valgte løftestænger
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {allLevers.length} aktive
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Dette er de konkrete indsatser du har valgt at arbejde med
                  i dit forløb. Del dem gerne med din rådgiver i chatten.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {allLevers.map((item, i) => (
                    <div key={i}
                      className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30 border border-border/30">
                      <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-foreground leading-snug">
                          {item.lever}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {item.moduleTitle}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {allLevers.length === 0 && summaries.some(s => s.progress > 0) && (
              <div className="mt-8 glass-card rounded-xl p-5 flex items-center gap-4">
                <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
                  <Lightbulb className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Vælg dine løftestænger
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Løftestænger er de konkrete indsatser du vil arbejde med.
                    Du finder dem i hvert handout-modul.
                  </p>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {!isAdvisor && !isLoading && (() => {
        const allChecklistModules = summaries
          .map(s => {
            const config = handoutConfigs[s.module];
            const checklistItems = config.sections
              .flatMap(sec => sec.checklist || []);
            if (checklistItems.length === 0) return null;
            const checkedCount = checklistItems.filter(item => s.checklist?.[item.key]).length;
            return {
              module: s.module,
              title: config.title,
              items: checklistItems,
              checklist: s.checklist || {},
              checkedCount,
              total: checklistItems.length,
            };
          })
          .filter(Boolean);

        if (allChecklistModules.length === 0) return null;

        const totalItems = allChecklistModules.reduce((sum, m) => sum + m!.total, 0);
        const totalChecked = allChecklistModules.reduce((sum, m) => sum + m!.checkedCount, 0);
        const pct = totalItems > 0 ? Math.round((totalChecked / totalItems) * 100) : 0;

        return (
          <div className="glass-card rounded-xl p-6 mt-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Din rejse mod en professionelt drevet virksomhed</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{totalChecked} af {totalItems} milepæle nået</p>
              </div>
              <span className="text-2xl font-display font-bold text-foreground">{pct}%</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2 mb-6">
              <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="space-y-6">
              {allChecklistModules.map(m => m && (
                <div key={m.module}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{m.title}</p>
                    <span className="text-[11px] text-muted-foreground">{m.checkedCount}/{m.total}</span>
                  </div>
                  <div className="space-y-2">
                    {m.items.map(item => (
                      <div key={item.key} className="flex items-start gap-3">
                        <div className={`h-4 w-4 rounded mt-0.5 shrink-0 flex items-center justify-center border transition-colors ${
                          m.checklist[item.key]
                            ? "bg-primary border-primary"
                            : "border-border bg-transparent"
                        }`}>
                          {m.checklist[item.key] && (
                            <svg className="h-2.5 w-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className={`text-xs leading-relaxed ${
                          m.checklist[item.key] ? "text-foreground" : "text-muted-foreground"
                        }`}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {pct < 100 && (
              <p className="text-[11px] text-muted-foreground mt-6 text-center">
                Udfyld handout-modulerne for at markere milepæle som nået
              </p>
            )}
            {pct === 100 && (
              <p className="text-[11px] text-primary font-medium mt-6 text-center">
                🎉 Du driver en professionelt struktureret virksomhed
              </p>
            )}
          </div>
        );
      })()}
    </AppLayout>
  );
};

export default Handouts;
