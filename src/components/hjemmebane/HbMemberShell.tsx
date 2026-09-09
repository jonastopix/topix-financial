import * as React from "react";
import { useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { HbSidebar, HbSidebarDrawer, type HbNavEntry } from "./HbSidebar";
import { HbNav } from "./HbNav";
import { useOnboardingTjekliste } from "@/hooks/useOnboardingTjekliste";
import { HbOnboardingTjekliste } from "./HbOnboardingTjekliste";
import { useTjeklisteLukket } from "@/hooks/useTjeklisteLukket";
import { useHbDokumentGrund } from "@/hooks/useHbDokumentGrund";
import { pillenTraekkerSig } from "@/lib/hjemmebane/ankomst";
import { HbVisningSom } from "./HbVisningSom";
import { bygHbNav, type HbAktiv } from "@/lib/hjemmebane/hbNav";

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
  // "milestones" = /milestones i Hb (etape 1, 4/9) — under «Dine tal» som
  // de fire andre.
  active: HbAktiv;
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

  /* Dokument-grunden bag skallen: html males papir-farvet mens skallen er
     mountet (BEGGE varianter — overscroll rammer også side-flow-fladerne,
     blot som et kortere glimt) og lægges tilbage ved unmount. Hvorfor og
     hvordan står i hooket — det flyttede dertil 4/9, da login, Betal og
     admin-skallen skulle gøre det samme (mobilens grønne bundstykke). */
  useHbDokumentGrund(rodRef);
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
  /* MENUEN bygges i src/lib/hjemmebane/hbNav.ts (8/9) — én ren funktion,
     låst af tests: medlemmets menu ORDRET som den var her (fuldt medlem og
     abonnent), og rådgiverens egen (Jonas 8/9: det I bruger øverst —
     Forside, Virksomheder, Indbakke, Community, Indhold — medlemmets flader
     under en overskrift, Platform nederst). Før stod medlemmets ni punkter
     først og admin-blokken (§3.1) sidst for rådgiveren; «Opgaver» er ude
     (listen hører på forsiden). Samme array til desktop-sidebaren og
     mobil-draweren nedenfor. */
  const nav: HbNavEntry[] = bygHbNav({ isAdvisor, erAbonnent, active });

  return (
    <div ref={rodRef} className={`theme-hjemmebane ${fuld ? "h-screen-safe" : "min-h-screen-safe"} bg-hb-paper font-body text-hb-ink antialiased`}>
      <div className={`flex ${fuld ? "h-full overflow-hidden" : "lg:h-screen lg:overflow-hidden"}`}>
        <HbSidebar avatarSrc={avatarSrc} userName={userName} nav={nav} homeTo={boardroomTo} onSignOut={signOut} komGodtIGang={komGodtIGang} visIndstillinger={!isAdvisor} />
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
            visIndstillinger={!isAdvisor}
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
