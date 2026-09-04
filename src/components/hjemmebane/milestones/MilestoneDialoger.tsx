import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { BookOpen, CalendarIcon, Check, Pencil, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MILESTONE_CATEGORIES, CATEGORY_OPTIONS, type MilestoneCategory } from "@/lib/milestoneCategories";
import { MILESTONE_SUGGESTIONS } from "@/lib/milestoneSuggestions";
import { HbButton } from "../HbButton";
import { HbTag } from "../HbTag";
import { HbField, HbInput, HbSelect, HbTextarea, hbControlClasses } from "../admin/HbField";
import { HbDialog, HbPopover, HbKalender } from "./HbOverlejring";
import type { Milestone, NyMilestone } from "./useMilestones";

/**
 * Milestone-dialogerne i Hjemmebane — ETAPE 2 (4/9): opret, detalje/
 * rediger og slet, bygget i skallens eget DOM-træ (HbOverlejring.tsx) med
 * SAMME adfærd som før: samme felter, samme validering (titel kræves,
 * gem-tilstand), samme kald (onOpret, onUpdateField, onUpdateCurrentValue,
 * onQuickProgress, onSlet), samme tekster.
 *
 * HVAD DER BLEV BYGGET OM — de fire Radix-portaler fra etape 1, som lå
 * ordret fra Milestones.tsx (:277-407) og MilestonesList.tsx (:213-231,
 * :264-516) og portalerede til <body> uden for .theme-hjemmebane:
 *   - AlertDialog (slet)            → HbDialog alert (overlay lukker IKKE, som før)
 *   - Dialog (opret, detalje)       → HbDialog
 *   - Popover + Calendar (deadline) → HbPopover + HbKalender (react-day-picker
 *                                     med Hb-klasser; se HbOverlejring.tsx)
 *   - Select (kategori, to steder)  → native <select> (HbSelect) — husets
 *                                     mønster for Hb-formularer (admin/HbField.tsx:
 *                                     «Native controls — bevidst ingen shadcn»)
 * Felterne er HbInput/HbTextarea/HbSelect; knapperne HbButton; kilde-tags
 * HbTag. Kategorifarverne fra milestoneCategories.ts bruges ikke (samme
 * valg som i rækken, HbMilestoneRaekke.tsx).
 *
 * Tilgængeligheden (fokus fanges, Escape, overlay-klik, fokus tilbage) er
 * beskrevet og løst i HbOverlejring.tsx. MilestonesList.tsx og
 * DashboardMilestones.tsx bruger stadig de gamle Radix-dialoger — de er
 * ikke denne etapes.
 */

const Kategoritag = ({ category }: { category: MilestoneCategory }) => {
  const cfg = MILESTONE_CATEGORIES[category] || MILESTONE_CATEGORIES.other;
  const Icon = cfg.icon;
  return (
    <HbTag className="gap-1 px-2 py-0.5 text-[11px]">
      <Icon className="h-3 w-3" />
      {cfg.label}
    </HbTag>
  );
};

const Kildetags = ({ ms }: { ms: Milestone }) => (
  <>
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
  </>
);

/** Datovælger: trigger-knap + HbKalender i en HbPopover. Som før lukker
    valget IKKE popoveren af sig selv (Radix Popover gjorde det heller
    ikke) — den lukker ved klik udenfor eller Escape. */
