import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";

function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

interface WeeklyFocusWidgetProps {
  companyId: string;
}

export default function WeeklyFocusWidget({ companyId }: WeeklyFocusWidgetProps) {
  const weekKey = getISOWeekKey(new Date());
  const seenMarked = useRef(false);

  const { data } = useQuery({
    queryKey: ["weekly-focus", companyId, weekKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_focus")
        .select("*")
        .eq("company_id", companyId)
        .eq("week_key", weekKey)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const markSeen = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from("weekly_focus")
        .update({ seen_at: new Date().toISOString() } as any)
        .eq("id", id);
    },
  });

  useEffect(() => {
    if (data && !data.seen_at && !seenMarked.current) {
      seenMarked.current = true;
      markSeen.mutate(data.id);
    }
  }, [data]);

  if (!data || data.status !== "active") return null;

  const weekNumber = weekKey.split("-W")[1]?.replace(/^0/, "") || "";

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">
            Ugens fokus
          </span>
        </div>
        <span className="text-xs text-muted-foreground">Uge {weekNumber}</span>
      </div>

      <h3 className="text-base font-semibold text-foreground mt-2">
        {data.headline}
      </h3>

      <p className="text-sm text-muted-foreground mt-1">{data.summary}</p>

      {data.actions_generated > 0 && (
        <p
          className="text-xs text-primary cursor-pointer mt-3"
          onClick={() =>
            document.getElementById("company-actions")?.scrollIntoView({ behavior: "smooth" })
          }
        >
          Se dine {data.actions_generated} handlinger nedenfor →
        </p>
      )}
    </div>
  );
}
