import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Calendar, type CalendarProps } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

/**
 * Hb-overlejringer til milestone-dialogerne (etape 2, 4/9) — bygget i
 * skallens EGET DOM-træ efter HbSidebarDrawer-mønstret (HbSidebar.tsx:
 * 197-215, «bevidst IKKE shadcn Sheet») og tjeklistens velkomst-
 * overlejring (HbOnboardingTjekliste.tsx:31-34, «IKKE EN RADIX-DIALOG»):
 * fixed, egen overlay, ingen portal. Radix portalerer til <body>, uden
 * for .theme-hjemmebane, og arver appens mørke tokens.
 *
 * HVORFOR EN NY PRIMITIV: huset har ingen. De to overlejringer der findes
 * er skrevet ad hoc inde i hver sin komponent (drawer, velkomst), og ingen
 * af dem fanger fokus eller lytter på Escape — de har én lukkeknap og et
 * overlay-klik. Dialogerne her skal give det Radix gav os gratis (se
 * nedenfor), og det hører til ét sted. Den ligger i milestones/, fordi
 * etape 2 ikke må røre andet; den kan løftes til hjemmebane/ den dag en
 * anden flade skal bruge den.
 *
 * DET RADIX GAV OS GRATIS — og hvordan hver ting er løst her:
 *   1. FOKUS FANGES i dialogen: ved åbning flyttes fokus til det første
 *      fokuserbare element i panelet (ellers panelet selv, tabIndex -1);
 *      Tab/Shift+Tab cykler inden for panelet (keydown-lytter på document,
 *      første ↔ sidste fokuserbare). Popoveren fanger IKKE fokus — det
 *      gjorde Radix Popover heller ikke; den lukker ved fokus/klik udenfor.
 *   2. ESCAPE LUKKER: keydown-lytter på document mens åben. Popoverens
 *      lytter kører i capture-fasen og stopper hændelsen, så et Escape i
 *      datovælgeren lukker KUN datovælgeren, ikke dialogen bag den —
 *      samme lagdeling som Radix' DismissableLayer.
 *   3. KLIK PÅ OVERLAY LUKKER (Dialog) — men IKKE for advarselsdialogen
 *      (AlertDialog lukker kun via knapperne og Escape; det er dens pointe,
 *      og adfærden er bevaret med `lukVedOverlay={false}`). Popoveren
 *      lukker ved mousedown uden for sin wrapper.
 *   4. FOKUS VENDER TILBAGE: elementet der havde fokus ved åbning gemmes
 *      og får fokus igen ved lukning (dialog); popoveren giver fokus
 *      tilbage til sin egen trigger-knap.
 *   Desuden role="dialog"/"alertdialog", aria-modal, aria-labelledby på
 *   overskriften. IKKE genskabt: Radix' scroll-lås på <body>. Hb-skallen
 *   scroller indholdskolonnen, ikke body, så en lås på body ville ikke
 *   have virket alligevel; panelet har overscroll-contain, så scroll i
 *   panelet ikke løber ud i siden.
 */

const FOKUSERBAR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const fokuserbare = (rod: HTMLElement): HTMLElement[] =>
  Array.from(rod.querySelectorAll<HTMLElement>(FOKUSERBAR)).filter((el) => el.offsetParent !== null || el === document.activeElement);

