import { useState } from "react";
import { Sparkles, TrendingUp, MessageSquare, Target, FileText } from "lucide-react";
import AdvisorQueueRow from "@/components/AdvisorQueueRow";

export interface SparringItem {
  company: { company_id: string; company_name: string; logo_url: string | null };
  signals: { label: string; hint: string }[];
  assigned_advisor_id?: string | null;
  assigned_advisor_name?: string | null;
}

const SIGNAL_ICON = (label: string) => {
  if (label.includes("rapport")) return <FileText className="h-3 w-3" />;
  if (label.includes("steg")) return <TrendingUp className="h-3 w-3" />;
  if (label.includes("hjælp")) return <MessageSquare className="h-3 w-3" />;
  if (label.includes("Milestone")) return <Target className="h-3 w-3" />;
  return <Sparkles className="h-3 w-3" />;
};

const IGNORED_STORAGE_KEY = "advisor-sparring-ignored";
const IGNORED_TTL_MS = 72 * 60 * 60 * 1000;

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

interface AdvisorSparringQueueProps {
  items: SparringItem[];
  onCompanyClick: (companyId: string, companyName: string, signal?: string) => void;
  advisorProfiles?: { user_id: string; full_name: string }[];
  currentUserId?: string;
  onAssign?: (companyId: string, advisorUserId: string | null) => void;
}

export default function AdvisorSparringQueue({
  items,
  onCompanyClick,
  advisorProfiles = [],
  currentUserId,
  onAssign,
}: AdvisorSparringQueueProps) {
  const [ignored, setIgnored] = useState<Set<string>>(loadIgnored);

  const visibleItems = items.filter((i) => !ignored.has(i.company.company_id));

  const handleIgnore = (companyId: string) => {
    setIgnored((prev) => {
      const next = new Set([...prev, companyId]);
      saveIgnored(next);
      return next;
    });
  };

  if (visibleItems.length === 0) return null;

  return (
    <div className="glass-card rounded-xl p-5 overflow-visible">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Klar til sparring</h3>
        </div>
        <span className="text-[10px] text-muted-foreground font-medium">
          {visibleItems.length} {visibleItems.length === 1 ? "virksomhed" : "virksomheder"}
        </span>
      </div>

      <div className="space-y-0.5 overflow-visible">
        {visibleItems.map((item, idx) => (
          <AdvisorQueueRow
            key={item.company.company_id}
            company={item.company}
            index={idx}
            assigned_advisor_id={item.assigned_advisor_id}
            assigned_advisor_name={item.assigned_advisor_name}
            advisorProfiles={advisorProfiles}
            currentUserId={currentUserId}
            onCompanyClick={() => onCompanyClick(item.company.company_id, item.company.company_name, item.signals[0]?.label)}
            onAssign={onAssign}
            onIgnore={handleIgnore}
          >
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
          </AdvisorQueueRow>
        ))}
      </div>
    </div>
  );
}
