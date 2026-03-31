import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AdvisorNotifications from "@/components/AdvisorNotifications";
import NotificationCenter from "@/components/NotificationCenter";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  LayoutDashboard,
  FileText,
  Target,
  Settings as SettingsIcon,
  TrendingUp,
  Users,
  Calculator,
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
  BookMarked,
  Heart,
} from "lucide-react";
import { Calculator as CalcIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { isConversationActionable } from "@/lib/advisorActionHelpers";
import topixIconWhite from "@/assets/topix-icon-white.png";

const baseNavItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: FileText, label: "Rapportering", path: "/reports" },
  { icon: Calculator, label: "Budget", path: "/budget" },
  { icon: Target, label: "Milestones", path: "/milestones" },
  
  { icon: TrendingUp, label: "KPI'er", path: "/kpis" },
  { icon: MessageCircle, label: "Chat", path: "/chat" },
];

const secondaryNavItems = [
  { icon: BookMarked, label: "Guide", path: "/guide" },
  { icon: ClipboardList, label: "Handouts", path: "/handouts" },
  { icon: Users, label: "Community", path: "/community" },
];

const advisorNavItems = [
  { icon: UserCog, label: "Medlemmer", path: "/members" },
  { icon: ClipboardList, label: "Review Queue", path: "/admin/review-queue" },
];

const adminNavItems = [
  { icon: Mail, label: "E-mail skabeloner", path: "/admin/emails" },
  { icon: SettingsIcon, label: "Platformconfig", path: "/admin/config" },
  { icon: MessageCircle, label: "Feedback", path: "/admin/feedback" },
];

interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isStandalone?: boolean;
}

