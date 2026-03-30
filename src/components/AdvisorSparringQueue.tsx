import { Sparkles, TrendingUp, MessageSquare, Target, FileText, ChevronRight } from "lucide-react";

export interface SparringItem {
  company: { company_id: string; company_name: string; logo_url: string | null };
  signals: { label: string; hint: string }[];
}

const SIGNAL_ICON = (label: string) => {
  if (label.includes("rapport")) return <FileText className="h-3 w-3" />;
  if (label.includes("steg")) return <TrendingUp className="h-3 w-3" />;
  if (label.includes("hjælp")) return <MessageSquare className="h-3 w-3" />;
  if (label.includes("Milestone")) return <Target className="h-3 w-3" />;
  return <Sparkles className="h-3 w-3" />;
};

export default function AdvisorSparringQueue({
  items,
  onCompanyClick,
}: {
  items: SparringItem[];
  onCompanyClick: (companyId: string, companyName: string, signal?: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="glass-card rounded-2xl border border-border/30 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/20">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Klar til sparring</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {items.length} {items.length === 1 ? "virksomhed" : "virksomheder"}
        </span>
      </div>

      <div className="divide-y divide-border/10">
        {items.map(item => (
          <button
            key={item.company.company_id}
            onClick={() => onCompanyClick(item.company.company_id, item.company.company_name, item.signals[0]?.label)}
            className="w-full flex items-center gap-3 p-3 hover:bg-secondary/60 transition-colors text-left group"
          >
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
              {item.company.logo_url ? (
                <img src={item.company.logo_url} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-[10px] font-bold text-muted-foreground">
                  {item.company.company_name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{item.company.company_name}</p>
              <div className="space-y-0.5 mt-0.5">
                {item.signals.map((s, i) => (
                  <div key={i} className="text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1 text-primary/80">
                      {SIGNAL_ICON(s.label)}
                      {s.label}
                    </span>
                    <span className="ml-1">→ {s.hint}</span>
                  </div>
                ))}
              </div>
            </div>

            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
