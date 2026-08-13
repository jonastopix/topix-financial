import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  cancelRegistration,
  declineEvent,
  getEvent,
  getMyEventResponse,
  getRecordingItem,
  listEventParticipants,
  registerForEvent,
  type EventParticipant,
} from "@/lib/hjemmebane/akademiApi";
import { eventMeetPhase } from "@/lib/hjemmebane/eventPhase";
import { HbButton, hbButtonVariants } from "../HbButton";
import { HbVideoEmbed } from "../akademi/HbVideoEmbed";

/** Events-miljøet, trin 3: eventsiden (/events/:id) med tilmelding og
    deltagerliste. Ikke-fundet håndteres blødt (ElementView-mønstret:
    venlig tekst + tilbage-link, ingen throw). Meet-knappen følger den
    DELTE fasedom (eventMeetPhase: live fra 15 min før start til
    sluttiden). Deltagerlisten viser ALDRIG tal (ingen tæller, ingen
    "X af Y") — et halvtomt event skal ikke ligne et halvtomt event. */

/** Samme art-ordbog som listefladen — lille nok til en lokal kopi. */
const kindLabel = (kind: string): string =>
  kind === "live_sparring" ? "Live sparring" : kind === "workshop" ? "Workshop" : "Event";

const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });

const BackLink = () => (
  <Link
    to="/events"
    className="inline-flex items-center gap-1.5 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
  >
    <ArrowLeft className="h-4 w-4" /> Tilbage til events
  </Link>
);

/** Avatar efter forsidens afsender-portræt (BoardroomView), blot i
    listestørrelse: samme ramme, samme sage-fallback med initial. */
const ParticipantAvatar = ({ participant }: { participant: EventParticipant }) =>
  participant.avatar_url ? (
    <img
      src={participant.avatar_url}
      alt={participant.full_name}
      className="h-9 w-9 shrink-0 rounded-full border border-hb-line object-cover"
    />
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 font-editorial text-sm text-hb-ink-soft">
      {participant.full_name.charAt(0)}
    </span>
  );

