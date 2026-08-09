import * as React from "react";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createItem,
  deleteItem,
  listItems,
  updateItem,
  type ContentItem,
} from "@/lib/hjemmebane/adminContentApi";
import { slugify } from "@/lib/hjemmebane/slug";
import { pickEvergreen } from "../../boardroom/pushSelection";
import { HbField, HbInput } from "../HbField";
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

/** Evergreen-fanen (forside PR B2 — PushView-forbilledet 1:1): det
    tidløse bibliotek (5-10 indslag UDEN udløb) der er forsidens
    SIKKERHEDSNET — pickEvergreen roterer deterministisk pr. ISO-uge.
    INTET udløbsfelt (evergreen er tidløs). Visningen viser hvilket
    indslag der roterer ind i indeværende uge (samme DELTE dom som
    forsiden — kurateringen skal være gennemskuelig), og advarer
    tydeligt hvis der er NUL publicerede indslag. */

type Draft = Partial<ContentItem>;
type DraftMap = Record<string, Draft>;

const uniqueSlugSuffix = () => crypto.randomUUID().slice(0, 8);

const EvergreenEditor = forwardRef<
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
    // Link er VALGFRIT på evergreen — men https-reglen (ItemEditor:52)
    // håndhæves når det er udfyldt.
    const candidateMeta = ((patch.metadata ?? form.metadata) as Record<string, unknown>) ?? {};
    const link = (candidateMeta.link as string) ?? "";
    if (link && !/^https:\/\/.+/.test(link)) {
      setError("Linket skal være en https-URL (eller stå tomt)");
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
      // Json-cast-mønstret fra UgensVideoView — ingen ny baseline-fejl.
      metadata: { ...((form.metadata as Record<string, unknown>) ?? {}), [key]: value || undefined } as ContentItem["metadata"],
    });

  return (
    <EditorShell
      eyebrow="Evergreen · Dit Boardroom"
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
      <HbField label="Titel" htmlFor="ev-title">
        <HbInput
          id="ev-title"
          value={form.title}
          onChange={(e) => onDraftChange({ title: e.target.value })}
        />
      </HbField>

      <HbField
        label="Hvorfor er det værd at se/læse?"
        htmlFor="ev-why"
        help="Én linje — indslaget er tidløst, så skriv den uden dato-referencer."
      >
        <HbInput
          id="ev-why"
          value={form.description ?? ""}
          onChange={(e) => onDraftChange({ description: e.target.value || null })}
        />
      </HbField>

      <HbField label="Link" htmlFor="ev-link" help="Valgfrit — https hvis udfyldt.">
        <HbInput
          id="ev-link"
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
    </EditorShell>
  );
});
EvergreenEditor.displayName = "EvergreenEditor";

export const EvergreenView = () => {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const editorRef = useRef<EditorHandle>(null);

  const itemsQuery = useQuery({
    queryKey: ["admin-content", "items", "evergreen"],
    queryFn: () => listItems("evergreen"),
  });
  const items = useMemo(
    () => [...(itemsQuery.data ?? [])].sort((a, b) => a.slug.localeCompare(b.slug)),
    [itemsQuery.data],
  );

  // Den DELTE rotationsdom — samme sandhed som forsiden (B3): hvilket
  // indslag roterer ind i INDEVÆRENDE uge?
  const published = items.filter((item) => item.status === "published");
  const thisWeeks = pickEvergreen(published, new Date());

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
        area: "evergreen",
        type: "push_indslag",
        title: "Uden titel",
        slug: `evergreen-${uniqueSlugSuffix()}`,
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
    const isThisWeeks = item.id === thisWeeks?.id;
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
        </span>
        {isThisWeeks && (
          <span className="shrink-0 rounded-full bg-hb-evergreen px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
            Denne uge
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
          {/* SKÆRPELSEN: nul publicerede = forsiden uden sikkerhedsnet. */}
          {!itemsQuery.isLoading && published.length === 0 && (
            <div className="flex items-start gap-2.5 border-b border-hb-rust/30 bg-hb-rust/5 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-hb-rust" />
              <p className="text-xs leading-relaxed text-hb-ink">
                <span className="font-medium text-hb-rust">Forsiden har intet sikkerhedsnet</span>{" "}
                — opret mindst ét evergreen-indslag, så hovedpladsen aldrig står tom.
              </p>
            </div>
          )}
          {thisWeeks && (
            <p className="border-b border-hb-line/60 bg-hb-sage/20 px-4 py-2 text-xs text-hb-ink-soft">
              Roterer ind i denne uge: <span className="font-medium text-hb-ink">{thisWeeks.title}</span>
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {itemsQuery.isLoading ? (
              <p className="px-4 py-6 text-sm text-hb-ink-soft">Henter…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-hb-ink-soft">
                Biblioteket er tomt — kuratér 5-10 tidløse indslag. De roterer automatisk
                én pr. uge og bærer forsiden, når alt andet er stille.
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
          <EvergreenEditor
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
              Vælg et indslag — eller opret nyt (n). Biblioteket roterer deterministisk pr.
              uge (alle medlemmer ser det samme) og er forsidens sikkerhedsnet.
            </p>
          </div>
        )
      }
    />
  );
};
