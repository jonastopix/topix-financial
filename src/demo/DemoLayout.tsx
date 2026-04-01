import { Link, useLocation, Outlet } from "react-router-dom";
import { LayoutDashboard, FileText, Wallet, Target, BarChart3, BookOpen, MessageCircle, ExternalLink } from "lucide-react";
import { DEMO_COMPANY, DEMO_USER } from "./demoData";

const NAV = [
  { to: "/demo/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/demo/rapportering", label: "Rapportering", icon: FileText },
  { to: "/demo/budget", label: "Budget", icon: Wallet },
  { to: "/demo/milestones", label: "Milestones", icon: Target },
  { to: "/demo/kpis", label: "KPIs", icon: BarChart3 },
  { to: "/demo/handouts", label: "Handouts", icon: BookOpen },
  { to: "/demo/chat", label: "Chat", icon: MessageCircle },
];

export default function DemoLayout() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Demo banner */}
      <div className="bg-[hsl(var(--chart-warning))] text-foreground text-center text-sm font-medium py-2 px-4 flex items-center justify-center gap-2 shrink-0">
        <span>🎯 Demovisning — fiktive data</span>
        <span className="mx-1">·</span>
        <a
          href="https://theboardroom.dk"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 font-semibold inline-flex items-center gap-1 hover:opacity-80"
        >
          Ansøg til The Boardroom <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden md:flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
          <div className="p-4 border-b border-sidebar-border">
            <span className="font-display text-lg font-bold text-sidebar-primary-foreground tracking-tight">
              The Boardroom
            </span>
          </div>

          <nav className="flex-1 py-3 px-2 space-y-0.5">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-sidebar-accent text-sidebar-primary-foreground font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-primary-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-sidebar-border text-xs text-sidebar-muted">
            <p className="font-medium text-sidebar-foreground">{DEMO_USER}</p>
            <p className="truncate">{DEMO_COMPANY}</p>
          </div>
        </aside>

        {/* Mobile nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar border-t border-sidebar-border flex justify-around py-2 safe-area-bottom">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center gap-0.5 text-[10px] ${
                  active ? "text-sidebar-primary" : "text-sidebar-muted"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
