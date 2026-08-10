import * as React from "react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type ContentItem,
  type EventRow,
  cancelEvent,
  deleteEvent,
  updateEvent,
} from "@/lib/hjemmebane/adminContentApi";
import { HbField, HbInput, HbSelect, HbTextarea } from "../HbField";
import {
  EditorBar,
  EditorShell,
  fromLocalInputValue,
  toLocalInputValue,
  type EditorAction,
  type EditorHandle,
} from "./shared";

type Draft = Partial<EventRow>;

interface EventEditorProps {
  event: EventRow;
  /** Published episoder/videoer — kandidater til optagelses-koblingen (B8). */
  recordingCandidates: Pick<ContentItem, "id" | "title" | "type">[];
  registrationCount: number;
  draft: Draft;
  onDraftChange: (patch: Draft) => void;
  onSaved: () => void;
  onDeleted: () => void;
}

const KIND_OPTIONS = [
  { value: "live_sparring", label: "Live sparring" },
  { value: "workshop", label: "Workshop" },
  { value: "andet", label: "Andet" },
];

export const EventEditor = forwardRef<EditorHandle, EventEditorProps>(
  ({ event, recordingCandidates, registrationCount, draft, onDraftChange, onSaved, onDeleted }, ref) => {
    const queryClient = useQueryClient();
    const [savedAt, setSavedAt] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);

    const form = { ...event, ...draft } as EventRow;
    const dirty = Object.keys(draft).length > 0;

    const mutation = useMutation({
      mutationFn: (patch: Draft) => updateEvent(event.id, patch),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["admin-events"] });
        setSavedAt(new Date());
        setError(null);
        onSaved();
      },
      onError: (err: Error) => setError(err.message),
    });

    const persist = (extra: Draft = {}) => {
      if (mutation.isPending) return;
      const patch: Draft = { ...draft, ...extra };
      const next = { ...event, ...patch } as EventRow;
      const problem =
        (!next.title.trim() && "Titel mangler") ||
        (!next.starts_at && "Starttidspunkt mangler") ||
        (next.meet_url && !/^https:\/\/.+/.test(next.meet_url) && "Meet-linket skal være https://") ||
        null;
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      mutation.mutate(patch);
    };

    useImperativeHandle(ref, () => ({
      save: () => persist(),
      publish: () => persist({ status: "published" }),
    }));

    const deleteMutation = useMutation({
      mutationFn: () => deleteEvent(event.id),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["admin-events"] });
        onDeleted();
      },
      onError: (err: Error) => setError(err.message),
    });

    // Aflysning går gennem cancel-event-funktionen (IKKE persist med
    // status-patch): den giver alle aktive tilmeldte besked, og derfor
    // kræves en eksplicit bekræftelse — handlingen kan ikke trækkes
    // tilbage. To-trins i actions-rækken (husets model, ingen browser-
    // confirm): første klik åbner bekræftelsen, andet klik udfører.
    const [confirmingCancel, setConfirmingCancel] = useState(false);
    const cancelMutation = useMutation({
      mutationFn: () => cancelEvent(event.id),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["admin-events"] });
        setConfirmingCancel(false);
        setSavedAt(new Date());
        setError(null);
        onSaved();
      },
      onError: (err: Error) => setError(err.message),
    });

    const confirmCancelLabel =
      registrationCount > 0
        ? `Ja, aflys — ${registrationCount} tilmeldt${registrationCount === 1 ? "" : "e"} får besked`
        : "Ja, aflys";

    const actions: EditorAction[] =
      form.status === "draft"
        ? [{ label: "Publicér", onClick: () => persist({ status: "published" }), variant: "primary" }]
        : form.status === "published"
          ? confirmingCancel
            ? [
                { label: confirmCancelLabel, onClick: () => cancelMutation.mutate(), variant: "secondary" },
                { label: "Fortryd", onClick: () => setConfirmingCancel(false), variant: "link" },
              ]
            : [
                { label: "Markér afholdt", onClick: () => persist({ status: "completed" }), variant: "secondary" },
                { label: "Aflys", onClick: () => setConfirmingCancel(true), variant: "link" },
              ]
          : [{ label: "Genåbn som publiceret", onClick: () => persist({ status: "published" }), variant: "secondary" }];

    return (
      <EditorShell
        eyebrow={`Event · ${KIND_OPTIONS.find((k) => k.value === form.kind)?.label ?? form.kind}`}
        title={form.title}
        meta={`${registrationCount} tilmeldt${registrationCount === 1 ? "" : "e"}`}
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
              // Events har intet 'archived' — de afsluttede tilstande
              // (aflyst/afholdt) er arkiv-analogen, der åbner for sletning.
              form.status === "cancelled" || form.status === "completed"
                ? {
                    entityLabel: form.title || "Uden titel",
                    consequence: `${registrationCount} tilmelding${registrationCount === 1 ? "" : "er"} slettes med.`,
                    deleting: deleteMutation.isPending,
                    onDelete: () => deleteMutation.mutate(),
                  }
                : undefined
            }
          />
        }
      >
        <HbField label="Titel" htmlFor="event-title">
          <HbInput
            id="event-title"
            value={form.title}
            onChange={(e) => onDraftChange({ title: e.target.value })}
          />
        </HbField>

        <HbField label="Beskrivelse" htmlFor="event-desc">
          <HbTextarea
            id="event-desc"
            value={form.description ?? ""}
            onChange={(e) => onDraftChange({ description: e.target.value || null })}
          />
        </HbField>

        <div className="grid gap-6 md:grid-cols-2">
          <HbField label="Art" htmlFor="event-kind">
            <HbSelect
              id="event-kind"
              value={form.kind}
              onChange={(e) => onDraftChange({ kind: e.target.value })}
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </HbSelect>
          </HbField>

          <HbField label="Kapacitet" htmlFor="event-capacity" help="Tom = ubegrænset.">
            <HbInput
              id="event-capacity"
              type="number"
              min={1}
              value={form.capacity ?? ""}
              onChange={(e) =>
                onDraftChange({
                  capacity: e.target.value === "" ? null : Math.max(1, parseInt(e.target.value, 10) || 1),
                })
              }
            />
          </HbField>

          <HbField label="Start" htmlFor="event-starts">
            <HbInput
              id="event-starts"
              type="datetime-local"
              value={toLocalInputValue(form.starts_at)}
              onChange={(e) => {
                const iso = fromLocalInputValue(e.target.value);
                if (iso) onDraftChange({ starts_at: iso });
              }}
            />
          </HbField>

          <HbField label="Slut" htmlFor="event-ends">
            <HbInput
              id="event-ends"
              type="datetime-local"
              value={toLocalInputValue(form.ends_at)}
              onChange={(e) => onDraftChange({ ends_at: fromLocalInputValue(e.target.value) })}
            />
          </HbField>
        </div>

        <HbField
          label="Meet-link"
          htmlFor="event-meet"
          help="Synligt for alle medlemmer (B9) — udlevér ikke noget hemmeligt her."
        >
          <HbInput
            id="event-meet"
            type="url"
            value={form.meet_url ?? ""}
            onChange={(e) => onDraftChange({ meet_url: e.target.value.trim() || null })}
            placeholder="https://meet.google.com/…"
            spellCheck={false}
          />
        </HbField>

        <HbField
          label="Optagelse"
          htmlFor="event-recording"
          help="Efter afholdelse: peg på episoden/videoen med optagelsen (B8)."
        >
          <HbSelect
            id="event-recording"
            value={form.recording_item_id ?? ""}
            onChange={(e) => onDraftChange({ recording_item_id: e.target.value || null })}
          >
            <option value="">Ingen optagelse endnu</option>
            {recordingCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </HbSelect>
        </HbField>
      </EditorShell>
    );
  },
);
EventEditor.displayName = "EventEditor";
