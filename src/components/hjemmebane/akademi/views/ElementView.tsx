import * as React from "react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Download, ExternalLink, Lock, Undo2 } from "lucide-react";
import { AREAS, ITEM_TYPES, getAssetPreviewUrl } from "@/lib/hjemmebane/adminContentApi";
import { getOwnHandout, listItemAttachments } from "@/lib/hjemmebane/akademiApi";
import { handoutConfigs, type HandoutModule } from "@/lib/handoutConfig";
import { calcHandoutProgress } from "@/lib/handoutUtils";
import { useAuth } from "@/hooks/useAuth";
import { formatDuration } from "@/components/hjemmebane/admin/editors/shared";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HbVideoEmbed } from "../HbVideoEmbed";
import { isTrackedEntry, useAkademiData } from "../useAkademiData";

/** Materialer-listen (c3-vedhaeftninger-design.md §6): rolig sektion under
    medie + body, kun når der ER materialer. Storage-bilag åbnes via signeret
    URL; links eksternt. Ingen fremdriftssporing på bilag (B1 urørt). */
const MaterialsSection = ({ itemId, unlocked }: { itemId: string; unlocked: boolean }) => {
  const query = useQuery({
    queryKey: ["akademi", "attachments", itemId],
    queryFn: () => listItemAttachments(itemId),
    enabled: unlocked,
  });
  const attachments = query.data ?? [];
  if (attachments.length === 0) return null;

  const openStorage = async (path: string) => {
    const url = await getAssetPreviewUrl(path);
    window.open(url, "_blank", "noopener");
  };

  return (
    <section className="mt-8">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Materialer</p>
      <ul className="mt-3 space-y-1">
        {attachments.map((attachment) => (
          <li key={attachment.id}>
            {attachment.kind === "storage" && attachment.storage_path ? (
              <button
                type="button"
                onClick={() => void openStorage(attachment.storage_path as string)}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[15px] text-hb-ink transition-colors hover:bg-hb-sage/25"
              >
                <Download className="h-4 w-4 shrink-0 text-hb-ink-soft" />
                {attachment.label}
              </button>
            ) : attachment.external_url ? (
              <a
                href={attachment.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[15px] text-hb-ink transition-colors hover:bg-hb-sage/25"
              >
                <ExternalLink className="h-4 w-4 shrink-0 text-hb-ink-soft" />
                {attachment.label}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
};

/** Refleksionskortet (lektion→handout-kobling, fase 1): vises kun når
    item.handout_module er sat og elementet er dryp-ulåst. Status læses fra
    medlemmets EGEN handouts-række via getOwnHandout (self-only RLS dækker;
    advisors har typisk ingen række → "Ikke startet" — korrekt preview af
    medlemsstart). Definition + procent genbruger handoutConfigs/
    calcHandoutProgress — ingen duplikeret logik. Internt <Link> (aldrig
    _blank): refleksionerne bliver på platformen. */
const HandoutSection = ({ module, unlocked }: { module: string; unlocked: boolean }) => {
  const { user } = useAuth();
  const config = handoutConfigs[module as HandoutModule];
  const query = useQuery({
    queryKey: ["akademi", "handout", module],
    queryFn: () => getOwnHandout(user!.id, module),
    enabled: unlocked && !!config && !!user,
  });

  if (!config) return null; // ukendt nøgle (CHECK forhindrer det — defensivt)

  const row = query.data;
  const statusText =
    !row || row.status === "not_started"
      ? "Ikke startet"
      : row.status === "completed"
        ? "Udfyldt ✓"
        : `I gang · ${calcHandoutProgress(
            config,
            (row.responses as Record<string, string>) || {},
            (row.checklist as Record<string, boolean>) || {},
            (row.levers as string[]) || [],
          )} %`;

  return (
    <section className="mt-8 rounded-hb border border-hb-line bg-hb-sage/20 px-6 py-5">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Handout</p>
      <h2 className="mt-2 font-editorial text-xl font-medium text-hb-ink">{config.title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft">{config.subtitle}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link to={`/handouts?module=${module}`}>
          <HbButton variant="secondary">
            Åbn handoutet
            <ArrowRight className="h-4 w-4" />
          </HbButton>
        </Link>
        <span className="text-sm text-hb-ink-soft">{query.isLoading ? "" : statusText}</span>
      </div>
    </section>
  );
};

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

  // Model B1-video: sporings-UI (Gennemført/Spring over + prik) findes kun på
  // video-items; øvrige items er bibliotek. seen_at-skrivningen består for alle
  // (harmløs, kan få rolle senere) — afgrænsningen er ren UI. Prædikatet er
  // det delte isTrackedEntry (samme dom som prik, nævner og fortsæt/næste).
  const tracked = isTrackedEntry(entry);

  const acknowledge = () =>
    data.writeProgress(item.id, { acknowledged_at: new Date().toISOString() });
  /** Fortryd: nulstil kvitteringen — tilstanden falder automatisk tilbage
      (skipped → started → untouched), og genoptag-positionen genopstår. */
  const unacknowledge = () => data.writeProgress(item.id, { acknowledged_at: null });
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

        {item.handout_module && (
          <HandoutSection module={item.handout_module} unlocked={drip.unlocked} />
        )}

        <MaterialsSection itemId={item.id} unlocked={drip.unlocked} />

        <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-hb-line pt-6">
          {tracked && (
            <>
              {done ? (
                /* Toggle: klik på aktiv "Gennemført" fortryder (acknowledged_at
                   → null). Samme rolige pill-udtryk, diskret hover-cue. */
                <button
                  type="button"
                  onClick={unacknowledge}
                  title="Klik for at fortryde"
                  aria-label="Gennemført — klik for at fortryde"
                  className="group inline-flex items-center gap-2 rounded-full bg-hb-sage px-4 py-2 text-sm font-medium text-hb-ink transition-colors hover:bg-hb-sage/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60"
                >
                  {/* Diskret hover-cue: flueben → fortryd-pil; bredden er stabil. */}
                  <Check className="h-4 w-4 group-hover:hidden" />
                  <Undo2 className="hidden h-4 w-4 group-hover:block" />
                  Gennemført
                </button>
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
            </>
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
