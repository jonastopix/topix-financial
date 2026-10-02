import * as React from "react";
import { profilUdfyldt } from "@/lib/hjemmebane/profilUdfyldt";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, ChevronUp, ExternalLink, Play } from "lucide-react";
import { toast } from "sonner";
import { HentningsFejl, kraevRaekker } from "@/lib/kraevRaekker";
import { erManglendeKolonne } from "@/lib/manglendeTabel";
import { dineMaalKvartalstjekKey, hentKvartalstjek, useDineMaalGrundlag } from "@/hooks/dineMaalGrundlag";
import { delBekraeftelser, ventendeKvartalstjekAlle } from "@/lib/hjemmebane/maalBekraeft";
import { FORSIDE_MAAL_ORD, forsideMaalTilstand, forslagListe, SAET_MAAL_STI } from "@/lib/hjemmebane/forsideMaal";
import { ForsideMaalKort, VenterLinje } from "./ForsideMaalKort";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { visNetvaerkFaner } from "@/lib/hjemmebane/netvaerkFaner";
import { useOnboardingTjekliste } from "@/hooks/useOnboardingTjekliste";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import {
  REPORT_OVERRIDE_SELECT,
  getEffectiveReportPeriodKey,
  type ReportData,
} from "@/lib/financialUtils";
import { AREAS, getAssetPreviewUrl, type ContentItem } from "@/lib/hjemmebane/adminContentApi";
import { bunnyThumbnailUrl } from "@/lib/hjemmebane/bunnyMedia";
import { getISOWeekKey } from "@/lib/hjemmebane/week";
import { denneUgesFredag, efterMaalFrist, fraDatoStreng, naesteUgesFredag, omEnMaaned, tilDatoStreng } from "@/lib/hjemmebane/opgaveDato";
import { danskDato, senesteSkridtFrist } from "@/lib/hjemmebane/skridtForslag";
import { forslagMetaLinje, fristTekst } from "@/lib/hjemmebane/aftaler";
import { INGEN_RAADGIVERE, raadgiverAnsigt, raadgiverOpslag, type Ansigt } from "@/lib/hjemmebane/ansigter";
import { vaerterForEvent } from "@/lib/hjemmebane/vaerter";
import { listVaerterForEvents } from "@/lib/hjemmebane/vaerterApi";
import { HbVaerter } from "../events/HbVaerter";
import { afgoerFokusTom, type FokusTom } from "@/lib/hjemmebane/fokusTom";
import { hentefejlTekst, kildeAf, sektionsfejlTekst } from "@/lib/hjemmebane/hentefejl";
import { antalFraSvar, rejselinje } from "@/lib/hjemmebane/rejselinje";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listUpcomingEvents } from "@/lib/hjemmebane/akademiApi";
import { hentFeed } from "@/lib/hjemmebane/communityApi";
import { naesteINetvaerket, NAESTE_I_NETVAERKET } from "@/lib/hjemmebane/naesteINetvaerket";
import { eventMeetPhase, eventNedtaelling } from "@/lib/hjemmebane/eventPhase";
import { EventRegisterAction } from "../events/EventRegisterAction";
import { formatDuration } from "@/components/hjemmebane/admin/editors/shared";
import { handoutConfigs, moduleOrder, type HandoutModule } from "@/lib/handoutConfig";
import { HbButton } from "../HbButton";
import { FornyelsesBaand } from "./FornyelsesBaand";
import { ScoreKort } from "./ScoreKort";
import { ForsideCertifikatKort } from "../forside/ForsideCertifikatKort";
import { ForsideRaadgiverKort } from "../forside/ForsideRaadgiverKort";
import { useMedlemmetsTrofaeer } from "@/hooks/trofaeer";
import { useBoardroomScore } from "@/hooks/useBoardroomScore";
import { HbCard } from "../HbCard";
import { erDag1, hilsenLinje } from "@/lib/hjemmebane/forsideHilsen";
import { VELKOMST_EYEBROW, VELKOMST_MANCHET, VELKOMST_SET_HJAELP, VELKOMST_SET_KNAP, VELKOMST_TITEL } from "@/lib/hjemmebane/velkomstHistorie";
import { HbVelkomstVideoEmbed } from "../HbVelkomstVideoEmbed";
import { HbSection } from "../HbSection";
import { HbStedsSaetning } from "../HbStedsSaetning";
import { HbAvatar } from "../HbAvatar";
import { HbMaalForklaring } from "../milestones/HbMaalForklaring";
import { MAAL_FORKLARING_OVERSKRIFT } from "@/lib/hjemmebane/maalForklaring";
import { hasRichTextContent } from "@/lib/hjemmebane/richtext";
import { fokusCtaHref, tjeklistenStyrerForsiden } from "@/lib/hjemmebane/ankomst";
import { isTrackedEntry, useAkademiData, type AkademiItem } from "../akademi/useAkademiData";
import { afgoerForloeb, forloebslinje, type Forloebslinje } from "@/lib/hjemmebane/forloeb";
import { maaskeRelevant, MAASKE_RELEVANT_PRAEFIKS } from "@/lib/hjemmebane/maaskeRelevant";
import { afgoerMilepael } from "@/lib/milepaelDom";
import { ALLE_SKRIDT_GJORT_TEKST, dineMaalDom, DINE_MAAL_FEJL_TEKST, DINE_SKRIDT_FEJL_TEKST, TILFOEJ_SKRIDT_FEJL_TEKST, TILFOEJ_SKRIDT_KNAP_TEKST, TILFOEJ_SKRIDT_OK_TEKST, udskudtToastTekst, type SkridtTilDineMaal } from "@/lib/hjemmebane/dineMaal";
import {
  ANDRE_MAAL_OVERSKRIFT, FEJRING_VARIGHED_MS, fejring as lavFejring, forsidePlanDom, MAAL_UDEN_SKRIDT_TEKST, PLAN_INGEN_AKTIVE_TEKST, PLAN_TOM_BOOK, PLAN_TOM_TEKST, SE_HELE_PLANEN, UDEN_MAAL_OVERSKRIFT, VENTER_PAA_JA_OVERSKRIFT,
  type Fejring, type PlanSkridt,
} from "@/lib/hjemmebane/forsidePlan";
import { TilfoejSkridtForm } from "../milestones/HbMaalRaekke";
import type { MaalRaekke } from "@/lib/hjemmebane/planen";
import { lektionsSti } from "@/lib/hjemmebane/lektionerForModul";
import { oevelseLektionSti } from "@/lib/hjemmebane/oevelse";
import { HbVideoEmbed } from "../akademi/HbVideoEmbed";
import { deriveFocus, filtrerUdloebneForslag, type FocusItem } from "./nextStep";
// Dommene (pickMainStory m.fl.) bor stadig i ./pushSelection.ts — forsiden
// kalder dem ikke siden 2/10 (båndet er væk); kun typen StoryCandidate bruges
// af kortene nedenfor. Døde imports fjernet efter rådets fund 9.
import { type StoryCandidate } from "./pushSelection";
import { pushMedie, spotifyEmbedUrl, youtubeIdAf, youtubeNocookieEmbedUrl, youtubeThumbnailUrl } from "./pushMedie";
import { pushOverlinje } from "./pushOverlinje";

/** Dit Boardroom (/boardroom) — Hb-forsiden i VANE-ANKER-IA'en (forside
    PR 2, hb-forside-recon §C/§G): de tre lag i rækkefølgen.
    SEKS STEDER, SKRIDT 2 (2/10-2026 — Jonas' ja til forslagets spørgsmål 2):
    forsiden handler om DIN VIRKSOMHED og din vej — hilsen → stedsætningen →
    (fornyelsen) → «Dit næste skridt» → Boardroom Score (+ trofæer) → «Din
    plan» → «Dit certifikat» → «Din rådgiver» (2/10 eftermiddag) → «Næste i
    Netværket» (ét kort: næste event + nyeste opslag,
    lib/hjemmebane/naesteINetvaerket). «Din måned» er flyttet til /reports
    (DinMaaned.tsx), «Kommende» og «Fra fællesskabet» er taget af — de bor i
    Netværket (faner). Beskrivelsen herunder er historik (17/9–2/10).
    FORSIDE PR 2 (17/9-2026 — Jonas «A på alle» til analyse-medlemmets-
    forside.md §6.4): TOPPEN ER TO KOLONNER på md+ (grid-cols-12): venstre
    7/12 NYHEDEN som stående hovedhistorie (MainStoryShell: mediet øverst
    i fuld kortbredde 16:9, teksten under) med tiles under; højre 5/12
    «DIN MÅNED» (tre tal med retning i ord + sparkline, lib/hjemmebane/
    dinMaaned) og under det «DIT NÆSTE SKRIDT» som kompakt kort (FocusCard
    variant="kompakt" med «Måske relevant» som sidste linje). Mobil:
    hilsen → nyheden → Din måned → Dit næste skridt → resten. Hilsenen
    har fået én linje (forsideHilsen: dagen · «N nye ting siden sidst»,
    dag 1 en fast sætning). Lagene nedenfor er den oprindelige orden —
    Kommende og Fællesskabet står UNDER toppen. FORSIDE PR 3 (17/9, Jonas
    «A» til valg 3): «DIN PLAN» afløser «Dine skridt» + «Dine mål» — målene
    med skridtene under (lib/hjemmebane/forsidePlan), tom-tilstanden som
    invitation, fejring af et gjort skridt; tiles står sidst på mobil, og
    dag 1 afledes af medlemskabets start (14 døgn). Tal-strippen nederst er
    afløst af «Din måned».
    1) "Dit næste skridt" — fokus-motoren (deriveFocus, PR #217)
       m. ALLE kilder: rapport-signal, beskeder, ugens fokus (læses
       INLINE så notifikations-kontrakten "Ugens fokus er klar" → "/"
       indfries), milestones, company_actions, pulse, løftestænger.
       #1 stort, #2-4 som stille linjer.
    2) "Kommende"-sektionen — de næste 2-3 events som egen sektion
       (live-sessions er en kerneydelse, ikke en nyhed). Uden CTA
       (tilmelding er egen leverance).
    3) "Fra os til dig"-båndet — TAGET AF FORSIDEN 2/10-2026 (seks steder,
       Jonas 1/10 22:50: «Det var fyld»; FORBEREDT, afventer Jonas' ja):
       nyheden, «Denne uges video», «Værd at se igen» og «Se tidligere»
       tegnes ikke længere her. Kortene og rykkelisten står i filen og
       pushSelection.ts til «Nyt fra os» i Akademiet. Beskrivelsen nedenfor
       er historik. Værn: seksSteder.guard, forsideTop.guard (rettet).
       Var: kurateret via RYKKELISTEN (PR B3,
       pickMainStory): push → ugens video → nyeste redaktionelle →
       evergreen-rotationen (podcast-kortet UDGIK 17/9 — beslutning 17,
       Jonas 11/9: podcasten er ét Spotify-link i sidebaren). Første
       kandidat vinder hovedpladsen; resten fylder tile-rækken. Hver
       kandidat kan være null af hvilken som helst grund (udløbet — et
       push også af ALDER, PUSH_STANDARD_LEVETID_DAGE — eller tom pulje)
       — båndet vælter aldrig.
    4) Tal-strippen NEDERST som rolig status (uændret indhold/kilder).
    Motoren (deriveFocus) var LÅST i forside-byggeriet; låsen er
    overhalet af opgave-modellen (PR #453 + "Dine aftaler"): slot (f)
    skelner nu proposed/active og peger på #dine-aftaler. Alle nye
    queries er company-scoped og arvet ORDRET fra DashboardActionCenter
    (citeret ved hver query). Advisor-gated route i byggeperioden. */

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "God nat";
  if (h < 12) return "Godmorgen";
  if (h < 18) return "God eftermiddag";
  return "God aften";
};

const proseClasses =
  "prose-hb mt-6 max-w-3xl text-[15px] leading-relaxed text-hb-ink [&_a]:text-hb-rust [&_a]:underline [&_h2]:mt-8 [&_h2]:font-editorial [&_h2]:text-2xl [&_h2]:font-medium [&_h3]:mt-6 [&_h3]:font-editorial [&_h3]:text-xl [&_h3]:font-medium [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-5";

// Uge-nøglen bor nu i den delte helper (PR B1) — samme aritmetik, ordret.

// ── Diskrete tidsmarkeringer (lag 2: "siden sidst"-følelsen) ────────────
const publishedMarker = (iso: string | null): string | null => {
  if (!iso) return null;
  const published = new Date(iso).getTime();
  if (Number.isNaN(published)) return null;
  const days = (Date.now() - published) / 86400000;
  if (days <= 7) return "Ny i denne uge";
  return new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "long" });
};

/** Community-sektionens relative tid — LOKAL pendant til CommunityViews
    relativTid (CommunityView.tsx:22-27, ikke eksporteret), samme form
    ordret. */
const traadRelativTid = (iso: string): string => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "I dag";
  if (days === 1) return "I går";
  return `For ${days} dage siden`;
};

/* Forside PR 4: TraadForfatterAvatar (lokal pendant til ForfatterAvatar) er
   afløst af husets HbAvatar — samme ramme, samme initial i sage, og nu
   ALDRIG et tomt billede (onError → initialen). */

/* «Fra fællesskabet» (det fremhævede opslag som hovedhistorie, PR 4) forlod
   forsiden 2/10 (seks steder, skridt 2): FremhaevetOpslag og dets billede er
   taget ud; det nyeste opslag står nu som én række i «Næste i Netværket». */

/** Sidehovedet: rolig, personlig velkomst — altid til stede (pushet er
    flyttet ned i båndet som hovedhistorie). INGEN eyebrow (polish):
    sidebaren siger allerede "Dit Boardroom", og siden har eyebrows nok
    — rubrikken står selv. Topluften (mt-8 md:mt-10) bor HER i
    komponenten, ikke i shell'en — eyebrow'en bar tidligere luften, og
    shell'ens py-10/14 deles af alle flader og må ikke vokse for én. */
const PageHeader = ({ firstName, velkomst, linje }: { firstName: string; velkomst: boolean; linje: string }) => (
  <section className="mt-8 max-w-3xl md:mt-10">
    <h1 className="font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
      {/* Ankomsten (trin 9, indgangen-overhaling §5): så længe tjeklisten
          styrer forsiden, hedder det «Velkommen» — tidshilsenen kommer
          når medlemmet er kommet ind (listen færdig ELLER erfarent medlem,
          30/9 — tjeklistenStyrerForsiden, ankomst.ts). */}
      {velkomst ? "Velkommen" : getGreeting()}, {firstName}.
    </h1>
    {/* Forside PR 2: én linje der er sand i dag — dagen og «N nye ting siden
        sidst» (flyttet op fra båndet), dag 1 den faste sætning. Dommen er
        lib/hjemmebane/forsideHilsen. */}
    <p className="mt-3 text-sm text-hb-ink-soft" data-hilsen-linje>{linje}</p>
  </section>
);

/** Bånd-varianterne (PR B3): hver kind har ÉT komponentsæt m. en
    variant-prop — "main" (hovedpladsen, col-span-4) og "side"
    (sidespalten, kompakt p-4-kort) — ikke to sæt komponenter. */
type StoryVariant = "main" | "side";

/** Push som lag 2-hovedhistorie (kilde/udløbsdom uændret — pickActivePush).
    Afsender-bylinen (bølge 1, PR 3): findes metadata.author_user_id, vises
    portræt (40 px) + navn — profilen slås op af forælderen (rolle-sikkert
    via get_all_advisor_profiles-RPC'en); manglende avatar → initial-cirkel
    i Hb-toner (admin-vælgerens fallback-mønster). Uden author_user_id:
    fri-tekst-bylinen uændret (bagudkompatibelt). PR B3: main-formen er
    uændret (blot m. HbCard flyttet HERIND fra forælderen); side-formen
    findes for komponentsæt-symmetrien — pushet står først i rykkelisten
    og er i praksis altid main når det findes. */
