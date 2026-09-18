import * as React from "react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRaadgivere } from "@/hooks/useRaadgivere";
import { INGEN_RAADGIVERE } from "@/lib/hjemmebane/ansigter";
import { tilUdkast, validerVaerter, type VaertUdkast } from "@/lib/hjemmebane/vaerter";
import { listVaerterForEvents, saveVaerter } from "@/lib/hjemmebane/vaerterApi";
import { gemEventOgVaerter } from "@/lib/hjemmebane/gemEventOgVaerter";
import { gemKnapTekst, planlaegGem } from "@/lib/hjemmebane/flytEvent";
import {
  type ContentItem,
  type EventRow,
  cancelEvent,
  deleteEvent,
  gemEventEllerFlyt,
  publishEvent,
  updateEvent,
} from "@/lib/hjemmebane/adminContentApi";
import { HbField, HbInput, HbSelect, HbTextarea } from "../HbField";
import { VaerterFelt } from "./VaerterFelt";
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
    // VÆRTER (PR 4b): egen tabel (event_vaerter), eget udkast — null = urørt
    // (det gemte vises). Gemmes SAMMEN med eventet i persist/publicér.
    const vaerterQuery = useQuery({ queryKey: ["admin-events", "vaerter", event.id], queryFn: () => listVaerterForEvents([event.id]) });
    const raadgivereQuery = useRaadgivere();
    const [vaerterDraft, setVaerterDraft] = useState<VaertUdkast[] | null>(null);
    const vaerter: VaertUdkast[] = vaerterDraft ?? (vaerterQuery.data ?? []).map(tilUdkast);
    const dirty = Object.keys(draft).length > 0 || vaerterDraft !== null;

    const gemVaerter = async () => {
      if (!vaerterDraft) return;
      await saveVaerter(event.id, vaerterDraft);
      setVaerterDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-events", "vaerter", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["events", "vaerter"] });
    };
    // GEM (fejl i drift 17/9 14:05): en tom event-patch må ALDRIG nå
    // updateEvent — UPDATE … RETURNING med {} rammer 0 rækker og kaster
    // «Elementet findes ikke længere», så værterne aldrig blev gemt.
    // Rækkefølgen og reglerne bor i gemEventOgVaerter (ren, testet).
    // FLYTNING (udkast 18/9): dato/tid på et PUBLICERET event går gennem
    // flyt-event, som giver de tilmeldte besked — gemEventEllerFlyt deler
    // patchen (planlaegGem: tid → flyt-event, rest → updateEvent). En ren
    // updateEvent på starts_at flyttede i stilhed (recon-event-aendring.md).
    const mutation = useMutation({
      mutationFn: (patch: Draft) =>
        gemEventOgVaerter({
          patch,
          vaerterAendret: vaerterDraft !== null,
          gemEvent: () => gemEventEllerFlyt(event, patch),
          gemVaerter,
        }),
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
        (vaerterDraft && validerVaerter(vaerterDraft)) ||
        null;
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      mutation.mutate(patch);
    };

    // PUBLICERING (10/9): foerst gemmes kladden (persist-validering, uden
    // statuspatch), derefter publish-event, som saetter status OG giver alle
    // aktive medlemmer besked i samme kald. Gem foerst, saa beskeden baerer
    // den nye titel/tid. Den gamle vej (persist({ status: "published" }))
    // sendte intet.
    const publishMutation = useMutation({
      mutationFn: async () => {
        if (Object.keys(draft).length > 0) await updateEvent(event.id, draft);
        await gemVaerter();
        return publishEvent(event.id);
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["admin-events"] });
        setSavedAt(new Date());
        setError(null);
        onSaved();
      },
      onError: (err: Error) => setError(err.message),
    });
    const publicer = () => {
      if (mutation.isPending || publishMutation.isPending) return;
      const next = { ...event, ...draft } as EventRow;
      const problem =
        (!next.title.trim() && "Titel mangler") ||
        (!next.starts_at && "Starttidspunkt mangler") ||
        (next.meet_url && !/^https:\/\/.+/.test(next.meet_url) && "Meet-linket skal være https://") ||
        (vaerterDraft && validerVaerter(vaerterDraft)) ||
        null;
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      publishMutation.mutate();
    };
    useImperativeHandle(ref, () => ({
      save: () => persist(),
      publish: () => publicer(),
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
        ? [{ label: publishMutation.isPending ? "Publicerer…" : "Publicér — medlemmerne får besked", onClick: publicer, variant: "primary" }]
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
          : [{ label: publishMutation.isPending ? "Publicerer…" : "Genåbn som publiceret", onClick: publicer, variant: "secondary" }];

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
            saveLabel={gemKnapTekst(planlaegGem(event, draft), registrationCount)}
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

        <VaerterFelt eventId={event.id} vaerter={vaerter} onChange={setVaerterDraft} raadgivere={raadgivereQuery.data ?? INGEN_RAADGIVERE} />

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
