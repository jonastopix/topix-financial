/**
 * _shared/genkoersel.ts — dommen om hvad der kan genkøres fra storage (10/9-2026)
 *
 * REN. Ingen Deno-, Supabase- eller npm-imports, så vitest kan læse den
 * direkte (src/lib/__tests__/genkoersel.test.ts) — samme mønster som
 * canonicalEngine/fortegnsdommen.
 *
 * HVORFOR (recon-genkoersel.md §1): extract-financial-data læser aldrig
 * filen fra storage — den får tekst (CSV), base64 + ark-tekst (XLSX) og
 * pdfjs-tekst + sidebilleder + struktur (PDF) fra browseren. Storage KAN den
 * nå (hash-sammenligningen henter filen). For CSV og XLSX mangler kun
 * rørføringen: hent bytes, lav præcis det browseren ville have sendt, kald
 * kæden uændret på det EKSISTERENDE reportId. For PDF mangler pdfjs, som kun
 * findes i browseren — den afvises her med et ord, ikke en uklar fejl.
 *
 * Målt 10/9: seks strandede filer fik deres dom rettet (#783 filnavnsreglen,
 * #784 fortegnsdommen) og ligger stadig som «Kunne ikke behandles».
 */

export type GenkoerselFiltype = "csv" | "xlsx" | "pdf" | "ukendt";

export type GenkoerselGrund =
  | "ok"
  | "pdf_kraever_browser"
  | "har_facts"
  | "slettet"
  | "manuel_anvendt"
  | "behandles"
  | "ingen_fil"
  | "ikke_strandet"
  | "ukendt_filtype";

/** Det dommen læser af rapportrækken — kolonnenavne som i financial_reports. */
export interface GenkoerselRaekke {
  id: string;
  file_name: string | null;
  file_path: string | null;
  status: string | null;
  validation_status: string | null;
  deleted_at: string | null;
  manual_override_status: string | null;
  /** quality_signals.needs_manual_entry som boolean (klienten skriver 'true'/true). */
  needs_manual_entry: boolean;
  /** Findes der facts med source_report_id = id. */
  har_facts: boolean;
}

export interface GenkoerselDom {
  report_id: string;
  filtype: GenkoerselFiltype;
  kan: boolean;
  grund: GenkoerselGrund;
  tekst: string;
}

export const GENKOERSEL_TEKST: Readonly<Record<GenkoerselGrund, string>> = {
  ok: "Kan genkøres fra storage.",
  pdf_kraever_browser:
    "PDF kan ikke genkøres fra serveren: tekst, sidebilleder og struktur laves af pdfjs i browseren. Upload filen igen fra rapporteringssiden.",
  har_facts: "Rapporten har allerede facts — en genkørsel ville overskrive grundlaget for godkendte tal.",
  slettet: "Rapporten er slettet (papirkurven).",
  manuel_anvendt: "Tallene er indtastet manuelt og anvendt — der er intet at genkøre.",
  behandles: "Rapporten behandles stadig — vent til den lander som fejlet eller behandlet.",
  ingen_fil: "Rækken bærer ingen filsti — filen nåede aldrig storage.",
  ikke_strandet: "Rapporten er læst og i orden (behandlet uden fejl) — en genkørsel ville overskrive den uden grund.",
  ukendt_filtype: "Filtypen kendes ikke på filnavnet — kun .csv, .xlsx og .xls kan genkøres.",
};

/** Filtypen som extract-financial-data selv afgør den: på endelsen alene. */
export function filtypeAfNavn(fileName: string | null | undefined): GenkoerselFiltype {
  const fn = (fileName ?? "").toLowerCase();
  if (fn.endsWith(".csv")) return "csv";
  if (fn.endsWith(".xlsx") || fn.endsWith(".xls")) return "xlsx";
  if (fn.endsWith(".pdf")) return "pdf";
  return "ukendt";
}

/** «Strandet» som målingen 10/9 definerede det: error, eller processed med FAIL / manuel indtastning. */
export function erStrandet(r: Pick<GenkoerselRaekke, "status" | "validation_status" | "needs_manual_entry">): boolean {
  if (r.status === "error") return true;
  if (r.status === "processed") return r.validation_status === "FAIL" || r.needs_manual_entry;
  return false;
}

/**
 * Dommen. Rækkefølgen er bevidst: det der gør en genkørsel FARLIG (facts,
 * manuel, slettet) står før det der gør den UMULIG (fil, filtype), så et
 * PDF-upload med facts får «har_facts», ikke «pdf».
 */
export function afgoerGenkoersel(r: GenkoerselRaekke): GenkoerselDom {
  const filtype = filtypeAfNavn(r.file_name);
  const dom = (grund: GenkoerselGrund): GenkoerselDom => ({
    report_id: r.id,
    filtype,
    kan: grund === "ok",
    grund,
    tekst: GENKOERSEL_TEKST[grund],
  });

  if (r.deleted_at) return dom("slettet");
  if (r.har_facts) return dom("har_facts");
  if (r.manual_override_status === "applied") return dom("manuel_anvendt");
  if (r.status === "processing") return dom("behandles");
  if (!erStrandet(r)) return dom("ikke_strandet");
  if (!r.file_path) return dom("ingen_fil");
  if (filtype === "pdf") return dom("pdf_kraever_browser");
  if (filtype === "ukendt") return dom("ukendt_filtype");
  return dom("ok");
}

// ── Payloaden — præcis som browseren laver den (src/lib/reportUploadEngine.ts) ──

/** Browserens loft: extractTextFromFile klipper til 30.000 tegn (:290, :297). */
export const TEKST_LOFT = 30000;

/** CSV: `file.text()` — UTF-8, BOM strippes af dekoderen, klippet til loftet. */
export function csvTekstAfBytes(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes).slice(0, TEKST_LOFT);
}

/** XLSX-teksten til AI-sti og periode/CVR-læsning: `=== Sheet: navn ===` + tab-CSV pr. ark (:281-290). */
export function regnearkTekst(ark: ReadonlyArray<{ navn: string; csv: string }>): string {
  return ark.map((a) => `=== Sheet: ${a.navn} ===\n${a.csv}`).join("\n\n").slice(0, TEKST_LOFT);
}

/** `fileToBase64` (:195-201): btoa af den binære streng — her i bidder, så store filer ikke sprænger kald-stakken. */
export function base64AfBytes(bytes: Uint8Array): string {
  let binary = "";
  const BID = 0x8000;
  for (let i = 0; i < bytes.length; i += BID) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BID));
  }
  return btoa(binary);
}
