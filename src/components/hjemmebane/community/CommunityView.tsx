import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  hentFeed,
  notificerNaevnelser,
  notificerNytOpslag,
  opretTraad,
  type CommunityTraad,
} from "@/lib/hjemmebane/communityApi";
import { CommunityComposer } from "./CommunityComposer";
import { HbSection } from "../HbSection";
import { HbTag } from "../HbTag";

/** Fællesskabets feed (/community) — læsning + SKRIVE-leddet: composer
    øverst til nye tråde. Række-udtrykket spejler EventsView: rammeløse
    hb-line-rækker, ikke HbCard; hele rækken er et link til tråden. */

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
  kildeType === "content_item" ? "Fra ugens push" : kildeType === "event" ? "Fra en live session" : null;

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
  const { user } = useAuth();
  const [titel, setTitel] = useState("");

  const feedQuery = useQuery({
    queryKey: ["community", "feed"],
    queryFn: () => hentFeed(30),
  });

  const opretMutation = useMutation({
    /* Nævnelses-notifikationen kaldes i mutationFn (samme placering og
       begrundelse som notificerSvar på trådsiden): koblingen til det
       netop oprettede id er direkte, og notificerNaevnelser kaster
       aldrig, så den kan ikke vælte mutationen. */
    mutationFn: async (args: { titel: string; indholdJson: unknown }) => {
      const nytId = await opretTraad({
        titel: args.titel,
        indhold: "",
        indholdJson: args.indholdJson,
      });
      await notificerNaevnelser({ traadId: nytId });
      // Opslagsmailen (3/9): alle øvrige med community-adgang. Samme
      // placering og samme garanti — kaster aldrig, kan ikke vælte opslaget.
      await notificerNytOpslag(nytId);
      return nytId;
    },
    onSuccess: (nytId) => {
      queryClient.invalidateQueries({ queryKey: ["community", "feed"] });
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

  return (
    <HbSection eyebrow="Fællesskab" hairline>
      {/* Composeren vises først når feedet er færdigindlæst, så den ikke
          hopper ind over skeleton-rækkerne — OG først når brugeren er
          indlæst: den må ikke montere med et tomt brugerId, for så ville
          en billed-upload lande på en ulovlig sti, som motoren bagefter
          kasserer. */}
      {!feedQuery.isLoading && user && (
        <div className="mb-8">
          <CommunityComposer
            visTitel
            brugerId={user.id}
            titel={titel}
            onTitelChange={setTitel}
            submitLabel="Del"
            onSubmit={(indholdJson) =>
              opretMutation.mutateAsync({ titel, indholdJson }).then(() => undefined)
            }
          />
        </div>
      )}

      {feedQuery.isLoading ? (
        <ul className="list-none">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </ul>
      ) : traade.length === 0 ? (
        <p className="text-sm text-hb-ink-soft">Der er ikke skrevet noget endnu. Om lidt er der.</p>
      ) : (
        <ul className="list-none">
          {traade.map((traad) => (
            <TraadRaekke key={traad.id} traad={traad} />
          ))}
        </ul>
      )}
    </HbSection>
  );
};
