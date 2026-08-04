import * as React from "react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Download, ExternalLink, Lock } from "lucide-react";
import { AREAS, ITEM_TYPES, getAssetPreviewUrl } from "@/lib/hjemmebane/adminContentApi";
import { formatDuration } from "@/components/hjemmebane/admin/editors/shared";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HbVideoEmbed } from "../HbVideoEmbed";
import { useAkademiData } from "../useAkademiData";

export const ElementView = ({ areaKey, slug }: { areaKey: string; slug: string }) => {
  const data = useAkademiData();
  const entry = data.bySlug.get(slug);
  const seenWrittenRef = useRef<string | null>(null);

  // seen_at ved første visning — én gang pr. element pr. besøg.
  useEffect(() => {
    if (!entry || data.loading || !entry.drip.unlocked) return;
    if (entry.progress?.seen_at || seenWrittenRef.current === entry.item.id) return;
    seenWrittenRef.current = entry.item.id;
    data.writeProgress(entry.item.id, { seen_at: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.item.id, data.loading]);

  if (data.loading) return <p className="text-sm text-hb-ink-soft">Henter…</p>;

  const areaLabel = AREAS.find((a) => a.key === areaKey)?.label ?? areaKey;

  if (!entry) {
    return (
      <div>
        <BackLink areaKey={areaKey} label={areaLabel} />
        <p className="mt-8 text-sm text-hb-ink-soft">Elementet findes ikke (eller er ikke publiceret).</p>
      </div>
    );
  }

  const { item, collection, progress, drip, state } = entry;

  if (!drip.unlocked) {
    return (
      <div>
        <BackLink areaKey={areaKey} label={areaLabel} />
        <div className="mt-8 flex max-w-2xl items-center gap-3 rounded-hb border border-hb-line bg-hb-sage/30 px-6 py-5 text-sm leading-relaxed text-hb-ink">
          <Lock className="h-4 w-4 shrink-0" />
          Dette element åbner om {drip.daysUntil} dag{drip.daysUntil === 1 ? "" : "e"} — det
          drypper ind i takt med dit forløb.
        </div>
      </div>
    );
  }

  const typeLabel = ITEM_TYPES.find((t) => t.key === item.type)?.label ?? item.type;
  const done = state === "done";
  const skipped = state === "skipped";

  // Næste ulåste element efter dette i områdets forløbsrækkefølge.
  const ordered = data.orderedByArea.get(item.area) ?? [];
  const index = ordered.findIndex((candidate) => candidate.item.id === item.id);
  const next = index >= 0 ? ordered.slice(index + 1).find((candidate) => candidate.drip.unlocked) : undefined;

  const acknowledge = () =>
    data.writeProgress(item.id, { acknowledged_at: new Date().toISOString() });
  const skip = () => data.writeProgress(item.id, { skipped_at: new Date().toISOString() });

  const openStorageFile = async () => {
    if (!item.storage_path) return;
    const url = await getAssetPreviewUrl(item.storage_path);
    window.open(url, "_blank", "noopener");
  };

  return (
    <div>
      <BackLink areaKey={areaKey} label={areaLabel} />

      <article className="mt-6 max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
          {[typeLabel, collection?.title, formatDuration(item.duration_seconds)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <h1 className="mt-3 font-editorial text-3xl font-medium leading-[1.15] tracking-tight text-hb-ink md:text-4xl">
          {item.title}
        </h1>
        {item.description && (
          <p className="mt-3 text-lg leading-relaxed text-hb-ink-soft">{item.description}</p>
        )}

        {item.media_provider === "bunny" && item.bunny_video_id && (
          <div className="mt-7">
            <HbVideoEmbed
              itemId={item.id}
              resumeAt={done ? null : (progress?.last_position_seconds ?? null)}
              onPosition={(seconds) =>
                data.writeProgress(item.id, { last_position_seconds: seconds })
              }
              onCompleted={() => {
                if (!done) acknowledge();
              }}
            />
          </div>
        )}

        {item.media_provider === "storage" && item.storage_path && (
          <div className="mt-7">
            <HbButton variant="secondary" onClick={() => void openStorageFile()}>
              <Download className="h-4 w-4" />
              Hent {typeLabel.toLowerCase()}en
            </HbButton>
          </div>
        )}

        {item.media_provider === "external" && item.external_url && (
          <div className="mt-7">
            <a href={item.external_url} target="_blank" rel="noopener noreferrer">
              <HbButton variant="secondary">
                <ExternalLink className="h-4 w-4" />
                Åbn
              </HbButton>
            </a>
          </div>
        )}

        {item.body && (
          <div
            className="prose-hb mt-8 text-[15px] leading-relaxed text-hb-ink [&_a]:text-hb-rust [&_a]:underline [&_h2]:mt-8 [&_h2]:font-editorial [&_h2]:text-2xl [&_h2]:font-medium [&_h3]:mt-6 [&_h3]:font-editorial [&_h3]:text-xl [&_h3]:font-medium [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: item.body }}
          />
        )}

        <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-hb-line pt-6">
          {done ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-hb-sage px-4 py-2 text-sm font-medium text-hb-ink">
              <Check className="h-4 w-4" />
              Gennemført
            </span>
          ) : (
            <HbButton onClick={acknowledge}>
              <Check className="h-4 w-4" />
              Markér som gennemført
            </HbButton>
          )}

          {!done && !skipped && (
            <button
              type="button"
              onClick={skip}
              className="px-2 text-sm text-hb-ink-soft underline-offset-4 transition-colors hover:text-hb-ink hover:underline"
            >
              Spring over
            </button>
          )}
          {skipped && !done && (
            <span className="text-sm text-hb-ink-soft">Sprunget over</span>
          )}

          {next && (
            <Link
              to={`/akademiet/${next.item.area}/${next.item.slug}`}
              className="ml-auto flex items-center gap-1.5 text-sm text-hb-rust underline-offset-4 hover:underline"
            >
              Næste: {next.item.title}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </article>
    </div>
  );
};

const BackLink = ({ areaKey, label }: { areaKey: string; label: string }) => (
  <Link
    to={`/akademiet/${areaKey}`}
    className="flex items-center gap-2 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
  >
    <ArrowLeft className="h-4 w-4" />
    {label}
  </Link>
);
