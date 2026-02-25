import { useState, useEffect, useMemo } from "react";
import { Navigate, Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2,
  Search,
  MessageCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Users,
  Globe,
  MapPin,
  User,
  Mail,
  Phone,
  Wallet,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { da } from "date-fns/locale";

interface CompanyMember {
  user_id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
}

interface CompanyData {
  id: string;
  name: string;
  cvr_number: string | null;
  industry: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  address: string;
  postal_code: string;
  city: string;
  annual_revenue: number;
  start_date: string | null;
  end_date: string | null;
  status: string;
  slack_channel: string;
  created_at: string;
  members: CompanyMember[];
  reportCount: number;
  unreadCount: number;
  conversationId: string | null;
}

type SortKey = "name" | "industry" | "city" | "annual_revenue" | "reportCount" | "contact_person";
type SortDir = "asc" | "desc";

const Members = () => {
  const { user, isAdvisor: rawAdvisor, loading: authLoading } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterIndustry, setFilterIndustry] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isAdvisor) return;

    const loadCompanies = async () => {
      setLoading(true);

      const [companiesRes, membersRes, profilesRes, convsRes, reportsRes] = await Promise.all([
        supabase.from("companies" as any).select("*"),
        supabase.from("company_members" as any).select("company_id, user_id, role"),
        supabase.from("profiles").select("user_id, full_name, avatar_url"),
        supabase.from("conversations").select("id, company_id, last_message_at"),
        supabase.from("financial_reports").select("company_id, id"),
      ]);

      const allCompanies = (companiesRes.data || []) as any[];
      const allMembers = (membersRes.data || []) as any[];
      const allProfiles = (profilesRes.data || []) as any[];
      const allConvs = (convsRes.data || []) as any[];
      const allReports = (reportsRes.data || []) as any[];

      // Build profile map
      const profileMap = new Map(allProfiles.map((p: any) => [p.user_id, p]));

      // Group members by company
      const membersByCompany = new Map<string, CompanyMember[]>();
      allMembers.forEach((cm: any) => {
        const profile = profileMap.get(cm.user_id);
        const arr = membersByCompany.get(cm.company_id) || [];
        arr.push({
          user_id: cm.user_id,
          full_name: profile?.full_name || "Ukendt",
          role: cm.role,
          avatar_url: profile?.avatar_url || null,
        });
        membersByCompany.set(cm.company_id, arr);
      });

      // Reports by company
      const reportsByCompany = new Map<string, number>();
      allReports.forEach((r: any) => {
        if (r.company_id) {
          reportsByCompany.set(r.company_id, (reportsByCompany.get(r.company_id) || 0) + 1);
        }
      });

      // Conversations by company
      const convByCompany = new Map<string, any>();
      allConvs.forEach((c: any) => {
        if (c.company_id) convByCompany.set(c.company_id, c);
      });

      // Batch unread messages
      const convIds = allConvs.map((c: any) => c.id);
      const { data: unreadMessages } = convIds.length > 0
        ? await supabase
            .from("messages")
            .select("conversation_id")
            .in("conversation_id", convIds)
            .neq("sender_id", user.id)
            .is("read_at", null)
        : { data: [] };

      const unreadByConv = new Map<string, number>();
      (unreadMessages || []).forEach((m) => {
        unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) || 0) + 1);
      });

      const enriched: CompanyData[] = allCompanies
        .filter((c: any) => c.status === "active" || !c.status)
        .map((c: any) => {
          const conv = convByCompany.get(c.id);
          return {
            id: c.id,
            name: c.name || "",
            cvr_number: c.cvr_number,
            industry: c.industry || "",
            contact_person: c.contact_person || "",
            contact_email: c.contact_email || "",
            contact_phone: c.contact_phone || "",
            website: c.website || "",
            address: c.address || "",
            postal_code: c.postal_code || "",
            city: c.city || "",
            annual_revenue: Number(c.annual_revenue) || 0,
            start_date: c.start_date,
            end_date: c.end_date,
            status: c.status || "active",
            slack_channel: c.slack_channel || "",
            created_at: c.created_at,
            members: membersByCompany.get(c.id) || [],
            reportCount: reportsByCompany.get(c.id) || 0,
            unreadCount: conv ? (unreadByConv.get(conv.id) || 0) : 0,
            conversationId: conv?.id || null,
          };
        });

      setCompanies(enriched);
      setLoading(false);
    };

    loadCompanies();
  }, [user, isAdvisor]);

  const industries = useMemo(() => {
    const set = new Set(companies.map((c) => c.industry).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "da"));
  }, [companies]);

  const filtered = useMemo(() => {
    let result = companies;

    if (filterIndustry !== "all") {
      result = result.filter((c) => c.industry === filterIndustry);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.industry.toLowerCase().includes(q) ||
          c.contact_person.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name" || sortKey === "industry" || sortKey === "city" || sortKey === "contact_person") {
        cmp = (a[sortKey] || "").localeCompare(b[sortKey] || "", "da");
      } else if (sortKey === "annual_revenue" || sortKey === "reportCount") {
        cmp = a[sortKey] - b[sortKey];
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [companies, search, sortKey, sortDir, filterIndustry]);

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

  const formatDKK = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".", ",") + " mio";
    if (n >= 1000) return Math.round(n / 1000) + "k";
    return n.toLocaleString("da-DK");
  };

  const totalCompanies = companies.length;
  const totalMembers = companies.reduce((sum, c) => sum + c.members.length, 0);
  const totalUnread = companies.reduce((sum, c) => sum + c.unreadCount, 0);
  const companiesWithReports = companies.filter((c) => c.reportCount > 0).length;

  if (authLoading) return null;
  if (!isAdvisor) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          Virksomheder
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Oversigt over alle virksomheder i forløbet
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-display font-bold text-foreground">{totalCompanies}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Virksomheder</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-display font-bold text-foreground">{totalMembers}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Teammedlemmer</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className={`text-2xl font-display font-bold ${totalUnread > 0 ? "text-chart-warning" : "text-foreground"}`}>{totalUnread}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Ubesvarede</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-display font-bold text-foreground">{companiesWithReports}</p>
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
            placeholder="Søg på virksomhed, branche, kontaktperson eller by..."
            className="w-full pl-10 pr-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterIndustry("all")}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              filterIndustry === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            Alle
          </button>
          {industries.slice(0, 5).map((ind) => (
            <button
              key={ind}
              onClick={() => setFilterIndustry(ind)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                filterIndustry === ind
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {ind}
            </button>
          ))}
          {industries.length > 5 && (
            <select
              value={filterIndustry}
              onChange={(e) => setFilterIndustry(e.target.value)}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-secondary text-muted-foreground border-none focus:outline-none"
            >
              <option value="all">Flere brancher...</option>
              {industries.map((ind) => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 bg-secondary/50 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          <button onClick={() => toggleSort("name")} className="col-span-3 flex items-center gap-1 hover:text-foreground transition-colors">
            Virksomhed <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("industry")} className="col-span-2 flex items-center gap-1 hover:text-foreground transition-colors">
            Branche <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("contact_person")} className="col-span-2 flex items-center gap-1 hover:text-foreground transition-colors">
            Kontaktperson <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("city")} className="col-span-1 flex items-center gap-1 hover:text-foreground transition-colors">
            By <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("annual_revenue")} className="col-span-2 flex items-center gap-1 hover:text-foreground transition-colors">
            Omsætning <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("reportCount")} className="col-span-1 flex items-center gap-1 hover:text-foreground transition-colors">
            Rapporter <ArrowUpDown className="h-3 w-3" />
          </button>
          <div className="col-span-1">Chat</div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {search ? "Ingen virksomheder matcher din søgning" : "Ingen virksomheder endnu"}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((c) => {
              const isExpanded = expandedId === c.id;
              return (
                <div key={c.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    className="w-full text-left px-5 py-3.5 hover:bg-secondary/30 transition-colors"
                  >
                    {/* Desktop row */}
                    <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3 flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-semibold text-primary">{getInitials(c.name)}</span>
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-foreground truncate block">{c.name}</span>
                          {c.cvr_number && (
                            <span className="text-[10px] text-muted-foreground">CVR: {c.cvr_number}</span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs text-muted-foreground truncate block">{c.industry || "–"}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs text-foreground truncate block">{c.contact_person || "–"}</span>
                      </div>
                      <div className="col-span-1">
                        <span className="text-xs text-muted-foreground truncate block">{c.city || "–"}</span>
                      </div>
                      <div className="col-span-2">
                        <span className={`text-xs ${c.annual_revenue > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {c.annual_revenue > 0 ? formatDKK(c.annual_revenue) : "–"}
                        </span>
                      </div>
                      <div className="col-span-1">
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-3 w-3 text-muted-foreground" />
                          <span className={`text-xs ${c.reportCount === 0 ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                            {c.reportCount}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-1 flex items-center justify-between">
                        {c.unreadCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-chart-warning">
                            <MessageCircle className="h-3 w-3" />
                            {c.unreadCount}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                    </div>

                    {/* Mobile row */}
                    <div className="sm:hidden flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-primary">{getInitials(c.name)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                          {c.unreadCount > 0 && (
                            <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-chart-warning text-white text-[10px] font-bold flex items-center justify-center">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <p className="text-xs text-muted-foreground truncate">{c.industry || "–"}</p>
                          <span className="text-[10px] text-muted-foreground">{c.city}</span>
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-5 pb-4 pt-1 bg-secondary/20 border-t border-border/30 animate-fade-in">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        {/* Contact info */}
                        <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <User className="h-4 w-4 text-primary" />
                            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Kontakt</span>
                          </div>
                          <p className="text-sm font-medium text-foreground">{c.contact_person || "–"}</p>
                          {c.contact_email && (
                            <a href={`mailto:${c.contact_email}`} className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
                              <Mail className="h-3 w-3" /> {c.contact_email}
                            </a>
                          )}
                          {c.contact_phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Phone className="h-3 w-3" /> {c.contact_phone}
                            </p>
                          )}
                          {c.website && (
                            <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
                              <Globe className="h-3 w-3" /> Hjemmeside
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>

                        {/* Team members */}
                        <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Users className="h-4 w-4 text-primary" />
                            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                              Team ({c.members.length})
                            </span>
                          </div>
                          {c.members.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Ingen tilknyttede brugere</p>
                          ) : (
                            <div className="space-y-1.5">
                              {c.members.map((m) => (
                                <Link
                                  key={m.user_id}
                                  to={`/members/${m.user_id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-2 hover:bg-secondary/50 rounded-md p-1 -ml-1 transition-colors"
                                >
                                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[8px] font-semibold text-primary">{getInitials(m.full_name)}</span>
                                  </div>
                                  <span className="text-xs text-foreground truncate">{m.full_name}</span>
                                  <span className="text-[10px] text-muted-foreground ml-auto">{m.role}</span>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 className="h-4 w-4 text-primary" />
                            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Detaljer</span>
                          </div>
                          {c.cvr_number && (
                            <p className="text-xs text-muted-foreground">CVR: {c.cvr_number}</p>
                          )}
                          {c.address && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <MapPin className="h-3 w-3" /> {c.address}, {c.postal_code} {c.city}
                            </p>
                          )}
                          {c.annual_revenue > 0 && (
                            <p className="text-xs text-foreground font-medium flex items-center gap-1 mt-1">
                              <Wallet className="h-3 w-3 text-primary" /> {c.annual_revenue.toLocaleString("da-DK")} DKK
                            </p>
                          )}
                          {c.start_date && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Forløb: {format(new Date(c.start_date), "d. MMM yyyy", { locale: da })}
                              {c.end_date && ` – ${format(new Date(c.end_date), "d. MMM yyyy", { locale: da })}`}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="rounded-lg bg-background/50 border border-border/50 p-3 flex flex-col justify-between">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Rapporter & Chat</span>
                          </div>
                          <p className="text-sm font-medium text-foreground">{c.reportCount} rapporter</p>
                          {c.unreadCount > 0 && (
                            <p className="text-xs text-chart-warning font-semibold mt-1">{c.unreadCount} ubesvarede beskeder</p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-3">
                            {c.members.length > 0 && (
                              <Link
                                to={`/members/${c.members[0].user_id}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <FileText className="h-3 w-3" /> Se data
                              </Link>
                            )}
                            {c.conversationId && (
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
          Viser {filtered.length} af {companies.length} virksomheder
        </div>
      </div>
    </AppLayout>
  );
};

export default Members;
