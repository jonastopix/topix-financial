import * as React from "react";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  AREAS,
  type AreaKey,
  type ContentCollection,
  type ContentItem,
  ITEM_TYPES,
  createCollection,
  createItem,
  listCollections,
  listItems,
  listPartners,
  persistOrder,
} from "@/lib/hjemmebane/adminContentApi";
import { cn } from "@/lib/utils";
import { HbAdminSplit } from "../HbAdminShell";
import { HbTreeList, type HbListRow } from "../HbTreeList";
import { useAdminHotkeys } from "../useAdminHotkeys";
import { CollectionEditor } from "../editors/CollectionEditor";
import { ItemEditor } from "../editors/ItemEditor";
import { EditorEmptyState, formatDuration, type EditorHandle } from "../editors/shared";

type Selection = { kind: "collection" | "item"; id: string } | null;
type DraftMap = Record<string, Record<string, unknown>>;

/** Nyt indhold får en områdetypisk default-type — ét klik mindre. */
const DEFAULT_TYPE: Record<AreaKey, string> = {
  start_her: "lektion",
  classroom: "lektion",
  academy: "lektion",
  skabeloner: "skabelon",
  talks: "episode",
  quick_wins: "video",
  push: "push_indslag",
  ugens_video: "video",
  redaktionelt: "push_indslag",
  evergreen: "push_indslag",
};

const uniqueSlugSuffix = () => crypto.randomUUID().slice(0, 8);

const byPosition = <T extends { position: number; created_at: string }>(a: T, b: T) =>
  a.position - b.position || a.created_at.localeCompare(b.created_at);