const Datovaelger = ({
  vaerdi, onVaelg, tomTekst, className, stille = false,
}: {
  vaerdi: Date | undefined;
  onVaelg: (d: Date | undefined) => void;
  tomTekst: string;
  className?: string;
  /** Detaljens lille variant (tekst-knap med blyant), som før. */
  stille?: boolean;
}) => {
  const [aaben, setAaben] = useState(false);
  return (
    <HbPopover
      open={aaben}
      onOpenChange={setAaben}
      className={className}
      trigger={(p) =>
        stille ? (
          <button
            type="button"
            {...p}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-hb-ink-soft transition-colors hover:bg-hb-sage/40 hover:text-hb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60"
          >
            <CalendarIcon className="h-3 w-3" />
            {vaerdi ? format(vaerdi, "d. MMM yyyy", { locale: da }) : tomTekst}
            <Pencil className="ml-1 h-2.5 w-2.5 opacity-50" />
          </button>
        ) : (
          <button
            type="button"
            {...p}
            className={cn(hbControlClasses, "inline-flex items-center justify-start gap-2 text-left", !vaerdi && "text-hb-ink-soft")}
          >
            <CalendarIcon className="h-4 w-4" />
            {vaerdi ? format(vaerdi, "d. MMM yyyy", { locale: da }) : tomTekst}
          </button>
        )
      }
    >
      <HbKalender mode="single" selected={vaerdi} onSelect={(d) => onVaelg(d ?? undefined)} initialFocus />
    </HbPopover>
  );
};

// ── Slet — før: AlertDialog (MilestonesList.tsx:213-231) ────────────────

export const SletMilestoneDialog = ({
  ms, open, onOpenChange, onSlet,
}: { ms: Milestone | null; open: boolean; onOpenChange: (v: boolean) => void; onSlet: () => void }) => (
  <HbDialog
    open={open}
    onClose={() => onOpenChange(false)}
    alert
    titel="Slet milestone?"
    beskrivelse={<>Er du sikker på, at du vil slette {ms ? `«${ms.title}»` : "denne milestone"}? Denne handling kan ikke fortrydes.</>}
    fod={
      <>
        <HbButton variant="secondary" onClick={() => onOpenChange(false)}>Annuller</HbButton>
        <HbButton onClick={onSlet} className="bg-hb-rust hover:bg-hb-rust/90">Slet</HbButton>
      </>
    }
  >
    {null}
  </HbDialog>
);

// ── Opret — før: Dialog + Select + Popover (Milestones.tsx:277-407) ──────

const tomNy = (): NyMilestone => ({
  title: "", description: "", baseline: "", category: "other", deadline: undefined, targetValue: "", unit: "",
});

