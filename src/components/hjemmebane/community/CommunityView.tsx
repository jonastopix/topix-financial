import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCommunityGaest } from "@/hooks/communityAdgang";
import { GAEST_LAESER_TEKST, visComposer, visGaestGraense } from "@/lib/hjemmebane/communityAdgang";
import { useViewMode } from "@/hooks/useViewMode";
import { TJEKLISTE_QUERY_KEY } from "@/hooks/useOnboardingTjekliste";
import { cn } from "@/lib/utils";
import {
  hentFeed,
  markerSpoergsmaal,
  notificerNaevnelser,
  notificerNytOpslag,
  opretTraad,
  saetReaktion,
  type CommunityTraad,
} from "@/lib/hjemmebane/communityApi";
import { useNetvaerketsRaekker } from "@/hooks/netvaerketsRaekker";
import {
  FILTER_ALLE_LABEL,
  MARKER_HJAELP,
  MARKER_LABEL,
  MARKERING_FEJL_TITEL,
  UBESVAREDE_TOM,
  UBESVARET_MAERKE,
  delFeed,
  erUbesvaret,
  filtrerStroem,
  raadgiverIdsAf,
  taelUbesvarede,
  ubesvaredeChipTekst,
  type FeedFilter,
} from "@/lib/hjemmebane/communitySpoergsmaal";
import {
  KILDE_PRAESENTATION,
  KILDE_PRAESENTATION_LABEL,
  PRAESENTATION_PARAM,
  PRAESENTATION_PLADSHOLDER,
} from "@/lib/hjemmebane/praesentation";
import { CommunityComposer } from "./CommunityComposer";
import { CommunityMedlemmer } from "./CommunityMedlemmer";
import { HvemKanHjaelpe } from "./HvemKanHjaelpe";
import { LikeKnap } from "./LikeKnap";
import { SpoergsmaalKort } from "./SpoergsmaalKort";
import { HbSection } from "../HbSection";
import { hentetilstand, sektionsfejlTekst } from "@/lib/hjemmebane/hentefejl";
import { HbTag } from "../HbTag";

