import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { HbTag } from "../../HbTag";
import { HbSegmented } from "../HbSegmented";

/**
 * Review Queue i Hjemmebane (4/9) — konvertering af
 * src/pages/ReportReviewQueue.tsx (målt: 256 linjer, fire Radix Select,
 * en tabel med ni kolonner, nul formularfelter).
 *
 * HVAD SIDEN ER (målt samme dag): en FLAG-LISTE over rapporter med
 * pipeline-problemer — ni flags — plus vejen til /admin/report-debug/:id,
 * som ingen anden flade i huset linker til. Godkendelsen bor IKKE her
 * (den er commit_report_facts fra ReportReviewDialog/RapporteringView).
 * Jonas 4/9: «jeg bruger den aldrig, men den er rar, hvis nogen siger at
 * noget mangler.» Fladen skal derfor kunne SKIMMES: hvilken rapport,
 * hvilket problem, og ét klik til debug. Query, flag-reglerne, filtrene,
 * tooltips og tekster står som i den gamle fil — kun udtrykket er nyt.
 *
 * SKALLEN er HbMemberShell (side-layout, som Virksomheder), ikke
 * HbAdminShell og ikke HbAdminSplit: der er ingen detalje at redigere —
 * detaljen ER report-debug, en anden side. Menuen røres ikke (som
 * AdminLegat: intet nav-punkt markeres).
 *
 * NI KOLONNER → RÆKKENS FORM. Grid-listen (VirksomhedslisteView) er
 * prøvet med fem kolonner; ni er ikke. Valget: RÆKKEN bærer det man
 * skimmer efter — fil (med virksomhed og type under), periode, uploadet
 * og FLAGENE — i fire kolonner. Pipeline-cellen (status, metode, template,
 * validering, AI/analyse, fem linjer i den gamle tabel) og issue-tallet
 * flytter til én dæmpet META-LINJE under rækken: de er diagnosen bag
 * flagene, ikke det man leder efter. Intet forsvinder; det flytter plads.
 * Rækken er ét link til report-debug (husets mønster: hele linjen er
 * linket), med «Debug →» som synlig ende.
 *
 * FLAGENE er sidens indhold og står som tags i rækken, hver med den gamle
 * tooltip-tekst som title. HbTag kender ingen toner, og HbStatusDot kender
 * kun draft/published/archived/cancelled/completed — så tonen bygges
 * inline (som LegatView gjorde med StateDot): RUST for det der er GALT
 * (Validation fail, No canonical, AI blocked, AI missing, Structural fail,
 * No match), SAGE for det der er en NOTE om rapporten (Manual override,
 * AI extraction, Has corrections). De ni rå tailwind-farver (indigo, red,
 * orange, blue, purple …) er ikke oversat én til én: Hjemmebane bruger få
 * farver med vilje, og ordet siger hvad flaget er — tonen siger kun om
 * det er en fejl eller en oplysning.
 *
 * DE FIRE SELECT → HbSegmented, alle fire. Status har 4 valg, metode 3,
 * validering 4, AI 3 — alle «få valg», og på en flag-liste filtrerer man
 * med ét klik og vil se alle tilstande på én gang. Native select ville
 * gemme dem bag et klik hver. Segmenterne står i én ombrydende række med
 * en lille label over hver. Samme værdier og samme tekster som før.
 */

type Report = {
  id: string;
  file_name: string;
  company_name: string | null;
  report_period: string | null;
  report_type: string;
  uploaded_at: string;
  status: string;
  extraction_method: string | null;
  validation_status: string | null;
  ai_analysis: unknown;
  normalized_data: unknown;
  raw_extracted_data: unknown;
  manual_report_period_label: string | null;
  manual_report_period_key: string | null;
  manual_override_status: string | null;
};

/** De ni flags — samme labels og regler som ReportReviewQueue.tsx:37-73.
    Tone: "fejl" (rust) eller "note" (sage). */
type Flag = { label: string; tone: "fejl" | "note" };

const FLAG_TOOLTIPS: Record<string, string> = {
  "Manual override": "Perioden er manuelt sat — AI-perioden er tilsidesat",
  "Validation fail": "Tallene bestod ikke validering — check om rapporten er komplet",
  "No canonical": "Normaliserede data mangler — rapporten kan ikke vises i dashboard",
  "AI blocked": "AI-analyse er blokeret — mangler sandsynligvis nøgletal i rapporten",
  "AI missing": "Rapport er AI-eligible men analyse mangler — prøv at re-committe",
  "AI extraction": "Tallene er udtrukket via AI (ikke strukturel parsing)",
  "Structural fail": "Strukturel parsing fejlede — filen kunne ikke læses som forventet",
  "No match": "Ingen periodemodel matchede — rapporten har et ukendt format",
  "Has corrections": "Manuelle korrektioner er tilføjet til denne rapport",
};