export const OpretMilestoneDialog = ({
  open, onOpenChange, forudfyldt, onOpret,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Startforslag fra den tomme tilstand (Milestones.tsx:85-94). */
  forudfyldt: Partial<NyMilestone> | null;
  onOpret: (ny: NyMilestone) => Promise<boolean>;
}) => {
  const [ny, setNy] = useState<NyMilestone>(tomNy);
  const [saving, setSaving] = useState(false);
  const saet = <K extends keyof NyMilestone>(k: K, v: NyMilestone[K]) => setNy((n) => ({ ...n, [k]: v }));

  useEffect(() => {
    if (open) setNy({ ...tomNy(), ...(forudfyldt ?? {}) });
  }, [open, forudfyldt]);

  const luk = () => onOpenChange(false);
  const handleCreate = async () => {
    setSaving(true);
    const ok = await onOpret(ny);
    setSaving(false);
    if (ok) luk();
  };

  return (
    <HbDialog
      open={open}
      onClose={luk}
      titel="Opret ny milestone"
      beskrivelse="Definer dit mål og vælg en kategori."
      fod={
        <>
          <HbButton variant="secondary" onClick={luk}>Annuller</HbButton>
          <HbButton onClick={handleCreate} disabled={!ny.title.trim() || saving}>
            {saving ? "Opretter..." : "Opret"}
          </HbButton>
        </>
      }
    >
      <div className="space-y-4">
        <HbField label="Titel *" htmlFor="ms-titel">
          <HbInput id="ms-titel" value={ny.title} onChange={(e) => saet("title", e.target.value)} placeholder="F.eks. Nå 1M i omsætning" />
        </HbField>
        <HbField label="Beskrivelse" htmlFor="ms-beskrivelse">
          <HbTextarea id="ms-beskrivelse" value={ny.description} onChange={(e) => saet("description", e.target.value)} placeholder="Uddyb dit mål..." rows={3} className="resize-none" />
        </HbField>
        <HbField label="Kategori" htmlFor="ms-kategori">
          <HbSelect id="ms-kategori" value={ny.category} onChange={(e) => saet("category", e.target.value as MilestoneCategory)}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </HbSelect>
        </HbField>
        {/* Forslag – kun når titlen er tom (som før) */}
        {!ny.title.trim() && MILESTONE_SUGGESTIONS[ny.category]?.length > 0 && (
          <div>
            <p className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Forslag</p>
            <div className="flex flex-wrap gap-1.5">
              {MILESTONE_SUGGESTIONS[ny.category].map((s) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => { saet("title", s.title); saet("description", s.description); if (s.baselineHint) saet("baseline", ""); }}
                  className="rounded-full bg-hb-sage/60 px-2.5 py-1 text-left text-xs font-medium text-hb-ink transition-colors hover:bg-hb-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60"
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>
        )}
        <HbField label="Nuværende status / baseline" htmlFor="ms-baseline">
          <HbInput
            id="ms-baseline"
            value={ny.baseline}
            onChange={(e) => saet("baseline", e.target.value)}
            placeholder={MILESTONE_SUGGESTIONS[ny.category]?.find((s) => s.title === ny.title)?.baselineHint || "F.eks. 800.000 kr. i omsætning"}
          />
        </HbField>
        {/* Målbar milestone — valgfrit */}
        <div className="space-y-3 rounded-hb border border-hb-line p-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
              Gør den målbar <span className="normal-case tracking-normal text-hb-ink-soft/60">(valgfri)</span>
            </p>
            <p className="mt-1 text-[11px] text-hb-ink-soft">
              F.eks. &quot;10 salgskald&quot; eller &quot;500.000 kr.&quot; i stedet for en procent-slider.
            </p>
          </div>
          <div className="flex gap-2">
            <HbField label="Mål" htmlFor="ms-maal" className="flex-1">
              <HbInput id="ms-maal" type="number" min={0} value={ny.targetValue} onChange={(e) => saet("targetValue", e.target.value)} placeholder="10" />
            </HbField>
            <HbField label="Enhed" htmlFor="ms-enhed" className="flex-1">
              <HbInput id="ms-enhed" type="text" value={ny.unit} onChange={(e) => saet("unit", e.target.value)} placeholder="salgskald, timer, kr., kunder..." />
            </HbField>
          </div>
          {ny.targetValue && ny.unit && (
            <p className="text-[11px] text-hb-evergreen">
              Milestone viser: 0 / {ny.targetValue} {ny.unit}
            </p>
          )}
        </div>
        <HbField label="Deadline">
          <Datovaelger vaerdi={ny.deadline} onVaelg={(d) => saet("deadline", d)} tomTekst="Vælg deadline" className="block w-full" />
        </HbField>
      </div>
    </HbDialog>
  );
};

// ── Detalje/rediger — før: Dialog + Select + Popover (MilestonesList.tsx:264-516) ──

export const MilestoneDetaljeDialog = ({
  ms, open, onOpenChange, onQuickProgress, onUpdateField, onUpdateCurrentValue,
}: {
  ms: Milestone | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onQuickProgress: (id: string, p: number) => void;
  onUpdateField: (id: string, fields: Record<string, unknown>) => Promise<void>;
  onUpdateCurrentValue: (id: string, newValue: number) => Promise<void>;
}) => {
  const [editingDescription, setEditingDescription] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<MilestoneCategory>("other");
  const [descDraft, setDescDraft] = useState("");
  const [detailDeadline, setDetailDeadline] = useState<Date | undefined>(undefined);
  const [savingField, setSavingField] = useState(false);

  // Sync local state when ms changes from outside (MilestonesList.tsx:149-152).
  useEffect(() => { setTitleDraft(ms?.title ?? ""); }, [ms?.title]);
  useEffect(() => { setCategoryDraft(ms?.category ?? "other"); }, [ms?.category]);
  useEffect(() => { setDescDraft(ms?.description || ""); }, [ms?.description]);
  useEffect(() => { setDetailDeadline(ms?.deadline || undefined); }, [ms?.deadline]);
  useEffect(() => { if (!open) { setEditingTitle(false); setEditingDescription(false); } }, [open]);

  if (!ms) return null;
  const luk = () => onOpenChange(false);
  const fremdriftFarve = ms.status === "done" ? "text-hb-evergreen" : "text-hb-ink";

  const titel = editingTitle ? (
    <div className="space-y-2">
      <HbInput
        value={titleDraft}
        onChange={(e) => setTitleDraft(e.target.value)}
        className="font-editorial text-xl font-medium"
        autoFocus
        aria-label="Titel"
      />
      <div className="flex gap-2">
        <HbButton
          onClick={async () => {
            if (!titleDraft.trim()) return;
            setSavingField(true);
            await onUpdateField(ms.id, { title: titleDraft.trim() });
            setEditingTitle(false);
            setSavingField(false);
          }}
          disabled={savingField}
          className="h-9 gap-1.5 px-4 text-xs"
        >
          <Check className="h-3 w-3" /> {savingField ? "Gemmer..." : "Gem"}
        </HbButton>
        <HbButton variant="secondary" onClick={() => { setTitleDraft(ms.title); setEditingTitle(false); }} className="h-9 px-4 text-xs">
          Annuller
        </HbButton>
      </div>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => { setTitleDraft(ms.title); setEditingTitle(true); }}
      className="group inline-flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60"
      title="Rediger titel"
    >
      <span>{ms.title}</span>
      <Pencil className="h-3 w-3 shrink-0 text-hb-ink-soft opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  );

  return (
    <HbDialog open={open} onClose={luk} titel={titel} bred>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Redigerbar kategori — før en Radix Select forklædt som badge; nu et
              native select ved siden af tagget, samme kald (gem ved valg). */}
          <Kategoritag category={categoryDraft} />
          <HbSelect
            aria-label="Kategori"
            value={categoryDraft}
            onChange={async (e) => {
              const val = e.target.value as MilestoneCategory;
              setCategoryDraft(val);
              setSavingField(true);
              await onUpdateField(ms.id, { category: val });
              setSavingField(false);
            }}
            className="w-auto py-1 text-xs"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </HbSelect>
          <Kildetags ms={ms} />
          {/* Redigerbar deadline — gemmer ved valg, som før. */}
          <Datovaelger
            stille
            vaerdi={detailDeadline}
            tomTekst="Sæt deadline"
            onVaelg={async (d) => {
              setDetailDeadline(d || undefined);
              setSavingField(true);
              await onUpdateField(ms.id, { deadline: d || null });
              setSavingField(false);
            }}
          />
        </div>
        <div>
          {ms.target_value && ms.unit ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-hb-ink-soft">Fremgang</span>
                <span className={cn("text-sm font-medium", fremdriftFarve)}>
                  {ms.current_value ?? 0} / {ms.target_value} {ms.unit}
                </span>
              </div>
              <div className="mb-3 h-[3px] w-full overflow-hidden rounded-full bg-hb-line">
                <div className={ms.progress >= 100 ? "h-full rounded-full bg-hb-evergreen" : "h-full rounded-full bg-hb-evergreen/70"} style={{ width: `${ms.progress}%` }} />
              </div>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs text-hb-ink-soft">Nuværende:</span>
                <HbInput
                  type="number"
                  min={0}
                  max={ms.target_value * 2}
                  step={ms.target_value >= 100 ? 10 : 1}
                  defaultValue={ms.current_value ?? 0}
                  aria-label="Nuværende værdi"
                  onBlur={async (e) => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val !== ms.current_value) await onUpdateCurrentValue(ms.id, val);
                  }}
                  className="w-24 py-1 text-sm"
                />
                <span className="text-xs text-hb-ink-soft">{ms.unit}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="shrink-0 text-xs text-hb-ink-soft">Mål:</span>
                <HbInput
                  type="number"
                  min={1}
                  defaultValue={ms.target_value ?? 0}
                  aria-label="Mål"
                  onBlur={async (e) => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val > 0 && val !== ms.target_value) await onUpdateField(ms.id, { target_value: val });
                  }}
                  className="w-24 py-1 text-sm"
                />
                <HbInput
                  type="text"
                  defaultValue={ms.unit ?? ""}
                  placeholder="enhed"
                  aria-label="Enhed"
                  onBlur={async (e) => {
                    const val = e.target.value.trim();
                    if (val !== ms.unit) await onUpdateField(ms.id, { unit: val });
                  }}
                  className="w-24 py-1 text-sm"
                />
              </div>
            </>
          ) : (
            <>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-hb-ink-soft">Fremgang</span>
                <span className={cn("text-sm font-medium", fremdriftFarve)}>{ms.progress}%</span>
              </div>
              <input
                type="range" min={0} max={100}
                value={ms.progress}
                onChange={(e) => onQuickProgress(ms.id, Number(e.target.value))}
                aria-label="Fremgang"
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-hb-line accent-hb-evergreen"
              />
              <div className="mt-1 flex justify-between text-[10px] text-hb-ink-soft">
                <span>Ikke startet</span><span>I gang</span><span>Færdig</span>
              </div>
            </>
          )}
        </div>
        <div className="rounded-hb bg-hb-paper p-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Udgangspunkt / baseline</p>
          <input
            defaultValue={ms.baseline || ""}
            placeholder="F.eks. 800.000 kr. i omsætning"
            aria-label="Udgangspunkt / baseline"
            onBlur={async (e) => {
              const val = e.target.value.trim();
              if (val !== (ms.baseline || "")) await onUpdateField(ms.id, { baseline: val });
            }}
            className="w-full border-b border-transparent bg-transparent py-0.5 text-sm text-hb-ink transition-colors placeholder:text-hb-ink-soft/50 hover:border-hb-line focus:border-hb-evergreen focus:outline-none"
          />
        </div>
        {/* Redigerbar beskrivelse */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Beskrivelse</p>
            {!editingDescription && (
              <button
                type="button"
                onClick={() => { setDescDraft(ms.description || ""); setEditingDescription(true); }}
                className="inline-flex items-center gap-1 text-[11px] text-hb-ink-soft transition-colors hover:text-hb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60"
              >
                <Pencil className="h-2.5 w-2.5" /> Rediger
              </button>
            )}
          </div>
          {editingDescription ? (
            <div className="space-y-2">
              <HbTextarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                rows={5}
                placeholder="Tilføj beskrivelse..."
                aria-label="Beskrivelse"
                autoFocus
              />
              <div className="flex gap-2">
                <HbButton
                  onClick={async () => {
                    setSavingField(true);
                    await onUpdateField(ms.id, { description: descDraft.trim() });
                    setEditingDescription(false);
                    setSavingField(false);
                  }}
                  disabled={savingField}
                  className="h-9 gap-1.5 px-4 text-xs"
                >
                  <Check className="h-3 w-3" /> {savingField ? "Gemmer..." : "Gem"}
                </HbButton>
                <HbButton variant="secondary" onClick={() => setEditingDescription(false)} className="h-9 px-4 text-xs">
                  Annuller
                </HbButton>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-hb-ink">
              {ms.description || <span className="italic text-hb-ink-soft">Ingen beskrivelse endnu</span>}
            </p>
          )}
        </div>
      </div>
    </HbDialog>
  );
};
