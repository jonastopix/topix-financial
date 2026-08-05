import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import topixIcon from "@/assets/topix-icon-green.png";
import { cn } from "@/lib/utils";

export type AdminSection = "boardroom" | "content" | "partners" | "events" | "progress";

/** Admin-spejlet (konvergens.md §5): fanerne spejler medlemmets verden i
    medlemmets rækkefølge; advisor-drift (Fremdrift) står sidst efter en
    diskret divider. Keys/URL'er er historiske og BEVARES — kun labels og
    rækkefølge spejler. */
const SECTIONS: { key: AdminSection; label: string; to: string; drift?: boolean }[] = [
  { key: "boardroom", label: "Dit Boardroom", to: "/admin/indhold/boardroom" },
  { key: "content", label: "Akademiet", to: "/admin/indhold" },
  { key: "partners", label: "Rabataftaler", to: "/admin/indhold/partnere" },
  { key: "events", label: "Events", to: "/admin/indhold/events" },
  { key: "progress", label: "Fremdrift", to: "/admin/indhold/fremdrift", drift: true },
];

interface HbAdminShellProps {
  section: AdminSection;
  children: React.ReactNode;
}

/** Standalone-skal for admin-fladen: egen scroll-model (som PreviewHjemmebane),
    rolig header med tilbage-link og sektions-switcher — store ord, ingen
    tab-bar-støj; drift-fanerne bag en stille divider. Ikke AppLayout:
    appens mørke tema forbliver urørt. */
export const HbAdminShell = ({ section, children }: HbAdminShellProps) => (
  <div className="theme-hjemmebane flex h-screen flex-col overflow-hidden bg-hb-paper font-body text-hb-ink antialiased">
    <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-hb-line bg-hb-paper px-6 py-4">
      <Link
        to="/"
        className="flex items-center gap-2 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        <img src={topixIcon} alt="" className="h-6 w-6 rounded-md" />
        <span className="hidden sm:inline">The Boardroom</span>
      </Link>

      <nav aria-label="Indholdssektioner" className="flex items-baseline gap-5">
        {SECTIONS.map((entry, index) => {
          const active = entry.key === section;
          const firstDrift = entry.drift && !SECTIONS[index - 1]?.drift;
          return (
            <React.Fragment key={entry.key}>
              {/* Diskret adskillelse: spejl-fanerne til venstre, advisor-
                  drift til højre — mærkbar, ikke råbende. */}
              {firstDrift && <span aria-hidden className="h-5 w-px self-center bg-hb-line" />}
              <Link
                to={entry.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "font-editorial text-xl transition-colors md:text-2xl",
                  active
                    ? "font-medium text-hb-ink underline decoration-hb-evergreen decoration-2 underline-offset-8"
                    : "text-hb-ink-soft hover:text-hb-ink",
                )}
              >
                {entry.label}
              </Link>
            </React.Fragment>
          );
        })}
      </nav>

      <p className="ml-auto hidden text-xs text-hb-ink-soft md:block">
        Admin · kun rådgivere
      </p>
    </header>

    <div className="min-h-0 flex-1">{children}</div>
  </div>
);

interface HbAdminSplitProps {
  list: React.ReactNode;
  editor: React.ReactNode;
  /** Mobil: editoren åbner som fuldskærms-lag i samme DOM (ingen portal). */
  editorOpen: boolean;
  onCloseEditor: () => void;
}

/** Master–detail: listen til venstre, editoren til højre — man flytter fokus,
    man skifter ikke side. Desktop-først; mobil stabler ærligt.
    Editoren er ÉN instans (ref/hotkeys/Tiptap) — mobil-overlayet er ren CSS
    på samme container, ingen dublet-mount og ingen portal. */
export const HbAdminSplit = ({ list, editor, editorOpen, onCloseEditor }: HbAdminSplitProps) => (
  <div className="flex h-full min-h-0">
    <div className="flex h-full w-full min-w-0 flex-col overflow-y-auto border-r border-hb-line bg-hb-paper md:w-[380px] md:shrink-0">
      {list}
    </div>

    {/* Editoren ejer sin egen scroll (fast bundlinje i EditorShell). */}
    <div
      className={cn(
        "min-w-0 flex-1 bg-hb-surface",
        editorOpen
          ? "fixed inset-0 z-40 flex flex-col md:static md:z-auto md:block md:h-full"
          : "hidden md:block md:h-full",
      )}
    >
      {editorOpen && (
        <div className="flex shrink-0 items-center border-b border-hb-line px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={onCloseEditor}
            className="flex items-center gap-2 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Tilbage til listen
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 md:h-full">{editor}</div>
    </div>
  </div>
);
