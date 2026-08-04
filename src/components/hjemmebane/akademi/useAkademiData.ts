import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { ContentCollection, ContentItem } from "@/lib/hjemmebane/adminContentApi";
import {
  getMyJoinedAt,
  getMyProgress,
  itemProgressState,
  listPublishedCollections,
  listPublishedItems,
  upsertProgress,
  type ItemProgressState,
  type MemberProgress,
  type ProgressPatch,
} from "@/lib/hjemmebane/akademiApi";
import { dripState, effectiveDrip, type DripState } from "@/lib/hjemmebane/drip";

export interface AkademiItem {
  item: ContentItem;
  collection: ContentCollection | undefined;
  drip: DripState;
  progress: MemberProgress | undefined;
  state: ItemProgressState;
}

/** Fælles datalag for de tre Akademi-sider: ét publiceret katalog, egen
    progress og dryp-kontekst — delt cache, afledte kort. Rækkefølgen er
    forløbsrækkefølgen (samlinger efter position, elementer efter position),
    identisk med admin-fladens træ. */
export function useAkademiData() {
  const { user, isAdvisor } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  const collectionsQuery = useQuery({
    queryKey: ["akademi", "collections"],
    queryFn: listPublishedCollections,
  });
  const itemsQuery = useQuery({ queryKey: ["akademi", "items"], queryFn: listPublishedItems });
  const joinedQuery = useQuery({
    queryKey: ["akademi", "joined", userId],
    queryFn: () => getMyJoinedAt(userId),
    enabled: Boolean(userId),
  });
  const progressQuery = useQuery({
    queryKey: ["akademi", "progress", userId],
    queryFn: () => getMyProgress(userId),
    enabled: Boolean(userId),
  });

  const derived = useMemo(() => {
    const collections = collectionsQuery.data ?? [];
    const items = itemsQuery.data ?? [];
    const progressByItem = new Map(
      (progressQuery.data ?? []).map((row) => [row.content_item_id, row]),
    );
    const collectionById = new Map(collections.map((c) => [c.id, c]));
    const ctx = { joinedAt: joinedQuery.data ?? null, isAdvisor };

    const byPosition = <T extends { position: number; created_at: string }>(a: T, b: T) =>
      a.position - b.position || a.created_at.localeCompare(b.created_at);

    /** Forløbsrækkefølge pr. område: løse elementer, derefter samlinger
        (kursus → moduler) med deres elementer — som i admin-trælisten. */
    const orderedByArea = new Map<string, AkademiItem[]>();
    const wrap = (item: ContentItem): AkademiItem => {
      const collection = item.collection_id ? collectionById.get(item.collection_id) : undefined;
      const progress = progressByItem.get(item.id);
      return {
        item,
        collection,
        drip: dripState(effectiveDrip(item.drip_after_days, collection?.drip_after_days), ctx),
        progress,
        state: itemProgressState(progress),
      };
    };

    const areas = [...new Set(items.map((i) => i.area))];
    for (const area of areas) {
      const areaItems = items.filter((i) => i.area === area).sort(byPosition);
      const areaCollections = collections.filter((c) => c.area === area).sort(byPosition);
      const ordered: AkademiItem[] = [];
      const itemsOf = (collectionId: string | null) =>
        areaItems.filter((i) => (i.collection_id ?? null) === collectionId);
      for (const item of itemsOf(null)) ordered.push(wrap(item));
      for (const root of areaCollections.filter((c) => !c.parent_id)) {
        for (const item of itemsOf(root.id)) ordered.push(wrap(item));
        for (const child of areaCollections.filter((c) => c.parent_id === root.id)) {
          for (const item of itemsOf(child.id)) ordered.push(wrap(item));
        }
      }
      // Elementer i upublicerede samlinger må ikke forsvinde: hæft dem bagest.
      const seen = new Set(ordered.map((entry) => entry.item.id));
      for (const item of areaItems) if (!seen.has(item.id)) ordered.push(wrap(item));
      orderedByArea.set(area, ordered);
    }

    const all = [...orderedByArea.values()].flat();
    const byId = new Map(all.map((entry) => [entry.item.id, entry]));
    const bySlug = new Map(all.map((entry) => [entry.item.slug, entry]));

    return { collections, orderedByArea, byId, bySlug };
  }, [collectionsQuery.data, itemsQuery.data, progressQuery.data, joinedQuery.data, isAdvisor]);

  const progressMutation = useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: ProgressPatch }) =>
      upsertProgress(userId, itemId, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["akademi", "progress", userId] });
    },
  });

  return {
    userId,
    isAdvisor,
    loading:
      collectionsQuery.isLoading ||
      itemsQuery.isLoading ||
      joinedQuery.isLoading ||
      progressQuery.isLoading,
    progressRows: progressQuery.data ?? [],
    writeProgress: (itemId: string, patch: ProgressPatch) =>
      progressMutation.mutate({ itemId, patch }),
    ...derived,
  };
}

/** Samlings-/områdefremdrift: gennemførte af de ELEMENTER man faktisk kan nå
    (låste tæller ikke med i nævneren — "3 af 8" er altid handlingsbart). */
export function progressSummary(entries: AkademiItem[]): { done: number; total: number } {
  const reachable = entries.filter((entry) => entry.drip.unlocked);
  return {
    done: reachable.filter((entry) => entry.state === "done").length,
    total: reachable.length,
  };
}
