import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface BudgetCategory {
  category: string;
  budget_amount: number;
}

const BudgetOverview = () => {
  const { user } = useAuth();

  const { data: categories = [] } = useQuery({
    queryKey: ["budget-overview", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_targets")
        .select("category, budget_amount")
        .eq("user_id", user!.id)
        .order("budget_amount", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []) as BudgetCategory[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const totalBudget = categories.reduce((s, c) => s + Number(c.budget_amount), 0);
  const hasData = categories.length > 0;

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-foreground">Budget</h3>
        {hasData && (
          <span className="text-xs font-medium text-primary">
            {(totalBudget / 1000).toFixed(0)}k i alt
          </span>
        )}
      </div>
      {hasData ? (
        <div className="space-y-4">
          {categories.map((cat) => {
            const maxAmount = categories[0]?.budget_amount || 1;
            const pct = Math.round((Number(cat.budget_amount) / maxAmount) * 100);
            return (
              <div key={cat.category}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-foreground">{cat.category}</span>
                  <span className="text-xs text-muted-foreground">
                    {(Number(cat.budget_amount) / 1000).toFixed(1)}k DKK
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">
          Ingen budgetposter endnu. Gå til Budget-siden for at oprette.
        </p>
      )}
    </div>
  );
};

export default BudgetOverview;
