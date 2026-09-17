/**
 * src/lib/genkoerselBrowserKoersel.ts — kørslen bag «Genkør flere rapporter» (17/9-2026).
 *
 * Trin pr. rapport, PRÆCIS som uploadzonen (HbReportUploadZone.tsx:158-215), blot uden ny række:
 *   1. filen hentes fra bucket financial-documents via file_path (storage.download — samme bucket og
 *      samme fallback-vej som reportFileAccess.openReportFile; ingen ny upload, ingen ny række);
 *   2. payloaden: extractTextFromFile (tekst + sidebilleder, pdfjs), extractPdfStructural (PDF),
 *      fileToBase64 (XLSX) — de samme tre funktioner uploadzonen bruger;
 *   3. extract-financial-data kaldes med det EKSISTERENDE reportId — ALDRIG `overwrite` (så
 *      dublet-gatens hårdsletning aldrig rammes, planens §3);
 *   4. rækken læses igen (sandheden er rækken, ikke svaret — genkoer-rapport:271), og
 *      get_report_commit_preview giver forhåndsvisningen og ejerskabet;
 *   5. godkendelse sker separat: commit_report_facts(report_id) — pr. rapport eller «alle der er PASS».
 * Sekventielt med PAUSE_MS mellem rapporterne; kan afbrydes (AbortSignal) mellem to rapporter.
 */
import { supabase } from "@/integrations/supabase/client";
import { extractTextFromFile, fileToBase64 } from "@/lib/reportUploadEngine";
import { extractPdfStructural } from "@/lib/pdfStructuralExtractor";
import { kontrolsumAf } from "@/lib/omkostningsnoegler";
import {
  afgoerGodkendelse,
  ebtAf,
  PAUSE_MS,
  skabelonAf,
  type PreviewTilDom,
  type RapportTilMasse,
  type Resultat,
} from "@/lib/genkoerselBrowser";

const LOG = "[genkoerselBrowser]";

/** Filen som File — samme bucket som openReportFile; download (ikke signeret URL) fordi vi skal have bytes, ikke en fane. */
export async function hentFil(filePath: string, fileName: string | null): Promise<File> {
  const { data, error } = await supabase.storage.from("financial-documents").download(filePath);
  if (error || !data) throw new Error(`Filen kunne ikke hentes fra storage: ${error?.message ?? "tom"}`);
  const navn = fileName ?? filePath.split("/").pop() ?? "rapport";
  const type = navn.toLowerCase().endsWith(".pdf") ? "application/pdf" : data.type || "application/octet-stream";
  return new File([data], navn, { type });
}

/** Uploadzonens payload — ordret de samme grene (PDF: tekst + sidebilleder + strukturel; XLSX: tekst + base64; CSV: tekst). */
export async function bygPayload(file: File): Promise<{ fileContent: string; pageImages?: string[]; excelBase64?: string; pdfStructural?: unknown }> {
  const ext = file.name.toLowerCase().split(".").pop();
  const extracted = await extractTextFromFile(file);
  const isExcel = ext === "xlsx" || ext === "xls";
  const isPdf = ext === "pdf" || file.type === "application/pdf";
  const excelBase64 = isExcel ? await fileToBase64(file) : undefined;
  let pdfStructural: unknown = undefined;
  if (isPdf) {
    // Uploadzonen lader en fejl her falde igennem til tekstvejen for ikke-strukturelle familier;
    // for e-conomic-resultatopgørelser kræver kæden payloaden — så fejlen SKAL frem, ikke skjules.
    pdfStructural = await extractPdfStructural(file);
  }
  return { fileContent: extracted.text, pageImages: extracted.pageImages, excelBase64, pdfStructural };
}

export async function hentPreview(reportId: string): Promise<PreviewTilDom | null> {
  const { data, error } = await supabase.rpc("get_report_commit_preview", { p_report_id: reportId });
  if (error || !data) {
    console.error(`${LOG} get_report_commit_preview fejlede for ${reportId}:`, error?.message);
    return null;
  }
  const p = data as unknown as Record<string, unknown>;
  return {
    can_commit: p.can_commit === true,
    state: String(p.state ?? ""),
    state_reason: typeof p.state_reason === "string" ? p.state_reason : null,
    ownership_state: typeof p.ownership_state === "string" ? p.ownership_state : null,
    validation_status: typeof p.validation_status === "string" ? p.validation_status : null,
    quality_signals: p.quality_signals ?? null,
    metrics_preview: (p.metrics_preview as Record<string, number> | null) ?? null,
  };
}

interface RaekkeEfter {
  status: string | null;
  validation_status: string | null;
  validation_errors: string[] | null;
  metrics: Record<string, number | null> | null;
  quality_signals: unknown;
  template_id: string | null;
  routing_template_id: string | null;
  extraction_method: string | null;
}

/** JSON-stier i select'et (metrics, template_id, routing_trace) — som en IKKE-literal streng, fordi
    supabase-js' typeparser ellers går i «excessively deep» på `->`-stierne (TS2589). */
export const RAEKKE_EFTER_SELECT: string =
  "status, validation_status, validation_errors, extraction_method, quality_signals, metrics:normalized_data->metrics, template_id:normalized_data->template_id, routing_template_id:raw_extracted_data->routing_trace->deterministic_template_id";

