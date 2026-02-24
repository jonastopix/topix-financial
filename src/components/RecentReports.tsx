import { FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { da } from "date-fns/locale";

interface Report {
  id: string;
  report_period: string | null;
  status: string;
  uploaded_at: string;
}

const statusConfig = {
  processed: { icon: CheckCircle2, label: "Behandlet", className: "text-primary", bg: "bg-primary/10" },
  processing: { icon: Clock, label: "Behandles", className: "text-chart-warning", bg: "bg-chart-warning/10" },
  error: { icon: AlertCircle, label: "Fejl", className: "text-destructive", bg: "bg-destructive/10" },
};

const RecentReports = () => {
  const { user } = useAuth();

  const { data: reports = [] } = useQuery({
    queryKey: ["recent-reports", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_reports")
        .select("id, report_period, status, uploaded_at")
        .eq("user_id", user!.id)
        .order("uploaded_at", { ascending: false })
        .limit(4);
      if (error) throw error;
      return (data || []) as Report[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-foreground">Rapporter</h3>
        <Link to="/reports" className="text-xs text-primary hover:text-primary/80 font-medium transition-colors">
          Se alle →
        </Link>
      </div>
      <div className="space-y-3">
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Ingen rapporter endnu. Upload din første rapport.
          </p>
        ) : (
          reports.map((report) => {
            const config = statusConfig[report.status as keyof typeof statusConfig] || statusConfig.processing;
            const Icon = config.icon;
            return (
              <Link
                key={report.id}
                to="/reports"
                className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer group"
              >
                <div className="p-2 rounded-lg bg-muted">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {report.report_period || "Ukendt periode"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Uploadet {format(new Date(report.uploaded_at), "d. MMM yyyy", { locale: da })}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${config.bg} ${config.className}`}>
                  <Icon className="h-3 w-3" />
                  {config.label}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
};

export default RecentReports;
