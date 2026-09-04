import { useRef } from "react";
import { Link } from "react-router-dom";
import { Archive, BookOpen, Check, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MILESTONE_CATEGORIES } from "@/lib/milestoneCategories";
import { HbTag } from "../HbTag";
import type { Milestone } from "./useMilestones";

/**
 * Én milestone som række — HbItemRow's form (akademi/HbItemRow.tsx):
 * tilstandsprik, titel, meta, og til højre det der hører til. Under
 * rækken en stille fremdriftsbar (HbProgressBar-/HbHandoutCard-formen:
 * 3 px hairline, evergreen). Status-SPROGET er HbHandoutCards, ordret:
 * «Ikke startet» / «I gang · N %» / «Gennemført» — og for målbare
 * milestones «3 af 10 kunder», som HbProgressBar siger «3 af 8».
 *
 * KATEGORIFARVER: milestoneCategories.ts giver hver af de fjorten
 * kategorier sin egen rå tailwind-farve (emerald, blue, indigo, pink,
 * cyan, violet …, med dark:-varianter). Her bruges de IKKE. Hjemmebane
 * bruger få farver med vilje — papir, blæk, evergreen, rust, sage — og
 * rust bærer allerede fire betydninger. Fjorten kategorifarver ville være
 * fjorten nye betydninger oven i, og ingen af dem siger noget ordet og
 * ikonet ikke allerede siger. Kategorien er derfor et HbTag (sage, som
 * Akademiets kategorier) med kategoriens ikon og label; farven er
 * erstattet af noget roligere, ikke oversat. Ikonerne og labels'ene
 * læses stadig fra milestoneCategories.ts — filen er urørt.
 *
 * HANDLINGER UDEN PORTAL bygges her: afkrydsning (prikken), fremdrift
 * (klik på baren, 5 %-trin — som MilestonesList.ClickableProgressBar),
 * parkering/genaktivering, navigation til handoutet. Rediger og slet
 * kræver Dialog/AlertDialog og åbner ind til portalerne i
 * MilestoneDialoger.tsx (ETAPE 2) — se onAabn/onSlet.
 */

const formatDeadline = (d: Date | null): string =>
  d ? d.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : "Ingen deadline";

/** Tilstandsprik: ● gennemført · ◐ i gang · ○ ikke startet · ▢ parkeret.
    Klik skifter fuldført/aktiv (MilestonesList.tsx:162-168). */
const Tilstandsprik = ({ ms, onToggle }: { ms: Milestone; onToggle: () => void }) => {
  const titel = ms.status === "done" ? "Marker som aktiv" : "Marker som færdig";
  const inner =
    ms.status === "done" ? (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-hb-evergreen">
        <Check className="h-3 w-3 text-white" />
      </span>
    ) : ms.status === "parked" ? (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-hb-line">
        <Archive className="h-3 w-3 text-hb-ink-soft" />
      </span>
    ) : (
      <span
        className={cn(
          "block h-5 w-5 rounded-full border",
          ms.status === "in-progress"
            ? "border-hb-evergreen [background:linear-gradient(90deg,hsl(var(--hb-evergreen))_50%,transparent_50%)]"
            : "border-hb-line",
        )}
      />
    );
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={titel}
      aria-label={titel}
      disabled={ms.status === "parked"}
      className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen focus-visible:ring-offset-2 disabled:cursor-default"
    >
      {inner}
    </button>
  );
};

/** Fremdriften i ord — HbHandoutCards sprog, ordret; målbare i «af». */
const fremdriftTekst = (ms: Milestone): string => {
  if (ms.target_value && ms.unit) {
    return ms.progress >= 100 ? "Gennemført" : `${ms.current_value ?? 0} af ${ms.target_value} ${ms.unit}`;
  }
  if (ms.status === "done") return "Gennemført";
  if (ms.status === "in-progress") return `I gang · ${ms.progress} %`;
  if (ms.status === "parked") return "Parkeret";
  return "Ikke startet";
};

