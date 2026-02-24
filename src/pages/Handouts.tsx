import { useState, useEffect } from "react";
import { ClipboardList } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import HandoutCard from "@/components/HandoutCard";
import HandoutDetail from "@/components/HandoutDetail";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { handoutConfigs, moduleOrder, type HandoutModule, type HandoutConfig } from "@/lib/handoutConfig";

interface HandoutSummary {
  module: HandoutModule;
  status: "not_started" | "in_progress" | "completed";
  progress: number;
}

function calcProgress(config: HandoutConfig, responses: Record<string, string>, checklist: Record<string, boolean>, levers: string[]): number {
  const totalFields = config.sections.reduce((sum, s) => {
    let count = s.questions.filter(q => q.type === "textarea").length;
    if (s.checklist) count += s.checklist.length;
    count += s.questions.filter(q => q.type === "numbered_list").reduce((a, q) => a + (q.count || 2), 0);
    return sum + count;
  }, 0) + config.leverCount;

  const filled = Object.values(responses).filter(v => v.trim()).length
    + Object.values(checklist).filter(v => v).length
    + levers.filter(v => v.trim()).length;

  return totalFields > 0 ? Math.round((filled / totalFields) * 100) : 0;
}

const Handouts = () => {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<HandoutSummary[]>(
    moduleOrder.map(m => ({ module: m, status: "not_started" as const, progress: 0 }))
  );
  const [activeModule, setActiveModule] = useState<HandoutModule | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("handouts")
        .select("module, status, responses, checklist, levers")
        .eq("user_id", user.id);

      const map = new Map((data || []).map(d => [d.module, d]));
      setSummaries(moduleOrder.map(m => {
        const d = map.get(m);
        if (!d) return { module: m, status: "not_started" as const, progress: 0 };
        const config = handoutConfigs[m];
        const progress = calcProgress(
          config,
          (d.responses as Record<string, string>) || {},
          (d.checklist as Record<string, boolean>) || {},
          (d.levers as string[]) || []
        );
        return { module: m, status: d.status as HandoutSummary["status"], progress };
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
            onClick={() => setActiveModule(s.module)}
          />
        ))}
      </div>
    </AppLayout>
  );
};

export default Handouts;
