import * as React from "react";
import { profilUdfyldt } from "@/lib/hjemmebane/profilUdfyldt";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, ChevronUp, ExternalLink, Play } from "lucide-react";
import { toast } from "sonner";
import { HentningsFejl, kraevRaekker } from "@/lib/kraevRaekker";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingTjekliste } from "@/hooks/useOnboardingTjekliste";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import {
  REPORT_OVERRIDE_SELECT,
  formatDKK,
  getEffectiveReportPeriodKey,
  type ReportData,
} from "@/lib/financialUtils";
import { AREAS, getAssetPreviewUrl, type ContentItem } from "@/lib/hjemmebane/adminContentApi";
import { bunnyThumbnailUrl } from "@/lib/hjemmebane/bunnyMedia";
import { getISOWeekKey } from "@/lib/hjemmebane/week";
import { denneUgesFredag, naesteUgesFredag, omEnMaaned, tilDatoStreng } from "@/lib/hjemmebane/opgaveDato";
import { forslagMetaLinje, fristTekst } from "@/lib/hjemmebane/aftaler";
import { afsender, aktiveMedlemmer, INGEN_RAADGIVERE, raadgiverAnsigt, raadgiverOpslag, synligeMedlemmer, type Ansigt } from "@/lib/hjemmebane/ansigter";
import { listMemberDirectory } from "@/lib/hjemmebane/memberProfile";
import { afgoerFokusTom, type FokusTom } from "@/lib/hjemmebane/fokusTom";
import { hentefejlTekst, kildeAf, sektionsfejlTekst } from "@/lib/hjemmebane/hentefejl";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listUpcomingEvents } from "@/lib/hjemmebane/akademiApi";
import { hentBilledUrl, hentFeed, type CommunityTraad } from "@/lib/hjemmebane/communityApi";
import { foersteBilledsti, opslagMetaLinje, vaelgForsideOpslag } from "@/lib/hjemmebane/forsideOpslag";
import { uddrag } from "@/lib/hjemmebane/uddrag";
import { eventMeetPhase, eventNedtaelling } from "@/lib/hjemmebane/eventPhase";
import { EventRegisterAction } from "../events/EventRegisterAction";
import { formatDuration } from "@/components/hjemmebane/admin/editors/shared";
import { handoutConfigs, moduleOrder, type HandoutModule } from "@/lib/handoutConfig";
import { HbButton } from "../HbButton";
import { FornyelsesBaand } from "./FornyelsesBaand";
import { HbCard } from "../HbCard";
import { EstimatMaerke } from "../EstimatMaerke";
import { dinMaanedDom, sparklineKoordinater, type DinMaanedDom, type MaanedsRaekke } from "@/lib/hjemmebane/dinMaaned";
import { erDag1, hilsenLinje } from "@/lib/hjemmebane/forsideHilsen";
import { HbSection } from "../HbSection";
import { HbAvatar } from "../HbAvatar";
import { HbMaalForklaring } from "../milestones/HbMaalForklaring";
import { MAAL_FORKLARING_OVERSKRIFT } from "@/lib/hjemmebane/maalForklaring";
import { hasRichTextContent } from "@/lib/hjemmebane/richtext";
import { fokusCtaHref } from "@/lib/hjemmebane/ankomst";
import { isTrackedEntry, useAkademiData, type AkademiItem } from "../akademi/useAkademiData";
import { afgoerForloeb, forloebslinje, type Forloebslinje } from "@/lib/hjemmebane/forloeb";
import { maaskeRelevant, MAASKE_RELEVANT_PRAEFIKS } from "@/lib/hjemmebane/maaskeRelevant";
import { afgoerMilepael } from "@/lib/milepaelDom";
import { dineMaalDom, DINE_MAAL_FEJL_TEKST, DINE_SKRIDT_FEJL_TEKST, TILFOEJ_SKRIDT_FEJL_TEKST, TILFOEJ_SKRIDT_KNAP_TEKST, TILFOEJ_SKRIDT_OK_TEKST, type SkridtTilDineMaal } from "@/lib/hjemmebane/dineMaal";
import {
  ALLE_GJORT_TEKST, ANDRE_MAAL_OVERSKRIFT, FEJRING_VARIGHED_MS, fejring as lavFejring, forsidePlanDom, MAAL_UDEN_SKRIDT_TEKST, PLAN_INGEN_AKTIVE_TEKST, PLAN_TOM_BOOK, PLAN_TOM_SAET_MAAL, PLAN_TOM_TEKST, SE_HELE_PLANEN, UDEN_MAAL_OVERSKRIFT,
  type Fejring, type PlanSkridt,
} from "@/lib/hjemmebane/forsidePlan";
import { TilfoejSkridtForm } from "../milestones/HbMaalRaekke";
import type { MaalRaekke } from "@/lib/hjemmebane/planen";
import { lektionsSti } from "@/lib/hjemmebane/lektionerForModul";
import { HbVideoEmbed } from "../akademi/HbVideoEmbed";
import { deriveFocus, filtrerUdloebneForslag, type FocusItem } from "./nextStep";
import {
  byPublishedDesc,
  countNewSince,
  pickActiveItem,
  pickActivePush,
  pickActiveWeekVideo,
  pickEvergreen,
  pickMainStory,
  type NewsCandidate,
  type StoryCandidate,
  type StoryKind,
} from "./pushSelection";
import { pushMedie, spotifyEmbedUrl, youtubeIdAf, youtubeNocookieEmbedUrl, youtubeThumbnailUrl } from "./pushMedie";
import { pushOverlinje } from "./pushOverlinje";

