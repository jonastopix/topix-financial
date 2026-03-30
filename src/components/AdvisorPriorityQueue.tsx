import { useState, useEffect, useRef } from "react";
import { MessageSquare, FileCheck, Wallet, TrendingDown, Clock, AlertTriangle, CheckCircle2, ChevronRight, X, UserCheck } from "lucide-react";

interface Reason {
  label: string;
  urgency: "high" | "medium";
}

export interface PriorityItem {
  company: { company_id: string; company_name: string; logo_url: string | null };
  reasons: Reason[];
  score: number;
  assigned_advisor_id?: string | null;
}

const ACTION_HINT: Record<string, string> = {
  besked: "Svar i chatten",
  godkendelse: "Godkend rapporten",
  Bankovertræk: "Tal med founder om likviditet",
  "Omsætning faldt": "Undersøg årsagen i chatten",
  Opfølgning: "Følg op nu",
  "Ingen rapport": "Send reminder til founder",
  "Ingen pulse": "Spørg ind via chatten",
  "Ingen milestones": "Hjælp med at sætte mål",
};

function getActionHint(label: string): string {
  for (const [key, hint] of Object.entries(ACTION_HINT)) {
    if (label.includes(key)) return hint;
  }
  return "Se virksomhed";
}

function ReasonIcon({ label }: { label: string }) {
  if (label.includes("besked")) return <MessageSquare className="h-3 w-3" />;
  if (label.includes("godkendelse")) return <FileCheck className="h-3 w-3" />;
  if (label.includes("Bankovertræk")) return <Wallet className="h-3 w-3" />;
  if (label.includes("Omsætning faldt")) return <TrendingDown className="h-3 w-3" />;
  if (label.includes("Opfølgning")) return <Clock className="h-3 w-3" />;
  return <AlertTriangle className="h-3 w-3" />;
}

interface AdvisorPriorityQueueProps {
  items: PriorityItem[];
  onCompanyClick: (companyId: string, companyName: string, reason?: string) => void;
  advisorProfiles?: { user_id: string; full_name: string }[];
  currentUserId?: string;
  onAssign?: (companyId: string, advisorUserId: string | null) => void;
  onIgnore?: (companyId: string) => void;
}

export default function AdvisorPriorityQueue({ items, onCompanyClick, advisorProfiles, currentUserId, onAssign, onIgnore }: AdvisorPriorityQueueProps) {
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [assignOpen, setAssignOpen] = useState<string | null>(null);

  const visibleItems = items.filter(i => !ignored.has(i.company.company_id));
  const displayItems = showAll ? visibleItems : visibleItems.slice(0, 10);
  const hiddenCount = visibleItems.length - displayItems.length;

  // Close assign dropdown on outside click
  useEffect(() => {
    if (!assignOpen) return;
    const handler = () => setAssignOpen(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [assignOpen]);

  if (visibleItems.length === 0) return (
    <div className="glass-card rounded-xl p-6 flex items-center gap-4">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <CheckCircle2 className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Alle virksomheder er på sporet</p>
        <p className="text-xs text-muted-foreground">Ingen kræver handling lige nu — god tid til proaktiv sparring</p>
      </div>
    </div>
  );

  return (
    <div className="glass-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-chart-warning" />
          <h3 className="text-sm font-semibold text-foreground">Kræver handling</h3>
        </div>
        <span className="text-[10px] text-muted-foreground font-medium">
          {visibleItems.length} {visibleItems.length === 1 ? "virksomhed" : "virksomheder"}
        </span>
      </div>

      <div className="space-y-1">
        {displayItems.map(item => (
          <button
            key={item.company.company_id}
            onClick={() => onCompanyClick(item.company.company_id, item.company.company_name, item.reasons[0]?.label)}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/60 transition-colors text-left group"
          >
            {/* Avatar */}
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
              {item.company.logo_url
                ? <img src={item.company.logo_url} alt="" className="h-full w-full object-contain" />
                : <span className="text-[10px] font-bold text-muted-foreground">
                    {item.company.company_name.slice(0, 2).toUpperCase()}
                  </span>
              }
            </div>

            {/* Name + reasons */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{item.company.company_name}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                {item.reasons.map((r, i) => (
                  <span key={i} className="inline-flex flex-col">
                    <span className={`inline-flex items-center gap-1 text-[10px] ${
                      r.urgency === "high" ? "text-destructive" : "text-chart-warning"
                    }`}>
                      <ReasonIcon label={r.label} />
                      {r.label}
                    </span>
                    <span className="text-[9px] text-muted-foreground ml-4">→ {getActionHint(r.label)}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Assigned advisor badge */}
            {item.assigned_advisor_id && (
              <div
                className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-[9px] font-bold text-primary"
                title={advisorProfiles?.find(a => a.user_id === item.assigned_advisor_id)?.full_name || "Tildelt"}
              >
                {(advisorProfiles?.find(a => a.user_id === item.assigned_advisor_id)?.full_name || "?")
                  .split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
            )}

            {/* Assign dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setAssignOpen(assignOpen === item.company.company_id ? null : item.company.company_id);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary hover:text-foreground transition-all shrink-0"
                title="Tildel rådgiver"
              >
                <UserCheck className="h-3 w-3" />
                Tildel
              </button>
              {assignOpen === item.company.company_id && (
                <div className="fixed z-[100] bg-popover border border-border rounded-lg shadow-xl py-1 min-w-[180px]"
                  style={{
                    top: "auto",
                    right: "auto",
                  }}
                  ref={(el) => {
                    if (el) {
                      const btn = el.parentElement?.querySelector("button");
                      if (btn) {
                        const rect = btn.getBoundingClientRect();
                        el.style.top = `${rect.bottom + 4}px`;
                        el.style.left = `${Math.max(8, rect.right - el.offsetWidth)}px`;
                      }
                    }
                  }}
                >
                  {(advisorProfiles || []).map(a => (
                    <button
                      key={a.user_id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssign?.(item.company.company_id, a.user_id);
                        setAssignOpen(null);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-secondary transition-colors flex items-center gap-2"
                    >
                      {a.full_name}
                      {a.user_id === currentUserId && (
                        <span className="text-[9px] text-primary font-medium">(mig)</span>
                      )}
                    </button>
                  ))}
                  <div className="border-t border-border mt-1 pt-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssign?.(item.company.company_id, null);
                        setAssignOpen(null);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors"
                    >
                      Fjern tildeling
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Ignore button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIgnored(prev => new Set([...prev, item.company.company_id]));
                onIgnore?.(item.company.company_id);
                setAssignOpen(null);
              }}
              className="p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-muted-foreground hover:bg-secondary transition-all shrink-0"
              title="Ignorer — fjern fra listen"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
        ))}
      </div>

      {hiddenCount > 0 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full mt-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          + {hiddenCount} flere virksomheder
        </button>
      )}
      {showAll && visibleItems.length > 10 && (
        <button
          onClick={() => setShowAll(false)}
          className="w-full mt-1 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Vis færre
        </button>
      )}
    </div>
  );
}
