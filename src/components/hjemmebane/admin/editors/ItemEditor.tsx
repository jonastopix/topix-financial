import * as React from "react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AREAS,
  ITEM_TYPES,
  type AreaKey,
  type ContentCollection,
  type ContentItem,
  type Partner,
  deleteItem,
  updateItem,
} from "@/lib/hjemmebane/adminContentApi";
import { slugify } from "@/lib/hjemmebane/slug";
import { HbField, HbInput, HbSelect, HbTextarea } from "../HbField";
import { HbMediaPicker } from "../HbMediaPicker";
import { HbEditorRichtext } from "../HbEditorRichtext";
import { HbUploadZone } from "../HbUploadZone";
import {
  EditorBar,
  EditorShell,
  SlugField,
  formatDuration,
  isSlugUniqueError,
  parseDuration,
  type EditorAction,
  type EditorHandle,
} from "./shared";

type Draft = Partial<ContentItem>;

interface ItemEditorProps {
  item: ContentItem;
  collections: ContentCollection[];
  partners: Partner[];
  draft: Draft;
  onDraftChange: (patch: Draft) => void;
  onSaved: () => void;
  onDeleted: () => void;
}

/** CHECK-constrainten spejles før gem, så DB-fejl aldrig er første feedback. */
const mediaError = (form: ContentItem): string | null => {
  switch (form.media_provider) {
    case "bunny":
      return form.bunny_video_id?.trim() ? null : "Bunny-video kræver et video-ID";
    case "storage":
      return form.storage_path ? null : "Fil kræver en uploadet fil";
    case "external":
      return /^https:\/\/.+/.test(form.external_url ?? "")
        ? null
        : "Eksternt link kræver en https://-adresse";
    default:
      return null;
  }
};

