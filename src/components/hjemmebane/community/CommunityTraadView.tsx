import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, Heart } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  hentSvar,
  hentTraad,
  opretSvar,
  registrerVisning,
  saetReaktion,
  type CommunitySvar,
} from "@/lib/hjemmebane/communityApi";
import { CommunityComposer } from "./CommunityComposer";
import { CommunityDokument } from "./CommunityDokument";

/** Trådsiden (/community/:id) — læsning + svar og reaktioner.
    Ikke-fundet håndteres blødt (EventDetailView-mønstret: venlig tekst +
    tilbage-link, ingen throw) — og tom kan også betyde "ingen adgang";
    de to kan bevidst ikke skelnes (jf. communityApi.hentTraad). */

const BackLink = () => (
  <Link
    to="/community"
    className="inline-flex items-center gap-1.5 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
  >
    <ArrowLeft className="h-4 w-4" /> Tilbage til fællesskabet
  </Link>
);

const fmtDato = (iso: string): string =>
  new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });

/** Samme avatar-form som feedet (ParticipantAvatar-mønstret). */
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

/** Like-knappen — tekstuel handling i evergreen som fladens øvrige
    handlinger; fyldt hjerte når jeg_har_reageret. INGEN optimistisk UI:
    medlems-præcedensen er invalidering (EventRegisterAction), så tallet
    er altid databasens, aldrig klientens gæt. */
