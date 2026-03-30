import { useState } from "react";
import { Target, Plus, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface LeverMilestone {
  milestone_id: string;
  title: string;
  progress: number;
  status: string;
}

interface HandoutLeverItemProps {
  index: number;
  value: string;
  onChange: (val: string) => void;
  handoutId?: string;
  linkedMilestone?: LeverMilestone | null;
  onMilestoneCreated?: () => void;
  disabled?: boolean;
}

const HandoutLeverItem = ({ index, value, onChange, handoutId, linkedMilestone, onMilestoneCreated, disabled }: HandoutLeverItemProps) => {
  const { user, companyId } = useAuth();
  const [creating, setCreating] = useState(false);

  const createMilestone = async () => {
    if (!user || !handoutId || !value.trim()) return;
    setCreating(true);
    try {
      const insertData: Record<string, any> = { user_id: user.id, title: value.trim(), source: "handout", company_id: companyId };
      const { data: ms, error: msErr } = await supabase
        .from("milestones")
        .insert(insertData as any)
        .select("id")
        .single();
      if (msErr) throw msErr;

      const { error: linkErr } = await supabase
        .from("handout_lever_milestones" as any)
        .insert({ handout_id: handoutId, lever_index: index, milestone_id: ms.id });
      if (linkErr) throw linkErr;

      toast({ title: "Milestone oprettet", description: `"${value.trim()}" er nu en aktiv milestone.` });
      onMilestoneCreated?.();
    } catch (e: any) {
      toast({ title: "Fejl", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">{index + 1}.</span>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Løftestang ${index + 1}`}
          className="text-sm"
          disabled={disabled}
        />
        {handoutId && !linkedMilestone && value.trim() && !disabled && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/5"
            onClick={createMilestone}
            disabled={creating}
            title="Gør denne løftestang til en aktiv milestone så du kan tracke fremgangen"
          >
            {creating
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Target className="h-3 w-3" />
            }
            {creating ? "Opretter…" : "→ Milestone"}
          </Button>
        )}
      </div>
      {linkedMilestone && (
        <div className="ml-7 flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
          <Target className="h-3.5 w-3.5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{linkedMilestone.title}</p>
            <Progress value={linkedMilestone.progress} className="h-1 mt-1" />
          </div>
          <span className="text-[10px] font-medium text-muted-foreground">{linkedMilestone.progress}%</span>
        </div>
      )}
    </div>
  );
};

export default HandoutLeverItem;