const AppSidebar = ({ isOpen, onClose, isStandalone = false }: AppSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user, profile, signOut, isAdvisor, isAdmin, isGroupUser, companyId, companyName, isCompanyOverride, setCompanyOverride, clearCompanyOverride, ownCompanyName } = useAuth();
  const { viewingAsMember, toggleViewMode } = useViewMode();
  const effectiveAdvisor = isAdvisor && !viewingAsMember;
  const [unreadChat, setUnreadChat] = useState(0);

  // Lightweight query: does advisor have any group access?
  const { data: hasGroupAccess } = useQuery({
    queryKey: ["advisor-has-group-access"],
    queryFn: async () => {
      const { count } = await supabase
        .from("group_advisor_access" as any)
        .select("id", { count: "exact", head: true })
        .eq("advisor_user_id", user!.id);
      return (count ?? 0) > 0;
    },
    enabled: !!user && isAdvisor,
    staleTime: 5 * 60_000,
  });
  const { data: newFeedbackCount = 0 } = useQuery({
    queryKey: ["feedback-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("feedback")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
      return count || 0;
    },
    enabled: !!user && isAdmin,
    refetchInterval: 60000,
  });
  const { branding } = useAppConfig();

  // Scoped UI rollout: determine which notification UI to show
  const { data: v2Rollout } = useQuery({
    queryKey: ["app-config", "notification_v2_rollout"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_config")
        .select("config_value")
        .eq("config_key", "notification_v2_rollout")
        .maybeSingle();
      return (data?.config_value as {
        enabled?: boolean;
        test_user_ids?: string[];
        member_rollout?: { enabled?: boolean; company_ids?: string[]; all_members?: boolean };
      }) || null;
    },
    staleTime: 5 * 60_000,
    enabled: !!user,
  });

  // Advisor path (phase 1)
  const useNewNotificationsAdvisor =
    isAdvisor &&
    v2Rollout?.enabled === true &&
    Array.isArray(v2Rollout?.test_user_ids) &&
    v2Rollout.test_user_ids.includes(user?.id || "");

  // Member path (phase 2)
  const memberRollout = v2Rollout?.member_rollout;
  const useNewNotificationsMember =
    !isAdvisor &&
    !!memberRollout?.enabled &&
    (memberRollout.all_members === true ||
      (Array.isArray(memberRollout.company_ids) && memberRollout.company_ids.includes(companyId || "")));

  const useNewNotifications = useNewNotificationsAdvisor || useNewNotificationsMember;
  
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);
  const [companySearch, setCompanySearch] = useState("");

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

  const filteredCompanies = companySearch.trim()
    ? (allCompanies || []).filter(c => c.name.toLowerCase().includes(companySearch.toLowerCase()))
    : (allCompanies || []);

  // Fetch company logo
  const { data: companyLogoData } = useQuery({
    queryKey: ["sidebar-company-logo", user?.id],
    queryFn: async () => {
      const { data: cm } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();
      if (!cm?.company_id) return null;
      const { data } = await supabase
        .from("companies")
        .select("logo_url")
        .eq("id", cm.company_id)
        .single();
      return data?.logo_url || null;
    },
    enabled: !!user && !effectiveAdvisor,
    staleTime: 10 * 60_000,
  });
  const companyLogoUrl = companyLogoData ?? null;

  const fetchUnread = useCallback(async () => {
    if (!user) return;

    if (effectiveAdvisor) {
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, awaiting_reply_from, acknowledged_at, conversation_status, follow_up_at, assigned_advisor_id")
        .eq("awaiting_reply_from", "advisor")
        .neq("conversation_status", "resolved");

      if (!convs) { setUnreadChat(0); return; }
      const now = new Date();
      const count = convs.filter(c =>
        (!c.assigned_advisor_id || c.assigned_advisor_id === user.id) &&
        isConversationActionable(c, now)
      ).length;
      setUnreadChat(count);
    } else {
      const { data: convs } = await supabase.from("conversations").select("id");
      if (!convs || convs.length === 0) { setUnreadChat(0); return; }
      const convIds = convs.map((c) => c.id);
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", convIds)
        .neq("sender_id", user.id)
        .is("read_at", null)
        .eq("message_type", "user");
      setUnreadChat(count || 0);
    }
  }, [user, effectiveAdvisor]);

  useEffect(() => {
    if (!user) return;
    fetchUnread();

    const realtimeTable = effectiveAdvisor ? "conversations" : "messages";
    const channel = supabase
      .channel("sidebar-unread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: realtimeTable },
        () => { fetchUnread(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, location.pathname, fetchUnread, effectiveAdvisor]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    if (isMobile) onClose();
  }, [location.pathname, isMobile]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

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
      {/* Overlay/backdrop — owned by AppSidebar, controlled by isOpen prop */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm animate-fade-in"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-300 ease-out ${
          isMobile
            ? isOpen ? "translate-x-0" : "-translate-x-full"
            : "translate-x-0"
        }`}
      >
        {/* Sidebar header with safe-area for standalone mode */}
        <div className={isStandalone ? "safe-top-pad" : ""}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-sidebar-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-sidebar-accent flex items-center justify-center shrink-0">
                <img src={topixIconWhite} alt="Topix" className="h-5 w-5 object-contain" />
              </div>
              <div>
                <h1 className="font-brand font-bold text-sidebar-accent-foreground text-sm tracking-tight">
                  {branding.name}
                </h1>
                <p className="text-[11px] text-sidebar-muted">
                  {effectiveAdvisor ? "Advisor Panel" : "en del af Topix"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {useNewNotifications ? <NotificationCenter /> : (isAdvisor ? <AdvisorNotifications /> : null)}
              {isMobile && (
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-sidebar-muted hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors"
                  aria-label="Luk menu"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {[
            ...baseNavItems,
            ...(isGroupUser && !effectiveAdvisor ? [
              { icon: Layers, label: "Koncern", path: "/group" },
              { icon: CalcIcon, label: "Koncernbudget", path: "/group/budget" },
            ] : []),
            ...(effectiveAdvisor && hasGroupAccess ? [
              { icon: Layers, label: "Koncerner", path: "/groups" },
            ] : []),
            { icon: SettingsIcon, label: "Indstillinger", path: "/settings" },
            ...(effectiveAdvisor ? advisorNavItems : []),
            
            ...(isAdmin && effectiveAdvisor ? [
              { icon: null as any, label: "Admin", path: "__admin_header__", isHeader: true },
              ...adminNavItems,
            ] : []),
          ].map((item: any) => {
            if (item.isHeader) {
              return (
                <div key={item.path} className="px-3 pt-3 pb-1">
                  <p className="text-[10px] font-semibold text-sidebar-muted uppercase tracking-wider">Admin</p>
                </div>
              );
            }
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                data-tour={item.path === "/reports" ? "nav-reports" : item.path === "/chat" ? "chat-link" : undefined}
                onClick={() => {
                  navigate(item.path, { state: { resetKey: Date.now() } });
                  if (isMobile) onClose();
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
                {item.path === "/admin/feedback" && newFeedbackCount > 0 && !isActive && (
                  <span className="ml-auto h-5 min-w-[20px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                    {newFeedbackCount > 99 ? "99+" : newFeedbackCount}
                  </span>
                )}
                {isActive && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
                )}
              </button>
            );
          })}
          {/* Secondary links */}
          {(
            <div className="mt-3 pt-3 border-t border-sidebar-border/50 space-y-0.5">
              {secondaryNavItems.map(item => {
                const isActive = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path, { state: { resetKey: Date.now() } }); if (isMobile) onClose(); }}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 group w-full text-left mb-0.5 ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-muted hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50"
                    }`}
                  >
                    <item.icon className={`h-3.5 w-3.5 transition-colors ${isActive ? "text-primary" : "text-sidebar-muted group-hover:text-primary"}`} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        <div className="px-4 py-3 border-t border-sidebar-border space-y-2 shrink-0">
          {isAdvisor && (
            <div className="space-y-2">
              {!viewingAsMember && (
              <div className="relative">
                {isMobile ? (
                  <Drawer open={showCompanyPicker} onOpenChange={(open) => { setShowCompanyPicker(open); if (!open) setCompanySearch(""); }}>
                    <button
                      onClick={() => setShowCompanyPicker(true)}
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
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    </button>
                    <DrawerContent>
                      <DrawerHeader>
                        <DrawerTitle>Vælg virksomhed</DrawerTitle>
                      </DrawerHeader>
                      <div className="px-4 pb-4 max-h-[60vh] overflow-y-auto space-y-1">
                        <div className="mb-2">
                          <input
                            type="text"
                            value={companySearch}
                            onChange={(e) => setCompanySearch(e.target.value)}
                            placeholder="Søg virksomhed..."
                            className="w-full px-3 py-2 text-sm rounded-lg bg-secondary border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
                          />
                        </div>
                        {isCompanyOverride && (
                          <button
                            onClick={() => { clearCompanyOverride(); setShowCompanyPicker(false); setCompanySearch(""); }}
                            className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors border-b border-border mb-1"
                          >
                            <EyeOff className="h-4 w-4" />
                            Tilbage til {ownCompanyName || "min virksomhed"}
                          </button>
                        )}
                        {filteredCompanies.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setCompanyOverride(c.id, c.name);
                              setShowCompanyPicker(false);
                              setCompanySearch("");
                            }}
                            className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm hover:bg-secondary/60 transition-colors text-foreground"
                          >
                            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate flex-1 text-left">{c.name}</span>
                            {companyName === c.name && isCompanyOverride && (
                              <Check className="h-4 w-4 text-primary shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="safe-bottom-spacer" />
                    </DrawerContent>
                  </Drawer>
                ) : (
                  <>
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
                      <div className="absolute bottom-full left-0 mb-2 w-full bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto z-[9999]">
                        <div className="p-2 border-b border-border">
                          <input
                            type="text"
                            value={companySearch}
                            onChange={(e) => setCompanySearch(e.target.value)}
                            placeholder="Søg virksomhed..."
                            className="w-full px-2 py-1.5 text-xs rounded-md bg-secondary border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
                          />
                        </div>
                        {isCompanyOverride && (
                          <button
                            onClick={() => { clearCompanyOverride(); setShowCompanyPicker(false); setCompanySearch(""); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors border-b border-border"
                          >
                            <EyeOff className="h-3.5 w-3.5" />
                            Tilbage til {ownCompanyName || "min virksomhed"}
                          </button>
                        )}
                        {filteredCompanies.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setCompanyOverride(c.id, c.name);
                              setShowCompanyPicker(false);
                              setCompanySearch("");
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
                  </>
                )}
              </div>
              )}

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
        <div className="safe-bottom-spacer" />
      </aside>
    </>
  );
};

export default AppSidebar;