export const ContentView = () => {
  const queryClient = useQueryClient();
  const [area, setArea] = useState<AreaKey>("start_her");
  const [selection, setSelection] = useState<Selection>(null);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorHandle>(null);

  const collectionsQuery = useQuery({
    queryKey: ["admin-content", "collections", area],
    queryFn: () => listCollections(area),
  });
  const itemsQuery = useQuery({
    queryKey: ["admin-content", "items", area],
    queryFn: () => listItems(area),
  });
  const partnersQuery = useQuery({ queryKey: ["admin-partners"], queryFn: listPartners });

  const collections = useMemo(
    () => [...(collectionsQuery.data ?? [])].sort(byPosition),
    [collectionsQuery.data],
  );
  const items = useMemo(() => [...(itemsQuery.data ?? [])].sort(byPosition), [itemsQuery.data]);

  // Drafts overlever selektionsskift — ingen blokerende "vil du gemme?"-dialog.
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

  const typeLabel = (type: string) => ITEM_TYPES.find((t) => t.key === type)?.label ?? type;

  const itemRow = (item: ContentItem, depth: number): HbListRow => ({
    id: item.id,
    kind: "item",
    depth,
    title: item.title,
    meta: [typeLabel(item.type), formatDuration(item.duration_seconds)].filter(Boolean).join(" · "),
    status: item.status,
    groupKey: `items:${item.collection_id ?? "root"}`,
    canReorder: search === "",
  });

  const { rows, archivedRows } = useMemo(() => {
    const active: HbListRow[] = [];
    const archived: HbListRow[] = [];
    const query = search.trim().toLowerCase();

    if (query) {
      for (const collection of collections)
        if (collection.title.toLowerCase().includes(query))
          active.push(collectionRow(collection, 0, true));
      for (const item of items)
        if (item.title.toLowerCase().includes(query)) active.push({ ...itemRow(item, 0), canReorder: false });
      return { rows: active, archivedRows: [] };
    }

    const activeCollections = collections.filter((c) => c.status !== "archived");
    const archivedCollectionIds = new Set(
      collections.filter((c) => c.status === "archived").map((c) => c.id),
    );
    const childrenOf = (parentId: string | null) =>
      activeCollections.filter((c) => (c.parent_id ?? null) === parentId);
    const itemsOf = (collectionId: string | null) =>
      items.filter(
        (i) =>
          (i.collection_id ?? null) === collectionId ||
          // items i arkiverede samlinger vises løst, så de ikke forsvinder
          (collectionId === null && i.collection_id && archivedCollectionIds.has(i.collection_id)),
      );

    const pushItem = (item: ContentItem, depth: number) =>
      (item.status === "archived" ? archived : active).push(
        itemRow(item, item.status === "archived" ? 0 : depth),
      );

    for (const item of itemsOf(null)) pushItem(item, 0);
    for (const root of childrenOf(null)) {
      active.push(collectionRow(root, 0, false));
      for (const item of itemsOf(root.id)) pushItem(item, 1);
      for (const child of childrenOf(root.id)) {
        active.push(collectionRow(child, 1, false));
        for (const item of itemsOf(child.id)) pushItem(item, 2);
      }
    }
    for (const collection of collections.filter((c) => c.status === "archived"))
      archived.push(collectionRow(collection, 0, false));

    return { rows: active, archivedRows: archived };

    function collectionRow(collection: ContentCollection, depth: number, searching: boolean): HbListRow {
      const count = items.filter((i) => i.collection_id === collection.id).length;
      return {
        id: collection.id,
        kind: "collection",
        depth,
        title: collection.title,
        meta: `Samling · ${count} element${count === 1 ? "" : "er"}`,
        status: collection.status,
        groupKey: `collections:${collection.parent_id ?? "root"}`,
        canReorder: !searching,
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections, items, search]);

  // ── Selektion, drafts og editor-kontrakt ────────────────────────────────
  const selectedCollection =
    selection?.kind === "collection" ? collections.find((c) => c.id === selection.id) : undefined;
  const selectedItem = selection?.kind === "item" ? items.find((i) => i.id === selection.id) : undefined;
  const draftKey = selection ? `${selection.kind}:${selection.id}` : null;
  const dirtyIds = useMemo(
    () => new Set(Object.keys(drafts).filter((key) => Object.keys(drafts[key]).length > 0)),
    [drafts],
  );

  const setDraft = (patch: Record<string, unknown>) => {
    if (!draftKey) return;
    setDrafts((prev) => ({ ...prev, [draftKey]: { ...prev[draftKey], ...patch } }));
  };
  const clearDraft = () => {
    if (!draftKey) return;
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
  };

  // ── Oprettelse ──────────────────────────────────────────────────────────
  const newCollectionMutation = useMutation({
    mutationFn: () =>
      createCollection({
        area,
        title: "Uden titel",
        slug: `samling-${uniqueSlugSuffix()}`,
        position: collections.filter((c) => !c.parent_id).length,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
      setSelection({ kind: "collection", id: created.id });
    },
  });

  const contextCollectionId =
    selectedCollection?.id ?? selectedItem?.collection_id ?? null;

  const newItemMutation = useMutation({
    mutationFn: () =>
      createItem({
        area,
        collection_id: contextCollectionId,
        type: DEFAULT_TYPE[area],
        title: "Uden titel",
        slug: `uden-titel-${uniqueSlugSuffix()}`,
        position: items.filter((i) => (i.collection_id ?? null) === contextCollectionId).length,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
      setSelection({ kind: "item", id: created.id });
    },
  });

  // ── Rækkefølge (optimistisk cache-patch + persistering) ─────────────────
  const applyOrder = (row: HbListRow, orderedIds: string[]) => {
    const table = row.kind === "collection" ? "content_collections" : "content_items";
    const key =
      row.kind === "collection"
        ? ["admin-content", "collections", area]
        : ["admin-content", "items", area];
    queryClient.setQueryData(key, (old: { id: string; position: number }[] | undefined) =>
      old?.map((entity) =>
        orderedIds.includes(entity.id)
          ? { ...entity, position: orderedIds.indexOf(entity.id) }
          : entity,
      ),
    );
    persistOrder(table, orderedIds).catch(() => {
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
    });
  };

  const siblingIds = (row: HbListRow): string[] =>
    row.kind === "collection"
      ? collections
          .filter((c) => c.status !== "archived" && `collections:${c.parent_id ?? "root"}` === row.groupKey)
          .map((c) => c.id)
      : items
          .filter((i) => i.status !== "archived" && `items:${i.collection_id ?? "root"}` === row.groupKey)
          .map((i) => i.id);

  const onMoveStep = (row: HbListRow, delta: -1 | 1) => {
    const ids = siblingIds(row);
    const index = ids.indexOf(row.id);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    applyOrder(row, next);
  };

  const onDropOn = (sourceId: string, target: HbListRow) => {
    const ids = siblingIds(target).filter((id) => id !== sourceId);
    const targetIndex = ids.indexOf(target.id);
    if (targetIndex === -1) return;
    ids.splice(targetIndex, 0, sourceId);
    applyOrder(target, ids);
  };

  // ── Hotkeys: ⌘S/⌘⇧P → editor; n → nyt indhold; / → søg; Esc → luk ──────
  useAdminHotkeys({
    onSave: () => editorRef.current?.save(),
    onPublish: () => editorRef.current?.publish(),
    onNew: () => newItemMutation.mutate(),
    onSearch: () => searchRef.current?.focus(),
    onEscape: () => setSelection(null),
  });

  const onDeleted = () => {
    clearDraft();
    setSelection(null);
  };

  const editor = selectedCollection ? (
    <CollectionEditor
      ref={editorRef}
      key={selectedCollection.id}
      collection={selectedCollection}
      rootCollections={collections.filter((c) => !c.parent_id && c.status !== "archived")}
      containedCount={
        items.filter((i) => i.collection_id === selectedCollection.id).length +
        collections.filter((c) => c.parent_id === selectedCollection.id).length
      }
      draft={drafts[`collection:${selectedCollection.id}`] ?? {}}
      onDraftChange={setDraft}
      onSaved={clearDraft}
      onDeleted={onDeleted}
    />
  ) : selectedItem ? (
    <ItemEditor
      ref={editorRef}
      key={selectedItem.id}
      item={selectedItem}
      collections={collections.filter((c) => c.status !== "archived")}
      partners={partnersQuery.data ?? []}
      draft={drafts[`item:${selectedItem.id}`] ?? {}}
      onDraftChange={setDraft}
      onSaved={clearDraft}
      onDeleted={onDeleted}
    />
  ) : (
    <EditorEmptyState
      hints={[
        ["↑ ↓", "navigér i listen"],
        ["n", "nyt indhold i aktuel kontekst"],
        ["⌘S", "gem"],
        ["⌘⇧P", "publicér"],
        ["⌥↑ ⌥↓", "flyt rækkefølge"],
        ["/", "søg"],
      ]}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-hb-line px-4 pb-2.5 pt-2.5">
        <div role="tablist" aria-label="Områder" className="flex flex-wrap items-center gap-1.5">
          {/* Kun forløbsområder — push redigeres i Dit Boardroom-fanen
              (Admin-spejlet, konvergens.md §5); samme akademi-flag som
              medlemsfladen gater på. */}
          {AREAS.filter((entry) => entry.akademi).map((entry) => {
            const active = entry.key === area;
            return (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setArea(entry.key);
                  setSelection(null);
                  setSearch("");
                }}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-hb-sage font-medium text-hb-ink"
                    : "text-hb-ink-soft hover:bg-hb-sage/30 hover:text-hb-ink",
                )}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
        {/* Stille hjælpelinje for det valgte område. */}
        <p className="mt-1.5 px-1 text-xs text-hb-ink-soft">
          {AREAS.find((entry) => entry.key === area)?.hint}
        </p>
      </div>

      <div className="min-h-0 flex-1">
        <HbAdminSplit
          editorOpen={selection !== null}
          onCloseEditor={() => setSelection(null)}
          list={
            <HbTreeList
              rows={rows}
              archivedRows={archivedRows}
              selectedId={selection?.id ?? null}
              onSelect={(row) => setSelection({ kind: row.kind as "collection" | "item", id: row.id })}
              onMoveStep={onMoveStep}
              onDropOn={onDropOn}
              dirtyIds={dirtyIds}
              searchValue={search}
              onSearchChange={setSearch}
              searchRef={searchRef}
              headerAction={
                <button
                  type="button"
                  onClick={() => newCollectionMutation.mutate()}
                  disabled={newCollectionMutation.isPending}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-hb-line px-3 py-2 text-sm text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
                >
                  <Plus className="h-3.5 w-3.5" /> Samling
                </button>
              }
              footerAction={
                <button
                  type="button"
                  onClick={() => newItemMutation.mutate()}
                  disabled={newItemMutation.isPending}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-hb-ink-soft transition-colors hover:bg-hb-sage/25 hover:text-hb-ink"
                >
                  <Plus className="h-4 w-4" />
                  Nyt indhold{selectedCollection ? ` i "${selectedCollection.title}"` : ""}
                  <span className="ml-auto font-mono text-xs text-hb-ink-soft/70">n</span>
                </button>
              }
              emptyText={
                collectionsQuery.isLoading || itemsQuery.isLoading
                  ? "Henter…"
                  : "Området er tomt. Opret en samling eller nyt indhold — alt starter som kladde."
              }
            />
          }
          editor={editor}
        />
      </div>
    </div>
  );
};
