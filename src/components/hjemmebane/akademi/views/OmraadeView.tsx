import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AREAS } from "@/lib/hjemmebane/adminContentApi";
import { HbItemRow } from "../HbItemRow";
import { HbKursusKort } from "../HbKursusKort";
import { HbProgressBar } from "../HbProgressBar";
import { progressSummary, useAkademiData } from "../useAkademiData";

/** Områdesiden: løse elementer som rækker, kurser som KORT der linker
    til kursussiden (KursusView) — en destination frem for en sektion i
    én lang rulle. */
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

        {/* Løse elementer hører ikke til noget kursus og står derfor for
            sig — som rækker, øverst, præcis som hidtil. */}
        {looseEntries.length > 0 && (
          <div className="-mx-3">
            {looseEntries.map((entry) => (
              <HbItemRow key={entry.item.id} entry={entry} />
            ))}
          </div>
        )}

        {/* Kurserne som kort — ét pr. rod-samling i samme rækkefølge som
            sektionerne stod. Lektionstal, samlet tid og fremdrift udledes
            af samlingens entries inkl. under-samlingernes (samme
            roots/children-mønster som KursusView). */}
        {roots.length > 0 && (
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {roots.map((root) => {
              const children = areaCollections.filter((c) => c.parent_id === root.id);
              const rootEntries = [
                ...entriesOf(root.id),
                ...children.flatMap((child) => entriesOf(child.id)),
              ];
              if (rootEntries.length === 0) return null;
              const rootSummary = progressSummary(rootEntries);
              const samletMinutter = Math.round(
                rootEntries.reduce(
                  (sum, entry) => sum + (entry.item.duration_seconds ?? 0),
                  0,
                ) / 60,
              );
              return (
                <HbKursusKort
                  key={root.id}
                  areaKey={areaKey}
                  slug={root.slug}
                  titel={root.title}
                  beskrivelse={root.description}
                  antalLektioner={rootEntries.length}
                  samletMinutter={samletMinutter}
                  done={rootSummary.done}
                  total={rootSummary.total}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
