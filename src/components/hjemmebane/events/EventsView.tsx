import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { listAllUpcomingEvents, listPastEvents } from "@/lib/hjemmebane/akademiApi";
import type { EventRow } from "@/lib/hjemmebane/adminContentApi";
import { HbSection } from "../HbSection";

/** Events-miljøet, trin 1: medlemmets eventliste (/events). KUN listen —
    ingen tilmelding, ingen deltagerliste, ingen eventsider (trin 2/3).
    To sektioner: Kommende (published + fremtidige, nærmeste først) og
    Afholdte (completed/cancelled, grupperet pr. år, nyeste først).
    Events er platform-globale (ingen companyId) — ingen advisor-prompt.
    Række-udtrykket spejler forsidens "Kommende"-sektion: rammeløse
    hb-line-rækker m. dato-blok, titel, meta og højre-stillet nedtælling. */

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

  // Historikken grupperet pr. år, nyeste år først (rækkerne er allerede
  // starts_at descending fra listPastEvents).
  const pastByYear = past.reduce<Map<number, EventRow[]>>((map, event) => {
    const year = new Date(event.starts_at).getFullYear();
    const bucket = map.get(year) ?? [];
    bucket.push(event);
    map.set(year, bucket);
    return map;
  }, new Map());
  const years = [...pastByYear.keys()].sort((a, b) => b - a);

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
            {upcoming.map((event) => (
              <li
                key={event.id}
                className="flex items-center gap-5 border-t border-hb-line py-4 last:border-b"
              >
                <DateBlock startsAt={event.starts_at} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium leading-snug text-hb-ink">{event.title}</p>
                  <p className="mt-1 text-sm text-hb-ink-soft">{metaLine(event)}</p>
                </div>
                <p className="shrink-0 text-sm text-hb-ink-soft">{eventCountdown(event.starts_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </HbSection>

      {/* ── Afholdte (historikken, pr. år) ── */}
      <HbSection eyebrow="Afholdte" hairline className="mt-14 md:mt-16">
        {pastQuery.isLoading ? (
          <ul>
            <RowSkeleton />
            <RowSkeleton />
          </ul>
        ) : past.length === 0 ? (
          <p className="text-sm text-hb-ink-soft">Ingen afholdte events endnu.</p>
        ) : (
          years.map((year) => (
            <div key={year} className="mb-8 last:mb-0">
              <p className="mb-2 text-sm font-medium text-hb-ink-soft">{year}</p>
              <ul>
                {(pastByYear.get(year) ?? []).map((event) => {
                  const cancelled = event.status === "cancelled";
                  return (
                    <li
                      key={event.id}
                      className={cn(
                        "flex items-center gap-5 border-t border-hb-line py-4 last:border-b",
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
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </HbSection>
    </div>
  );
};
