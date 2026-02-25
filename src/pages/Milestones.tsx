import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import MilestonesList from "@/components/MilestonesList";
import { Target, Plus, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const Milestones = () => {
  const { user, companyId } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [milestoneStats, setMilestoneStats] = useState({ total: 0, done: 0, pct: 0 });

  useEffect(() => {
    if (!user || !companyId) return;
    
    const load = async () => {
      const [convRes, msRes] = await Promise.all([
        supabase.from("conversations").select("id").eq("company_id", companyId).maybeSingle(),
        supabase.from("milestones").select("progress").eq("company_id", companyId),
      ]);
      setConversationId(convRes.data?.id || null);
      
      const all = msRes.data || [];
      const done = all.filter((m) => m.progress >= 100).length;
      const pct = all.length > 0 ? Math.round(all.reduce((s, m) => s + m.progress, 0) / all.length) : 0;
      setMilestoneStats({ total: all.length, done, pct });
    };
    load();
  }, [user, companyId]);

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
            Milestones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sæt og følg dine vigtigste mål
          </p>
        </div>
      </div>

      {/* Progress overview */}
      <div className="glass-card rounded-xl p-6 mb-6 animate-fade-in">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 rounded-xl bg-primary/10">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-foreground">Samlet fremgang</h3>
            <p className="text-sm text-muted-foreground">{milestoneStats.done} af {milestoneStats.total} milestones nået</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-display font-bold text-primary">{milestoneStats.pct}%</p>
          </div>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${milestoneStats.pct}%` }} />
        </div>
      </div>

      <MilestonesList userId={user?.id || null} companyId={companyId} conversationId={conversationId} />
    </AppLayout>
  );
};

export default Milestones;
