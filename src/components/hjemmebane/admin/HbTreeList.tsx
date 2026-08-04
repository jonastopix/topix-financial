import * as React from "react";
import { useState } from "react";
import { ChevronRight, GripVertical, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { HbStatusDot } from "./HbStatusPill";

export interface HbListRow {
  id: string;
  /** "collection" | "item" | "partner" | "event" — semantik ejes af viewet. */
  kind: string;
  depth: number;
  title: string;
  /** Sekundær linje-info: "kursus", "lektion · 12:30", "14 tilmeldte". */
  meta?: string;
  status: string;
  /** Søskendegruppe-nøgle — reorder er kun tilladt inden for samme gruppe. */
  groupKey: string;
  canReorder: boolean;
}

interface HbTreeListProps {
  rows: HbListRow[];
  archivedRows: HbListRow[];
  selectedId: string | null;
  onSelect: (row: HbListRow) => void;
  /** ⌥↑/⌥↓ — flyt rækken ét trin i sin søskendegruppe. */
  onMoveStep: (row: HbListRow, delta: -1 | 1) => void;
  /** Drop af source på target (samme søskendegruppe — håndhævet her). */
  onDropOn: (sourceId: string, target: HbListRow) => void;
  /** Rækker med ugemte kladde-ændringer (drafts overlever selektionsskift). */
  dirtyIds: Set<string>;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchRef: React.RefObject<HTMLInputElement>;
  headerAction?: React.ReactNode;
  footerAction?: React.ReactNode;
  emptyText: string;
}

/** Trælisten: indrykning, statusprikker, drag-håndtag, ⌥↑/⌥↓, arkiv-fold.
    Arkiverede rækker forsvinder ikke — de fylder bare ikke (B10). */
export const HbTreeList = ({
  rows,
  archivedRows,
  selectedId,
  onSelect,
  onMoveStep,
  onDropOn,
  dirtyIds,
  searchValue,
  onSearchChange,
  searchRef,
  headerAction,
  footerAction,
  emptyText,
}: HbTreeListProps) => {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const visibleRows = archiveOpen ? [...rows, ...archivedRows] : rows;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const delta = e.key === "ArrowDown" ? 1 : -1;
    const selected = visibleRows.find((row) => row.id === selectedId);
    e.preventDefault();
    if (e.altKey) {
      if (selected?.canReorder) onMoveStep(selected, delta as -1 | 1);
      return;
    }
    if (visibleRows.length === 0) return;
    const index = visibleRows.findIndex((row) => row.id === selectedId);
    const next = index === -1 ? 0 : Math.min(Math.max(index + delta, 0), visibleRows.length - 1);
    onSelect(visibleRows[next]);
  };

  const renderRow = (row: HbListRow, archived: boolean) => {
    const selected = row.id === selectedId;
    const dragRow = rows.find((r) => r.id === dragId);
    const dropAllowed = dragId !== null && dragId !== row.id && dragRow?.groupKey === row.groupKey;
    return (
      <div
        key={row.id}
        role="option"
        aria-selected={selected}
        onClick={() => onSelect(row)}
        draggable={row.canReorder}
        onDragStart={(e) => {
          setDragId(row.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDragId(null)}
        onDragOver={(e) => {
          if (dropAllowed) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dropAllowed && dragId) onDropOn(dragId, row);
          setDragId(null);
        }}
        className={cn(
          "group flex cursor-pointer items-center gap-2.5 rounded-lg py-2 pr-3 transition-colors",
          selected ? "bg-hb-sage/50" : "hover:bg-hb-sage/25",
          archived && "opacity-55",
        )}
        style={{ paddingLeft: `${0.5 + row.depth * 1.25}rem` }}
      >
        {row.canReorder ? (
          <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-hb-ink-soft/0 transition-colors group-hover:text-hb-ink-soft/60" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <HbStatusDot status={row.status} />
        <div className="min-w-0 flex-1 leading-tight">
          <p
            className={cn(
              "truncate text-[15px]",
              row.kind === "collection" ? "font-medium text-hb-ink" : "text-hb-ink",
            )}
          >
            {row.title}
            {dirtyIds.has(`${row.kind}:${row.id}`) && (
              <span className="ml-1.5 align-middle text-xs text-hb-rust" title="Ugemte ændringer">
                •
              </span>
            )}
          </p>
          {row.meta && <p className="truncate text-xs text-hb-ink-soft">{row.meta}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-4">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-hb-ink-soft/60" />
          <input
            ref={searchRef}
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Søg…  ( / )"
            aria-label="Søg i listen"
            className="w-full rounded-full border border-hb-line bg-hb-surface py-2 pl-9 pr-4 text-sm text-hb-ink placeholder:text-hb-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-hb-evergreen/60"
          />
        </div>
        {headerAction}
      </div>

      <div
        role="listbox"
        aria-label="Indholdsliste"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/40"
      >
        {visibleRows.length === 0 && archivedRows.length === 0 ? (
          <p className="px-3 py-8 text-sm leading-relaxed text-hb-ink-soft">{emptyText}</p>
        ) : (
          rows.map((row) => renderRow(row, false))
        )}

        {archivedRows.length > 0 && (
          <button
            type="button"
            onClick={() => setArchiveOpen((open) => !open)}
            className="mt-3 flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft transition-colors hover:text-hb-ink"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", archiveOpen && "rotate-90")} />
            Arkiv ({archivedRows.length})
          </button>
        )}
        {archiveOpen && archivedRows.map((row) => renderRow(row, true))}
      </div>

      {footerAction && <div className="shrink-0 border-t border-hb-line px-4 py-3">{footerAction}</div>}
    </div>
  );
};