export const HbDialog = ({
  open, onClose, titel, beskrivelse, alert = false, lukVedOverlay = !alert, bred = false, children, fod,
}: {
  open: boolean;
  onClose: () => void;
  /** Overskriften (aria-labelledby). Kan være en node — detaljen har en redigerbar titel. */
  titel: ReactNode;
  beskrivelse?: ReactNode;
  /** role="alertdialog": klik på overlay lukker ikke (som Radix AlertDialog). */
  alert?: boolean;
  lukVedOverlay?: boolean;
  bred?: boolean;
  children: ReactNode;
  fod?: ReactNode;
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titelId = useId();
  const beskrivelseId = useId();

  useEffect(() => {
    if (!open) return;
    const forrige = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // 1. Fokus ind — første fokuserbare, ellers panelet.
    const foerste = panel ? fokuserbare(panel)[0] : undefined;
    (foerste ?? panel)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // 2. Escape lukker.
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      // 1. Tab cykler inden for panelet.
      const els = fokuserbare(panel);
      if (els.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const f = els[0];
      const l = els[els.length - 1];
      const aktivt = document.activeElement;
      if (e.shiftKey && (aktivt === f || !panel.contains(aktivt))) {
        e.preventDefault();
        l.focus();
      } else if (!e.shiftKey && (aktivt === l || !panel.contains(aktivt))) {
        e.preventDefault();
        f.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // 4. Fokus tilbage til det der åbnede dialogen.
      forrige?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      {/* 3. Overlay-klik lukker (ikke for alertdialog). */}
      <div className="absolute inset-0 bg-hb-ink/40" onClick={lukVedOverlay ? onClose : undefined} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        role={alert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titelId}
        aria-describedby={beskrivelse ? beskrivelseId : undefined}
        className={cn(
          "relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-hb border border-hb-line bg-hb-surface shadow-hb-hover focus:outline-none sm:rounded-hb",
          bred ? "sm:max-w-lg" : "sm:max-w-md",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Luk"
          className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="overflow-y-auto overscroll-contain p-6 sm:p-8">
          <div className="pr-8">
            <h2 id={titelId} className="font-editorial text-2xl font-medium leading-snug text-hb-ink">{titel}</h2>
            {beskrivelse && <p id={beskrivelseId} className="mt-1.5 text-sm text-hb-ink-soft">{beskrivelse}</p>}
          </div>
          <div className="mt-5">{children}</div>
          {fod && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{fod}</div>}
        </div>
      </div>
    </div>
  );
};

/** Popover i DOM-træet: panelet ligger absolut under sin trigger i samme
    wrapper. Lukker ved mousedown udenfor og ved Escape (capture, stoppet så
    dialogen bag ikke lukker); fokus går tilbage til triggeren. */
export const HbPopover = ({
  open, onOpenChange, trigger, children, className,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Triggeren renderes af kalderen; ref sættes her så fokus kan gives tilbage. */
  trigger: (props: { ref: React.RefObject<HTMLButtonElement>; onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "dialog" }) => ReactNode;
  children: ReactNode;
  className?: string;
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) onOpenChangeRef.current(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        onOpenChangeRef.current(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className={cn("relative inline-block", className)}>
      {trigger({ ref: triggerRef, onClick: () => onOpenChange(!open), "aria-expanded": open, "aria-haspopup": "dialog" })}
      {open && (
        <div role="dialog" className="absolute left-0 top-full z-30 mt-2 rounded-hb border border-hb-line bg-hb-surface shadow-hb-hover">
          {children}
        </div>
      )}
    </div>
  );
};

/**
 * Kalenderen i Hb. HVORFOR DET VIRKER: shadcn's Calendar er react-day-picker
 * v8 med et classNames-kort, ikke en portal, og react-day-picker importerer
 * ingen global CSS i dette repo (målt 4/9: `react-day-picker` står kun i
 * package.json; hverken index.css eller main.tsx importerer dens style).
 * Alle appens tokens sidder i Calendars classNames — nav_button og day via
 * buttonVariants (bg-background, hover:bg-accent, ring-ring), head_cell og
 * day_outside via text-muted-foreground, day_selected via bg-primary,
 * day_today via bg-accent, cell via bg-accent — og classNames spredes
 * SIDST (`...classNames`), så hver nøgle kan erstattes helt. Her erstattes
 * netop de ni nøgler der bærer tokens; resten (months, month, caption, nav,
 * table, head_row, row, day_hidden, nav_button_previous/next) er
 * layoutklasser uden farve og står som de er. Ingen appens tokens når
 * frem til DOM'en.
 */
const HB_KALENDER_KLASSER: NonNullable<CalendarProps["classNames"]> = {
  caption_label: "text-sm font-medium text-hb-ink",
  nav_button:
    "inline-flex h-7 w-7 items-center justify-center rounded-full border border-hb-line bg-transparent text-hb-ink-soft transition-colors hover:bg-hb-sage/40 hover:text-hb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60",
  head_cell: "w-9 text-[0.8rem] font-normal text-hb-ink-soft",
  cell: "relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20",
  day: "inline-flex h-9 w-9 items-center justify-center rounded-full p-0 text-sm font-normal text-hb-ink transition-colors hover:bg-hb-sage/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60 aria-selected:opacity-100",
  day_selected: "bg-hb-evergreen text-white hover:bg-hb-evergreen hover:text-white focus:bg-hb-evergreen focus:text-white",
  day_today: "border border-hb-evergreen/60",
  day_outside: "day-outside text-hb-ink-soft/50 aria-selected:text-white",
  day_disabled: "text-hb-ink-soft/40",
  day_range_middle: "",
};

export const HbKalender = (props: CalendarProps) => (
  <Calendar {...props} classNames={{ ...HB_KALENDER_KLASSER, ...(props.classNames ?? {}) }} className={cn("p-3 text-hb-ink", props.className)} />
);
