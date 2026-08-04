import * as React from "react";
import { useState } from "react";
import { RotateCw } from "lucide-react";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HbStatusPill } from "../HbStatusPill";
import { HbField, HbInput } from "../HbField";
import { slugify } from "@/lib/hjemmebane/slug";

/** Fælles editor-mekanik: skelet med fast bundlinje, slug-felt med ⟳,
    gemme-kvittering som stille tekst (ingen toasts — Mola) og
    handle-kontrakten som sidens hotkeys (⌘S/⌘⇧P) kalder ind i. */

export interface EditorHandle {
  save: () => void;
  publish: () => void;
}

export interface EditorAction {
  label: string;
  onClick: () => void;
  variant: "primary" | "secondary" | "link";
}

export const formatClock = (date: Date): string =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

/** DB'ens UNIQUE-fejl på slug oversat til feltfejl. */
export const isSlugUniqueError = (message: string): boolean =>
  /duplicate key/i.test(message) && /slug/i.test(message);

export const toLocalInputValue = (iso: string | null): string => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const fromLocalInputValue = (value: string): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** Varighed vises som mm:ss (eller t:mm:ss); gemmes som sekunder. */
export const formatDuration = (seconds: number | null): string => {
  if (seconds == null || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

export const parseDuration = (input: string): number | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const parts = trimmed.split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p) || p < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
};

