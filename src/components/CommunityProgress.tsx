import { Trophy, FileText, Target, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";

interface MemberStats {
  userId: string;
  name: string;
  initials: string;
  reportsCount: number;
  milestonesCompleted: number;
  totalScore: number;
}

const CommunityProgress = () => {
  const { user, isAdvisor: rawAdvisor } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;

  const { data, isLoading } = useQuery({
    queryKey: ["community-progress", user?.id, isAdvisor],
    queryFn: async () => {
      if (isAdvisor) {
        const [profilesRes, reportsRes, milestonesRes] = await Promise.all([
          supabase.from("profiles").select("user_id, full_name"),
          supabase.from("financial_reports").select("user_id, status"),
          supabase.from("milestones").select("user_id, progress"),
        ]);

        const profiles = profilesRes.data || [];
        const reports = reportsRes.data || [];
        const milestones = milestonesRes.data || [];

        const rolesRes = await supabase.from("user_roles").select("user_id").eq("role", "advisor");
        const advisorIds = new Set((rolesRes.data || []).map(r => r.user_id));
        const memberProfiles = profiles.filter(p => !advisorIds.has(p.user_id));

        const stats: MemberStats[] = memberProfiles.map(p => {
          const rCount = reports.filter(r => r.user_id === p.user_id && r.status === "processed").length;
          const mCompleted = milestones.filter(m => m.user_id === p.user_id && m.progress >= 100).length;
          const score = rCount * 10 + mCompleted * 25;
          const name = p.full_name || "Ukendt";
          const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
          return { userId: p.user_id, name, initials, reportsCount: rCount, milestonesCompleted: mCompleted, totalScore: score };
        });

        stats.sort((a, b) => b.totalScore - a.totalScore);
        return { members: stats, ownStats: null as MemberStats | null };
      } else {
        const [reportsRes, milestonesRes, profileRes] = await Promise.all([
          supabase.from("financial_reports").select("status").eq("user_id", user!.id),
          supabase.from("milestones").select("progress").eq("user_id", user!.id),
          supabase.from("profiles").select("full_name").eq("user_id", user!.id).maybeSingle(),
        ]);

        const rCount = (reportsRes.data || []).filter(r => r.status === "processed").length;
        const mCompleted = (milestonesRes.data || []).filter(m => m.progress >= 100).length;
        const score = rCount * 10 + mCompleted * 25;
        const name = profileRes.data?.full_name || "Dig";
        const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

        return { members: [] as MemberStats[], ownStats: { userId: user!.id, name, initials, reportsCount: rCount, milestonesCompleted: mCompleted, totalScore: score } };
      }
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-5 animate-fade-in">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
      </div>
    );
  }

  const members = data?.members || [];
  const ownStats = data?.ownStats;
  const medals = ["🥇", "🥈", "🥉"];

  if (isAdvisor && members.length > 0) {
    return (
      <div className="glass-card rounded-xl p-5 animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-chart-warning" />
            <h3 className="font-display font-semibold text-foreground">Fællesskabets fremgang</h3>
          </div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{members.length} medlemmer</span>
        </div>

        <div className="space-y-2.5">
          {members.slice(0, 5).map((member, i) => {
            const maxScore = members[0]?.totalScore || 1;
            const pct = Math.round((member.totalScore / maxScore) * 100);
            return (
              <div key={member.userId} className="flex items-center gap-3 group">
                <span className="text-sm w-6 text-center flex-shrink-0">
                  {i < 3 ? medals[i] : <span className="text-xs text-muted-foreground font-medium">{i + 1}.</span>}
                </span>
                <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-semibold text-foreground">{member.initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground truncate">{member.name}</span>
                    <span className="text-[10px] font-display font-bold text-primary ml-2">{member.totalScore} pts</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-primary/70 transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <FileText className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Rapport = 10 pts</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Milestone = 25 pts</span>
          </div>
        </div>
      </div>
    );
  }

  if (ownStats) {
    const milestones = [
      { threshold: 0, label: "Starter", emoji: "🌱" },
      { threshold: 25, label: "Aktiv", emoji: "⚡" },
      { threshold: 75, label: "Dedikeret", emoji: "🔥" },
      { threshold: 150, label: "Stjerneelev", emoji: "⭐" },
      { threshold: 300, label: "Mester", emoji: "🏆" },
    ];

    const currentLevel = [...milestones].reverse().find(m => ownStats.totalScore >= m.threshold) || milestones[0];
    const nextLevel = milestones.find(m => m.threshold > ownStats.totalScore);
    const progressToNext = nextLevel
      ? Math.round(((ownStats.totalScore - (currentLevel.threshold)) / (nextLevel.threshold - currentLevel.threshold)) * 100)
      : 100;

    return (
      <div className="glass-card rounded-xl p-5 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-chart-warning" />
            <h3 className="font-display font-semibold text-foreground">Din fremgang</h3>
          </div>
          <span className="text-sm">{currentLevel.emoji} {currentLevel.label}</span>
        </div>

        <div className="text-center mb-4">
          <p className="text-3xl font-display font-bold text-primary">{ownStats.totalScore}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">point</p>
        </div>

        {nextLevel && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-muted-foreground">Næste niveau: {nextLevel.emoji} {nextLevel.label}</span>
              <span className="text-[10px] font-medium text-foreground">{nextLevel.threshold - ownStats.totalScore} pts mangler</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${progressToNext}%` }} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-secondary/50 text-center">
            <FileText className="h-3.5 w-3.5 text-primary mx-auto mb-1" />
            <p className="text-lg font-display font-bold text-foreground">{ownStats.reportsCount}</p>
            <p className="text-[10px] text-muted-foreground">Rapporter</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 text-center">
            <Target className="h-3.5 w-3.5 text-primary mx-auto mb-1" />
            <p className="text-lg font-display font-bold text-foreground">{ownStats.milestonesCompleted}</p>
            <p className="text-[10px] text-muted-foreground">Milestones ✓</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default CommunityProgress;
