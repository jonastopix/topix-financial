import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEngagement, type EngagementRaekke } from "@/hooks/trofaeer";
import { antalOpnaaet, trofaeDato } from "@/lib/gamification/trofaeer";
import { bevaegelseTekst, MAAL_HENTEFEJL_TEKST } from "@/lib/hjemmebane/engagementMaal";
import { HbCard } from "../HbCard";

/** /engagement — rådgivernes overblik (1/10-2026, docs/boardroom-score.md
    «Trofæer»): én række pr. kundevirksomhed med Boardroom Score, tal-streak,
    trofæer, seneste aktivitet, aktive mål og bevægelse på dem (engagementMaal.ts;
    fail-soft: fejler målene, står de to kolonner med «—» og en rolig linje). Sorterbar. Til rådgiverne — det er IKKE en
    rangliste, medlemmerne ser (medlemmet ser kun sin egen virksomhed).
    Data: hentEngagement (ét batch, samme motor som forsiden). */

type Kolonne = "navn" | "score" | "streak" | "trofaeer" | "aktivitet" | "maal" | "bevaegelse";

const vaerdi = (r: EngagementRaekke, k: Kolonne): string | number => {
  switch (k) {
    case "navn":
      return r.navn.toLocaleLowerCase("da-DK");
    case "score":
      return r.dom.score ?? -1;
    case "streak":
      return r.dom.streak.laengde;
    case "trofaeer":
      return antalOpnaaet(r.trofaeer);
    case "aktivitet":
      return r.senesteAktivitet ? Date.parse(r.senesteAktivitet) : -1;
    case "maal":
      return r.maal ? r.maal.aktive : -1;
    case "bevaegelse":
      return r.maal?.dageSidenBevaegelse ?? -1;
  }
};

export function sorterEngagement(
  raekker: readonly EngagementRaekke[],
  k: Kolonne,
  stigende: boolean,
): EngagementRaekke[] {
  return [...raekker].sort((a, b) => {
    const x = vaerdi(a, k);
    const y = vaerdi(b, k);
    const c = x < y ? -1 : x > y ? 1 : a.navn.localeCompare(b.navn, "da-DK");
    return stigende ? c : -c;
  });
}

const KOLONNER: readonly { k: Kolonne; label: string }[] = [
  { k: "navn", label: "Virksomhed" },
  { k: "score", label: "Score" },
  { k: "streak", label: "Streak" },
  { k: "trofaeer", label: "Trofæer" },
  { k: "aktivitet", label: "Seneste aktivitet" },
  { k: "maal", label: "Aktive mål" },
  { k: "bevaegelse", label: "Bevægelse" },
];

/** «—» når målene ikke kunne hentes; ellers tallet. */
const aktiveMaalTekst = (r: EngagementRaekke): string => (r.maal ? String(r.maal.aktive) : "—");
const bevaegelse = (r: EngagementRaekke): string => bevaegelseTekst(r.maal?.dageSidenBevaegelse ?? null);

