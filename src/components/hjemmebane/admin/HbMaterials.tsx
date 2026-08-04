import * as React from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, FileText, Link2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildAssetPath,
  createAttachment,
  deleteAttachment,
  listAttachments,
  persistOrder,
  updateAttachment,
  type ContentItemAttachment,
} from "@/lib/hjemmebane/adminContentApi";
import { HbInput, hbControlClasses } from "./HbField";
import { HbUploadZone } from "./HbUploadZone";

/** "Materialer"-sektionen i ItemEditor (c3-vedhaeftninger-design.md §5):
    ordnet liste af filer/links pr. item, for ALLE items uanset media_provider
    — pointen er video + bilag. Bilag er RÆKKER og persisterer straks
    (optimistisk slet/omplacér; label på blur/Enter) — bevidst uden om
    editorens ⌘S-draftmodel; dirty-markøren påvirkes ikke. Kladde-venlig:
    bilag er RLS-usynlige for medlemmer, indtil itemet publiceres. */

const basename = (path: string): string => path.split("/").pop() ?? path;

/** Én række: ikon + label-felt (gem på blur/Enter) + omplacér + slet m.
    inline-bekræftelse i rækken (ingen portal). */
const MaterialRow = ({
  attachment,
  first,
  last,
  onLabel,
  onMove,
  onDelete,
}: {
  attachment: ContentItemAttachment;
  first: boolean;
  last: boolean;
  onLabel: (label: string) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}) => {
  const [confirming, setConfirming] = useState(false);
  const [label, setLabel] = useState(attachment.label);

  const commitLabel = () => {
    const trimmed = label.trim();
    if (trimmed && trimmed !== attachment.label) onLabel(trimmed);
    else setLabel(attachment.label);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-hb-line bg-hb-surface px-3 py-2">
      {attachment.kind === "storage" ? (
        <FileText className="h-4 w-4 shrink-0 text-hb-ink-soft" />
      ) : (
        <Link2 className="h-4 w-4 shrink-0 text-hb-ink-soft" />
      )}

      {confirming ? (
        <>
          <p className="min-w-0 flex-1 truncate text-sm text-hb-ink">
            Slet "{attachment.label}"?
          </p>
          <button
            type="button"
            onClick={onDelete}
            className="shrink-0 rounded-full bg-hb-rust px-3 py-1 text-xs font-medium text-white hover:bg-hb-rust/90"
          >
            Slet
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="shrink-0 px-2 text-xs text-hb-ink-soft hover:text-hb-ink"
          >
            Fortryd
          </button>
        </>
      ) : (
        <>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitLabel();
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === "Escape") setLabel(attachment.label);
            }}
            aria-label="Label for materialet"
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-sm text-hb-ink focus:outline-none focus:ring-1 focus:ring-hb-evergreen/60"
          />
          {attachment.kind === "storage" && attachment.storage_path && (
            <span className="hidden max-w-[10rem] shrink-0 truncate text-xs text-hb-ink-soft md:inline">
              {basename(attachment.storage_path)}
            </span>
          )}
          {attachment.kind === "link" && attachment.external_url && (
            <span className="hidden max-w-[10rem] shrink-0 truncate text-xs text-hb-ink-soft md:inline">
              {attachment.external_url}
            </span>
          )}
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={first}
            aria-label="Flyt op"
            className="shrink-0 rounded-md p-1 text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink disabled:opacity-30"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={last}
            aria-label="Flyt ned"
            className="shrink-0 rounded-md p-1 text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink disabled:opacity-30"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label="Slet materialet"
            className="shrink-0 rounded-md p-1 text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-rust"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
};

