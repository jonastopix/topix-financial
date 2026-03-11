import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { Eye, EyeOff, Building2, ArrowLeft } from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
  fullscreen?: boolean;
}

const AppLayout = ({ children, fullscreen = false }: AppLayoutProps) => {
  const isMobile = useIsMobile();
  const { isCompanyOverride, companyName, clearCompanyOverride, isAdvisor } = useAuth();
  const { viewingAsMember, toggleViewMode } = useViewMode();
  const navigate = useNavigate();

  const handleExitCompanyOverride = () => {
    clearCompanyOverride();
    navigate("/");
  };

  const modeBanners = (
    <>
      {/* Member-view banner — always visible when active */}
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

      {/* Company override banner — visible when viewing another company (not in member-view) */}
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
  );

  if (fullscreen) {
    return (
      <div className="min-h-screen-safe bg-background">
        {modeBanners}
        <main className="min-h-screen-safe">
          <div className="h-screen-safe">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen-safe bg-background">
      <AppSidebar />
      <main className={`min-h-screen-safe transition-all duration-300 overflow-x-hidden ${isMobile ? "ml-0" : "ml-64"}`}>
        {modeBanners}
        <div className={`${isMobile ? "px-4 pb-6 pt-16" : "p-8"}`}>{children}</div>
      </main>
    </div>
  );
};

export default AppLayout;
