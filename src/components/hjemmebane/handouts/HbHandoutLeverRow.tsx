import { useState } from "react";
import { Target, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { createLeverMilestone, type LeverMilestone } from "@/lib/handoutEngine";
import { hbControlClasses } from "../admin/HbField";

/** Hb-løftestangsrække (spejler HandoutLeverItem.tsx 1:1 i adfærd):
    input + "→ Milestone"-knap + visning af linket milestone.
    Skrivevejen (milestone + junction, H4) bor i handoutEngine —
    toasts og creating-state ejes her som i kilden. */

interface HbHandoutLeverRowProps {
  index: number;
  value: string;
  onChange: (val: string) => void;
  handoutId?: string;
  linkedMilestone?: LeverMilestone | null;
  onMilestoneCreated?: () => void;
  disabled?: boolean;
}

export const HbHandoutLeverRow = ({
  index,
  value,
  onChange,
  handoutId,
  linkedMilestone,
  onMilestoneCreated,
  disabled,
}: HbHandoutLeverRowProps) => {
  const { user, companyId } = useAuth();
  const [creating, setCreating] = useState(false);

  const createMilestone = async () => {
    if (!user || !handoutId || !value.trim()) return;
    setCreating(true);
    try {
      // H4 i motoren — milestone + junction-rækken (UNIQUE bærer idempotensen)
      await createLeverMilestone({ userId: user.id, companyId, handoutId, leverIndex: index, title: value.trim() });

      toast.success("Milestone oprettet", { description: `"${value.trim()}" er nu en aktiv milestone. Åbn Milestones for at tilføje et konkret talmål.` });
      onMilestoneCreated?.();
    } catch (e: any) {
      toast.error("Fejl", { description: e.message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <span className="w-5 shrink-0 text-xs font-semibold text-hb-ink-soft">{index + 1}.</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Løftestang ${index + 1}`}
          className={`${hbControlClasses} text-sm`}
          disabled={disabled}
        />
        {handoutId && !linkedMilestone && value.trim() && !disabled && (
          <button
            type="button"
            onClick={createMilestone}
            disabled={creating}
            title="Gør denne løftestang til en aktiv milestone så du kan tracke fremgangen"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-hb-line px-3 py-1.5 text-xs text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Target className="h-3 w-3" />}
            {creating ? "Opretter…" : "→ Milestone"}
          </button>
        )}
      </div>
      {linkedMilestone && (
        <div className="ml-7 flex items-center gap-2.5 rounded-lg border border-hb-line bg-hb-sage/20 p-2.5">
          <Target className="h-3.5 w-3.5 shrink-0 text-hb-evergreen" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-hb-ink">{linkedMilestone.title}</p>
            <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-hb-line">
              <div className="h-full rounded-full bg-hb-evergreen/70" style={{ width: `${linkedMilestone.progress}%` }} />
            </div>
          </div>
          <span className="shrink-0 text-[10px] font-medium text-hb-ink-soft">{linkedMilestone.progress}%</span>
        </div>
      )}
    </div>
  );
};
