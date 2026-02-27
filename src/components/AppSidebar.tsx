import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AdvisorNotifications from "@/components/AdvisorNotifications";
import {
  LayoutDashboard,
  FileText,
  Target,
  Settings as SettingsIcon,
  TrendingUp,
  Users,
  Calculator,
  Menu,
  X,
  MessageCircle,
  ClipboardList,
  LogOut,
  UserCog,
  Eye,
  EyeOff,
  Mail,
  Building2,
  ChevronDown,
  Check,
  Upload,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useQuery } from "@tanstack/react-query";

const baseNavItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: FileText, label: "Rapportering", path: "/reports" },
  { icon: Calculator, label: "Budget", path: "/budget" },
  { icon: Target, label: "Milestones", path: "/milestones" },
  { icon: ClipboardList, label: "Handouts", path: "/handouts" },
  { icon: TrendingUp, label: "KPI'er", path: "/kpis" },
  { icon: MessageCircle, label: "Chat", path: "/chat" },
];

const advisorNavItems = [
  { icon: UserCog, label: "Medlemmer", path: "/members" },
];

const adminNavItems = [
  { icon: Upload, label: "Import rapporter", path: "/admin/import" },
  { icon: Mail, label: "E-mail skabeloner", path: "/admin/emails" },
  { icon: SettingsIcon, label: "Platformconfig", path: "/admin/config" },
];

const AppSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const { user, profile, signOut, isAdvisor, isAdmin, companyName, isCompanyOverride, setCompanyOverride, clearCompanyOverride, ownCompanyName } = useAuth();
  const { viewingAsMember, toggleViewMode } = useViewMode();
  const effectiveAdvisor = isAdvisor && !viewingAsMember;
  const [unreadChat, setUnreadChat] = useState(0);
  const { branding } = useAppConfig();
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);

  // Fetch all companies for advisor picker
  const { data: allCompanies } = useQuery({
    queryKey: ["all-companies-picker"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, name").order("name");
      return data || [];
    },
    enabled: isAdvisor,
    staleTime: 60_000,
  });

  // Fetch company logo
  useEffect(() => {
    if (!user) return;
    const fetchLogo = async () => {
      const { data: cm } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (!cm?.company_id) return;
      const { data } = await supabase
        .from("companies")
        .select("logo_url")
        .eq("id", cm.company_id)
        .single();
      if (data?.logo_url) setCompanyLogoUrl(data.logo_url);
    };
    fetchLogo();
  }, [user]);

  const fetchUnread = useCallback(async () => {
    if (!user) return;
    const { data: convs } = await supabase.from("conversations").select("id");
    if (!convs || convs.length === 0) { setUnreadChat(0); return; }
    const convIds = convs.map((c) => c.id);
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("conversation_id", convIds)
      .neq("sender_id", user.id)
      .is("read_at", null);
    setUnreadChat(count || 0);
  }, [user]);

  // Fetch unread on mount, route change, and subscribe to realtime
  useEffect(() => {
    if (!user) return;
    fetchUnread();

    const channel = supabase
      .channel("sidebar-unread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => { fetchUnread(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, location.pathname, fetchUnread]);

  useEffect(() => {
    if (isMobile) setIsOpen(false);
  }, [location.pathname, isMobile]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isMobile, isOpen]);

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  return (
    <>
      {isMobile && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-4 left-4 z-50 p-2.5 rounded-xl bg-card/90 backdrop-blur-sm border border-border shadow-lg text-foreground hover:bg-secondary transition-colors"
          aria-label="Åbn menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-300 ease-out ${
          isMobile
            ? isOpen ? "translate-x-0" : "-translate-x-full"
            : "translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-display font-bold text-sm">{branding.shortName}</span>
            </div>
            <div>
              <h1 className="font-display font-bold text-sidebar-accent-foreground text-sm tracking-tight">
                {branding.name}
              </h1>
              <p className="text-[11px] text-sidebar-muted">
                {effectiveAdvisor ? "Advisor Panel" : "Founder Platform"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isAdvisor && <AdvisorNotifications />}
            {isMobile && (
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-sidebar-muted hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors"
                aria-label="Luk menu"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {[
            ...baseNavItems,
            // Settings only for non-advisors (members) and admins
            ...(!isAdvisor || isAdmin ? [{ icon: SettingsIcon, label: "Indstillinger", path: "/settings" }] : []),
            ...(effectiveAdvisor ? advisorNavItems : []),
            ...(isAdmin && effectiveAdvisor ? adminNavItems : []),
          ].map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path, { state: { resetKey: Date.now() } });
                  if (isMobile) setIsOpen(false);
                }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group w-full text-left ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <item.icon
                  className={`h-4 w-4 transition-colors ${
                    isActive ? "text-primary" : "text-sidebar-muted group-hover:text-primary"
                  }`}
                />
                {item.label}
                {item.path === "/chat" && unreadChat > 0 && !isActive && (
                  <span className="ml-auto h-5 min-w-[20px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                    {unreadChat > 99 ? "99+" : unreadChat}
                  </span>
                )}
                {isActive && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-sidebar-border space-y-3">
          {isAdvisor && (
            <div className="space-y-2">
              {/* Company picker – hidden in "view as member" mode */}
              {!viewingAsMember && (
              <div className="relative">
                <button
                  onClick={() => setShowCompanyPicker((v) => !v)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                    isCompanyOverride
                      ? "bg-primary/15 text-primary border border-primary/20"
                      : "bg-secondary/50 hover:bg-secondary text-foreground"
                  }`}
                >
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate flex-1 text-left">
                    {isCompanyOverride ? companyName : "Vis som virksomhed"}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${showCompanyPicker ? "rotate-180" : ""}`} />
                </button>

                {showCompanyPicker && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto z-50">
                    {isCompanyOverride && (
                      <button
                        onClick={() => { clearCompanyOverride(); setShowCompanyPicker(false); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors border-b border-border"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        Tilbage til {ownCompanyName || "min virksomhed"}
                      </button>
                    )}
                    {allCompanies?.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCompanyOverride(c.id, c.name);
                          setShowCompanyPicker(false);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-secondary/60 transition-colors text-foreground"
                      >
                        <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1 text-left">{c.name}</span>
                        {companyName === c.name && isCompanyOverride && (
                          <Check className="h-3 w-3 text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              )}

              {/* View as member toggle */}
              <button
                onClick={toggleViewMode}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 bg-secondary/50 hover:bg-secondary text-foreground"
              >
                {viewingAsMember ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5 text-primary" />
                    <span>Afslut medlemsvisning</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Vis som medlem</span>
                  </>
                )}
              </button>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center overflow-hidden shrink-0">
              {companyLogoUrl ? (
                <img src={companyLogoUrl} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs font-medium text-sidebar-accent-foreground">{initials}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-accent-foreground truncate">
                {profile?.full_name || "Indlæser..."}
              </p>
              <p className="text-[11px] text-sidebar-muted truncate">
                {companyName || (effectiveAdvisor ? "Advisor" : "")}
              </p>
            </div>
            <button
              onClick={signOut}
              className="p-1.5 rounded-lg text-sidebar-muted hover:text-destructive hover:bg-sidebar-accent transition-colors"
              title="Log ud"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default AppSidebar;