export function EngagementView() {
  const q = useEngagement();
  const [kolonne, setKolonne] = useState<Kolonne>("aktivitet");
  const [stigende, setStigende] = useState(false);
  const raekker = useMemo(
    () => (q.data ? sorterEngagement(q.data.raekker, kolonne, stigende) : []),
    [q.data, kolonne, stigende],
  );

  const vaelg = (k: Kolonne) => {
    if (k === kolonne) setStigende((s) => !s);
    else {
      setKolonne(k);
      setStigende(k === "navn");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-hb-ink">Engagement</h1>
        <p className="mt-1 text-sm text-hb-ink-soft">
          Kundernes Boardroom Score (helbredstallet lige nu), tal-streak og
          trofæer (milepæle, de har nået) — og målene: antal aktive og dage
          siden seneste bevægelse på dem.
        </p>
      </div>
      {q.data && q.data.maalHentefejl.length > 0 && (
        <p className="text-sm text-hb-rust" data-engagement-maalfejl="ja">
          {MAAL_HENTEFEJL_TEKST}{" "}
          <button
            type="button"
            className="underline-offset-4 hover:underline"
            onClick={() => void q.refetch()}
          >
            Prøv igen
          </button>
        </p>
      )}
      <HbCard className="p-0 sm:overflow-x-auto">
        {q.isLoading ? (
          <p className="p-5 text-sm text-hb-ink-soft">Henter …</p>
        ) : q.isError ? (
          <div className="p-5 text-sm text-hb-rust">
            Kunne ikke hente overblikket.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void q.refetch()}
            >
              Prøv igen
            </button>
          </div>
        ) : (
          <>
            {/* Under sm: ét stablet kort pr. virksomhed (samme data, samme sortering). */}
            <ul
              className="divide-y divide-hb-line sm:hidden"
              data-engagement-mobil="ja"
            >
              {raekker.map((r) => {
                const antal = r.trofaeer.filter(
                  (t) => t.opnaaetAt !== null,
                ).length;
                return (
                  <li
                    key={r.companyId}
                    className="px-4 py-3"
                    data-engagement-kort={r.companyId}
                  >
                    <Link
                      to={`/virksomhed/${r.companyId}`}
                      className="block min-w-0 break-words text-sm font-medium text-hb-ink underline-offset-4 hover:underline"
                    >
                      {r.navn}
                    </Link>
                    <dl className="mt-1.5 flex flex-wrap items-end gap-x-4 gap-y-1 text-sm tabular-nums text-hb-ink">
                      <div>
                        <dt className="text-xs text-hb-ink-soft">Score</dt>
                        <dd>{r.dom.score ?? "–"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-hb-ink-soft">Streak</dt>
                        <dd className="inline-flex items-center gap-1">
                          <Flame
                            aria-hidden
                            className={cn(
                              "h-3.5 w-3.5",
                              r.dom.streak.laengde > 0
                                ? "text-hb-evergreen"
                                : "text-hb-line",
                            )}
                          />
                          {r.dom.streak.laengde}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-hb-ink-soft">Trofæer</dt>
                        <dd className="inline-flex items-center gap-1">
                          <Trophy
                            aria-hidden
                            className={cn(
                              "h-3.5 w-3.5",
                              antal > 0 ? "text-hb-evergreen" : "text-hb-line",
                            )}
                          />
                          {antal} af {r.trofaeer.length}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-hb-ink-soft">
                          Seneste aktivitet
                        </dt>
                        <dd className="text-hb-ink-soft">
                          {r.senesteAktivitet
                            ? trofaeDato(r.senesteAktivitet)
                            : "–"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-hb-ink-soft">Aktive mål</dt>
                        <dd>{aktiveMaalTekst(r)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-hb-ink-soft">Bevægelse</dt>
                        <dd className="text-hb-ink-soft">{bevaegelse(r)}</dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
            <table className="hidden w-full text-sm sm:table">
              <thead>
                <tr className="border-b border-hb-line text-left text-hb-ink-soft">
                  {KOLONNER.map((c) => (
                    <th
                      key={c.k}
                      className="px-4 py-2 font-medium"
                      aria-sort={
                        c.k === kolonne
                          ? stigende
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        onClick={() => vaelg(c.k)}
                        className={cn(
                          "hover:text-hb-ink",
                          c.k === kolonne && "text-hb-ink",
                        )}
                      >
                        {c.label}
                        {c.k === kolonne ? (stigende ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {raekker.map((r) => {
                  const opnaaede = r.trofaeer.filter(
                    (t) => t.opnaaetAt !== null,
                  );
                  return (
                    <tr
                      key={r.companyId}
                      className="border-b border-hb-line last:border-0"
                      data-engagement-raekke={r.companyId}
                    >
                      <td className="px-4 py-2">
                        <Link
                          to={`/virksomhed/${r.companyId}`}
                          className="text-hb-ink underline-offset-4 hover:underline"
                        >
                          {r.navn}
                        </Link>
                      </td>
                      <td className="px-4 py-2 tabular-nums text-hb-ink">
                        {r.dom.score ?? "–"}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-hb-ink">
                        <span className="inline-flex items-center gap-1">
                          <Flame
                            aria-hidden
                            className={cn(
                              "h-3.5 w-3.5",
                              r.dom.streak.laengde > 0
                                ? "text-hb-evergreen"
                                : "text-hb-line",
                            )}
                          />
                          {r.dom.streak.laengde}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className="inline-flex items-center gap-1 tabular-nums text-hb-ink"
                          title={
                            opnaaede.map((t) => t.titel).join(", ") ||
                            "Ingen endnu"
                          }
                        >
                          <Trophy
                            aria-hidden
                            className={cn(
                              "h-3.5 w-3.5",
                              opnaaede.length > 0
                                ? "text-hb-evergreen"
                                : "text-hb-line",
                            )}
                          />
                          {opnaaede.length} af {r.trofaeer.length}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-hb-ink-soft">
                        {r.senesteAktivitet
                          ? trofaeDato(r.senesteAktivitet)
                          : "–"}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-hb-ink">
                        {aktiveMaalTekst(r)}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-hb-ink-soft">
                        {bevaegelse(r)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </HbCard>
    </div>
  );
}