export const ItemEditor = forwardRef<EditorHandle, ItemEditorProps>(
  ({ item, collections, partners, draft, onDraftChange, onSaved, onDeleted }, ref) => {
    const queryClient = useQueryClient();
    const [savedAt, setSavedAt] = useState<Date | null>(null);
    const [slugError, setSlugError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [durationText, setDurationText] = useState<string | null>(null);

    const form = { ...item, ...draft } as ContentItem;
    const dirty = Object.keys(draft).length > 0;
    const areaLabel = AREAS.find((a) => a.key === (form.area as AreaKey))?.label ?? form.area;
    const showDuration = form.type === "video" || form.type === "episode";
    const collection = collections.find((c) => c.id === form.collection_id);
    const inheritedDrip = collection?.drip_after_days;

    const mutation = useMutation({
      mutationFn: (patch: Draft) => updateItem(item.id, patch),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
        setSavedAt(new Date());
        setSlugError(null);
        setError(null);
        onSaved();
      },
      onError: (err: Error) => {
        if (isSlugUniqueError(err.message)) setSlugError("Slug er allerede i brug");
        else setError(err.message);
      },
    });

    const persist = (extra: Draft = {}) => {
      if (mutation.isPending) return;
      setSlugError(null);
      const patch: Draft = { ...draft, ...extra };
      const next = { ...item, ...patch } as ContentItem;
      const mediaProblem = mediaError(next);
      if (mediaProblem) {
        setError(mediaProblem);
        return;
      }
      setError(null);
      if (!String(patch.slug ?? form.slug).trim()) patch.slug = slugify(form.title);
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

    return (
      <EditorShell
        eyebrow={`${ITEM_TYPES.find((t) => t.key === form.type)?.label ?? form.type} · ${areaLabel}`}
        title={form.title}
        meta={collection ? `I samlingen: ${collection.title}` : undefined}
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
                    consequence: "Medlemmers fremdrift på elementet slettes med.",
                    deleting: deleteMutation.isPending,
                    onDelete: () => deleteMutation.mutate(),
                  }
                : undefined
            }
          />
        }
      >
        <div className="grid gap-6 md:grid-cols-2">
          <HbField label="Type" htmlFor="item-type">
            <HbSelect
              id="item-type"
              value={form.type}
              onChange={(e) => onDraftChange({ type: e.target.value })}
            >
              {ITEM_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </HbSelect>
          </HbField>

          <HbField label="Samling" htmlFor="item-collection">
            <HbSelect
              id="item-collection"
              value={form.collection_id ?? ""}
              onChange={(e) => onDraftChange({ collection_id: e.target.value || null })}
            >
              <option value="">Ingen (direkte i området)</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_id ? `— ${c.title}` : c.title}
                </option>
              ))}
            </HbSelect>
          </HbField>
        </div>

        <HbField label="Titel" htmlFor="item-title">
          <HbInput
            id="item-title"
            value={form.title}
            onChange={(e) => onDraftChange({ title: e.target.value })}
          />
        </HbField>

        <SlugField
          id="item-slug"
          slug={form.slug}
          title={form.title}
          error={slugError}
          onChange={(slug) => onDraftChange({ slug })}
        />

        <HbField label="Beskrivelse" htmlFor="item-desc" help="Kort — bruges på kort-visninger.">
          <HbTextarea
            id="item-desc"
            rows={2}
            value={form.description ?? ""}
            onChange={(e) => onDraftChange({ description: e.target.value || null })}
          />
        </HbField>

        <HbField label="Indhold" htmlFor="item-body">
          <HbEditorRichtext
            key={item.id}
            content={form.body ?? ""}
            onChange={(html) => onDraftChange({ body: html })}
          />
        </HbField>

        <HbField label="Medie" htmlFor="item-media">
          <HbMediaPicker
            itemId={item.id}
            itemTitle={form.title}
            provider={form.media_provider as "none" | "bunny" | "storage" | "external"}
            bunnyVideoId={form.bunny_video_id}
            storagePath={form.storage_path}
            externalUrl={form.external_url}
            onChange={(patch) => onDraftChange(patch)}
          />
        </HbField>

        <div className="grid gap-6 md:grid-cols-2">
          {showDuration && (
            <HbField label="Varighed" htmlFor="item-duration" help="mm:ss — bruges i visning og progress.">
              <HbInput
                id="item-duration"
                value={durationText ?? formatDuration(form.duration_seconds)}
                onChange={(e) => {
                  setDurationText(e.target.value);
                  onDraftChange({ duration_seconds: parseDuration(e.target.value) });
                }}
                onBlur={() => setDurationText(null)}
                placeholder="12:30"
              />
            </HbField>
          )}

          <HbField
            label="Dryp (dage)"
            htmlFor="item-drip"
            help="Tom = arv fra samlingen. Filtreres i app-laget (B6)."
          >
            <HbInput
              id="item-drip"
              type="number"
              min={0}
              value={form.drip_after_days ?? ""}
              placeholder={inheritedDrip != null ? `arver: ${inheritedDrip}` : "straks"}
              onChange={(e) =>
                onDraftChange({
                  drip_after_days: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0),
                })
              }
            />
          </HbField>
        </div>

        {form.type === "rabataftale" && (
          <HbField
            label="Partner"
            htmlFor="item-partner"
            help="Aftalen bor i Partnere (B4) — her kobles den, så den kan surfaces i indholdsflows."
          >
            <HbSelect
              id="item-partner"
              value={form.partner_id ?? ""}
              onChange={(e) => onDraftChange({ partner_id: e.target.value || null })}
            >
              <option value="">Vælg partner…</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </HbSelect>
          </HbField>
        )}

        <HbField label="Cover" htmlFor="item-cover">
          <HbUploadZone
            kind="covers"
            ownerId={item.id}
            currentPath={form.cover_path ?? null}
            accept="image/*"
            onUploaded={(path) => onDraftChange({ cover_path: path })}
          />
        </HbField>
      </EditorShell>
    );
  },
);
ItemEditor.displayName = "ItemEditor";
