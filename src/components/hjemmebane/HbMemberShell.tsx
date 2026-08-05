import * as React from "react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { HbSidebar, HbSidebarDrawer, type HbNavEntry } from "./HbSidebar";
import { HbNav } from "./HbNav";

/** Fælles Hb-medlemsskal for /akademiet og /boardroom (generalisering af
    den tidligere HbAkademiShell): V0-layoutmodellen (egen scroll-container
    på lg, sidebar som fuldhøjde-kolonne), rigtige links og brugerens
    profil. `active` styrer nav'ens aktiv-markering.
    "Dit Boardroom"-målet er ADVISOR-GATED i byggeperioden (Akademiet-bro-
    mønstret): advisors → /boardroom (den nye forside under byggeri),
    medlemmer → "/" (uændret gammel forside). Ved forside-swappen (GO)
    peger begge på "/" — ingen døde links på noget tidspunkt. */
export const HbMemberShell = ({
  active,
  children,
}: {
  active: "boardroom" | "akademiet" | "rapportering" | "noegletal" | "budget";
  children: React.ReactNode;
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { profile, isAdvisor } = useAuth();
  const { viewingAsMember } = useViewMode();
  const effectiveAdvisor = isAdvisor && !viewingAsMember;
  const avatarSrc = profile?.avatar_url || undefined;
  const userName = profile?.full_name || "Medlem";

  const boardroomTo = effectiveAdvisor ? "/boardroom" : "/";
  const nav: HbNavEntry[] = [
    { label: "Dit Boardroom", to: boardroomTo, active: active === "boardroom" },
    {
      label: "Dine tal",
      children: [
        // Rapportering peger på den nye flade for advisors i byggeperioden
        // (samme gating som Dit Boardroom); medlemmer ser uændret /reports.
        {
          label: "Rapportering",
          to: effectiveAdvisor ? "/rapportering" : "/reports",
          active: active === "rapportering",
        },
        // Samme byggeperiode-gating som Rapportering (KPI-konverteringen).
        {
          label: "KPI'er",
          to: effectiveAdvisor ? "/noegletal" : "/kpis",
          active: active === "noegletal",
        },
        // Samme byggeperiode-gating som Rapportering/KPI'er (budget-konverteringen).
        {
          label: "Budget",
          to: effectiveAdvisor ? "/budgettering" : "/budget",
          active: active === "budget",
        },
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
    { label: "Akademiet", to: "/akademiet", active: active === "akademiet" },
    { label: "Community", to: "/community" },
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
