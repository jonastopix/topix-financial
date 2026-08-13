import * as React from "react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type Partner, deletePartner, updatePartner } from "@/lib/hjemmebane/adminContentApi";
import { HbEditorRichtext } from "../HbEditorRichtext";
import { HbField, HbInput, HbTextarea } from "../HbField";
import { HbSegmented } from "../HbSegmented";
import { HbUploadZone } from "../HbUploadZone";
import { EditorBar, EditorShell, type EditorAction, type EditorHandle } from "./shared";

type Draft = Partial<Partner>;

interface PartnerEditorProps {
  partner: Partner;
  /** Eksisterende kategorier — genbrug via datalist uden CHECK-pres. */
  categories: string[];
  draft: Draft;
  onDraftChange: (patch: Draft) => void;
  onSaved: () => void;
  onDeleted: () => void;
}

const REDEMPTION_OPTIONS = [
  { value: "kode", label: "Kode" },
  { value: "link", label: "Link" },
  { value: "kontakt", label: "Kontakt" },
] as const;

/** CHECK-constrainten partners_redemption_matches_type spejles før gem. */
const redemptionError = (form: Partner): string | null => {
  if (form.redemption_type === "kode" && !form.redemption_code?.trim())
    return "Indløsning via kode kræver en kode";
  if (form.redemption_type === "link" && !form.redemption_url?.trim())
    return "Indløsning via link kræver en URL";
  if (form.redemption_type === "kontakt" && !form.redemption_contact?.trim())
    return "Indløsning via kontakt kræver navn/mail";
  return null;
};

export const PartnerEditor = forwardRef<EditorHandle, PartnerEditorProps>(
  ({ partner, categories, draft, onDraftChange, onSaved, onDeleted }, ref) => {
    const queryClient = useQueryClient();
    const [savedAt, setSavedAt] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);

    const form = { ...partner, ...draft } as Partner;
    const dirty = Object.keys(draft).length > 0;

    const mutation = useMutation({
      mutationFn: (patch: Draft) => updatePartner(partner.id, patch),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
        setSavedAt(new Date());
        setError(null);
        onSaved();
      },
      onError: (err: Error) => setError(err.message),
    });

    const persist = (extra: Draft = {}) => {
      if (mutation.isPending) return;
      const patch: Draft = { ...draft, ...extra };
      const next = { ...partner, ...patch } as Partner;
      const problem =
        (!next.name.trim() && "Navn mangler") ||
        (!next.category.trim() && "Kategori mangler") ||
        (!next.discount_text.trim() && "Rabatteksten mangler") ||
        redemptionError(next);
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
      mutationFn: () => deletePartner(partner.id),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
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
              { label: "Publicér", onClick: () => persist({ status: "published" }), variant: "primary" },
              { label: "Arkivér", onClick: () => persist({ status: "archived" }), variant: "link" },
            ];

    return (
      <EditorShell
        eyebrow={`Partner · ${form.category || "uden kategori"}`}
        title={form.name}
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
                    entityLabel: form.name || "Uden navn",
                    consequence: "Indholds-elementer der peger på partneren mister kun koblingen.",
                    deleting: deleteMutation.isPending,
                    onDelete: () => deleteMutation.mutate(),
                  }
                : undefined
            }
          />
        }
      >
        <div className="grid gap-6 md:grid-cols-2">
          <HbField label="Navn" htmlFor="partner-name">
            <HbInput
              id="partner-name"
              value={form.name}
              onChange={(e) => onDraftChange({ name: e.target.value })}
            />
          </HbField>

          <HbField label="Kategori" htmlFor="partner-category">
            <HbInput
              id="partner-category"
              list="partner-categories"
              value={form.category}
              onChange={(e) => onDraftChange({ category: e.target.value })}
            />
            <datalist id="partner-categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </HbField>
        </div>

        <HbField label="Beskrivelse" htmlFor="partner-desc">
          <HbTextarea
            id="partner-desc"
            rows={2}
            value={form.description ?? ""}
            onChange={(e) => onDraftChange({ description: e.target.value || null })}
          />
        </HbField>

        <HbField label="Rabataftalen" htmlFor="partner-discount" help="Aftalens indhold, præcis tekst.">
          <HbTextarea
            id="partner-discount"
            value={form.discount_text}
            onChange={(e) => onDraftChange({ discount_text: e.target.value })}
          />
        </HbField>

        {/* htmlFor udeladt: richtext/picker/zone har ikke ét labelbart input. */}
        <HbField
          label="Hvad medlemmet får"
          help="Punktliste over hvad aftalen giver. Vises på aftalens side."
        >
          <HbEditorRichtext
            key={partner.id}
            content={form.indhold ?? ""}
            onChange={(html) => onDraftChange({ indhold: html })}
          />
        </HbField>

        {/* htmlFor udeladt: segmented + betinget input er ikke ét labelbart felt. */}
        <HbField label="Indløsning">
          <div className="space-y-4">
            <HbSegmented
              aria-label="Indløsningstype"
              value={form.redemption_type as (typeof REDEMPTION_OPTIONS)[number]["value"]}
              options={[...REDEMPTION_OPTIONS]}
              onChange={(value) => onDraftChange({ redemption_type: value })}
            />
            {form.redemption_type === "kode" && (
              <HbInput
                aria-label="Rabatkode"
                value={form.redemption_code ?? ""}
                onChange={(e) => onDraftChange({ redemption_code: e.target.value || null })}
                placeholder="Rabatkoden"
                spellCheck={false}
                className="font-mono text-sm"
              />
            )}
            {form.redemption_type === "link" && (
              <HbInput
                aria-label="Indløsnings-URL"
                type="url"
                value={form.redemption_url ?? ""}
                onChange={(e) => onDraftChange({ redemption_url: e.target.value.trim() || null })}
                placeholder="https://…"
                spellCheck={false}
              />
            )}
            {form.redemption_type === "kontakt" && (
              <HbInput
                aria-label="Kontakt"
                value={form.redemption_contact ?? ""}
                onChange={(e) => onDraftChange({ redemption_contact: e.target.value || null })}
                placeholder="Navn / mail"
              />
            )}
          </div>
        </HbField>

        <div className="grid gap-6 md:grid-cols-2">
          <HbField label="Website" htmlFor="partner-website">
            <HbInput
              id="partner-website"
              type="url"
              value={form.website_url ?? ""}
              onChange={(e) => onDraftChange({ website_url: e.target.value.trim() || null })}
              placeholder="https://…"
              spellCheck={false}
            />
          </HbField>

          <HbField label="Gyldig til" htmlFor="partner-valid" help="Tom = løbende aftale.">
            <HbInput
              id="partner-valid"
              type="date"
              value={form.valid_until ?? ""}
              onChange={(e) => onDraftChange({ valid_until: e.target.value || null })}
            />
          </HbField>
        </div>

        <HbField label="Logo">
          <HbUploadZone
            kind="partners"
            ownerId={partner.id}
            currentPath={form.logo_path ?? null}
            accept="image/*"
            onUploaded={(path) => onDraftChange({ logo_path: path })}
          />
        </HbField>
      </EditorShell>
    );
  },
);
PartnerEditor.displayName = "PartnerEditor";
