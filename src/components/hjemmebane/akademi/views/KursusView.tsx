import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AREAS } from "@/lib/hjemmebane/adminContentApi";
import { HbItemRow } from "../HbItemRow";
import { HbProgressBar } from "../HbProgressBar";
import { progressSummary, useAkademiData } from "../useAkademiData";

/** Kursussiden (/akademiet/{area}/{collection-slug}) — samlingen som
    DESTINATION frem for en sektion i områdets rulle. Bygget af
    OmraadeViews egne dele: samme tilbage-link-form, samme header-rytme
    (eyebrow → editorial h1 → beskrivelse → HbProgressBar), samme
    HbItemRow-rækker i samme forløbsrækkefølge og samme fremdriftsdom
    (progressSummary).

    Ingen covers: ingen samling har et cover_path i dag (målt 12.
    august: 0 af 13), så siden bæres af typografi og struktur. */

const BackLink = ({ areaKey, label }: { areaKey: string; label: string }) => (
  <Link
    to={`/akademiet/${areaKey}`}
    className="flex items-center gap-2 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
  >
    <ArrowLeft className="h-4 w-4" />
    {label}
  </Link>
);

export const KursusView = ({ areaKey, slug }: { areaKey: string; slug: string }) => {
  const data = useAkademiData();
  const area = AREAS.find((a) => a.key === areaKey);
  const areaLabel = area?.label ?? areaKey;
  const collection = data.collectionBySlug.get(slug);

  if (data.loading) return <p className="text-sm text-hb-ink-soft">Henter…</p>;

  // Area-tjekket forhindrer, at et kursus kan nås via et forkert område
  // i URL'en — samlingens hjem er dens eget område. akademi-gaten holder
  // desuden ikke-akademi-områder ude, samme dom som OmraadeView.
  if (!collection || collection.area !== areaKey || !area?.akademi) {
    return (
      <div>
        <BackLink areaKey={areaKey} label={areaLabel} />
        <p className="mt-8 text-sm text-hb-ink-soft">
          Kurset findes ikke (eller er ikke publiceret).
        </p>
      </div>
    );
  }

  // Samlingens entries i forløbsrækkefølge: rodens egne elementer,
  // derefter under-samlingernes — præcis som CollectionSection får dem
  // i OmraadeView (roots/children-mønstret).
  const areaEntries = data.orderedByArea.get(areaKey) ?? [];
  const children = data.collections
    .filter((c) => c.parent_id === collection.id)
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  const entriesOf = (collectionId: string) =>
    areaEntries.filter((entry) => entry.item.collection_id === collectionId);
  const entries = [
    ...entriesOf(collection.id),
    ...children.flatMap((child) => entriesOf(child.id)),
  ];
  const summary = progressSummary(entries);

  return (
    <div>
      <BackLink areaKey={areaKey} label={areaLabel} />

      <section className="mt-6 max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{areaLabel}</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink">
          {collection.title}
        </h1>
        {collection.description && (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-hb-ink-soft">
            {collection.description}
          </p>
        )}
        {entries.length > 0 && (
          <div className="mt-4 max-w-xs">
            <HbProgressBar done={summary.done} total={summary.total} />
          </div>
        )}
      </section>

      <div className="mt-10 max-w-3xl">
        {entries.length === 0 ? (
          <p className="text-sm text-hb-ink-soft">Endnu intet indhold her — det er på vej.</p>
        ) : (
          <div className="-mx-3">
            {entriesOf(collection.id).map((entry) => (
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
          </div>
        )}
      </div>
    </div>
  );
};
