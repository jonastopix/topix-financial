import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEvent } from "@/lib/hjemmebane/akademiApi";
import { eventMeetPhase } from "@/lib/hjemmebane/eventPhase";
import { hbButtonVariants } from "../HbButton";

/** Events-miljøet, trin 2: eventsiden (/events/:id). KUN siden —
    tilmelding, deltagerliste og optagelses-visning er trin 3 og
    senere. Ikke-fundet håndteres blødt (ElementView-mønstret: venlig
    tekst + tilbage-link, ingen throw). Meet-knappen følger den DELTE
    fasedom (eventMeetPhase: live fra 15 min før start til sluttiden). */

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

export const EventDetailView = ({ eventId }: { eventId: string }) => {
  const eventQuery = useQuery({
    queryKey: ["events", "detail", eventId],
    queryFn: () => getEvent(eventId),
    staleTime: 60_000,
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
            after → afholdt-linje (optagelsen selv er trin 3). */}
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
      </section>
    </div>
  );
};