const PushStory = ({
  push,
  sender,
  coverUrl,
  variant,
}: {
  push: ContentItem;
  sender: { full_name: string; avatar_url: string | null } | null;
  coverUrl: string | null;
  variant: StoryVariant;
}) => {
  const [bodyOpen, setBodyOpen] = useState(false);
  const metadata = (push.metadata as Record<string, unknown>) ?? {};
  const author = (metadata.author as string) || null;
  const hasSenderId = Boolean(metadata.author_user_id);
  const senderName = sender?.full_name ?? author;
  // Overlinjen (forside PR 1, 17/9 — Jonas «A på alle», valg 4/§5.4): «Ny i
  // denne uge» ≤ 7 dage; ellers afsenderen («Fra Morten») når der er en;
  // ellers intet. Datoen («12. august») udstillede alderen — den er væk.
  const marker = pushOverlinje({ publishedAt: push.published_at ?? push.created_at, afsenderNavn: senderName, nu: new Date() });

  // PR A «video i nyheden» (17/9, Jonas: «Morten har lige optaget en
  // spændende podcast (m. video) sammen med Nordea, og den skal frem i
  // bussen»): bærer pushet en YouTube-video (media_provider 'external' +
  // external_url), står AFSPILLEREN i hovedpladsen i stedet for coveret —
  // SAMME gate som «Denne uges video» (YouTubePlayer: cover + play-knap,
  // iframe først ved klik). Coveret bliver forsidebilledet før afspilning;
  // uden cover bruges YouTube-thumbnailet. Dommen er pushMedie (ren).
  const medie = pushMedie(push);
  const player = medie.youtubeId ? (
    <YouTubePlayer youtubeId={medie.youtubeId} title={push.title} coverUrl={coverUrl ?? youtubeThumbnailUrl(medie.youtubeId)} />
  ) : null;

  // PR A (visuel vægt): hovedhistorien skal SE UD som en historie —
  // cover øverst, større overskrift, mere luft. Uden cover bærer
  // afsenderens portræt i STORT format (72 px) den visuelle vægt i
  // stedet; m. cover holdes bylinen lille (40 px). Kun Hb-paletten —
  // vægten kommer fra billede, typografi-skala og luft. Med afspiller
  // bærer den vægten — bylinen holdes lille som m. cover.
  const bigPortrait = !coverUrl && !player && hasSenderId && senderName;

  if (variant === "side") {
    // Redesign (materiale, ikke farve): sidetiles er redaktionelle
    // opslag — ingen ramme/kortbaggrund, kun hb-line-streg og luft.
    return (
      <div className="border-t border-hb-line pt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
          Ugens push{marker && <span className="ml-2 normal-case tracking-normal">· {marker}</span>}
        </p>
        <p className="mt-2 text-[15px] font-medium leading-snug text-hb-ink">{push.title}</p>
        {push.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-hb-ink-soft">{push.description}</p>
        )}
        {senderName && <p className="mt-2.5 text-xs font-medium text-hb-ink">{senderName}</p>}
      </div>
    );
  }

  return (
    // Polering #1: to-spaltet m. cover (billede venstre, tekst højre);
    // uden cover bærer teksten fuld bredde som i dag (bigPortrait-
    // fallback'et er netop cover-løs og forbliver fuldbredde).
    <MainStoryShell coverUrl={player ? null : coverUrl} player={player}>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
        Ugens push{marker && <span className="ml-2 normal-case tracking-normal text-hb-ink-soft">· {marker}</span>}
      </p>
      {bigPortrait ? (
        <div className="mt-4 flex items-start gap-5">
          {/* PR 4: samme 72 px-form gennem HbAvatar — aldrig et tomt billede. */}
          <HbAvatar navn={senderName!} avatarUrl={sender?.avatar_url ?? null} stoerrelse="lg" />
          <div className="min-w-0">
            <h2 className="font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">
              {push.title}
            </h2>
            <p className="mt-2 text-sm font-medium text-hb-ink">{senderName}</p>
          </div>
        </div>
      ) : (
        <h2 className="mt-4 font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">
          {push.title}
        </h2>
      )}
      {push.description && (
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-hb-ink-soft">{push.description}</p>
      )}
      {/* Spotify-episoden (metadata.spotify_url) under manchetten — kun episode-embed, lazy. */}
      {medie.spotifyEpisodeId && (
        <SpotifyEpisodeEmbed episodeId={medie.spotifyEpisodeId} title={push.title} />
      )}
      {!bigPortrait && hasSenderId && senderName ? (
        <p className="mt-5 flex items-center gap-3">
          {sender?.avatar_url ? (
            <img
              src={sender.avatar_url}
              alt={senderName}
              className="h-10 w-10 shrink-0 rounded-full border border-hb-line object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 text-sm text-hb-ink-soft">
              {senderName.charAt(0)}
            </span>
          )}
          <span className="text-sm font-medium text-hb-ink">{senderName}</span>
        </p>
      ) : (
        !bigPortrait && author && <p className="mt-5 text-sm font-medium text-hb-ink">{author}</p>
      )}
      {hasRichTextContent(push.body) && (
        <>
          <button
            type="button"
            onClick={() => setBodyOpen((open) => !open)}
            className="mt-4 flex items-center gap-1.5 text-sm text-hb-rust underline-offset-4 hover:underline"
          >
            {bodyOpen ? "Vis mindre" : "Læs mere"}
            {bodyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {bodyOpen && (
            <div className={proseClasses} dangerouslySetInnerHTML={{ __html: push.body as string }} />
          )}
        </>
      )}
    </MainStoryShell>
  );
};

/** Cover m. play-knap (PR A: INGEN autoplay/lyd før klik): afspilleren
    monteres først når brugeren klikker. Uden cover: rolig, TOM Hb-flade
    m. play-knappen — ingen titel (titlen står allerede over playeren i
    alle tre kaldsteder, og aria-label bærer den for skærmlæsere). Kun
    Hb-toner — vægten kommer fra billedet. */
