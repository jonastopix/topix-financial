import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { HbSidebar, HbSidebarDrawer, type HbNavEntry } from "./HbSidebar";
import { HbNav } from "./HbNav";
import { useOnboardingTjekliste } from "@/hooks/useOnboardingTjekliste";
import { HbOnboardingTjekliste } from "./HbOnboardingTjekliste";
import { useTjeklisteLukket } from "@/hooks/useTjeklisteLukket";
import { pillenTraekkerSig } from "@/lib/hjemmebane/ankomst";
import { HbVisningSom } from "./HbVisningSom";

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
  // "virksomheder" = rådgiverens virksomhedsliste (/virksomheder, §3.6).
  // Virksomhedssiden (/virksomhed/:companyId) og viderestillingen deler
  // værdien — en virksomhed hører til listen. Markeres af admin-blokkens
  // «Virksomheder» nedenfor.
  active: "boardroom" | "akademiet" | "rapportering" | "noegletal" | "budget" | "handouts" | "booksession" | "podcast" | "rabataftaler" | "events" | "medlemmer" | "community" | "chat" | "virksomheder";
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
  const rodRef = useRef<HTMLDivElement>(null);

  /* Dokument-grunden bag skallen. index.html er hardkodet
     <html class="dark">, så body under ENHVER flade er .dark's
     næsten-sorte --background — .theme-hjemmebane maler kun sit eget
     subtræ. Det gamle AppLayout havde bg-background på wrapperen,
     SAMME farve som body, så iOS' rubber-band eksponerede noget
     usynligt. Papir på sort gør ikke: det var aldrig højdekæden der
     beskyttede den gamle chat — det var farvematchet mellem flade og
     dokument-grund. Derfor males html-elementet papir-farvet mens
     skallen er mountet (BEGGE varianter — overscroll rammer også
     side-flow-fladerne, blot som et kortere glimt), og den tidligere
     inline-værdi lægges tilbage ved unmount, så en gammel-verdens-
     flade ikke arver papir. Bevidst IKKE :has() (støtte-forbehold gør
     et knækket layout værre end problemet) og ikke en global regel
     (:root/.dark i index.css er fredet — PDF-eksporten læser
     --background-VARIABLEN, som denne inline-stil ikke rører). */
  useEffect(() => {
    const el = document.documentElement;
    const forrige = el.style.backgroundColor;
    // Tokenet læses fra det monterede element; fallback-værdien SKAL
    // følge --hb-paper i src/styles/hjemmebane.css.
    const token = rodRef.current
      ? getComputedStyle(rodRef.current).getPropertyValue("--hb-paper").trim()
      : "";
    el.style.backgroundColor = token ? `hsl(${token})` : "hsl(40 33% 97%)";
    return () => {
      el.style.backgroundColor = forrige;
    };
  }, []);
  const { profile, signOut, membershipTier, isAdvisor } = useAuth();
  const avatarSrc = profile?.avatar_url || undefined;
  const userName = profile?.full_name || "Medlem";

  /* ONBOARDING-TJEKLISTEN følger med på alle 17 Hb-sider herfra — ikke fra
     hver side. Hooken henter intet for rådgivere (tjekliste = null), så de
     ser hverken boksen eller menupunktet. Lukket-tilstanden er pr. enhed
     (localStorage) og deles mellem sidebarens punkt og boksen; tælleren
     genaabnTick er menuens «hent den frem»-signal til boksen. Hooks i
     topblokken, før enhver betinget return. */
  const tjeklisteData = useOnboardingTjekliste();
  const { lukket: tjeklisteLukket, setLukket: setTjeklisteLukket } = useTjeklisteLukket();
  const [tjeklisteGenaabnTick, setTjeklisteGenaabnTick] = useState(0);
  // Når boksen er ÅBEN får indholdskolonnen bund-margin, så man kan scrolle
  // forbi den frem for at den dækker det nederste (målt 2/9: «Dine aftaler»
  // og fællesskabet på forsiden). Under lg fylder boksen op til 70vh i
  // bunden; på lg står den i hjørnet (360 px bred, op til 70vh høj) — begge
  // får luft nok til at det sidste indhold kan komme fri.
  const [tjeklisteUdfoldet, setTjeklisteUdfoldet] = useState(false);
  const tjeklisteBundluft = tjeklisteUdfoldet ? "pb-[72vh] lg:pb-[30rem]" : "";
  const tjeklisteFornavn = profile?.full_name?.trim().split(/\s+/)[0] || null;
  // Pillen trækker sig KUN på forsiden, og KUN når fokuskortet faktisk
  // viser tjeklisten (samme dom som nextStep.ts:221). Skallen er den
  // eneste der kender ruten (`active`), så dommen falder her og gives til
  // boksen som prop (src/lib/hjemmebane/ankomst.ts, §10 3/9).
  const tjeklistePilleTraekkerSig = pillenTraekkerSig(active, tjeklisteData.tjekliste);
  // Menupunktet vises kun for medlemmer, og kun når listen ikke er færdig
  // ELLER medlemmet selv har lukket den (så den kan hentes frem igen).
  const komGodtIGang =
    !isAdvisor && tjeklisteData.tjekliste && (!tjeklisteData.tjekliste.faerdig || tjeklisteLukket)
      ? {
          onClick: () => {
            setTjeklisteLukket(false);
            setTjeklisteGenaabnTick((t) => t + 1);
          },
        }
      : undefined;

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
  /* ADMIN-BLOKKEN (raadgiverfladen-design.md §3.1, §11 pkt. 3): en rådgiver
     på en Hjemmebane-flade havde ingen vej til admin — hverken til de otte
     /admin/indhold-faner eller til de gamle admin-sider (målt 4/9: nul
     menupunkter pegede på /admin/indhold, og /admin/import var kun nåelig
     ved at kende URL'en). To punkter: Virksomheder og Platform.
     «Er rådgiver» er `isAdvisor` fra useAuth — samme dom som tjeklisten
     (linje 100, 221) og HbVisningSom bruger; ingen ny kilde.
     «Virksomheder» peger på /virksomheder — den rene Hb-liste (#605, #615,
     #621; da blokken blev bygget i #603 fandtes den ikke, og linket pegede
     på /members). Den er en Hb-flade i denne skal, så punktet markeres
     aktivt på listen, virksomhedssiden og viderestillingen (alle giver
     active="virksomheder"). Platform-punkterne peger stadig på
     AppLayout-sider, så designsproget skifter når man klikker. Det er et
     bevidst valg (Jonas, 4/9): en synlig skalskifte er bedre end en skjult
     side — samme begrundelse som /settings-linket i HbSidebar; de får
     ingen `active`, for ingen af dem renderer i denne skal. */
  const adminBlok: HbNavEntry[] = isAdvisor
    ? [
        { label: "Virksomheder", to: "/virksomheder", active: active === "virksomheder", admin: true },
        {
          label: "Platform",
          admin: true,
          children: [
            { label: "Indhold", to: "/admin/indhold" },
            { label: "E-mails", to: "/admin/emails" },
            { label: "E-mail-log", to: "/admin/email-log" },
            { label: "Review Queue", to: "/admin/review-queue" },
            { label: "Platformconfig", to: "/admin/config" },
            { label: "Feedback", to: "/admin/feedback" },
            { label: "Legat", to: "/admin/legat" },
            { label: "Import", to: "/admin/import" },
          ],
        },
      ]
    : [];
  // Blokken hægtes på BEGGE grene — også abonnentens. Det er ikke afgjort
  // om en rådgivers egen membershipTier kan være "subscriber"; sker det, må
  // admin-blokken ikke forsvinde med medlemspunkterne.
  const medlemsNav: HbNavEntry[] = erAbonnent
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
  const nav: HbNavEntry[] = [...medlemsNav, ...adminBlok];

  return (
    <div ref={rodRef} className={`theme-hjemmebane ${fuld ? "h-screen-safe" : "min-h-screen"} bg-hb-paper font-body text-hb-ink antialiased`}>
      <div className={`flex ${fuld ? "h-full overflow-hidden" : "lg:h-screen lg:overflow-hidden"}`}>
        <HbSidebar avatarSrc={avatarSrc} userName={userName} nav={nav} homeTo={boardroomTo} onSignOut={signOut} komGodtIGang={komGodtIGang} />
        <div className={`min-w-0 flex-1 ${fuld ? "flex flex-col overflow-hidden" : "lg:overflow-y-auto"}`}>
          <HbNav onMenuClick={() => setDrawerOpen(true)} avatarSrc={avatarSrc} />
          {/* «Visning som» (3/9, recon-raadgiverfladen §4): en rådgiver med et
              valgt medlem får linjen øverst i indholdskolonnen — under
              mobil-topbaren, over <main> — sticky, så vejen tilbage altid er
              synlig uden at flytte fladen. Renderer null for alle andre. */}
          <HbVisningSom />
          <HbSidebarDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            avatarSrc={avatarSrc}
            userName={userName}
            nav={nav}
            homeTo={boardroomTo}
            onSignOut={signOut}
            komGodtIGang={komGodtIGang}
          />
          {fuld ? (
            <main className={`flex min-h-0 flex-1 flex-col ${tjeklisteBundluft}`}>{children}</main>
          ) : (
            <main className={`mx-auto max-w-[1200px] px-6 py-10 md:py-14 ${tjeklisteBundluft}`}>{children}</main>
          )}
        </div>
      </div>
      {!isAdvisor && (
        <HbOnboardingTjekliste
          tjekliste={tjeklisteData.tjekliste}
          harVelkomstvideo={tjeklisteData.harVelkomstvideo}
          velkomstvideoSetAt={tjeklisteData.velkomstvideoSetAt}
          fornavn={tjeklisteFornavn}
          lukket={tjeklisteLukket}
          setLukket={setTjeklisteLukket}
          genaabnTick={tjeklisteGenaabnTick}
          markerVelkomstSet={tjeklisteData.markerVelkomstSet}
          onUdfoldetChange={setTjeklisteUdfoldet}
          pilleTraekkerSig={tjeklistePilleTraekkerSig}
        />
      )}
    </div>
  );
};
