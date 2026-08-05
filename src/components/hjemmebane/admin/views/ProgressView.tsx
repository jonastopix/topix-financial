import * as React from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AREAS,
  batchAcknowledge,
  clearAcknowledge,
  listAllMemberProgress,
  listMembers,
  type AdminMember,
  type AdminProgressRow,
  type ContentCollection,
  type ContentItem,
} from "@/lib/hjemmebane/adminContentApi";
import {
  itemProgressState,
  listPublishedCollections,
  listPublishedItems,
  type ItemProgressState,
} from "@/lib/hjemmebane/akademiApi";
import { isTrackedItem } from "../../akademi/useAkademiData";
import { hbControlClasses } from "../HbField";
import { HbAdminSplit } from "../HbAdminShell";

/** Fremdrift-fanen (advisor-værktøjet): overblik over ALLE medlemmers
    Akademi-fremdrift + manuel markering (enkelt-toggle + "Markér hele
    modulet"-batch) som ægte member_progress.acknowledged_at — medlemmet
    ser Gennemført som var det selvsat (kildeløst; accepteret vilkår,
    baseline). Kun TRACKED items (B1-video) vises og skrives; dryp er
    bevidst droppet i advisor-visningen (råt done/total). Én samlet
    progress-nøgle ["admin-progress"] — samme optimistiske patch opdaterer
    både venstre resumé og højre detalje (PR #166-mønstret). */

type ProgressKey = `${string}:${string}`;
const keyOf = (userId: string, itemId: string): ProgressKey => `${userId}:${itemId}`;

/** Grupperingen til højre: område → grupper (løse + samlinger i
    forløbsrækkefølge, kursus → moduler) — kun tracked items. */
type ItemGroup = { label: string; items: ContentItem[] };
type AreaBlock = { areaKey: string; areaLabel: string; groups: ItemGroup[] };

function buildAreaBlocks(collections: ContentCollection[], tracked: ContentItem[]): AreaBlock[] {
  const byPosition = <T extends { position: number; created_at: string }>(a: T, b: T) =>
    a.position - b.position || a.created_at.localeCompare(b.created_at);
  const blocks: AreaBlock[] = [];

  // Kun forløbsområder — et evt. bunny-push må aldrig optræde som modul.
  for (const area of AREAS.filter((a) => a.akademi)) {
    const areaItems = tracked.filter((i) => i.area === area.key).sort(byPosition);
    if (areaItems.length === 0) continue;
    const areaCollections = collections.filter((c) => c.area === area.key).sort(byPosition);
    const itemsOf = (collectionId: string | null) =>
      areaItems.filter((i) => (i.collection_id ?? null) === collectionId);

    const groups: ItemGroup[] = [];
    const push = (label: string, items: ContentItem[]) => {
      if (items.length > 0) groups.push({ label, items });
    };
    push("Uden samling", itemsOf(null));
    const seen = new Set(itemsOf(null).map((i) => i.id));
    for (const root of areaCollections.filter((c) => !c.parent_id)) {
      push(root.title, itemsOf(root.id));
      itemsOf(root.id).forEach((i) => seen.add(i.id));
      for (const child of areaCollections.filter((c) => c.parent_id === root.id)) {
        push(`${root.title} — ${child.title}`, itemsOf(child.id));
        itemsOf(child.id).forEach((i) => seen.add(i.id));
      }
    }
    // Items i upublicerede samlinger må ikke forsvinde (samme værn som
    // useAkademiData): hæft dem bagest.
    push("Øvrige", areaItems.filter((i) => !seen.has(i.id)));

    blocks.push({ areaKey: area.key, areaLabel: area.label, groups });
  }
  return blocks;
}

/** Tilstandsprik — samme udtryk som HbItemRow (uden dryp/skip-varianten
    behøver vi kun done/started/untouched + skipped-streg). */
const StateDot = ({ state }: { state: ItemProgressState }) => {
  if (state === "done")
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-hb-evergreen">
        <Check className="h-3 w-3 text-white" />
      </span>
    );
  if (state === "skipped")
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-hb-line">
        <span className="h-0.5 w-2 bg-hb-ink-soft" />
      </span>
    );
  return (
    <span
      className={cn(
        "h-5 w-5 shrink-0 rounded-full border",
        state === "started"
          ? "border-hb-evergreen [background:linear-gradient(90deg,hsl(var(--hb-evergreen))_50%,transparent_50%)]"
          : "border-hb-line",
      )}
    />
  );
};