interface EditorShellProps {
  eyebrow: string;
  title: string;
  meta?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export const EditorShell = ({ eyebrow, title, meta, children, footer }: EditorShellProps) => (
  <div className="flex h-full min-h-0 flex-col bg-hb-surface">
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{eyebrow}</p>
        <h2 className="mt-2 truncate font-editorial text-2xl font-medium leading-tight text-hb-ink md:text-3xl">
          {title || "Uden titel"}
        </h2>
        {meta && <p className="mt-1.5 text-sm text-hb-ink-soft">{meta}</p>}
        <div className="mt-8 space-y-6">{children}</div>
      </div>
    </div>
    <div className="shrink-0 border-t border-hb-line bg-hb-surface px-6 py-4 md:px-10">{footer}</div>
  </div>
);

/** Permanent sletning — kun synlig fra arkivet (strukturel dobbeltsikring).
    Bekræftelsen sker inline i bundlinjen: ingen portal, ingen browser-confirm. */
export interface DeleteSpec {
  /** Entitetens navn til knapteksten: Slet "Testsamling". */
  entityLabel: string;
  /** Sat = sletning nægtes med denne rolige besked (fx ikke-tom samling). */
  blockedReason?: string;
  /** Ekstra konsekvenslinje i bekræftelsen (fx "3 tilmeldinger slettes med"). */
  consequence?: string;
  deleting: boolean;
  onDelete: () => void;
}

interface EditorBarProps {
  status: string;
  dirty: boolean;
  saving: boolean;
  savedAt: Date | null;
  error?: string | null;
  onSave: () => void;
  actions: EditorAction[];
  /** Kun angivet når sletning overhovedet er mulig (status = arkiveret m.v.). */
  deleteSpec?: DeleteSpec;
}

/** Bundlinjen: status + stille kvittering til venstre, handlinger til højre.
    "Publicering er en bevidst, synlig handling" — derfor knap, ikke toggle. */
export const EditorBar = ({
  status,
  dirty,
  saving,
  savedAt,
  error,
  onSave,
  actions,
  deleteSpec,
}: EditorBarProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (deleteSpec && confirmOpen) {
    return (
      <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2">
        {deleteSpec.blockedReason ? (
          <>
            <p className="min-w-0 flex-1 text-sm text-hb-ink">{deleteSpec.blockedReason}</p>
            <HbButton
              variant="secondary"
              className="h-9 px-4 text-sm"
              onClick={() => setConfirmOpen(false)}
            >
              Forstået
            </HbButton>
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 text-sm text-hb-ink">
              Slettes permanent — kan ikke fortrydes.
              {deleteSpec.consequence && (
                <span className="text-hb-ink-soft"> {deleteSpec.consequence}</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <HbButton
                variant="secondary"
                className="h-9 px-4 text-sm"
                onClick={() => setConfirmOpen(false)}
                disabled={deleteSpec.deleting}
              >
                Fortryd
              </HbButton>
              <button
                type="button"
                onClick={deleteSpec.onDelete}
                disabled={deleteSpec.deleting}
                className="inline-flex h-9 items-center rounded-full bg-hb-rust px-4 text-sm font-medium text-white transition-colors hover:bg-hb-rust/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {deleteSpec.deleting ? "Sletter…" : `Slet "${deleteSpec.entityLabel}"`}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
    <HbStatusPill status={status} />
    <p className="min-w-0 flex-1 truncate text-xs text-hb-ink-soft">
      {error ? (
        <span className="text-hb-rust">{error}</span>
      ) : saving ? (
        "Gemmer…"
      ) : dirty ? (
        "Ugemte ændringer"
      ) : savedAt ? (
        `Gemt · ${formatClock(savedAt)}`
      ) : null}
    </p>
    <div className="flex items-center gap-2">
      {deleteSpec && (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="px-2 text-sm text-hb-ink-soft underline-offset-4 transition-colors hover:text-hb-rust hover:underline"
        >
          Slet permanent
        </button>
      )}
      {actions
        .filter((a) => a.variant === "link")
        .map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className="px-2 text-sm text-hb-ink-soft underline-offset-4 transition-colors hover:text-hb-ink hover:underline"
          >
            {action.label}
          </button>
        ))}
      <HbButton variant="secondary" className="h-9 px-4 text-sm" onClick={onSave} disabled={saving}>
        Gem <span className="text-hb-ink-soft">⌘S</span>
      </HbButton>
      {actions
        .filter((a) => a.variant !== "link")
        .map((action) => (
          <HbButton
            key={action.label}
            variant={action.variant === "primary" ? "primary" : "secondary"}
            className="h-9 px-4 text-sm"
            onClick={action.onClick}
            disabled={saving}
          >
            {action.label}
          </HbButton>
        ))}
    </div>
  </div>
  );
};

interface SlugFieldProps {
  id: string;
  slug: string;
  title: string;
  error?: string | null;
  onChange: (slug: string) => void;
}

/** Slug med ⟳-forslag fra titlen. Unikhed håndhæves af DB — fejl vises her. */
export const SlugField = ({ id, slug, title, error, onChange }: SlugFieldProps) => (
  <HbField label="Slug" htmlFor={id} error={error}>
    <div className="flex items-center gap-2">
      <HbInput
        id={id}
        value={slug}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="font-mono text-sm"
      />
      <button
        type="button"
        title="Foreslå ud fra titlen"
        aria-label="Foreslå slug ud fra titlen"
        onClick={() => onChange(slugify(title))}
        className="rounded-lg border border-hb-line p-2.5 text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
      >
        <RotateCw className="h-4 w-4" />
      </button>
    </div>
  </HbField>
);

/** Tom højreside: rolig instruktion + genvejene, så de kan opdages. */
export const EditorEmptyState = ({ hints }: { hints: [string, string][] }) => (
  <div className="flex h-full items-center justify-center bg-hb-surface px-10">
    <div className="max-w-sm">
      <p className="text-sm leading-relaxed text-hb-ink-soft">
        Vælg noget i listen — eller opret nyt. Ændringer gemmes først når du gemmer; kladder er
        ufarlige.
      </p>
      <dl className="mt-6 space-y-1.5">
        {hints.map(([key, label]) => (
          <div key={key} className="flex items-baseline gap-3 text-sm">
            <dt className="w-14 shrink-0 rounded-md bg-hb-sage/50 px-1.5 py-0.5 text-center font-mono text-xs text-hb-ink">
              {key}
            </dt>
            <dd className="text-hb-ink-soft">{label}</dd>
          </div>
        ))}
      </dl>
    </div>
  </div>
);
