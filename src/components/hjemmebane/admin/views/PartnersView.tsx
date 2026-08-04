import * as React from "react";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  createPartner,
  listPartners,
  persistOrder,
} from "@/lib/hjemmebane/adminContentApi";
import { HbAdminSplit } from "../HbAdminShell";
import { HbTreeList, type HbListRow } from "../HbTreeList";
import { useAdminHotkeys } from "../useAdminHotkeys";
import { PartnerEditor } from "../editors/PartnerEditor";
import { EditorEmptyState, type EditorHandle } from "../editors/shared";

type DraftMap = Record<string, Record<string, unknown>>;

export const PartnersView = () => {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorHandle>(null);

  const partnersQuery = useQuery({ queryKey: ["admin-partners"], queryFn: listPartners });
  const partners = useMemo(
    () =>
      [...(partnersQuery.data ?? [])].sort(
        (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
      ),
    [partnersQuery.data],
  );

  const query = search.trim().toLowerCase();
  const matches = (name: string, category: string) =>
    !query || name.toLowerCase().includes(query) || category.toLowerCase().includes(query);

  const toRow = (partner: (typeof partners)[number]): HbListRow => ({
    id: partner.id,
    kind: "partner",
    depth: 0,
    title: partner.name || "Uden navn",
    meta: [partner.category, partner.valid_until ? `til ${partner.valid_until}` : "løbende"]
      .filter(Boolean)
      .join(" · "),
    status: partner.status,
    groupKey: "partners",
    canReorder: query === "",
  });

  const rows = partners.filter((p) => p.status !== "archived" && matches(p.name, p.category)).map(toRow);
  const archivedRows = query
    ? []
    : partners.filter((p) => p.status === "archived").map(toRow);

  const selected = partners.find((p) => p.id === selectedId);
  const categories = useMemo(
    () => [...new Set(partners.map((p) => p.category).filter(Boolean))].sort(),
    [partners],
  );
  const dirtyIds = useMemo(
    () => new Set(Object.keys(drafts).filter((key) => Object.keys(drafts[key]).length > 0)),
    [drafts],
  );

  const newPartnerMutation = useMutation({
    // CHECK-constrainten kræver et indløsningsfelt fra fødslen — kladden
    // starter derfor som "kontakt/Udfyldes" og valideringen kræver rigtigt
    // indhold før publicering.
    mutationFn: () =>
      createPartner({
        name: "Uden navn",
        category: "",
        discount_text: "",
        redemption_type: "kontakt",
        redemption_contact: "Udfyldes",
        position: partners.length,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
      setSelectedId(created.id);
    },
  });

  const applyOrder = (orderedIds: string[]) => {
    queryClient.setQueryData(
      ["admin-partners"],
      (old: { id: string; position: number }[] | undefined) =>
        old?.map((p) => (orderedIds.includes(p.id) ? { ...p, position: orderedIds.indexOf(p.id) } : p)),
    );
    persistOrder("partners", orderedIds).catch(() => {
      void queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
    });
  };

  const activeIds = partners.filter((p) => p.status !== "archived").map((p) => p.id);

  const onMoveStep = (row: HbListRow, delta: -1 | 1) => {
    const index = activeIds.indexOf(row.id);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= activeIds.length) return;
    const next = [...activeIds];
    [next[index], next[target]] = [next[target], next[index]];
    applyOrder(next);
  };

  const onDropOn = (sourceId: string, target: HbListRow) => {
    const ids = activeIds.filter((id) => id !== sourceId);
    const targetIndex = ids.indexOf(target.id);
    if (targetIndex === -1) return;
    ids.splice(targetIndex, 0, sourceId);
    applyOrder(ids);
  };

  useAdminHotkeys({
    onSave: () => editorRef.current?.save(),
    onPublish: () => editorRef.current?.publish(),
    onNew: () => newPartnerMutation.mutate(),
    onSearch: () => searchRef.current?.focus(),
    onEscape: () => setSelectedId(null),
  });

  const setDraft = (patch: Record<string, unknown>) => {
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

  return (
    <HbAdminSplit
      editorOpen={selected !== undefined}
      onCloseEditor={() => setSelectedId(null)}
      list={
        <HbTreeList
          rows={rows}
          archivedRows={archivedRows}
          selectedId={selectedId}
          onSelect={(row) => setSelectedId(row.id)}
          onMoveStep={onMoveStep}
          onDropOn={onDropOn}
          dirtyIds={
            new Set([...dirtyIds].map((id) => `partner:${id}`))
          }
          searchValue={search}
          onSearchChange={setSearch}
          searchRef={searchRef}
          headerAction={
            <button
              type="button"
              onClick={() => newPartnerMutation.mutate()}
              disabled={newPartnerMutation.isPending}
              className="flex shrink-0 items-center gap-1 rounded-full border border-hb-line px-3 py-2 text-sm text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
            >
              <Plus className="h-3.5 w-3.5" /> Partner
            </button>
          }
          emptyText={
            partnersQuery.isLoading
              ? "Henter…"
              : "Ingen partnere endnu. Opret den første — rabatkortet bor her (B4)."
          }
        />
      }
      editor={
        selected ? (
          <PartnerEditor
            ref={editorRef}
            key={selected.id}
            partner={selected}
            categories={categories}
            draft={drafts[selected.id] ?? {}}
            onDraftChange={setDraft}
            onSaved={clearDraft}
          />
        ) : (
          <EditorEmptyState
            hints={[
              ["↑ ↓", "navigér i listen"],
              ["n", "ny partner"],
              ["⌘S", "gem"],
              ["⌘⇧P", "publicér"],
              ["/", "søg"],
            ]}
          />
        )
      }
    />
  );
};
