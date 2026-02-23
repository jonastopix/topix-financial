import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Target,
  MessageSquare,
  Settings as SettingsIcon,
  TrendingUp,
  Users,
  Calculator,
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: FileText, label: "Rapportering", path: "/reports" },
  { icon: Calculator, label: "Budget", path: "/budget" },
  { icon: Target, label: "Milestones", path: "/milestones" },
  { icon: TrendingUp, label: "KPI'er", path: "/kpis" },
  { icon: MessageSquare, label: "Feedback", path: "/feedback" },
  { icon: Users, label: "Gruppe", path: "/group" },
  { icon: SettingsIcon, label: "Indstillinger", path: "/settings" },
];

const AppSidebar = () => {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-display font-bold text-sm">BR</span>
        </div>
        <div>
          <h1 className="font-display font-bold text-sidebar-accent-foreground text-sm tracking-tight">
            The Boardroom
          </h1>
          <p className="text-[11px] text-sidebar-muted">Founder Platform</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
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
              {isActive && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center">
            <span className="text-xs font-medium text-sidebar-accent-foreground">JD</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-accent-foreground truncate">
              Jonas Doe
            </p>
            <p className="text-[11px] text-sidebar-muted truncate">Founder & CEO</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;
