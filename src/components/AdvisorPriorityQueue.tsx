import { useState } from "react";
import {
  MessageSquare,
  FileCheck,
  Wallet,
  TrendingDown,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import AdvisorQueueRow from "@/components/AdvisorQueueRow";

interface Reason {
  label: string;
  urgency: "high" | "medium";
}

export interface PriorityItem {
  company: { company_id: string; company_name: string; logo_url: string | null };
  reasons: Reason[];
  score: number;
  assigned_advisor_id?: string | null;
  assigned_advisor_name?: string | null;
}

const IGNORED_STORAGE_KEY = "advisor-priority-ignored";
const IGNORED_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

function loadIgnored(): Set<string> {
  try {
    const raw = localStorage.getItem(IGNORED_STORAGE_KEY);
    if (!raw) return new Set();
    const { ids, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) {
      localStorage.removeItem(IGNORED_STORAGE_KEY);
      return new Set();
    }
    return new Set(ids as string[]);
  } catch {
    return new Set();
  }
}

function saveIgnored(ids: Set<string>) {
  localStorage.setItem(
    IGNORED_STORAGE_KEY,
    JSON.stringify({ ids: [...ids], expiresAt: Date.now() + IGNORED_TTL_MS })
  );
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

export default function AdvisorPriorityQueue({
  items,
  onCompanyClick,
  advisorProfiles = [],
  currentUserId,
  onAssign,
  onIgnore,
}: AdvisorPriorityQueueProps) {
  const [ignored, setIgnored] = useState<Set<string>>(loadIgnored);
  const [showAll, setShowAll] = useState(false);

  const visibleItems = items.filter((i) => !ignored.has(i.company.company_id));
  const displayItems = showAll ? visibleItems : visibleItems.slice(0, 10);
  const hiddenCount = visibleItems.length - displayItems.length;

  const handleIgnore = (companyId: string) => {
    setIgnored((prev) => {
      const next = new Set([...prev, companyId]);
      saveIgnored(next);
      return next;
    });
    onIgnore?.(companyId);
  };

  if (visibleItems.length === 0) {
    return (
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
  }

  return (
    <div className="glass-card rounded-xl p-5 overflow-visible">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-chart-warning" />
          <h3 className="text-sm font-semibold text-foreground">Kræver handling</h3>
        </div>
        <span className="text-[10px] text-muted-foreground font-medium">
          {visibleItems.length} {visibleItems.length === 1 ? "virksomhed" : "virksomheder"}
        </span>
      </div>

      <div className="space-y-0.5 overflow-visible">
        {displayItems.map((item, idx) => (
          <AdvisorQueueRow
            key={item.company.company_id}
            company={item.company}
            index={idx}
            assigned_advisor_id={item.assigned_advisor_id}
            assigned_advisor_name={item.assigned_advisor_name}
            advisorProfiles={advisorProfiles}
            currentUserId={currentUserId}
            onCompanyClick={() => onCompanyClick(item.company.company_id, item.company.company_name, item.reasons[0]?.label)}
            onAssign={onAssign}
            onIgnore={handleIgnore}
          >
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {item.reasons.map((r, i) => (
                <span key={i} className="inline-flex flex-col">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] ${
                      r.urgency === "high" ? "text-destructive" : "text-chart-warning"
                    }`}
                  >
                    <ReasonIcon label={r.label} />
                    {r.label}
                  </span>
                  <span className="text-[9px] text-muted-foreground ml-4">→ {getActionHint(r.label)}</span>
                </span>
              ))}
            </div>
          </AdvisorQueueRow>
        ))}
      </div>

      {hiddenCount > 0 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full mt-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          + {hiddenCount} flere virksomheder
        </button>
      )}

      {showAll && visibleItems.length > 10 && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="w-full mt-1 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Vis færre
        </button>
      )}
    </div>
  );
}
