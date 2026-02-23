import { FileText, Clock, CheckCircle2, AlertCircle } from "lucide-react";

interface Report {
  id: string;
  month: string;
  status: "submitted" | "pending" | "overdue";
  submittedAt?: string;
  feedbackCount: number;
}

const reports: Report[] = [
  { id: "1", month: "Februar 2026", status: "pending", feedbackCount: 0 },
  { id: "2", month: "Januar 2026", status: "submitted", submittedAt: "28. jan", feedbackCount: 4 },
  { id: "3", month: "December 2025", status: "submitted", submittedAt: "30. dec", feedbackCount: 6 },
  { id: "4", month: "November 2025", status: "submitted", submittedAt: "27. nov", feedbackCount: 3 },
];

const statusConfig = {
  submitted: { icon: CheckCircle2, label: "Indsendt", className: "text-primary", bg: "bg-primary/10" },
  pending: { icon: Clock, label: "Afventer", className: "text-chart-warning", bg: "bg-chart-warning/10" },
  overdue: { icon: AlertCircle, label: "Forsinket", className: "text-destructive", bg: "bg-destructive/10" },
};

const RecentReports = () => {
  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-foreground">Rapporter</h3>
        <button className="text-xs text-primary hover:text-primary/80 font-medium transition-colors">
          Se alle →
        </button>
      </div>
      <div className="space-y-3">
        {reports.map((report) => {
          const config = statusConfig[report.status];
          const Icon = config.icon;
          return (
            <div
              key={report.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer group"
            >
              <div className="p-2 rounded-lg bg-muted">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  {report.month}
                </p>
                {report.submittedAt && (
                  <p className="text-xs text-muted-foreground">Indsendt {report.submittedAt}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {report.feedbackCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {report.feedbackCount} feedback
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${config.bg} ${config.className}`}>
                  <Icon className="h-3 w-3" />
                  {config.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RecentReports;
