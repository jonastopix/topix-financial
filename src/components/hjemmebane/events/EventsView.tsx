import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { listAllUpcomingEvents, listPastEvents } from "@/lib/hjemmebane/akademiApi";
import type { EventRow } from "@/lib/hjemmebane/adminContentApi";
import { eventMeetPhase, isEventPast } from "@/lib/hjemmebane/eventPhase";
import { HbSection } from "../HbSection";
import { EventRegisterAction } from "./EventRegisterAction";

/** Events-miljøet: medlemmets eventliste (/events) m. inline-tilmelding
    (trin 3b) i Kommende-rækkernes højrekolonne. Tre sektioner: Kommende
    (published + fremtidige, nærmeste først), Afholdte (completed eller
    reelt afholdt via isEventPast — ALDRIG aflyste; overskriften må ikke
    lyve) og Aflyste (status cancelled, uanset dato), begge grupperet
    pr. år, nyeste først.
    Events er platform-globale (ingen companyId) — ingen advisor-prompt.
    Række-udtrykket spejler forsidens "Kommende"-sektion: rammeløse
    hb-line-rækker m. dato-blok, titel og meta (inkl. nedtælling). */

/** Nedtællingssproget — samme som forsidens (BoardroomView:86-93). */
const eventCountdown = (startsAt: string): string => {
  const days = Math.ceil((new Date(startsAt).getTime() - Date.now()) / 86400000);
  if (days <= 0) return "I dag";
  if (days === 1) return "I morgen";
  return `Om ${days} dage`;
};

const kindLabel = (kind: string): string =>
  kind === "live_sparring" ? "Live sparring" : kind === "workshop" ? "Workshop" : "Event";

/** withTime-parameter frem for en separat variant — én sandhed om
    meta-rækkefølgen. Afholdte events udelader klokkeslættet: datoen
    står i dato-blokken, og tidspunktet er kun relevant FØR. */
