import * as React from "react";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createItem,
  deleteItem,
  listItems,
  updateItem,
  type ContentItem,
} from "@/lib/hjemmebane/adminContentApi";
import { slugify } from "@/lib/hjemmebane/slug";
import {
  byPublishedDesc,
  isPushExpired,
  pickActiveItem,
} from "../../boardroom/pushSelection";
import { HbField, HbInput, hbControlClasses } from "../HbField";
import { HbStatusPill } from "../HbStatusPill";
import { HbAdminSplit } from "../HbAdminShell";
import { HbUploadZone } from "../HbUploadZone";
import { useAdminHotkeys } from "../useAdminHotkeys";
import {
  EditorBar,
  EditorShell,
  isSlugUniqueError,
  type EditorAction,
  type EditorHandle,
} from "../editors/shared";

/** Redaktionelt-fanen (forside PR B2 — PushView/UgensVideo-forbilledet
    1:1): formålsbygget LET editor over SAMME datamodel (content_items,
    area='redaktionelt', type='push_indslag') — titel, hvorfor-linje,
    citat/link i metadata (jsonb-konventionen), cover m. Fjern-knap og
    udløb. Aktiv/udløbs-markeringerne genbruger de DELTE domme
    (pickActiveItem/isPushExpired) — én sandhed m. forsidens rykkeliste
    (B3). Migration 20260809170000 er kørt i prod 2026-08-09. */

type Draft = Partial<ContentItem>;
type DraftMap = Record<string, Draft>;

const uniqueSlugSuffix = () => crypto.randomUUID().slice(0, 8);

const RedaktioneltEditor = forwardRef<
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

  const form = { ...item, ...draft } as ContentItem;
  const dirty = Object.keys(draft).length > 0;
  const metadata = (form.metadata as Record<string, unknown>) ?? {};

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

  const persist = (extra: Draft = {}) => {
    if (mutation.isPending) return;
    setError(null);
    const patch: Draft = { ...draft, ...extra };
    // Linket er indslagets kerne (recon: "titel, billede, hvorfor-linje,
    // link, evt. citat") — https-reglen ordret fra ItemEditor:52.
    const candidateMeta = ((patch.metadata ?? form.metadata) as Record<string, unknown>) ?? {};
    const link = (candidateMeta.link as string) ?? "";
    if (!/^https:\/\/.+/.test(link)) {
      setError("Indslaget skal have et link (https://…)");
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
      // Json-cast-mønstret fra UgensVideoView — tilføjer ingen ny baseline-fejl.
      metadata: { ...((form.metadata as Record<string, unknown>) ?? {}), [key]: value || undefined } as ContentItem["metadata"],
    });

  return (
    <EditorShell
      eyebrow="Redaktionelt · Dit Boardroom"
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
      <HbField label="Titel" htmlFor="red-title">
        <HbInput
          id="red-title"
          value={form.title}
          onChange={(e) => onDraftChange({ title: e.target.value })}
        />
      </HbField>

      <HbField
        label="Hvorfor er det værd at læse?"
        htmlFor="red-why"
        help="Én linje — vises sammen med indslaget på forsiden."
      >
        <HbInput
          id="red-why"
          value={form.description ?? ""}
          onChange={(e) => onDraftChange({ description: e.target.value || null })}
        />
      </HbField>

      <HbField label="Citat" htmlFor="red-quote" help="Valgfrit — et pull-quote fra indslaget.">
        <HbInput
          id="red-quote"
          value={(metadata.quote as string) ?? ""}
          onChange={(e) => setMeta("quote", e.target.value)}
        />
      </HbField>

      <HbField label="Link" htmlFor="red-link" help="Hvor indslaget bor (blog, LinkedIn m.m.) — kræver https.">
        <HbInput
          id="red-link"
          placeholder="https://…"
          value={(metadata.link as string) ?? ""}
          onChange={(e) => setMeta("link", e.target.value)}
        />
      </HbField>

      <HbField label="Cover" help="Valgfrit billede — giver indslaget visuel vægt på forsiden.">
        <HbUploadZone
          kind="covers"
          ownerId={item.id}
          currentPath={form.cover_path ?? null}
          accept="image/*"
          onUploaded={(path) => onDraftChange({ cover_path: path })}
          onCleared={() => onDraftChange({ cover_path: null })}
        />
      </HbField>

      <HbField
        label="Vises til og med"
        htmlFor="red-expires"
        help="Valgfri — efter denne dag falder indslaget tilbage. Tom = vises til afløst af nyere."
      >
        <HbInput
          id="red-expires"
          type="date"
          className={cn(hbControlClasses, "max-w-xs")}
          value={(metadata.expires_at as string) ?? ""}
          onChange={(e) => setMeta("expires_at", e.target.value)}
        />
      </HbField>
    </EditorShell>
  );
});
RedaktioneltEditor.displayName = "RedaktioneltEditor";

export const RedaktioneltView = () => {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const editorRef = useRef<EditorHandle>(null);

  const itemsQuery = useQuery({
    queryKey: ["admin-content", "items", "redaktionelt"],
    queryFn: () => listItems("redaktionelt"),
  });
  const items = useMemo(
    () => [...(itemsQuery.data ?? [])].sort(byPublishedDesc),
    [itemsQuery.data],
  );

  // De DELTE domme — samme sandhed som forsidens rykkeliste (B3).
  const now = new Date();
  const activeItem = pickActiveItem(
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
        area: "redaktionelt",
        type: "push_indslag",
        title: "Uden titel",
        slug: `redaktionelt-${uniqueSlugSuffix()}`,
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
    const isActiveNow = item.id === activeItem?.id;
    const expired = item.status === "published" && isPushExpired(item, now);
    const date = item.published_at
      ? new Date(item.published_at).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" })
      : null;
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
          {date && <span className="block text-xs text-hb-ink-soft">{date}</span>}
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
                Ingen redaktionelle indslag endnu — opret det første. Nyeste publicerede,
                ikke-udløbne kandiderer til forsidens hovedplads.
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
              Nyt indslag
              <span className="ml-auto font-mono text-xs text-hb-ink-soft/70">n</span>
            </button>
          </div>
        </div>
      }
      editor={
        selected ? (
          <RedaktioneltEditor
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
              Vælg et indslag — eller opret nyt (n). Nyeste publicerede, ikke-udløbne indslag
              kandiderer til forsidens hovedplads; "Vises til og med" styrer udløb.
            </p>
          </div>
        )
      }
    />
  );
};