/** Fællesskabets feed (/community) — læsning + SKRIVE-leddet: composer
    øverst til nye tråde. Række-udtrykket spejler EventsView: rammeløse
    hb-line-rækker, ikke HbCard; hele rækken er et link til tråden.

    TO SPOR (3/9): feedet og medlemmerne (CommunityMedlemmer) står side
    om side fra lg — sidebar i fladens EGET indhold, ikke i skallen og
    ikke i HbSection (begge urørte). Ingen anden Hb-medlemsflade har et
    sidespor (målt: NoegletalView/RapporteringView bruger kun kort-grids;
    det eneste tokolonne-layout er skallens sidebar/indhold), så formen
    er skallens egen: fast bredde til sporet, minmax(0,1fr) til feedet,
    så lange titler ikke kan skubbe sporet ud. Under lg stables sporet
    UNDER feedet — feedet med composeren er fladens ærinde på en telefon,
    medlemmerne kommer efter.

    PRÆSENTATIONEN (11/9, kort 60; uden foreslået tekst 16/9): /community?praesentation=1
    (tjeklistens punkt) åbner composeren TOM — ingen titel på forhånd, ingen
    afsnit fra profilen, ingen eksempler (Jonas 16/9: «De skal præsentere sig
    som de har lyst til. Det gør det mere personligt.»). Det eneste fladen
    siger er pladsholderen PRAESENTATION_PLADSHOLDER (praesentation.ts), og
    profilen hverken læses eller skrives her. Parameteren ryddes straks
    (replace) og latches i praesentationAnmodet, som ALENE bærer vejen: key
    (composeren læser placeholder kun ved oprettelse, derfor remount), placeholder
    og kildeType 'praesentation' (CHECK'en i 20260911120000). Composeren vises
    så snart feedet og brugeren er indlæst — der er intet udkast at vente på.
    Efter en vellykket deling nulstilles praesentationAnmodet og titlen, så
    næste opslag går som ethvert andet; tjeklisten invalideres, så punktet
    krydser af med det samme.
    HISTORIK: 11/9-16/9 formiddag hentede fladen profilen (getMyMemberProfile,
    companies.description) og forudfyldte titel og brødtekst med
    byggPraesentationsSkabelon — slettet med Jonas' beslutning 16/9.

    RÅDGIVERNES «SPØRGSMÅL», FILTRET «UBESVAREDE» OG «HVEM KAN HJÆLPE» (2/10,
    Jonas 07:26: ingen ugentlig pligt — rådgiveren markerer et opslag, og det
    lægger sig øverst; medlemmernes opslag må ikke drukne). Dommene bor i
    lib/hjemmebane/communitySpoergsmaal (delFeed, erUbesvaret, filtrerStroem)
    og lib/hjemmebane/communityHjaelpere — fladen filtrerer aldrig selv.
    Feedet deles i ÉT spørgsmål øverst (SpoergsmaalKort, foldet til én linje
    for den, der har svaret) og strømmen, som er feedets egen orden uden
    spørgsmålet; chips «Alle / Ubesvarede (N)» filtrerer strømmen. Hvem der
    er rådgiver (til «ubesvaret»), læses af Netværkets rækker — samme
    query-nøgle som medlemssporet ("member-directory"), intet nyt kald — og
    «Hvem kan hjælpe med …» tegnes af de samme rækker under feedet.
    Markér-feltet under composeren og «Fjern markeringen» på kortet ses KUN af
    rådgivere, der ikke ser som medlem (kanMarkere = isAdvisor &&
    !viewingAsMember); databasen håndhæver det uanset (migration
    20261002243000). Opslaget deles FØRST, markeringen sættes BAGEFTER: fejler
    markeringen (fx før migrationen er kørt), er opslaget delt, og det siges i
    en toast — aldrig som et mislykket opslag. Intet andet fastgøres. */

/** Relativ tid på seneste aktivitet — samme ånd som EventsViews
    eventCountdown, blot bagud: "I dag", "I går", "For N dage siden". */
const relativTid = (iso: string): string => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "I dag";
  if (days === 1) return "I går";
  return `For ${days} dage siden`;
};

/** Dansk ental/flertal til metalinjens tællere. */
const taeller = (n: number, ental: string, flertal: string): string =>
  `${n} ${n === 1 ? ental : flertal}`;

const kildeLabel = (kildeType: CommunityTraad["kilde_type"]): string | null =>
  kildeType === "content_item"
    ? "Fra ugens push"
    : kildeType === "event"
      ? "Fra en live session"
      : kildeType === KILDE_PRAESENTATION
        ? KILDE_PRAESENTATION_LABEL
        : null;

/** Forfatter-avatar efter ParticipantAvatar-formen (EventDetailView):
    samme ramme, samme sage-fallback med initial når avatar_url er null. */
const ForfatterAvatar = ({ navn, avatarUrl }: { navn: string | null; avatarUrl: string | null }) =>
  avatarUrl ? (
    <img
      src={avatarUrl}
      alt={navn ?? "Medlem"}
      className="h-9 w-9 shrink-0 rounded-full border border-hb-line object-cover"
    />
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 font-editorial text-sm text-hb-ink-soft">
      {(navn ?? "?").charAt(0)}
    </span>
  );

/** Skeleton-rækken — EventsViews RowSkeleton-mønster i feed-form. */
const RowSkeleton = () => (
  <li className="flex items-center gap-5 border-t border-hb-line py-4 last:border-b" aria-hidden>
    <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-hb-line/40" />
    <div className="min-w-0 flex-1">
      <div className="h-4 w-2/5 animate-pulse rounded bg-hb-line/60" />
      <div className="mt-2 h-3 w-1/4 animate-pulse rounded bg-hb-line/40" />
    </div>
  </li>
);

