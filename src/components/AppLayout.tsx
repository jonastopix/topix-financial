import { ReactNode } from "react";
import AppSidebar from "./AppSidebar";
import { useIsMobile } from "@/hooks/use-mobile";

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className={`min-h-screen transition-all duration-300 ${isMobile ? "ml-0" : "ml-64"}`}>
        <div className={`${isMobile ? "px-4 py-6 pt-16" : "p-8"}`}>{children}</div>
      </main>
    </div>
  );
};

export default AppLayout;
