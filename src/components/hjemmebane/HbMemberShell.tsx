import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { HbSidebar, HbSidebarDrawer, type HbNavEntry } from "./HbSidebar";
import { HbNav } from "./HbNav";
import { HbKlokke } from "./HbKlokke";
import { useOnboardingTjekliste } from "@/hooks/useOnboardingTjekliste";
import { HbOnboardingTjekliste } from "./HbOnboardingTjekliste";
import { useTjeklisteLukket } from "@/hooks/useTjeklisteLukket";
import { useHbDokumentGrund } from "@/hooks/useHbDokumentGrund";
import { erErfarentMedlem, onboardingBoksMonteres, pillenTraekkerSig } from "@/lib/hjemmebane/ankomst";
import { HbVisningSom } from "./HbVisningSom";
import { HbFeedbackDialog } from "./HbFeedbackDialog";
import { HbRaadgiverSkrev } from "./HbRaadgiverSkrev";
import { useRaadgiverSkrev } from "@/hooks/raadgiverSkrev";
import { useLocation, useNavigate } from "react-router-dom";
import { bygHbNav, medLiveMaerke, type HbAktiv } from "@/lib/hjemmebane/hbNav";
import { PODCAST_SPOTIFY_TEKST, PODCAST_SPOTIFY_URL } from "@/lib/hjemmebane/podcastSpotify";
import { useQuery } from "@tanstack/react-query";
import { useOnlineTracking } from "@/hooks/onlineTracking";
import { listAllUpcomingEvents } from "@/lib/hjemmebane/akademiApi";
import { LIVE_MAERKE, liveEvent, liveEventSti, liveEventTitel } from "@/lib/hjemmebane/liveEvent";
import { useCertificate } from "@/hooks/useCertificate";
import { HbStedsSaetning } from "./HbStedsSaetning";
import { HbNetvaerkFaner } from "./netvaerk/HbNetvaerkFaner";
import { netvaerksSti, skallenTegnerSaetning } from "@/lib/hjemmebane/stedsSaetninger";

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
  /* FEEDBACK (11/9, kort 85): dialogen monteres HER, i skallens eget
     DOM-træ (.theme-hjemmebane), og åbnes fra «Giv feedback» i sidebarens
     profilblok — i kolonnen og i skuffen (samme prop). Fra skuffen lukkes
     skuffen først, så dialogen ikke står bag den. Kun for medlemmer og
     abonnenter (!isAdvisor), samme gate som «Indstillinger». */
  const [feedbackAaben, setFeedbackAaben] = useState(false);

  /* Dokument-grunden bag skallen: html males papir-farvet mens skallen er
     mountet (BEGGE varianter — overscroll rammer også side-flow-fladerne,
     blot som et kortere glimt) og lægges tilbage ved unmount. Hvorfor og
     hvordan står i hooket — det flyttede dertil 4/9, da login, Betal og
     admin-skallen skulle gøre det samme (mobilens grønne bundstykke). */
  useHbDokumentGrund(rodRef);
  const { user, profile, signOut, membershipTier, isAdvisor, isPartner } = useAuth();
  /* ONLINE NU (Jonas 16/9; hjerteslag 30/9, hooks/onlineTracking): medlemmet
     slår hjerteslag i online_hjerteslag (egen række, mens fanen er synlig),
     så rådgiverne kan se hvem der har appen åben. Gaten er useAuth's RÅ
     isAdvisor — ikke viewingAsMember: i «Se som medlem» er rådgiveren stadig
     rådgiver og slår aldrig hjerteslag. Abonnenter slår hjerteslag (de er
     medlemmer i skallen); om de vises afgør rådgiverens dom.
     Hook i topblokken, før enhver betinget return. */
  useOnlineTracking(!!user && !isAdvisor, user?.id);
  /* «EN RÅDGIVER HAR LIGE SKREVET» (Jonas 1/10, hooks/raadgiverSkrev): en ny
     rådgiverbesked, mens medlemmet er i appen og IKKE i chatten, giver et
     roligt kort med uddrag og «Åbn chatten». Samme gate som hjerteslaget
     (RÅ isAdvisor). Markerer intet læst. Hooks i topblokken. */
  const location = useLocation();
  const navigate = useNavigate();
  const raadgiverSkrev = useRaadgiverSkrev(!!user && !isAdvisor, user?.id, location.pathname);
  const avatarSrc = profile?.avatar_url || undefined;
  const userName = profile?.full_name || "Medlem";

  /* ONBOARDING-TJEKLISTEN følger med på alle 17 Hb-sider herfra — ikke fra
     hver side. Hooken henter intet for rådgivere (tjekliste = null), så de
     ser hverken boksen eller menupunktet. Lukket-tilstanden følger medlemmet
     (profilen, localStorage som cache — useTjeklisteLukket, 11/9) og deles
     mellem sidebarens punkt og boksen; tælleren
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
  /* Chatten på mobil: boksen monteres ikke (onboardingBoksMonteres i
     ankomst.ts — den dækkede sendefeltet). Bredden læses synkront ved første
     render (ikke useIsMobile, der er false indtil effekten har kørt): ellers
     ville boksen mountes et øjeblik og køre sine effekter. Grænsen er md
     (< 768), som useIsMobile. */
  const [erMobil, setErMobil] = useState<boolean>(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const paaAendring = () => setErMobil(window.innerWidth < 768);
    mql.addEventListener("change", paaAendring);
    paaAendring();
    return () => mql.removeEventListener("change", paaAendring);
  }, []);
  const boksMonteres = onboardingBoksMonteres(active, erMobil);
  // pb-[72vh] findes kun for den udfoldede boks' skyld; uden boks intet
  // bund-luft (i layout="fuld" åd det beskedlisten, målt 29/9).
  const tjeklisteBundluft = tjeklisteUdfoldet && boksMonteres ? "pb-[72vh] lg:pb-[30rem]" : "";
  const tjeklisteFornavn = profile?.full_name?.trim().split(/\s+/)[0] || null;
  // Pillen trækker sig KUN på forsiden, og KUN når fokuskortet faktisk
  // viser tjeklisten (tjeklistenStyrerForsiden — samme dom som motoren).
  // Et erfarent medlem (30/9, > 30 døgn siden medlemSiden) får ikke listen
  // i kortet, så pillen bliver stående dér. Skallen er den
  // eneste der kender ruten (`active`), så dommen falder her og gives til
  // boksen som prop (src/lib/hjemmebane/ankomst.ts, §10 3/9).
  const tjeklistePilleTraekkerSig = pillenTraekkerSig(active, tjeklisteData.tjekliste, tjeklisteData.medlemSiden, new Date());
  // Samme dom giver boksen besked om, at velkomsten IKKE skal springe
  // automatisk op for et erfarent medlem (30/9, velkomstVisesAutomatisk i
  // ankomst.ts); den eksplicitte åbning fra listen/#velkomst er uændret.
  const tjeklisteErfarentMedlem = erErfarentMedlem(tjeklisteData.medlemSiden, new Date());
  // Menupunktet vises kun for medlemmer, og kun når listen ikke er færdig
  // ELLER medlemmet selv har lukket den (så den kan hentes frem igen).
  const komGodtIGang =
    !isAdvisor && boksMonteres && tjeklisteData.tjekliste && (!tjeklisteData.tjekliste.faerdig || tjeklisteLukket)
      ? {
          onClick: () => {
            setTjeklisteLukket(false);
            setTjeklisteGenaabnTick((t) => t + 1);
          },
        }
      : undefined;

  /* Abonnenten (exit-produktet) beholder KUN Dine tal og Rabataftaler
     (Podcast & Talks var med til 15/9 — podcasten er ude af platformen,
     beslutning 17; se hbNav.ts). Alt andet er lukket i datalaget siden
     13-08-2026 (PR #350, #351, #354).
     membershipTier er null i flere renders efter loading er falsk (useAuth
     henter tier i en SENERE runde). null betyder UAFGJORT, aldrig abonnent —
     behandles null som abonnent, flimrer nav'en for alle medlemmer ved hver
     sideindlæsning. */
  const erAbonnent = membershipTier === "subscriber";
  const givFeedback = !isAdvisor
    ? {
        onClick: () => {
          setDrawerOpen(false);
          setFeedbackAaben(true);
        },
      }
    : undefined;
  /* Podcasten på Spotify (15/9): ét tekstlink nederst i sidebaren for
     medlemmer og abonnenter — ikke rådgivere (beslutning 17). Samme gate
     som Indstillinger og Giv feedback. */
  const spotifyLink = !isAdvisor ? { href: PODCAST_SPOTIFY_URL, tekst: PODCAST_SPOTIFY_TEKST } : undefined;

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
  // «Økonomi» (Ø2, 18/9) kun for partnere — useAuth's isPartner, aldrig isAdmin.
  /* «DIT CERTIFIKAT» (29/9): punktet findes kun for fulde medlemmer, hvis
     virksomhed har flaget (companies.certificate_eligible — alle siden
     20260929195000; false er et fravalg) — useCertificate svarer null
     for alle andre uden et kald, og deler cache-nøgle med siden /certifikat,
     så skallen koster ét opslag pr. session, ikke ét pr. side. Hook i
     topblokken, før enhver betinget return. */
  const certifikat = useCertificate();
  const navUdenMaerke: HbNavEntry[] = bygHbNav({ isAdvisor, erAbonnent, active, isPartner, certifikat: certifikat.menu });
  /* STEDSÆTNINGEN (seks steder, 2/10): «Det her er stedet, hvor …» øverst på
     hvert af det fulde medlems seks steder — valgt af STIEN (stedsSaetninger),
     ikke af `active`, så undersider tier. Hvem der ser den (det fulde medlem,
     en rådgiver i «Se som medlem», aldrig abonnenten) afgør komponenten selv —
     skallen gater ikke. Forsiden («/») tegner selv sætningen under hilsenen
     (BoardroomView), og de fem steder med eget redaktionelt hoved
     (STEDER_MED_EGET_HOVED: Dine tal, Dine mål, Akademiet) tegner den selv
     under deres h1 (rådets fund 7, 2/10) — så skallen tegner den KUN, hvor
     den er den eneste indledning: chatten, booking.
     NETVÆRKET (skridt 2, 2/10): på de fem Netværks-stier (/community,
     /events, /medlemmer, /rabataftaler, /deling — ruterne er uændrede)
     tegner skallen i stedet NETVÆRKSHOVEDET (HbNetvaerkFaner: eyebrow → h1 →
     sætningen → fanebjælken) over indholdet — ét sted, fem faner, sætningen
     én gang. Hvem der ser det (det fulde medlem, en rådgiver i «Se som
     medlem»; aldrig abonnenten) afgør komponenten selv, som sætningen.
     Undersider (/community/:id, /events/:id, /medlemmer/:userId) får intet. */
  const stedsSaetningSti = skallenTegnerSaetning(location.pathname) ? location.pathname : null;
  const netvaerkHovedSti = netvaerksSti(location.pathname);

  /* «LIVE NU» VED EVENTS (Jonas 10/9). Hentningen deler cache-nøgle med
     /events og Community-composeren (["events", "upcoming-all"]), så
     skallen koster intet ekstra kald på en side der alligevel henter
     events, og ellers ét kald pr. fem minutter pr. session — ikke ét pr.
     side. Live-tilstanden regnes af den cachede liste mod et ur der
     tikker hvert minut (eventMeetPhase), så mærket kommer og går uden
     refetch. Abonnenter har ikke Events i menuen og får derfor intet
     mærke (dekorationen rammer kun et punkt der findes). Hooks i
     topblokken, før enhver betinget return. */
  const eventsQuery = useQuery({
    queryKey: ["events", "upcoming-all"],
    queryFn: listAllUpcomingEvents,
    enabled: !erAbonnent,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  const [nu, setNu] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNu(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const live = liveEvent(eventsQuery.data ?? [], nu);
  // Mærket lander på det punkt, der peger på /events — toppunkt (rådgiveren)
  // ELLER barn under «Netværket» (det fulde medlem, seks steder 2/10).
  const nav: HbNavEntry[] = live ? medLiveMaerke(navUdenMaerke, { tekst: LIVE_MAERKE, to: liveEventSti(live), titel: liveEventTitel(live) }) : navUdenMaerke;

  return (
    <div ref={rodRef} className={`theme-hjemmebane ${fuld ? "h-screen-safe" : "min-h-screen-safe"} bg-hb-paper font-body text-hb-ink antialiased`}>
      <div className={`flex ${fuld ? "h-full overflow-hidden" : "lg:h-screen lg:overflow-hidden"}`}>
        <HbSidebar avatarSrc={avatarSrc} userName={userName} nav={nav} homeTo={boardroomTo} onSignOut={signOut} komGodtIGang={komGodtIGang} visIndstillinger={!isAdvisor} givFeedback={givFeedback} klokke={<HbKlokke />} spotifyLink={spotifyLink} />
        {/* `relative` (30/9, Jonas: «to scrollers i højre side»): uden en positioneret
            forfader fandt absolut placerede elementer (fx `sr-only`-tekster i
            Svartids-uret og Score-kortet) deres ramme i dokumentet i stedet for
            i denne scrollende kolonne — dokumentet blev højere end vinduet, og
            Chrome viste en ANDEN scrollbar og et tomt felt under bunden. Målt
            30/9 22:55 på 1440×900: docH 1113 > 900, eneste element under
            bunden var en sr-only-span. Med `relative` bliver de i kolonnen. */}
        <div className={`relative min-w-0 flex-1 ${fuld ? "flex flex-col overflow-hidden" : "lg:overflow-y-auto"}`}>
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
            givFeedback={givFeedback}
            klokke={<HbKlokke />}
            spotifyLink={spotifyLink}
          />
          {fuld ? (
            <main className={`flex min-h-0 flex-1 flex-col ${tjeklisteBundluft}`}>
              {/* I «fuld» har main ingen padding (chatten tager højden) — sætningen får sin egen, og krymper aldrig.
                  `hidden md:block` (rådets fund 3, 2/10): på mobil ER chatten hele skærmen (100dvh, beskedlisten
                  + feltet), og tre linjer sætning over den æder beskeder — på desktop er der luft. Valgt frem for
                  at tage /chat ud af stederne: «Din rådgiver» skal stadig have sin sætning dér, hvor den har plads. */}
              {stedsSaetningSti && <HbStedsSaetning sti={stedsSaetningSti} className="hidden shrink-0 px-6 pt-6 md:block md:pt-8" />}
              {children}
            </main>
          ) : (
            <main className={`mx-auto max-w-[1200px] px-6 py-10 md:py-14 ${tjeklisteBundluft}`}>
              {stedsSaetningSti && <HbStedsSaetning sti={stedsSaetningSti} className="mb-8" />}
              {netvaerkHovedSti && <HbNetvaerkFaner sti={netvaerkHovedSti} />}
              {children}
            </main>
          )}
        </div>
      </div>
      {!isAdvisor && boksMonteres && (
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
          erfarentMedlem={tjeklisteErfarentMedlem}
        />
      )}
      {!isAdvisor && <HbFeedbackDialog open={feedbackAaben} onClose={() => setFeedbackAaben(false)} />}
      {!isAdvisor && <HbRaadgiverSkrev banner={raadgiverSkrev.banner} onLuk={raadgiverSkrev.luk} onAabn={(sti) => navigate(sti)} />}
    </div>
  );
};
