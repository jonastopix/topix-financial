import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, X, UserCheck } from "lucide-react";

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

export interface QueueRowCompany {
  company_id: string;
  company_name: string;
  logo_url: string | null;
}

interface AdvisorQueueRowProps {
  company: QueueRowCompany;
  index: number;
  assigned_advisor_id?: string | null;
  assigned_advisor_name?: string | null;
  advisorProfiles: { user_id: string; full_name: string }[];
  currentUserId?: string;
  onCompanyClick: () => void;
  onAssign?: (companyId: string, advisorUserId: string | null) => void;
  onIgnore?: (companyId: string) => void;
  children: React.ReactNode; // signal/reason content
}

export default function AdvisorQueueRow({
  company,
  index,
  assigned_advisor_id,
  assigned_advisor_name,
  advisorProfiles,
  currentUserId,
  onCompanyClick,
  onAssign,
  onIgnore,
  children,
}: AdvisorQueueRowProps) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [pendingIgnore, setPendingIgnore] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);

  const assignedName =
    assigned_advisor_name ||
    advisorProfiles.find((a) => a.user_id === assigned_advisor_id)?.full_name ||
    null;

  useEffect(() => {
    if (!assignOpen) return;
    const handlePointerDown = () => setAssignOpen(false);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [assignOpen]);

  const handleOpenAssign = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (assignOpen) {
      setAssignOpen(false);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
      setAssignOpen(true);
    }
  };

  return (
    <div
      className={`group relative flex items-center gap-3 p-3 rounded-lg transition-colors overflow-visible ${
        index % 2 === 0 ? "bg-secondary/50 border border-border/20" : "bg-transparent"
      } hover:bg-secondary/70`}
    >
      <button
        type="button"
        onClick={onCompanyClick}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
          {company.logo_url ? (
            <img src={company.logo_url} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] font-bold text-muted-foreground">
              {company.company_name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{company.company_name}</p>
          {children}
        </div>
      </button>

      <div className="shrink-0 flex items-center gap-1">
        {/* Assign badge */}
        <button
          type="button"
          onClick={handleOpenAssign}
          className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold transition-colors ${
            assigned_advisor_id
              ? "bg-primary/10 text-primary hover:bg-primary/20"
              : "bg-secondary text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary/80"
          }`}
          title={assigned_advisor_id ? `${assignedName || "Tildelt"} — klik for at ændre` : "Tildel rådgiver"}
        >
          {assigned_advisor_id ? getAdvisorInitials(assignedName) : <UserCheck className="h-3 w-3" />}
        </button>

        {/* Ignore */}
        {pendingIgnore ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onIgnore?.(company.company_id);
                setPendingIgnore(false);
              }}
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              Ja
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPendingIgnore(false); }}
              className="px-2 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Nej
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setPendingIgnore(true); setAssignOpen(false); }}
            className="p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary transition-all shrink-0"
            title="Ignorer — fjern fra listen"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={onCompanyClick}
          className="p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary transition-all shrink-0"
          title="Åbn virksomhed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Portal dropdown */}
        {assignOpen && dropdownPos && createPortal(
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
                  onAssign?.(company.company_id, advisor.user_id);
                  setAssignOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-secondary transition-colors flex items-center justify-between gap-3"
              >
                <span>{advisor.full_name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {advisor.user_id === assigned_advisor_id && (
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
                  onAssign?.(company.company_id, null);
                  setAssignOpen(false);
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
}
