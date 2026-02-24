import { useState, useEffect, useMemo } from "react";
import { Navigate, Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  Search,
  MessageCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Building2,
  Calendar,
  Shield,
  UserCheck,
  BarChart3,
  Wallet,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import { da } from "date-fns/locale";

interface MemberData {
  user_id: string;
  full_name: string;
  company_name: string;
  avatar_url: string;
  created_at: string;
  role: "member" | "advisor";
  lastMessageAt: string | null;
  unreadCount: number;
  conversationId: string | null;
  reportCount: number;
  latestReportDate: string | null;
  latestReportName: string | null;
  budgetCategories: number;
  totalBudget: number;
}

type SortKey = "full_name" | "company_name" | "created_at" | "unreadCount" | "reportCount";
type SortDir = "asc" | "desc";

const Members = () => {
  const { user, isAdvisor: rawAdvisor, loading: authLoading } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("full_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterRole, setFilterRole] = useState<"all" | "member" | "advisor">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isAdvisor) return;

    const loadMembers = async () => {
      setLoading(true);

      // Fetch all data in parallel
      const [profilesRes, rolesRes, convsRes, reportsRes, budgetsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, company_name, avatar_url, created_at"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("conversations").select("id, member_id, last_message_at"),
        supabase.from("financial_reports").select("user_id, file_name, uploaded_at, status"),
        supabase.from("budget_targets").select("user_id, category, budget_amount"),
      ]);

      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];
      const conversations = convsRes.data || [];
      const reports = reportsRes.data || [];
      const budgets = budgetsRes.data || [];

      // Group reports & budgets by user
      const reportsByUser = new Map<string, typeof reports>();
      reports.forEach((r) => {
        const arr = reportsByUser.get(r.user_id) || [];
        arr.push(r);
        reportsByUser.set(r.user_id, arr);
      });

      const budgetsByUser = new Map<string, typeof budgets>();
      budgets.forEach((b) => {
        const arr = budgetsByUser.get(b.user_id) || [];
        arr.push(b);
        budgetsByUser.set(b.user_id, arr);
      });

      // Batch-fetch unread messages (no N+1)
      const convIds = conversations.map((c) => c.id);
      const { data: unreadMessages } = convIds.length > 0
        ? await supabase
            .from("messages")
            .select("conversation_id")
            .in("conversation_id", convIds)
            .neq("sender_id", user.id)
            .is("read_at", null)
        : { data: [] };

      // Count unreads per conversation
      const unreadByConv = new Map<string, number>();
      (unreadMessages || []).forEach((m) => {
        unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) || 0) + 1);
      });

      const enriched: MemberData[] = profiles.map((p) => {
        const userRole = roles.find((r) => r.user_id === p.user_id);
        const conv = conversations.find((c) => c.member_id === p.user_id);
        const userReports = reportsByUser.get(p.user_id) || [];
        const userBudgets = budgetsByUser.get(p.user_id) || [];

        const sortedReports = [...userReports].sort(
          (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
        );

        return {
          user_id: p.user_id,
          full_name: p.full_name || "Intet navn",
          company_name: p.company_name || "",
          avatar_url: p.avatar_url || "",
          created_at: p.created_at,
          role: (userRole?.role as "member" | "advisor") || "member",
          lastMessageAt: conv?.last_message_at || null,
          unreadCount: conv ? (unreadByConv.get(conv.id) || 0) : 0,
          conversationId: conv?.id || null,
          reportCount: userReports.length,
          latestReportDate: sortedReports[0]?.uploaded_at || null,
          latestReportName: sortedReports[0]?.file_name || null,
          budgetCategories: userBudgets.length,
          totalBudget: userBudgets.reduce((sum, b) => sum + Number(b.budget_amount), 0),
        };
      });

      setMembers(enriched);
      setLoading(false);
    };

    loadMembers();
  }, [user, isAdvisor]);

  const filtered = useMemo(() => {
    let result = members;

    if (filterRole !== "all") {
      result = result.filter((m) => m.role === filterRole);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.full_name.toLowerCase().includes(q) ||
          m.company_name.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "full_name" || sortKey === "company_name") {
        cmp = (a[sortKey] || "").localeCompare(b[sortKey] || "", "da");
      } else if (sortKey === "created_at") {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortKey === "unreadCount" || sortKey === "reportCount") {
        cmp = a[sortKey] - b[sortKey];
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [members, search, sortKey, sortDir, filterRole]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const totalMembers = members.filter((m) => m.role === "member").length;
  const totalAdvisors = members.filter((m) => m.role === "advisor").length;
  const totalUnread = members.reduce((sum, m) => sum + m.unreadCount, 0);
  const membersWithReports = members.filter((m) => m.reportCount > 0).length;

  const formatMemberDKK = (n: number) =>
    n.toLocaleString("da-DK", { maximumFractionDigits: 0 }) + " DKK";

  if (authLoading) return null;
  if (!isAdvisor) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Medlemmer
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Oversigt over alle medlemmer og deres aktivitet
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-display font-bold text-foreground">{totalMembers}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Medlemmer</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-display font-bold text-foreground">{totalAdvisors}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Advisors</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className={`text-2xl font-display font-bold ${totalUnread > 0 ? "text-chart-warning" : "text-foreground"}`}>{totalUnread}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Ubesvarede</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-display font-bold text-foreground">{membersWithReports}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Har rapporteret</p>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="glass-card rounded-xl p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søg på navn eller virksomhed..."
            className="w-full pl-10 pr-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "member", "advisor"] as const).map((role) => (
            <button
              key={role}
              onClick={() => setFilterRole(role)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                filterRole === role
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {role === "all" ? "Alle" : role === "member" ? "Medlemmer" : "Advisors"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 bg-secondary/50 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          <button onClick={() => toggleSort("full_name")} className="col-span-3 flex items-center gap-1 hover:text-foreground transition-colors">
            Navn <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("company_name")} className="col-span-2 flex items-center gap-1 hover:text-foreground transition-colors">
            Virksomhed <ArrowUpDown className="h-3 w-3" />
          </button>
          <div className="col-span-1">Rolle</div>
          <button onClick={() => toggleSort("reportCount")} className="col-span-2 flex items-center gap-1 hover:text-foreground transition-colors">
            Rapporter <ArrowUpDown className="h-3 w-3" />
          </button>
          <div className="col-span-2">Budget</div>
          <button onClick={() => toggleSort("unreadCount")} className="col-span-1 flex items-center gap-1 hover:text-foreground transition-colors">
            Chat <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("created_at")} className="col-span-1 flex items-center gap-1 hover:text-foreground transition-colors">
            Oprettet <ArrowUpDown className="h-3 w-3" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {search ? "Ingen resultater matcher din søgning" : "Ingen medlemmer endnu"}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((m) => {
              const isExpanded = expandedId === m.user_id;
              return (
                <div key={m.user_id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : m.user_id)}
                    className="w-full text-left px-5 py-3.5 hover:bg-secondary/30 transition-colors"
                  >
                    {/* Desktop row */}
                    <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3 flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-semibold text-primary">{getInitials(m.full_name)}</span>
                        </div>
                        <span className="text-sm font-medium text-foreground truncate">{m.full_name}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm text-muted-foreground truncate">{m.company_name || "–"}</span>
                      </div>
                      <div className="col-span-1">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          m.role === "advisor" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        }`}>
                          {m.role === "advisor" ? <Shield className="h-2.5 w-2.5" /> : <UserCheck className="h-2.5 w-2.5" />}
                          {m.role === "advisor" ? "Advisor" : "Medlem"}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-3 w-3 text-muted-foreground" />
                          <span className={`text-xs ${m.reportCount === 0 ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                            {m.reportCount}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="flex items-center gap-1.5">
                          <Wallet className="h-3 w-3 text-muted-foreground" />
                          <span className={`text-xs ${m.budgetCategories === 0 ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                            {m.budgetCategories > 0 ? formatMemberDKK(m.totalBudget) : "–"}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-1">
                        {m.unreadCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-chart-warning">
                            <MessageCircle className="h-3 w-3" />
                            {m.unreadCount}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                      </div>
                      <div className="col-span-1 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(m.created_at), "d. MMM", { locale: da })}
                        </span>
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                    </div>

                    {/* Mobile row */}
                    <div className="sm:hidden flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-primary">{getInitials(m.full_name)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{m.full_name}</p>
                          {m.unreadCount > 0 && (
                            <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-chart-warning text-white text-[10px] font-bold flex items-center justify-center">
                              {m.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <p className="text-xs text-muted-foreground truncate">{m.company_name || "–"}</p>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <FileText className="h-2.5 w-2.5" /> {m.reportCount}
                          </span>
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-5 pb-4 pt-1 bg-secondary/20 border-t border-border/30 animate-fade-in">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        {/* Rapporter */}
                        <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Rapporter</span>
                          </div>
                          <p className="text-lg font-bold text-foreground">{m.reportCount}</p>
                          {m.latestReportDate ? (
                            <div className="mt-1">
                              <p className="text-[10px] text-muted-foreground">Seneste:</p>
                              <p className="text-xs text-foreground truncate">{m.latestReportName}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {format(new Date(m.latestReportDate), "d. MMM yyyy", { locale: da })}
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground mt-1">Ingen rapporter endnu</p>
                          )}
                        </div>

                        {/* Budget */}
                        <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Wallet className="h-4 w-4 text-primary" />
                            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Budget</span>
                          </div>
                          {m.budgetCategories > 0 ? (
                            <>
                              <p className="text-lg font-bold text-foreground">{formatMemberDKK(m.totalBudget)}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {m.budgetCategories} {m.budgetCategories === 1 ? "kategori" : "kategorier"}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-lg font-bold text-muted-foreground">–</p>
                              <p className="text-xs text-muted-foreground mt-1">Intet budget opsat</p>
                            </>
                          )}
                        </div>

                        {/* Chat */}
                        <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <MessageCircle className="h-4 w-4 text-primary" />
                            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Chat</span>
                          </div>
                          {m.unreadCount > 0 ? (
                            <p className="text-lg font-bold text-chart-warning">{m.unreadCount} ubesvaret</p>
                          ) : (
                            <p className="text-lg font-bold text-foreground">0</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            Seneste:{" "}
                            {m.lastMessageAt
                              ? format(new Date(m.lastMessageAt), "d. MMM HH:mm", { locale: da })
                              : "Ingen endnu"}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="rounded-lg bg-background/50 border border-border/50 p-3 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Calendar className="h-4 w-4 text-primary" />
                              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Detaljer</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Oprettet: {format(new Date(m.created_at), "d. MMMM yyyy", { locale: da })}
                            </p>
                            {m.company_name && (
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <Building2 className="h-3 w-3" /> {m.company_name}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 mt-3">
                            <Link
                              to={`/members/${m.user_id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <FileText className="h-3 w-3" /> Se rapporter & data
                            </Link>
                            {m.conversationId && (
                              <Link
                                to="/chat"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors border border-border"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MessageCircle className="h-3 w-3" /> Åbn chat
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 bg-secondary/30 border-t border-border text-xs text-muted-foreground">
          Viser {filtered.length} af {members.length} brugere
        </div>
      </div>
    </AppLayout>
  );
};

export default Members;
