import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { confirmBudgetFromAccounts, confirmBudgetImport } from "@/lib/budgetEngine";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbField, HbInput } from "../admin/HbField";
import { QuietNote, fmtNumber } from "./hbBudgetShared";

/** Import-sektionens to spor (design-blok §c6) i HbReportUploadZone-sproget:
    rolige zoner, statuslinjer i stedet for spinner-teater, stille
    kvitteringer. Parse-orkestreringen (XLSX-klientlæsning / pdfjs +
    edge-funktionerne import-budget-excel og generate-budget-from-accounts)
    spejler BudgetImport.tsx/BudgetFromAccounts.tsx — SKRIVEVEJENE bor
    alene i budgetEngine (W5/W6 m. U1+U2). */

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

const dropZoneClasses = (active: boolean) =>
  cn(
    "flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-hb border border-dashed px-6 py-8 text-center transition-colors",
    active ? "border-hb-evergreen bg-hb-sage/30" : "border-hb-line bg-hb-surface hover:border-hb-evergreen/50",
  );

const pickFile = (accept: string, onFile: (f: File) => void) => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) onFile(file);
  };
  input.click();
};

// ── Kladde-persistens (hb-budget-persistens-recon §4 ii): et indlæst
// forslag skal overleve reload/remount indtil godkend/annullér.
// sessionStorage er per-fane; nøglen er COMPANY-SCOPED — advisor-override
// må aldrig vise en anden virksomheds kladde. 24 t alders-loft. try/catch
// som repoets øvrige storage-brug: storage-fejl må aldrig vælte importen.
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function readDraft<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > DRAFT_MAX_AGE_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

function writeDraft(key: string, value: Record<string, unknown>) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ...value, savedAt: Date.now() }));
  } catch {
    /* fuld/utilgængelig storage — kladden er best-effort */
  }
}

function clearDraft(key: string | null) {
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignorér */
  }
}

// ───────────────────────── Excel-import (W5) ─────────────────────────

interface ImportedCategory {
  key: string;
  label: string;
  monthly: number[];
  details: string[];
}

interface YearData {
  year: string;
  categories: ImportedCategory[];
}

interface MultiYearResult {
  company_name: string;
  years: YearData[];
}