export const EventDetailView = ({ eventId }: { eventId: string }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const eventQuery = useQuery({
    queryKey: ["events", "detail", eventId],
    queryFn: () => getEvent(eventId),
    staleTime: 60_000,
  });

  const participantsQuery = useQuery({
    queryKey: ["event", eventId, "participants"],
    queryFn: () => listEventParticipants(eventId),
  });

  // Eget svar SEPARAT fra deltagerlisten: RPC'en filtrerer på aktivt
  // medlemskab OG attending, så både en gyldig tilmelding og et afbud
  // kan eksistere uden at brugeren står i listen — knappen må aldrig
  // aflæses af den.
  const responseQuery = useQuery({
    queryKey: ["event", eventId, "registration", user?.id],
    queryFn: () => getMyEventResponse(eventId, user!.id),
    enabled: !!user,
  });

  // Optagelsens item (B8): hentes KUN når koblingen er sat OG eventet er
  // afholdt — ingen fetch på kommende events. Query'en ligger FØR de
  // betingede returns (hook-rækkefølgen skal være stabil); enabled bærer
  // gatingen. RLS bærer adgangen: et upubliceret eller area-lukket item
  // giver null, og after-grenen falder tilbage til afholdt-linjen.
  const recordingId = eventQuery.data?.recording_item_id ?? null;
  const recordingQuery = useQuery({
    queryKey: ["event", eventId, "recording", recordingId],
    queryFn: () => getRecordingItem(recordingId!),
    enabled:
      !!recordingId && !!eventQuery.data && eventMeetPhase(eventQuery.data) === "after",
    staleTime: 60_000,
  });

  const invalidateRegistrationState = () => {
    queryClient.invalidateQueries({ queryKey: ["event", eventId, "participants"] });
    queryClient.invalidateQueries({ queryKey: ["event", eventId, "registration", user?.id] });
  };

  const registerMutation = useMutation({
    mutationFn: () => registerForEvent(eventId, user!.id),
    onSuccess: invalidateRegistrationState,
  });

  const declineMutation = useMutation({
    mutationFn: () => declineEvent(eventId, user!.id),
    onSuccess: invalidateRegistrationState,
  });

  // Afmelding OG fortryd-afbud er samme handling: cancelled_at sættes,
  // svaret er trukket tilbage.
  const resetMutation = useMutation({
    mutationFn: () => cancelRegistration(eventId, user!.id),
    onSuccess: invalidateRegistrationState,
  });

  if (eventQuery.isLoading) {
    return <p className="text-sm text-hb-ink-soft">Henter…</p>;
  }

  const event = eventQuery.data;
  if (!event) {
    return (
      <div>
        <BackLink />
        <p className="mt-8 text-sm text-hb-ink-soft">
          Eventet findes ikke (eller er ikke publiceret).
        </p>
      </div>
    );
  }

  const cancelled = event.status === "cancelled";
  const phase = eventMeetPhase(event);
  // Mens opslaget henter er recording null → after-grenen viser
  // afholdt-linjen (ingen spinner, ingen flimren).
  const recording = recordingQuery.data ?? null;
  const dateLine = new Date(event.starts_at).toLocaleDateString("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeSpan = event.ends_at
    ? `${fmtTime(event.starts_at)}–${fmtTime(event.ends_at)}`
    : fmtTime(event.starts_at);

  // Rådgivere sidst, ellers RPC'ens navnesortering (stabil sort bevarer den).
  const participants = [...(participantsQuery.data ?? [])].sort(
    (a, b) => Number(a.is_advisor) - Number(b.is_advisor),
  );
  const response = responseQuery.data ?? null;
  const mutating =
    registerMutation.isPending || declineMutation.isPending || resetMutation.isPending;

  // Tilmelding gælder kun fremtidige/igangværende events: aflyst → ingen
  // knap; afholdt (after) → ingen knap, men listen BLIVER — den er historik.
  const canRegister = !cancelled && phase !== "after" && user != null;

  return (
    <div>
      <BackLink />

      <section className="mt-6 max-w-3xl">
        {/* Aflyst: tydelig markering øverst — og INGEN Meet-knap
            uanset fase (gaten nedenfor tjekker cancelled først). */}
        {cancelled && (
          <p className="mb-4 inline-flex rounded-full border border-hb-rust/40 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-hb-rust">
            Aflyst
          </p>
        )}

        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
          Event · {kindLabel(event.kind)}
        </p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          {event.title}
        </h1>
        <p className="mt-3 text-sm text-hb-ink-soft">
          {dateLine} · {timeSpan}
          {event.meet_url ? " · Online" : ""}
        </p>

        {event.description && (
          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-hb-ink">
            {event.description}
          </p>
        )}

        {/* Meet-knappens tre tilstande (delt fasedom):
            before → rolig mødelink-linje · live → primær knap ·
            after → afholdt-linje (optagelsen selv er senere trin). */}
        {!cancelled && event.meet_url && phase === "before" && (
          <p className="mt-8 text-sm text-hb-ink-soft">
            Mødelink:{" "}
            <a
              href={event.meet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-hb-rust underline-offset-4 hover:underline"
            >
              Google Meet
            </a>
          </p>
        )}
        {/* <a> stylet m. den EKSPORTEREDE hbButtonVariants-cva — HbButton
            renderer et <button> (uden asChild), og en knap i et anker er
            ugyldig HTML; cva'en holder klasserne ét sted, ingen kopi. */}
        {!cancelled && event.meet_url && phase === "live" && (
          <a
            href={event.meet_url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(hbButtonVariants({ variant: "primary" }), "mt-8")}
          >
            Deltag nu
          </a>
        )}
        {/* Optagelsen (B8): events.recording_item_id har eksisteret siden
            20260804120000:298 og kunnet sættes i admin (EventEditor.tsx:247),
            men INGEN medlemsflade læste den — koblingen blev skrevet og
            aldrig vist. Det var det sidste der bandt platformen til Circle.
            Pladsen var reserveret her siden Events-GO ("optagelsen selv er
            senere trin", :175). Videoporten genbruges: HbVideoEmbed kører
            allerede uden for Akademiet på forsiden (BoardroomView.tsx:407)
            med no-op callbacks — en event-optagelse skal IKKE skrive
            Akademi-progression. storage håndteres ikke: get-video-embed
            dækker kun bunny (index.ts:71-72), og en storage-fil ville kræve
            en signeret URL fra content-assets-bucketen, som der ikke findes
            en hjælper til på denne sti; kandidatlisten i admin er i praksis
            episoder/videoer i Bunny. Mens opslaget henter, står
            afholdt-linjen — ingen flimren mellem to tilstande. */}
        {!cancelled && phase === "after" && (
          recording && recording.media_provider === "bunny" && recording.bunny_video_id ? (
            <div className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">
                Optagelse
              </h2>
              <div className="mt-4">
                <HbVideoEmbed
                  itemId={recording.id}
                  resumeAt={null}
                  onPosition={() => {}}
                  onCompleted={() => {}}
                />
              </div>
            </div>
          ) : recording && recording.media_provider === "external" && recording.external_url ? (
            <div className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">
                Optagelse
              </h2>
              <p className="mt-4 text-sm">
                <a
                  href={recording.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-hb-evergreen underline-offset-4 hover:underline"
                >
                  Se optagelsen
                </a>
              </p>
            </div>
          ) : (
            <p className="mt-8 text-sm text-hb-ink-soft">
              Sessionen er afholdt. Optagelsen lægges her, når den er klar.
            </p>
          )
        )}

        {/* Svaret: tre tilstande — intet svar (primær Tilmeld + "Jeg kan
            ikke"-tekstlink), tilmeldt (rolig linje + Afmeld) og afbud
            (rolig linje + Fortryd). Afmeld/fortryd er en
            cancelled_at-UPDATE, aldrig DELETE (kapacitetshistorik). */}
        {canRegister && (
          <div className="mt-8">
            {response === "attending" ? (
              <p className="text-sm text-hb-ink">
                Du er tilmeldt.{" "}
                <button
                  type="button"
                  disabled={mutating}
                  onClick={() => resetMutation.mutate()}
                  className="text-hb-ink-soft underline-offset-4 hover:underline disabled:opacity-50"
                >
                  Afmeld
                </button>
              </p>
            ) : response === "declined" ? (
              <p className="text-sm text-hb-ink">
                Du har meldt afbud.{" "}
                <button
                  type="button"
                  disabled={mutating}
                  onClick={() => resetMutation.mutate()}
                  className="text-hb-ink-soft underline-offset-4 hover:underline disabled:opacity-50"
                >
                  Fortryd
                </button>
              </p>
            ) : (
              <div className="flex items-center gap-4">
                <HbButton
                  variant="primary"
                  disabled={mutating}
                  onClick={() => registerMutation.mutate()}
                >
                  Tilmeld
                </HbButton>
                <button
                  type="button"
                  disabled={mutating}
                  onClick={() => declineMutation.mutate()}
                  className="text-sm text-hb-ink-soft underline-offset-4 hover:underline disabled:opacity-50"
                >
                  Jeg kan ikke
                </button>
              </div>
            )}
          </div>
        )}

        {/* Deltagerliste — historik, så den består også efter afholdelse.
            Bevidst uden tal: tom liste er en sætning, aldrig "0 tilmeldte". */}
        <div className="mt-10 border-t border-hb-line pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">
            Deltagere
          </h2>
          {/* Hele rækken linker til medlemsprofilen (eventrække-mønstret:
              Link + stille hover-tone; negativ margen giver hover-fladen
              luft uden at rykke indholdet). */}
          {participants.length === 0 ? (
            <p className="mt-4 text-sm text-hb-ink-soft">Ingen tilmeldte endnu</p>
          ) : (
            <ul className="mt-4 space-y-1">
              {participants.map((p) => (
                <li key={p.user_id}>
                  <Link
                    to={`/medlemmer/${p.user_id}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-hb-sage/20"
                  >
                    <ParticipantAvatar participant={p} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-hb-ink">
                        {p.full_name}
                        {p.is_advisor && (
                          <span className="ml-2 text-[11px] font-normal uppercase tracking-wide text-hb-ink-soft">
                            Rådgiver
                          </span>
                        )}
                      </p>
                      {p.company_name && (
                        <p className="truncate text-xs text-hb-ink-soft">{p.company_name}</p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};
