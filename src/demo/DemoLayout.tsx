import { useState } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { LayoutDashboard, FileText, Wallet, Target, BarChart3, BookOpen, MessageCircle, ExternalLink, Menu, X } from "lucide-react";
import { DEMO_COMPANY, DEMO_USER } from "./demoData";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";

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
  const [menuOpen, setMenuOpen] = useState(false);

  const activeLabel = NAV.find(n => pathname === n.to)?.label ?? "Demo";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Demo banner */}
      <div className="bg-[hsl(var(--chart-warning))] text-foreground text-center text-sm font-medium py-2 px-4 flex items-center justify-center gap-2 shrink-0">
        <span className="hidden sm:inline">🎯 Demovisning — fiktive data</span>
        <span className="sm:hidden">🎯 Demo</span>
        <span className="mx-1">·</span>
        <a
          href="https://theboardroom.dk"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 font-semibold inline-flex items-center gap-1 hover:opacity-80"
        >
          Ansøg <span className="hidden sm:inline">til The Boardroom</span> <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center h-12 px-4 border-b border-border bg-sidebar shrink-0">
        <button onClick={() => setMenuOpen(true)} className="p-1.5 -ml-1.5 rounded-md hover:bg-sidebar-accent">
          <Menu className="h-5 w-5 text-sidebar-foreground" />
        </button>
        <span className="ml-3 font-display text-sm font-bold text-sidebar-primary-foreground tracking-tight">
          {activeLabel}
        </span>
      </div>

      {/* Mobile drawer */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground">
          <VisuallyHidden.Root><SheetTitle>Navigation</SheetTitle></VisuallyHidden.Root>
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
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
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
          <div className="p-4 border-t border-sidebar-border text-xs text-sidebar-muted mt-auto">
            <p className="font-medium text-sidebar-foreground">{DEMO_USER}</p>
            <p className="truncate">{DEMO_COMPANY}</p>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
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

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
