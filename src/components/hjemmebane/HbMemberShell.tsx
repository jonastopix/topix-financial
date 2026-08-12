import * as React from "react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { HbSidebar, HbSidebarDrawer, type HbNavEntry } from "./HbSidebar";
import { HbNav } from "./HbNav";

/** Fælles Hb-medlemsskal for forsiden ("/") og de øvrige medlemsflader
    (generalisering af den tidligere HbAkademiShell): V0-layoutmodellen
    (egen scroll-container på lg, sidebar som fuldhøjde-kolonne), rigtige
    links og brugerens profil. `active` styrer nav'ens aktiv-markering. */
export const HbMemberShell = ({
  active,
  children,
}: {
  // "medlemmer" = Netværket (/medlemmer). Profilsiderne (/medlemmer/:userId)
  // deler værdien — en profil hører til netværket. "community" deles
  // tilsvarende af feed (/community) og trådsider (/community/:id).
  active: "boardroom" | "akademiet" | "rapportering" | "noegletal" | "budget" | "handouts" | "events" | "medlemmer" | "community";
  children: React.ReactNode;
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { profile } = useAuth();
  const avatarSrc = profile?.avatar_url || undefined;
  const userName = profile?.full_name || "Medlem";

  // Forside-GO (2026-08-12): "Dit Boardroom" ér forsiden — "/" for alle.
  const boardroomTo = "/";
  const nav: HbNavEntry[] = [
    { label: "Dit Boardroom", to: boardroomTo, active: active === "boardroom" },
    {
      label: "Dine tal",
      children: [
        // Rapportering-GO 2026-08-06: /reports bærer fladen for alle roller.
        {
          label: "Rapportering",
          to: "/reports",
          active: active === "rapportering",
        },
        // KPI-GO 2026-08-06: /kpis bærer fladen for alle roller.
        {
          label: "KPI'er",
          to: "/kpis",
          active: active === "noegletal",
        },
        // Budget-GO 2026-08-06: /budget bærer fladen for alle roller.
        {
          label: "Budget",
          to: "/budget",
          active: active === "budget",
        },
        { label: "Milestones", to: "/milestones" },
        // Handouts-GO 2026-08-06: /handouts bærer fladen for alle roller.
        {
          label: "Handouts",
          to: "/handouts",
          active: active === "handouts",
        },
      ],
    },
    {
      label: "Din rådgiver",
      children: [
        { label: "Chat", to: "/chat" },
        { label: "Book session", to: "/book-session" },
      ],
    },
    { label: "Akademiet", to: "/akademiet", active: active === "akademiet" },
    { label: "Events", to: "/events", active: active === "events" },
    { label: "Netværket", to: "/medlemmer", active: active === "medlemmer" },
    { label: "Community", to: "/community", active: active === "community" },
  ];

  return (
    <div className="theme-hjemmebane min-h-screen bg-hb-paper font-body text-hb-ink antialiased">
      <div className="flex lg:h-screen lg:overflow-hidden">
        <HbSidebar avatarSrc={avatarSrc} userName={userName} nav={nav} homeTo={boardroomTo} />
        <div className="min-w-0 flex-1 lg:overflow-y-auto">
          <HbNav onMenuClick={() => setDrawerOpen(true)} avatarSrc={avatarSrc} />
          <HbSidebarDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            avatarSrc={avatarSrc}
            userName={userName}
            nav={nav}
            homeTo={boardroomTo}
          />
          <main className="mx-auto max-w-[1200px] px-6 py-10 md:py-14">{children}</main>
        </div>
      </div>
    </div>
  );
};