export const HbBudgetExcelImport = ({
  userId,
  companyId,
  onImported,
}: {
  userId: string | undefined;
  companyId: string | undefined;
  onImported: (result: { year: string }) => void;
}) => {
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [multiYear, setMultiYear] = useState<MultiYearResult | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [errorNote, setErrorNote] = useState<string | null>(null);
  const workbookRef = useRef<any>(null);
  const pendingFileRef = useRef<File | null>(null);

  // Kladde (recon §4 ii): det PARSEDE resultat persisteres — fil/workbook
  // kan ikke (File-objekter overlever ikke JSON), og det er resultatet
  // der mistes ved remount.
  const draftKey = companyId ? `hb-budget-excel-draft:${companyId}` : null;

  useEffect(() => {
    if (!draftKey || multiYear) return;
    const draft = readDraft<{ multiYear: MultiYearResult; selectedYear: string | null }>(draftKey);
    if (draft?.multiYear) {
      setMultiYear(draft.multiYear);
      setSelectedYear(draft.selectedYear);
      setStatusNote("Dit indlæste ark er gendannet — gennemse og godkend nedenfor");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || !multiYear) return;
    writeDraft(draftKey, { multiYear, selectedYear });
  }, [draftKey, multiYear, selectedYear]);

  const preview =
    multiYear && selectedYear
      ? multiYear.years.find((y) => y.year === selectedYear) ?? null
      : null;

  const buildSheetsText = async (workbook: any, names: string[]): Promise<string> => {
    const XLSX = await import("xlsx");
    return names
      .map((name) => {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name], { FS: "\t", RS: "\n" });
        return `=== Ark: ${name} ===\n${csv}`;
      })
      .join("\n\n");
  };

  const runImport = useCallback(async (sheets?: string[]) => {
    const file = pendingFileRef.current;
    if (!file) return;

    setParsing(true);
    setMultiYear(null);
    setSelectedYear(null);
    setErrorNote(null);
    setStatusNote("Vi læser dit budgetark — det tager typisk 10-30 sekunder…");

    try {
      let fileContent: string;
      if (workbookRef.current) {
        const names = sheets ?? workbookRef.current.SheetNames;
        fileContent = await buildSheetsText(workbookRef.current, names);
      } else {
        fileContent = await file.text(); // CSV
      }

      const { data, error } = await supabase.functions.invoke("import-budget-excel", {
        body: { fileContent, fileName: file.name },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const result: MultiYearResult = data.years
        ? { company_name: data.company_name, years: data.years }
        : { company_name: data.company_name, years: [{ year: data.year, categories: data.categories }] };

      setMultiYear(result);
      if (result.years.length === 1) {
        setSelectedYear(result.years[0].year);
        setStatusNote("Arket er læst — gennemse og godkend nedenfor");
      } else {
        setStatusNote(`Arket indeholder ${result.years.length} budgetår — vælg hvilket der skal ind`);
      }
    } catch (err: any) {
      console.error("Budget import error:", err);
      setStatusNote(null);
      setErrorNote(err?.message || "Vi kunne ikke læse filen — prøv en anden");
    } finally {
      setParsing(false);
    }
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        setErrorNote("Upload et Excel-ark (.xlsx, .xls) eller CSV");
        return;
      }

      pendingFileRef.current = file;
      setErrorNote(null);

      if (file.name.endsWith(".csv")) {
        workbookRef.current = null;
        setSheetNames([]);
        void runImport();
        return;
      }

      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      workbookRef.current = wb;
      setSheetNames(wb.SheetNames);

      if (wb.SheetNames.length === 1) {
        void runImport(wb.SheetNames);
        return;
      }

      // Flere ark: forudvælg budget-arket (arvet /budget/i-gæt) og vis vælgeren
      const guess = wb.SheetNames.find((n: string) => /budget/i.test(n)) ?? wb.SheetNames[0];
      setSelectedSheets([guess]);
      setStatusNote("Vælg det ark, der indeholder budgettet");
    },
    [runImport],
  );

  const handleConfirm = async () => {
    if (!preview || !userId || !companyId) return;
    setSaving(true);
    setErrorNote(null);
    try {
      await confirmBudgetImport({
        userId,
        companyId,
        preview: { year: preview.year, categories: preview.categories },
      });
      clearDraft(draftKey);
      setStatusNote(`Budget ${preview.year} er importeret`);
      onImported({ year: preview.year });
    } catch (err: any) {
      console.error("Save error:", err);
      const msg = err?.message || err?.details || err?.hint || "";
      setErrorNote(msg ? `Kunne ikke gemme budgettet: ${msg}` : "Kunne ikke gemme budgettet");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    clearDraft(draftKey);
    setMultiYear(null);
    setSelectedYear(null);
    setSheetNames([]);
    setSelectedSheets([]);
    workbookRef.current = null;
    pendingFileRef.current = null;
    setStatusNote(null);
    setErrorNote(null);
  };

  // Ark-vælger (flere ark, før modellen kaldes)
  if (sheetNames.length > 1 && !multiYear && !parsing) {
    const toggleSheet = (name: string) =>
      setSelectedSheets((prev) =>
        prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
      );
    return (
      <div>
        <p className="text-sm text-hb-ink-soft">
          Vælg det ark, der indeholder din budget-oversigt — gerne flere, hvis budgettet er fordelt.
        </p>
        <div className="mt-3 space-y-2">
          {sheetNames.map((name) => {
            const checked = selectedSheets.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleSheet(name)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                  checked
                    ? "border-hb-evergreen bg-hb-sage/30 text-hb-ink"
                    : "border-hb-line text-hb-ink hover:border-hb-evergreen/50",
                )}
              >
                <span
                  className={cn(
                    "h-3 w-3 shrink-0 rounded-full border",
                    checked ? "border-hb-evergreen bg-hb-evergreen" : "border-hb-line",
                  )}
                />
                {name}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-4">
          <HbButton
            className="h-9 px-5 text-sm"
            disabled={selectedSheets.length === 0}
            onClick={() => void runImport(selectedSheets)}
          >
            Fortsæt
          </HbButton>
          <button type="button" onClick={reset} className="text-sm text-hb-ink-soft underline-offset-4 hover:underline">
            Vælg en anden fil
          </button>
        </div>
      </div>
    );
  }

  // År-vælger (flere budgetår i samme fil)
  if (multiYear && multiYear.years.length > 1 && !selectedYear) {
    return (
      <div>
        <p className="text-sm text-hb-ink-soft">
          Filen indeholder {multiYear.years.length} budgetår — vælg det år, du vil importere.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {multiYear.years.map((y) => {
            const totalRev = y.categories
              .filter((c) => c.key === "omsaetning")
              .reduce((s, c) => s + c.monthly.reduce((a, b) => a + b, 0), 0);
            const totalCost = y.categories
              .filter((c) => c.key !== "omsaetning")
              .reduce((s, c) => s + c.monthly.reduce((a, b) => a + b, 0), 0);
            return (
              <button
                key={y.year}
                type="button"
                onClick={() => setSelectedYear(y.year)}
                className="rounded-hb border border-hb-line bg-hb-surface p-4 text-left transition-colors hover:border-hb-evergreen/50"
              >
                <p className="font-editorial text-lg font-medium text-hb-ink">{y.year}</p>
                <p className="mt-1 text-xs text-hb-ink-soft">Omsætning {fmtNumber(totalRev)} kr.</p>
                <p className="text-xs text-hb-ink-soft">Omkostninger {fmtNumber(totalCost)} kr.</p>
                <p className="text-xs text-hb-ink-soft">{y.categories.length} kategorier</p>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={reset} className="mt-4 text-sm text-hb-ink-soft underline-offset-4 hover:underline">
          Vælg en anden fil
        </button>
      </div>
    );
  }

  // Preview + godkend
  if (preview) {
    const totalRevenue = preview.categories
      .filter((c) => c.key === "omsaetning")
      .reduce((sum, c) => sum + c.monthly.reduce((s, v) => s + v, 0), 0);
    const totalCosts = preview.categories
      .filter((c) => c.key !== "omsaetning")
      .reduce((sum, c) => sum + c.monthly.reduce((s, v) => s + v, 0), 0);
    const result = totalRevenue - totalCosts;

    return (
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-editorial text-lg font-medium text-hb-ink">Budget {preview.year} — gennemse</p>
          {multiYear?.company_name && <p className="text-xs text-hb-ink-soft">{multiYear.company_name}</p>}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Omsætning</p>
            <p className="mt-1 font-editorial text-lg font-medium text-hb-ink">{fmtNumber(totalRevenue)} kr.</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Omkostninger</p>
            <p className="mt-1 font-editorial text-lg font-medium text-hb-ink">{fmtNumber(totalCosts)} kr.</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Resultat</p>
            <p className={cn("mt-1 font-editorial text-lg font-medium", result < 0 ? "text-hb-rust" : "text-hb-ink")}>
              {fmtNumber(result)} kr.
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {preview.categories.map((cat) => {
            const yearTotal = cat.monthly.reduce((s, v) => s + v, 0);
            return (
              <div key={cat.key} className="rounded-lg border border-hb-line/70 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-hb-ink">
                    {cat.label}
                    {cat.details.length > 0 && (
                      <span className="ml-2 text-xs font-normal text-hb-ink-soft">
                        ({cat.details.length} poster: {cat.details.slice(0, 3).join(", ")}
                        {cat.details.length > 3 ? ` +${cat.details.length - 3}` : ""})
                      </span>
                    )}
                  </p>
                  <p className="text-sm tabular-nums text-hb-ink">{fmtNumber(yearTotal)} kr.</p>
                </div>
                {/* Feltbredde (recon 1 §4): 12 kolonner klemte sekscifrede
                    beløb — nu 4/6 kolonner over flere rækker + større tekst. */}
                <div className="mt-2 grid grid-cols-4 gap-x-2 gap-y-1.5 sm:grid-cols-6">
                  {cat.monthly.map((val, i) => (
                    <div key={i} className="text-center">
                      <p className="text-[10px] text-hb-ink-soft">{MONTH_LABELS[i]}</p>
                      <p className="text-[11px] tabular-nums text-hb-ink">{fmtNumber(val)}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <HbButton className="h-9 px-5 text-sm" disabled={saving} onClick={() => void handleConfirm()}>
            {saving ? "Gemmer…" : "Importér budget"}
          </HbButton>
          {multiYear && multiYear.years.length > 1 && (
            <HbButton variant="secondary" className="h-9 px-5 text-sm" onClick={() => setSelectedYear(null)}>
              Skift år
            </HbButton>
          )}
          <button type="button" onClick={reset} className="text-sm text-hb-ink-soft underline-offset-4 hover:underline">
            Annullér
          </button>
          <QuietNote note={statusNote} error={errorNote} />
        </div>
      </div>
    );
  }

  // Dropzonen
  return (
    <div>
      <div
        className={dropZoneClasses(dragOver)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        onClick={() => pickFile(".xlsx,.xls,.csv", (f) => void handleFile(f))}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") pickFile(".xlsx,.xls,.csv", (f) => void handleFile(f));
        }}
      >
        <p className="text-sm font-medium text-hb-ink">
          {parsing ? "Vi læser dit budgetark…" : "Importér budget fra Excel"}
        </p>
        <p className="mt-1 max-w-sm text-xs text-hb-ink-soft">
          {parsing
            ? "Det tager typisk 10-30 sekunder"
            : "Træk filen hertil eller klik for at vælge — vi læser hver linje og foreslår kategorierne"}
        </p>
        {!parsing && (
          <p className="mt-2 text-[11px] text-hb-ink-soft">.xlsx, .xls og .csv · flere budgetår understøttes</p>
        )}
      </div>
      <div className="mt-2">
        <QuietNote note={statusNote} error={errorNote} />
      </div>
    </div>
  );
};

// ─────────────────── Generér fra regnskab (W6, U1+U2) ───────────────────

interface AccountsCategory {
  key: string;
  label: string;
  group: string;
  annual_amount: number;
  monthly: number[];
  source_lines: string[];
}

interface AccountsResult {
  source_year: string;
  company_name?: string;
  categories: AccountsCategory[];
}

const GROWTH_PRESETS = [0, 5, 10, 15, 20];

type RevenueMode = "growth" | "absolute";

// Jævn, krone-præcis fordeling af et årsmål (recon 1 §5): basen er
// floor(target/12); resten (target − 12·base) lægges på de første R
// måneder, så summen rammer målet PRÆCIST.
const evenMonthly = (target: number): number[] => {
  const base = Math.floor(target / 12);
  const rest = target - base * 12;
  return Array.from({ length: 12 }, (_, i) => base + (i < rest ? 1 : 0));
};

export const HbBudgetFromAccounts = ({
  userId,
  companyId,
  onImported,
}: {
  userId: string | undefined;
  companyId: string | undefined;
  onImported: (result: { year: string }) => void;
}) => {
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<AccountsResult | null>(null);
  const [growthPercent, setGrowthPercent] = useState(0);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  // Absolut årsmål for omsætning (recon 1 §5): år 1-regnskaber
  // (stiftelsesperiode, bruttotab) har intet repræsentativt at
  // vækst-skalere — medlemmet sætter i stedet ÉT måltal.
  const [revenueMode, setRevenueMode] = useState<RevenueMode>("growth");
  const [revenueAnnualTarget, setRevenueAnnualTarget] = useState<number | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [errorNote, setErrorNote] = useState<string | null>(null);

  // Kladde (recon 2 §4 ii) — company-scoped, gendannes ved mount,
  // ryddes ved godkend/annullér.
  const draftKey = companyId ? `hb-budget-accounts-draft:${companyId}` : null;

  useEffect(() => {
    if (!draftKey || result) return;
    const draft = readDraft<{
      result: AccountsResult;
      growthPercent: number;
      overrides: Record<string, number>;
      revenueMode?: RevenueMode;
      revenueAnnualTarget?: number | null;
    }>(draftKey);
    if (draft?.result) {
      setResult(draft.result);
      setGrowthPercent(draft.growthPercent ?? 0);
      setOverrides(draft.overrides ?? {});
      setRevenueMode(draft.revenueMode ?? "growth");
      setRevenueAnnualTarget(draft.revenueAnnualTarget ?? null);
      setStatusNote("Dit budgetforslag er gendannet — gennemse og godkend nedenfor");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || !result) return;
    writeDraft(draftKey, { result, growthPercent, overrides, revenueMode, revenueAnnualTarget });
  }, [draftKey, result, growthPercent, overrides, revenueMode, revenueAnnualTarget]);

  const extractTextFromPDF = useCallback(async (file: File): Promise<string> => {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item: any) => item.str).join(" "));
    }
    return pages.join("\n\n");
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      const isPdf = file.name.match(/\.pdf$/i);
      const isExcel = file.name.match(/\.(xlsx|xls|csv)$/i);
      if (!isPdf && !isExcel) {
        setErrorNote("Upload en PDF eller Excel-fil med din resultatopgørelse");
        return;
      }

      setParsing(true);
      setResult(null);
      setErrorNote(null);
      setStatusNote("Vi læser dit regnskab og foreslår et budget…");

      try {
        let fileContent: string;
        if (isPdf) {
          fileContent = await extractTextFromPDF(file);
          if (!fileContent || fileContent.trim().length < 50) {
            setStatusNote(null);
            setErrorNote("Vi kunne ikke læse tekst fra PDF'en — prøv en anden fil");
            setParsing(false);
            return;
          }
        } else {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          fileContent = `[Excel fil - base64 encoded]\n${btoa(binary)}`;
        }

        const { data, error } = await supabase.functions.invoke("generate-budget-from-accounts", {
          body: { fileContent },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        setResult(data as AccountsResult);
        setGrowthPercent(0);
        setOverrides({});
        setRevenueMode("growth");
        setRevenueAnnualTarget(null);
        setStatusNote("Regnskabet er læst — vælg vækst og godkend forslaget");
      } catch (err: any) {
        console.error("Budget from accounts error:", err);
        setStatusNote(null);
        setErrorNote(err?.message || "Vi kunne ikke læse regnskabet — prøv en anden fil");
      } finally {
        setParsing(false);
      }
    },
    [extractTextFromPDF],
  );

  // ── Absolut årsmål (recon 1 §5) — beregnes rent i komponenten ──
  const absoluteActive = revenueMode === "absolute" && revenueAnnualTarget != null && revenueAnnualTarget > 0;
  const revenueCats = result ? result.categories.filter((c) => c.group === "indtaegter") : [];

  // Målet pr. omsætningskategori: proportionalt efter annual_amount
  // (sidste kategori får resten, så summen rammer målet præcist).
  // INGEN indtaegter-kategori (år 1-casen): en SYNTETISK "omsaetning"-
  // kategori appendes til preview + confirm — motoren tager keys verbatim,
  // og "omsaetning" er netop nøglen BvA/rapport-mapningen kender.
  const revenueTargetByKey: Record<string, number> = {};
  let syntheticRevenue: AccountsCategory | null = null;
  if (result && absoluteActive) {
    const target = Math.round(revenueAnnualTarget!);
    if (revenueCats.length === 0) {
      syntheticRevenue = {
        key: "omsaetning",
        label: "Omsætning",
        group: "indtaegter",
        annual_amount: target,
        monthly: evenMonthly(target),
        source_lines: [],
      };
    } else {
      const totalAnnual = revenueCats.reduce((s, c) => s + Math.max(0, c.annual_amount), 0);
      let allocated = 0;
      revenueCats.forEach((c, idx) => {
        const isLast = idx === revenueCats.length - 1;
        const share = totalAnnual > 0 ? Math.max(0, c.annual_amount) / totalAnnual : 1 / revenueCats.length;
        const amt = isLast ? target - allocated : Math.floor(target * share);
        revenueTargetByKey[c.key] = amt;
        allocated += amt;
      });
    }
  }

  const displayCategories: AccountsCategory[] = result
    ? syntheticRevenue
      ? [syntheticRevenue, ...result.categories]
      : result.categories
    : [];

  // Væksten anvendes som i BudgetFromAccounts.tsx:145-158: omkostninger
  // vokser med halv procent; celle-overrides ligger oven på. Ved absolut
  // årsmål erstattes OMSÆTNINGENS grundlag af den jævne fordeling af
  // målet — omkostningerne følger fortsat vækst-%'en (halv-vækst-reglen).
  const getFinalMonthly = (cat: AccountsCategory): number[] => {
    const isRevenue = cat.group === "indtaegter";
    const factor = 1 + growthPercent / 100;
    const costFactor = 1 + (growthPercent / 100) * 0.5;
    const base =
      isRevenue && absoluteActive
        ? cat.key in revenueTargetByKey
          ? evenMonthly(revenueTargetByKey[cat.key])
          : cat.monthly // syntetisk kategori: monthly ER allerede fordelingen
        : cat.monthly.map((v) => Math.round(v * (isRevenue ? factor : costFactor)));
    return base.map((v, i) => {
      const key = `${cat.key}-${i}`;
      return key in overrides ? overrides[key] : v;
    });
  };

  const handleConfirm = async () => {
    if (!result || !userId || !companyId) return;
    setSaving(true);
    setErrorNote(null);
    try {
      const { targetYear } = await confirmBudgetFromAccounts({
        userId,
        companyId,
        sourceYear: result.source_year,
        // displayCategories: inkl. evt. syntetisk omsætningsrække (år 1-casen)
        categories: displayCategories.map((cat) => ({ key: cat.key, monthly: getFinalMonthly(cat) })),
      });
      clearDraft(draftKey);
      setStatusNote(
        absoluteActive
          ? `Budget ${targetYear} er oprettet med årsmål ${fmtNumber(Math.round(revenueAnnualTarget!))} kr. i omsætning`
          : `Budget ${targetYear} er oprettet med ${growthPercent} % vækst`,
      );
      onImported({ year: targetYear });
    } catch (err: any) {
      console.error("Save error:", err);
      setErrorNote("Kunne ikke gemme budgettet");
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    const targetYear = Number(result.source_year) + 1;
    const totalRev = displayCategories
      .filter((c) => c.group === "indtaegter")
      .reduce((s, c) => s + getFinalMonthly(c).reduce((a, b) => a + b, 0), 0);
    const totalCost = displayCategories
      .filter((c) => c.group !== "indtaegter")
      .reduce((s, c) => s + getFinalMonthly(c).reduce((a, b) => a + b, 0), 0);

    return (
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-editorial text-lg font-medium text-hb-ink">
            Budgetforslag {targetYear} — ud fra regnskabet {result.source_year}
          </p>
          {result.company_name && <p className="text-xs text-hb-ink-soft">{result.company_name}</p>}
        </div>

        <div className="mt-4 space-y-4">
          {/* Mode-skifte (recon 1 §5): vækst-% ELLER absolut årsmål for omsætningen */}
          <HbField
            label="Omsætning"
            help={
              revenueMode === "absolute"
                ? "Årsmålet fordeles jævnt over 12 måneder — du kan redigere hver måned nedenfor."
                : "Vækst i % skalerer omsætningen fra regnskabet."
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              {([
                { mode: "growth" as const, label: "Vækst i %" },
                { mode: "absolute" as const, label: "Årsmål for omsætning" },
              ]).map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setRevenueMode(mode)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm transition-colors",
                    revenueMode === mode
                      ? "border-hb-evergreen bg-hb-evergreen text-white"
                      : "border-hb-line text-hb-ink-soft hover:border-hb-evergreen/50 hover:text-hb-ink",
                  )}
                >
                  {label}
                </button>
              ))}
              {revenueMode === "absolute" && (
                <span className="flex items-center gap-2">
                  <HbInput
                    type="number"
                    min={0}
                    value={revenueAnnualTarget ?? ""}
                    onChange={(e) => {
                      const num = Math.round(Number(e.target.value));
                      setRevenueAnnualTarget(isNaN(num) || e.target.value === "" ? null : num);
                    }}
                    placeholder="fx 1200000"
                    aria-label={`Forventet omsætning ${targetYear}, kr.`}
                    className="w-44 text-sm tabular-nums"
                  />
                  <span className="text-sm text-hb-ink-soft">kr. ({targetYear})</span>
                </span>
              )}
            </div>
          </HbField>

          <HbField
            label={revenueMode === "absolute" ? "Forventet vækst (omkostninger)" : "Forventet vækst"}
            help="Omkostninger vokser med halv procent af den valgte vækst."
          >
            <div className="flex flex-wrap items-center gap-2">
              {GROWTH_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setGrowthPercent(p)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm transition-colors",
                    growthPercent === p
                      ? "border-hb-evergreen bg-hb-evergreen text-white"
                      : "border-hb-line text-hb-ink-soft hover:border-hb-evergreen/50 hover:text-hb-ink",
                  )}
                >
                  {p} %
                </button>
              ))}
              <input
                type="range"
                min={-20}
                max={50}
                value={growthPercent}
                onChange={(e) => setGrowthPercent(Number(e.target.value))}
                className="w-40 accent-[hsl(var(--hb-evergreen))]"
                aria-label="Vækstprocent"
              />
              <span className="text-sm tabular-nums text-hb-ink">{growthPercent} %</span>
            </div>
          </HbField>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Omsætning</p>
            <p className="mt-1 font-editorial text-lg font-medium text-hb-ink">{fmtNumber(totalRev)} kr.</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Omkostninger</p>
            <p className="mt-1 font-editorial text-lg font-medium text-hb-ink">{fmtNumber(totalCost)} kr.</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Resultat</p>
            <p
              className={cn(
                "mt-1 font-editorial text-lg font-medium",
                totalRev - totalCost < 0 ? "text-hb-rust" : "text-hb-ink",
              )}
            >
              {fmtNumber(totalRev - totalCost)} kr.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {displayCategories.map((cat) => {
            const final = getFinalMonthly(cat);
            const yearTotal = final.reduce((s, v) => s + v, 0);
            return (
              <div key={cat.key} className="rounded-lg border border-hb-line/70 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-hb-ink">
                    {cat.label}
                    {cat.source_lines.length > 0 && (
                      <span className="ml-2 text-xs font-normal text-hb-ink-soft">
                        ({cat.source_lines.slice(0, 2).join(", ")}
                        {cat.source_lines.length > 2 ? ` +${cat.source_lines.length - 2}` : ""})
                      </span>
                    )}
                  </p>
                  <p className="text-sm tabular-nums text-hb-ink">{fmtNumber(yearTotal)} kr.</p>
                </div>
                {/* Feltbredde (recon 1 §4): 12 kolonner gav ~50 px pr. felt —
                    sekscifrede beløb kunne ikke læses. Nu 3/6 kolonner
                    (12 mdr. over to rækker på desktop) + større tekst. */}
                <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5 sm:grid-cols-6">
                  {final.map((val, i) => (
                    <label key={i} className="text-center">
                      <span className="block text-[10px] text-hb-ink-soft">{MONTH_LABELS[i]}</span>
                      <input
                        type="number"
                        value={val}
                        onChange={(e) => {
                          const num = Math.round(Number(e.target.value.replace(/[^0-9.-]/g, "")));
                          if (isNaN(num)) return;
                          setOverrides((prev) => ({ ...prev, [`${cat.key}-${i}`]: num }));
                        }}
                        className="w-full rounded border border-hb-line bg-hb-surface px-1.5 py-1 text-right text-xs tabular-nums text-hb-ink focus:outline-none focus:ring-1 focus:ring-hb-evergreen/60"
                        aria-label={`${cat.label} ${MONTH_LABELS[i]}`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <HbButton className="h-9 px-5 text-sm" disabled={saving} onClick={() => void handleConfirm()}>
            {saving ? "Gemmer…" : `Opret budget ${targetYear}`}
          </HbButton>
          <button
            type="button"
            onClick={() => {
              clearDraft(draftKey);
              setResult(null);
              setOverrides({});
              setRevenueMode("growth");
              setRevenueAnnualTarget(null);
              setStatusNote(null);
              setErrorNote(null);
            }}
            className="text-sm text-hb-ink-soft underline-offset-4 hover:underline"
          >
            Annullér
          </button>
          <QuietNote note={statusNote} error={errorNote} />
        </div>
        <p className="mt-2 text-[11px] text-hb-ink-soft">
          Forslaget oprettes som base-scenariet uden skabelon — du kan redigere alle linjer bagefter.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        className={dropZoneClasses(dragOver)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        onClick={() => pickFile(".pdf,.xlsx,.xls,.csv", (f) => void handleFile(f))}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") pickFile(".pdf,.xlsx,.xls,.csv", (f) => void handleFile(f));
        }}
      >
        <p className="text-sm font-medium text-hb-ink">
          {parsing ? "Vi læser dit regnskab…" : "Generér budget fra regnskab"}
        </p>
        <p className="mt-1 max-w-sm text-xs text-hb-ink-soft">
          {parsing
            ? "Det tager typisk 10-30 sekunder"
            : "Upload din resultatopgørelse (PDF eller Excel) — vi læser hver linje og foreslår næste års budget"}
        </p>
      </div>
      <div className="mt-2">
        <QuietNote note={statusNote} error={errorNote} />
      </div>
    </div>
  );
};
