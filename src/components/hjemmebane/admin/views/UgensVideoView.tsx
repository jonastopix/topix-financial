import * as React from "react";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AREAS,
  createItem,
  deleteItem,
  listCollections,
  listItems,
  updateItem,
  type ContentItem,
} from "@/lib/hjemmebane/adminContentApi";
import { slugify } from "@/lib/hjemmebane/slug";
import {
  byPublishedDesc,
  isPushExpired,
  pickActiveWeekVideo,
} from "../../boardroom/pushSelection";
import { HbField, HbInput, hbControlClasses } from "../HbField";
import { HbStatusPill } from "../HbStatusPill";
import { HbAdminSplit } from "../HbAdminShell";
import { useAdminHotkeys } from "../useAdminHotkeys";
import {
  EditorBar,
  EditorShell,
  formatDuration,
  isSlugUniqueError,
  type EditorAction,
  type EditorHandle,
} from "../editors/shared";

/** Ugens video-fanen (forside bølge 1, PR 2 — PushView-forbilledet 1:1):
    formålsbygget LET editor over SAMME datamodel (content_items,
    area='ugens_video', type='video') — titel, hvorfor-linje, KILDE
    (Akademi-indhold / Bunny-id / ekstern https-URL via de EKSISTERENDE
    media-kolonner), udløb og publicér/kladde. Aktiv/udløbs-markeringerne
    genbruger pickActiveWeekVideo/isPushExpired — én sandhed med forsidens
    kommende visning (PR 3). Ingen nye tabeller/kolonner; migration
    20260809140000 (area-CHECK) er kørt i prod 2026-08-09. */

type Draft = Partial<ContentItem>;
type DraftMap = Record<string, Draft>;

const uniqueSlugSuffix = () => crypto.randomUUID().slice(0, 8);

/** Kilde-tilstanden afledes af media-kolonnerne (ingen ekstra state i DB). */
type SourceMode = "akademi" | "bunny" | "external";

/** Kilde-areas (fix/ugens-video-kilder): alle medlemsvendte content-areas
    der kan bære video — IKKE 'push'/'ugens_video' (kuraterings-kanaler,
    ikke kilder) og ikke 'rabataftaler'. Labels slås op i AREAS. */
const SOURCE_AREAS = ["talks", "classroom", "academy", "quick_wins", "start_her"] as const;

const areaLabel = (key: string) => AREAS.find((a) => a.key === key)?.label ?? key;

const sourceModeOf = (form: ContentItem): SourceMode =>
  form.media_provider === "external" ? "external" : "bunny";

const VideoEditor = forwardRef<
  EditorHandle,
  {
    item: ContentItem;
    draft: Draft;
    onDraftChange: (patch: Draft) => void;
    onSaved: () => void;
    onDeleted: () => void;
  }
