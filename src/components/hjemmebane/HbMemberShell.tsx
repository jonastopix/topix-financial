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
  active: "boardroom" | "akademiet" | "rapportering" | "noegletal" | "budget" | "handouts" | "booksession" | "podcast" | "events" | "medlemmer" | "community";
  children: React.ReactNode;
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { profile, signOut, membershipTier } = useAuth();
  const avatarSrc = profile?.avatar_url || undefined;
  const userName = profile?.full_name || "Medlem";

  /* Abonnenten (exit-produktet) beholder KUN Dine tal og Podcast & Talks.
     Alt andet er lukket i datalaget siden 13-08-2026 (PR #350, #351, #354).
     Podcast & Talks findes endnu ikke som rute — noteret i BACKLOG.
     membershipTier er null i flere renders efter loading er falsk (useAuth
     henter tier i en SENERE runde). null betyder UAFGJORT, aldrig abonnent —
     behandles null som abonnent, flimrer nav'en for alle medlemmer ved hver
     sideindlæsning. */
  const erAbonnent = membershipTier === "subscriber";

  // Forside-GO (2026-08-12): "Dit Boardroom" ér forsiden — "/" for alle.
  // Logo-hjemlinket må ikke sende abonnenten tilbage til en flade de
  // bliver redirigeret væk fra.
  const boardroomTo = erAbonnent ? "/kpis" : "/";
  const dineTal: HbNavEntry = {
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
  };
  // Podcast & Talks-GO 2026-08-13: /podcast bærer fladen. ÉT objekt delt
  // af begge nav-grene (dineTal-mønstret), så abonnentens og medlemmets
  // punkt ikke kan skride fra hinanden.
  const podcastTalks: HbNavEntry = {
    label: "Podcast & Talks",
    to: "/podcast",
    active: active === "podcast",
  };
  const nav: HbNavEntry[] = erAbonnent
    ? [dineTal, podcastTalks]
    : [
        { label: "Dit Boardroom", to: boardroomTo, active: active === "boardroom" },
        dineTal,
        {
          label: "Din rådgiver",
          children: [
            { label: "Chat", to: "/chat" },
            // BookSession-GO 2026-08-13: /book-session bærer Hb-fladen.
            {
              label: "Book session",
              to: "/book-session",
              active: active === "booksession",
            },
          ],
        },
        { label: "Akademiet", to: "/akademiet", active: active === "akademiet" },
        podcastTalks,
        { label: "Events", to: "/events", active: active === "events" },
        { label: "Netværket", to: "/medlemmer", active: active === "medlemmer" },
        { label: "Community", to: "/community", active: active === "community" },
      ];

  return (
    <div className="theme-hjemmebane min-h-screen bg-hb-paper font-body text-hb-ink antialiased">
      <div className="flex lg:h-screen lg:overflow-hidden">
        <HbSidebar avatarSrc={avatarSrc} userName={userName} nav={nav} homeTo={boardroomTo} onSignOut={signOut} />
        <div className="min-w-0 flex-1 lg:overflow-y-auto">
          <HbNav onMenuClick={() => setDrawerOpen(true)} avatarSrc={avatarSrc} />
          <HbSidebarDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            avatarSrc={avatarSrc}
            userName={userName}
            nav={nav}
            homeTo={boardroomTo}
            onSignOut={signOut}
          />
          <main className="mx-auto max-w-[1200px] px-6 py-10 md:py-14">{children}</main>
        </div>
      </div>
    </div>
  );
};
