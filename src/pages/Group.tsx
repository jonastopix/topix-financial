import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  UserPlus,
  MessageSquare,
  FileText,
  Calendar,
  Clock,
  TrendingUp,
  ChevronRight,
  Sparkles,
} from "lucide-react";

interface AdvisorData {
  user_id: string;
  full_name: string;
  company_name: string;
  avatar_url: string;
  messageCount: number;
  lastActive: string | null;
}

const Group = () => {
  const { user } = useAuth();
  const [advisors, setAdvisors] = useState<AdvisorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAdvisor, setSelectedAdvisor] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      // Fetch advisor user_ids, profiles, and messages in parallel
      const [rolesRes, profilesRes, msgsRes] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "advisor"),
        supabase.from("profiles").select("user_id, full_name, company_name, avatar_url"),
        supabase.from("messages").select("sender_id, created_at").order("created_at", { ascending: false }),
      ]);

      const advisorIds = new Set((rolesRes.data || []).map((r) => r.user_id));
      const profiles = (profilesRes.data || []).filter((p) => advisorIds.has(p.user_id));
      const allMessages = msgsRes.data || [];

      // Count messages per advisor and find last active
      const msgCountByUser = new Map<string, number>();
      const lastActiveByUser = new Map<string, string>();
      allMessages.forEach((m) => {
        if (advisorIds.has(m.sender_id)) {
          msgCountByUser.set(m.sender_id, (msgCountByUser.get(m.sender_id) || 0) + 1);
          if (!lastActiveByUser.has(m.sender_id)) {
            lastActiveByUser.set(m.sender_id, m.created_at);
          }
        }
      });

      const enriched: AdvisorData[] = profiles.map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name || "Ukendt advisor",
        company_name: p.company_name || "",
        avatar_url: p.avatar_url || "",
        messageCount: msgCountByUser.get(p.user_id) || 0,
        lastActive: lastActiveByUser.get(p.user_id) || null,
      }));

      // Sort by message count desc
      enriched.sort((a, b) => b.messageCount - a.messageCount);
      setAdvisors(enriched);
      setLoading(false);
    };

    load();
  }, [user]);

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const totalMessages = advisors.reduce((s, a) => s + a.messageCount, 0);

  const formatRelativeDate = (dateStr: string | null) => {
    if (!dateStr) return "Ingen aktivitet";
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "I dag";
    if (days === 1) return "I går";
    if (days < 7) return `${days} dage siden`;
    if (days < 30) return `${Math.floor(days / 7)} uger siden`;
    return `${Math.floor(days / 30)} mdr. siden`;
  };

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Advisory Board
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dit advisory board og deres aktivitet
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors self-start">
          <UserPlus className="h-4 w-4" />
          Invitér advisor
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="glass-card rounded-xl p-4 text-center animate-fade-in">
          <p className="text-2xl font-display font-bold text-foreground">{advisors.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Advisors</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center animate-fade-in">
          <p className="text-2xl font-display font-bold text-primary">{totalMessages}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Beskeder</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center animate-fade-in">
          <p className="text-2xl font-display font-bold text-foreground">
            {advisors.filter((a) => {
              if (!a.lastActive) return false;
              return Date.now() - new Date(a.lastActive).getTime() < 7 * 24 * 60 * 60 * 1000;
            }).length}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Aktive (7d)</p>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
        </div>
      ) : advisors.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center animate-fade-in">
          <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Ingen advisors tilknyttet endnu</p>
          <p className="text-xs text-muted-foreground mt-1">Invitér din første advisor for at komme i gang</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="font-display font-semibold text-foreground text-lg">Advisors</h2>

            {advisors.map((advisor) => {
              const isExpanded = selectedAdvisor === advisor.user_id;
              return (
                <div
                  key={advisor.user_id}
                  className={`glass-card rounded-xl animate-fade-in transition-all ${
                    isExpanded ? "border-primary/30" : "hover:border-primary/20"
                  }`}
                >
                  <button
                    onClick={() => setSelectedAdvisor(isExpanded ? null : advisor.user_id)}
                    className="w-full p-5 text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-foreground">
                          {getInitials(advisor.full_name)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">{advisor.full_name}</p>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider bg-primary/10 text-primary">
                            Advisor
                          </span>
                        </div>
                        {advisor.company_name && (
                          <p className="text-xs text-muted-foreground mt-0.5">{advisor.company_name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right hidden sm:block">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MessageSquare className="h-3 w-3" />
                            {advisor.messageCount}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <Clock className="h-3 w-3" />
                            {formatRelativeDate(advisor.lastActive)}
                          </div>
                        </div>
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-border/50 pt-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-secondary/50 text-center">
                          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-1" />
                          <p className="text-sm font-display font-bold text-foreground">{advisor.messageCount}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Beskeder</p>
                        </div>
                        <div className="p-3 rounded-lg bg-secondary/50 text-center">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-1" />
                          <p className="text-sm font-display font-bold text-foreground">{formatRelativeDate(advisor.lastActive)}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Senest aktiv</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Top contributors */}
            <div className="glass-card rounded-xl p-5 animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h3 className="font-display font-semibold text-foreground text-sm">Top Bidragydere</h3>
              </div>
              <div className="space-y-3">
                {advisors.slice(0, 5).map((advisor, i) => (
                  <div key={advisor.user_id} className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-5 text-center ${i === 0 ? "text-chart-warning" : "text-muted-foreground"}`}>
                      {i === 0 ? "🏆" : `${i + 1}.`}
                    </span>
                    <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-medium text-foreground">{getInitials(advisor.full_name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{advisor.full_name}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-display font-bold text-foreground">{advisor.messageCount}</span>
                      <MessageSquare className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Insight */}
            <div className="glass-card rounded-xl p-5 animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="font-display font-semibold text-foreground text-sm">Oversigt</h3>
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                Dit advisory board har <span className="font-semibold text-primary">{advisors.length} advisors</span> med i alt{" "}
                <span className="font-semibold text-primary">{totalMessages} beskeder</span>.
              </p>
              {advisors.length > 0 && advisors[0].messageCount > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  💡 {advisors[0].full_name} er den mest aktive advisor.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default Group;
