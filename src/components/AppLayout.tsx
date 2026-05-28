import { ReactNode, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { useStandalone } from "@/hooks/useStandalone";
import { useAppConfig } from "@/hooks/useAppConfig";
import { Eye, Building2, Menu, X, Home, MessageCircle, Zap, MoreHorizontal } from "lucide-react";
import AddToHomescreenPrompt from "./AddToHomescreenPrompt";
import topixIconGreen from "@/assets/topix-icon-green.png";
import FeedbackButton from "@/components/FeedbackButton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ⚠️ HUSK: Opdatér også DashboardActionCenter.tsx når du skifter announcement
const CURRENT_ANNOUNCEMENT = {
  id: "v2026-04-platform-update",
  title: "Nyheder i The Boardroom",
  items: [
    "Din refleksion viser nu automatisk dine milestone-fremskridt",
    "Klik på en virksomhed i koncernoverblikket for at dykke direkte ned i dens data",
    "AI-chefen genererer nyt ugesfokus hver mandag — se det øverst på dit dashboard",
  ],
};

interface AppLayoutProps {
  children: ReactNode;
  fullscreen?: boolean;
}

const AppLayout = ({ children, fullscreen = false }: AppLayoutProps) => {
  const isMobile = useIsMobile();
  const { isCompanyOverride, companyName, clearCompanyOverride, isAdvisor, user, companyId } = useAuth();
  const { viewingAsMember, toggleViewMode } = useViewMode();
  const navigate = useNavigate();
  const location = useLocation();
  const { branding } = useAppConfig();
  const isStandalone = useStandalone();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const { data: unreadCount = 0, isLoading: unreadLoading } = useQuery({
    queryKey: ["mobile-unread-chat", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .limit(10);
      if (!convs?.length) return 0;
      let total = 0;
      for (const conv of convs) {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .neq("sender_id", user.id)
          .is("read_at", null)
          .in("message_type", ["user", "system"]);
        total += count ?? 0;
      }
      return total;
    },
    enabled: !!user && isMobile && !isAdvisor,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: hasPulseThisMonth = true, isLoading: pulseLoading } = useQuery({
    queryKey: ["mobile-pulse-this-month", companyId],
    queryFn: async () => {
      if (!companyId) return true;
      const prev = new Date();
      prev.setMonth(prev.getMonth() - 1);
      const periodKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      const { data } = await supabase
        .from("pulse_checkins")
        .select("id")
        .eq("company_id", companyId)
        .eq("period_key", periodKey)
        .maybeSingle();
      return !!data;
    },
    enabled: !!companyId && isMobile && !isAdvisor,
    staleTime: 5 * 60_000,
  });

  const [showAnnouncement, setShowAnnouncement] = useState(() => {
    try {
      const dismissed = localStorage.getItem("dismissed-announcement");
      return dismissed !== CURRENT_ANNOUNCEMENT.id;
    } catch { return false; }
  });
  const dismissAnnouncement = () => {
    try { localStorage.setItem("dismissed-announcement", CURRENT_ANNOUNCEMENT.id); }
    catch {}
    setShowAnnouncement(false);
  };

  // Redirect advisors on mobile to /chat — chat-first experience
  useEffect(() => {
    if (isMobile && isAdvisor && !viewingAsMember) {
      const advisorMobileAllowed = ["/chat", "/chat/"];
      const isAllowed = advisorMobileAllowed.some(p => location.pathname.startsWith(p));
      if (!isAllowed) {
        navigate("/chat", { replace: true });
      }
    }
  }, [isMobile, isAdvisor, location.pathname, viewingAsMember, navigate]);

  const handleExitCompanyOverride = () => {
    clearCompanyOverride();
    navigate("/");
  };

  const moreMenuItems = [
    { label: "Rapportering", path: "/reports", icon: "📊" },
    { label: "KPI'er", path: "/kpis", icon: "📈" },
    { label: "Budget", path: "/budget", icon: "💰" },
    { label: "Milestones", path: "/milestones", icon: "🎯" },
    { label: "Handouts", path: "/handouts", icon: "📋" },
    { label: "Indstillinger", path: "/settings", icon: "⚙️" },
  ];

  const showPulseBadge = !pulseLoading && !hasPulseThisMonth && new Date().getDate() >= 10;

  const bottomTabs = [
    { label: "Hjem", path: "/", icon: Home, badge: 0 },
    { label: "Chat", path: "/chat", icon: MessageCircle, badge: unreadLoading ? 0 : unreadCount },
    { label: "Refleksion", path: "/pulse", icon: Zap, badge: showPulseBadge ? -1 : 0 },
  ];

  const isOnChat = location.pathname === "/chat";
  const mobileBottomNav = isMobile && !isAdvisor && !isOnChat ? (
    <>
      {showMoreMenu && (
        <div
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
          onClick={() => setShowMoreMenu(false)}
        />
      )}
      {showMoreMenu && (
        <div
          className={`fixed left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl shadow-xl p-4 ${isStandalone ? "safe-bottom-pad" : ""}`}
          style={{ bottom: "4rem" }}
        >
          <div className="grid grid-cols-3 gap-2">
            {moreMenuItems.map(item => (
              <button
                key={item.path}
                onClick={() => { navigate(item.path); setShowMoreMenu(false); }}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-colors ${
                  location.pathname === item.path
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-secondary text-foreground"
                }`}
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="text-xs font-medium text-center">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className={`fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-center justify-around h-16 ${isStandalone ? "safe-bottom-pad" : ""}`}>
        {bottomTabs.map(item => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => { navigate(item.path); setShowMoreMenu(false); }}
              className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-colors relative"
            >
              <div className="relative">
                <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
                {item.badge === -1 && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 border-2 border-background" />
                )}
              </div>
              <span className={`text-[10px] font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                {item.label}
              </span>
              {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />}
            </button>
          );
        })}
        <button
          onClick={() => setShowMoreMenu(v => !v)}
          className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-colors"
        >
          <MoreHorizontal className={`h-5 w-5 ${showMoreMenu ? "text-primary" : "text-muted-foreground"}`} />
          <span className={`text-[10px] font-medium ${showMoreMenu ? "text-primary" : "text-muted-foreground"}`}>
            Mere
          </span>
        </button>
      </nav>
    </>
  ) : null;

  /** Sticky mobile shell: safe-area + topbar + banners as one unit */
  const mobileShell = isMobile ? (
    <div className={`sticky top-0 z-40 bg-background border-b border-border ${isStandalone ? "safe-top-pad" : ""}`}>
      {/* Mobile topbar */}
      <div className="flex items-center gap-3 px-4 h-12">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 rounded-xl hover:bg-secondary transition-colors"
          aria-label="Åbn menu"
        >
          <Menu className="h-5 w-5 text-foreground" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <img src={topixIconGreen} alt="" className="h-5 w-5 object-contain shrink-0" />
          <span className="text-sm font-brand font-bold text-foreground truncate">
            {branding.name}
          </span>
        </div>
      </div>

      {/* Announcement banner — hidden on /chat mobile to free vertical space */}
      {showAnnouncement && !isAdvisor && location.pathname !== "/chat" && (
        <div className="flex items-start justify-between gap-3 px-4 py-3 bg-primary/5 border-t border-primary/20">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-primary mb-1">{CURRENT_ANNOUNCEMENT.title}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-0.5">
              {CURRENT_ANNOUNCEMENT.items.map(item => (
                <li key={item} className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="text-primary/60">·</span> {item}
                </li>
              ))}
            </ul>
          </div>
          <button
            onClick={dismissAnnouncement}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Member-view banner */}
      {viewingAsMember && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-primary/10 border-t border-primary/20 text-xs font-medium text-primary">
          <Eye className="h-3.5 w-3.5" />
          <span>Medlemsvisning aktiv</span>
          <span className="text-primary/40">·</span>
          <button
            onClick={toggleViewMode}
            className="underline underline-offset-2 hover:text-primary/80 transition-colors"
          >
            Afslut
          </button>
        </div>
      )}

      {/* Company override banner */}
      {isCompanyOverride && !viewingAsMember && isAdvisor && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-muted/50 border-t border-border text-xs font-medium text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" />
          <span className="truncate">Virksomhedsvisning: {companyName}</span>
          <span className="text-muted-foreground/40">·</span>
          <button
            onClick={handleExitCompanyOverride}
            className="underline underline-offset-2 hover:text-foreground transition-colors shrink-0"
          >
            Tilbage
          </button>
        </div>
      )}
    </div>
  ) : null;

  /** Desktop banners (no topbar needed — sidebar is always visible) */
  const desktopBanners = !isMobile ? (
    <>
      {showAnnouncement && !isAdvisor && (
        <div className="sticky top-0 z-30 flex items-start justify-between gap-3 px-6 py-3 bg-primary/5 border-b border-primary/20">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-primary mb-1">{CURRENT_ANNOUNCEMENT.title}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-0.5">
              {CURRENT_ANNOUNCEMENT.items.map(item => (
                <li key={item} className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="text-primary/60">·</span> {item}
                </li>
              ))}
            </ul>
          </div>
          <button
            onClick={dismissAnnouncement}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {viewingAsMember && (
        <div className="sticky top-0 z-30 flex items-center justify-center gap-2 px-4 py-1.5 bg-primary/10 border-b border-primary/20 text-xs font-medium text-primary">
          <Eye className="h-3.5 w-3.5" />
          <span>Medlemsvisning aktiv</span>
          <span className="text-primary/40">·</span>
          <button
            onClick={toggleViewMode}
            className="underline underline-offset-2 hover:text-primary/80 transition-colors"
          >
            Afslut
          </button>
        </div>
      )}
      {isCompanyOverride && !viewingAsMember && isAdvisor && (
        <div className="sticky top-0 z-30 flex items-center justify-center gap-2 px-4 py-1.5 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" />
          <span>Virksomhedsvisning: {companyName}</span>
          <span className="text-muted-foreground/40">·</span>
          <button
            onClick={handleExitCompanyOverride}
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Tilbage
          </button>
        </div>
      )}
    </>
  ) : null;

  if (fullscreen) {
    return (
      <div className={`flex flex-col h-screen-safe bg-background overflow-x-hidden ${!isMobile ? "ml-64" : ""}`}>
        <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isStandalone={isStandalone} />
        {mobileShell}
        {desktopBanners}
        <div className={`flex-1 min-h-0 flex flex-col overflow-x-hidden ${isMobile && !isAdvisor && !isOnChat ? "pb-20" : ""}`}>
          {children}
        </div>
        <AddToHomescreenPrompt />
        {mobileBottomNav}
        <FeedbackButton />
      </div>
    );
  }

  // Non-fullscreen: mobile needs bounded height for chat flex-chain; desktop uses min-h
  if (isMobile) {
    return (
      <div className="h-screen-safe flex flex-col bg-background overflow-x-hidden">
        <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isStandalone={isStandalone} />
        <main className="flex-1 min-h-0 flex flex-col overflow-x-hidden">
          {mobileShell}
          <div className={`flex-1 min-h-0 min-w-0 flex flex-col px-4 ${!isAdvisor && !isOnChat ? "pb-20" : "pb-6"}`}>
            {children}
          </div>
        </main>
        <AddToHomescreenPrompt />
        {mobileBottomNav}
        <FeedbackButton />
      </div>
    );
  }

  return (
    <div className="min-h-screen-safe bg-background overflow-x-hidden">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isStandalone={isStandalone} />
      <main className="min-h-screen-safe flex flex-col transition-all duration-300 overflow-x-hidden ml-64">
        {desktopBanners}
        <div className="flex-1 min-h-0 flex flex-col p-8">
          {children}
        </div>
      </main>
      <FeedbackButton />
    </div>
  );
};

export default AppLayout;
