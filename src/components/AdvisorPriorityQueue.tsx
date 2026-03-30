import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  MessageSquare,
  FileCheck,
  Wallet,
  TrendingDown,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  X,
  UserCheck,
} from "lucide-react";

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

function getAdvisorInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
  const [assignOpen, setAssignOpen] = useState<string | null>(null);
  const [pendingIgnore, setPendingIgnore] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);

  const visibleItems = items.filter((i) => !ignored.has(i.company.company_id));
  const displayItems = showAll ? visibleItems : visibleItems.slice(0, 10);
  const hiddenCount = visibleItems.length - displayItems.length;

  useEffect(() => {
    if (!assignOpen) return;
    const handlePointerDown = () => setAssignOpen(null);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [assignOpen]);

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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-chart-warning" />
          <h3 className="text-sm font-semibold text-foreground">Kræver handling</h3>
        </div>
        <span className="text-[10px] text-muted-foreground font-medium">
          {visibleItems.length} {visibleItems.length === 1 ? "virksomhed" : "virksomheder"}
        </span>
      </div>

      <div className="space-y-1 overflow-visible">
        {displayItems.map((item) => {
          const assignedName =
            item.assigned_advisor_name ||
            advisorProfiles.find((a) => a.user_id === item.assigned_advisor_id)?.full_name ||
            null;
          const isAssignOpen = assignOpen === item.company.company_id;

          const handleOpenAssign = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (isAssignOpen) {
              setAssignOpen(null);
            } else {
              const rect = e.currentTarget.getBoundingClientRect();
              setDropdownPos({
                top: rect.bottom + 4,
                right: window.innerWidth - rect.right,
              });
              setAssignOpen(item.company.company_id);
            }
          };

          return (
            <div
              key={item.company.company_id}
              className="group relative flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/60 transition-colors overflow-visible"
            >
              <button
                type="button"
                onClick={() => onCompanyClick(item.company.company_id, item.company.company_name, item.reasons[0]?.label)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
                  <p className="text-xs font-semibold text-foreground truncate">{item.company.company_name}</p>
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
                </div>
              </button>

              <div className="shrink-0 flex items-center gap-1">
                {/* Assign badge — always visible when assigned, hover otherwise */}
                <button
                  type="button"
                  onClick={handleOpenAssign}
                  className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold transition-colors ${
                    item.assigned_advisor_id
                      ? "bg-primary/10 text-primary hover:bg-primary/20"
                      : "bg-secondary text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary/80"
                  }`}
                  title={item.assigned_advisor_id ? `${assignedName || "Tildelt"} — klik for at ændre` : "Tildel rådgiver"}
                >
                  {item.assigned_advisor_id
                    ? getAdvisorInitials(assignedName)
                    : <UserCheck className="h-3 w-3" />
                  }
                </button>

                {/* Inline ignore confirm */}
                {pendingIgnore === item.company.company_id ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIgnored(prev => {
                          const next = new Set([...prev, item.company.company_id]);
                          saveIgnored(next);
                          return next;
                        });
                        onIgnore?.(item.company.company_id);
                        setPendingIgnore(null);
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      Ja
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPendingIgnore(null); }}
                      className="px-2 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Nej
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPendingIgnore(item.company.company_id); setAssignOpen(null); }}
                    className="p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary transition-all shrink-0"
                    title="Ignorer — fjern fra listen"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onCompanyClick(item.company.company_id, item.company.company_name, item.reasons[0]?.label)}
                  className="p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary transition-all shrink-0"
                  title="Åbn virksomhed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                {/* Portal-based assign dropdown */}
                {isAssignOpen && dropdownPos && createPortal(
                  <div
                    style={{ position: "fixed", top: dropdownPos.top, right: dropdownPos.right, zIndex: 9999 }}
                    className="min-w-[220px] rounded-lg border border-border bg-popover shadow-xl overflow-hidden"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {advisorProfiles.map((advisor) => (
                      <button
                        key={advisor.user_id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAssign?.(item.company.company_id, advisor.user_id);
                          setAssignOpen(null);
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-secondary transition-colors flex items-center justify-between gap-3"
                      >
                        <span>{advisor.full_name}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          {advisor.user_id === item.assigned_advisor_id && (
                            <span className="text-[9px] text-primary font-medium">Tildelt</span>
                          )}
                          {advisor.user_id === currentUserId && (
                            <span className="text-[9px] text-primary font-medium">(mig)</span>
                          )}
                        </span>
                      </button>
                    ))}
                    <div className="border-t border-border">
                      <button
                        type="button"
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
                  </div>,
                  document.body
                )}
              </div>
            </div>
          );
        })}
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
