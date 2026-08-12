import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  hentSvar,
  hentTraad,
  opretSvar,
  registrerVisning,
  retSvar,
  retTraad,
  saetReaktion,
  sletSvar,
  sletTraad,
  type CommunitySvar,
} from "@/lib/hjemmebane/communityApi";
import { CommunityComposer } from "./CommunityComposer";
import { CommunityDokument } from "./CommunityDokument";

/** Trådsiden (/community/:id) — læsning, svar, reaktioner og ret/slet af
    eget indhold (RPC'erne 20260812120000).
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

/** Diskrete tekst-handlinger (Rediger/Slet/Skjul) — samme dæmpede udtryk
    som like-knappen, så rækken læses som ét roligt handlings-spor. */
const TekstKnap = ({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="font-body text-sm text-hb-ink-soft transition-colors hover:text-hb-ink disabled:opacity-50"
  >
    {children}
  </button>
);

const SvarRaekke = ({
  svar,
  reagerer,
  onLike,
  erForfatter,
  redigerer,
  brugerId,
  onStartRediger,
  onAnnullerRediger,
  onGem,
  onSlet,
  sletter,
}: {
  svar: CommunitySvar;
  reagerer: boolean;
  onLike: () => void;
  erForfatter: boolean;
  redigerer: boolean;
  brugerId: string | null;
  onStartRediger: () => void;
  onAnnullerRediger: () => void;
  onGem: (indholdJson: unknown) => Promise<void>;
  onSlet: () => void;
  sletter: boolean;
}) => (
  <li className="flex items-start gap-4 border-t border-hb-line py-5 last:border-b">
    <ForfatterAvatar navn={svar.forfatter_navn} avatarUrl={svar.forfatter_avatar_url} />
    <div className="min-w-0 flex-1">
      <p className="text-sm text-hb-ink">
        <span className="font-medium">{svar.forfatter_navn ?? "Medlem"}</span>
        <span className="text-hb-ink-soft"> · {fmtDato(svar.created_at)}</span>
      </p>
      {redigerer && brugerId ? (
        <div className="mt-2">
          <CommunityComposer
            visTitel={false}
            brugerId={brugerId}
            startIndhold={svar.indhold_json ?? undefined}
            submitLabel="Gem"
            onAnnuller={onAnnullerRediger}
            onSubmit={onGem}
          />
        </div>
      ) : (
        <>
          {/* Struktureret rendering når indhold_json findes; ren tekst som
              fallback for indhold fra før JSON-leddet. */}
          {svar.indhold_json != null ? (
            <div className="mt-2">
              <CommunityDokument doc={svar.indhold_json} />
            </div>
          ) : (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-hb-ink">
              {svar.indhold}
            </p>
          )}
          <div className="mt-2 flex items-center gap-4">
            <LikeKnap
              antal={svar.antal_reaktioner}
              harReageret={svar.jeg_har_reageret}
              disabled={reagerer}
              onClick={onLike}
            />
            {erForfatter && (
              <>
                <TekstKnap onClick={onStartRediger}>Rediger</TekstKnap>
                <TekstKnap onClick={onSlet} disabled={sletter}>
                  Slet
                </TekstKnap>
              </>
            )}
          </div>
        </>
      )}
    </div>
  </li>
);

export const CommunityTraadView = ({ traadId }: { traadId: string }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [redigererTraad, setRedigererTraad] = useState(false);
  const [traadTitel, setTraadTitel] = useState("");
  const [redigererSvarId, setRedigererSvarId] = useState<string | null>(null);

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

  const retTraadMutation = useMutation({
    mutationFn: (args: { titel: string; indholdJson: unknown }) =>
      retTraad(traadId, args.titel, args.indholdJson),
    onSuccess: () => {
      invaliderTraadOgFeed();
      setRedigererTraad(false);
    },
    onError: (fejl: Error) => {
      toast.error("Ændringerne blev ikke gemt", { description: fejl.message });
    },
  });

  const retSvarMutation = useMutation({
    mutationFn: (args: { svarId: string; indholdJson: unknown }) =>
      retSvar(args.svarId, args.indholdJson),
    onSuccess: () => {
      invaliderTraadOgFeed();
      setRedigererSvarId(null);
    },
    onError: (fejl: Error) => {
      toast.error("Ændringerne blev ikke gemt", { description: fejl.message });
    },
  });

  const sletTraadMutation = useMutation({
    mutationFn: () => sletTraad(traadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community", "feed"] });
      navigate("/community");
    },
    onError: (fejl: Error) => {
      toast.error("Opslaget blev ikke slettet", { description: fejl.message });
    },
  });

  const sletSvarMutation = useMutation({
    mutationFn: (svarId: string) => sletSvar(svarId),
    onSuccess: invaliderTraadOgFeed,
    onError: (fejl: Error) => {
      toast.error("Svaret blev ikke slettet", { description: fejl.message });
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
  const erTraadForfatter = user !== null && user.id === traad.forfatter_id;

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

        {redigererTraad && user ? (
          <div className="mt-4">
            <CommunityComposer
              visTitel
              brugerId={user.id}
              titel={traadTitel}
              onTitelChange={setTraadTitel}
              startIndhold={traad.indhold_json ?? undefined}
              submitLabel="Gem"
              onAnnuller={() => setRedigererTraad(false)}
              onSubmit={(indholdJson) =>
                retTraadMutation.mutateAsync({ titel: traadTitel, indholdJson }).then(() => undefined)
              }
            />
          </div>
        ) : (
          <>
            <h1 className="mt-4 font-editorial text-2xl font-medium leading-tight text-hb-ink md:text-3xl">
              {traad.titel}
            </h1>
            {/* Struktureret rendering når indhold_json findes; ren tekst som
                fallback for indhold fra før JSON-leddet.
                dangerouslySetInnerHTML bruges fortsat bevidst ikke. */}
            {traad.indhold_json != null ? (
              <div className="mt-4">
                <CommunityDokument doc={traad.indhold_json} />
              </div>
            ) : (
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-hb-ink">
                {traad.indhold}
              </p>
            )}
            <div className="mt-4 flex items-center gap-4">
              <LikeKnap
                antal={traad.antal_reaktioner}
                harReageret={traad.jeg_har_reageret}
                disabled={reaktionMutation.isPending}
                onClick={() => reaktionMutation.mutate({ traadId })}
              />
              {erTraadForfatter && (
                <>
                  <TekstKnap
                    onClick={() => {
                      setTraadTitel(traad.titel);
                      setRedigererTraad(true);
                    }}
                  >
                    Rediger
                  </TekstKnap>
                  <TekstKnap
                    disabled={sletTraadMutation.isPending}
                    onClick={() => {
                      if (window.confirm("Slet dit opslag? Det kan ikke fortrydes.")) {
                        sletTraadMutation.mutate();
                      }
                    }}
                  >
                    Slet
                  </TekstKnap>
                </>
              )}
              {/* Ingen skjul-knap her endnu: skjul er en envejsdør, indtil
                  moderationsfladen findes. Læse-RPC'erne filtrerer på
                  status = 'aktiv' også for rådgivere, så en skjult tråd
                  forsvinder fra ENHVER flade — også rådgiverens egen — og
                  kan kun vises igen via SQL-editoren.
                  skjul_community_traad understøtter p_skjul = false, men
                  der er intet sted at trykke fortryd. Knappen kommer
                  tilbage sammen med en flade, hvor skjulte tråde kan ses
                  og genåbnes. */}
            </div>
          </>
        )}
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
                erForfatter={user !== null && user.id === s.forfatter_id}
                redigerer={redigererSvarId === s.id}
                brugerId={user?.id ?? null}
                onStartRediger={() => setRedigererSvarId(s.id)}
                onAnnullerRediger={() => setRedigererSvarId(null)}
                onGem={(indholdJson) =>
                  retSvarMutation.mutateAsync({ svarId: s.id, indholdJson }).then(() => undefined)
                }
                onSlet={() => {
                  if (window.confirm("Slet dit svar? Det kan ikke fortrydes.")) {
                    sletSvarMutation.mutate(s.id);
                  }
                }}
                sletter={sletSvarMutation.isPending}
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
