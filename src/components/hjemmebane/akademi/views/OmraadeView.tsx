import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AREAS } from "@/lib/hjemmebane/adminContentApi";
import type { ContentCollection } from "@/lib/hjemmebane/adminContentApi";
import { HbItemRow } from "../HbItemRow";
import { HbProgressBar } from "../HbProgressBar";
import { progressSummary, useAkademiData, type AkademiItem } from "../useAkademiData";

/** Samling som sektion: HbSection-rytmen med fremdrift i headeren. */
const CollectionSection = ({
  collection,
  entries,
  children,
}: {
  collection: ContentCollection;
  entries: AkademiItem[];
  children?: React.ReactNode;
}) => {
  const summary = progressSummary(entries);
  return (
    <section className="mt-10 first:mt-0">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 className="min-w-0 truncate font-editorial text-2xl font-medium leading-tight text-hb-ink">
          {collection.title}
        </h2>
        <div className="w-32 shrink-0 md:w-44">
          <HbProgressBar done={summary.done} total={summary.total} />
        </div>
      </div>
      {collection.description && (
        <p className="mb-3 max-w-2xl text-sm leading-relaxed text-hb-ink-soft">
          {collection.description}
        </p>
      )}
      <div className="-mx-3">{children}</div>
    </section>
  );
};

export const OmraadeView = ({ areaKey }: { areaKey: string }) => {
  const data = useAkademiData();
  const area = AREAS.find((a) => a.key === areaKey);
  const entries = data.orderedByArea.get(areaKey) ?? [];

  if (data.loading) return <p className="text-sm text-hb-ink-soft">Henter…</p>;
  // Ikke-akademi-områder (push) må aldrig ses her — samme dom som ukendt.
  if (!area || !area.akademi) {
    return <p className="text-sm text-hb-ink-soft">Området findes ikke.</p>;
  }

  const looseEntries = entries.filter((entry) => !entry.collection);
  const areaCollections = data.collections
    .filter((c) => c.area === areaKey)
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  const roots = areaCollections.filter((c) => !c.parent_id);
  const entriesOf = (collectionId: string) =>
    entries.filter((entry) => entry.item.collection_id === collectionId);
  const summary = progressSummary(entries);

  return (
    <div>
      <Link
        to="/akademiet"
        className="flex items-center gap-2 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Akademiet
      </Link>

      <section className="mt-6 max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Akademiet</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink">
          {area.label}
        </h1>
        {entries.length > 0 && (
          <div className="mt-4 max-w-xs">
            <HbProgressBar done={summary.done} total={summary.total} />
          </div>
        )}
      </section>

      <div className="mt-10 max-w-3xl">
        {entries.length === 0 && (
          <p className="text-sm text-hb-ink-soft">Endnu intet indhold her — det er på vej.</p>
        )}

        {looseEntries.length > 0 && (
          <div className="-mx-3">
            {looseEntries.map((entry) => (
              <HbItemRow key={entry.item.id} entry={entry} />
            ))}
          </div>
        )}

        {roots.map((root) => {
          const children = areaCollections.filter((c) => c.parent_id === root.id);
          const rootEntries = [
            ...entriesOf(root.id),
            ...children.flatMap((child) => entriesOf(child.id)),
          ];
          if (rootEntries.length === 0) return null;
          return (
            <CollectionSection key={root.id} collection={root} entries={rootEntries}>
              {entriesOf(root.id).map((entry) => (
                <HbItemRow key={entry.item.id} entry={entry} />
              ))}
              {children.map((child) => {
                const childEntries = entriesOf(child.id);
                if (childEntries.length === 0) return null;
                return (
                  <div key={child.id} className="mt-4">
                    <p className="mb-1 px-3 text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                      {child.title}
                    </p>
                    {childEntries.map((entry) => (
                      <HbItemRow key={entry.item.id} entry={entry} />
                    ))}
                  </div>
                );
              })}
            </CollectionSection>
          );
        })}
      </div>
    </div>
  );
};
