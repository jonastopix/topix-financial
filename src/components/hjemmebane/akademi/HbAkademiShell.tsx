import * as React from "react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { HbSidebar, HbSidebarDrawer, type HbNavEntry } from "../HbSidebar";
import { HbNav } from "../HbNav";

/** Rigtige links hvor appen har ruter; resten er bevidst udeladt indtil deres
    medlemsflader findes (ingen døde links i en rigtig medlemsflade). */
const AKADEMI_NAV: HbNavEntry[] = [
  { label: "Dit Boardroom", to: "/" },
  {
    label: "Dine tal",
    children: [
      { label: "Rapportering", to: "/reports" },
      { label: "KPI'er", to: "/kpis" },
      { label: "Budget", to: "/budget" },
      { label: "Milestones", to: "/milestones" },
      { label: "Handouts", to: "/handouts" },
    ],
  },
  {
    label: "Din rådgiver",
    children: [
      { label: "Chat", to: "/chat" },
      { label: "Book session", to: "/book-session" },
    ],
  },
  { label: "Akademiet", to: "/akademiet", active: true },
  { label: "Community", to: "/community" },
];

/** Skallen for /akademiet: V0-layoutmodellen (egen scroll-container på lg,
    sidebar som fuldhøjde-kolonne) med rigtige links og brugerens profil. */
export const HbAkademiShell = ({ children }: { children: React.ReactNode }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { profile } = useAuth();
  const avatarSrc = profile?.avatar_url || undefined;
  const userName = profile?.full_name || "Medlem";

  return (
    <div className="theme-hjemmebane min-h-screen bg-hb-paper font-body text-hb-ink antialiased">
      <div className="flex lg:h-screen lg:overflow-hidden">
        <HbSidebar avatarSrc={avatarSrc} userName={userName} nav={AKADEMI_NAV} homeTo="/" />
        <div className="min-w-0 flex-1 lg:overflow-y-auto">
          <HbNav onMenuClick={() => setDrawerOpen(true)} avatarSrc={avatarSrc} />
          <HbSidebarDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            avatarSrc={avatarSrc}
            userName={userName}
            nav={AKADEMI_NAV}
            homeTo="/"
          />
          <main className="mx-auto max-w-[1200px] px-6 py-10 md:py-14">{children}</main>
        </div>
      </div>
    </div>
  );
};
