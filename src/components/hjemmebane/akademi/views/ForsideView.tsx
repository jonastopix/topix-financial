import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Play } from "lucide-react";
import { AREAS, ITEM_TYPES } from "@/lib/hjemmebane/adminContentApi";
import { formatDuration } from "@/components/hjemmebane/admin/editors/shared";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HbProgressBar } from "../HbProgressBar";
import { progressSummary, useAkademiData, type AkademiItem } from "../useAkademiData";

/** Forsidens store genoptagelses-kort — forsiden ER genoptagelsen. */
const ContinueCard = ({ entry }: { entry: AkademiItem }) => {
  const { item, collection, progress } = entry;
  const typeLabel = ITEM_TYPES.find((t) => t.key === item.type)?.label ?? item.type;
  const areaLabel = AREAS.find((a) => a.key === item.area)?.label ?? item.area;
  const resume = progress?.last_position_seconds ?? null;

  return (
    <HbCard className="p-6 md:p-8">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
        {[typeLabel, collection?.title, areaLabel].filter(Boolean).join(" · ")}
      </p>
      <h2 className="mt-3 font-editorial text-2xl font-medium leading-tight text-hb-ink md:text-3xl">
        {item.title}
      </h2>
      {resume && item.duration_seconds ? (
        <p className="mt-2 text-sm text-hb-ink-soft">
          Du er nået til {formatDuration(resume)} af {formatDuration(item.duration_seconds)}.
        </p>
      ) : item.description ? (
        <p className="mt-2 text-sm leading-relaxed text-hb-ink-soft">{item.description}</p>
      ) : null}
      <div className="mt-5">
        <Link to={`/akademiet/${item.area}/${item.slug}`}>
          <HbButton>
            <Play className="h-4 w-4" />
            {resume ? `Fortsæt ved ${formatDuration(resume)}` : "Fortsæt"}
          </HbButton>
        </Link>
      </div>
    </HbCard>
  );
};

const AreaCard = ({ areaKey, label, entries }: { areaKey: string; label: string; entries: AkademiItem[] }) => {
  const summary = progressSummary(entries);
  const empty = entries.length === 0;

  const inner = (
    <HbCard
      className={
        empty ? "flex h-full flex-col p-6 opacity-60" : "flex h-full flex-col p-6"
      }
    >
      <h3 className="font-editorial text-xl font-medium text-hb-ink">{label}</h3>
      <div className="mt-auto pt-5">
        {empty ? (
          <p className="text-xs text-hb-ink-soft">Endnu intet indhold</p>
        ) : (
          <HbProgressBar done={summary.done} total={summary.total} />
        )}
      </div>
    </HbCard>
  );

  return empty ? inner : <Link to={`/akademiet/${areaKey}`}>{inner}</Link>;
};

export const ForsideView = () => {
  const data = useAkademiData();

  if (data.loading) {
    return <p className="text-sm text-hb-ink-soft">Henter Akademiet…</p>;
  }

  // Seneste påbegyndte (nyeste progress-aktivitet, ulåst, ikke gennemført).
  const continueEntry = [...data.progressRows]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((row) => data.byId.get(row.content_item_id))
    .find((entry) => entry && entry.drip.unlocked && entry.state !== "done");

  // Første urørte element i forløbsrækkefølgen (områdernes rækkefølge).
  const nextEntry = AREAS.flatMap((area) => data.orderedByArea.get(area.key) ?? []).find(
    (entry) =>
      entry.drip.unlocked && entry.state === "untouched" && entry.item.id !== continueEntry?.item.id,
  );

  const started = Boolean(continueEntry);

  return (
    <div>
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Akademiet</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          {started ? "Fortsæt hvor du slap." : "Velkommen til Akademiet."}
        </h1>
        {!started && (
          <p className="mt-4 text-lg leading-relaxed text-hb-ink-soft">
            Forløb, kurser og værktøjer — i dit tempo. Start her, så følger vi med på, hvor langt
            du er nået.
          </p>
        )}
      </section>

      {continueEntry && (
        <div className="mt-8 max-w-3xl">
          <ContinueCard entry={continueEntry} />
        </div>
      )}

      {nextEntry && (
        <Link
          to={`/akademiet/${nextEntry.item.area}/${nextEntry.item.slug}`}
          className="mt-5 flex max-w-3xl items-center gap-2 text-sm text-hb-rust underline-offset-4 hover:underline"
        >
          <ArrowRight className="h-4 w-4" />
          Næste for dig: {nextEntry.item.title}
          {nextEntry.collection ? ` (${nextEntry.collection.title})` : ""}
        </Link>
      )}

      <section className="mt-12 md:mt-16">
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
          Dine forløb
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AREAS.map((area) => (
            <AreaCard
              key={area.key}
              areaKey={area.key}
              label={area.label}
              entries={data.orderedByArea.get(area.key) ?? []}
            />
          ))}
        </div>
      </section>

      {data.isAdvisor && (
        <p className="mt-10 text-xs text-hb-ink-soft">
          Advisor-visning: du ser alt indhold uden dryp-låse.
        </p>
      )}
    </div>
  );
};
