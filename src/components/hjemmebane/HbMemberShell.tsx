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
  layout = "side",
  children,
}: {
  // "medlemmer" = Netværket (/medlemmer). Profilsiderne (/medlemmer/:userId)
  // deler værdien — en profil hører til netværket. "community" deles
  // tilsvarende af feed (/community) og trådsider (/community/:id).
  active: "boardroom" | "akademiet" | "rapportering" | "noegletal" | "budget" | "handouts" | "booksession" | "podcast" | "rabataftaler" | "events" | "medlemmer" | "community" | "chat";
  /* layout="fuld" (chatten, C4 i docs/chat-design.md): AppLayout-
     præcedensen (fullscreen-prop, AppLayout.tsx:28-31, forgrening :337)
     oversat til Hb-skallen. Prop'en findes fordi shell'ens lodrette
     padding deles af alle flader og hverken må vokse eller skrumpe for
     én (BoardroomView:136-138) — derfor en EKSPLICIT variant frem for
     at en flade bryder ud med negative margins. Varianten fjerner
     main'ens max-width/padding og binder højdekæden på ALLE breakpoints
     (h-screen-safe): chattens bundne højde kom før fra AppLayout
     fullscreen på både mobil og desktop, ikke fra fladen selv.
     Kolonnen bliver flex-col uden egen scroll; fladen scroller selv
     indeni. Uden prop'en er alt tegn-for-tegn som før. */
  layout?: "side" | "fuld";
  children: React.ReactNode;
}) => {
  const fuld = layout === "fuld";
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
  // Rabataftaler (13-08-2026): ét delt objekt i begge nav-grene
  // (dineTal-/podcastTalks-mønstret) — abonnenter må bevidst gerne se
  // aftalerne.
  const rabataftaler: HbNavEntry = {
    label: "Rabataftaler",
    to: "/rabataftaler",
    active: active === "rabataftaler",
  };
  const nav: HbNavEntry[] = erAbonnent
    ? [dineTal, podcastTalks, rabataftaler]
    : [
        { label: "Dit Boardroom", to: boardroomTo, active: active === "boardroom" },
        dineTal,
        {
          label: "Din rådgiver",
          children: [
            { label: "Chat", to: "/chat", active: active === "chat" },
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
        rabataftaler,
        { label: "Events", to: "/events", active: active === "events" },
        { label: "Netværket", to: "/medlemmer", active: active === "medlemmer" },
        { label: "Community", to: "/community", active: active === "community" },
      ];

  return (
    <div className={`theme-hjemmebane ${fuld ? "h-screen-safe" : "min-h-screen"} bg-hb-paper font-body text-hb-ink antialiased`}>
      <div className={`flex ${fuld ? "h-full overflow-hidden" : "lg:h-screen lg:overflow-hidden"}`}>
        <HbSidebar avatarSrc={avatarSrc} userName={userName} nav={nav} homeTo={boardroomTo} onSignOut={signOut} />
        <div className={`min-w-0 flex-1 ${fuld ? "flex flex-col overflow-hidden" : "lg:overflow-y-auto"}`}>
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
          {fuld ? (
            <main className="flex min-h-0 flex-1 flex-col">{children}</main>
          ) : (
            <main className="mx-auto max-w-[1200px] px-6 py-10 md:py-14">{children}</main>
          )}
        </div>
      </div>
    </div>
  );
};