function getFlags(r: Report): Flag[] {
  const flags: Flag[] = [];
  const nd = r.normalized_data as Record<string, unknown> | null;
  const red = r.raw_extracted_data as Record<string, unknown> | null;

  if (r.manual_override_status === "applied") flags.push({ label: "Manual override", tone: "note" });
  if (r.validation_status && r.validation_status !== "PASS") flags.push({ label: "Validation fail", tone: "fejl" });
  if (r.normalized_data == null && r.status !== "processing") flags.push({ label: "No canonical", tone: "fejl" });

  const aiEligible = nd?.ai_eligible as boolean | undefined;
  if (aiEligible === false) flags.push({ label: "AI blocked", tone: "fejl" });
  if (aiEligible === true && r.ai_analysis == null) flags.push({ label: "AI missing", tone: "fejl" });

  if (r.extraction_method === "ai_extraction") flags.push({ label: "AI extraction", tone: "note" });

  const routingTrace = red?.routing_trace as Record<string, unknown> | undefined;
  const branch = routingTrace?.branch as string | undefined;
  if (branch === "structural_fail") flags.push({ label: "Structural fail", tone: "fejl" });
  if (branch === "no_match") flags.push({ label: "No match", tone: "fejl" });

  const correctionLog = nd?.correction_log as unknown[] | undefined;
  if (correctionLog && correctionLog.length > 0) flags.push({ label: "Has corrections", tone: "note" });

  return flags;
}

function hasAnyFlag(r: Report): boolean {
  return getFlags(r).length > 0;
}

/** Flag som tag: rust = fejl, sage = note. Tooltip som før. */
const FlagTag = ({ flag }: { flag: Flag }) => (
  <HbTag
    title={FLAG_TOOLTIPS[flag.label] || flag.label}
    className={cn(
      "cursor-help px-2 py-0.5 text-[11px]",
      flag.tone === "fejl" ? "bg-hb-rust/10 text-hb-rust" : "bg-hb-sage text-hb-ink",
    )}
  >
    {flag.label}
  </HbTag>
);

// Samme værdier og tekster som de fire Select i ReportReviewQueue.tsx:127-161.
const STATUS_VALG = [
  { value: "all", label: "Alle status" },
  { value: "processing", label: "Processing" },
  { value: "processed", label: "Processed" },
  { value: "error", label: "Error" },
];
const METODE_VALG = [
  { value: "all", label: "Alle metoder" },
  { value: "deterministic_template", label: "Deterministic" },
  { value: "ai_extraction", label: "AI extraction" },
];
const VALIDERING_VALG = [
  { value: "all", label: "Alle validation" },
  { value: "PASS", label: "PASS" },
  { value: "FAIL", label: "FAIL" },
  { value: "UNSURE", label: "UNSURE" },
];
const AI_VALG = [
  { value: "all", label: "Alle AI" },
  { value: "true", label: "AI eligible" },
  { value: "false", label: "AI blocked" },
];

const Filter = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{label}</p>
    {children}
  </div>
);

const RaekkeSkelet = () => (
  <li aria-hidden className="px-4 py-3">
    <div className="h-4 w-2/5 animate-pulse rounded bg-hb-line/60" />
    <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-hb-line/40" />
  </li>
);

const Raekke = ({ r }: { r: Report }) => {
  const flags = getFlags(r);
  const nd = r.normalized_data as Record<string, unknown> | null;
  const templateId = nd?.templateId as string | undefined;
  const statementType = nd?.statementType as string | undefined;
  const aiEligible = nd?.ai_eligible;
  const manuelPeriode = r.manual_override_status === "applied" && r.manual_report_period_label;

  // Pipeline-cellen fra den gamle tabel (:212-218) som én meta-linje, plus
  // issue-tallet (:220). Samme felter, samme rækkefølge.
  const meta = [
    `Status: ${r.status}`,
    `Method: ${r.extraction_method || "–"}`,
    templateId ? `Template: ${templateId}` : null,
    `Validation: ${r.validation_status || "–"}`,
    `AI: ${aiEligible === true ? "✓" : aiEligible === false ? "✗" : "–"}`,
    `Analysis: ${r.ai_analysis ? "✓" : "✗"}`,
    `${flags.length} ${flags.length === 1 ? "issue" : "issues"}`,
  ].filter(Boolean);

  return (
    <li>
      <Link to={`/admin/report-debug/${r.id}`} className="block px-4 py-3 transition-colors hover:bg-hb-sage/20">
        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[2fr_1fr_1fr_2fr_auto] sm:items-start">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-hb-ink" title={r.file_name}>{r.file_name}</p>
            <p className="truncate text-xs text-hb-ink-soft">
              {r.company_name || "–"} · {r.report_type}
              {statementType && <span> · {statementType}</span>}
            </p>
          </div>
          <p className="text-sm text-hb-ink-soft">
            <span className="sm:hidden">Periode: </span>
            {manuelPeriode ? (
              <>
                {r.manual_report_period_label}
                {r.report_period && r.manual_report_period_label !== r.report_period && (
                  <span className="block text-[10px] text-hb-ink-soft/70">Parser: {r.report_period}</span>
                )}
              </>
            ) : (
              r.report_period || "–"
            )}
          </p>
          <p className="whitespace-nowrap text-sm text-hb-ink-soft">
            <span className="sm:hidden">Uploadet: </span>
            {format(new Date(r.uploaded_at), "d. MMM yyyy HH:mm", { locale: da })}
          </p>
          <div className="flex flex-wrap gap-1">
            {flags.map((f) => (
              <FlagTag key={f.label} flag={f} />
            ))}
          </div>
          <span className="hidden shrink-0 text-xs text-hb-evergreen sm:inline">Debug →</span>
        </div>
        <p className="mt-1.5 truncate text-[11px] text-hb-ink-soft/80" title={meta.join(" · ")}>
          {meta.join(" · ")}
        </p>
      </Link>
    </li>
  );
};