const metaLine = (event: EventRow, withTime = true): string =>
  [
    kindLabel(event.kind),
    event.meet_url ? "Online" : null,
    withTime
      ? new Date(event.starts_at).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

/** Dato-blokken — samme udtryk som forsidens Kommende-rækker: stort tal
    i Fraunces + måned i uppercase. Dæmpet variant til historikken. */
const DateBlock = ({ startsAt, dimmed }: { startsAt: string; dimmed?: boolean }) => (
  <div className="w-12 shrink-0 text-center">
    <p className={cn("font-editorial text-3xl font-medium leading-none", dimmed ? "text-hb-ink-soft" : "text-hb-ink")}>
      {new Date(startsAt).getDate()}
    </p>
    <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
      {new Date(startsAt).toLocaleDateString("da-DK", { month: "short" }).replace(".", "")}
    </p>
  </div>
);

const RowSkeleton = () => (
  <li className="flex items-center gap-5 border-t border-hb-line py-4 last:border-b" aria-hidden>
    <div className="h-10 w-12 shrink-0 animate-pulse rounded bg-hb-line/40" />
    <div className="min-w-0 flex-1">
      <div className="h-4 w-2/5 animate-pulse rounded bg-hb-line/60" />
      <div className="mt-2 h-3 w-1/4 animate-pulse rounded bg-hb-line/40" />
    </div>
  </li>
);

/** Arkiv-rækkerne grupperet pr. år (nyeste først — input er allerede
    starts_at descending fra listPastEvents). Deles af Afholdte og
    Aflyste; rækkeudtrykket er uændret, og cancelled-varianten (dæmpet +
    rust-badge) udledes fortsat pr. event. */
const PastYearGroups = ({ events }: { events: EventRow[] }) => {
  const byYear = events.reduce<Map<number, EventRow[]>>((map, event) => {
    const year = new Date(event.starts_at).getFullYear();
    const bucket = map.get(year) ?? [];
    bucket.push(event);
    map.set(year, bucket);
    return map;
  }, new Map());
  const years = [...byYear.keys()].sort((a, b) => b - a);

  return (
    <>
      {years.map((year) => (
        <div key={year} className="mb-8 last:mb-0">
          <p className="mb-2 text-sm font-medium text-hb-ink-soft">{year}</p>
          <ul>
            {(byYear.get(year) ?? []).map((event) => {
              const cancelled = event.status === "cancelled";
              return (
                <li key={event.id} className="border-t border-hb-line last:border-b">
                  <Link
                    to={`/events/${event.id}`}
                    className={cn(
                      "flex items-center gap-5 py-4 transition-colors hover:bg-hb-sage/20",
                      cancelled && "opacity-60",
                    )}
                  >
                    <DateBlock startsAt={event.starts_at} dimmed />
                    <div className="min-w-0 flex-1">
                      {/* Aflyst bæres af badgen + opacity — ingen
                          gennemstregning (tredje markør er for meget). */}
                      <p
                        className={cn(
                          "text-[15px] font-medium leading-snug",
                          cancelled ? "text-hb-ink-soft" : "text-hb-ink",
                        )}
                      >
                        {event.title}
                      </p>
                      <p className="mt-1 text-sm text-hb-ink-soft">{metaLine(event, false)}</p>
                    </div>
                    {cancelled && (
                      <span className="shrink-0 rounded-full border border-hb-rust/40 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-hb-rust">
                        Aflyst
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
};

export const EventsView = () => {
  const upcomingQuery = useQuery({
    queryKey: ["events", "upcoming-all"],
    queryFn: listAllUpcomingEvents,
    staleTime: 5 * 60_000,
  });
  const pastQuery = useQuery({
    queryKey: ["events", "past"],
    queryFn: () => listPastEvents(),
    staleTime: 5 * 60_000,
  });

  const upcoming = upcomingQuery.data ?? [];
  const past = pastQuery.data ?? [];

  // Arkivet deles i to: "Afholdte" må kun bære det der faktisk blev
  // afholdt (completed, eller published med sluttid i fortiden) —
  // aflyste er IKKE afholdte, uanset dato, og får egen sektion.
  const held = past.filter(
    (event) =>
      event.status === "completed" ||
      (event.status !== "cancelled" && isEventPast(event)),
  );
  const cancelledEvents = past.filter((event) => event.status === "cancelled");

  return (
    <div>
      {/* ── Header (Akademi-ForsideView-mønstret): fladens eget navn som
          eyebrow, en SÆTNING som rubrik. ── */}
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Events</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          Mød op, mens det sker.
        </h1>
        <p className="mt-3 text-sm text-hb-ink-soft">
          Live sparring og workshops — kommende datoer først, historikken nedenunder.
        </p>
      </section>

      {/* ── Kommende ── */}
      <HbSection eyebrow="Kommende" hairline className="mt-12 md:mt-14">
        {upcomingQuery.isLoading ? (
          <ul>
            <RowSkeleton />
            <RowSkeleton />
          </ul>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-hb-ink-soft">
            Ingen planlagte events lige nu — nye datoer lander her, så snart de er sat.
          </p>
        ) : (
          <ul>
            {/* Link'et dækker KUN dato+titel+meta — tilmeldingshandlingen
                står som SØSKENDE i rækken, aldrig inde i linket (en
                klikbar handling i et anker er ugyldig HTML og ville
                trigge navigation). Hover-tonen bor på wrapperen, så
                rækken stadig føles som ét element. Nedtællingen er
                flyttet ind i meta-linjen; højrekolonnen bærer handlingen. */}
            {upcoming.map((event) => (
              <li key={event.id} className="border-t border-hb-line last:border-b">
                <div className="flex items-center gap-5 py-4 transition-colors hover:bg-hb-sage/20">
                  <Link to={`/events/${event.id}`} className="flex min-w-0 flex-1 items-center gap-5">
                    <DateBlock startsAt={event.starts_at} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium leading-snug text-hb-ink">{event.title}</p>
                      <p className="mt-1 text-sm text-hb-ink-soft">
                        {`${metaLine(event)} · ${eventCountdown(event.starts_at)}`}
                      </p>
                    </div>
                  </Link>
                  <EventRegisterAction eventId={event.id} phase={eventMeetPhase(event)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </HbSection>

      {/* ── Arkivet: Afholdte + Aflyste (pr. år) ──
          Tom-tilstanden bor på TVÆRS af de to sektioner: en tom sektion
          udelades helt (ingen tom-tekst pr. sektion), og kun når BEGGE
          er tomme, står én "Afholdte"-overskrift med den kendte linje —
          samme udtryk som før opdelingen. Loading bor samme sted. */}
      {pastQuery.isLoading || (held.length === 0 && cancelledEvents.length === 0) ? (
        <HbSection eyebrow="Afholdte" hairline className="mt-14 md:mt-16">
          {pastQuery.isLoading ? (
            <ul>
              <RowSkeleton />
              <RowSkeleton />
            </ul>
          ) : (
            <p className="text-sm text-hb-ink-soft">Ingen afholdte events endnu.</p>
          )}
        </HbSection>
      ) : (
        <>
          {held.length > 0 && (
            <HbSection eyebrow="Afholdte" hairline className="mt-14 md:mt-16">
              <PastYearGroups events={held} />
            </HbSection>
          )}
          {cancelledEvents.length > 0 && (
            <HbSection eyebrow="Aflyste" hairline className="mt-14 md:mt-16">
              <PastYearGroups events={cancelledEvents} />
            </HbSection>
          )}
        </>
      )}
    </div>
  );
};
