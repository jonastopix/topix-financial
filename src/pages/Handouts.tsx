import { useState, useEffect } from "react";
import { ClipboardList } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import HandoutCard from "@/components/HandoutCard";
import HandoutDetail from "@/components/HandoutDetail";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { handoutConfigs, moduleOrder, type HandoutModule } from "@/lib/handoutConfig";
import { calcHandoutProgress } from "@/lib/handoutUtils";

interface HandoutSummary {
  module: HandoutModule;
  status: "not_started" | "in_progress" | "completed";
  progress: number;
  completedAt: string | null;
}

const Handouts = () => {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<HandoutSummary[]>(
    moduleOrder.map(m => ({ module: m, status: "not_started" as const, progress: 0, completedAt: null }))
  );
  const [activeModule, setActiveModule] = useState<HandoutModule | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("handouts")
        .select("module, status, responses, checklist, levers, completed_at")
        .eq("user_id", user.id);

      const map = new Map((data || []).map(d => [d.module, d]));
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
    };
    load();
  }, [user, activeModule]);

  if (activeModule) {
    return (
      <AppLayout>
        <HandoutDetail
          config={handoutConfigs[activeModule]}
          onBack={() => setActiveModule(null)}
        />
      </AppLayout>
    );
  }

  const totalProgress = summaries.length > 0
    ? Math.round(summaries.reduce((s, h) => s + h.progress, 0) / summaries.length)
    : 0;

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
              Udfyld dine handouts for hvert modul · {totalProgress}% samlet fremskridt
            </p>
          </div>
        </div>
      </div>

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
    </AppLayout>
  );
};

export default Handouts;
