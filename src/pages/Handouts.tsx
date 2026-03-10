import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardList, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLayout from "@/components/AppLayout";
import HandoutCard from "@/components/HandoutCard";
import HandoutDetail from "@/components/HandoutDetail";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AdvisorCompanyPrompt from "@/components/AdvisorCompanyPrompt";
import { handoutConfigs, moduleOrder, type HandoutModule } from "@/lib/handoutConfig";
import { calcHandoutProgress } from "@/lib/handoutUtils";
import { useNavigationReset } from "@/hooks/useNavigationReset";

interface HandoutSummary {
  module: HandoutModule;
  status: "not_started" | "in_progress" | "completed";
  progress: number;
  completedAt: string | null;
}

const Handouts = () => {
  const { user, companyId, isAdvisor } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [summaries, setSummaries] = useState<HandoutSummary[]>(
    moduleOrder.map(m => ({ module: m, status: "not_started" as const, progress: 0, completedAt: null }))
  );
  const [activeModule, setActiveModule] = useState<HandoutModule | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Resolved member userId for the selected company (advisor view)
  const [memberUserId, setMemberUserId] = useState<string | null>(null);
  // Per-module user_id from existing handout rows
  const [moduleUserMap, setModuleUserMap] = useState<Record<string, string>>({});

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
        if (!d) return { module: m, status: "not_started" as const, progress: 0, completedAt: null };
        const config = handoutConfigs[m];
        const progress = calcHandoutProgress(
          config,
          (d.responses as Record<string, string>) || {},
          (d.checklist as Record<string, boolean>) || {},
          (d.levers as string[]) || []
        );
        return { module: m, status: d.status as HandoutSummary["status"], progress, completedAt: (d as any).completed_at || null };
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
          userId={resolvedUserId || undefined}
        />
      </AppLayout>
    );
  }

  const totalProgress = summaries.length > 0
    ? Math.round(summaries.reduce((s, h) => s + h.progress, 0) / summaries.length)
    : 0;

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
          {summaries.map(s => (
            <HandoutCard
              key={s.module}
              config={handoutConfigs[s.module]}
              status={s.status}
              progress={s.progress}
              completedAt={s.completedAt}
              onClick={() => setActiveModule(s.module)}
            />
          ))}
        </div>
      )}
    </AppLayout>
  );
};

export default Handouts;
