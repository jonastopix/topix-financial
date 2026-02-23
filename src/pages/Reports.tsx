import AppLayout from "@/components/AppLayout";
import FileUploadZone from "@/components/FileUploadZone";
import { FileText, CheckCircle2, Clock, AlertCircle, MessageSquare } from "lucide-react";

const pastReports = [
  {
    id: "2",
    month: "Januar 2026",
    status: "submitted" as const,
    highlights: ["MRR nåede 98k DKK", "Lancerede ny pricing model", "Ansatte 2 nye udviklere"],
    feedbackCount: 4,
    submittedAt: "28. jan 2026",
  },
  {
    id: "3",
    month: "December 2025",
    status: "submitted" as const,
    highlights: ["Lukkede 15 nye kunder", "Reducerede churn til 3%", "Launched v2.0"],
    feedbackCount: 6,
    submittedAt: "30. dec 2025",
  },
  {
    id: "4",
    month: "November 2025",
    status: "submitted" as const,
    highlights: ["Første enterprise-kunde", "Team voksede til 5 personer"],
    feedbackCount: 3,
    submittedAt: "27. nov 2025",
  },
];

const statusConfig = {
  submitted: { icon: CheckCircle2, label: "Indsendt", className: "text-primary", bg: "bg-primary/10" },
  pending: { icon: Clock, label: "Afventer", className: "text-chart-warning", bg: "bg-chart-warning/10" },
  overdue: { icon: AlertCircle, label: "Forsinket", className: "text-destructive", bg: "bg-destructive/10" },
};

const Reports = () => {
  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
          Rapportering
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload dine finansielle dokumenter til The Boardroom
        </p>
      </div>

      {/* Upload section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <FileUploadZone
          title="Saldobalance"
          description="Upload din seneste saldobalance (Excel, CSV eller PDF)"
          accept=".xlsx,.xls,.csv,.pdf"
        />
        <FileUploadZone
          title="Resultatopgørelse"
          description="Upload din seneste resultatopgørelse (Excel, CSV eller PDF)"
          accept=".xlsx,.xls,.csv,.pdf"
        />
      </div>

      {/* Previous reports */}
      <h2 className="font-display font-semibold text-foreground text-lg mb-4">
        Tidligere rapporter
      </h2>
      <div className="space-y-4">
        {pastReports.map((report) => {
          const config = statusConfig[report.status];
          const Icon = config.icon;
          return (
            <div key={report.id} className="glass-card rounded-xl p-6 animate-fade-in hover:border-primary/20 transition-all cursor-pointer group">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors">
                      {report.month}
                    </h3>
                    {report.submittedAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Indsendt {report.submittedAt}
                      </p>
                    )}
                    {report.highlights.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {report.highlights.map((h, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                            <div className="h-1 w-1 rounded-full bg-primary" />
                            {h}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {report.feedbackCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      {report.feedbackCount}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${config.bg} ${config.className}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {config.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AppLayout>
  );
};

export default Reports;
