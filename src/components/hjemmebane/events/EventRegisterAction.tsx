import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  cancelRegistration,
  declineEvent,
  getMyEventResponse,
  registerForEvent,
} from "@/lib/hjemmebane/akademiApi";
import type { EventMeetPhase } from "@/lib/hjemmebane/eventPhase";

/** Inline-svar i oversigternes højrekolonne (Events trin 3b + afbud).
    Tekstuel handling, IKKE en fyldt knap — rækken er stadig primært et
    link til eventsiden, og handlingen skal ikke konkurrere med den.
    Tre tilstande: intet svar (Tilmeld · Kan ikke), tilmeldt (check,
    klik afmelder), afbud (X, klik nulstiller). Query-nøglerne deles med
    EventDetailView (["event", id, "registration"/"participants", …]),
    så et svar ét sted er synligt alle steder uden ekstra fetch-logik. */

export const EventRegisterAction = ({
  eventId,
  phase,
  cancelled = false,
  onDone,
}: {
  eventId: string;
  phase: EventMeetPhase;
  cancelled?: boolean;
  onDone?: () => void;
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const responseQuery = useQuery({
    queryKey: ["event", eventId, "registration", user?.id],
    queryFn: () => getMyEventResponse(eventId, user!.id),
    enabled: !!user,
  });

  const invalidateRegistrationState = () => {
    queryClient.invalidateQueries({ queryKey: ["event", eventId, "participants"] });
    queryClient.invalidateQueries({ queryKey: ["event", eventId, "registration", user?.id] });
    onDone?.();
  };

  const registerMutation = useMutation({
    mutationFn: () => registerForEvent(eventId, user!.id),
    onSuccess: invalidateRegistrationState,
  });

  const declineMutation = useMutation({
    mutationFn: () => declineEvent(eventId, user!.id),
    onSuccess: invalidateRegistrationState,
  });

  // Både afmelding (fra tilmeldt) og fortryd-afbud er samme handling:
  // cancelled_at sættes, svaret er trukket tilbage.
  const resetMutation = useMutation({
    mutationFn: () => cancelRegistration(eventId, user!.id),
    onSuccess: invalidateRegistrationState,
  });

  // Betingede returns EFTER samtlige hooks (React #310-reglen).
  // Aflyst/afholdt: svar hører kun fremtid og igangvær til.
  if (cancelled || phase === "after") return null;
  if (!user || responseQuery.isLoading) return null;

  const mutating =
    registerMutation.isPending || declineMutation.isPending || resetMutation.isPending;
  const response = responseQuery.data ?? null;

  if (response === "attending") {
    return (
      <button
        type="button"
        disabled={mutating}
        onClick={() => resetMutation.mutate()}
        className="inline-flex shrink-0 items-center gap-1 text-sm text-hb-ink-soft underline-offset-4 hover:underline disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
        Tilmeldt
      </button>
    );
  }

  if (response === "declined") {
    return (
      <button
        type="button"
        disabled={mutating}
        onClick={() => resetMutation.mutate()}
        className="inline-flex shrink-0 items-center gap-1 text-sm text-hb-ink-soft underline-offset-4 hover:underline disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
        Kan ikke
      </button>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-sm">
      <button
        type="button"
        disabled={mutating}
        onClick={() => registerMutation.mutate()}
        className="text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50"
      >
        Tilmeld
      </button>
      <span aria-hidden className="text-hb-ink-soft">
        ·
      </span>
      <button
        type="button"
        disabled={mutating}
        onClick={() => declineMutation.mutate()}
        className="text-hb-ink-soft underline-offset-4 hover:underline disabled:opacity-50"
      >
        Kan ikke
      </button>
    </span>
  );
};