>(({ item, draft, onDraftChange, onSaved, onDeleted }, ref) => {
  const queryClient = useQueryClient();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode | null>(null);
  const [search, setSearch] = useState("");

  const form = { ...item, ...draft } as ContentItem;
  const dirty = Object.keys(draft).length > 0;
  const metadata = (form.metadata as Record<string, unknown>) ?? {};
  const mode = sourceMode ?? sourceModeOf(form);

  // (i) Akademi-indhold: eksisterende Bunny-videoer fra ALLE medlemsvendte
  // content-areas m. video-indhold (fix/ugens-video-kilder — admin-testens
  // fund: kun Fundamentet, dengang "Grundforløbet", dukkede op). IKKE
  // push/ugens_video (kuraterings-
  // kanaler, ikke kilder) og ikke rabataftaler. Valg KOPIERER bunny_video_id
  // (én sandhed er media-kolonnerne; intet link tilbage, bevidst simpelt).
  // KUN published — kladder er ikke kilder (status-dommen som
  // PushView:307 `item.status === "published"` / akademiApi:39
  // `.eq("status", "published")`). Areas helt uden video-items vises ikke.
  const akademiQuery = useQuery({
    queryKey: ["admin-ugens-video", "video-kilder"],
    queryFn: async () => {
      const [itemLists, collectionLists] = await Promise.all([
        Promise.all(SOURCE_AREAS.map((area) => listItems(area))),
        Promise.all(SOURCE_AREAS.map((area) => listCollections(area))),
      ]);
      const collectionTitle = new Map(collectionLists.flat().map((c) => [c.id, c.title]));
      const sources = itemLists
        .flat()
        .filter((i) => i.status === "published" && i.media_provider === "bunny" && i.bunny_video_id);
      return { sources, collectionTitle };
    },
    staleTime: 5 * 60_000,
  });

  // Grupperet + søgbar: søgningen matcher titel OG område-label; grupper
  // uden match/indhold udelades (ingen tomme overskrifter).
  const groupedSources = useMemo(() => {
    const q = search.trim().toLowerCase();
    const data = akademiQuery.data;
    if (!data) return [];
    const matches = (i: ContentItem) =>
      !q || i.title.toLowerCase().includes(q) || areaLabel(i.area).toLowerCase().includes(q);
    return SOURCE_AREAS.map((area) => ({
      area,
      label: areaLabel(area),
      items: data.sources.filter((i) => i.area === area && matches(i)),
    })).filter((group) => group.items.length > 0);
  }, [akademiQuery.data, search]);

  const saveWithSlugRetry = async (patch: Draft): Promise<ContentItem> => {
    try {
      return await updateItem(item.id, patch);
    } catch (err) {
      if (err instanceof Error && isSlugUniqueError(err.message) && patch.slug) {
        return await updateItem(item.id, { ...patch, slug: `${patch.slug}-${uniqueSlugSuffix()}` });
      }
      throw err;
    }
  };

  const mutation = useMutation({
    mutationFn: saveWithSlugRetry,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
      setSavedAt(new Date());
      setError(null);
      onSaved();
    },
    onError: (err: Error) => setError(err.message),
  });

  // Medie-validering — reglerne ordret fra ItemEditor (Bunny kræver id;
  // ekstern kræver https-URL, /^https:\/\/.+/-testen).
  const mediaError = (candidate: ContentItem): string | null => {
    if (candidate.media_provider === "bunny") {
      return candidate.bunny_video_id?.trim() ? null : "Vælg en video eller angiv et Bunny video-ID";
    }
    if (candidate.media_provider === "external") {
      return /^https:\/\/.+/.test(candidate.external_url ?? "")
        ? null
        : "Ekstern video kræver en https-URL";
    }
    return "Vælg en kilde til videoen";
  };

  const persist = (extra: Draft = {}) => {
    if (mutation.isPending) return;
    setError(null);
    const patch: Draft = { ...draft, ...extra };
    const candidate = { ...item, ...patch } as ContentItem;
    const invalid = mediaError(candidate);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (Object.keys(patch).length === 0) {
      setSavedAt(new Date());
      return;
    }
    const derived = slugify(String(patch.title ?? form.title));
    if (derived && derived !== item.slug) patch.slug = derived;
    mutation.mutate(patch);
  };

  const publish = () =>
    persist({
      status: "published",
      published_at: form.published_at ?? new Date().toISOString(),
    });

  useImperativeHandle(ref, () => ({ save: () => persist(), publish }));

  const deleteMutation = useMutation({
    mutationFn: () => deleteItem(item.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
      onDeleted();
    },
    onError: (err: Error) => setError(err.message),
  });

  const actions: EditorAction[] =
    form.status === "published"
      ? [
          { label: "Tilbage til kladde", onClick: () => persist({ status: "draft" }), variant: "secondary" },
          { label: "Arkivér", onClick: () => persist({ status: "archived" }), variant: "link" },
        ]
      : form.status === "archived"
        ? [{ label: "Gendan som kladde", onClick: () => persist({ status: "draft" }), variant: "primary" }]
        : [
            { label: "Publicér", onClick: publish, variant: "primary" },
            { label: "Arkivér", onClick: () => persist({ status: "archived" }), variant: "link" },
          ];

  const setMeta = (key: string, value: string) =>
    onDraftChange({
      // Cast: metadata er Json-typet; PushViews ucastede pendant er netop
      // en af de 4 kendte baseline-fejl — nyt kode tilføjer ikke en femte.
      metadata: { ...((form.metadata as Record<string, unknown>) ?? {}), [key]: value || undefined } as ContentItem["metadata"],
    });

  const chooseAkademi = (source: ContentItem) => {
    onDraftChange({ media_provider: "bunny", bunny_video_id: source.bunny_video_id, external_url: null });
    setSearch(source.title);
  };

  const modeButton = (value: SourceMode, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setSourceMode(value)}
      className={cn(
        "rounded-full border px-4 py-1.5 text-sm transition-colors",
        mode === value
          ? "border-hb-evergreen bg-hb-evergreen text-white"
          : "border-hb-line text-hb-ink-soft hover:border-hb-evergreen/50 hover:text-hb-ink",
      )}
    >
      {label}
    </button>
  );

  return (
    <EditorShell
      eyebrow="Ugens video · Dit Boardroom"
      title={form.title}
      footer={
        <EditorBar
          status={form.status}
          dirty={dirty}
          saving={mutation.isPending}
          savedAt={savedAt}
          error={error}
          onSave={() => persist()}
          actions={actions}
          deleteSpec={
            form.status === "archived"
              ? {
                  entityLabel: form.title || "Uden titel",
                  deleting: deleteMutation.isPending,
                  onDelete: () => deleteMutation.mutate(),
                }
              : undefined
          }
        />
      }
    >
      <HbField label="Titel" htmlFor="uv-title">
        <HbInput
          id="uv-title"
          value={form.title}
          onChange={(e) => onDraftChange({ title: e.target.value })}
        />
      </HbField>

      <HbField
        label="Hvorfor skal du se den?"
        htmlFor="uv-why"
        help="Én linje — vises sammen med videoen på forsiden."
      >
        <HbInput
          id="uv-why"
          value={form.description ?? ""}
          onChange={(e) => onDraftChange({ description: e.target.value || null })}
        />
      </HbField>

      <HbField label="Kilde" help="Akademi-valg kopierer videoens Bunny-ID; ekstern kræver https.">
        <div className="flex flex-wrap items-center gap-2">
          {modeButton("akademi", "Fra Akademiet")}
          {modeButton("bunny", "Bunny video-ID")}
          {modeButton("external", "Ekstern URL")}
        </div>

        {mode === "akademi" && (
          <div className="mt-3">
            <HbInput
              placeholder="Søg på titel eller område…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-hb-line">
              {akademiQuery.isLoading ? (
                <p className="px-3 py-2.5 text-sm text-hb-ink-soft">Henter…</p>
              ) : groupedSources.length === 0 ? (
                <p className="px-3 py-2.5 text-sm text-hb-ink-soft">Ingen video-match — prøv en anden søgning.</p>
              ) : (
                groupedSources.map((group) => (
                  <div key={group.area}>
                    <p className="sticky top-0 border-b border-hb-line/60 bg-hb-sage/30 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                      {group.label}
                    </p>
                    {group.items.map((source) => {
                      const chosen = form.media_provider === "bunny" && form.bunny_video_id === source.bunny_video_id;
                      const collection = source.collection_id
                        ? akademiQuery.data?.collectionTitle.get(source.collection_id) ?? null
                        : null;
                      const subline = [collection, source.duration_seconds != null ? formatDuration(source.duration_seconds) : null]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <button
                          key={source.id}
                          type="button"
                          onClick={() => chooseAkademi(source)}
                          className={cn(
                            "flex w-full items-center gap-2 border-b border-hb-line/60 px-3 py-2 text-left text-sm transition-colors last:border-b-0",
                            chosen ? "bg-hb-sage/40 text-hb-ink" : "text-hb-ink hover:bg-hb-sage/20",
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{source.title}</span>
                            {subline && <span className="block truncate text-xs text-hb-ink-soft">{subline}</span>}
                          </span>
                          {chosen && <span className="shrink-0 text-xs text-hb-evergreen">Valgt ✓</span>}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {mode === "bunny" && (
          <div className="mt-3">
            <HbInput
              placeholder="Bunny video-ID (guid)"
              value={form.bunny_video_id ?? ""}
              onChange={(e) =>
                onDraftChange({ media_provider: "bunny", bunny_video_id: e.target.value || null, external_url: null })
              }
            />
          </div>
        )}

        {mode === "external" && (
          <div className="mt-3">
            <HbInput
              placeholder="https://…"
              value={form.external_url ?? ""}
              onChange={(e) =>
                onDraftChange({ media_provider: "external", external_url: e.target.value || null, bunny_video_id: null })
              }
            />
          </div>
        )}
      </HbField>

      <HbField
        label="Vises til og med"
        htmlFor="uv-expires"
        help="Valgfri — efter denne dag falder ugens video tilbage. Tom = vises til afløst af nyere."
      >
        <HbInput
          id="uv-expires"
          type="date"
          className={cn(hbControlClasses, "max-w-xs")}
          value={(metadata.expires_at as string) ?? ""}
          onChange={(e) => setMeta("expires_at", e.target.value)}
        />
      </HbField>
    </EditorShell>
  );
});
VideoEditor.displayName = "VideoEditor";

export const UgensVideoView = () => {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const editorRef = useRef<EditorHandle>(null);

  const itemsQuery = useQuery({
    queryKey: ["admin-content", "items", "ugens_video"],
    queryFn: () => listItems("ugens_video"),
  });
  const items = useMemo(
    () => [...(itemsQuery.data ?? [])].sort(byPublishedDesc),
    [itemsQuery.data],
  );

  // Aktiv/udløbs-dommene — samme rene funktioner som forsidens visning (PR 3).
  const now = new Date();
  const activeVideo = pickActiveWeekVideo(
    items.filter((item) => item.status === "published"),
    now,
  );

  const selected = items.find((item) => item.id === selectedId);
  const hasDrafts = Object.values(drafts).some((d) => Object.keys(d).length > 0);

  React.useEffect(() => {
    if (!hasDrafts) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasDrafts]);

  const setDraft = (patch: Draft) => {
    if (!selectedId) return;
    setDrafts((prev) => ({ ...prev, [selectedId]: { ...prev[selectedId], ...patch } }));
  };
  const clearDraft = () => {
    if (!selectedId) return;
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[selectedId];
      return next;
    });
  };

  const newMutation = useMutation({
    mutationFn: () =>
      createItem({
        area: "ugens_video",
        type: "video",
        title: "Uden titel",
        slug: `ugens-video-${uniqueSlugSuffix()}`,
        position: 0,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
      setSelectedId(created.id);
    },
  });

  useAdminHotkeys({
    onSave: () => editorRef.current?.save(),
    onPublish: () => editorRef.current?.publish(),
    onNew: () => newMutation.mutate(),
    onEscape: () => setSelectedId(null),
  });

  const listRow = (item: ContentItem) => {
    const active = item.id === selectedId;
    const dirty = Object.keys(drafts[item.id] ?? {}).length > 0;
    const isActiveNow = item.id === activeVideo?.id;
    const expired = item.status === "published" && isPushExpired(item, now);
    const date = item.published_at
      ? new Date(item.published_at).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" })
      : null;
    const sourceLabel = item.media_provider === "external" ? "Ekstern" : item.bunny_video_id ? "Bunny" : "Ingen kilde";
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => setSelectedId(item.id)}
        className={cn(
          "flex w-full items-center gap-2.5 border-b border-hb-line/60 px-4 py-3 text-left transition-colors",
          active ? "bg-hb-sage/40" : "hover:bg-hb-sage/20",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {dirty && <span aria-label="Ugemte ændringer" className="h-1.5 w-1.5 shrink-0 rounded-full bg-hb-rust" />}
            <span className="truncate text-sm text-hb-ink">{item.title || "Uden titel"}</span>
          </span>
          <span className="block text-xs text-hb-ink-soft">
            {sourceLabel}
            {date && ` · ${date}`}
          </span>
        </span>
        {isActiveNow && (
          <span className="shrink-0 rounded-full bg-hb-evergreen px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
            Aktiv nu
          </span>
        )}
        {expired && !isActiveNow && (
          <span className="shrink-0 rounded-full border border-hb-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-hb-ink-soft">
            Udløbet
          </span>
        )}
        <HbStatusPill status={item.status} />
      </button>
    );
  };

  return (
    <HbAdminSplit
      editorOpen={selectedId !== null}
      onCloseEditor={() => setSelectedId(null)}
      list={
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {itemsQuery.isLoading ? (
              <p className="px-4 py-6 text-sm text-hb-ink-soft">Henter…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-hb-ink-soft">
                Ingen videoer endnu — opret den første. Seneste publicerede, ikke-udløbne er ugens
                video på forsiden.
              </p>
            ) : (
              items.map(listRow)
            )}
          </div>
          <div className="shrink-0 border-t border-hb-line p-2">
            <button
              type="button"
              onClick={() => newMutation.mutate()}
              disabled={newMutation.isPending}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-hb-ink-soft transition-colors hover:bg-hb-sage/25 hover:text-hb-ink"
            >
              <Plus className="h-4 w-4" />
              Ny video
              <span className="ml-auto font-mono text-xs text-hb-ink-soft/70">n</span>
            </button>
          </div>
        </div>
      }
      editor={
        selected ? (
          <VideoEditor
            ref={editorRef}
            key={selected.id}
            item={selected}
            draft={drafts[selected.id] ?? {}}
            onDraftChange={setDraft}
            onSaved={clearDraft}
            onDeleted={() => {
              clearDraft();
              setSelectedId(null);
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-hb-surface px-10">
            <p className="max-w-sm text-sm leading-relaxed text-hb-ink-soft">
              Vælg en video — eller opret ny (n). Seneste publicerede, ikke-udløbne er ugens video
              på forsiden; "Vises til og med" styrer udløb.
            </p>
          </div>
        )
      }
    />
  );
};