export const ReviewQueueView = () => {
  const [filterMethod, setFilterMethod] = useState("all");
  const [filterValidation, setFilterValidation] = useState("all");
  const [filterAiEligible, setFilterAiEligible] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Query ordret fra ReportReviewQueue.tsx:85-96.
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["review-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_reports")
        .select("id, file_name, company_name, report_period, report_type, uploaded_at, status, extraction_method, validation_status, ai_analysis, normalized_data, raw_extracted_data, manual_report_period_label, manual_report_period_key, manual_override_status")
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as Report[];
    },
  });

  // Filtrering ordret fra :98-115.
  const queueReports = useMemo(() => {
    let list = reports.filter(hasAnyFlag);

    if (filterMethod !== "all") list = list.filter((r) => r.extraction_method === filterMethod);
    if (filterValidation !== "all") list = list.filter((r) => r.validation_status === filterValidation);
    if (filterStatus !== "all") list = list.filter((r) => r.status === filterStatus);
    if (filterAiEligible !== "all") {
      list = list.filter((r) => {
        const nd = r.normalized_data as Record<string, unknown> | null;
        const v = nd?.ai_eligible;
        if (filterAiEligible === "true") return v === true;
        if (filterAiEligible === "false") return v === false;
        return true;
      });
    }

    return list;
  }, [reports, filterMethod, filterValidation, filterStatus, filterAiEligible]);

  const filtrerer = filterMethod !== "all" || filterValidation !== "all" || filterStatus !== "all" || filterAiEligible !== "all";

  return (
    <div>
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Platform</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">Review Queue</h1>
        <p className="mt-3 text-sm text-hb-ink-soft">
          {isLoading ? "Indlæser…" : `${queueReports.length} rapporter kræver opmærksomhed`}
        </p>
      </section>

      {/* Filtrene — fire segmenter, samme værdier som de fire Select. */}
      <div className="mt-10 flex flex-wrap gap-x-6 gap-y-4">
        <Filter label="Status">
          <HbSegmented aria-label="Status" value={filterStatus} options={STATUS_VALG} onChange={setFilterStatus} />
        </Filter>
        <Filter label="Extraction method">
          <HbSegmented aria-label="Extraction method" value={filterMethod} options={METODE_VALG} onChange={setFilterMethod} />
        </Filter>
        <Filter label="Validation">
          <HbSegmented aria-label="Validation" value={filterValidation} options={VALIDERING_VALG} onChange={setFilterValidation} />
        </Filter>
        <Filter label="AI eligible">
          <HbSegmented aria-label="AI eligible" value={filterAiEligible} options={AI_VALG} onChange={setFilterAiEligible} />
        </Filter>
      </div>

      <div className="mt-8 overflow-hidden rounded-hb border border-hb-line bg-hb-surface">
        <div className="hidden border-b border-hb-line px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft sm:grid sm:grid-cols-[2fr_1fr_1fr_2fr_auto] sm:gap-x-4">
          <span>Fil · virksomhed · type</span>
          <span>Periode</span>
          <span>Uploadet</span>
          <span>Flags</span>
          <span aria-hidden className="w-12" />
        </div>
        {isLoading ? (
          <ul className="divide-y divide-hb-line">
            <RaekkeSkelet />
            <RaekkeSkelet />
            <RaekkeSkelet />
          </ul>
        ) : queueReports.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-hb-ink-soft">
            {filtrerer ? "Ingen rapporter matcher filtrene" : "Ingen rapporter i review queue"}
          </p>
        ) : (
          <ul className="divide-y divide-hb-line">
            {queueReports.map((r) => (
              <Raekke key={r.id} r={r} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
