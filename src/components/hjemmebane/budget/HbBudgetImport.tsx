import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { confirmBudgetFromAccounts, confirmImportFraSkriveplan } from "@/lib/budgetEngine";
import { laesCsvTilMatrix } from "@/lib/csvLaesning";
import { laesMatrix, type Matrix } from "@/lib/importEngine";
import { byggGitter, type Gitter } from "@/lib/importGitterModel";
import { byggSkriveplan, tolkKolonner, udledAar } from "@/lib/importSkrivning";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbField, HbInput } from "../admin/HbField";
import { HbImportGitter } from "./HbImportGitter";
import { QuietNote, fmtNumber } from "./hbBudgetShared";

/** Import-sektionens to spor (design-blok §c6) i HbReportUploadZone-sproget:
    rolige zoner, statuslinjer i stedet for spinner-teater, stille
    kvitteringer. Excel/CSV-sporet kører nu den DETERMINISTISKE vej
    (importEngine → importGitterModel → importSkrivning → budgetEngine W8)
    helt i browseren — edge-funktionen import-budget-excel kaldes ikke
    længere herfra. Regnskabs-sporet (HbBudgetFromAccounts) er en
    selvstændig vej med egen edge function og er urørt (W6). */

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
const MAANEDER_FULDE = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

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

// ──────────────── Excel-import (W8 — deterministisk vej) ────────────────

/** Tomt gitter (P1): kan filen slet ikke læses, lander medlemmet stadig i
    gitteret og kan skrive eller indsætte sine tal direkte fra regnearket —
    aldrig en blindgyde. Tre tomme rækker som startpunkt. */
const tomtGitter = (): Gitter => ({
  kolonner: MAANEDER_FULDE.map((m) => m.charAt(0).toUpperCase() + m.slice(1)),
  raekker: [0, 1, 2].map((raekkeIndex) => ({
    raekkeIndex,
    etiket: "",
    vaerdier: Array.from({ length: 12 }, () => null),
    medtag: true,
    bemaerkning: null,
    kommentar: null,
    sektion: null,
    gruppe: null,
    tabelIndex: 0,
  })),
  struktur: [],
  sektionsGrupper: { "": "drift" },
  udeladteSektioner: {},
  advarsler: [],
});

const listeMedOg = (dele: string[]): string =>
  dele.length <= 1 ? dele.join("") : `${dele.slice(0, -1).join(", ")} og ${dele[dele.length - 1]}`;