/** Feedrækken. FØR 14/9 var hele rækken ét <Link>; et like-klik ville så
    navigere, og en <button> inde i et <a> er ugyldig DOM. NU: rækken er
    et <li class="relative">, linket sidder på TITLEN og strækkes ud over
    hele rækken med et ::after-lag (after:absolute after:inset-0) — så
    hele rækken stadig åbner tråden, som før. Like-knappen står som
    søskende til linket med relative z-10, altså OVER det strakte lag: et
    klik på hjertet rammer knappen, ikke linket. Hover-fladen ligger på
    <li>, så den følger hele rækken som før. */
const TraadRaekke = ({
  traad,
  ubesvaret,
  reagerer,
  onLike,
}: {
  traad: CommunityTraad;
  /** 2/10: et medlems opslag uden svar — mærket «ubesvaret» i metalinjen (dommen i communitySpoergsmaal.ts). */
  ubesvaret: boolean;
  reagerer: boolean;
  onLike: () => void;
}) => {
  const kilde = kildeLabel(traad.kilde_type);
  /* En skjult tråd står kun i feedet for rådgivere (læse-RPC'erne,
     20260812180000). Markeringen er nødvendig, fordi rådgiveren ellers
     ikke kan se forskel på hvad medlemmerne ser og ikke ser. */
  const erSkjult = traad.status === "skjult";
  return (
    <li
      className={cn(
        "relative flex items-start gap-5 border-t border-hb-line py-4 transition-colors last:border-b hover:bg-hb-sage/20",
        erSkjult && "opacity-60",
      )}
      data-traad-id={traad.id}
    >
      <ForfatterAvatar navn={traad.forfatter_navn} avatarUrl={traad.forfatter_avatar_url} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-hb-ink-soft">{traad.forfatter_navn ?? "Medlem"}</p>
          {traad.fastgjort && <HbTag>Fastgjort</HbTag>}
          {kilde && <HbTag>{kilde}</HbTag>}
          {erSkjult && <HbTag>Skjult</HbTag>}
        </div>
        <p className="mt-1 truncate font-editorial text-lg font-medium leading-snug text-hb-ink">
          <Link
            to={`/community/${traad.id}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-hb-evergreen/60"
          >
            {traad.titel}
          </Link>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-hb-ink-soft">
          <span>
            {[
              ubesvaret ? UBESVARET_MAERKE : taeller(traad.antal_svar, "svar", "svar"),
              taeller(traad.antal_visninger, "visning", "visninger"),
              relativTid(traad.seneste_aktivitet_at),
            ].join(" · ")}
          </span>
          <span aria-hidden>·</span>
          {/* Tallet er RPC'ens antal_reaktioner; jeg_har_reageret fylder hjertet. */}
          <LikeKnap
            antal={traad.antal_reaktioner}
            harReageret={traad.jeg_har_reageret}
            disabled={reagerer}
            onClick={onLike}
            className="relative z-10 text-xs"
          />
        </p>
      </div>
    </li>
  );
};

export const CommunityView = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAdvisor } = useAuth();
  /* Markér-feltet og «Fjern markeringen» kun for en rådgiver, der IKKE ser
     som medlem (rådets fund 2/10): «se som medlem» skal vise det, medlemmet
     ser — og et medlem ser ingen knap. Databasen dømmer uanset. */
  const { viewingAsMember } = useViewMode();
  const kanMarkere = isAdvisor && !viewingAsMember;
  /* Gæsten (2/10, Jonas 14/9: læser, skriver ikke): null mens dommen hentes, true = gæst — ingen composer,
     ingen like, grænsen vises; false = som i dag. Hooken kaster aldrig (lib/hjemmebane/communityAdgang.ts). */
  const gaest = useCommunityGaest();
  const [searchParams, setSearchParams] = useSearchParams();
  const [titel, setTitel] = useState("");
  /* 2/10: rådgiverens «Markér som Spørgsmål» i composeren og chip-filtret.
     Begge er fladens egen tilstand — intet i URL'en, intet i localStorage. */
  const [markerSomSpoergsmaal, setMarkerSomSpoergsmaal] = useState(false);
  const [filter, setFilter] = useState<FeedFilter>("alle");

  /* PRÆSENTATIONEN (se filhovedet). Anmodningen latches i state, fordi
     parameteren ryddes i samme effekt. Intet andet hentes for vejens skyld. */
  const [praesentationAnmodet, setPraesentationAnmodet] = useState(false);

  useEffect(() => {
    if (searchParams.get(PRAESENTATION_PARAM) !== "1") return;
    setPraesentationAnmodet(true);
    const naeste = new URLSearchParams(searchParams);
    naeste.delete(PRAESENTATION_PARAM);
    setSearchParams(naeste, { replace: true });
  }, [searchParams, setSearchParams]);

  const feedQuery = useQuery({
    queryKey: ["community", "feed"],
    queryFn: () => hentFeed(30),
  });

  /* Netværkets rækker (hooks/netvaerketsRaekker) — samme nøgle og staleTime
     som CommunityMedlemmer, så cachen deles: is_advisor giver «ubesvaret»-
     dommen sine rådgivere, og ask_me_about giver «Hvem kan hjælpe med …» sine
     kort. Fail-soft begge steder (communitySpoergsmaal.ts regel 3;
     HvemKanHjaelpe tegner intet uden data). Ikke en import af memberProfile:
     praesentationPladsholder.guard dom 3 (profilen læses aldrig her). */
  const directoryQuery = useNetvaerketsRaekker();

  /* Markeringen (2/10) — begge retninger. Feedet hentes igen; trådsiden
     deler ikke nøglen, men henter selv ved besøg. Fejlen siges som den er
     (RPC'ens besked — også «findes ikke» før migrationen). */
  const markerMutation = useMutation({
    mutationFn: (args: { traadId: string; markeret: boolean }) => markerSpoergsmaal(args.traadId, args.markeret),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community", "feed"] });
    },
    onError: (fejl: Error) => {
      toast.error("Markeringen blev ikke ændret", { description: fejl.message });
    },
  });

  /* Like fra feedet (14/9) — samme form som trådsidens reaktionMutation
     (CommunityTraadView.tsx): saetReaktion er en toggle i databasen,
     feedet hentes igen (tallet er altid databasens — ingen optimistisk
     UI), og en fejl siges med toast. Ingen notifikation: beskeden til den
     der bliver liket er sin egen opgave (Jonas 14/9). */
  const reaktionMutation = useMutation({
    mutationFn: (traadId: string) => saetReaktion({ traadId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community", "feed"] });
    },
    onError: (fejl: Error) => {
      toast.error("Reaktionen blev ikke gemt", { description: fejl.message });
    },
  });

  const opretMutation = useMutation({
    /* Nævnelses-notifikationen kaldes i mutationFn (samme placering og
       begrundelse som notificerSvar på trådsiden): koblingen til det
       netop oprettede id er direkte, og notificerNaevnelser kaster
       aldrig, så den kan ikke vælte mutationen. */
    mutationFn: async (args: {
      titel: string;
      indholdJson: unknown;
      kildeType?: typeof KILDE_PRAESENTATION;
      somSpoergsmaal?: boolean;
    }) => {
      const nytId = await opretTraad({
        titel: args.titel,
        indhold: "",
        indholdJson: args.indholdJson,
        kildeType: args.kildeType,
      });
      // Rådgiverens markering (2/10) — EFTER opslaget er gemt, og aldrig en
      // kastet fejl: opslaget ER delt. Fejler markeringen (RPC'en afviser,
      // eller migrationen er ikke kørt), siges det i sin egen toast.
      if (args.somSpoergsmaal === true) {
        try {
          await markerSpoergsmaal(nytId, true);
        } catch (fejl) {
          toast.error(MARKERING_FEJL_TITEL, { description: fejl instanceof Error ? fejl.message : String(fejl) });
        }
      }
      await notificerNaevnelser({ traadId: nytId });
      // Opslagsmailen (3/9): alle øvrige med community-adgang. Samme
      // placering og samme garanti — kaster aldrig, kan ikke vælte opslaget.
      await notificerNytOpslag(nytId);
      return nytId;
    },
    onSuccess: (nytId, args) => {
      queryClient.invalidateQueries({ queryKey: ["community", "feed"] });
      // Præsentationen krydser tjeklistens punkt af — uden invalidering
      // stod cachen (staleTime 60 s) med det gamle svar i op til et minut.
      if (args.kildeType === KILDE_PRAESENTATION) {
        queryClient.invalidateQueries({ queryKey: [TJEKLISTE_QUERY_KEY] });
        // Præsentationsvejen er brugt: næste opslag herfra er et almindeligt
        // opslag og må ikke også få kilde_type 'praesentation'.
        setPraesentationAnmodet(false);
        setTitel("");
      }
      setMarkerSomSpoergsmaal(false);
      navigate(`/community/${nytId}`);
    },
    /* Composeren sluger bevidst fejl (den beholder blot medlemmets tekst),
       så fejlvisningen ejes HER — uden denne toast ville et mislykket
       opslag se ud som om intet skete. */
    onError: (fejl: Error) => {
      toast.error("Opslaget blev ikke delt", { description: fejl.message });
    },
  });

  const traade = feedQuery.data ?? [];
  // Tom mod fejlet (de nitten, 10/9): «ikke skrevet noget endnu» er en
  // tilstand; «fællesskabet kunne ikke hentes» er en fejl. Før viste et
  // fejlet feed den tomme sætning. hentFeed kaster (throwIfError), så
  // Sentry får fejlen af QueryCache.onError — her læses kun dommen.
  const feedTilstand = hentetilstand(feedQuery, traade.length === 0);

  /* 2/10: spørgsmålet ud af strømmen, strømmen gennem filtret. Dommene i
     communitySpoergsmaal.ts; «tom» ovenfor er stadig HELE feedets tomhed —
     et tomt filter er sin egen sætning nedenfor. */
  const raadgiverIds = raadgiverIdsAf(directoryQuery.data);
  const delt = delFeed(traade, user?.id);
  const antalUbesvarede = taelUbesvarede(delt.stroem, raadgiverIds);
  const viste = filtrerStroem(delt.stroem, filter, raadgiverIds);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_288px] lg:items-start lg:gap-12">
      <div className="min-w-0">
      {/* Spørgsmålet ØVERST — før composeren, før strømmen (mockuppen 2/10).
          Kun når feedet er hentet; fail-soft før migrationen (ingen markering
          i svaret → intet kort). */}
      {feedTilstand === "data" && delt.spoergsmaal && (
        <SpoergsmaalKort
          traad={delt.spoergsmaal}
          foldet={delt.foldet}
          onFjern={kanMarkere ? () => markerMutation.mutate({ traadId: delt.spoergsmaal!.id, markeret: false }) : undefined}
          fjerner={markerMutation.isPending}
        />
      )}
      <HbSection eyebrow="Fællesskab" hairline className="min-w-0">
        {/* Composeren vises først når feedet er færdigindlæst, så den ikke
            hopper ind over skeleton-rækkerne — OG først når brugeren er
            indlæst: den må ikke montere med et tomt brugerId, for så ville
            en billed-upload lande på en ulovlig sti, som motoren bagefter
            kasserer. */}
        {!feedQuery.isLoading && user && visComposer(gaest) && (
          <div className="mb-8">
            <CommunityComposer
              key={praesentationAnmodet ? "praesentation" : "nyt"}
              visTitel
              brugerId={user.id}
              titel={titel}
              onTitelChange={setTitel}
              submitLabel="Del"
              /* Pladsholderen (Jonas 16/9) — KUN på præsentationsvejen, som
                 composerens eksisterende placeholder-prop; undefined =
                 composerens default for alle andre opslag. Ikke indhold, og
                 intet startIndhold: composeren starter tom. */
              placeholder={praesentationAnmodet ? PRAESENTATION_PLADSHOLDER : undefined}
              onSubmit={(indholdJson) =>
                opretMutation
                  .mutateAsync({
                    titel,
                    indholdJson,
                    kildeType: praesentationAnmodet ? KILDE_PRAESENTATION : undefined,
                    somSpoergsmaal: kanMarkere && markerSomSpoergsmaal,
                  })
                  .then(() => undefined)
              }
            />
            {/* Rådgiverens markering (2/10) — uden for composeren, som er
                delt med svar og redigering. Kun rådgivere ser feltet;
                databasen afviser alle andre uanset. */}
            {kanMarkere && (
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-hb-ink">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-hb-evergreen"
                  checked={markerSomSpoergsmaal}
                  onChange={(e) => setMarkerSomSpoergsmaal(e.target.checked)}
                  data-marker-spoergsmaal
                />
                <span>
                  <span className="font-medium">{MARKER_LABEL}</span>
                  <span className="block text-xs text-hb-ink-soft">{MARKER_HJAELP}</span>
                </span>
              </label>
            )}
          </div>
        )}

        {/* Filtret (2/10): «Alle» og «Ubesvarede (N)» — kun når der er noget at
            filtrere. Tallet er dommens (taelUbesvarede), aldrig fladens. */}
        {feedTilstand === "data" && (
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrér opslag">
            {(
              [
                ["alle", FILTER_ALLE_LABEL],
                ["ubesvarede", ubesvaredeChipTekst(antalUbesvarede)],
              ] as const
            ).map(([noegle, label]) => (
              <button
                key={noegle}
                type="button"
                aria-pressed={filter === noegle}
                onClick={() => setFilter(noegle)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filter === noegle
                    ? "border-hb-ink bg-hb-ink text-white"
                    : "border-hb-line text-hb-ink-soft hover:bg-hb-sage/30",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Gæstens grænse — i stedet for composeren, aldrig som en fejl (w13). */}
        {!feedQuery.isLoading && visGaestGraense(gaest) && (
          <p className="mb-8 text-sm text-hb-ink-soft" data-gaest-graense>{GAEST_LAESER_TEKST}</p>
        )}

        {feedTilstand === "henter" ? (
          <ul className="list-none">
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </ul>
        ) : feedTilstand === "fejlet" ? (
          <p className="text-sm text-hb-ink-soft">{sektionsfejlTekst("community")} Prøv igen om lidt.</p>
        ) : feedTilstand === "tom" ? (
          <p className="text-sm text-hb-ink-soft">Der er ikke skrevet noget endnu. Om lidt er der.</p>
        ) : viste.length === 0 ? (
          <p className="text-sm text-hb-ink-soft">
            {filter === "ubesvarede"
              ? UBESVAREDE_TOM
              : "Ingen andre opslag endnu."}
          </p>
        ) : (
          <ul className="list-none">
            {viste.map((traad) => (
              <TraadRaekke
                key={traad.id}
                traad={traad}
                ubesvaret={erUbesvaret(traad, raadgiverIds)}
                reagerer={reaktionMutation.isPending || !visComposer(gaest)}
                onLike={() => reaktionMutation.mutate(traad.id)}
              />
            ))}
          </ul>
        )}
      </HbSection>

      <HvemKanHjaelpe profiler={directoryQuery.data} mitUserId={user?.id} nu={new Date()} />
      </div>

      <div className="mt-14 lg:mt-0">
        <CommunityMedlemmer mitUserId={user?.id} />
      </div>
    </div>
  );
};
