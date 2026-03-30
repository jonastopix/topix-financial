import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingDown, Wallet, AlertTriangle, ChevronRight, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";

interface Alert {
  id: string;
  type: string;
  title: string;
  body: string | null;
  company_id: string;
  company_name: string;
  created_at: string;
  seen_at: string | null;
}

const TYPE_CONFIG: Record<string, { icon: typeof TrendingDown; color: string; bg: string }> = {
  alert_revenue_drop:    { icon: TrendingDown,  color: "text-amber-600 dark:text-amber-400",       bg: "bg-amber-500/10" },
  alert_negative_cash:   { icon: Wallet,        color: "text-destructive",                          bg: "bg-destructive/10" },
  alert_result_negative: { icon: AlertTriangle, color: "text-destructive",                          bg: "bg-destructive/10" },
};

interface AdvisorAlertsPanelProps {
  onCompanyClick: (companyId: string, companyName: string, reason?: string) => void;
}

export default function AdvisorAlertsPanel({ onCompanyClick }: AdvisorAlertsPanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["advisor-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-advisor-alerts");
      if (error) throw error;
      return data.alerts as Alert[];
    },
    staleTime: 5 * 60_000,
  });

  const alerts = data || [];

  if (isLoading) return (
    <div className="h-20 rounded-xl bg-secondary/30 animate-pulse" />
  );

  if (alerts.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <h2 className="text-sm font-semibold text-foreground">Finansielle alerts</h2>
        </div>
        <span className="text-xs text-muted-foreground">Seneste 60 dage</span>
      </div>

      <div className="space-y-1">
        {alerts.map(alert => {
          const cfg = TYPE_CONFIG[alert.type] || TYPE_CONFIG.alert_result_negative;
          const Icon = cfg.icon;
          const timeAgo = formatDistanceToNow(new Date(alert.created_at), { locale: da, addSuffix: true });

          return (
            <button
              key={alert.id}
              onClick={() => onCompanyClick(alert.company_id, alert.company_name, alert.type)}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/60 transition-colors text-left group"
            >
              <div className={`shrink-0 h-8 w-8 rounded-lg ${cfg.bg} flex items-center justify-center`}>
                <Icon className={`h-4 w-4 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{alert.company_name}</p>
                <p className="text-xs text-muted-foreground truncate">{alert.title}</p>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