const PlayCover = ({
  coverUrl,
  title,
  onPlay,
}: {
  coverUrl: string | null;
  title: string;
  onPlay: () => void;
}) => (
  <button
    type="button"
    onClick={onPlay}
    aria-label={`Afspil: ${title}`}
    className="group relative block w-full overflow-hidden rounded-hb border border-hb-line"
  >
    {coverUrl ? (
      <img
        src={coverUrl}
        alt=""
        className="aspect-video w-full object-cover"
      />
    ) : (
      // Fallback uden cover: REN rolig flade — ingen titel-tekst (alle
      // kaldere viser titlen over playeren, og aria-label bærer den for
      // skærmlæsere), så play-cirklen ikke lander oven i tekst.
      <span className="block aspect-video w-full bg-hb-sage/30" />
    )}
    {/* Sløret gælder KUN over et cover (læsbarheds-kontrast for
        play-cirklen på billeder); uden cover er hvilefladen ren, og
        hover-tonen dæmpet. */}
    <span
      className={cn(
        "absolute inset-0 flex items-center justify-center transition-colors",
        coverUrl ? "bg-hb-ink/10 group-hover:bg-hb-ink/20" : "group-hover:bg-hb-ink/10",
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-hb-evergreen text-white shadow-hb-hover transition-transform group-hover:scale-105">
        <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
      </span>
    </span>
  </button>
);

/** YouTube-afspilleren — ÉN delt komponent (PR A, 17/9) for «Denne uges
    video» OG pushet i hovedpladsen, så der ikke findes to. Gaten er
    PlayCover's: INGEN iframe, ingen autoplay, ingen lyd før klik; ved klik
    monteres nocookie-iframen m. autoplay=1 (youtubeNocookieEmbedUrl), så det
    første klik også starter afspilningen. Ingen overlay oven på afspilleren
    (YouTubes vilkår). coverUrl: pushets/videoens eget cover, ellers
    i.ytimg.com-thumbnailet — kalderen vælger. */
const YouTubePlayer = ({ youtubeId, title, coverUrl }: { youtubeId: string; title: string; coverUrl: string | null }) => {
  const [playing, setPlaying] = useState(false);
  return playing ? (
    <iframe
      src={youtubeNocookieEmbedUrl(youtubeId)}
      title={title}
      className="aspect-video w-full rounded-hb border border-hb-line bg-black"
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
    />
  ) : (
    <PlayCover coverUrl={coverUrl} title={title} onPlay={() => setPlaying(true)} />
  );
};

/** Spotify-episoden under pushets manchet (PR A; gaten fra forside PR 1,
    17/9): KUN episode-embed'et (spotifyEmbedUrl — show/track afvises
    allerede i dommen), compact højde (152 px er Spotifys kompakte
    afspiller). SAMME regel som alle husets afspillere (YouTubePlayer,
    Bunny, community-kortene): INTET monteres før klik — før klik står et
    lille kort (Spotify-mærke, «Lyt til episoden», play-knap); ved klik
    monteres iframen (loading="lazy", title). Ingen autoplay: Spotifys
    embed har ingen dokumenteret autoplay-parameter (recon §5.2), så
    afspilningen startes i Spotifys egen knap — det andet klik. */
const SpotifyEpisodeEmbed = ({ episodeId, title }: { episodeId: string; title: string }) => {
  const [playing, setPlaying] = useState(false);
  return playing ? (
    <iframe
      src={spotifyEmbedUrl(episodeId)}
      title={`Spotify: ${title}`}
      className="mt-4 h-[152px] w-full max-w-2xl rounded-xl border-0"
      loading="lazy"
      allow="clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      data-spotify-episode={episodeId}
    />
  ) : (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Lyt til episoden på Spotify: ${title}`}
      className="group mt-4 flex w-full max-w-2xl items-center gap-3 rounded-xl border border-hb-line bg-hb-surface px-4 py-3 text-left transition-colors hover:bg-hb-sage/30"
      data-spotify-episode={episodeId}
      data-spotify-gate
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hb-evergreen text-white transition-transform group-hover:scale-105">
        <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Spotify</span>
        <span className="block text-sm font-medium text-hb-ink">Lyt til episoden</span>
      </span>
    </button>
  );
};

/** Fælles main-layout, ÉT sted for alle main-varianter — STÅENDE fra
    forside PR 2 (17/9, Jonas «A» til valg 1): hovedhistorien bor nu i
    toppens venstre kolonne (7/12 ≈ 640 px), så mediet står ØVERST i fuld
    kortbredde og teksten under — på alle bredder. Før (polering #1) var
    den to-spaltet (medie venstre 42 %, tekst højre) i fuld sidebredde.
    To medie-former:
    - coverUrl (push/redaktionelt/evergreen): billedet i 16:9 (object-cover)
      i fuld kortbredde.
    - player (video): gaten/afspilleren er selv 16:9 og fylder kortbredden
      med kortets luft omkring (en iframe må ikke strækkes). */
const MainStoryShell = ({
  coverUrl,
  player,
  children,
}: {
  coverUrl?: string | null;
  player?: React.ReactNode | null;
  children: React.ReactNode;
}) => {
  if (!player && !coverUrl) {
    return <HbCard className="p-6 md:p-8">{children}</HbCard>;
  }
  return (
    <HbCard className="overflow-hidden" data-hovedhistorie="staaende">
      {player ? (
        <div className="p-5 pb-0 md:p-6 md:pb-0">{player}</div>
      ) : (
        <div className="relative aspect-video w-full">
          <img src={coverUrl!} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>
      )}
      <div className="min-w-0 p-6 md:p-7">{children}</div>
    </HbCard>
  );
};

/** "Denne uges video"-kortet (bølge 1, PR 3 + PR A): valgt m. den DELTE
    dom (pickActiveWeekVideo). INGEN autoplay: kortet viser cover m.
    play-knap, og afspilleren monteres FØRST ved klik — Bunny via det
    eksisterende get-video-embed-flow (HbVideoEmbed 1:1 inkl. loading-/
    fejltilstande, no-op-callbacks: forsiden skriver ikke progress);
    YouTube via nocookie-iframe m. autoplay=1 så FØRSTE klik også starter
    afspilningen. Bunny-cover hentes som Akademiets covers
    (getAssetPreviewUrl, signeret URL); YouTube-cover fra i.ytimg.com.
    YouTube-grenen er den DELTE YouTubePlayer (PR A, 17/9 — samme
    komponent som pushet i hovedpladsen). Alt andet eksternt → "Åbn"-knap. PR B3: variant-prop — "side" er den
    hidtidige form (p-4, alm. brødskrift-titel); "main" er STOR form
    (hovedpladsen når pushet mangler: editorial-titel, mere luft) m.
    SAMME player-blok — gate/afspiller-logikken er delt, kun rammen
    skifter. */
const WeekVideoCard = ({ video, variant }: { video: ContentItem; variant: StoryVariant }) => {
  const [playing, setPlaying] = useState(false);
  const marker = publishedMarker(video.published_at ?? video.created_at);
  const youTubeId = youtubeIdAf(video);
  const isBunny = video.media_provider === "bunny" && Boolean(video.bunny_video_id);

  // Bunny-cover som Akademiet henter covers: signeret URL fra content-assets.
  const coverQuery = useQuery({
    queryKey: ["boardroom", "week-video-cover", video.cover_path ?? null],
    queryFn: () => getAssetPreviewUrl(video.cover_path as string),
    enabled: isBunny && !!video.cover_path,
    staleTime: 30 * 60_000,
  });
  // Manuelt cover_path VINDER; mangler det (38 af 39 videoer), falder
  // Bunny-grenen tilbage til auto-thumbnailet fra pull zonen (usigneret,
  // referrer-gated — se bunnyMedia.ts). YouTube-grenen uændret.
  const coverUrl = isBunny
    ? coverQuery.data ?? bunnyThumbnailUrl(video.bunny_video_id)
    : youTubeId
      ? youtubeThumbnailUrl(youTubeId)
      : null;

  const player = isBunny ? (
    playing ? (
      <HbVideoEmbed itemId={video.id} resumeAt={null} onPosition={() => {}} onCompleted={() => {}} />
    ) : (
      <PlayCover coverUrl={coverUrl} title={video.title} onPlay={() => setPlaying(true)} />
    )
  ) : youTubeId ? (
    // PR A: den DELTE afspiller — samme gate som pushet i hovedpladsen.
    <YouTubePlayer youtubeId={youTubeId} title={video.title} coverUrl={coverUrl} />
  ) : video.external_url ? (
    <a href={video.external_url} target="_blank" rel="noopener noreferrer">
      <HbButton variant="secondary" className="h-9 px-4 text-sm">
        <ExternalLink className="h-4 w-4" />
        Åbn videoen
      </HbButton>
    </a>
  ) : null;

  if (variant === "main") {
    // Polering #1: gaten/afspilleren i venstre spalte, teksten højre.
    return (
      <MainStoryShell player={player}>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
          Denne uges video
          {marker && <span className="ml-2 normal-case tracking-normal text-hb-ink-soft">· {marker}</span>}
        </p>
        <h2 className="mt-4 font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">
          {video.title}
        </h2>
        {video.description && (
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-hb-ink-soft">{video.description}</p>
        )}
        {video.duration_seconds != null && (
          <p className="mt-2 text-sm text-hb-ink-soft">{formatDuration(video.duration_seconds)}</p>
        )}
      </MainStoryShell>
    );
  }

  // Redesign: tile-form — ingen ramme/kortbaggrund; player-blokken
  // (inkl. PlayCover-gaten) er uændret i funktion.
  return (
    <div className="border-t border-hb-line pt-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
        Denne uges video
        {marker && <span className="ml-2 normal-case tracking-normal">· {marker}</span>}
      </p>
      <p className="mt-2 text-[15px] font-medium leading-snug text-hb-ink">{video.title}</p>
      {video.description && (
        <p className="mt-1.5 text-sm leading-relaxed text-hb-ink-soft">{video.description}</p>
      )}
      {video.duration_seconds != null && (
        <p className="mt-1.5 text-xs text-hb-ink-soft">{formatDuration(video.duration_seconds)}</p>
      )}
      <div className="mt-3">{player}</div>
    </div>
  );
};

/** Cover-opslag for indslags-kort — samme signerede-URL-mønster som
    Akademiets covers (getAssetPreviewUrl mod content-assets). */
const useCoverUrl = (coverPath: string | null): string | null =>
  useQuery({
    queryKey: ["boardroom", "story-cover", coverPath],
    queryFn: () => getAssetPreviewUrl(coverPath as string),
    enabled: !!coverPath,
    staleTime: 30 * 60_000,
  }).data ?? null;

/** Redaktionelt indslag (PR B3): cover + titel + hvorfor-linje + evt.
    citat + "Læs artiklen" i nyt vindue. Felterne er B1's metadata-
    konvention (link/quote — jsonb, ingen kolonner). */
const RedaktioneltCard = ({ item, variant }: { item: ContentItem; variant: StoryVariant }) => {
  const coverUrl = useCoverUrl(item.cover_path ?? null);
  const metadata = (item.metadata as Record<string, unknown>) ?? {};
  const link = (metadata.link as string) || null;
  const quote = (metadata.quote as string) || null;
  const marker = publishedMarker(item.published_at ?? item.created_at);

  if (variant === "side") {
    return (
      <div className="border-t border-hb-line pt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
          Redaktionelt{marker && <span className="ml-2 normal-case tracking-normal">· {marker}</span>}
        </p>
        <p className="mt-2 text-[15px] font-medium leading-snug text-hb-ink">{item.title}</p>
        {item.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-hb-ink-soft">{item.description}</p>
        )}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 inline-flex items-center gap-1.5 text-sm text-hb-rust underline-offset-4 hover:underline"
          >
            Læs artiklen
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    );
  }

  return (
    <MainStoryShell coverUrl={coverUrl}>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
        Redaktionelt{marker && <span className="ml-2 normal-case tracking-normal text-hb-ink-soft">· {marker}</span>}
      </p>
      <h2 className="mt-4 font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">
        {item.title}
      </h2>
      {item.description && (
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-hb-ink-soft">{item.description}</p>
      )}
      {quote && (
        <blockquote className="mt-5 max-w-2xl border-l-2 border-hb-evergreen pl-4 font-editorial text-xl italic leading-snug text-hb-ink">
          "{quote}"
        </blockquote>
      )}
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block">
          <HbButton variant="secondary" className="h-9 px-4 text-sm">
            <ExternalLink className="h-4 w-4" />
            Læs artiklen
          </HbButton>
        </a>
      )}
    </MainStoryShell>
  );
};

/** Evergreen-indslaget (PR B3): biblioteket der bærer forsiden når alt
    andet er stille — markeret "Værd at se igen", BEVIDST uden
    tidsmarkering (indslaget er tidløst; en dato ville modsige det). */
const EvergreenCard = ({ item, variant }: { item: ContentItem; variant: StoryVariant }) => {
  const coverUrl = useCoverUrl(item.cover_path ?? null);
  const link = (((item.metadata as Record<string, unknown>) ?? {}).link as string) || null;

  if (variant === "side") {
    return (
      <div className="border-t border-hb-line pt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
          Værd at se igen
        </p>
        <p className="mt-2 text-[15px] font-medium leading-snug text-hb-ink">{item.title}</p>
        {item.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-hb-ink-soft">{item.description}</p>
        )}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 inline-flex items-center gap-1.5 text-sm text-hb-rust underline-offset-4 hover:underline"
          >
            Se indslaget
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    );
  }

  return (
    <MainStoryShell coverUrl={coverUrl}>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Værd at se igen</p>
      <h2 className="mt-4 font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">
        {item.title}
      </h2>
      {item.description && (
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-hb-ink-soft">{item.description}</p>
      )}
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block">
          <HbButton variant="secondary" className="h-9 px-4 text-sm">
            <ExternalLink className="h-4 w-4" />
            Se indslaget
          </HbButton>
        </a>
      )}
    </MainStoryShell>
  );
};

/** Velkomst-kandidaten bærer ingen content_items-række — kun GUID'et (til coveret). */
type VelkomstBand = { velkomst: true; guid: string };
type BandItem = ContentItem | VelkomstBand;

/** VELKOMSTVIDEOEN i hovedpladsen (forside PR 5, 17/9 — Jonas «A» til valg 7):
    den første uge for et nyt medlem, før pushet. SAMME gate som alle husets
    afspillere: PlayCover (Bunny-thumbnailet fra pull zonen, som ugens video)
    og FØRST ved klik monteres HbVelkomstVideoEmbed (den signerede Bunny-
    iframe, samme komponent som overlejringen). «Jeg har set den» stempler
    velkomstvideo_set_at gennem tjeklistens egen mutation (markerVelkomstSet)
    — så «Se velkomsten» krydses af, og hovedpladsen falder tilbage til
    rykkelisten. Side-formen findes for komponentsæt-symmetrien (velkomsten
    står altid først og er derfor main når den findes). */
const VelkomstStory = ({ guid, variant, onSet }: { guid: string; variant: StoryVariant; onSet: () => Promise<void> }) => {
  const [playing, setPlaying] = useState(false);
  const [gemmer, setGemmer] = useState(false);
  const [fejl, setFejl] = useState<string | null>(null);
  const coverUrl = bunnyThumbnailUrl(guid);
  const player = playing ? <HbVelkomstVideoEmbed /> : <PlayCover coverUrl={coverUrl} title={VELKOMST_TITEL} onPlay={() => setPlaying(true)} />;
  const set = async () => {
    setGemmer(true);
    setFejl(null);
    try {
      await onSet();
    } catch (err) {
      console.error("[VelkomstStory] velkomstvideo_set_at kunne ikke sættes:", err);
      setFejl("Vi kunne ikke gemme, at du har set velkomsten. Prøv igen.");
    } finally {
      setGemmer(false);
    }
  };
  if (variant === "main") {
    return (
      <MainStoryShell player={player}>
        <div data-velkomst-historie>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{VELKOMST_EYEBROW}</p>
          <h2 className="mt-4 font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">{VELKOMST_TITEL}</h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-hb-ink-soft">{VELKOMST_MANCHET}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <HbButton variant="secondary" className="h-9 px-4 text-sm" onClick={set} disabled={gemmer} data-velkomst-set>
              {gemmer ? "Et øjeblik…" : VELKOMST_SET_KNAP}
            </HbButton>
            <span className="text-xs text-hb-ink-soft">{VELKOMST_SET_HJAELP}</span>
          </div>
          {fejl && <p className="mt-2 text-sm text-hb-rust">{fejl}</p>}
        </div>
      </MainStoryShell>
    );
  }
  return (
    <div className="border-t border-hb-line pt-4" data-velkomst-historie>
      {player}
      <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{VELKOMST_EYEBROW}</p>
      <p className="mt-1 text-[15px] font-medium leading-snug text-hb-ink">{VELKOMST_TITEL}</p>
    </div>
  );
};

/** Dispatcher: én kandidat → det rigtige kort i den rigtige variant.
    StoryCandidate<T> er kind-agnostisk (dommen er låst) — kandidat-
    byggeren i BoardroomView garanterer kind↔type-parringen, så casts
    her er sikre pr. konstruktion. */
const StoryCard = ({
  story,
  variant,
  pushSender,
  pushCoverUrl,
  onVelkomstSet,
}: {
  story: StoryCandidate<BandItem>;
  variant: StoryVariant;
  pushSender: { full_name: string; avatar_url: string | null } | null;
  pushCoverUrl: string | null;
  /** Forside PR 5: stempler velkomstvideo_set_at (tjeklistens markerVelkomstSet). */
  onVelkomstSet: () => Promise<void>;
}) => {
  switch (story.kind) {
    case "velkomst":
      return <VelkomstStory guid={(story.item as VelkomstBand).guid} variant={variant} onSet={onVelkomstSet} />;
    case "push":
      return (
        <PushStory
          push={story.item as ContentItem}
          sender={pushSender}
          coverUrl={pushCoverUrl}
          variant={variant}
        />
      );
    case "video":
      return <WeekVideoCard video={story.item as ContentItem} variant={variant} />;
    case "redaktionelt":
      return <RedaktioneltCard item={story.item as ContentItem} variant={variant} />;
    case "evergreen":
      return <EvergreenCard item={story.item as ContentItem} variant={variant} />;
  }
};

/* «Din måned» (forside PR 2, 17/9) bor siden 2/10 (seks steder, skridt 2) i
   ./DinMaaned.tsx og tegnes øverst på Dine tals rapporteringsside — ikke her. */

/** Det OpgaveKnapper skal vide om rækken. Bygges af "Dine aftaler"-
    sektionen direkte fra company_actions-rækken — fokus-motoren bærer
    ikke længere handlinger (omtale i fokus, handling i sektionen). */
type OpgaveHandling = {
  /** 'forslag' (proposed: ja+dato / nej tak) eller 'aktiv' (gjort /
      ikke endnu / drop den). */
  slags: "forslag" | "aktiv";
  opgaveId: string;
  deferralCount: number;
  /** "YYYY-MM-DD" — kun sat for aktive opgaver. Fladen gater "Ikke
      endnu" på forfald (B2: spørgsmålet stilles ved forfald) — dommen
      over selve overgangen er stadig motorens (opgaveEngine.udskyd). */
  dueDate: string | null;
};

/** Fladens tre skriveveje mod opgave-modellens edge functions — selve
    kaldet bor i BoardroomView (opgaveMutation). */
type OpgaveKald =
  | { type: "accepter"; opgaveId: string; dato: string }
  | { type: "udskyd"; opgaveId: string; dato?: string }
  | { type: "luk"; opgaveId: string; udfald: "done" | "dropped" | "dismissed" };

/** Knapperne på et opgave-punkt (B1/B6-accept, B7/B11-udskydelse,
    B2/B7-luk). Fladen gentager INGEN regler — motoren bag edge
    functions dømmer, og dens 409-grund vises ordret.

    Datovalget er TRE knapper plus en udvej: B6 kræver at medlemmet
    selv vælger datoen, og indvendingen bogført i B6 er at hver ekstra
    handling historisk har kostet næsten al adoption. Tre knapper
    bevarer valget uden at kræve en kalender. Er accept-raten lav, er
    kalender-først den første justering — det er den observation B6
    beder om.

    "Udskyd" (før 17/9: "Ikke endnu"; forslagets "Tag den" hed "Ja, det gør
    jeg" — forside PR 3) vises kun ved forfald: motoren afviser udskydelse før
    fristen er passeret (B2, opgaveEngine.ts:146-148), og en knap der
    altid svarer 409 er ingen handling. Dommen over overgangen er
    stadig motorens — fladen gater kun visningen.

    MÅLETS FRIST (rådets fund B2, 1/10 eftermiddag): `maalFrist` er den
    seneste frist, skridtet må have (senesteSkridtFrist af målets deadline —
    fra forsidens mål-hentning, ingen ny hentning). Hurtigknapper, der lander
    efter den, slås fra, og kalenderen har den som øvre grænse — serveren
    (doemFristModMaal / doemUdskydModMaal) dømmer stadig; fladen sparer kun
    medlemmet et 400. */
const OpgaveKnapper = ({
  handling,
  busy,
  onKald,
  className,
  maalFrist = null,
}: {
  handling: OpgaveHandling;
  busy: boolean;
  onKald: (kald: OpgaveKald) => void;
  className?: string;
  maalFrist?: string | null;
}) => {
  /** null = grundknapperne; ellers er datovalget åbent for accept (B6)
      eller anden udskydelse (B11). */
  const [datoFormaal, setDatoFormaal] = useState<"accept" | "udskyd" | null>(null);
  const [kalenderAaben, setKalenderAaben] = useState(false);

  const idag = new Date();
  const sendDato = (dato: Date) => {
    const streng = tilDatoStreng(dato);
    if (datoFormaal === "udskyd") onKald({ type: "udskyd", opgaveId: handling.opgaveId, dato: streng });
    else onKald({ type: "accepter", opgaveId: handling.opgaveId, dato: streng });
    setDatoFormaal(null);
    setKalenderAaben(false);
  };

  // Kalenderens øvre grænse (B2). To matchere i en liste frem for ét
  // { before, after }-objekt: i react-day-picker v8 bliver det til et LUKKET
  // interval (kun dagene MELLEM), hvis målets frist ligger før i dag.
  const maksDato = fraDatoStreng(maalFrist);
  const kalenderFra = maksDato ? [{ before: idag }, { after: maksDato }] : { before: idag };

  if (datoFormaal) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <span className="mr-1 text-sm text-hb-ink-soft">Hvornår?</span>
        <HbButton variant="secondary" className="h-9 px-4" disabled={busy || efterMaalFrist(denneUgesFredag(idag), maalFrist)} onClick={() => sendDato(denneUgesFredag(idag))}>
          Denne uge
        </HbButton>
        <HbButton variant="secondary" className="h-9 px-4" disabled={busy || efterMaalFrist(naesteUgesFredag(idag), maalFrist)} onClick={() => sendDato(naesteUgesFredag(idag))}>
          Næste uge
        </HbButton>
        <HbButton variant="secondary" className="h-9 px-4" disabled={busy || efterMaalFrist(omEnMaaned(idag), maalFrist)} onClick={() => sendDato(omEnMaaned(idag))}>
          Om en måned
        </HbButton>
        <Popover open={kalenderAaben} onOpenChange={setKalenderAaben}>
          <PopoverTrigger asChild>
            <HbButton variant="secondary" className="h-9 px-4" disabled={busy}>
              Vælg selv
            </HbButton>
          </PopoverTrigger>
          {/* Stilpas (Popover+Calendar-mønstret fra Milestones.tsx:387-397):
              shadcn-Calendar er bygget på default-tokens og ville stikke
              ud i .theme-hjemmebane — ramme og valgt dag trækkes over på
              hb-line/hb-evergreen her. Fortid er slået fra: motoren
              afviser datoer før i dag (B3/B6). */}
          <PopoverContent className="w-auto border-hb-line bg-white p-0" align="start">
            <Calendar
              mode="single"
              disabled={kalenderFra}
              onSelect={(d) => d && sendDato(d)}
              initialFocus
              className="p-3 pointer-events-auto text-hb-ink"
              classNames={{
                day_selected:
                  "bg-hb-evergreen text-white hover:bg-hb-evergreen hover:text-white focus:bg-hb-evergreen focus:text-white",
                day_today: "border border-hb-evergreen/50 bg-transparent",
              }}
            />
          </PopoverContent>
        </Popover>
        <button
          type="button"
          className="text-sm text-hb-ink-soft underline-offset-4 hover:underline"
          onClick={() => setDatoFormaal(null)}
        >
          Fortryd
        </button>
        {maksDato && <span className="basis-full text-xs text-hb-ink-soft" data-maalets-frist={maalFrist}>Senest {danskDato(maalFrist!)} — målets frist</span>}
      </div>
    );
  }

  if (handling.slags === "forslag") {
    return (
      <div className={cn("flex flex-wrap gap-2", className)}>
        <HbButton className="h-9 px-4" disabled={busy} onClick={() => setDatoFormaal("accept")}>
          Tag den
        </HbButton>
        <HbButton
          variant="secondary"
          className="h-9 px-4"
          disabled={busy}
          onClick={() => onKald({ type: "luk", opgaveId: handling.opgaveId, udfald: "dismissed" })}
        >
          Nej tak
        </HbButton>
      </div>
    );
  }

  // Aktiv opgave. B7 er udtrykkelig: "drop den" skal være et lige så
  // pænt svar som "gjort" — derfor SAMME variant på alle knapper her,
  // ingen primær/grå-rangorden. Strengsammenligningen er nok: begge
  // sider er "YYYY-MM-DD", og forfald indtræder dagen EFTER fristen
  // (spejler erForfalden-dommen uden at gentage den som regel).
  const forfalden = handling.dueDate != null && handling.dueDate < tilDatoStreng(idag);
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <HbButton
        variant="secondary"
        className="h-9 px-4"
        disabled={busy}
        onClick={() => onKald({ type: "luk", opgaveId: handling.opgaveId, udfald: "done" })}
      >
        Gjort
      </HbButton>
      {forfalden && (
        <HbButton
          variant="secondary"
          className="h-9 px-4"
          disabled={busy}
          onClick={() =>
            handling.deferralCount === 0
              ? // 1. udskydelse: ingen dato — motoren lægger selv 14 dage til (B11)
                onKald({ type: "udskyd", opgaveId: handling.opgaveId })
              : // 2. udskydelse: medlemmet vælger datoen (B11)
                setDatoFormaal("udskyd")
          }
        >
          Udskyd
        </HbButton>
      )}
      <HbButton
        variant="secondary"
        className="h-9 px-4"
        disabled={busy}
        onClick={() => onKald({ type: "luk", opgaveId: handling.opgaveId, udfald: "dropped" })}
      >
        Drop den
      </HbButton>
    </div>
  );
};

/** Lag 1-kortet: #1 stort, #2-4 som stille linjer. weekly_focus læses
    INLINE (headline + summary) — kontrakten "Ugens fokus er klar" → "/".
    CTA-knap vises kun når punktet peger VÆK fra forsiden (ctaHref ≠ "/").
    Skeleton m. reserveret højde — ingen layout-hop. */
const FocusCard = ({
  loading,
  items,
  weeklySummary,
  linje,
  tom,
  onProevIgen,
  variant = "fuld",
  relevante = [],
  ansigt = null,
}: {
  loading: boolean;
  items: FocusItem[];
  /** Forside PR 4 (valg 6): rådgiverens ansigt ved det PRIMÆRE punkt, når det er
      hendes skridt (dommen er ansigter.raadgiverAnsigt — kortet dømmer intet). */
  ansigt?: Ansigt | null;
  weeklySummary: string | null;
  /** Forside PR 2: «kompakt» er toppens højre kolonne — titel 18 px, én
      linje manchet, knap; #2–4 som tætte linjer; «Måske relevant» som
      sidste linje I kortet (før: løse linjer under). «fuld» er den
      hidtidige form (bevares for symmetri; toppen bruger kompakt). */
  variant?: "fuld" | "kompakt";
  /** «Måske relevant for dig» (lib/hjemmebane/maaskeRelevant) — højst to. */
  relevante?: { id: string; title: string; sti: string }[];
  /** Forløbslinjen (lib/hjemmebane/forloeb, 16/9): «Eller fortsæt dit
      forløb: {continue}» når noget er midt i; ellers på næste urørte
      «Eller fortsæt dit forløb: {next}» hvis hun har rørt en Akademi-video
      (også kun gennemførte), og «Eller start i Akademiet: {next}» kun til
      den der aldrig har begyndt; null når der hverken er continue eller
      next — så vises intet. */
  linje: Forloebslinje<AkademiItem> | null;
  /** Den tomme tilstand (lib/hjemmebane/fokusTom, 9/9): tre tilstande —
      aldrig uploadet, uploadet men ikke godkendt, godkendt (med
      anerkendelseslinjen). Aldrig «Alt er ajour» til en uden tal.
      FJERDE tilstand (10/9): kunne ikke hente — kortet siger det, ikke
      «Kom i gang». */
  tom: FokusTom;
  /** «Prøv igen» i den fjerde tilstand — henter kortets kilder igen. */
  onProevIgen?: () => void;
}) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const displayed = items.slice(0, 4);
  const primary = displayed[0];
  const quiet = displayed.slice(1);

  const inlineBody = (item: FocusItem) =>
    item.kind === "weekly-focus" && weeklySummary ? weeklySummary : null;

  // Peger punktet VÆK fra forsiden? "/" er forsiden selv (fold-ud).
  // Tjeklistens velkomst-punkt (sti "") oversættes af fokusCtaHref til
  // "#velkomst" (3/9, §10): videoen bor i tjekliste-boksens egen
  // overlejring, som kortet ikke kan nå direkte (boksen er et søskende
  // til <main>) — men boksen læser URL-hashen, åbner overlejringen og
  // rydder hashen igen. Hash-hrefs renderes som <a href> nedenfor, så
  // velkomsten får «Gør det nu» som de andre punkter. Motoren
  // (nextStep.ts) og tjeklistens stier er urørte; oversættelsen sker her.
  const hrefAf = (item: FocusItem) => fokusCtaHref(item);
  const harSide = (href: string) => href !== "/" && href !== "";
  const kompakt = variant === "kompakt";

  // Redesign (ægte form): primær handling i STOR editorial-skala m.
  // manchet i rolig grad og CTA'en i bunden af den primære zone m. luft
  // omkring — ikke klemt op under teksten. Sekundære punkter (#2-4) som
  // tydeligt adskilt liste under en hb-line. Tom-tilstanden bærer SAMME
  // typografiske vægt som den aktive — sidens vigtigste plads må ikke
  // være svagest den uge, hvor medlemmet har styr på det hele.
  return (
    <HbCard className={kompakt ? "p-5 md:p-6" : "min-h-[230px] p-7 md:p-9"} data-fokus-variant={variant}>
      {loading ? (
        <div aria-hidden>
          <div className="h-10 w-2/3 animate-pulse rounded bg-hb-line/60" />
          <div className="mt-5 h-4 w-full animate-pulse rounded bg-hb-line/40" />
          <div className="mt-2.5 h-4 w-5/6 animate-pulse rounded bg-hb-line/40" />
          <div className="mt-8 h-11 w-44 animate-pulse rounded-full bg-hb-line/40" />
        </div>
      ) : primary ? (
        <div>
          {ansigt && (
            <p className={cn("flex items-center gap-2 text-xs font-medium text-hb-ink", kompakt ? "mb-2" : "mb-3")} data-ansigt={ansigt.userId}>
              <HbAvatar navn={ansigt.navn} avatarUrl={ansigt.avatarUrl} stoerrelse="sm" />
              <span>{ansigt.linje}</span>
            </p>
          )}
          <h3 className={cn("font-editorial font-medium leading-tight text-hb-ink", kompakt ? "text-lg" : "text-3xl md:text-4xl")}>
            {primary.title}
          </h3>
          {/* Kompakt: manchetten på ÉN linje (truncate) — hele teksten står i title-attributten. */}
          <p className={cn("text-hb-ink-soft", kompakt ? "mt-1.5 truncate text-sm" : "mt-4 max-w-2xl text-base leading-relaxed")} title={kompakt ? primary.description : undefined}>
            {primary.description}
          </p>
          {inlineBody(primary) && (
            <p className={cn("text-hb-ink", kompakt ? "mt-1.5 text-sm leading-relaxed" : "mt-3 max-w-2xl text-base leading-relaxed")}>{inlineBody(primary)}</p>
          )}
          {/* Hash-hrefs (#dine-aftaler) rammer et anker på SAMME side:
              et almindeligt <a> ruller natively — router-Link ville kun
              omskrive URL'en, og useScrollToHash er ikke mountet her. */}
          {harSide(hrefAf(primary)) &&
            (hrefAf(primary).startsWith("#") ? (
              <a href={hrefAf(primary)} className={kompakt ? "mt-4 inline-block" : "mt-7 inline-block"}>
                <HbButton className={kompakt ? "h-9 px-4 text-sm" : undefined}>{primary.ctaLabel}</HbButton>
              </a>
            ) : (
              <Link to={hrefAf(primary)} className={kompakt ? "mt-4 inline-block" : "mt-7 inline-block"}>
                <HbButton className={kompakt ? "h-9 px-4 text-sm" : undefined}>{primary.ctaLabel}</HbButton>
              </Link>
            ))}
          {quiet.length > 0 && (
            /* Titlen bærer vægten, svaret bærer luften — et udfoldet
               punkt skal læses som et SVAR på titlen, ikke som en
               fortsættelse af den: titlen i font-medium/hb-ink,
               description i soft med luft over og under, og en hairline
               mellem punkterne (first:border-t-0 — ul'en bærer allerede
               sin egen toplinje). */
            <ul className={cn("w-full border-t border-hb-line", kompakt ? "mt-5 pt-2" : "mt-9 pt-4")}>
              {quiet.map((item) => (
                <li key={item.key} className="border-t border-hb-line first:border-t-0">
                  {harSide(hrefAf(item)) ? (
                    /* Hash-hrefs er samme-side-ankre: <a> ruller natively,
                       router-Link ville kun omskrive URL'en (se primær-CTA). */
                    hrefAf(item).startsWith("#") ? (
                      <a
                        href={hrefAf(item)}
                        className="flex items-center gap-3 py-2.5 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
                      >
                        <span className="min-w-0 flex-1 truncate">{item.title}</span>
                        <ArrowRight className="h-4 w-4 shrink-0" />
                      </a>
                    ) : (
                      <Link
                        to={hrefAf(item)}
                        className="flex items-center gap-3 py-2.5 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
                      >
                        <span className="min-w-0 flex-1 truncate">{item.title}</span>
                        <ArrowRight className="h-4 w-4 shrink-0" />
                      </Link>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExpandedKey((k) => (k === item.key ? null : item.key))}
                      className="flex w-full items-center gap-3 py-2.5 text-left text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium text-hb-ink">{item.title}</span>
                      {expandedKey === item.key ? (
                        <ChevronUp className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      )}
                    </button>
                  )}
                  {expandedKey === item.key && (
                    /* pl-0 er flugtningen: knappen har ingen vandret
                       padding, så titlen står ved kanten — en indrykning
                       ville netop bryde flugten med titlen. */
                    <p className="pb-3 pl-0 pt-1 text-sm leading-relaxed text-hb-ink-soft">
                      {item.description}
                      {inlineBody(item) && <span className="mt-1 block text-hb-ink">{inlineBody(item)}</span>}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div>
          <h3 className={cn("font-editorial font-medium leading-tight text-hb-ink", kompakt ? "text-lg" : "text-3xl md:text-4xl")}>
            {tom.overskrift}
          </h3>
          {/* Anerkendelse frem for tomhed (bølge 3): samme typografiske
              vægt som den aktive tilstand — overskrift + linje i læsbar
              grad. RETTET 9/9: før stod «Alt er ajour / … er på plads» til
              alle uden punkter, også til seks virksomheder der aldrig har
              uploadet. Nu afgør lib/hjemmebane/fokusTom tilstanden: aldrig
              uploadet → «Kom i gang med dine tal»; uploadet, ikke godkendt →
              «Dine tal venter på dig»; godkendt → «Alt er ajour» + rejsen.
              CTA'en er det ene næste skridt, samme knap som punkterne. */}
          <p className={cn("text-hb-ink-soft", kompakt ? "mt-1.5 text-sm leading-relaxed" : "mt-4 max-w-2xl text-base leading-relaxed")}>{tom.linje}</p>
          {tom.cta && (
            <Link to={tom.cta.to} className={kompakt ? "mt-4 inline-block" : "mt-6 inline-block"}>
              <HbButton className={kompakt ? "h-9 px-4 text-sm" : "h-11 px-5"}>{tom.cta.label}</HbButton>
            </Link>
          )}
          {tom.tilstand === "kunne_ikke_hente" && onProevIgen && (
            <HbButton type="button" variant="secondary" className={kompakt ? "mt-4 h-9 px-4 text-sm" : "mt-6 h-11 px-5"} onClick={onProevIgen}>
              Prøv igen
            </HbButton>
          )}
        </div>
      )}
      {!loading && linje && (
        <Link
          to={linje.sti}
          className={cn("inline-block text-sm text-hb-ink-soft underline-offset-4 transition-colors hover:text-hb-ink hover:underline", kompakt ? "mt-4" : "mt-6")}
        >
          {linje.tekst}
        </Link>
      )}
      {/* «MÅSKE RELEVANT FOR DIG» (Jonas 16/9) som kortets SIDSTE linje (PR 2)
          — før stod de som løse linjer under kortet. Ordene og udvalget er
          motorens (lib/hjemmebane/maaskeRelevant); stien er kalderens. */}
      {!loading && relevante.length > 0 && (
        <ul className={cn("space-y-1 text-sm text-hb-ink-soft", kompakt ? "mt-4 border-t border-hb-line pt-3" : "mt-6")} data-maaske-relevant={relevante.length}>
          {relevante.map((lektion) => (
            <li key={lektion.id}>
              {MAASKE_RELEVANT_PRAEFIKS}:{" "}
              <Link to={lektion.sti} className="text-hb-evergreen underline-offset-4 hover:underline">
                {lektion.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HbCard>
  );
};

/** Én skridt-række i «Din plan» (PR 3): titel, frist (aktiv) eller meta-
    linjen «Fra din rådgiver · foreslået i går · udløber om 3 dage» +
    begrundelsen (forslag), og OpgaveKnapper — SAMME knapper og kald som
    «Dine skridt» havde. Knapperne er søskende til teksten (ingen klikbar
    handling i et anker). */
const PlanSkridtRaekke = ({ skridt, slags, busy, onKald, ansigt = null, maalFrist = null }: { skridt: PlanSkridt; slags: "aktiv" | "forslag"; busy: boolean; onKald: (kald: OpgaveKald) => void; ansigt?: Ansigt | null; maalFrist?: string | null }) => {
  const meta = slags === "forslag" ? forslagMetaLinje(skridt, new Date()) : null;
  // PR 4: med et ansigt siger første led «Fra Morten» i stedet for «Fra din rådgiver» (aftaler.forslagKilde er fald-tilbage).
  const metaDele = meta ? (ansigt ? [ansigt.linje, ...meta.dele.slice(1)] : meta.dele) : [];
  return (
    <li className="border-t border-hb-line/60 first:border-t-0" data-skridt-id={skridt.id} data-skridt-status={skridt.status} data-skridt-maal={skridt.maal_id ?? ""}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
        <div className="min-w-0 flex-1 basis-64">
          {slags === "forslag" && (
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-evergreen">Forslag til dig</p>
          )}
          <p className="text-[15px] font-medium leading-snug text-hb-ink">{slags === "aktiv" ? "◻ " : "? "}{skridt.title}</p>
          {slags === "aktiv" && skridt.due_date && (
            <p className="mt-1 text-sm text-hb-ink-soft">{fristTekst(skridt.due_date, tilDatoStreng(new Date()))}</p>
          )}
          {meta && (
            <p className="mt-1 flex items-center gap-2 text-sm text-hb-ink-soft">
              {ansigt && <HbAvatar navn={ansigt.navn} avatarUrl={ansigt.avatarUrl} stoerrelse="sm" />}
              <span data-forslag-kilde={ansigt ? ansigt.userId : "uden-ansigt"}>
              {metaDele.join(" · ")}
              {meta.udloeb && (
                <>
                  {" · "}
                  <span className={meta.haster ? "text-hb-rust" : undefined}>{meta.udloeb}</span>
                </>
              )}
              </span>
            </p>
          )}
          {slags === "forslag" && skridt.context?.trim() && (
            <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft">{skridt.context.trim()}</p>
          )}
        </div>
        <OpgaveKnapper
          className="shrink-0"
          handling={slags === "aktiv"
            ? { slags: "aktiv", opgaveId: skridt.id, deferralCount: skridt.deferral_count ?? 0, dueDate: skridt.due_date ?? null }
            : { slags: "forslag", opgaveId: skridt.id, deferralCount: skridt.deferral_count ?? 0, dueDate: null }}
          busy={busy}
          onKald={onKald}
          maalFrist={maalFrist}
        />
      </div>
    </li>
  );
};

/** Fejringen (PR 3): ✓ titel og «Godt gået — {mål} er nu {N} %» — en stille linje. */
const FejringRaekke = ({ fejring }: { fejring: Fejring }) => (
  <li className="border-t border-hb-line/60 py-3 first:border-t-0" data-fejring={fejring.skridtId}>
    <p className="text-[15px] font-medium leading-snug text-hb-ink">
      <span className="text-hb-evergreen">✓</span> {fejring.titel}
    </p>
    <p className="mt-1 text-sm text-hb-ink-soft">{fejring.tekst}</p>
  </li>
);

export const BoardroomView = () => {
  const { user, profile, companyId, isAdvisor, laeseMarkeringTilladt, membershipTier } = useAuth();
  // «Næste i Netværket»s opslagsrække (rådets fund 4, 2/10): kun når medlemmet
  // HAR Netværket — samme dom som fanerne (fuldt medlem, rådgiver i «Se som
  // medlem»). Uden adgang er feedet tomt (RPC'en er fail-closed), og tom-
  // teksten «Ingen opslag endnu» ville lyve. Hooks i topblokken.
  const { viewingAsMember } = useViewMode();
  const harNetvaerket = visNetvaerkFaner({ isAdvisor, viewingAsMember, membershipTier });
  const akademi = useAkademiData();
  const { data: facts = [], isLoading: factsLoading, isError: factsError } = useCompanyFacts();

  // ── Katalog-afledninger (deler cache med Akademiet) ─────────────────────
  // BÅNDET ER VÆK FRA FORSIDEN (seks steder, 2/10-2026 nat — Jonas 1/10 22:50:
  // «Måske skal nyheder væk? Måske skal Denne uges video væk. Måske skal
  // Værd at se igen væk. Det var fyld»): forsiden afleder ikke længere push,
  // ugens video, redaktionelt, evergreen eller velkomst-hovedhistorien
  // (pickMainStory). Dommene (pushSelection.ts) og kortene (StoryCard m.fl.
  // ovenfor) står urørte — de kan tegne «Nyt fra os» i Akademiet senere.
  // Kataloget (akademi.orderedByArea) bruges stadig til «Måske relevant» og rejselinjen.

  // «N nye ting siden sidst» (forside PR 2) talte båndets kandidater — med
  // båndet væk (2/10) tælles intet: hilsenen siger dagen (eller dag 1).
  // localStorage-stemplet hb.forside.lastVisitAt skrives ikke længere.

  // RÅDGIVERNES ANSIGTER (forside PR 4, Jonas «A» til valg 6): ÉN hentning
  // af get_all_advisor_profiles — den SAMME security definer-RPC som
  // medlems-chatten (CompanyChatPane:163-176), så MEDLEMMER må kalde den;
  // direkte profiles-select er ikke garanteret for medlemmer. Før (PR 3)
  // hentedes den kun for pushets afsender; nu føder ét opslag pushets
  // afsender, «Dit næste skridt» og forslagene i «Din plan». Dommen om
  // HVEM der får et ansigt er ren (ansigter.raadgiverAnsigt). Ansigter er
  // berigelse: fejler kaldet, står teksterne uden portræt («Fra din
  // rådgiver») — kilden navngives (kraevRaekker), ingen fejllinje.
  const raadgivereQuery = useQuery({
    queryKey: ["boardroom", "raadgivere"],
    queryFn: async () => raadgiverOpslag(kraevRaekker(await supabase.rpc("get_all_advisor_profiles" as any), "get_all_advisor_profiles") as any[]),
    staleTime: 10 * 60 * 1000,
    enabled: !!user,
  });
  const raadgivere = raadgivereQuery.data ?? INGEN_RAADGIVERE;

  // Forløbslinjen — samme dom som Akademi-forsiden, bogstaveligt: afgoerForloeb
  // (lib/hjemmebane/forloeb.ts) er den funktion ForsideView kalder. FØR 16/9
  // stod her en egen forenklet udgave (første ikke-gennemførte, «fortsæt»
  // hardkodet), som sagde «fortsæt dit forløb» til en konto der aldrig var
  // begyndt (fund 5). Nu følger teksten tilstanden; null = ingen linje.
  const forloebsLinje = useMemo(
    () =>
      forloebslinje(
        afgoerForloeb({ orderedByArea: akademi.orderedByArea, progressRows: akademi.progressRows, areas: AREAS }),
      ),
    [akademi.orderedByArea, akademi.progressRows],
  );

  // ── Fokus-motorens inputs (kilderne arvet ordret fra ActionCenter) ──────
  const processedQuery = useQuery({
    queryKey: ["boardroom", "processed-reports", companyId],
    queryFn: async () => {
      // Samme select-form som DashboardActionCenter (110-113).
      // KASTER ved fejl (10/9, recon-fejlovervaagningen §2 eks. 2): før blev
      // en fejl til en tom mængde → fokusmotoren dømte «ingen rapporter» →
      // «Upload dine august-tal» til en med tyve. Tom er et svar; fejl er ikke.
      const res = (await (supabase
        .from("financial_reports")
        .select(`report_period, ${REPORT_OVERRIDE_SELECT}`) as any)
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .eq("status", "processed")) as { data: ReportData[] | null; error: { message: string } | null };
      const keys = (kraevRaekker(res, "financial_reports") as ReportData[])
        .map((r) => getEffectiveReportPeriodKey(r))
        .filter(Boolean) as string[];
      return new Set(keys);
    },
    enabled: !!companyId,
    staleTime: 3 * 60_000,
  });

  const milestonesQuery = useQuery({
    queryKey: ["boardroom", "milestones", companyId],
    queryFn: async () => {
      // KASTER ved fejl (10/9): tomme mål er et svar, en fejl er ikke —
      // anerkendelseslinjen og «Dine mål» læser begge listen. Fase 3 («Én
      // plan»): planens kolonner (lib/hjemmebane/planen.MaalRaekke), så
      // forsiden og /milestones dømmer ens; fokusmotoren læser dem ikke mere.
      // SKIVE 3 (2/10): også bekraeftet_at — et ubekræftet mål er et forslag
      // (ikke i «Din plan», ikke i fokus). FAIL-SOFT: mangler kolonnen
      // (42703/PGRST204, migration 20261002100000 ikke kørt), læses de gamle
      // kolonner, bekraeftet_at er undefined, og alt tæller som i dag.
      const gamle = "id, title, deadline, progress, status, category, source, progress_updated_at, completed_at, created_at";
      type Svar = { data: MaalRaekke[] | null; error: { code?: string; message: string } | null };
      // bekraeftet_at står ikke i types.ts før Lovables typegenerering — svaret læses som planens form.
      const hent = async (kolonner: string): Promise<Svar> => (await supabase.from("milestones").select(kolonner).eq("company_id", companyId!)) as unknown as Svar;
      let res = await hent(`${gamle}, bekraeftet_at`);
      if (res.error && erManglendeKolonne(res.error)) res = await hent(gamle);
      return kraevRaekker(res, "milestones");
    },
    enabled: !!companyId,
    staleTime: 3 * 60_000,
  });

  // Skive 3: de registrerede kvartalstjek (fail-soft: tabellen mangler → tom). Nøglen er «dine-maal»s,
  // så /milestones og forsiden deler cachen og invalideres sammen.
  const kvartalstjekQuery = useQuery({
    queryKey: dineMaalKvartalstjekKey(companyId),
    queryFn: () => hentKvartalstjek(companyId!),
    enabled: !!companyId,
    staleTime: 60_000,
  });
  const ventendeKvartalstjek = useMemo(
    () => (milestonesQuery.data && kvartalstjekQuery.data ? ventendeKvartalstjekAlle(milestonesQuery.data, kvartalstjekQuery.data, new Date()) : []),
    [milestonesQuery.data, kvartalstjekQuery.data],
  );
  // Skive 3: de ubekræftede aktive mål (forslag + gamle) — kortet i «Din plan» OG forsidens fokuspunkt
  // «N mål venter på jeres ja» (runde 2, fund 5) læser samme deling.
  const bekraeftelser = useMemo(() => (milestonesQuery.data ? delBekraeftelser(milestonesQuery.data) : { forslag: [], gamle: [] }), [milestonesQuery.data]);
  const ubekraeftedeMaal = bekraeftelser.forslag.length + bekraeftelser.gamle.length;

  const pulseQuery = useQuery({
    queryKey: ["boardroom", "pulse", companyId],
    queryFn: async () => {
      const prev = new Date();
      prev.setMonth(prev.getMonth() - 1);
      const periodKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      // KASTER ved fejl (10/9): «ingen refleksion» (null) er et svar — en fejl
      // ville ellers give kortet «lav din refleksion» til en der har.
      const { data, error } = await supabase
        .from("pulse_checkins")
        .select("id")
        .eq("company_id", companyId!)
        .eq("period_key", periodKey)
        .maybeSingle();
      if (error) throw new HentningsFejl("pulse_checkins", error.message);
      return data;
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  // Antallet af sendte refleksioner (28/9) — anerkendelseslinjens fjerde del.
  // Databasen tæller (count, head: ingen rækker over ledningen); dommen og
  // ordene bor i lib/hjemmebane/rejselinje.
  const refleksionAntalQuery = useQuery({
    queryKey: ["boardroom", "refleksion-antal", companyId],
    queryFn: async () => {
      const svar = await supabase
        .from("pulse_checkins")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!);
      return antalFraSvar("pulse_checkins", svar);
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  // Ugens fokus — query ordret fra DashboardActionCenter:71-85
  // (company_id + week_key + status-listen).
  const weekKey = getISOWeekKey(new Date());
  const weeklyFocusQuery = useQuery({
    queryKey: ["boardroom", "weekly-focus", companyId, weekKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_focus")
        .select("*")
        .eq("company_id", companyId!)
        .eq("week_key", weekKey)
        .in("status", ["active", "quiet", "no_data"])
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // De aktive mål til «Måske relevant» (fase 3: modulForMaal) — dømt gennem
  // afgoerMilepael, uden for memo'en nedenfor (maaskeRelevant.guard dom 1
  // forbyder egen filtrering i den).
  const aktiveMaalTilRelevans = useMemo(() => {
    const nu = new Date();
    return (milestonesQuery.data ?? []).filter((m) => afgoerMilepael(m, nu).aktiv).map((m) => ({ category: m.category }));
  }, [milestonesQuery.data]);

  // «Måske relevant for dig» (Jonas 16/9, lib/hjemmebane/maaskeRelevant):
  // ugens fokus' triggere → handout-modul → lektionerForModul (den delte
  // motor fra handout-siden), gennemførte udeladt, forløbsrækkefølge og
  // derefter «brugbar»-andel. Kataloget og progress-rækkerne er dem
  // forsiden allerede har (useAkademiData, published-only) — ingen ny
  // query. Fejler ugens fokus eller Akademiet, er data undefined/tom og
  // dommen giver null: ingen linje, og kortet vælter aldrig. Dommen bor
  // i motoren — fladen filtrerer intet selv (forloeb.guard).
  const maaskeRelevante = useMemo(() => {
    const lektioner = [...akademi.orderedByArea.values()].flat().map((entry) => entry.item);
    return maaskeRelevant({
      fokus: weeklyFocusQuery.data ?? null,
      // Fase 3: målenes kategori → modul (modulForMaal) — efter ugens fokus' moduler.
      maal: aktiveMaalTilRelevans,
      lektioner,
      progress: akademi.progressRows,
      ratings: akademi.progressRows,
    });
  }, [akademi.orderedByArea, akademi.progressRows, aktiveMaalTilRelevans, weeklyFocusQuery.data]);

  // Åbne handlinger, ubesvarede forslag og accepterede opgaver —
  // sortering ordret fra DashboardActionCenter:200-208 (high → medium →
  // low, dernæst ældste). Statusfilteret dækker 'open' (arven),
  // 'proposed' (opgave-modellens forslag) og 'active' (accepteret via
  // opgave-accepter): fladen er den ENESTE der viser company_actions,
  // så en accepteret opgave må ikke forsvinde i samme øjeblik medlemmet
  // siger ja. Sluttilstandene (done/not_done/dropped/dismissed/expired)
  // holdes bevidst ude — en lukket opgave forlader listen.
  const actionsQuery = useQuery({
    queryKey: ["boardroom", "company-actions", companyId],
    queryFn: async () => {
      // limit(50), ikke 10: sorteringen er created_at desc, og en
      // accepteret opgave beholder sit oprindelige created_at — med
      // limit(10) ville nye forslag skubbe netop de aktive opgaver ud,
      // og sektionens vigtigste indhold forsvinde først. Målt i prod
      // 31/8: tungeste virksomhed har 20 rækker; 50 er rigelig margin.
      // KASTER ved fejl (7/9, recon-tavse-fejl.md pkt. 4 — samme greb som
      // #703/#706): før blev en fejl til `[]`, og «Dine aftaler» forsvandt
      // tavst — et forslag fra rådgiveren eller en aktiv opgave væk uden
      // spor. Tom er et gyldigt svar (ingen aftaler); fejl er det ikke.
      const actionsRes = (await supabase.from("company_actions").select("id, title, context, priority, status, created_at, due_date, expires_at, deferral_count, source_type, maal_id, proposed_by")
        .eq("company_id", companyId!).in("status", ["open", "proposed", "active"]).order("created_at", { ascending: false }).limit(50)) as any;
      return (kraevRaekker(actionsRes, "company_actions") as any[]).sort((a: any, b: any) => {
        const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (order[a.priority] ?? 1) - (order[b.priority] ?? 1) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    },
    enabled: !!companyId,
    staleTime: 3 * 60_000,
  });

  // Skridtene under målene («Dine mål», fase 3): ALLE company_actions med
  // maal_id — også gjorte/lukkede, for fremdriften regnes af dem (maal.ts)
  // og gjorte er historik. Egen query frem for at udvide actionsQuery:
  // «Dine skridt» viser kun åbne, og de to lister har hver sin grænse.
  // KASTER ved fejl som de andre — «Dine mål» siger det pr. sektion.
  const skridtQuery = useQuery({
    queryKey: ["boardroom", "skridt", companyId],
    queryFn: async () => {
      const skridtRes = await supabase
        .from("company_actions")
        // expires_at (1/10): fokusmotorens slot (e) tæller et udløbet forslag
        // som «intet i gang» (maalFokus) — samme hentning, én kolonne mere.
        .select("id, title, status, due_date, maal_id, closed_at, expires_at")
        .eq("company_id", companyId!)
        .not("maal_id", "is", null)
        .order("created_at", { ascending: true })
        .limit(200);
      return kraevRaekker(skridtRes, "company_actions") as SkridtTilDineMaal[];
    },
    enabled: !!companyId,
    staleTime: 3 * 60_000,
  });

  // Ulæste beskeder — begge tællinger ordret fra
  // DashboardActionCenter:150-160 (user-beskeder + agent-beskeder).
  const unreadQuery = useQuery({
    queryKey: ["boardroom", "unread", companyId, user?.id],
    queryFn: async () => {
      // KASTER ved fejl (7/9): en ulæst besked der bliver til «0» er en
      // løgn — medlemmet tror der intet venter. Ingen samtale (maybeSingle
      // → null) er derimod et gyldigt svar. Tællingerne er head-kald uden
      // rækker, så fejlen kastes som HentningsFejl direkte, med kildens navn.
      const convRes = await supabase.from("conversations").select("id").eq("company_id", companyId!).maybeSingle();
      if (convRes.error) throw new HentningsFejl("conversations", convRes.error.message);
      const conv = convRes.data;
      if (!conv?.id) return { userCount: 0, agentCount: 0 };
      const userRes = await supabase.from("messages").select("*", { count: "exact", head: true })
        .eq("conversation_id", conv.id).neq("sender_id", user!.id).is("read_at", null).eq("message_type", "user");
      if (userRes.error) throw new HentningsFejl("messages", userRes.error.message);
      const agentRes = await supabase.from("messages").select("*", { count: "exact", head: true })
        .eq("conversation_id", conv.id).is("read_at", null).eq("message_type", "system").eq("context_type", "agent");
      if (agentRes.error) throw new HentningsFejl("messages", agentRes.error.message);
      return { userCount: userRes.count ?? 0, agentCount: agentRes.count ?? 0 };
    },
    enabled: !!companyId && !!user,
    staleTime: 60_000,
  });

  // Løftestænger uden milestone — handouts.levers minus junction-rækkerne
  // (handout_lever_milestones); deterministisk orden: moduleOrder → index.
  const leversQuery = useQuery({
    queryKey: ["boardroom", "unlinked-levers", companyId],
    queryFn: async () => {
      // KASTER ved fejl (10/9) — begge kald: fejler junction-tabellen, ville
      // ALLE løftestænger stå som «uden milestone».
      const handoutRes = await supabase
        .from("handouts")
        .select("id, module, levers")
        .eq("company_id", companyId!);
      const rows = kraevRaekker(handoutRes, "handouts") as { id: string; module: string; levers: unknown }[];
      if (rows.length === 0) return [];
      const linksRes = (await supabase
        .from("handout_lever_milestones" as any)
        .select("handout_id, lever_index")
        .in("handout_id", rows.map((r) => r.id))) as { data: any[] | null; error: { message: string } | null };
      const linked = new Set((kraevRaekker(linksRes, "handout_lever_milestones") as any[]).map((l) => `${l.handout_id}:${l.lever_index}`));
      const result: { lever: string; moduleTitle: string; module: HandoutModule }[] = [];
      for (const module of moduleOrder) {
        const row = rows.find((r) => r.module === module);
        if (!row) continue;
        const levers = (row.levers as string[]) || [];
        levers.forEach((lever, index) => {
          if (lever.trim() && !linked.has(`${row.id}:${index}`)) {
            result.push({ lever: lever.trim(), moduleTitle: handoutConfigs[module as HandoutModule]?.title ?? module, module });
          }
        });
      }
      return result;
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  // Egen netværksprofil (fokus-kilde (i)): mangler ask_me_about eller fotoet (17/9)?
  // ADVISOR-GATED via enabled — rådgivere har ikke samme profilrolle, og
  // deres user.id ville ellers slå igennem selv i company-override.
  // Disabled/loading → data undefined → askMeAboutMissing false (ingen
  // flakkende prompt før svaret er der).
  const ownProfileQuery = useQuery({
    queryKey: ["boardroom", "own-profile-empty", user?.id, profile?.avatar_url ?? null],
    queryFn: async () => {
      // KASTER ved fejl (10/9): en fejl må ikke blive «profilen er tom» og et
      // nudge til en der har udfyldt den.
      const { data, error } = await supabase
        .from("member_profiles" as any)
        .select("ask_me_about")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw new HentningsFejl("member_profiles", error.message);
      // Én dom: profilUdfyldt.ts — fra 17/9 (Jonas «C») tekst OG foto; fotoet er useAuth's profil (profiles.avatar_url).
      return !profilUdfyldt({ ask_me_about: (data as unknown as { ask_me_about: string | null } | null)?.ask_me_about ?? null, avatar_url: profile?.avatar_url ?? null });
    },
    enabled: !!user && !isAdvisor,
    staleTime: 5 * 60_000,
  });

  // ── Ankomsten (trin 9, indgangen-overhaling §5): tjeklisten og
  // kontraktstarten ind i motoren ──────────────────────────────────────
  // Tjeklisten: SAMME hook og SAMME react-query-nøgle som HbMemberShell
  // (TJEKLISTE_QUERY_KEY, userId, companyId) — cachen deles, ingen ekstra
  // forespørgsel. Rådgivere får null (hooken er deaktiveret for dem), så
  // motoren falder til (a)-(i) i company-override.
  const tjeklisteData = useOnboardingTjekliste();
  // Kontraktstarten findes ikke i nogen eksisterende query på forsiden
  // (useAuth henter kun slutdato og abonnement til tier-dommen), så én
  // lille query for den virksomhed forsiden viser. Skrives af stripe-
  // webhook på betalingsdagen; null for legacy = intet værn (motoren).
  const contractStartQuery = useQuery({
    queryKey: ["boardroom", "contract-start", companyId],
    queryFn: async () => {
      // KASTER ved fejl (10/9): null betyder «ingen kontraktstart» (legacy) og
      // slår et værn fra i motoren — en fejl må ikke ligne det.
      const { data, error } = await supabase
        .from("companies")
        .select("contract_start_date")
        .eq("id", companyId!)
        .maybeSingle();
      if (error) throw new HentningsFejl("companies", error.message);
      return ((data as { contract_start_date?: string | null } | null)?.contract_start_date ?? null) as string | null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  // Rykkelisten og velkomst-hovedhistorien (forside PR 5) tegnes ikke på
  // forsiden længere (2/10): velkomsten ses gennem «Kom godt i gang»
  // (HbOnboardingTjekliste, #velkomst), som den også gjorde før.

  const committedKeys = useMemo(() => new Set(facts.map((f) => f.period_key)), [facts]);

  // Uploads (uanset status) — til fokuskortets tomme tilstand (9/9): skelner
  // «aldrig uploadet» fra «uploadet, ikke godkendt». processedQuery tæller
  // kun status = processed, så én lille head-tælling her.
  const uploadsQuery = useQuery({
    queryKey: ["boardroom", "uploads-antal", companyId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("financial_reports")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .is("deleted_at", null);
      if (error) throw new HentningsFejl("financial_reports", error.message);
      return count ?? 0;
    },
    enabled: !!companyId,
    staleTime: 3 * 60_000,
  });

  // ── Anerkendelses-linjen til fokus-kortets tom-tilstand (bølge 3) ───────
  // RENT afledt af hånd-data — INGEN nye queries: committedKeys (godkendte
  // facts-perioder, "YYYY-MM"), milestonesQuery (nået = afgoerMilepael
  // (…).faerdig — den ene dom, fase 3) og akademi-objektet (isTrackedEntry +
  // state === "done" — B1-video-dommen). BEVIDST ingen nævner: "5 af 6"
  // er mangel-fokus (nævneren siger "du mangler 1") — anerkendelsen
  // tæller det GJORTE. Kun tal > 0 vises; ALLE nul → null, og kortet
  // beholder den nuværende sætning (tomheden må aldrig blive "0
  // rapporter"). Ingen scores, procenter eller sammenligninger.
  const journeyLine = useMemo(() => {
    const year = String(new Date().getFullYear());
    const reportsThisYear = [...committedKeys].filter((k) => k.startsWith(year)).length;
    const nuJourney = new Date();
    const milestonesDone = (milestonesQuery.data ?? []).filter((m) => afgoerMilepael(m, nuJourney).faerdig).length;
    const akademiDone = [...akademi.orderedByArea.values()]
      .flat()
      .filter((entry) => isTrackedEntry(entry) && entry.state === "done").length;
    // Ordene og reglen (ental/flertal, 0 udelades) bor i lib/hjemmebane/rejselinje.
    return rejselinje({
      rapporterIAar: reportsThisYear,
      maalNaaet: milestonesDone,
      videoerGennemfoert: akademiDone,
      refleksioner: refleksionAntalQuery.data ?? 0,
    });
  }, [committedKeys, milestonesQuery.data, akademi.orderedByArea, refleksionAntalQuery.data]);

  // Den tomme tilstand (lib/hjemmebane/fokusTom): tre tilstande af det
  // forsiden allerede ved — uploads, godkendte facts, anerkendelseslinjen.
  // Den FJERDE tilstand (10/9): fejler hentningen af det kortet dømmer på
  // (uploads eller godkendte tal), siger kortet det — ikke «Kom i gang».
  const fokusTom = useMemo(
    () =>
      afgoerFokusTom({
        hentningFejlede: uploadsQuery.isError || factsError,
        harUploads: (uploadsQuery.data ?? 0) > 0,
        harGodkendte: committedKeys.size > 0,
        journeyLine,
      }),
    [uploadsQuery.data, uploadsQuery.isError, factsError, committedKeys, journeyLine],
  );
  // De øvrige kilder motoren læser (10/9): fejler en af dem, står kortet
  // stadig — men med en rolig linje under om hvad der manglede, så et
  // manglende punkt ikke bliver læst som «der er intet». Ordene i
  // lib/hjemmebane/hentefejl; kilden bæres af HentningsFejl.
  // skridtQuery (rådets fund 2, 1/10): slot (e) læser den — en fejl giver intet
  // målpunkt (maalPlan = null), og det skal siges, ikke ligne «intet at gøre».
  // Kilden er "company_actions" (kraevRaekker) → «dine aftaler» i hentefejl.
  const fejledeKilder = [processedQuery, milestonesQuery, skridtQuery, pulseQuery, refleksionAntalQuery, leversQuery, ownProfileQuery, contractStartQuery]
    .filter((q) => q.isError)
    .map((q) => kildeAf(q.error));
  const hentefejlLinje = hentefejlTekst(fejledeKilder);
  const proevIgen = () => void queryClient.invalidateQueries({ queryKey: ["boardroom"] });

  const focus = useMemo(() => {
    if (!companyId) return []; // advisor uden company-override i byggeperioden
    return deriveFocus({
      now: new Date(),
      processedPeriodKeys: processedQuery.data ?? new Set<string>(),
      committedPeriodKeys: committedKeys,
      // Fase 3: ingen milepæls-kilde — målet står i «Dine mål» nedenfor.
      hasPulseThisMonth: Boolean(pulseQuery.data),
      unreadUserMessages: unreadQuery.data?.userCount ?? 0,
      unreadAgentMessages: unreadQuery.data?.agentCount ?? 0,
      weeklyFocus: weeklyFocusQuery.data
        ? { headline: weeklyFocusQuery.data.headline ?? null, seen: Boolean(weeklyFocusQuery.data.seen_at) }
        : null,
      // Opgave-modellen (B1-B11): status skelner forslag fra aktiv
      // opgave i fokus-laget, due_date bærer fristen, deferral_count
      // afgør udskydelsens form (B11). Udløbne forslag filtreres fra
      // FØR deriveFocus — B8 på læsesiden, se filtrerUdloebneForslag.
      openActions: filtrerUdloebneForslag(
        (actionsQuery.data ?? []).map((a: any) => ({
          id: a.id,
          title: a.title,
          priority: a.priority,
          context: a.context ?? null,
          status: a.status,
          due_date: a.due_date ?? null,
          deferral_count: a.deferral_count ?? 0,
          expires_at: a.expires_at ?? null,
        })),
        new Date(),
      ),
      // Handouts i Akademiet (1/10 nat): punktet (h) fører til den lektion,
      // der bærer øvelsen (oevelseLektionSti på forsidens eget katalog —
      // lektionerForModul) — Akademiet, hvis ingen lektion bærer modulet.
      unlinkedLevers: (leversQuery.data ?? []).map((l) => ({
        ...l,
        sti: oevelseLektionSti([...akademi.orderedByArea.values()].flat().map((e) => e.item), l.module),
      })),
      askMeAboutMissing: ownProfileQuery.data === true,
      // Ankomsten (trin 9): uafsluttet tjekliste = kortets eneste kilde;
      // kontraktstarten holder slot (a) fra at bede om tal fra før
      // kontrakten. Begge dømmes i motoren (nextStep.ts).
      contractStartDate: contractStartQuery.data ?? null,
      tjekliste: tjeklisteData.tjekliste,
      // Erfarent medlem (30/9): > 30 døgn siden profiles.created_at →
      // tjeklisten slipper kortet (tjeklistenStyrerForsiden, ankomst.ts).
      medlemSiden: tjeklisteData.medlemSiden,
      // Slot (e), målet (1/10): de mål og skridt «Din plan» allerede henter —
      // ingen ny hentning. Kun når BEGGE er hentet: et halvt billede (mål uden
      // skridt) ville give et forkert «Tilføj det første skridt».
      maalPlan: milestonesQuery.data && skridtQuery.data
        ? { maal: milestonesQuery.data, skridt: skridtQuery.data as (SkridtTilDineMaal & { expires_at?: string | null })[] }
        : null,
      // Skive 3 (2/10): kvartalstjekket som fokuspunkt under hastende skridt — dømt ovenfor.
      kvartalstjek: ventendeKvartalstjek,
      // Skive 3 (runde 2, fund 5) gav «N mål venter på jeres ja» som fokuspunkt. 2/10 aften (Jonas' ja til
      // mockuppen): «Din plan» bærer forslagene selv (linjen over kortene / forslagskortet) — samme besked
      // to steder var mockuppens fund 2. Motoren er urørt; forsiden giver den ikke tallet.
      ubekraeftedeMaal: null,
    });
  }, [companyId, processedQuery.data, committedKeys, pulseQuery.data, unreadQuery.data, weeklyFocusQuery.data, actionsQuery.data, leversQuery.data, akademi.orderedByArea, ownProfileQuery.data, contractStartQuery.data, tjeklisteData.tjekliste, tjeklisteData.medlemSiden, milestonesQuery.data, skridtQuery.data, ventendeKvartalstjek]);

  // Markér ugens fokus som SET når punktet faktisk vises — samme mekanik
  // som DashboardActionCenter:87-98 (mutation + engangs-ref).
  // LÆSER SVARET (11/9): skrivevejen var død i seks uger — weekly_focus
  // havde ingen UPDATE-policy, RLS gav «0 rows» uden fejl, og `await
  // update()` uden at se på svaret slugte det (samme fejl som rolletjekket,
  // #797). Nu: fejl kaster, og nul rækker kaster — MutationCache.onError
  // (App.tsx) logger det til Sentry med mutationKey. Policyen og
  // kolonnelåsen: 20260911060000_weekly_focus_seen_at.sql. Cachen
  // invalideres IKKE: punktet skal ikke springe mens man ser på det;
  // næste indlæsning viser det bagerst (nextStep.ts slot (d), set).
  const seenMarked = useRef(false);
  const markSeen = useMutation({
    mutationKey: ["boardroom", "weekly-focus", "seen"],
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("weekly_focus")
        .update({ seen_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw new Error(`weekly_focus.seen_at kunne ikke sættes: ${error.message}`);
      if (!data || data.length === 0) throw new Error("weekly_focus.seen_at: opdateringen ramte nul rækker — RLS eller rækken er væk");
    },
  });
  const weeklyDisplayed = focus.slice(0, 4).some((i) => i.kind === "weekly-focus");
  useEffect(() => {
    const row = weeklyFocusQuery.data;
    // En tjenestekonto KIGGER (30/9, tjenestekonto.guard dom 6): medlemmets
    // ugefokus må ikke stå som set, fordi Claude åbnede virksomheden.
    if (weeklyDisplayed && row && !row.seen_at && !seenMarked.current && laeseMarkeringTilladt) {
      seenMarked.current = true;
      markSeen.mutate(row.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeklyDisplayed, weeklyFocusQuery.data, laeseMarkeringTilladt]);

  // ── Opgave-modellens skrivevej (B1/B6/B7/B11) ───────────────────────────
  // Fladen kalder de tre edge functions og gentager INGEN regler —
  // motoren bag dem dømmer, og en 409 betyder enten at motoren afviste
  // overgangen eller at rækken blev ændret imens. Begge dele vises
  // ordret til medlemmet (beskederne er dansk fra funktionerne) — og
  // cachen invalideres KUN mod den faktiske tilstand, aldrig optimistisk.
  // staleTime er 3 min, så invalidering efter skrivning er nødvendig.
  const queryClient = useQueryClient();
  const opgaveMutation = useMutation({
    mutationFn: async (kald: OpgaveKald) => {
      const { fn, body } =
        kald.type === "accepter"
          ? { fn: "opgave-accepter", body: { opgaveId: kald.opgaveId, dato: kald.dato } as Record<string, unknown> }
          : kald.type === "udskyd"
            ? { fn: "opgave-udskyd", body: { opgaveId: kald.opgaveId, ...(kald.dato ? { dato: kald.dato } : {}) } }
            : { fn: "opgave-luk", body: { opgaveId: kald.opgaveId, udfald: kald.udfald } };
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) {
        // FunctionsHttpError bærer serverens JSON-body ({ error }) i
        // context-Response — vis den ærlige grund (mønstret fra
        // AgentForslagPanel.tsx:167-176).
        let besked = error.message;
        try {
          const svar = await (error as any).context?.json?.();
          if (svar?.error) besked = svar.error;
        } catch { /* behold error.message */ }
        throw new Error(besked);
      }
      return data;
    },
    onSuccess: (data, kald) => {
      // Fejringen (PR 3): et skridt lukket som gjort — find skridtet i det
      // fladen allerede har, og målets titel; fremdriften er motorens tal.
      if (kald.type === "luk" && kald.udfald === "done") {
        const skridt = ((actionsQuery.data ?? []) as PlanSkridt[]).find((a) => a.id === kald.opgaveId);
        if (skridt) {
          const maal = (milestonesQuery.data ?? []).find((m) => m.id === skridt.maal_id);
          const progress = (data as { maal?: { ok?: boolean; progress?: number } | null } | null)?.maal?.ok ? (data as { maal: { progress: number } }).maal.progress : null;
          setFejring(lavFejring(skridt, maal?.title ?? null, progress));
        }
      }
      toast.success(
        kald.type === "accepter"
          ? "Aftalen er registreret"
          : kald.type === "udskyd"
            ? udskudtToastTekst(data) // R1: «Udskudt til 10. okt. — målets frist», når fristen blev begrænset
            : kald.udfald === "done"
              ? "Registreret som gjort"
              : kald.udfald === "dropped"
                ? "Opgaven er droppet"
                : "Forslaget er afvist",
      );
      void queryClient.invalidateQueries({ queryKey: ["boardroom", "company-actions", companyId] });
      // Planen (PR 3): et lukket skridt rykker målets fremdrift (opgave-luk
      // skriver progress) — genhent mål og skridt, så baren følger med.
      void queryClient.invalidateQueries({ queryKey: ["boardroom", "milestones", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["boardroom", "skridt", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["dine-maal"] });
    },
    onError: (error: any) => {
      toast.error("Det lykkedes ikke", { description: error?.message || String(error) });
      // Rækken kan være ændret imens (409-låsen) — hent den faktiske
      // tilstand frem for at lade fladen stå med et forældet punkt.
      void queryClient.invalidateQueries({ queryKey: ["boardroom", "company-actions", companyId] });
      // Også skridtene under målene (rådets fund 9): slot (e) og «Din plan»
      // læser skridtQuery (queryKey ["boardroom", "skridt", companyId]) —
      // samme nøgle som onSuccess.
      void queryClient.invalidateQueries({ queryKey: ["boardroom", "skridt", companyId] });
    },
  });

  const focusLoading =
    !!companyId &&
    (processedQuery.isPending ||
      milestonesQuery.isPending ||
      // Slot (e) (rådets fund 2): uden skridtene ville kortet først vise
      // «Tilføj det første skridt» og så skifte, når de lander.
      skridtQuery.isPending ||
      pulseQuery.isPending ||
      weeklyFocusQuery.isPending ||
      actionsQuery.isPending ||
      unreadQuery.isPending ||
      leversQuery.isPending ||
      contractStartQuery.isPending ||
      // Medlemmets tjekliste (rådgivere: isLoading er false — hooken er
      // deaktiveret). Uden den ville kortet først vise (a)-(i) og så
      // skifte til tjeklisten når den lander.
      tjeklisteData.isLoading);

  // ── Events-sektionen (egen sektion mellem lag 1 og lag 2) ───────────────
  // Samme kilde som hidtil: listUpcomingEvents (akademiApi.ts:152-162 —
  // status='published', gte(starts_at, nu), order ascending) — kun
  // limit er udvidet fra 1 til 3: live-sessions er en kerneydelse og
  // fortjener de næste 2-3 pladser, ikke én tile i det redaktionelle bånd.
  // listUpcomingEvents KASTER (throwIfError) — men fladen læste kun data, så
  // en fejl blev «ingen kommende events» (sektionen udeladt). Nu siges det.
  // «Næste i Netværket» (seks steder, skridt 2, 2/10): forsiden viser KUN det
  // næste event — samme kilde og nøgle som før (listUpcomingEvents, stigende);
  // limit 3 beholdes, så cachen under ["boardroom","events"] er den samme.
  const eventsQuery = useQuery({
    queryKey: ["boardroom", "events"],
    queryFn: () => listUpcomingEvents(3),
    staleTime: 5 * 60_000,
  });
  const events = eventsQuery.data ?? [];
  // VÆRTERNE (PR 4b): event_vaerter for de viste events — én hentning, først
  // når der er events; rådgivernes navne/portrætter fra samme opslag som
  // ansigterne (raadgivere). Fejl → ingen værter, eventet står som før.
  const vaerterQuery = useQuery({
    queryKey: ["events", "vaerter", events.map((e) => e.id)],
    queryFn: () => listVaerterForEvents(events.map((e) => e.id)),
    enabled: events.length > 0,
    staleTime: 5 * 60_000,
  });

  // ── Community-sektionen: SAMME nøgle OG samme kald som CommunityView
  // (["community","feed"] + hentFeed(30)) — cachen deles begge veje.
  // hentFeed(3) under den delte nøgle ville forgifte fælles-cachen med
  // et 3-rækkers subset (listEvents-lærdommen); visningen skærer selv
  // til 3. Fejl → data undefined → sektionen udelades (samme som tom).
  // hentFeed KASTER (throwIfError). TOMT feed (medlem uden adgang, RPC'en
  // er fail-closed) → ingen sektion, som før. FEJL → én rolig linje (10/9):
  // «Fejl → samme som tomt» var netop det der gjorde fejlen usynlig.
  const communityQuery = useQuery({
    queryKey: ["community", "feed"],
    queryFn: () => hentFeed(30),
  });
  // «Næste i Netværket» (skridt 2, 2/10): det næste event + det nyeste opslag — ren dom.
  const naesteNetvaerk = useMemo(() => naesteINetvaerket(eventsQuery.data ?? [], communityQuery.data ?? []), [eventsQuery.data, communityQuery.data]);
  // Eventet under sit eget navn: værternes linje har formen fra «Kommende»
  // (eventVaerter.guard dom 2 — `vaerterForEvent(…, event.id, raadgivere)`).
  const event = naesteNetvaerk.event;

  // «Din måned» (PR 2) regnes ikke længere her (seks steder, skridt 2, 2/10):
  // kortet og dommen tegnes øverst på /reports (RapporteringView + DinMaaned).
  // BOARDROOM SCORE (30/9 — Jonas D3): ÉN hook (react-query + motoren), kaldt her
  // i topblokken FØR enhver betinget return (React #310). Kortet tegner kun dommen.
  const boardroomScore = useBoardroomScore();
  // TROFÆER (1/10): samme topblok (React #310). Månederne er scorens grundlag — ingen dobbelt hentning.
  const trofaeer = useMedlemmetsTrofaeer(companyId ?? undefined, boardroomScore.grundlag, boardroomScore.afventerMigration);

  const firstName = profile?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "dig";

  // ── «DIN PLAN» (forside PR 3, Jonas «A» til valg 3): målene med skridt under.
  // Kilderne er de samme som «Dine skridt» + «Dine mål» læste — actionsQuery
  // (open/proposed/active med deferral_count/expires_at/context) og
  // dineMaalDom (milestones + skridt med maal_id → fremdrift regnet af
  // skridtene, SAMME dom som /milestones). Ingen ny hentning. Dommen er ren
  // (lib/hjemmebane/forsidePlan): grupperingen under mål, «Uden mål» sidst,
  // udløbne forslag fra, forfaldne øverst.
  const aftaleRaekker = (actionsQuery.data ?? []) as PlanSkridt[];
  // Ansigtet ved «Dit næste skridt» (PR 4): kun når det primære punkt er et
  // skridt fra rådgiveren (company-action med source_type advisor og kendt
  // proposed_by) — dommen er raadgiverAnsigt; fokus-motoren er urørt.
  const fokusAnsigt = useMemo<Ansigt | null>(() => {
    const primaer = focus[0];
    // Også målets punkt, når det er et skridt (slot (e) «skridt», 1/10).
    const erSkridt = primaer?.kind === "company-action" || primaer?.key.startsWith("maal:skridt:");
    if (!primaer || !erSkridt || !primaer.sourceId) return null;
    const raekke = aftaleRaekker.find((r) => r.id === primaer.sourceId);
    return raekke ? raadgiverAnsigt(raekke, raadgivere) : null;
  }, [focus, aftaleRaekker, raadgivere]);
  // AKTIVE MEDLEMMER (PR 4): portræt-rækken forlod forsiden med «Fra
  // fællesskabet» (skridt 2, 2/10) — ingen member-directory-hentning her mere;
  // dommen aktiveMedlemmer (ansigter.ts) står til Netværket.
  const dineMaal = useMemo(
    () => (milestonesQuery.data && skridtQuery.data ? dineMaalDom(milestonesQuery.data, skridtQuery.data, new Date()) : null),
    [milestonesQuery.data, skridtQuery.data],
  );
  const plan = useMemo(() => (dineMaal ? forsidePlanDom(dineMaal, aftaleRaekker, new Date()) : null), [dineMaal, aftaleRaekker]);
  // ── DIN PLAN I TRE TILSTANDE (2/10-2026 aften — Jonas' ja til mockuppen «Din
  // plan i tre tilstande»): motorens kort fra SAMME hook som /milestones
  // (useDineMaalGrundlag → maalTal.maalKort; Score-hentningen deles), og den rene
  // dom forsideMaalTilstand afgør «maal» · «forslag» · «tom». Behold/Slip og
  // kvartalstjekkene er flyttet til Dine mål (BekraeftMaalKort tegnes ikke her):
  // forsiden viser én linje eller ét kort med «Tag stilling». Topblokken (React #310).
  const maalGrundlag = useDineMaalGrundlag(companyId ?? undefined);
  const maalKortFor = (id: string) => maalGrundlag.kort.find((k) => k.id === id) ?? null;
  const maalTilstand = forsideMaalTilstand({ bekraeftedeViste: plan?.maal.length ?? 0, ubekraeftede: ubekraeftedeMaal });
  const forslagTitler = forslagListe([...bekraeftelser.forslag, ...bekraeftelser.gamle]);
  // Kvartalstjekket står i «Dit næste skridt» (slot e2) — ikke også her.
  const venterTekster = ubekraeftedeMaal > 0 ? [FORSIDE_MAAL_ORD.forslagLinje(ubekraeftedeMaal)] : [];

  // FEJRINGEN (PR 3, analyse §5 «intet bliver fejret»): når et skridt lukkes
  // som gjort, står det kort med ✓ og «Godt gået — {mål} er nu {N} %» under
  // sit mål (uden mål: «Godt gået.») frem for at forsvinde. Tallet er det
  // motoren skrev (opgave-luk's svar `maal.progress`) — aldrig regnet her.
  // Stille: én linje i FEJRING_VARIGHED_MS, ingen konfetti, ingen lyd.
  const [fejring, setFejring] = useState<Fejring | null>(null);
  useEffect(() => {
    if (!fejring) return;
    const id = window.setTimeout(() => setFejring(null), FEJRING_VARIGHED_MS);
    return () => window.clearTimeout(id);
  }, [fejring]);

  // «+ Tilføj skridt» (PR 3): SAMME function og SAMME formular som /milestones
  // (#946: skridt-tilfoej, TilfoejSkridtForm med foreslået frist +14 dage).
  // Ingen ny skrivevej. Bagefter genhentes forsidens kilder.
  const [tilfoejAaben, setTilfoejAaben] = useState<string | null>(null);
  const tilfoejMutation = useMutation({
    mutationFn: async (input: { maalId: string; titel: string; dueDate: string }) => {
      const { error } = await supabase.functions.invoke("skridt-tilfoej", { body: { companyId, ...input } });
      if (error) {
        let besked = error.message;
        try {
          const svar = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
          if (svar?.error) besked = svar.error;
        } catch { /* behold error.message */ }
        throw new Error(besked);
      }
    },
    onSuccess: async () => {
      toast.success(TILFOEJ_SKRIDT_OK_TEKST);
      await queryClient.invalidateQueries({ queryKey: ["boardroom"] });
      await queryClient.invalidateQueries({ queryKey: ["dine-maal"] });
    },
  });
  const tilfoejSkridt = async (maalId: string, titel: string, dueDate: string): Promise<string | null> => {
    try {
      await tilfoejMutation.mutateAsync({ maalId, titel, dueDate });
      return null;
    } catch (e) {
      const besked = e instanceof Error ? e.message : String(e);
      toast.error(TILFOEJ_SKRIDT_FEJL_TEKST, { description: besked });
      return besked;
    }
  };
  const planBusy = opgaveMutation.isPending || tilfoejMutation.isPending;
  // Målets frist som loft i skridtets datovalg (rådets fund B2) — af
  // forsidens EGEN mål-hentning (milestonesQuery, alle virksomhedens mål med
  // deadline); ingen ny hentning. Uden mål eller frist: ingen grænse.
  const maalFristFor = (s: PlanSkridt): string | null =>
    s.maal_id ? senesteSkridtFrist((milestonesQuery.data ?? []).find((m) => m.id === s.maal_id)?.deadline ?? null) : null;

  if (akademi.loading || factsLoading) {
    return <p className="text-sm text-hb-ink-soft">Henter dit Boardroom…</p>;
  }

  return (
    <div>
      <PageHeader
        firstName={firstName}
        velkomst={tjeklistenStyrerForsiden(tjeklisteData.tjekliste, tjeklisteData.medlemSiden, new Date())}
        // Dag 1 (PR 3, rettet efter Jonas' skærm 17/9 11:28): medlemskabets start
        // (contract_start_date, som forsiden allerede henter til fokus-motoren)
        // inden for 14 døgn — ikke «tjeklisten ikke færdig».
        linje={hilsenLinje({ nu: new Date(), nyeTing: 0, dag1: erDag1(contractStartQuery.data ?? null, new Date()) })}
      />

      {/* ── STEDSÆTNINGEN (seks steder, 2/10): lige under hilsenen, så «Godmorgen,
          Mette» står først — ordene i lib/hjemmebane/stedsSaetninger; hvem der
          ser den (medlemmet, en rådgiver i «Se som medlem») afgør komponenten. */}
      <HbStedsSaetning sti="/" className="mt-4" />

      {/* ── FORNYELSEN (7/9): båndet står mellem hilsenen og toppen, KUN når
          hent-fornyelsestilbud siger at der er et tilbud — ellers null og
          ingen plads. Dommen er serverens (motoren); se FornyelsesBaand. ── */}
      <FornyelsesBaand />

      {/* ── TOPPEN (forside PR 2 + PR 3, 17/9 — Jonas «A» til valg 1; RYDDET
          2/10, seks steder): «Fra os til dig» (nyheden), tiles («Denne uges
          video», redaktionelt, «Værd at se igen») og «Se tidligere» er taget
          af forsiden — Jonas 1/10 22:50: «Det var fyld». Tilbage står den
          tidligere højre kolonne i fuld bredde (den tilstand toppen allerede
          havde uden bånd): «DIT NÆSTE SKRIDT» (kompakt).
          «Din måned» er FLYTTET til /reports (skridt 2, 2/10 — Jonas' ja til
          forslagets spørgsmål 2). data-forside-hoejre beholdes som anker for værnene. ── */}
      <div className="mt-10 grid grid-cols-1 gap-8 md:mt-12 md:items-start" data-forside-top>
        <div className="min-w-0 space-y-8 md:col-span-12" data-forside-hoejre>
          {/* «DIN MÅNED» (valg 2) stod her til 2/10 (seks steder, skridt 2 —
              Jonas: den forlader forsiden): kortet tegnes nu øverst på
              /reports (DinMaaned.tsx). Toppen er «Dit næste skridt» alene. */}
          {/* «DIT NÆSTE SKRIDT» (kompakt) — fokus-motoren er urørt (nextStep.ts);
              kun præsentationen er kompakt, og «Måske relevant» står som kortets
              sidste linje. Rådgiverens ansigt (valg 6) VENTER til PR 4: fokus-
              punktet fra et rådgiverforslag bærer intet proposed_by, og
              profilerne hentes i dag kun for pushets afsender. */}
          <HbSection eyebrow="Dit næste skridt" hairline data-forside-naeste-skridt>
            <FocusCard
              variant="kompakt"
              loading={focusLoading}
              items={focus}
              weeklySummary={weeklyFocusQuery.data?.summary ?? null}
              linje={forloebsLinje}
              tom={fokusTom}
              onProevIgen={proevIgen}
              relevante={(maaskeRelevante ?? []).map((lektion) => ({ id: lektion.id, title: lektion.title, sti: lektionsSti(lektion) }))}
              ansigt={fokusAnsigt}
            />
            {hentefejlLinje && (
              <p className="mt-4 text-sm text-hb-rust">
                {hentefejlLinje}{" "}
                <button type="button" onClick={proevIgen} className="underline-offset-4 hover:underline">Prøv igen</button>
              </p>
            )}
            {/* Ulæste beskeder fejlede (7/9): fokus-laget får 0 ulæste ind og
                tier stille — så siger vi det her, under kortet, i stedet for
                at lade hele forsiden fejle på én tælling. */}
            {unreadQuery.isError && (
              <p className="mt-4 text-sm text-hb-rust">Dine ulæste beskeder kunne ikke hentes. Prøv igen.</p>
            )}
          </HbSection>
        </div>
      </div>

      {/* ── BOARDROOM SCORE (30/9-2026 — Jonas D3 «Boardroom Score (0–1000) plus
          tal-streak først»; docs/boardroom-score.md §7: «mellem Din måned og
          planen»). Egen sektion i fuld bredde UNDER toppen og OVER «Din plan» —
          toppens to kolonner (Jonas «A på alle», 17/9) er urørt. Mobil: efter
          tiles, før planen. Kun med virksomhed (som «Din måned»). ── */}
      {companyId && (
        <HbSection eyebrow="Boardroom Score" hairline className="mt-10 md:mt-12" data-forside-score>
          <ScoreKort
            dom={boardroomScore.dom}
            afventerMigration={boardroomScore.afventerMigration}
            isLoading={boardroomScore.isLoading}
            isError={boardroomScore.isError}
            onProevIgen={boardroomScore.refetch}
            trofaeer={trofaeer.data}
            trofaeerFejl={trofaeer.isError}
          />
          {/* Trofæer (1/10, docs/boardroom-score.md «Trofæer»): siden 2/10 eftermiddag INDE i
              ScoreKortets «Se hvad der tæller» — den separate sektion fyldte en hel mobilskærm
              over «Din plan» (designgennemsynet i drift; mockuppen «ind bag ‹Se hvad der tæller›»). */}
        </HbSection>
      )}

      {/* ── DIN PLAN (forside PR 3, Jonas «A» til valg 3): ÉN sektion afløser
          «Dine skridt» + «Dine mål» — de aktive mål (højst tre) som rækker
          med fremdrift, og under hvert mål dets aktive skridt (Gjort / Udskyd
          ved forfald / Drop den) og ventende forslag (Tag den / Nej tak) —
          SAMME functions som før (opgave-luk/-udskyd/-accepter via
          opgaveMutation; skridt-tilfoej via tilfoejMutation). Skridt uden mål
          sidst under «Uden mål». Ankrene #dine-skridt og #dine-maal bevares
          INDE i sektionen, så fokus-motorens href (#dine-skridt), gamle links
          og værn ikke brister. FEJL er ikke tom: fejler en af de tre
          hentninger, står sektionen med en fejllinje — kun sektionen. */}
      {(actionsQuery.isError || milestonesQuery.isError || skridtQuery.isError) && (
        <HbSection id="din-plan" eyebrow="Din plan" hairline className="mt-10 md:mt-12">
          <span id="dine-skridt" data-anker /><span id="dine-maal" data-anker />
          <p className="text-sm text-hb-rust">
            {actionsQuery.isError ? DINE_SKRIDT_FEJL_TEKST : DINE_MAAL_FEJL_TEKST}{" "}
            <button type="button" onClick={proevIgen} className="underline-offset-4 hover:underline">Prøv igen</button>
          </p>
        </HbSection>
      )}
      {!actionsQuery.isError && !milestonesQuery.isError && !skridtQuery.isError && plan && (
        <HbSection id="din-plan" eyebrow="Din plan" hairline linkLabel={SE_HELE_PLANEN} linkTo="/milestones" className="mt-10 md:mt-12" data-din-plan={plan.maal.length} data-din-plan-tom={plan.tom ? "1" : "0"} data-din-plan-tilstand={maalTilstand}>
          <span id="dine-skridt" data-anker /><span id="dine-maal" data-anker />
          {/* FEJRINGEN øverst i sektionen — ét sted, uanset om målet stadig er
              blandt de aktive (ved 100 % er det nået i planens dom og rykker ud). */}
          {fejring && (
            <ul className="mb-3"><FejringRaekke fejring={fejring} /></ul>
          )}
          {/* TILSTAND A (2/10 aften, Jonas' ja til mockuppen): forslag og kvartalstjek
              som ÉN linje over kortene — Behold/Slip bor på Dine mål. */}
          {maalTilstand === "maal" && venterTekster.length > 0 && <VenterLinje tekster={venterTekster} />}
          {/* TILSTAND B: kun forslag — ét roligt kort med titlerne og «Tag stilling». */}
          {maalTilstand === "forslag" && (
            <HbCard className="p-5 md:p-6" data-plan-forslag={ubekraeftedeMaal}>
              <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                <span className="h-2 w-2 rounded-full bg-hb-amber" aria-hidden />{VENTER_PAA_JA_OVERSKRIFT}
              </p>
              <h3 className="mt-3 font-editorial text-xl font-medium leading-snug text-hb-ink md:text-2xl">{FORSIDE_MAAL_ORD.forslagOverskrift(ubekraeftedeMaal)}</h3>
              <ul className="mt-4 space-y-2">
                {forslagTitler.titler.map((t, i) => (
                  <li key={`${i}-${t}`} className="flex items-baseline gap-3 text-[15px] leading-snug text-hb-ink">
                    <span className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full bg-hb-ink/40" aria-hidden />{t}
                  </li>
                ))}
                {forslagTitler.flere > 0 && <li className="pl-[18px] text-sm text-hb-ink-soft">{FORSIDE_MAAL_ORD.forslagFlere(forslagTitler.flere)}</li>}
              </ul>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-hb-ink-soft">{FORSIDE_MAAL_ORD.forslagTekst}</p>
              <Link to="/milestones" className="mt-5 inline-block"><HbButton className="h-10 gap-1.5 px-5 text-sm">{FORSIDE_MAAL_ORD.tagStilling}<ArrowRight className="h-4 w-4" aria-hidden /></HbButton></Link>
            </HbCard>
          )}
          {/* TILSTAND C: intet mål — det mørke kort (Jeres retning-fladen); guiden åbnes på /milestones. */}
          {maalTilstand === "tom" && (
            <div className="relative overflow-hidden rounded-[20px] bg-hb-evergreen px-[22px] py-7 text-hb-paper md:px-10 md:py-9" data-plan-tom>
              <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-hb-sage/20" />
              <p className="relative text-[11px] font-semibold uppercase tracking-[0.14em] text-hb-amber">{FORSIDE_MAAL_ORD.tomEyebrow}</p>
              <h3 className="relative mt-3 max-w-xl font-editorial text-2xl font-medium leading-snug md:text-[28px]">{plan.ingenAktive ? FORSIDE_MAAL_ORD.ingenAktiveOverskrift : FORSIDE_MAAL_ORD.tomOverskrift}</h3>
              <p className="relative mt-3 max-w-xl text-sm leading-relaxed text-hb-paper/80">{plan.ingenAktive ? PLAN_INGEN_AKTIVE_TEKST : `${FORSIDE_MAAL_ORD.tomTekst} ${PLAN_TOM_TEKST}`}</p>
              <div className="relative mt-6 flex flex-wrap gap-2">
                <Link to={SAET_MAAL_STI}><HbButton className="h-10 bg-hb-paper px-5 text-sm text-hb-evergreen hover:bg-hb-paper/90">{plan.ingenAktive ? FORSIDE_MAAL_ORD.saetNytMaal : FORSIDE_MAAL_ORD.saetFoersteMaal}</HbButton></Link>
                {plan.ingenAktive ? (
                  <Link to="/milestones"><HbButton variant="secondary" className="h-10 border-hb-paper/40 px-5 text-sm text-hb-paper hover:bg-hb-paper/10">{FORSIDE_MAAL_ORD.seParkerede}</HbButton></Link>
                ) : (
                  <Link to="/book-session"><HbButton variant="secondary" className="h-10 border-hb-paper/40 px-5 text-sm text-hb-paper hover:bg-hb-paper/10">{PLAN_TOM_BOOK}</HbButton></Link>
                )}
              </div>
            </div>
          )}
          {plan.maal.length > 0 && (
            <ul className="space-y-4" data-plan-maal={plan.maal.length}>
              {plan.maal.map((x) => (
                <li key={x.plan.plan.maal.id} data-maal-id={x.plan.plan.maal.id} data-maal-fremdrift={x.plan.plan.fremdrift} data-maal-beregnet={x.plan.plan.beregnet ? "1" : "0"}>
                  <ForsideMaalKort
                    kort={maalKortFor(x.plan.plan.maal.id)}
                    titel={x.plan.plan.maal.title}
                    fremdrift={x.plan.plan.fremdrift}
                    fristTekst={x.plan.plan.maal.deadline ? fristTekst(x.plan.plan.maal.deadline, tilDatoStreng(new Date())) : null}
                    fristForfalden={x.plan.plan.dom.forfalden}
                  >
                    {/* Skridtene under målet: det NÆSTE aktive (forfaldne øverst), så forslagene — resten bor på Dine mål. */}
                    {(x.aktive.length > 0 || x.forslag.length > 0) && (
                      <ul className="mt-1">
                        {x.aktive.slice(0, 1).map((a) => (
                          <PlanSkridtRaekke key={a.id} skridt={a} slags="aktiv" busy={planBusy} maalFrist={maalFristFor(a)} onKald={(kald) => opgaveMutation.mutate(kald)} />
                        ))}
                        {x.forslag.map((f) => (
                          <PlanSkridtRaekke key={f.id} skridt={f} slags="forslag" ansigt={raadgiverAnsigt(f, raadgivere)} busy={planBusy} maalFrist={maalFristFor(f)} onKald={(kald) => opgaveMutation.mutate(kald)} />
                        ))}
                      </ul>
                    )}
                    {x.aktive.length > 1 && (
                      <Link to="/milestones" className="mt-1 inline-block text-xs text-hb-ink-soft underline-offset-4 hover:text-hb-ink hover:underline" data-flere-skridt={x.aktive.length - 1}>{FORSIDE_MAAL_ORD.flereSkridt(x.aktive.length - 1)}</Link>
                    )}
                    {x.alleGjort && (
                      <p className="mt-2 text-sm" data-alle-gjort>
                        <Link to="/milestones" className="text-hb-evergreen underline-offset-4 hover:underline">{ALLE_SKRIDT_GJORT_TEKST}</Link>
                      </p>
                    )}
                    {/* «+ Tilføj skridt» — #946's formular (samme function). Uden skridt: «Tilføj det første skridt». */}
                    {tilfoejAaben === x.plan.plan.maal.id ? (
                      <div className="mt-3">
                        <TilfoejSkridtForm maalId={x.plan.plan.maal.id} maalFrist={x.plan.plan.maal.deadline} busy={planBusy} onTilfoej={(titel, dueDate) => tilfoejSkridt(x.plan.plan.maal.id, titel, dueDate)} onLuk={() => setTilfoejAaben(null)} knapTekst={x.udenSkridt ? MAAL_UDEN_SKRIDT_TEKST : undefined} />
                      </div>
                    ) : (
                      <button type="button" disabled={planBusy} onClick={() => setTilfoejAaben(x.plan.plan.maal.id)} className={cn("text-xs text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50", x.aktive.length + x.forslag.length === 0 ? "mt-2 block font-editorial text-base" : "mt-3 block")} data-handling="tilfoej-skridt">
                        + {x.aktive.length + x.forslag.length === 0 ? MAAL_UDEN_SKRIDT_TEKST : TILFOEJ_SKRIDT_KNAP_TEKST}
                      </button>
                    )}
                  </ForsideMaalKort>
                </li>
              ))}
            </ul>
          )}
          {plan.flere > 0 && (
            <p className="mt-3 text-sm"><Link to="/milestones" className="text-hb-ink-soft underline-offset-4 hover:text-hb-ink hover:underline">{FORSIDE_MAAL_ORD.flereMaal(plan.flere)}</Link></p>
          )}
          {plan.overGraensen && <p className="mt-1 text-sm text-hb-rust">{plan.graenseTekst}</p>}
          {/* JERES SKRIDT: skridt uden mål, under andre mål og under mål, der venter på et ja — med forsidens knapper. */}
          {(plan.udenMaal.aktive.length > 0 || plan.udenMaal.forslag.length > 0) && (
            <div className="mt-8" data-plan-uden-maal>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{UDEN_MAAL_OVERSKRIFT}</p>
              <ul className="mt-2">
                {plan.udenMaal.aktive.map((a) => (
                  <PlanSkridtRaekke key={a.id} skridt={a} slags="aktiv" busy={planBusy} maalFrist={maalFristFor(a)} onKald={(kald) => opgaveMutation.mutate(kald)} />
                ))}
                {plan.udenMaal.forslag.map((f) => (
                  <PlanSkridtRaekke key={f.id} skridt={f} slags="forslag" ansigt={raadgiverAnsigt(f, raadgivere)} busy={planBusy} maalFrist={maalFristFor(f)} onKald={(kald) => opgaveMutation.mutate(kald)} />
                ))}
              </ul>
            </div>
          )}
          {/* Skive 3 (rådets fund 7): skridt under et UBEKRÆFTET mål venter med målet — ikke «Uden mål». */}
          {(plan.venterPaaJa.aktive.length > 0 || plan.venterPaaJa.forslag.length > 0) && (
            <div className="mt-8" data-plan-venter-paa-ja>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{VENTER_PAA_JA_OVERSKRIFT}</p>
              <ul className="mt-2">
                {plan.venterPaaJa.aktive.map((a) => (
                  <PlanSkridtRaekke key={a.id} skridt={a} slags="aktiv" busy={planBusy} maalFrist={maalFristFor(a)} onKald={(kald) => opgaveMutation.mutate(kald)} />
                ))}
                {plan.venterPaaJa.forslag.map((f) => (
                  <PlanSkridtRaekke key={f.id} skridt={f} slags="forslag" ansigt={raadgiverAnsigt(f, raadgivere)} busy={planBusy} maalFrist={maalFristFor(f)} onKald={(kald) => opgaveMutation.mutate(kald)} />
                ))}
              </ul>
            </div>
          )}
          {(plan.andre.aktive.length > 0 || plan.andre.forslag.length > 0) && (
            <div className="mt-8" data-plan-andre>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{ANDRE_MAAL_OVERSKRIFT}</p>
              <ul className="mt-2">
                {plan.andre.aktive.map((a) => (
                  <PlanSkridtRaekke key={a.id} skridt={a} slags="aktiv" busy={planBusy} maalFrist={maalFristFor(a)} onKald={(kald) => opgaveMutation.mutate(kald)} />
                ))}
                {plan.andre.forslag.map((f) => (
                  <PlanSkridtRaekke key={f.id} skridt={f} slags="forslag" ansigt={raadgiverAnsigt(f, raadgivere)} busy={planBusy} maalFrist={maalFristFor(f)} onKald={(kald) => opgaveMutation.mutate(kald)} />
                ))}
              </ul>
            </div>
          )}
          {/* «Hvad er et mål?» (tillæg 17/9) — foldet nederst i alle tre tilstande (2/10 aften: før stod den åben i
              tom-tilstanden og øverst med mål; nu bærer det mørke kort invitationen, og forklaringen er et opslag). */}
          <details className="mt-6" data-maal-forklaring-fold>
            <summary className="inline-block cursor-pointer list-none text-sm text-hb-evergreen underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">{MAAL_FORKLARING_OVERSKRIFT}</summary>
            <HbMaalForklaring udenOverskrift className="mt-3" />
          </details>
        </HbSection>
      )}

      {/* ── DIT CERTIFIKAT og DIN RÅDGIVER (2/10-2026 eftermiddag, «forsidens to
          sidste kort»): efter «Din plan», før «Næste i Netværket». Begge er
          egne komponenter med hooks i deres egen topblok og gater selv
          (certifikatet: husets dom — skjult/henter/fejl = intet; rådgiveren:
          kun medlemmet selv, aldrig en rådgiver). Kun med virksomhed, som
          Score. Værn: forsideKort.guard. ── */}
      {companyId && <ForsideCertifikatKort />}
      {companyId && !isAdvisor && <ForsideRaadgiverKort />}

      {/* ── NÆSTE I NETVÆRKET (seks steder, skridt 2, 2/10 — Jonas: «Kommende»
          og «Fra fællesskabet» forlader forsiden «med én linje tilbage»;
          «Nyeste opslag fra community vil jeg dog gerne have vist nederst,
          under næste event»): ÉT kort nederst — det næste event (som «Kommende»
          tegnede det: dag, titel, meta, værter, tilmelding som søskende til
          linket, aldrig inde i det) og under det det nyeste opslag (titel,
          forfatter, tid, svar, link). Dommen er naesteINetvaerket (ren);
          kilderne er de samme hentninger som før (listUpcomingEvents, hentFeed
          under Community-fladens nøgle — ingen ny RPC). Hver del har sin tomme
          tilstand; fejl i en hentning siges for den del alene. Kun med
          virksomhed, som Score. PÅ 375 px (rådets fund 5) står handlingen
          (tilmelding / «Læs») UNDER rækken (flex-col), fra sm ved siden af. ── */}
      {companyId && (
        <HbSection eyebrow={NAESTE_I_NETVAERKET.eyebrow} linkLabel={NAESTE_I_NETVAERKET.link} linkTo={NAESTE_I_NETVAERKET.linkTo} hairline className="mt-10 md:mt-12" data-forside-naeste-netvaerk>
          <HbCard className="overflow-hidden">
            {/* Det næste event */}
            <div className="px-5 py-4 md:px-6" data-naeste-event={event ? event.id : "tom"}>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{NAESTE_I_NETVAERKET.eventEyebrow}</p>
              {eventsQuery.isError ? (
                <p className="mt-2 text-sm text-hb-rust">{sektionsfejlTekst("events")}</p>
              ) : event ? (
                <div className="mt-2 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
                  <Link to={`/events/${event.id}`} className="flex w-full min-w-0 flex-1 items-center gap-5 sm:w-auto">
                    <div className="w-12 shrink-0 text-center">
                      <p className="font-editorial text-3xl font-medium leading-none text-hb-ink">
                        {new Date(event.starts_at).getDate()}
                      </p>
                      <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                        {new Date(event.starts_at).toLocaleDateString("da-DK", { month: "short" }).replace(".", "")}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium leading-snug text-hb-ink">{event.title}</p>
                      <p className="mt-1 text-sm text-hb-ink-soft">
                        {[
                          event.kind === "live_sparring" ? "Live sparring" : event.kind === "workshop" ? "Workshop" : "Event",
                          event.meet_url ? "Online" : null,
                          new Date(event.starts_at).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }),
                          eventNedtaelling(event),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <HbVaerter kompakt className="mt-2" vaerter={vaerterForEvent(vaerterQuery.data ?? [], event.id, raadgivere)} />
                    </div>
                  </Link>
                  <EventRegisterAction eventId={event.id} phase={eventMeetPhase(event)} />
                </div>
              ) : (
                <p className="mt-2 text-sm text-hb-ink-soft" data-naeste-event-tom>
                  {NAESTE_I_NETVAERKET.eventTom}{" "}
                  <Link to={NAESTE_I_NETVAERKET.eventAlleTo} className="text-hb-evergreen underline-offset-4 hover:underline">{NAESTE_I_NETVAERKET.eventAlle}</Link>
                </p>
              )}
            </div>
            {/* Det nyeste opslag — under eventet (Jonas 2/10); kun med Netværket (rådets fund 4). */}
            {harNetvaerket && (
              <div className="border-t border-hb-line px-5 py-4 md:px-6" data-naeste-opslag={naesteNetvaerk.opslag ? naesteNetvaerk.opslag.id : "tom"}>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{NAESTE_I_NETVAERKET.opslagEyebrow}</p>
                {communityQuery.isError ? (
                  <p className="mt-2 text-sm text-hb-rust">{sektionsfejlTekst("community")}</p>
                ) : naesteNetvaerk.opslag ? (
                  <div className="mt-2 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
                    <Link to={`/community/${naesteNetvaerk.opslag.id}`} className="flex w-full min-w-0 flex-1 items-center gap-5 sm:w-auto">
                      {/* PR 4: portrættet når forfatteren har et, ellers initialen i husets form (HbAvatar — aldrig et tomt billede). */}
                      <HbAvatar navn={naesteNetvaerk.opslag.forfatter_navn} avatarUrl={naesteNetvaerk.opslag.forfatter_avatar_url} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium leading-snug text-hb-ink">{naesteNetvaerk.opslag.titel}</p>
                        <p className="mt-1 text-sm text-hb-ink-soft">
                          {naesteNetvaerk.opslag.forfatter_navn ?? "Medlem"} · {traadRelativTid(naesteNetvaerk.opslag.created_at)} · {naesteNetvaerk.opslag.antal_svar} svar
                        </p>
                      </div>
                    </Link>
                    <Link to={`/community/${naesteNetvaerk.opslag.id}`} className="shrink-0">
                      <HbButton variant="secondary" className="h-9 px-4 text-sm">{NAESTE_I_NETVAERKET.opslagLaes}</HbButton>
                    </Link>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-hb-ink-soft" data-naeste-opslag-tom>
                    {NAESTE_I_NETVAERKET.opslagTom}{" "}
                    <Link to="/community" className="text-hb-evergreen underline-offset-4 hover:underline">{NAESTE_I_NETVAERKET.link}</Link>
                  </p>
                )}
              </div>
            )}
          </HbCard>
        </HbSection>
      )}

    </div>
  );
};
