import { ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { useStandalone } from "@/hooks/useStandalone";
import { useAppConfig } from "@/hooks/useAppConfig";
import { Eye, Building2, Menu } from "lucide-react";
import topixIconGreen from "@/assets/topix-icon-green.png";
import FeedbackButton from "@/components/FeedbackButton";

interface AppLayoutProps {
  children: ReactNode;
  fullscreen?: boolean;
}

const AppLayout = ({ children, fullscreen = false }: AppLayoutProps) => {
  const isMobile = useIsMobile();
  const { isCompanyOverride, companyName, clearCompanyOverride, isAdvisor } = useAuth();
  const { viewingAsMember, toggleViewMode } = useViewMode();
  const navigate = useNavigate();
  const { branding } = useAppConfig();
  const isStandalone = useStandalone();

  // AppLayout owns drawer open/close state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleExitCompanyOverride = () => {
    clearCompanyOverride();
    navigate("/");
  };

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
        <div className="flex-1 min-h-0 flex flex-col overflow-x-hidden">
          {children}
        </div>
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
          <div className="flex-1 min-h-0 min-w-0 flex flex-col px-4 pb-6">
            {children}
          </div>
        </main>
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
    </div>
  );
};

export default AppLayout;
