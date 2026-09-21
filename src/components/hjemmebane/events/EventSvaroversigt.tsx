import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { GRUPPE_ORD, hentEventSvaroversigt } from "@/lib/hjemmebane/eventSvarApi";
import { SVARGRUPPER } from "@/lib/hjemmebane/eventSvar";

/**
 * Rådgiverens svaroversigt på eventsiden (udkast 21/9-2026): de tre grupper
 * med navn og virksomhed, og antal. KUN for rådgiver/admin — komponenten
 * rendres kun bag isAdvisor i EventDetailView, og svarer selv null uden
 * rollen, så et medlem aldrig ser eller kalder den (RPC'en afviser desuden
 * selv). Medlemmernes deltagerliste ovenfor er urørt.
 */
export const EventSvaroversigt = ({ eventId }: { eventId: string }) => {
  const { user, isAdvisor } = useAuth();
  const query = useQuery({
    queryKey: ["event", eventId, "svaroversigt"],
    queryFn: () => hentEventSvaroversigt(eventId),
    enabled: !!user && isAdvisor === true,
  });
  if (!isAdvisor) return null;

  return (
    <div className="mt-10 border-t border-hb-line pt-6" data-event-svaroversigt>
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">
        Svar — kun for rådgivere
      </h2>
      <p className="mt-1 text-xs text-hb-ink-soft">
        Alle med adgang til eventet, uden rådgivere. Samme regel som beskederne ved en flytning.
      </p>
      {query.isError ? (
        <p className="mt-4 text-sm text-hb-ink-soft" data-event-svaroversigt-fejl>Svaroversigten kunne ikke hentes.</p>
      ) : query.isPending ? (
        <p className="mt-4 text-sm text-hb-ink-soft">Henter …</p>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          {SVARGRUPPER.map((gruppe) => {
            const raekker = query.data.raekker.filter((r) => r.gruppe === gruppe);
            return (
              <section key={gruppe} data-svargruppe={gruppe} data-antal={query.data.tal[gruppe]}>
                <h3 className="text-sm font-medium text-hb-ink">
                  {GRUPPE_ORD[gruppe]} <span className="ml-1 tabular-nums text-hb-ink-soft">{query.data.tal[gruppe]}</span>
                </h3>
                {raekker.length === 0 ? (
                  <p className="mt-2 text-xs text-hb-ink-soft">Ingen</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {raekker.map((r) => (
                      <li key={r.user_id} className="min-w-0">
                        <Link to={`/medlemmer/${r.user_id}`} className="-mx-2 block rounded-lg px-2 py-1 transition-colors hover:bg-hb-sage/20">
                          <p className="truncate text-sm text-hb-ink">{r.full_name ?? "Uden navn"}</p>
                          {r.company_name && <p className="truncate text-xs text-hb-ink-soft">{r.company_name}</p>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