export const HbBudgetExcelImport = ({
  userId,
  companyId,
  onImported,
  onAabenSkift,
}: {
  userId: string | undefined;
  companyId: string | undefined;
  onImported: (result: { year: string }) => void;
  /** Meldes når gitteret åbner/lukker, så fladen kan give det fuld bredde. */
  onAabenSkift?: (aaben: boolean) => void;
}) => {
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [gitter, setGitter] = useState<Gitter | null>(null);
  const [aar, setAar] = useState<string>(String(new Date().getFullYear()));
  const [udledteAar, setUdledteAar] = useState<string[]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [errorNote, setErrorNote] = useState<string | null>(null);
  const [visVejledning, setVisVejledning] = useState(false);
  const workbookRef = useRef<any>(null);

  // Kladde (hb-budget-persistens-recon §4 ii): GITTERET persisteres — det
  // er medlemmets rettelser der mistes ved remount, ikke filen.
  const draftKey = companyId ? `hb-budget-gitter-draft:${companyId}` : null;

  useEffect(() => {
    if (!draftKey || gitter) return;
    const draft = readDraft<{ gitter: Gitter; aar: string; udledteAar: string[] }>(draftKey);
    if (draft?.gitter) {
      setGitter(draft.gitter);
      setAar(draft.aar);
      setUdledteAar(draft.udledteAar ?? []);
      setStatusNote("Dit indlæste ark er gendannet — gennemse og godkend nedenfor");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || !gitter) return;
    writeDraft(draftKey, { gitter, aar, udledteAar });
  }, [draftKey, gitter, aar, udledteAar]);

  useEffect(() => {
    onAabenSkift?.(gitter !== null);
  }, [gitter, onAabenSkift]);

  /** Matrix → gitter + årsudledning. Tom fil ender i det tomme gitter (P1). */
  const aabnMatrix = useCallback((matrix: Matrix) => {
    const resultat = laesMatrix(matrix);
    let g = byggGitter(resultat);
    if (g.raekker.length === 0) {
      g = tomtGitter();
      setStatusNote(
        "Vi fandt ingen linjer i filen — skriv dine tal direkte i tabellen, eller kopiér dem fra dit regneark og sæt ind",
      );
    } else {
      setStatusNote("Filen er læst — gennemse, ret og godkend nedenfor");
    }
    const fundneAar = udledAar(tolkKolonner(g.kolonner));
    setUdledteAar(fundneAar);
    setAar(fundneAar[0] ?? String(new Date().getFullYear()));
    setGitter(g);
  }, []);

  /** P1-fallback når selve læsningen fejler: tomt gitter, aldrig en fejlside. */
  const aabnTomt = useCallback(() => {
    setUdledteAar([]);
    setAar(String(new Date().getFullYear()));
    setGitter(tomtGitter());
    setStatusNote(
      "Vi kunne ikke læse filen — kopiér tallene fra dit regneark og sæt dem ind direkte i tabellen nedenfor",
    );
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true);
      setErrorNote(null);
      setStatusNote(null);
      setGitter(null);
      setSheetNames([]);
      try {
        if (/\.(xlsx|xls)$/i.test(file.name)) {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
          workbookRef.current = wb;
          if (wb.SheetNames.length > 1) {
            setSheetNames(wb.SheetNames);
            setStatusNote("Vælg det ark der indeholder budgettet");
            return;
          }
          const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
            header: 1,
            raw: true,
            defval: null,
          }) as Matrix;
          aabnMatrix(matrix);
        } else {
          // CSV og alt andet tekstligt: skilletegns-detekteret læsning.
          aabnMatrix(laesCsvTilMatrix(await file.text()));
        }
      } catch (err) {
        console.error("Budget import-læsning fejlede:", err);
        aabnTomt();
      } finally {
        setParsing(false);
      }
    },
    [aabnMatrix, aabnTomt],
  );

  /** Flere ark: ét ark ad gangen — motoren arbejder på én matrix. */
  const vaelgArk = useCallback(
    async (navn: string) => {
      setParsing(true);
      try {
        const XLSX = await import("xlsx");
        const matrix = XLSX.utils.sheet_to_json(workbookRef.current.Sheets[navn], {
          header: 1,
          raw: true,
          defval: null,
        }) as Matrix;
        setSheetNames([]);
        aabnMatrix(matrix);
      } catch (err) {
        console.error("Ark-læsning fejlede:", err);
        setSheetNames([]);
        aabnTomt();
      } finally {
        setParsing(false);
      }
    },
    [aabnMatrix, aabnTomt],
  );

  // Skriveplanen — konsekvenserne af gitteret, live ved hver ændring.
  const plan = useMemo(() => (gitter ? byggSkriveplan(gitter, aar) : null), [gitter, aar]);

  const fordelinger = useMemo(() => {
    if (!plan) return [];
    const prKolonne = new Map<string, { navn: string; maaneder: number[]; antal: number }>();
    for (const raekke of plan.raekker) {
      for (const f of raekke.fordelinger) {
        const eksisterende = prKolonne.get(f.kolonnenavn);
        if (eksisterende) eksisterende.antal++;
        else prKolonne.set(f.kolonnenavn, { navn: f.kolonnenavn, maaneder: f.maaneder, antal: 1 });
      }
    }
    return [...prKolonne.values()];
  }, [plan]);

  const aarMuligheder = useMemo(() => {
    const nu = new Date().getFullYear();
    return [...new Set([...udledteAar, String(nu - 1), String(nu), String(nu + 1), aar])].sort();
  }, [udledteAar, aar]);

  const handleConfirm = async () => {
    if (!plan || !userId || !companyId || plan.raekker.length === 0) return;
    setSaving(true);
    setErrorNote(null);
    try {
      await confirmImportFraSkriveplan({ userId, companyId, plan });
      clearDraft(draftKey);
      setGitter(null);
      setUdledteAar([]);
      setStatusNote(`Budget ${plan.aar} er importeret`);
      onImported({ year: plan.aar });
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
    setGitter(null);
    setUdledteAar([]);
    setSheetNames([]);
    workbookRef.current = null;
    setStatusNote(null);
    setErrorNote(null);
  };

  // Ark-vælger (flere ark — ét ad gangen)
  if (sheetNames.length > 1 && !gitter && !parsing) {
    const guess = sheetNames.find((n: string) => /budget/i.test(n)) ?? sheetNames[0];
    return (
      <div>
        <p className="text-sm text-hb-ink-soft">
          Filen har flere ark — vælg det der indeholder budgettet. Du kan importere ét ark ad gangen.
        </p>
        <div className="mt-3 space-y-2">
          {sheetNames.map((navn) => (
            <button
              key={navn}
              type="button"
              onClick={() => void vaelgArk(navn)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                navn === guess
                  ? "border-hb-evergreen bg-hb-sage/30 text-hb-ink"
                  : "border-hb-line text-hb-ink hover:border-hb-evergreen/50",
              )}
            >
              <span
                className={cn(
                  "h-3 w-3 shrink-0 rounded-full border",
                  navn === guess ? "border-hb-evergreen bg-hb-evergreen" : "border-hb-line",
                )}
              />
              {navn}
            </button>
          ))}
        </div>
        <button type="button" onClick={reset} className="mt-4 text-sm text-hb-ink-soft underline-offset-4 hover:underline">
          Vælg en anden fil
        </button>
      </div>
    );
  }

  // Gitteret + skriveplanens konsekvenser
  if (gitter && plan) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-editorial text-lg font-medium text-hb-ink">Gennemse dit budget</p>
          {/* Årsvalget er ALTID synligt og ændringsbart — også når kun ét år
              er udledt af filen. */}
          <div className="flex items-center gap-2">
            <label htmlFor="import-budgetaar" className="text-sm text-hb-ink-soft">
              Budgetår
            </label>
            <select
              id="import-budgetaar"
              value={aar}
              onChange={(e) => setAar(e.target.value)}
              className="rounded-md border border-hb-line bg-hb-surface px-2.5 py-1.5 text-sm text-hb-ink focus:outline-none focus:ring-2 focus:ring-hb-evergreen/50"
            >
              {aarMuligheder.map((muligt) => (
                <option key={muligt} value={muligt}>
                  {muligt}
                </option>
              ))}
            </select>
            {udledteAar.length === 1 && (
              <span className="text-xs text-hb-ink-soft">aflæst af filen</span>
            )}
            {udledteAar.length > 1 && (
              <span className="text-xs text-hb-ink-soft">
                filen har {udledteAar.length} år — vælg det der skal ind
              </span>
            )}
          </div>
        </div>

        <HbImportGitter gitter={gitter} onChange={setGitter} />

        {/* Skriveplanens konsekvenser — hvad der faktisk skrives, live. */}
        <HbCard className="p-5">
          <p className="font-editorial text-lg font-medium text-hb-ink">
            Det her skrives til budget {aar}
          </p>
          {/* Årsskiftet er en ANTAGELSE medlemmet skal godkende bevidst —
              vises fremhævet her, ikke kun i advarselslisten nederst. */}
          {plan.aarsskift && (
            <p className="mt-2 rounded-md bg-hb-sand/60 px-3 py-2 text-sm font-medium text-hb-rust">
              Kolonnerne i filen er fra {plan.aarsskift.fra}. Tallene skrives til budget{" "}
              {plan.aarsskift.til} — tjek at det er det du vil.
            </p>
          )}
          <p className="mt-1 text-sm text-hb-ink-soft">
            {plan.raekker.length === 0
              ? "Ingen linjer at skrive endnu — vælg linjer til, eller indsæt tal i tabellen."
              : `${plan.raekker.length} linje${plan.raekker.length === 1 ? "" : "r"} skrives som dit base-budget. Optimistisk og pessimistisk laver du bagefter under Scenarier.`}
          </p>
          {fordelinger.length > 0 && (
            <ul className="mt-3 space-y-1">
              {fordelinger.map((f) => (
                <li key={f.navn} className="text-sm text-hb-ink-soft">
                  "{f.navn}" fordeles ligeligt på {listeMedOg(f.maaneder.map((m) => MAANEDER_FULDE[m]))}
                  {f.antal > 1 ? ` — ${f.antal} linjer` : ""}
                </li>
              ))}
            </ul>
          )}
          {plan.sprungetOverKolonner.length > 0 && (
            <p className="mt-3 text-sm text-hb-ink-soft">
              Kolonner der ikke skrives, fordi de ville tælle dobbelt eller hører til et andet år:{" "}
              {plan.sprungetOverKolonner.join(", ")}
            </p>
          )}
          {plan.utolkedeKolonner.length > 0 && (
            <p className="mt-2 text-sm text-hb-ink-soft">
              Kolonner vi ikke kunne læse som perioder: {plan.utolkedeKolonner.join(", ")}
            </p>
          )}
          {/* Årsskifte-advarslen vises fremhævet ovenfor — ikke dobbelt her. */}
          {plan.advarsler.filter((a) => !a.startsWith("Kolonnerne i filen er fra")).map((advarsel, i) => (
            <p key={i} className="mt-2 text-sm text-hb-ink-soft" role="status">
              {advarsel}
            </p>
          ))}
        </HbCard>

        <div className="flex flex-wrap items-center gap-3">
          <HbButton
            className="h-9 px-5 text-sm"
            disabled={saving || plan.raekker.length === 0}
            onClick={() => void handleConfirm()}
          >
            {saving ? "Gemmer…" : `Importér budget ${aar}`}
          </HbButton>
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
            ? "Det tager et øjeblik"
            : "Træk filen hertil eller klik for at vælge — vi læser hver linje, og du gennemser alt før noget gemmes"}
        </p>
        {!parsing && (
          <p className="mt-2 text-[11px] text-hb-ink-soft">.xlsx, .xls og .csv · du kan også indsætte direkte fra regnearket bagefter</p>
        )}
      </div>

      {/* Skabelonen tilbydes FØR upload — det er her den hjælper. Vejledningen
          er en udfoldelig tekst i fladen, ikke en side i appen: den læses i
          importøjeblikket og ingen andre steder, og en rute + nav-plads for
          punktuel hjælpetekst ville stride mod Hjemmebanes mønster, hvor
          importflowet holder alt inline (QuietNote, kort, gitter). */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <a
          href="/skabeloner/budget-skabelon-2026.xlsx"
          download
          className="text-sm font-medium text-hb-evergreen underline-offset-4 hover:underline"
        >
          Hent vores skabelon
        </a>
        <span className="text-xs text-hb-ink-soft">
          Udfyld den — selv, eller lad et AI-værktøj gøre det ud fra dine regnskabstal — og upload
          den igen. Den er bygget til at importere uden bemærkninger.
        </span>
        <button
          type="button"
          onClick={() => setVisVejledning((v) => !v)}
          className="text-xs text-hb-ink-soft underline-offset-4 hover:text-hb-ink hover:underline"
          aria-expanded={visVejledning}
        >
          {visVejledning ? "Skjul vejledningen" : "Sådan bruger du den"}
        </button>
      </div>

      {visVejledning && (
        <div className="mt-3 space-y-3 rounded-lg border border-hb-line bg-hb-surface p-4 text-sm text-hb-ink">
          {/* Forkortet af docs/budget-skabelon-vejledning.md — fladen bærer
              essensen, dokumentet den fulde tekst. */}
          <p className="font-editorial text-base font-medium">Sådan bruger du skabelonen</p>
          <p className="text-hb-ink-soft">
            Hent den, udfyld tallene, upload den igen — det er det. Vil du have hjælp, så giv
            skabelonen til ChatGPT, Claude eller et andet AI-værktøj sammen med dine egne tal og
            bed den udfylde et realistisk budget. En prompt der virker:
          </p>
          <p className="border-l-2 border-hb-line pl-3 text-xs italic text-hb-ink-soft">
            "Her er en tom budgetskabelon og mine regnskabstal. Udfyld skabelonen med et realistisk
            budget for næste år. Behold arkets opbygning præcis som den er — de samme sektioner, de
            samme kolonner. Skriv omkostninger som negative tal. Slet de linjer jeg ikke bruger, og
            tilføj gerne linjer jeg mangler."
          </p>
          <p className="text-hb-ink-soft">
            Det bedste grundlag er din posteringsoversigt fra banken (året til dato + hele sidste
            år), din saldobalance eller resultatopgørelse, dine korttransaktioner — og de ændringer
            du allerede kender for næste år. Fjern kunde- og leverandørnavne før du deler noget med
            et AI-værktøj; budgettet skal kun bruge beløb, dato og kategori.
          </p>
          <div className="text-hb-ink-soft">
            <p className="font-medium text-hb-ink">Fire ting der får importen til at gå rent:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>Behold overskriftsrækken — månedsnavnene med årstal styrer kolonnerne.</li>
              <li>Behold de seks sektioner — de afgør hvor linjerne havner og hvad de sammenlignes med.</li>
              <li>Skriv omkostninger som negative tal.</li>
              <li>Slet ubrugte linjer, og indsæt ingen tomme rækker eller totalrækker — vi lægger selv sammen.</li>
            </ul>
          </div>
          <p className="text-hb-ink-soft">
            Du får hele budgettet at se, linje for linje, før noget gemmes. Og skabelonen er
            valgfri — har du allerede et budget i et regneark, kan du uploade det som det er.
          </p>
        </div>
      )}

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