/** Dit Boardroom (/boardroom) — Hb-forsiden i VANE-ANKER-IA'en (forside
    PR 2, hb-forside-recon §C/§G): de tre lag i rækkefølgen
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
    3) "Fra os til dig"-båndet — kurateret via RYKKELISTEN (PR B3,
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

/** Det fremhævede opslags billede — første hvidlistede billede i
    dokumentet, signeret ved visning som CommunityBillede (CommunityDokument
    .tsx): samme query-nøgle ["community","billede",sti], så URL'en deles
    med trådsiden; samme 50-minutters fornyelse under TTL'en på 3600 s.
    Ét ekstra kald til get-community-billed-url, kun når det nyeste opslag
    HAR et billede, og først når feedet er landet — kortets tekst står
    imens, og cover-pladsen holdes af en pulserende flade i hovedhistoriens
    cover-mål, så kortet ikke skifter form når billedet kommer. Fejl eller
    nej fra adgangsdommen → intet billede, teksten tager bredden (samme
    valg som CommunityBillede: et billede der ikke kan hentes, må ikke
    efterlade en brudt firkant). */
const FremhaevetOpslagBillede = ({ path }: { path: string }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["community", "billede", path],
    queryFn: () => hentBilledUrl(path),
    staleTime: 50 * 60_000,
    gcTime: 60 * 60_000,
    refetchInterval: 50 * 60_000,
    refetchIntervalInBackground: false,
  });
  if (isLoading) {
    return (
      <div
        aria-hidden
        className="aspect-[3/2] w-full animate-pulse bg-hb-line/40 md:aspect-auto md:w-[42%] md:shrink-0"
      />
    );
  }
  if (isError || !data?.url) return null;
  return (
    <div className="relative aspect-[3/2] md:aspect-auto md:w-[42%] md:shrink-0">
      <img src={data.url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
    </div>
  );
};

/** Det nyeste opslag som HOVEDHISTORIE — husets mønster fra «Fra os til
    dig» (MainStoryShell + PushStorys portræt-form): det eneste hvide kort
    i sektionen, cover i 42 % bredde når opslaget har et billede, portræt
    72 px, titlen i editorial 30/36 px, uddraget som beskrivelse (samme
    280-tegns-motor som opslagsmailen), svar og reaktioner i metalinjen,
    og «Læs opslaget» som RedaktioneltCards sekundære knap. Ingen nye
    farver eller størrelser — alt er hentet fra båndets kort. */
const FremhaevetOpslag = ({ traad }: { traad: CommunityTraad }) => {
  const navn = traad.forfatter_navn ?? "Medlem";
  const udd = uddrag(traad.indhold);
  const billedsti = foersteBilledsti(traad.indhold_json);
  return (
    <HbCard className="overflow-hidden">
      <div className={cn(billedsti && "md:flex md:min-h-[280px]")}>
        {billedsti && <FremhaevetOpslagBillede path={billedsti} />}
        <div className="min-w-0 md:flex-1">
          <div className="p-6 md:p-8">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Seneste opslag</p>
            <div className="mt-4 flex items-start gap-5">
              {/* PR 4: portrættet når forfatteren har et, ellers initialen i husets form (HbAvatar — aldrig et tomt billede). */}
              <HbAvatar navn={navn} avatarUrl={traad.forfatter_avatar_url} stoerrelse="lg" />
              <div className="min-w-0">
                <h2 className="font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">
                  {traad.titel}
                </h2>
                <p className="mt-2 text-sm font-medium text-hb-ink">{navn}</p>
              </div>
            </div>
            {udd.tekst && (
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-hb-ink-soft">{udd.tekst}</p>
            )}
            <p className="mt-4 text-sm text-hb-ink-soft">
              {opslagMetaLinje(traad.antal_svar, traad.antal_reaktioner, traadRelativTid(traad.seneste_aktivitet_at))}
            </p>
            <Link to={`/community/${traad.id}`} className="mt-6 inline-block">
              <HbButton variant="secondary" className="h-9 px-4 text-sm">
                Læs opslaget
                <ArrowRight className="h-4 w-4" />
              </HbButton>
            </Link>
          </div>
        </div>
      </div>
    </HbCard>
  );
};

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
          ikke er færdig, hedder det «Velkommen» — tidshilsenen kommer
          når medlemmet er kommet ind. */}
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

/** Anchor-feedets beskrivelser er HTML i CDATA — strippes til ren tekst
    til teaseren (DOMParser findes i browser og jsdom). */
const stripHtml = (html: string): string =>
  new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() ?? "";

