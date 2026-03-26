import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Target, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { da } from "date-fns/locale";

const statusBar: Record<string, string> = {
  active: "bg-chart-warning",
  completed: "bg-primary",
  pending: "bg-muted-foreground/30",
};

const DashboardMilestones = () => {
  const { user, companyId } = useAuth();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["dashboard-milestones", companyId],
    queryFn: async () => {
      const { data: all } = await (supabase
        .from("milestones")
        .select("id, title, progress, status, deadline") as any)
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      return all || [];
    },
    enabled: !!user && !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from("milestones")
        .update({ progress: 100, status: "completed" })
        .eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-milestones"] });
      toast.success("Milestone fuldført! 🎉", {
        description: "Godt gået — du er et skridt tættere på dit mål.",
        duration: 5000,
      });
    },
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
              <div className="flex items-start gap-1.5 mb-1">
                <span className="text-xs text-foreground line-clamp-2 flex-1 leading-snug">{ms.title}</span>
                <button
                  onClick={() => completeMutation.mutate(ms.id)}
                  className="flex-shrink-0 p-0.5 rounded hover:bg-primary/10 transition-colors"
                  title="Markér som færdig"
                >
                  <Check className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                </button>
              </div>
              {ms.deadline && (
                <p className="text-[10px] text-muted-foreground mb-1">
                  Deadline: {format(new Date(ms.deadline), "d. MMM yyyy", { locale: da })}
                </p>
              )}
              <div className="flex items-center gap-2">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden flex-1">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${statusBar[ms.status] || "bg-chart-warning"}`}
                    style={{ width: `${ms.progress}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground w-7 text-right">{ms.progress}%</span>
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
