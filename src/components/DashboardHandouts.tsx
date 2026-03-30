import { useQuery } from "@tanstack/react-query";
import { BookOpen, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { moduleOrder } from "@/lib/handoutConfig";

const TOTAL_MODULES = moduleOrder.length; // 5

const DashboardHandouts = () => {
  const { user, companyId, isAdvisor: rawAdvisor } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;

  const { data } = useQuery({
    queryKey: ["dashboard-handouts", companyId, isAdvisor, user?.id],
    queryFn: async () => {
      let query = supabase
        .from("handouts")
        .select("id, status, module") as any;
      if (isAdvisor) {
        query = query.eq("company_id", companyId!);
      } else {
        query = query.eq("user_id", user!.id);
      }
      const { data: handouts } = await query;
      return handouts || [];
    },
    enabled: !!user && !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const handouts = data || [];
  const completed = handouts.filter(h => h.status === "completed").length;
  const pct = Math.round((completed / TOTAL_MODULES) * 100);

  const completedModules = new Set(handouts.filter(h => h.status === "completed").map(h => h.module));
  const nextModule = moduleOrder.find(m => !completedModules.has(m));

  const MODULE_LABELS: Record<string, string> = {
    overordnet: "Målsætning",
    bogholderi: "Bogholderi",
    administration: "Administration",
    salg: "Salg",
    marketing: "Marketing",
  };

  const r = 30;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="h-4 w-4 text-chart-info" />
        <h3 className="font-display font-semibold text-foreground text-sm">Handouts</h3>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <div className="relative">
          <svg width="72" height="72" viewBox="0 0 72 72" className="transform -rotate-90">
            <circle cx="36" cy="36" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
            <circle
              cx="36" cy="36" r={r} fill="none"
              stroke="hsl(var(--chart-info))"
              strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-display font-bold text-foreground">{pct}%</span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {completed} af {TOTAL_MODULES} moduler
        </p>
      </div>

      <Link
        to={nextModule ? `/handouts?module=${nextModule}` : "/handouts"}
        className="flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors pt-3 mt-auto"
      >
        {nextModule && completed < TOTAL_MODULES
          ? <>Fortsæt: {MODULE_LABELS[nextModule]} <ArrowRight className="h-3 w-3" /></>
          : <>Se handouts <ArrowRight className="h-3 w-3" /></>
        }
      </Link>
    </div>
  );
};

export default DashboardHandouts;