export const HbMilestoneRaekke = ({
  ms, onAabn, onToggle, onFremgang, onParker, onSlet,
}: {
  ms: Milestone;
  /** Åbner detalje/rediger — ETAPE 2-portal (MilestoneDialoger.tsx). */
  onAabn: () => void;
  onToggle: () => void;
  /** Kun for ikke-målbare: klik på baren sætter fremgang i 5 %-trin. */
  onFremgang: (p: number) => void;
  onParker: () => void;
  /** Åbner slet-bekræftelsen — ETAPE 2-portal (MilestoneDialoger.tsx). */
  onSlet: () => void;
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const cfg = MILESTONE_CATEGORIES[ms.category] || MILESTONE_CATEGORIES.other;
  const Ikon = cfg.icon;
  const maalbar = !!(ms.target_value && ms.unit);
  const parkeret = ms.status === "parked";
  const klikbarBar = !maalbar && !parkeret;

  // MilestonesList.tsx:90-95, ordret: klik-position → 5 %-trin.
  const fremgangAf = (clientX: number): number => {
    if (!barRef.current) return ms.progress;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.round(((clientX - rect.left) / rect.width) * 100);
    return Math.min(100, Math.max(0, Math.round(pct / 5) * 5));
  };

  return (
    <li className={cn("py-3", parkeret && "opacity-60")}>
      <div className="flex items-start gap-3.5">
        <div className="pt-0.5">
          <Tilstandsprik ms={ms} onToggle={onToggle} />
        </div>
        <div className="min-w-0 flex-1">
          {/* Titlen åbner detaljen (som hele kortet gjorde før). */}
          <button type="button" onClick={onAabn} className="block w-full text-left">
            <p className={cn("text-[15px] leading-snug", ms.status === "done" ? "text-hb-ink-soft line-through" : "text-hb-ink")}>{ms.title}</p>
            <p className="mt-0.5 text-xs text-hb-ink-soft">
              {formatDeadline(ms.deadline)}
              {ms.baseline && <span> · {ms.baseline}</span>}
            </p>
          </button>
          {/* Fremdrift: hairline + ord. Klikbar for ikke-målbare, aktive. */}
          <div className="mt-2 flex items-center gap-3">
            <div
              ref={barRef}
              onClick={klikbarBar ? (e) => onFremgang(fremgangAf(e.clientX)) : undefined}
              title={klikbarBar ? "Klik for at ændre fremgang" : undefined}
              className={cn("flex-1 py-1.5", klikbarBar && "cursor-pointer")}
            >
              <div className="h-[3px] overflow-hidden rounded-full bg-hb-line">
                <div
                  className={ms.progress >= 100 ? "h-full rounded-full bg-hb-evergreen" : "h-full rounded-full bg-hb-evergreen/70"}
                  style={{ width: `${Math.min(100, Math.max(0, ms.progress))}%` }}
                />
              </div>
            </div>
            <span className="shrink-0 text-xs text-hb-ink-soft">{fremdriftTekst(ms)}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <HbTag className="gap-1 px-2 py-0.5 text-[11px]">
            <Ikon className="h-3 w-3" />
            {cfg.label}
          </HbTag>
          {ms.source === "ai" && (
            <HbTag className="gap-1 bg-hb-paper px-2 py-0.5 text-[11px] text-hb-ink-soft">
              <Sparkles className="h-3 w-3" /> AI
            </HbTag>
          )}
          {ms.source === "handout" && (
            ms.source_report ? (
              <Link to={`/handouts?module=${ms.source_report}`} className="inline-flex items-center gap-1 rounded-full bg-hb-paper px-2 py-0.5 text-[11px] font-medium text-hb-evergreen underline-offset-4 hover:underline">
                <BookOpen className="h-3 w-3" /> Fra handout
              </Link>
            ) : (
              <HbTag className="gap-1 bg-hb-paper px-2 py-0.5 text-[11px] text-hb-ink-soft">
                <BookOpen className="h-3 w-3" /> Fra handout
              </HbTag>
            )
          )}
          <button
            type="button"
            onClick={onParker}
            title={parkeret ? "Genaktivér" : "Parker i køleskab"}
            aria-label={parkeret ? "Genaktivér" : "Parker i køleskab"}
            className="rounded-full p-1.5 text-hb-ink-soft transition-colors hover:bg-hb-sage/50 hover:text-hb-ink"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
          {/* ETAPE 2: slet åbner AlertDialog-portalen. */}
          <button
            type="button"
            onClick={onSlet}
            title="Slet"
            aria-label="Slet"
            className="rounded-full p-1.5 text-hb-ink-soft transition-colors hover:bg-hb-sage/50 hover:text-hb-rust"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
};
