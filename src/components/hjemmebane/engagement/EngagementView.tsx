import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEngagement, type EngagementRaekke } from "@/hooks/trofaeer";
import { antalOpnaaet, trofaeDato } from "@/lib/gamification/trofaeer";
import { HbCard } from "../HbCard";

/** /engagement — rådgivernes overblik (1/10-2026, docs/boardroom-score.md
    «Trofæer»): én række pr. kundevirksomhed med Boardroom Score, tal-streak,
    trofæer og seneste aktivitet. Sorterbar. Til rådgiverne — det er IKKE en
    rangliste, medlemmerne ser (medlemmet ser kun sin egen virksomhed).
    Data: hentEngagement (ét batch, samme motor som forsiden). */

type Kolonne = "navn" | "score" | "streak" | "trofaeer" | "aktivitet";

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
  }
};

export function sorterEngagement(raekker: readonly EngagementRaekke[], k: Kolonne, stigende: boolean): EngagementRaekke[] {
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
];

export function EngagementView() {
  const q = useEngagement();
  const [kolonne, setKolonne] = useState<Kolonne>("aktivitet");
  const [stigende, setStigende] = useState(false);
  const raekker = useMemo(() => (q.data ? sorterEngagement(q.data, kolonne, stigende) : []), [q.data, kolonne, stigende]);

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
          Kundernes Boardroom Score (helbredstallet lige nu), tal-streak og trofæer (milepæle, nået én gang for altid).
        </p>
      </div>
      <HbCard className="overflow-x-auto p-0">
        {q.isLoading ? (
          <p className="p-5 text-sm text-hb-ink-soft">Henter …</p>
        ) : q.isError ? (
          <div className="p-5 text-sm text-hb-rust">
            Kunne ikke hente overblikket.{" "}
            <button type="button" className="underline" onClick={() => void q.refetch()}>
              Prøv igen
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hb-line text-left text-hb-ink-soft">
                {KOLONNER.map((c) => (
                  <th key={c.k} className="px-4 py-2 font-medium" aria-sort={c.k === kolonne ? (stigende ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => vaelg(c.k)} className={cn("hover:text-hb-ink", c.k === kolonne && "text-hb-ink")}>
                      {c.label}
                      {c.k === kolonne ? (stigende ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {raekker.map((r) => {
                const opnaaede = r.trofaeer.filter((t) => t.opnaaetAt !== null);
                return (
                  <tr key={r.companyId} className="border-b border-hb-line last:border-0" data-engagement-raekke={r.companyId}>
                    <td className="px-4 py-2">
                      <Link to={`/virksomhed/${r.companyId}`} className="text-hb-ink underline-offset-4 hover:underline">
                        {r.navn}
                      </Link>
                    </td>
                    <td className="px-4 py-2 tabular-nums text-hb-ink">{r.dom.score ?? "–"}</td>
                    <td className="px-4 py-2 tabular-nums text-hb-ink">
                      <span className="inline-flex items-center gap-1">
                        <Flame aria-hidden className={cn("h-3.5 w-3.5", r.dom.streak.laengde > 0 ? "text-hb-evergreen" : "text-hb-line")} />
                        {r.dom.streak.laengde}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1 tabular-nums text-hb-ink" title={opnaaede.map((t) => t.titel).join(", ") || "Ingen endnu"}>
                        <Trophy aria-hidden className={cn("h-3.5 w-3.5", opnaaede.length > 0 ? "text-hb-evergreen" : "text-hb-line")} />
                        {opnaaede.length} af {r.trofaeer.length}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-hb-ink-soft">{r.senesteAktivitet ? trofaeDato(r.senesteAktivitet) : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </HbCard>
    </div>
  );
}
