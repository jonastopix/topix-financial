import { useQuery } from "@tanstack/react-query";
import { Target, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const statusBar: Record<string, string> = {
  active: "bg-chart-warning",
  completed: "bg-primary",
  pending: "bg-muted-foreground/30",
};

const DashboardMilestones = () => {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["dashboard-milestones", user?.id],
    queryFn: async () => {
      const { data: all } = await supabase
        .from("milestones")
        .select("id, title, progress, status")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return all || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const milestones = data || [];
  const active = milestones.filter(m => m.status !== "completed").slice(0, 3);
  const total = milestones.length;
  const doneCount = milestones.filter(m => m.status === "completed" || m.progress >= 100).length;

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-4 w-4 text-chart-warning" />
        <h3 className="font-display font-semibold text-foreground text-sm">Milestones</h3>
        <span className="ml-auto text-[10px] text-muted-foreground">{doneCount}/{total} færdige</span>
      </div>

      {active.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4 flex-1 flex items-center justify-center">
          Ingen aktive milestones
        </p>
      ) : (
        <div className="space-y-3 flex-1">
          {active.map(ms => (
            <div key={ms.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-foreground truncate max-w-[70%]">{ms.title}</span>
                <span className="text-[10px] font-semibold text-muted-foreground">{ms.progress}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${statusBar[ms.status] || "bg-chart-warning"}`}
                  style={{ width: `${ms.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Link
        to="/milestones"
        className="flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors pt-3 mt-auto"
      >
        Se alle milestones <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
};

export default DashboardMilestones;
