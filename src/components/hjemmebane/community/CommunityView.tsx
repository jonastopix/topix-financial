import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TJEKLISTE_QUERY_KEY } from "@/hooks/useOnboardingTjekliste";
import { cn } from "@/lib/utils";
import {
  hentFeed,
  notificerNaevnelser,
  notificerNytOpslag,
  opretTraad,
  type CommunityTraad,
} from "@/lib/hjemmebane/communityApi";
import { getMyMemberProfile } from "@/lib/hjemmebane/memberProfile";
import {
  byggPraesentationsSkabelon,
  KILDE_PRAESENTATION,
  KILDE_PRAESENTATION_LABEL,
  PRAESENTATION_PARAM,
  type PraesentationsSkabelon,
} from "@/lib/hjemmebane/praesentation";
import { CommunityComposer } from "./CommunityComposer";
import { CommunityMedlemmer } from "./CommunityMedlemmer";
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

    PRÆSENTATIONEN (11/9, kort 60): /community?praesentation=1 (tjeklistens
    punkt) åbner composeren forudfyldt med byggPraesentationsSkabelon —
    titlen «Hej, jeg er {navn} fra {virksomhed}» og de tre profilspørgsmål
    med svarene fra profilen (companies.description, member_profiles).
    Parameteren ryddes straks (replace), så en reload eller «tilbage» ikke
    bygger udkastet igen. Composeren læser startIndhold KUN ved oprettelse,
    derfor remountes den med key når udkastet er klar — og vises ikke før,
    så et tomt felt ikke blinker op først. Indsendes med kildeType
    'praesentation' (CHECK'en i 20260911120000); alle andre opslag går som
    før, og profilen skrives aldrig tilbage. Efter succes invalideres
    tjeklisten, så punktet krydser af med det samme. */

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

const TraadRaekke = ({ traad }: { traad: CommunityTraad }) => {
  const kilde = kildeLabel(traad.kilde_type);
  /* En skjult tråd står kun i feedet for rådgivere (læse-RPC'erne,
     20260812180000). Markeringen er nødvendig, fordi rådgiveren ellers
     ikke kan se forskel på hvad medlemmerne ser og ikke ser. */
  const erSkjult = traad.status === "skjult";
  return (
    <li>
      <Link
        to={`/community/${traad.id}`}
        className={cn(
          "flex items-start gap-5 border-t border-hb-line py-4 transition-colors last:border-b hover:bg-hb-sage/20",
          erSkjult && "opacity-60",
        )}
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
            {traad.titel}
          </p>
          <p className="mt-1 text-xs text-hb-ink-soft">
            {[
              taeller(traad.antal_svar, "svar", "svar"),
              taeller(traad.antal_visninger, "visning", "visninger"),
              taeller(traad.antal_reaktioner, "reaktion", "reaktioner"),
              relativTid(traad.seneste_aktivitet_at),
            ].join(" · ")}
          </p>
        </div>
      </Link>
    </li>
  );
};

export const CommunityView = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile, companyId, companyName } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [titel, setTitel] = useState("");

  /* PRÆSENTATIONEN (se filhovedet). Anmodningen latches i state, fordi
     parameteren ryddes i samme effekt — og udkastet sættes én gang. */
  const [praesentationAnmodet, setPraesentationAnmodet] = useState(false);
  const [udkast, setUdkast] = useState<PraesentationsSkabelon | null>(null);

  useEffect(() => {
    if (searchParams.get(PRAESENTATION_PARAM) !== "1") return;
    setPraesentationAnmodet(true);
    const naeste = new URLSearchParams(searchParams);
    naeste.delete(PRAESENTATION_PARAM);
    setSearchParams(naeste, { replace: true });
  }, [searchParams, setSearchParams]);

  // Profilens tre felter — læses, skrives aldrig. companies.description
  // via company-scoped RLS (som IndstillingerView:178), member_profiles
  // via self-only RLS (getMyMemberProfile). Fejl kaster (QueryCache.onError
  // → Sentry); fladen falder tilbage til en skabelon uden svar nedenfor.
  const udkastQuery = useQuery({
    queryKey: ["community", "praesentation-udkast", user?.id, companyId],
    enabled: praesentationAnmodet && Boolean(user) && udkast === null,
    queryFn: async () => {
      const [mp, virksomhed] = await Promise.all([
        getMyMemberProfile(user!.id),
        companyId ? supabase.from("companies").select("description").eq("id", companyId).maybeSingle() : Promise.resolve(null),
      ]);
      if (virksomhed?.error) throw new Error(virksomhed.error.message);
      return {
        detLaverVi: virksomhed?.data?.description ?? null,
        detHarJegVaeretIgennem: mp?.ask_me_about ?? null,
        detLederJegEfter: mp?.working_on ?? null,
      };
    },
  });

  useEffect(() => {
    if (udkast !== null || !praesentationAnmodet) return;
    if (!udkastQuery.data && !udkastQuery.isError) return;
    const felter = udkastQuery.data ?? { detLaverVi: null, detHarJegVaeretIgennem: null, detLederJegEfter: null };
    if (udkastQuery.isError) {
      toast.error("Vi kunne ikke hente din profil til udkastet", { description: "Skriv selv under de tre spørgsmål." });
    }
    const skabelon = byggPraesentationsSkabelon({ navn: profile?.full_name, virksomhed: companyName, ...felter });
    setUdkast(skabelon);
    setTitel(skabelon.titel);
  }, [udkast, praesentationAnmodet, udkastQuery.data, udkastQuery.isError, profile?.full_name, companyName]);

  const feedQuery = useQuery({
    queryKey: ["community", "feed"],
    queryFn: () => hentFeed(30),
  });

  const opretMutation = useMutation({
    /* Nævnelses-notifikationen kaldes i mutationFn (samme placering og
       begrundelse som notificerSvar på trådsiden): koblingen til det
       netop oprettede id er direkte, og notificerNaevnelser kaster
       aldrig, så den kan ikke vælte mutationen. */
    mutationFn: async (args: { titel: string; indholdJson: unknown; kildeType?: typeof KILDE_PRAESENTATION }) => {
      const nytId = await opretTraad({
        titel: args.titel,
        indhold: "",
        indholdJson: args.indholdJson,
        kildeType: args.kildeType,
      });
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
      }
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

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_288px] lg:items-start lg:gap-12">
      <HbSection eyebrow="Fællesskab" hairline className="min-w-0">
        {/* Composeren vises først når feedet er færdigindlæst, så den ikke
            hopper ind over skeleton-rækkerne — OG først når brugeren er
            indlæst: den må ikke montere med et tomt brugerId, for så ville
            en billed-upload lande på en ulovlig sti, som motoren bagefter
            kasserer. */}
        {!feedQuery.isLoading && user && !(praesentationAnmodet && udkast === null) && (
          <div className="mb-8">
            <CommunityComposer
              key={udkast ? "praesentation" : "nyt"}
              visTitel
              brugerId={user.id}
              titel={titel}
              onTitelChange={setTitel}
              submitLabel="Del"
              startIndhold={udkast?.indholdJson}
              onSubmit={(indholdJson) =>
                opretMutation
                  .mutateAsync({ titel, indholdJson, kildeType: udkast ? KILDE_PRAESENTATION : undefined })
                  .then(() => undefined)
              }
            />
          </div>
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
        ) : (
          <ul className="list-none">
            {traade.map((traad) => (
              <TraadRaekke key={traad.id} traad={traad} />
            ))}
          </ul>
        )}
      </HbSection>

      <div className="mt-14 lg:mt-0">
        <CommunityMedlemmer mitUserId={user?.id} />
      </div>
    </div>
  );
};