export const ProgressView = () => {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: ["admin-content", "progress", "members"],
    queryFn: listMembers,
  });
  // Deler katalog-cachen med medlemsfladen (samme published-univers).
  const collectionsQuery = useQuery({
    queryKey: ["akademi", "collections"],
    queryFn: listPublishedCollections,
  });
  const itemsQuery = useQuery({ queryKey: ["akademi", "items"], queryFn: listPublishedItems });

  const publishedIds = useMemo(
    () => (itemsQuery.data ?? []).map((i) => i.id),
    [itemsQuery.data],
  );
  const progressQuery = useQuery({
    queryKey: ["admin-progress"],
    queryFn: () => listAllMemberProgress(publishedIds),
    enabled: publishedIds.length > 0,
  });

  const trackedItems = useMemo(
    () => (itemsQuery.data ?? []).filter(isTrackedItem),
    [itemsQuery.data],
  );
  const areaBlocks = useMemo(
    () => buildAreaBlocks(collectionsQuery.data ?? [], trackedItems),
    [collectionsQuery.data, trackedItems],
  );
  const rowByKey = useMemo(() => {
    const map = new Map<ProgressKey, AdminProgressRow>();
    for (const row of progressQuery.data ?? []) map.set(keyOf(row.user_id, row.content_item_id), row);
    return map;
  }, [progressQuery.data]);

  const stateFor = (userId: string, itemId: string): ItemProgressState =>
    itemProgressState(rowByKey.get(keyOf(userId, itemId)));

  const doneCount = (userId: string) =>
    trackedItems.filter((item) => stateFor(userId, item.id) === "done").length;

  // ── Optimistisk skrivning (PR #166-formen på den samlede nøgle) ─────────
  const patchCache = (
    userId: string,
    patches: { itemId: string; seenAt: string | null; acknowledgedAt: string | null }[],
  ) => {
    queryClient.setQueryData<AdminProgressRow[]>(["admin-progress"], (old = []) => {
      const next = [...old];
      for (const patch of patches) {
        const index = next.findIndex(
          (row) => row.user_id === userId && row.content_item_id === patch.itemId,
        );
        if (index >= 0) {
          next[index] = {
            ...next[index],
            seen_at: patch.seenAt ?? next[index].seen_at,
            acknowledged_at: patch.acknowledgedAt,
          };
        } else {
          next.push({
            user_id: userId,
            content_item_id: patch.itemId,
            seen_at: patch.seenAt,
            acknowledged_at: patch.acknowledgedAt,
            skipped_at: null,
          });
        }
      }
      return next;
    });
  };

  const setMutation = useMutation({
    mutationFn: ({ userId, entries }: { userId: string; entries: { itemId: string; seenAt: string | null }[] }) =>
      batchAcknowledge(userId, entries),
    onMutate: async ({ userId, entries }) => {
      setError(null);
      await queryClient.cancelQueries({ queryKey: ["admin-progress"] });
      const previous = queryClient.getQueryData<AdminProgressRow[]>(["admin-progress"]);
      const now = new Date().toISOString();
      patchCache(
        userId,
        entries.map((entry) => ({ itemId: entry.itemId, seenAt: entry.seenAt ?? now, acknowledgedAt: now })),
      );
      return { previous };
    },
    onError: (err: Error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(["admin-progress"], context.previous);
      setError(err.message);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["admin-progress"] }),
  });

  const clearMutation = useMutation({
    mutationFn: ({ userId, itemId }: { userId: string; itemId: string }) =>
      clearAcknowledge(userId, itemId),
    onMutate: async ({ userId, itemId }) => {
      setError(null);
      await queryClient.cancelQueries({ queryKey: ["admin-progress"] });
      const previous = queryClient.getQueryData<AdminProgressRow[]>(["admin-progress"]);
      patchCache(userId, [{ itemId, seenAt: null, acknowledgedAt: null }]);
      return { previous };
    },
    onError: (err: Error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(["admin-progress"], context.previous);
      setError(err.message);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["admin-progress"] }),
  });

  const acknowledgeOne = (userId: string, item: ContentItem) => {
    const existing = rowByKey.get(keyOf(userId, item.id));
    setMutation.mutate({ userId, entries: [{ itemId: item.id, seenAt: existing?.seen_at ?? null }] });
  };

  const acknowledgeMissing = (userId: string, items: ContentItem[]) => {
    const missing = items.filter((item) => stateFor(userId, item.id) !== "done");
    setMutation.mutate({
      userId,
      entries: missing.map((item) => ({
        itemId: item.id,
        seenAt: rowByKey.get(keyOf(userId, item.id))?.seen_at ?? null,
      })),
    });
  };

  // ── Venstre: medlemsliste (alfabetisk fra api-laget) ────────────────────
  const members = membersQuery.data ?? [];
  const query = search.trim().toLowerCase();
  const filteredMembers = query
    ? members.filter(
        (m) => m.name.toLowerCase().includes(query) || m.companyName.toLowerCase().includes(query),
      )
    : members;
  const selectedMember = members.find((m) => m.userId === selectedUserId);
  const loading =
    membersQuery.isLoading || collectionsQuery.isLoading || itemsQuery.isLoading || progressQuery.isLoading;

  const memberRow = (member: AdminMember) => {
    const active = member.userId === selectedUserId;
    return (
      <button
        key={member.userId}
        type="button"
        onClick={() => setSelectedUserId(member.userId)}
        className={cn(
          "flex w-full items-center gap-3 border-b border-hb-line/60 px-4 py-3 text-left transition-colors",
          active ? "bg-hb-sage/40" : "hover:bg-hb-sage/20",
        )}
      >
        {member.avatarUrl ? (
          <img src={member.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-hb-sage text-xs font-medium text-hb-ink">
            {member.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-hb-ink">{member.name}</span>
          {member.companyName && (
            <span className="block truncate text-xs text-hb-ink-soft">{member.companyName}</span>
          )}
        </span>
        <span className="shrink-0 text-xs text-hb-ink-soft">
          {doneCount(member.userId)} af {trackedItems.length}
        </span>
      </button>
    );
  };

  // ── Højre: valgt medlems fremdrift ──────────────────────────────────────
  const detail = selectedMember ? (
    <div className="flex h-full min-h-0 flex-col bg-hb-surface">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Fremdrift</p>
          <h2 className="mt-2 truncate font-editorial text-2xl font-medium leading-tight text-hb-ink md:text-3xl">
            {selectedMember.name}
          </h2>
          <p className="mt-1.5 text-sm text-hb-ink-soft">
            {[selectedMember.companyName, `${doneCount(selectedMember.userId)} af ${trackedItems.length} videoer gennemført`]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {error && <p className="mt-4 text-sm text-hb-rust">{error}</p>}

          <div className="mt-8 space-y-10">
            {areaBlocks.map((block) => (
              <section key={block.areaKey}>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
                  {block.areaLabel}
                </p>
                <div className="mt-3 space-y-6">
                  {block.groups.map((group) => {
                    const missing = group.items.filter(
                      (item) => stateFor(selectedMember.userId, item.id) !== "done",
                    ).length;
                    return (
                      <div key={`${block.areaKey}:${group.label}`}>
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="min-w-0 flex-1 truncate font-editorial text-lg font-medium text-hb-ink">
                            {group.label}
                          </h3>
                          <button
                            type="button"
                            onClick={() => acknowledgeMissing(selectedMember.userId, group.items)}
                            disabled={missing === 0 || setMutation.isPending}
                            className="shrink-0 rounded-full border border-hb-line px-3.5 py-1.5 text-sm text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink disabled:opacity-40"
                          >
                            Markér hele modulet ({missing})
                          </button>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {group.items.map((item) => {
                            const state = stateFor(selectedMember.userId, item.id);
                            const done = state === "done";
                            return (
                              <li
                                key={item.id}
                                className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-hb-sage/20"
                              >
                                <StateDot state={state} />
                                <span className="min-w-0 flex-1 truncate text-[15px] text-hb-ink">
                                  {item.title}
                                </span>
                                {done ? (
                                  /* Fortryd celle-for-celle — samme rolige
                                     hover-cue som medlemmets egen toggle. */
                                  <button
                                    type="button"
                                    onClick={() =>
                                      clearMutation.mutate({ userId: selectedMember.userId, itemId: item.id })
                                    }
                                    title="Klik for at fortryde"
                                    aria-label={`Gennemført: ${item.title} — klik for at fortryde`}
                                    className="group inline-flex shrink-0 items-center gap-1.5 rounded-full bg-hb-sage px-3 py-1 text-xs font-medium text-hb-ink transition-colors hover:bg-hb-sage/60"
                                  >
                                    <Check className="h-3.5 w-3.5 group-hover:hidden" />
                                    <Undo2 className="hidden h-3.5 w-3.5 group-hover:block" />
                                    Gennemført
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => acknowledgeOne(selectedMember.userId, item)}
                                    className="shrink-0 rounded-full border border-hb-line px-3 py-1 text-xs text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
                                  >
                                    Markér
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className="flex h-full items-center justify-center bg-hb-surface px-10">
      <p className="max-w-sm text-sm leading-relaxed text-hb-ink-soft">
        Vælg et medlem i listen for at se og markere fremdrift. Markeringer skrives som ægte
        fremdrift — medlemmet ser Gennemført, som var det selvsat.
      </p>
    </div>
  );

  return (
    <HbAdminSplit
      editorOpen={selectedUserId !== null}
      onCloseEditor={() => setSelectedUserId(null)}
      list={
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-hb-line px-4 py-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søg medlem eller virksomhed…"
              aria-label="Søg medlem eller virksomhed"
              className={cn(hbControlClasses, "py-2 text-sm")}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-sm text-hb-ink-soft">Henter…</p>
            ) : filteredMembers.length === 0 ? (
              <p className="px-4 py-6 text-sm text-hb-ink-soft">Ingen medlemmer matcher.</p>
            ) : (
              filteredMembers.map(memberRow)
            )}
          </div>
        </div>
      }
      editor={detail}
    />
  );
};
