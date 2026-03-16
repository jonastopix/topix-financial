import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GroupBudgetCompany {
  company_id: string;
  name: string;
  template_key?: string;
  reason?: "no_template" | "ambiguous_template" | "no_budget" | "unmapped_categories";
  unmapped_keys?: string[];
}

export interface GroupBudgetTotals {
  indtaegter: number[];
  variable: number[];
  personale: number[];
  salg_marketing: number[];
  drift: number[];
  faste: number[];
}

export interface GroupBudgetData {
  year: string;
  included: GroupBudgetCompany[];
  excluded: GroupBudgetCompany[];
  totals: GroupBudgetTotals;
}

const EMPTY_TOTALS: GroupBudgetTotals = {
  indtaegter: Array(12).fill(0),
  variable: Array(12).fill(0),
  personale: Array(12).fill(0),
  salg_marketing: Array(12).fill(0),
  drift: Array(12).fill(0),
  faste: Array(12).fill(0),
};

export function useGroupBudget(year: string) {
  return useQuery<GroupBudgetData>({
    queryKey: ["group-budget-summary", year],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_my_group_budget_summary" as any,
        { p_year: year } as any
      );
      if (error) throw error;

      const result = data as any;
      if (result?.error) {
        throw new Error(result.error);
      }

      return {
        year: result?.year ?? year,
        included: result?.included ?? [],
        excluded: result?.excluded ?? [],
        totals: result?.totals ?? EMPTY_TOTALS,
      };
    },
    staleTime: 2 * 60_000,
  });
}
