import * as React from "react";
import { cn } from "@/lib/utils";

export type HbEntityStatus = "draft" | "published" | "archived" | "cancelled" | "completed";

const STATUS_META: Record<HbEntityStatus, { label: string; dotClass: string }> = {
  draft: { label: "Kladde", dotClass: "bg-hb-ink-soft/50" },
  published: { label: "Publiceret", dotClass: "bg-hb-evergreen" },
  archived: { label: "Arkiveret", dotClass: "bg-hb-line" },
  cancelled: { label: "Aflyst", dotClass: "bg-hb-rust" },
  completed: { label: "Afholdt", dotClass: "bg-hb-ink-soft/50" },
};

/** Stille statusprik til lister: ● published, ○ draft, nedtonet arkiv. */
export const HbStatusDot = ({ status, className }: { status: string; className?: string }) => {
  const meta = STATUS_META[(status as HbEntityStatus) in STATUS_META ? (status as HbEntityStatus) : "draft"];
  return (
    <span
      aria-label={meta.label}
      title={meta.label}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", meta.dotClass, className)}
    />
  );
};

/** Status som rolig pill — bruges i editorens bundlinje. */
export const HbStatusPill = ({ status }: { status: string }) => {
  const meta = STATUS_META[(status as HbEntityStatus) in STATUS_META ? (status as HbEntityStatus) : "draft"];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-hb-line bg-hb-surface px-3 py-1 text-xs font-medium text-hb-ink">
      <span className={cn("h-2 w-2 rounded-full", meta.dotClass)} />
      {meta.label}
    </span>
  );
};
