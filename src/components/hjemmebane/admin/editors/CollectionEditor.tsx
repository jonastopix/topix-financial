import * as React from "react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AREAS,
  type AreaKey,
  type ContentCollection,
  updateCollection,
} from "@/lib/hjemmebane/adminContentApi";
import { slugify } from "@/lib/hjemmebane/slug";
import { HbField, HbInput, HbSelect, HbTextarea } from "../HbField";
import { HbUploadZone } from "../HbUploadZone";
import {
  EditorBar,
  EditorShell,
  SlugField,
  isSlugUniqueError,
  type EditorAction,
  type EditorHandle,
} from "./shared";

type Draft = Partial<ContentCollection>;

interface CollectionEditorProps {
  collection: ContentCollection;
  /** Rod-samlinger i området (kursus→modul-forældre); kun Academy viser valget. */
  rootCollections: ContentCollection[];
  draft: Draft;
  onDraftChange: (patch: Draft) => void;
  onSaved: () => void;
}

export const CollectionEditor = forwardRef<EditorHandle, CollectionEditorProps>(
  ({ collection, rootCollections, draft, onDraftChange, onSaved }, ref) => {
    const queryClient = useQueryClient();
    const [savedAt, setSavedAt] = useState<Date | null>(null);
    const [slugError, setSlugError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const form = { ...collection, ...draft };
    const dirty = Object.keys(draft).length > 0;
    const areaLabel = AREAS.find((a) => a.key === (form.area as AreaKey))?.label ?? form.area;

    const mutation = useMutation({
      mutationFn: (patch: Draft) => updateCollection(collection.id, patch),
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
      setError(null);
      const patch: Draft = { ...draft, ...extra };
      if (!String(patch.slug ?? form.slug).trim()) patch.slug = slugify(form.title);
      mutation.mutate(patch);
    };

    useImperativeHandle(ref, () => ({
      save: () => persist(),
      publish: () => persist({ status: "published" }),
    }));

    const actions: EditorAction[] =
      form.status === "published"
        ? [
            { label: "Tilbage til kladde", onClick: () => persist({ status: "draft" }), variant: "secondary" },
            { label: "Arkivér", onClick: () => persist({ status: "archived" }), variant: "link" },
          ]
        : form.status === "archived"
          ? [{ label: "Gendan som kladde", onClick: () => persist({ status: "draft" }), variant: "primary" }]
          : [
              { label: "Publicér", onClick: () => persist({ status: "published" }), variant: "primary" },
              { label: "Arkivér", onClick: () => persist({ status: "archived" }), variant: "link" },
            ];

    return (
      <EditorShell
        eyebrow={`Samling · ${areaLabel}`}
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
          />
        }
      >
        <HbField label="Titel" htmlFor="col-title">
          <HbInput
            id="col-title"
            value={form.title}
            onChange={(e) => onDraftChange({ title: e.target.value })}
          />
        </HbField>

        <SlugField
          id="col-slug"
          slug={form.slug}
          title={form.title}
          error={slugError}
          onChange={(slug) => onDraftChange({ slug })}
        />

        <HbField label="Beskrivelse" htmlFor="col-desc">
          <HbTextarea
            id="col-desc"
            value={form.description ?? ""}
            onChange={(e) => onDraftChange({ description: e.target.value || null })}
          />
        </HbField>

        {form.area === "academy" && (
          <HbField
            label="Forælder"
            htmlFor="col-parent"
            help="Kursus → modul: vælg kurset som forælder for et modul."
          >
            <HbSelect
              id="col-parent"
              value={form.parent_id ?? ""}
              onChange={(e) => onDraftChange({ parent_id: e.target.value || null })}
            >
              <option value="">Ingen (kursus på rodniveau)</option>
              {rootCollections
                .filter((root) => root.id !== collection.id)
                .map((root) => (
                  <option key={root.id} value={root.id}>
                    {root.title}
                  </option>
                ))}
            </HbSelect>
          </HbField>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <HbField
            label="Dryp (dage)"
            htmlFor="col-drip"
            help="Tom = straks tilgængelig. Arves af indhold uden egen dryp."
          >
            <HbInput
              id="col-drip"
              type="number"
              min={0}
              value={form.drip_after_days ?? ""}
              onChange={(e) =>
                onDraftChange({
                  drip_after_days: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0),
                })
              }
            />
          </HbField>
        </div>

        <HbField label="Cover" htmlFor="col-cover">
          <HbUploadZone
            kind="covers"
            ownerId={collection.id}
            currentPath={form.cover_path ?? null}
            accept="image/*"
            onUploaded={(path) => onDraftChange({ cover_path: path })}
          />
        </HbField>
      </EditorShell>
    );
  },
);
CollectionEditor.displayName = "CollectionEditor";