const truncateText = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max).trimEnd()}…`;

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

type BandItem = ContentItem;

/** Polering #2 (begrundet valg): kolonneantal AFHÆNGIGT af antallet frem
    for fast grid. Fast cols-3 efterlader én enlig ved 4 (3+1), og fast
    cols-4 gør det samme ved 5 (4+1) — ingen fast værdi dækker hele
    intervallet. Mapningen 2→2 · 3→3 · 4→4 på lg (2+2 på md) · 5-6→3
    (3+2 / 3+3) efterlader ALDRIG præcis én tile alene på sidste række
    for 2-6 elementer — på hverken md eller lg. 1 element → fuld bredde. */
const tileColsClass = (count: number): string => {
  switch (count) {
    case 2:
      return "md:grid-cols-2";
    case 3:
      return "md:grid-cols-3";
    case 4:
      return "md:grid-cols-2 lg:grid-cols-4";
    case 5:
    case 6:
      return "md:grid-cols-3";
    default:
      return count <= 1 ? "" : "md:grid-cols-3";
  }
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
}: {
  story: StoryCandidate<BandItem>;
  variant: StoryVariant;
  pushSender: { full_name: string; avatar_url: string | null } | null;
  pushCoverUrl: string | null;
}) => {
  switch (story.kind) {
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

/** «Din måned» (forside PR 2, 17/9 — Jonas «A» til valg 2) — afløser
    tal-strippen nederst. Samme kilder (facts-laget via dinMaanedDom: sidste
    periode, bank evt. fra en ældre række, estimat-mærket efter data_basis),
    men i toppens højre kolonne og med RETNING I ORD mod forrige måned og
    en SPARKLINE over de seneste 12 måneder med tal. Ingen procent, ingen
    farve for op/ned — kun ord (negativt beløb er rust som i resten af
    huset). Uden tal: hvad det bliver til + «Upload din første rapport». */
const Sparkline = ({ dom }: { dom: Extract<DinMaanedDom, { tom: false }> }) => {
  const k = sparklineKoordinater(dom.sparkline);
  if (k.length < 2) return null;
  const B = 100, H = 32;
  const punkter = k.map((p) => `${(p.x * B).toFixed(1)},${(2 + p.y * (H - 4)).toFixed(1)}`).join(" ");
  const sidste = k[k.length - 1];
  return (
    <svg viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none" className="mt-3 h-9 w-full" aria-hidden data-sparkline={k.length}>
      <polyline points={punkter} fill="none" stroke="hsl(var(--hb-evergreen))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(sidste.x * B).toFixed(1)} cy={(2 + sidste.y * (H - 4)).toFixed(1)} r="2.5" fill="hsl(var(--hb-evergreen))" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const DinMaaned = ({ dom }: { dom: DinMaanedDom }) => {
  // strict=false: `if (dom.tom)` snævrer ikke unionen — sammenlign med true (husets regel).
  if (dom.tom === true) {
    return (
      <HbCard className="p-6" data-din-maaned="tom">
        <h3 className="font-editorial text-2xl font-medium leading-tight text-hb-ink">{dom.overskrift}</h3>
        <p className="mt-2 text-sm leading-relaxed text-hb-ink-soft">{dom.linje}</p>
        <Link to={dom.cta.to} className="mt-4 inline-block">
          <HbButton className="h-9 px-4 text-sm">{dom.cta.label}</HbButton>
        </Link>
      </HbCard>
    );
  }
  return (
    <HbCard className="p-6" data-din-maaned={dom.periodLabel}>
      <p className="text-sm text-hb-ink-soft">
        {dom.estimeret ? <>Seneste tal: {dom.periodLabel} <EstimatMaerke className="align-middle" /></> : <>Senest godkendt: {dom.periodLabel}</>}
      </p>
      <dl className="mt-3 divide-y divide-hb-line">
        {dom.tal.map((t) => (
          <div key={t.felt} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0" data-tal={t.felt}>
            <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
              {t.label}
              {t.estimeret && <EstimatMaerke kompakt className="ml-1" />}
            </dt>
            <dd className="text-right">
              {/* Fortegns-tonen: samme udtryk som resten af platformen (HbBudgetEditTable:625). */}
              <p className={cn("font-editorial text-2xl font-medium leading-none", t.value != null && t.value < 0 ? "text-hb-rust" : "text-hb-ink")}>
                {t.value != null ? formatDKK(t.value) : "—"}
              </p>
              {t.retning && <p className="mt-1 text-xs text-hb-ink-soft" data-retning>{t.retning}</p>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{dom.sparklineTekst}</p>
      <Sparkline dom={dom} />
    </HbCard>
  );
};

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
    stadig motorens — fladen gater kun visningen. */
const OpgaveKnapper = ({
  handling,
  busy,
  onKald,
  className,
}: {
  handling: OpgaveHandling;
  busy: boolean;
  onKald: (kald: OpgaveKald) => void;
  className?: string;
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

  if (datoFormaal) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <span className="mr-1 text-sm text-hb-ink-soft">Hvornår?</span>
        <HbButton variant="secondary" className="h-9 px-4" disabled={busy} onClick={() => sendDato(denneUgesFredag(idag))}>
          Denne uge
        </HbButton>
        <HbButton variant="secondary" className="h-9 px-4" disabled={busy} onClick={() => sendDato(naesteUgesFredag(idag))}>
          Næste uge
        </HbButton>
        <HbButton variant="secondary" className="h-9 px-4" disabled={busy} onClick={() => sendDato(omEnMaaned(idag))}>
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
              disabled={{ before: idag }}
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
const PlanSkridtRaekke = ({ skridt, slags, busy, onKald, ansigt = null }: { skridt: PlanSkridt; slags: "aktiv" | "forslag"; busy: boolean; onKald: (kald: OpgaveKald) => void; ansigt?: Ansigt | null }) => {
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
  const { user, profile, companyId, isAdvisor } = useAuth();
  const akademi = useAkademiData();
  const { data: facts = [], isLoading: factsLoading, isError: factsError } = useCompanyFacts();

  // ── Katalog-afledninger (deler cache med Akademiet) ─────────────────────
  const items = akademi.orderedByArea;
  const pushItem = useMemo(
    () =>
      pickActivePush(
        (items.get("push") ?? []).map((entry) => entry.item),
        new Date(),
      ),
    [items],
  );
  const weekVideo = useMemo(
    () =>
      pickActiveWeekVideo(
        (items.get("ugens_video") ?? []).map((entry) => entry.item),
        new Date(),
      ),
    [items],
  );

  // ── Rykkelistens øvrige kandidater (PR B3) — hver hentes UAFHÆNGIGT ─────
  // Kataloget fra useAkademiData er published-only (listPublishedItems), så
  // status-filteret er allerede indfriet før dommene anvendes.
  const redaktioneltItem = useMemo(
    () =>
      pickActiveItem(
        (items.get("redaktionelt") ?? []).map((entry) => entry.item),
        new Date(),
      ),
    [items],
  );
  const evergreenItem = useMemo(
    () =>
      pickEvergreen(
        (items.get("evergreen") ?? []).map((entry) => entry.item),
        new Date(),
      ),
    [items],
  );

  // Rykkelisten (LÅST dom): første ikke-null kandidat vinder hovedpladsen.
  const band = useMemo(
    () =>
      pickMainStory<BandItem>([
        pushItem ? { kind: "push", item: pushItem } : null,
        weekVideo ? { kind: "video", item: weekVideo } : null,
        redaktioneltItem ? { kind: "redaktionelt", item: redaktioneltItem } : null,
        evergreenItem ? { kind: "evergreen", item: evergreenItem } : null,
      ]),
    [pushItem, weekVideo, redaktioneltItem, evergreenItem],
  );

  // ── "Siden sidst"-linjen (bølge 3) ──────────────────────────────────────
  // READ-THEN-STAMP på localStorage: forrige besøgs stempel fanges i
  // lazy-initializeren FØR det nye skrives — én gang pr. mount, så et
  // refresh midt i besøget ikke nulstiller linjen utilsigtet. Pr. enhed
  // (recon §1: bevidst mindste vej — linjen er en blød nudge, ikke en
  // indbakke-badge; ingen migration/RLS-flade).
  const [lastVisitIso] = useState<string | null>(() => {
    try {
      const prev = localStorage.getItem("hb.forside.lastVisitAt");
      localStorage.setItem("hb.forside.lastVisitAt", new Date().toISOString());
      return prev;
    } catch {
      return null; // storage utilgængelig (privat tilstand m.m.) → linjen tier
    }
  });

  // Kandidatlisten til tællingen = båndets kandidater MINUS evergreen:
  // rotationen er deterministisk (isoWeekNumber % length) og indslaget
  // bevidst tidløst — talte den med, ville linjen råbe "nyt" hver mandag
  // uden at noget faktisk var nyt. Dommen selv er dum og tæller det den
  // får; fravalget er kalderens (dokumenteret i pushSelection-headeren).
  const newsCount = useMemo(
    () =>
      countNewSince(
        [
          pushItem ? { publishedAt: pushItem.published_at ?? pushItem.created_at } : null,
          weekVideo ? { publishedAt: weekVideo.published_at ?? weekVideo.created_at } : null,
          redaktioneltItem
            ? { publishedAt: redaktioneltItem.published_at ?? redaktioneltItem.created_at }
            : null,
        ].filter((c): c is NewsCandidate => c != null),
        lastVisitIso,
      ),
    [pushItem, weekVideo, redaktioneltItem, lastVisitIso],
  );

  // Hilsenens linje (forside PR 2): dagen + «N nye ting siden sidst» —
  // newsCount er den samme dom som før (countNewSince), linjen er flyttet
  // OP fra båndet til under hilsenen. Dag 1 (tjeklisten ikke færdig): den
  // faste sætning. Ordene er lib/hjemmebane/forsideHilsen.
  // Historik (PR B3): seneste redaktionelle som rolige linjer, kollapset.
  const [historikOpen, setHistorikOpen] = useState(false);
  const redaktioneltHistory = useMemo(
    () =>
      [...(items.get("redaktionelt") ?? [])]
        .map((entry) => entry.item)
        .sort(byPublishedDesc)
        .slice(0, 5),
    [items],
  );

  // RÅDGIVERNES ANSIGTER (forside PR 4, Jonas «A» til valg 6): ÉN hentning
  // af get_all_advisor_profiles — den SAMME security definer-RPC som
  // medlems-chatten (CompanyChatPane:163-176), så MEDLEMMER må kalde den;
  // direkte profiles-select er ikke garanteret for medlemmer. Før (PR 3)
  // hentedes den kun for pushets afsender; nu føder ét opslag pushets
  // afsender, «Dit næste skridt» og forslagene i «Din plan». Dommen om
  // HVEM der får et ansigt er ren (ansigter.raadgiverAnsigt). Ansigter er
  // berigelse: fejler kaldet, står teksterne uden portræt («Fra din
  // rådgiver») — kilden navngives (kraevRaekker), ingen fejllinje.
  const pushAuthorUserId =
    ((pushItem?.metadata as Record<string, unknown> | null)?.author_user_id as string) || null;
  const raadgivereQuery = useQuery({
    queryKey: ["boardroom", "raadgivere"],
    queryFn: async () => raadgiverOpslag(kraevRaekker(await supabase.rpc("get_all_advisor_profiles" as any), "get_all_advisor_profiles") as any[]),
    staleTime: 10 * 60 * 1000,
    enabled: !!user,
  });
  const raadgivere = raadgivereQuery.data ?? INGEN_RAADGIVERE;
  const pushSender = afsender(pushAuthorUserId, raadgivere);

  // Push-coveret (PR A) — samme signerede-URL-mønster som Akademiets covers
  // (getAssetPreviewUrl mod content-assets).
  const { data: pushCoverUrl = null } = useQuery({
    queryKey: ["boardroom", "push-cover", pushItem?.cover_path ?? null],
    queryFn: () => getAssetPreviewUrl(pushItem!.cover_path as string),
    enabled: !!pushItem?.cover_path,
    staleTime: 30 * 60_000,
  });

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
      const res = await supabase
        .from("milestones")
        .select("id, title, deadline, progress, status, category, source, progress_updated_at, completed_at, created_at")
        .eq("company_id", companyId!);
      return kraevRaekker(res, "milestones") as MaalRaekke[];
    },
    enabled: !!companyId,
    staleTime: 3 * 60_000,
  });

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
        .select("id, title, status, due_date, maal_id, closed_at")
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
      const result: { lever: string; moduleTitle: string }[] = [];
      for (const module of moduleOrder) {
        const row = rows.find((r) => r.module === module);
        if (!row) continue;
        const levers = (row.levers as string[]) || [];
        levers.forEach((lever, index) => {
          if (lever.trim() && !linked.has(`${row.id}:${index}`)) {
            result.push({ lever: lever.trim(), moduleTitle: handoutConfigs[module as HandoutModule]?.title ?? module });
          }
        });
      }
      return result;
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  // Egen netværksprofil (fokus-kilde (i)): mangler ask_me_about?
  // ADVISOR-GATED via enabled — rådgivere har ikke samme profilrolle, og
  // deres user.id ville ellers slå igennem selv i company-override.
  // Disabled/loading → data undefined → askMeAboutMissing false (ingen
  // flakkende prompt før svaret er der).
  const ownProfileQuery = useQuery({
    queryKey: ["boardroom", "own-profile-empty", user?.id],
    queryFn: async () => {
      // KASTER ved fejl (10/9): en fejl må ikke blive «profilen er tom» og et
      // nudge til en der har udfyldt den.
      const { data, error } = await supabase
        .from("member_profiles" as any)
        .select("ask_me_about")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw new HentningsFejl("member_profiles", error.message);
      return !profilUdfyldt(data as unknown as { ask_me_about: string | null } | null); // én dom: profilUdfyldt.ts
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
    const parts: string[] = [];
    if (reportsThisYear > 0)
      parts.push(
        reportsThisYear === 1 ? "1 godkendt rapport i år" : `${reportsThisYear} godkendte rapporter i år`,
      );
    if (milestonesDone > 0)
      parts.push(milestonesDone === 1 ? "1 mål nået" : `${milestonesDone} mål nået`);
    if (akademiDone > 0)
      parts.push(
        akademiDone === 1 ? "1 video gennemført i Akademiet" : `${akademiDone} videoer gennemført i Akademiet`,
      );
    return parts.length > 0 ? `Og rejsen kan ses: ${parts.join(" · ")}.` : null;
  }, [committedKeys, milestonesQuery.data, akademi.orderedByArea]);

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
  const fejledeKilder = [processedQuery, milestonesQuery, pulseQuery, leversQuery, ownProfileQuery, contractStartQuery]
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
      unlinkedLevers: leversQuery.data ?? [],
      askMeAboutMissing: ownProfileQuery.data === true,
      // Ankomsten (trin 9): uafsluttet tjekliste = kortets eneste kilde;
      // kontraktstarten holder slot (a) fra at bede om tal fra før
      // kontrakten. Begge dømmes i motoren (nextStep.ts).
      contractStartDate: contractStartQuery.data ?? null,
      tjekliste: tjeklisteData.tjekliste,
    });
  }, [companyId, processedQuery.data, committedKeys, pulseQuery.data, unreadQuery.data, weeklyFocusQuery.data, actionsQuery.data, leversQuery.data, ownProfileQuery.data, contractStartQuery.data, tjeklisteData.tjekliste]);

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
    if (weeklyDisplayed && row && !row.seen_at && !seenMarked.current) {
      seenMarked.current = true;
      markSeen.mutate(row.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeklyDisplayed, weeklyFocusQuery.data]);

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
            ? "Opgaven er udskudt"
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
    },
  });

  const focusLoading =
    !!companyId &&
    (processedQuery.isPending ||
      milestonesQuery.isPending ||
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
  const eventsQuery = useQuery({
    queryKey: ["boardroom", "events"],
    queryFn: () => listUpcomingEvents(3),
    staleTime: 5 * 60_000,
  });
  const events = eventsQuery.data ?? [];

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
  // Nyeste opslag til kortet + de to næste til rækkerne (ren dom).
  const forsideOpslag = useMemo(() => vaelgForsideOpslag(communityQuery.data ?? []), [communityQuery.data]);

  // ── Tal-strip-afledning (uændret) ───────────────────────────────────────
  const sorted = useMemo(
    () => facts.map((f) => ({ key: f.period_key, kf: factsToDanishMetrics(f.metrics), period: f.period_label, basis: f.data_basis })),
    [facts],
  );
  const processing = sorted.length === 0 && (processedQuery.data?.size ?? 0) > 0;
  // «Din måned» (PR 2): samme rækker som tal-strippen læste — ren dom.
  const dinMaaned = useMemo(
    () =>
      dinMaanedDom(
        sorted.map<MaanedsRaekke>((r) => ({
          key: r.key,
          period: r.period,
          basis: r.basis === "estimated" ? "estimated" : "measured",
          omsaetning: r.kf.omsaetning ?? null,
          resultat: r.kf.resultat_foer_skat ?? null,
          bank: r.kf.bank_balance ?? null,
        })),
        processing,
      ),
    [sorted, processing],
  );

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
    if (!primaer || primaer.kind !== "company-action" || !primaer.sourceId) return null;
    const raekke = aftaleRaekker.find((r) => r.id === primaer.sourceId);
    return raekke ? raadgiverAnsigt(raekke, raadgivere) : null;
  }, [focus, aftaleRaekker, raadgivere]);
  // AKTIVE MEDLEMMER (PR 4, analyse §5): små portrætter af dem der har skrevet
  // den seneste uge — kun medlemmer i Netværket (get_member_directory:
  // vis_i_netvaerk, ingen rådgivere, ingen legat) og kun det feedet
  // (fail-closed) allerede har givet. Hentes først når feedet har rækker;
  // samme nøgle som /medlemmer og community-sporet, så cachen deles.
  const directoryQuery = useQuery({
    queryKey: ["member-directory"],
    queryFn: listMemberDirectory,
    staleTime: 5 * 60_000,
    enabled: (communityQuery.data?.length ?? 0) > 0,
  });
  const aktive = useMemo(
    () => aktiveMedlemmer(communityQuery.data ?? [], directoryQuery.data ? synligeMedlemmer(directoryQuery.data) : null, new Date()),
    [communityQuery.data, directoryQuery.data],
  );
  const dineMaal = useMemo(
    () => (milestonesQuery.data && skridtQuery.data ? dineMaalDom(milestonesQuery.data, skridtQuery.data, new Date()) : null),
    [milestonesQuery.data, skridtQuery.data],
  );
  const plan = useMemo(() => (dineMaal ? forsidePlanDom(dineMaal, aftaleRaekker, new Date()) : null), [dineMaal, aftaleRaekker]);
  const maalTitler = milestonesQuery.data ?? [];

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

  if (akademi.loading || factsLoading) {
    return <p className="text-sm text-hb-ink-soft">Henter dit Boardroom…</p>;
  }

  // Båndet vises når der er en hovedhistorie eller historik. Podcast-
  // kortet og dets skeleton udgik 17/9 (beslutning 17): alle kandidater er
  // nu synkrone afledninger af Akademi-kataloget — intet feed at vente på,
  // ingen reserveret plads. Antal tiles (polering #2): rækken rummer højst
  // 3 side-historier (video, redaktionelt, evergreen); tileColsClass-
  // mapningen (2→2, 3→3) dækker intervallet.
  const hasBand = Boolean(band.main || redaktioneltHistory.length > 0);
  const tileCount = band.side.length;

  return (
    <div>
      <PageHeader
        firstName={firstName}
        velkomst={Boolean(tjeklisteData.tjekliste && !tjeklisteData.tjekliste.faerdig)}
        // Dag 1 (PR 3, rettet efter Jonas' skærm 17/9 11:28): medlemskabets start
        // (contract_start_date, som forsiden allerede henter til fokus-motoren)
        // inden for 14 døgn — ikke «tjeklisten ikke færdig».
        linje={hilsenLinje({ nu: new Date(), nyeTing: newsCount, dag1: erDag1(contractStartQuery.data ?? null, new Date()) })}
      />

      {/* ── FORNYELSEN (7/9): båndet står mellem hilsenen og toppen, KUN når
          hent-fornyelsestilbud siger at der er et tilbud — ellers null og
          ingen plads. Dommen er serverens (motoren); se FornyelsesBaand. ── */}
      <FornyelsesBaand />

      {/* ── TOPPEN (forside PR 2 + PR 3, 17/9 — Jonas «A» til valg 1): to kolonner
          på md+ — venstre 7/12 NYHEDEN (stående hovedhistorie) i række 1 og
          TILES (ugens video, redaktionelt, evergreen) i række 2; højre 5/12
          «DIN MÅNED» over «DIT NÆSTE SKRIDT» (kompakt) hen over begge rækker.
          MOBIL (PR 3, rettet efter Jonas' skærm 17/9 11:28 — analyse §6.2):
          DOM-ordenen ER mobil-ordenen: hilsen → nyheden → Din måned → Dit
          næste skridt → tiles → resten. Valget: tiles er ET grid-barn med
          eksplicit plads på md (col-start-1/row-start-2) frem for `order-*`
          eller to renderinger (md:hidden/hidden md:block) — tiles renderes
          ÉN gang, ingen dobbelt hentning, ingen dobbelt afspiller-tilstand.
          Uden bånd (intet publiceret): højre kolonne tager hele bredden. ── */}
      <div className={cn("mt-10 grid grid-cols-1 gap-8 md:mt-12 md:items-start", hasBand && "md:grid-cols-12")} data-forside-top>
        {hasBand && (
          <div className="min-w-0 md:col-span-7 md:col-start-1 md:row-start-1" data-forside-venstre>
            <HbSection eyebrow="Fra os til dig" linkLabel="Se Akademiet" linkTo="/akademiet" hairline data-forside-nyheden>
              {/* "Siden sidst"-linjen står under hilsenen (PR 2, forsideHilsen).
                  Rykkelistens vinder som stående hovedhistorie (PR 2). */}
              {band.main && (
                <StoryCard
                  story={band.main}
                  variant="main"
                  pushSender={pushSender}
                  pushCoverUrl={pushCoverUrl}
                />
              )}
            </HbSection>
          </div>
        )}
        <div className={cn("min-w-0 space-y-8", hasBand ? "md:col-span-5 md:col-start-8 md:row-span-2 md:row-start-1" : "md:col-span-12")} data-forside-hoejre>
          {/* «DIN MÅNED» (valg 2) — afløser tal-strippen nederst. Kun med virksomhed. */}
          {companyId && (
            <HbSection eyebrow="Din måned" hairline linkLabel="Se dine tal" linkTo="/kpis" data-forside-din-maaned>
              <DinMaaned dom={dinMaaned} />
            </HbSection>
          )}

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
        {hasBand && (band.side.length > 0 || redaktioneltHistory.length > 0) && (
          /* TILES + historik: række 2 i venstre kolonne på md; SIDST på mobil (DOM-ordenen). */
          <div className="min-w-0 md:col-span-7 md:col-start-1 md:row-start-2" data-forside-tiles>
            {band.side.length > 0 && (
              <div className={cn("grid grid-cols-1 items-start gap-x-6 gap-y-8", tileColsClass(tileCount))}>
                {band.side.map((story) => (
                  <StoryCard
                    key={story.kind}
                    story={story}
                    variant="side"
                    pushSender={pushSender}
                    pushCoverUrl={pushCoverUrl}
                  />
                ))}
              </div>
            )}
          {/* Historik (PR B3): diskret "Se tidligere" under båndet —
              seneste redaktionelle (byPublishedDesc, 5 stk) som rolige
              linjer m. titel + dato + link. Kollapset som standard. */}
          {redaktioneltHistory.length > 0 && (
            <div className={band.side.length > 0 ? "mt-9" : undefined}>
              <button
                type="button"
                onClick={() => setHistorikOpen((open) => !open)}
                className="flex items-center gap-1.5 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
              >
                {historikOpen ? "Skjul tidligere" : "Se tidligere"}
                {historikOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {historikOpen && (
                <ul className="mt-3">
                  {redaktioneltHistory.map((item) => {
                    const link =
                      (((item.metadata as Record<string, unknown>) ?? {}).link as string) || null;
                    const date = new Date(item.published_at ?? item.created_at).toLocaleDateString(
                      "da-DK",
                      { day: "numeric", month: "short", year: "numeric" },
                    );
                    return (
                      <li
                        key={item.id}
                        className="flex items-baseline gap-3 border-t border-hb-line/60 py-2.5 text-sm"
                      >
                        <span className="w-28 shrink-0 text-xs text-hb-ink-soft">{date}</span>
                        {link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-hb-ink underline-offset-4 hover:underline"
                          >
                            {item.title}
                          </a>
                        ) : (
                          <span className="text-hb-ink">{item.title}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          </div>
        )}
      </div>

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
        <HbSection id="din-plan" eyebrow="Din plan" hairline linkLabel={SE_HELE_PLANEN} linkTo="/milestones" className="mt-10 md:mt-12" data-din-plan={plan.maal.length} data-din-plan-tom={plan.tom ? "1" : "0"}>
          <span id="dine-skridt" data-anker /><span id="dine-maal" data-anker />
          {/* «Hvad er et mål?» (tillæg 17/9) — med mål: et lille link ved
              sektionens header der folder forklaringen ud (native <details>,
              lukket som standard). Uden mål står den ÅBEN i tom-tilstanden. */}
          {!plan.tom && (
            <details className="-mt-2 mb-4" data-maal-forklaring-fold>
              <summary className="inline-block cursor-pointer list-none text-sm text-hb-evergreen underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">{MAAL_FORKLARING_OVERSKRIFT}</summary>
              <HbMaalForklaring udenOverskrift className="mt-3" />
            </details>
          )}
          {/* FEJRINGEN øverst i sektionen — ét sted, uanset om målet stadig er
              blandt de aktive (ved 100 % er det nået i planens dom og rykker ud). */}
          {fejring && (
            <ul className="mb-3"><FejringRaekke fejring={fejring} /></ul>
          )}
          {/* TOM — invitationen (medlemmet ejer sine mål, Jonas 16/9): ikke «I har ikke sat mål endnu». */}
          {plan.tom && (
            <div data-plan-tom>
              <p className="max-w-2xl text-sm leading-relaxed text-hb-ink-soft">{PLAN_TOM_TEKST}</p>
              <HbMaalForklaring className="mt-5" />
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to="/milestones"><HbButton className="h-9 px-4 text-sm">{PLAN_TOM_SAET_MAAL}</HbButton></Link>
                <Link to="/book-session"><HbButton variant="secondary" className="h-9 px-4 text-sm">{PLAN_TOM_BOOK}</HbButton></Link>
              </div>
            </div>
          )}
          {plan.ingenAktive && (
            <p className="text-sm text-hb-ink-soft" data-plan-ingen-aktive>
              {PLAN_INGEN_AKTIVE_TEKST}{" "}
              <Link to="/milestones" className="text-hb-evergreen underline-offset-4 hover:underline">{PLAN_TOM_SAET_MAAL}</Link>
            </p>
          )}
          {plan.maal.length > 0 && (
            <ul data-plan-maal={plan.maal.length}>
              {plan.maal.map((x) => (
                <li key={x.plan.plan.maal.id} className="border-t border-hb-line py-4 first:border-t-0 last:border-b" data-maal-id={x.plan.plan.maal.id} data-maal-fremdrift={x.plan.plan.fremdrift} data-maal-beregnet={x.plan.plan.beregnet ? "1" : "0"}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                    <p className="min-w-0 flex-1 basis-64 text-[15px] font-medium leading-snug text-hb-ink">{x.plan.plan.maal.title}</p>
                    {x.plan.plan.dom.forfalden ? (
                      <span className="text-sm font-medium text-hb-rust">{fristTekst(x.plan.plan.maal.deadline!, tilDatoStreng(new Date()))}</span>
                    ) : x.plan.plan.maal.deadline ? (
                      <span className="text-sm text-hb-ink-soft">{fristTekst(x.plan.plan.maal.deadline, tilDatoStreng(new Date()))}</span>
                    ) : null}
                  </div>
                  <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-hb-line">
                    <div className="h-full rounded-full bg-hb-evergreen/70" style={{ width: `${x.plan.plan.fremdrift}%` }} />
                  </div>
                  <p className="mt-1 text-sm text-hb-ink-soft">
                    {x.plan.fremdriftTekst}
                    {x.forslag.length > 0 && <span> · {x.forslag.length} {x.forslag.length === 1 ? "forslag venter" : "forslag venter"}</span>}
                  </p>
                  {x.alleGjort && (
                    <p className="mt-1 text-sm" data-alle-gjort>
                      <Link to="/milestones" className="text-hb-evergreen underline-offset-4 hover:underline">{ALLE_GJORT_TEKST}</Link>
                    </p>
                  )}
                  {/* Skridtene under målet: aktive, så forslag. */}
                  {(x.aktive.length > 0 || x.forslag.length > 0) && (
                    <ul className="mt-3 border-l-2 border-hb-line pl-4">
                      {x.aktive.map((a) => (
                        <PlanSkridtRaekke key={a.id} skridt={a} slags="aktiv" busy={planBusy} onKald={(kald) => opgaveMutation.mutate(kald)} />
                      ))}
                      {x.forslag.map((f) => (
                        <PlanSkridtRaekke key={f.id} skridt={f} slags="forslag" ansigt={raadgiverAnsigt(f, raadgivere)} busy={planBusy} onKald={(kald) => opgaveMutation.mutate(kald)} />
                      ))}
                    </ul>
                  )}
                  {/* «+ Tilføj skridt» — #946's formular (samme function). Uden skridt: «Tilføj det første skridt». */}
                  {tilfoejAaben === x.plan.plan.maal.id ? (
                    <div className="mt-3 max-w-xl">
                      <TilfoejSkridtForm maalId={x.plan.plan.maal.id} busy={planBusy} onTilfoej={(titel, dueDate) => tilfoejSkridt(x.plan.plan.maal.id, titel, dueDate)} onLuk={() => setTilfoejAaben(null)} knapTekst={x.udenSkridt ? MAAL_UDEN_SKRIDT_TEKST : undefined} />
                    </div>
                  ) : (
                    <button type="button" disabled={planBusy} onClick={() => setTilfoejAaben(x.plan.plan.maal.id)} className="mt-3 text-xs text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50" data-handling="tilfoej-skridt">
                      + {x.udenSkridt ? MAAL_UDEN_SKRIDT_TEKST : TILFOEJ_SKRIDT_KNAP_TEKST}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {plan.flere > 0 && (
            <p className="mt-3 text-sm text-hb-ink-soft">+{plan.flere} {plan.flere === 1 ? "aktivt mål mere" : "aktive mål mere"} — se dem alle under Din plan.</p>
          )}
          {plan.overGraensen && <p className="mt-1 text-sm text-hb-rust">{plan.graenseTekst}</p>}
          {(plan.udenMaal.aktive.length > 0 || plan.udenMaal.forslag.length > 0) && (
            <div className="mt-6" data-plan-uden-maal>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{UDEN_MAAL_OVERSKRIFT}</p>
              <ul className="mt-2">
                {plan.udenMaal.aktive.map((a) => (
                  <PlanSkridtRaekke key={a.id} skridt={a} slags="aktiv" busy={planBusy} onKald={(kald) => opgaveMutation.mutate(kald)} />
                ))}
                {plan.udenMaal.forslag.map((f) => (
                  <PlanSkridtRaekke key={f.id} skridt={f} slags="forslag" ansigt={raadgiverAnsigt(f, raadgivere)} busy={planBusy} onKald={(kald) => opgaveMutation.mutate(kald)} />
                ))}
              </ul>
            </div>
          )}
          {(plan.andre.aktive.length > 0 || plan.andre.forslag.length > 0) && (
            <div className="mt-6" data-plan-andre>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{ANDRE_MAAL_OVERSKRIFT}</p>
              <ul className="mt-2">
                {plan.andre.aktive.map((a) => (
                  <PlanSkridtRaekke key={a.id} skridt={a} slags="aktiv" busy={planBusy} onKald={(kald) => opgaveMutation.mutate(kald)} />
                ))}
                {plan.andre.forslag.map((f) => (
                  <PlanSkridtRaekke key={f.id} skridt={f} slags="forslag" ansigt={raadgiverAnsigt(f, raadgivere)} busy={planBusy} onKald={(kald) => opgaveMutation.mutate(kald)} />
                ))}
              </ul>
            </div>
          )}
        </HbSection>
      )}

      {/* ── EVENTS: egen sektion mellem lag 1 og lag 2 — live-sessions
          er en KERNEYDELSE, ikke en nyhed; de skal ikke bo som én tile
          i det redaktionelle bånd. Rolige rammeløse rækker (samme
          tile-materiale: hb-line + luft) m. dato tydeligt.
          Højrekolonnen bærer inline-tilmeldingen (Events trin 3b);
          nedtællingen bor i meta-linjen. Ingen kommende events → ingen
          sektion. */}
      {eventsQuery.isError && (
        <p className="mt-14 text-sm text-hb-rust md:mt-16">{sektionsfejlTekst("events")}</p>
      )}
      {events.length > 0 && (
        <HbSection eyebrow="Kommende" hairline className="mt-10 md:mt-12">
          {/* Link'et dækker KUN dato+titel+meta — tilmeldingshandlingen
              står som SØSKENDE i rækken, aldrig inde i linket (klikbar
              handling i et anker er ugyldig HTML og ville trigge
              navigation). Hover-tonen bor på wrapperen. */}
          <ul>
            {events.map((event) => (
              <li key={event.id} className="border-t border-hb-line last:border-b">
                <div className="flex items-center gap-5 py-4 transition-colors hover:bg-hb-sage/20">
                  <Link to={`/events/${event.id}`} className="flex min-w-0 flex-1 items-center gap-5">
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
                    </div>
                  </Link>
                  <EventRegisterAction eventId={event.id} phase={eventMeetPhase(event)} />
                </div>
              </li>
            ))}
          </ul>
        </HbSection>
      )}

      {/* ── COMMUNITY: efter events, før båndet — events er tidsbundne
          og skal ses først; fællesskabet er levende, men ikke
          tidskritisk; det kuraterede bånd er redaktionelt og hører
          nederst. Ingen skeleton: sektionen dukker op når data er der —
          forsiden har allerede nok bevægelse. TOMT feed → sektionen
          renderes IKKE: en tom sektion på forsiden ser ud som om noget
          er gået i stykker — og et medlem uden community-adgang får
          netop et tomt feed (RPC'en er fail-closed), så sektionen skal
          forsvinde helt for dem. Fejl → samme som tomt.
          VÆGT (3/9, Jonas: «den er tam»): det NYESTE opslag får kortet
          (FremhaevetOpslag) efter båndets mønster — ét hvidt kort, resten
          rolige rækker. Dommen om hvad der er nyest, og hvilke to der
          står under, er ren (vaelgForsideOpslag). */}
      {communityQuery.isError && (
        <p className="mt-14 text-sm text-hb-rust md:mt-16">{sektionsfejlTekst("community")}</p>
      )}
      {forsideOpslag.fremhaevet && (
        <HbSection
          eyebrow="Fra fællesskabet"
          linkLabel="Gå til fællesskabet"
          linkTo="/community"
          hairline
          className="mt-10 md:mt-12"
        >
          {/* PR 4: de seneste aktive medlemmer — små portrætter (højst 6) og
              «N medlemmer har skrevet den seneste uge». Kun Netværkets
              medlemmer; dommen er aktiveMedlemmer. Ingen når ingen har skrevet. */}
          {aktive.tekst && (
            <div className="mb-5 flex flex-wrap items-center gap-3" data-aktive-medlemmer={aktive.antal}>
              <ul className="flex -space-x-2">
                {aktive.medlemmer.map((m) => (
                  <li key={m.userId}>
                    <Link to={`/medlemmer/${m.userId}`} className="block rounded-full ring-2 ring-hb-paper">
                      <HbAvatar navn={m.navn} avatarUrl={m.avatarUrl} stoerrelse="sm" />
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-hb-ink-soft">{aktive.tekst}</p>
            </div>
          )}
          <FremhaevetOpslag traad={forsideOpslag.fremhaevet} />
          <ul className={cn(forsideOpslag.resten.length > 0 && "mt-8")}>
            {forsideOpslag.resten.map((traad) => (
              <li key={traad.id} className="border-t border-hb-line last:border-b">
                <Link
                  to={`/community/${traad.id}`}
                  className="flex items-center gap-5 py-4 transition-colors hover:bg-hb-sage/20"
                >
                  <HbAvatar navn={traad.forfatter_navn} avatarUrl={traad.forfatter_avatar_url} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-hb-ink-soft">{traad.forfatter_navn ?? "Medlem"}</p>
                    <p className="mt-1 truncate font-editorial text-lg font-medium leading-snug text-hb-ink">
                      {traad.titel}
                    </p>
                    <p className="mt-1 text-sm text-hb-ink-soft">
                      {traad.antal_svar} svar · {traadRelativTid(traad.seneste_aktivitet_at)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </HbSection>
      )}

    </div>
  );
};
