import * as React from "react";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  countRegistrations,
  createEvent,
  listEvents,
  listRecordingCandidates,
} from "@/lib/hjemmebane/adminContentApi";
import { HbAdminSplit } from "../HbAdminShell";
import { HbTreeList, type HbListRow } from "../HbTreeList";
import { useAdminHotkeys } from "../useAdminHotkeys";
import { EventEditor } from "../editors/EventEditor";
import { EditorEmptyState, type EditorHandle } from "../editors/shared";

type DraftMap = Record<string, Record<string, unknown>>;

const formatStart = (iso: string) =>
  new Intl.DateTimeFormat("da-DK", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/** Nyt event foreslås i morgen kl. 10 — et roligt, redigérbart udgangspunkt. */
const suggestedStart = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return date.toISOString();
};

export const EventsView = () => {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorHandle>(null);

  const eventsQuery = useQuery({ queryKey: ["admin-events"], queryFn: listEvents });
  const registrationsQuery = useQuery({
    queryKey: ["admin-events", "registrations"],
    queryFn: countRegistrations,
  });
  const recordingsQuery = useQuery({
    queryKey: ["admin-content", "recording-candidates"],
    queryFn: listRecordingCandidates,
  });

  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const counts = registrationsQuery.data ?? {};
  const query = search.trim().toLowerCase();

  const upcoming = useMemo(() => {
    const now = Date.now();
    const filtered = events.filter((e) => !query || e.title.toLowerCase().includes(query));
    // Kommende først (nærmest øverst), derefter afholdte/ældre nyeste-først.
    const future = filtered
      .filter((e) => new Date(e.starts_at).getTime() >= now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const past = filtered.filter((e) => new Date(e.starts_at).getTime() < now);
    return [...future, ...past];
  }, [events, query]);

  const rows: HbListRow[] = upcoming.map((event) => {
    const count = counts[event.id] ?? 0;
    return {
      id: event.id,
      kind: "event",
      depth: 0,
      title: event.title,
      meta: `${formatStart(event.starts_at)} · ${count} tilmeldt${count === 1 ? "" : "e"}${
        event.capacity ? ` af ${event.capacity}` : ""
      }`,
      status: event.status,
      groupKey: "events",
      canReorder: false, // tiden er rækkefølgen
    };
  });

  const selected = events.find((e) => e.id === selectedId);
  const dirtyIds = useMemo(
    () =>
      new Set(
        Object.keys(drafts)
          .filter((key) => Object.keys(drafts[key]).length > 0)
          .map((id) => `event:${id}`),
      ),
    [drafts],
  );

  const newEventMutation = useMutation({
    mutationFn: () => createEvent({ title: "Uden titel", starts_at: suggestedStart() }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      setSelectedId(created.id);
    },
  });

  useAdminHotkeys({
    onSave: () => editorRef.current?.save(),
    onPublish: () => editorRef.current?.publish(),
    onNew: () => newEventMutation.mutate(),
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
          archivedRows={[]}
          selectedId={selectedId}
          onSelect={(row) => setSelectedId(row.id)}
          onMoveStep={() => undefined}
          onDropOn={() => undefined}
          dirtyIds={dirtyIds}
          searchValue={search}
          onSearchChange={setSearch}
          searchRef={searchRef}
          headerAction={
            <button
              type="button"
              onClick={() => newEventMutation.mutate()}
              disabled={newEventMutation.isPending}
              className="flex shrink-0 items-center gap-1 rounded-full border border-hb-line px-3 py-2 text-sm text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
            >
              <Plus className="h-3.5 w-3.5" /> Event
            </button>
          }
          emptyText={
            eventsQuery.isLoading
              ? "Henter…"
              : "Ingen events endnu. Opret det første — Live sparring bor her."
          }
        />
      }
      editor={
        selected ? (
          <EventEditor
            ref={editorRef}
            key={selected.id}
            event={selected}
            recordingCandidates={recordingsQuery.data ?? []}
            registrationCount={counts[selected.id] ?? 0}
            draft={drafts[selected.id] ?? {}}
            onDraftChange={setDraft}
            onSaved={clearDraft}
            onDeleted={() => {
              clearDraft();
              setSelectedId(null);
            }}
          />
        ) : (
          <EditorEmptyState
            hints={[
              ["↑ ↓", "navigér i listen"],
              ["n", "nyt event"],
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