export const HbMaterials = ({ itemId }: { itemId: string }) => {
  const queryClient = useQueryClient();
  const queryKey = ["admin-content", "attachments", itemId];
  const query = useQuery({ queryKey, queryFn: () => listAttachments(itemId) });
  const attachments = query.data ?? [];

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: createAttachment,
    onSuccess: invalidate,
    onError: (err: Error) => setError(err.message),
  });

  const labelMutation = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) => updateAttachment(id, { label }),
    onSuccess: invalidate,
    onError: (err: Error) => setError(err.message),
  });

  // Optimistisk slet: rækken forsvinder straks, rollback ved fejl.
  const deleteMutation = useMutation({
    mutationFn: deleteAttachment,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ContentItemAttachment[]>(queryKey);
      queryClient.setQueryData<ContentItemAttachment[]>(queryKey, (old = []) =>
        old.filter((row) => row.id !== id),
      );
      return { previous };
    },
    onError: (err: Error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      setError(err.message);
    },
    onSettled: invalidate,
  });

  // Optimistisk omplacér: samme mønster som items (position = index).
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= attachments.length) return;
    const ordered = attachments.map((a) => a.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    queryClient.setQueryData<ContentItemAttachment[]>(queryKey, (old = []) =>
      [...old]
        .map((row) => ({ ...row, position: ordered.indexOf(row.id) }))
        .sort((a, b) => a.position - b.position),
    );
    persistOrder("content_item_attachments", ordered).catch(() => invalidate());
  };

  const addLink = () => {
    const label = linkLabel.trim();
    const url = linkUrl.trim();
    if (!label) {
      setError("Linket mangler en label");
      return;
    }
    if (!/^https:\/\/.+/.test(url)) {
      setError("Linket skal være en https://-adresse");
      return;
    }
    setError(null);
    createMutation.mutate({
      item_id: itemId,
      kind: "link",
      label,
      external_url: url,
      position: attachments.length,
    });
    setLinkLabel("");
    setLinkUrl("");
    setLinkOpen(false);
  };

  return (
    <div className="space-y-2">
      {attachments.map((attachment, index) => (
        <MaterialRow
          key={attachment.id}
          attachment={attachment}
          first={index === 0}
          last={index === attachments.length - 1}
          onLabel={(label) => labelMutation.mutate({ id: attachment.id, label })}
          onMove={(delta) => move(index, delta)}
          onDelete={() => deleteMutation.mutate(attachment.id)}
        />
      ))}

      <HbUploadZone
        kind="attachments"
        ownerId={itemId}
        currentPath={null}
        onUploaded={(path) => {
          setError(null);
          createMutation.mutate({
            item_id: itemId,
            kind: "storage",
            label: basename(path),
            storage_path: path,
            position: attachments.length,
          });
        }}
      />

      {linkOpen ? (
        <div className="flex flex-wrap items-center gap-2">
          <HbInput
            autoFocus
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="Label (fx 'Skats momsguide')"
            aria-label="Label for linket"
            className={cn(hbControlClasses, "w-auto min-w-0 flex-1 py-2 text-sm")}
          />
          <HbInput
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
            }}
            placeholder="https://…"
            aria-label="Linkets URL"
            spellCheck={false}
            className={cn(hbControlClasses, "w-auto min-w-0 flex-1 py-2 text-sm")}
          />
          <button
            type="button"
            onClick={addLink}
            disabled={createMutation.isPending}
            className="rounded-full bg-hb-evergreen px-4 py-2 text-sm font-medium text-white hover:bg-hb-evergreen/90 disabled:opacity-50"
          >
            Tilføj
          </button>
          <button
            type="button"
            onClick={() => {
              setLinkOpen(false);
              setError(null);
            }}
            className="px-2 text-sm text-hb-ink-soft hover:text-hb-ink"
          >
            Fortryd
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setLinkOpen(true)}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-hb-ink-soft transition-colors hover:bg-hb-sage/25 hover:text-hb-ink"
        >
          <Plus className="h-4 w-4" />
          Tilføj link
        </button>
      )}

      {error && <p className="text-xs text-hb-rust">{error}</p>}
    </div>
  );
};
