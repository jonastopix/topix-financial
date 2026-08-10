import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  cancelRegistration,
  getEvent,
  isRegisteredForEvent,
  listEventParticipants,
  registerForEvent,
  type EventParticipant,
} from "@/lib/hjemmebane/akademiApi";
import { eventMeetPhase } from "@/lib/hjemmebane/eventPhase";
import { HbButton, hbButtonVariants } from "../HbButton";

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

  // Egen tilmeldingsstatus SEPARAT fra deltagerlisten: RPC'en filtrerer
  // på aktivt medlemskab, så en gyldig tilmelding kan eksistere uden at
  // brugeren står i listen — knappen må aldrig aflæses af den.
  const registrationQuery = useQuery({
    queryKey: ["event", eventId, "registration", user?.id],
    queryFn: () => isRegisteredForEvent(eventId, user!.id),
    enabled: !!user,
  });

  const invalidateRegistrationState = () => {
    queryClient.invalidateQueries({ queryKey: ["event", eventId, "participants"] });
    queryClient.invalidateQueries({ queryKey: ["event", eventId, "registration", user?.id] });
  };

  const registerMutation = useMutation({
    mutationFn: () => registerForEvent(eventId, user!.id),
    onSuccess: invalidateRegistrationState,
  });

  const cancelMutation = useMutation({
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
  const isRegistered = registrationQuery.data === true;
  const mutating = registerMutation.isPending || cancelMutation.isPending;

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
        {!cancelled && phase === "after" && (
          <p className="mt-8 text-sm text-hb-ink-soft">
            Sessionen er afholdt. Optagelsen lægges her, når den er klar.
          </p>
        )}

        {/* Tilmelding: rolig tilmeldt-tilstand m. diskret afmeld-link,
            ellers primær knap. Afmeld er en cancelled_at-UPDATE, aldrig
            DELETE (kapacitetshistorik). */}
        {canRegister && (
          <div className="mt-8">
            {isRegistered ? (
              <p className="text-sm text-hb-ink">
                Du er tilmeldt.{" "}
                <button
                  type="button"
                  disabled={mutating}
                  onClick={() => cancelMutation.mutate()}
                  className="text-hb-ink-soft underline-offset-4 hover:underline disabled:opacity-50"
                >
                  Afmeld
                </button>
              </p>
            ) : (
              <HbButton
                variant="primary"
                disabled={mutating}
                onClick={() => registerMutation.mutate()}
              >
                Tilmeld
              </HbButton>
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