const LikeKnap = ({
  antal,
  harReageret,
  disabled,
  onClick,
}: {
  antal: number;
  harReageret: boolean;
  disabled: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={cn(
      "inline-flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50",
      harReageret ? "text-hb-evergreen" : "text-hb-ink-soft hover:text-hb-ink",
    )}
    aria-pressed={harReageret}
    title={harReageret ? "Fjern reaktion" : "Synes godt om"}
  >
    <Heart className={cn("h-4 w-4", harReageret && "fill-hb-evergreen")} />
    {antal}
  </button>
);

const SvarRaekke = ({
  svar,
  reagerer,
  onLike,
}: {
  svar: CommunitySvar;
  reagerer: boolean;
  onLike: () => void;
}) => (
  <li className="flex items-start gap-4 border-t border-hb-line py-5 last:border-b">
    <ForfatterAvatar navn={svar.forfatter_navn} avatarUrl={svar.forfatter_avatar_url} />
    <div className="min-w-0 flex-1">
      <p className="text-sm text-hb-ink">
        <span className="font-medium">{svar.forfatter_navn ?? "Medlem"}</span>
        <span className="text-hb-ink-soft"> · {fmtDato(svar.created_at)}</span>
      </p>
      {/* Struktureret rendering når indhold_json findes; ren tekst som
          fallback. Fallback'en er nødvendig indtil læse-RPC'erne leverer
          indhold_json — i dag gør de ikke, så eksisterende svar rendres
          som hidtil. */}
      {svar.indhold_json != null ? (
        <div className="mt-2">
          <CommunityDokument doc={svar.indhold_json} />
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-hb-ink">
          {svar.indhold}
        </p>
      )}
      <div className="mt-2">
        <LikeKnap
          antal={svar.antal_reaktioner}
          harReageret={svar.jeg_har_reageret}
          disabled={reagerer}
          onClick={onLike}
        />
      </div>
    </div>
  </li>
);

export const CommunityTraadView = ({ traadId }: { traadId: string }) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const traadQuery = useQuery({
    queryKey: ["community", "traad", traadId],
    queryFn: () => hentTraad(traadId),
  });
  const svarQuery = useQuery({
    queryKey: ["community", "svar", traadId],
    queryFn: () => hentSvar(traadId),
  });

  // En visning er en bivirkning af at kigge, ikke en handling — fejl fra
  // registreringen må ALDRIG nå brugeren (RPC'en er selv stille ved
  // manglende adgang; her sluges også netværksfejl).
  useEffect(() => {
    if (traadId) registrerVisning(traadId).catch(() => {});
  }, [traadId]);

  /* Svar og reaktioner rører både svarlisten, trådens tællere
     (antal_svar/antal_reaktioner står på tråden) og feedets metalinje —
     derfor invalideres alle tre nøgler samlet. */
  const invaliderTraadOgFeed = () => {
    queryClient.invalidateQueries({ queryKey: ["community", "svar", traadId] });
    queryClient.invalidateQueries({ queryKey: ["community", "traad", traadId] });
    queryClient.invalidateQueries({ queryKey: ["community", "feed"] });
  };

  const svarMutation = useMutation({
    mutationFn: (indholdJson: unknown) => opretSvar(traadId, "", indholdJson),
    onSuccess: invaliderTraadOgFeed,
    /* Composeren sluger bevidst fejl (den beholder blot medlemmets tekst),
       så fejlvisningen ejes HER — uden toasten ville et mislykket svar se
       ud som om intet skete. */
    onError: (fejl: Error) => {
      toast.error("Svaret blev ikke sendt", { description: fejl.message });
    },
  });

  const reaktionMutation = useMutation({
    mutationFn: (maal: { traadId: string } | { svarId: string }) => saetReaktion(maal),
    onSuccess: invaliderTraadOgFeed,
    onError: (fejl: Error) => {
      toast.error("Reaktionen blev ikke gemt", { description: fejl.message });
    },
  });

  // Betingede returns EFTER samtlige hooks (React #310-reglen).
  if (traadQuery.isLoading) {
    return (
      <div>
        <BackLink />
        <div className="mt-8 h-6 w-1/2 animate-pulse rounded bg-hb-line/60" />
        <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-hb-line/40" />
        <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-hb-line/40" />
      </div>
    );
  }

  const traad = traadQuery.data;
  if (!traad) {
    return (
      <div>
        <BackLink />
        <p className="mt-8 text-sm text-hb-ink-soft">
          Tråden findes ikke — eller den er ikke længere åben.
        </p>
      </div>
    );
  }

  const svar = svarQuery.data ?? [];

  return (
    <div>
      <BackLink />

      <article className="mt-8">
        <div className="flex items-center gap-4">
          <ForfatterAvatar navn={traad.forfatter_navn} avatarUrl={traad.forfatter_avatar_url} />
          <p className="text-sm text-hb-ink">
            <span className="font-medium">{traad.forfatter_navn ?? "Medlem"}</span>
            <span className="text-hb-ink-soft"> · {fmtDato(traad.created_at)}</span>
          </p>
        </div>
        <h1 className="mt-4 font-editorial text-2xl font-medium leading-tight text-hb-ink md:text-3xl">
          {traad.titel}
        </h1>
        {/* Struktureret rendering når indhold_json findes; ren tekst som
            fallback. Fallback'en er nødvendig indtil læse-RPC'erne leverer
            indhold_json — i dag gør de ikke, så eksisterende tråde rendres
            som hidtil. dangerouslySetInnerHTML bruges fortsat bevidst ikke. */}
        {traad.indhold_json != null ? (
          <div className="mt-4">
            <CommunityDokument doc={traad.indhold_json} />
          </div>
        ) : (
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-hb-ink">
            {traad.indhold}
          </p>
        )}
        <div className="mt-4">
          <LikeKnap
            antal={traad.antal_reaktioner}
            harReageret={traad.jeg_har_reageret}
            disabled={reaktionMutation.isPending}
            onClick={() => reaktionMutation.mutate({ traadId })}
          />
        </div>
      </article>

      <section className="mt-10">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Svar</p>
        {svarQuery.isLoading ? (
          <div className="mt-4 h-4 w-1/3 animate-pulse rounded bg-hb-line/40" />
        ) : svar.length === 0 ? (
          <p className="mt-4 text-sm text-hb-ink-soft">Ingen svar endnu.</p>
        ) : (
          <ul className="mt-4 list-none">
            {svar.map((s) => (
              <SvarRaekke
                key={s.id}
                svar={s}
                reagerer={reaktionMutation.isPending}
                onLike={() => reaktionMutation.mutate({ svarId: s.id })}
              />
            ))}
          </ul>
        )}

        {/* Composeren vises først når brugeren er indlæst — den må ikke
            montere med et tomt brugerId, for så ville en billed-upload
            lande på en ulovlig sti, som motoren bagefter kasserer. */}
        {user && (
          <div className="mt-8">
            <CommunityComposer
              visTitel={false}
              brugerId={user.id}
              submitLabel="Svar"
              placeholder="Skriv et svar"
              onSubmit={(indholdJson) =>
                svarMutation.mutateAsync(indholdJson).then(() => undefined)
              }
            />
          </div>
        )}
      </section>
    </div>
  );
};
