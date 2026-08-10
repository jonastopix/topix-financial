import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  cancelRegistration,
  isRegisteredForEvent,
  registerForEvent,
} from "@/lib/hjemmebane/akademiApi";
import type { EventMeetPhase } from "@/lib/hjemmebane/eventPhase";

/** Inline-tilmelding i oversigternes højrekolonne (Events trin 3b).
    Tekstuel handling, IKKE en fyldt knap — rækken er stadig primært et
    link til eventsiden, og handlingen skal ikke konkurrere med den.
    Query-nøglerne deles med EventDetailView (["event", id,
    "registration"/"participants", …]), så tilmelding ét sted er
    synlig alle steder uden ekstra fetch-logik. */

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

  const registrationQuery = useQuery({
    queryKey: ["event", eventId, "registration", user?.id],
    queryFn: () => isRegisteredForEvent(eventId, user!.id),
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

  const cancelMutation = useMutation({
    mutationFn: () => cancelRegistration(eventId, user!.id),
    onSuccess: invalidateRegistrationState,
  });

  // Betingede returns EFTER samtlige hooks (React #310-reglen).
  // Aflyst/afholdt: tilmelding hører kun fremtid og igangvær til.
  if (cancelled || phase === "after") return null;
  if (!user || registrationQuery.isLoading) return null;

  const mutating = registerMutation.isPending || cancelMutation.isPending;

  return registrationQuery.data === true ? (
    <button
      type="button"
      disabled={mutating}
      onClick={() => cancelMutation.mutate()}
      className="inline-flex shrink-0 items-center gap-1 text-sm text-hb-ink-soft underline-offset-4 hover:underline disabled:opacity-50"
    >
      <Check className="h-3.5 w-3.5" />
      Tilmeldt
    </button>
  ) : (
    <button
      type="button"
      disabled={mutating}
      onClick={() => registerMutation.mutate()}
      className="shrink-0 text-sm text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50"
    >
      Tilmeld
    </button>
  );
};
