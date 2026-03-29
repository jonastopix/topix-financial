import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle2, Circle, Target, X, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

interface CompanyActionsProps {
  companyId: string;
}

interface CompanyAction {
  id: string;
  title: string;
  context: string | null;
  priority: string;
  status: string;
  created_at: string;
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

const CompanyActions = ({ companyId }: CompanyActionsProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [inputValue, setInputValue] = useState("");
  const [showInput, setShowInput] = useState(false);

  const { data: actions = [] } = useQuery({
    queryKey: ["company-actions", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_actions")
        .select("id, title, context, priority, status, created_at")
        .eq("company_id", companyId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(5) as { data: CompanyAction[] | null };

      return (data || []).sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 1;
        const pb = PRIORITY_ORDER[b.priority] ?? 1;
        if (pa !== pb) return pa - pb;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    },
    enabled: !!companyId,
  });

  const updateAction = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      await supabase
        .from("company_actions")
        .update(updates as any)
        .eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-actions", companyId] }),
  });

  const convertToMilestone = useMutation({
    mutationFn: async (action: CompanyAction) => {
      const { error } = await supabase.from("milestones").insert({
        company_id: companyId,
        user_id: user!.id,
        title: action.title,
        description: action.context || undefined,
        status: "active",
        source: "action",
      } as any);
      if (error) throw error;
      await supabase
        .from("company_actions")
        .update({ status: "done", completed_at: new Date().toISOString() } as any)
        .eq("id", action.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-actions", companyId] });
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
      toast.success("Handling konverteret til milestone");
    },
  });

    mutationFn: async (title: string) => {
      await supabase
        .from("company_actions")
        .insert({
          company_id: companyId,
          user_id: user!.id,
          title,
          source_type: "manual",
          status: "open",
          priority: "medium",
        } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-actions", companyId] });
      setInputValue("");
      setShowInput(false);
    },
  });

  const handleSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || !user) return;
    addAction.mutate(trimmed);
  };

  if (actions.length === 0 && !showInput) return null;

  return (
    <div>
      <p className="text-sm font-semibold text-foreground mb-2">Handlinger</p>

      <div className="space-y-1">
        {actions.map((action) => (
          <div key={action.id} className="group flex items-start gap-2 py-1.5">
            <button
              onClick={() =>
                updateAction.mutate({
                  id: action.id,
                  updates: { status: "done", completed_at: new Date().toISOString() },
                })
              }
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
            >
              <Circle className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {action.priority === "high" && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                )}
                {action.priority === "medium" && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-500 shrink-0" />
                )}
                <span className="text-sm font-medium text-foreground">{action.title}</span>
              </div>
              {action.context && (
                <p className="text-xs text-muted-foreground truncate">{action.context}</p>
              )}
            </div>

            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() =>
                  updateAction.mutate({ id: action.id, updates: { status: "parked" } })
                }
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                title="Parkér"
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() =>
                  updateAction.mutate({
                    id: action.id,
                    updates: { status: "dismissed", dismissed_at: new Date().toISOString() },
                  })
                }
                className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                title="Afvis"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showInput ? (
        <div className="flex items-center gap-2 mt-2">
          <input
            autoFocus
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") {
                setShowInput(false);
                setInputValue("");
              }
            }}
            placeholder="Beskriv handling..."
            className="flex-1 text-sm bg-transparent border-b border-border focus:border-primary outline-none py-1 text-foreground placeholder:text-muted-foreground"
          />
          <button
            onClick={handleSubmit}
            disabled={!inputValue.trim() || addAction.isPending}
            className="text-primary hover:text-primary/80 disabled:text-muted-foreground transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Tilføj handling
        </button>
      )}

      {actions.length >= 5 && (
        <Link
          to="/actions"
          className="block mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Se alle →
        </Link>
      )}
    </div>
  );
};

export default CompanyActions;