export async function laesRaekkeIgen(reportId: string): Promise<RaekkeEfter | null> {
  const { data, error } = await supabase
    .from("financial_reports")
    .select(RAEKKE_EFTER_SELECT)
    .eq("id", reportId)
    .maybeSingle();
  if (error || !data) {
    console.error(`${LOG} rækken kunne ikke læses igen (${reportId}):`, error?.message);
    return null;
  }
  const d = data as unknown as Record<string, unknown>;
  return {
    status: (d.status as string | null) ?? null,
    validation_status: (d.validation_status as string | null) ?? null,
    validation_errors: Array.isArray(d.validation_errors) ? (d.validation_errors as string[]) : null,
    metrics: (d.metrics as Record<string, number | null> | null) ?? null,
    quality_signals: d.quality_signals ?? null,
    template_id: typeof d.template_id === "string" ? d.template_id : null,
    routing_template_id: typeof d.routing_template_id === "string" ? d.routing_template_id : null,
    extraction_method: (d.extraction_method as string | null) ?? null,
  };
}

/** Én rapport: hent, byg, kald med reportId, læs igen, forhåndsvis. Kaster aldrig — udfaldet står i resultatet. */
export async function genkoerEn(r: RapportTilMasse, companyName: string | null): Promise<Resultat> {
  const foer: Pick<Resultat, "ebt_foer" | "udaekket_foer" | "validering_foer"> = {
    ebt_foer: ebtAf(r.metrics),
    udaekket_foer: kontrolsumAf(r.quality_signals)?.udaekket ?? null,
    validering_foer: r.validation_status,
  };
  const tom = (udfald: Resultat["udfald"], fejl: string | null): Resultat => ({
    report_id: r.id, udfald, fejl, ...foer, ebt_efter: null, udaekket_efter: null, validering_efter: null, skabelon_efter: null,
    preview: null, godkendelse: afgoerGodkendelse(null), godkendt: false, godkend_fejl: null,
  });
  try {
    if (!r.file_path) return tom("fejlet", "Ingen filsti.");
    const file = await hentFil(r.file_path, r.file_name);
    const payload = await bygPayload(file);
    const { data, error } = await supabase.functions.invoke("extract-financial-data", {
      body: { ...payload, reportId: r.id, fileName: file.name, knownCompanyName: companyName || undefined },
    });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      let body: Record<string, unknown> | null = null;
      try { body = (await ctx?.json?.()) ?? null; } catch { /* ingen JSON */ }
      const grund = (body?.error as string | undefined) ?? (error as Error).message ?? "Kaldet fejlede";
      console.error(`${LOG} extract-financial-data fejlede for ${r.id}:`, ctx?.status, body);
      return tom("fejlet", grund);
    }
    const svar = (data ?? {}) as Record<string, unknown>;
    if (svar.duplicate === true) {
      // Kan kun ske hvis en ANDEN behandlet rapport har samme periodetekst — rækken er da hårdslettet af gaten.
      return tom("fejlet", `Dublet-gaten: en anden behandlet rapport har samme periode (${String(svar.existing_report_id ?? "")}). Rækken er slettet af kæden — genskab fra snapshottet.`);
    }
    const efter = await laesRaekkeIgen(r.id);
    if (!efter) return tom("fejlet", "Rækken kunne ikke læses igen efter kørslen.");
    const preview = await hentPreview(r.id);
    const validering = efter.validation_status;
    return {
      report_id: r.id,
      udfald: efter.status === "processed" ? "genlaest" : "fejlet",
      fejl: efter.status === "processed" ? null : (efter.validation_errors?.[0] ?? `Status ${efter.status ?? "ukendt"}`),
      ...foer,
      ebt_efter: ebtAf(efter.metrics),
      udaekket_efter: kontrolsumAf(efter.quality_signals)?.udaekket ?? null,
      validering_efter: validering,
      skabelon_efter: skabelonAf({ template_id: efter.template_id, routing_template_id: efter.routing_template_id, extraction_method: efter.extraction_method }),
      preview,
      godkendelse: afgoerGodkendelse(preview),
      godkendt: false,
      godkend_fejl: null,
    };
  } catch (e) {
    console.error(`${LOG} genkørsel af ${r.id} kastede:`, e);
    return tom("fejlet", e instanceof Error ? e.message : String(e));
  }
}

/** Godkendelsen — samme RPC som «Godkend data» i ReportReviewDialog (handleCommit). */
export async function godkend(reportId: string): Promise<string | null> {
  const { error } = await supabase.rpc("commit_report_facts", { p_report_id: reportId });
  if (error) {
    console.error(`${LOG} commit_report_facts fejlede for ${reportId}:`, error.message);
    return error.message;
  }
  return null;
}

const vent = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

/** Holdet, sekventielt: én ad gangen, PAUSE_MS imellem, afbrydes mellem to rapporter. Resultater leveres løbende. */
export async function koerHold(
  rapporter: readonly RapportTilMasse[],
  navne: ReadonlyMap<string, string>,
  onResultat: (r: Resultat, index: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  for (let i = 0; i < rapporter.length; i++) {
    const r = rapporter[i];
    if (signal?.aborted) {
      onResultat({ report_id: r.id, udfald: "afbrudt", fejl: null, ebt_foer: ebtAf(r.metrics), ebt_efter: null, udaekket_foer: kontrolsumAf(r.quality_signals)?.udaekket ?? null, udaekket_efter: null, validering_foer: r.validation_status, validering_efter: null, skabelon_efter: null, preview: null, godkendelse: afgoerGodkendelse(null), godkendt: false, godkend_fejl: null }, i);
      continue;
    }
    onResultat(await genkoerEn(r, navne.get(r.company_id) ?? null), i);
    if (i < rapporter.length - 1 && !signal?.aborted) await vent(PAUSE_MS, signal);
  }
}
