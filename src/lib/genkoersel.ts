/**
 * src/lib/genkoersel.ts — dommen om hvad der kan læses igen fra storage, og
 * ordene for genkoer-rapports svar (10/9-2026).
 *
 * Spejlet i supabase/functions/_shared/genkoersel.ts — enhver ændring i
 * afgoerGenkoersel/filtypeAfNavn/erStrandet/GENKOERSEL_TEKST skal laves
 * begge steder; __tests__/genkoerselKnap.test.ts har paritetsværnet.
 *
 * HVORFOR EN KNAP (Jonas 10/9): genkoer-rapport (#785) er en rådgiverhandling
 * bag authenticateUser + has_role — et kald fra SQL får 401. Fladen skal
 * derfor stå hvor rådgiveren SER en strandet rapport: virksomhedssidens
 * rapportafsnit (blok 6), på den udfoldede række. Ikke review-queue («jeg
 * bruger den aldrig»), ikke en ny side.
 *
 * Knappen tilbydes kun når dommen siger «ok» — for en PDF står grunden i
 * stedet (pdfjs findes kun i browseren; medlemmet uploader igen). Teksten på
 * knappen siger hvad den gør: «Prøv at læse filen igen».
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

export interface GenkoerselRaekke {
  id: string;
  file_name: string | null;
  file_path: string | null;
  status: string | null;
  validation_status: string | null;
  deleted_at: string | null;
  manual_override_status: string | null;
  needs_manual_entry: boolean;
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

export function filtypeAfNavn(fileName: string | null | undefined): GenkoerselFiltype {
  const fn = (fileName ?? "").toLowerCase();
  if (fn.endsWith(".csv")) return "csv";
  if (fn.endsWith(".xlsx") || fn.endsWith(".xls")) return "xlsx";
  if (fn.endsWith(".pdf")) return "pdf";
  return "ukendt";
}

export function erStrandet(r: Pick<GenkoerselRaekke, "status" | "validation_status" | "needs_manual_entry">): boolean {
  if (r.status === "error") return true;
  if (r.status === "processed") return r.validation_status === "FAIL" || r.needs_manual_entry;
  return false;
}

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

// ── Fladen: fra rapportrækken til dommen, og ordene for svaret ──

/** Det virksomhedssidens rapportrække bærer (useVirksomhed.rapporter + facts). */
export interface RapportTilGenkoersel {
  id: string;
  file_name: string | null;
  file_path: string | null;
  status: string | null;
  validation_status?: string | null;
  validation_errors?: string[] | null;
  quality_signals?: unknown;
  manual_override_status: string | null;
}

/** quality_signals.needs_manual_entry som boolean — klienten skriver både true og 'true'. */
export function needsManualEntryAf(qs: unknown): boolean {
  if (!qs || typeof qs !== "object") return false;
  const v = (qs as Record<string, unknown>).needs_manual_entry;
  return v === true || v === "true";
}

/** Dommen for en række på virksomhedssiden. Listen udelader slettede (deleted_at IS NULL). */
export function genkoerselAfRapport(r: RapportTilGenkoersel, harFacts: boolean): GenkoerselDom {
  return afgoerGenkoersel({
    id: r.id,
    file_name: r.file_name,
    file_path: r.file_path,
    status: r.status,
    validation_status: r.validation_status ?? null,
    deleted_at: null,
    manual_override_status: r.manual_override_status,
    needs_manual_entry: needsManualEntryAf(r.quality_signals),
    har_facts: harFacts,
  });
}

/** «Hvad der fejlede» — den første gemte fejlgrund, ellers et ærligt fravær. */
export function fejlgrundAfRapport(r: Pick<RapportTilGenkoersel, "validation_errors" | "status">): string {
  const foerste = (r.validation_errors ?? []).map((t) => (t ?? "").trim()).find((t) => t.length > 0);
  if (foerste) return foerste;
  return r.status === "error" ? "Ingen fejlgrund gemt på rapporten." : "Ingen fejlgrund gemt — tallene kunne ikke godkendes automatisk.";
}

export const GENKOER_KNAP_TEKST = "Prøv at læse filen igen";

export interface GenkoerselBesked {
  tone: "success" | "info" | "warning" | "error";
  tekst: string;
  beskrivelse?: string;
  /** Skal fladen hente igen bagefter (rækken kan være ændret eller væk)? */
  genhent: boolean;
}

/** Tørkørslens svar for ÉN rapport: kan den, og advarer serveren om noget? */
export interface ToerkoerselDom {
  kan: boolean;
  tekst: string;
  advarsel: string | null;
}

export function tolkToerkoersel(body: unknown, reportId: string): ToerkoerselDom {
  const b = (body ?? {}) as Record<string, unknown>;
  const find = (liste: unknown) =>
    Array.isArray(liste) ? (liste as Record<string, unknown>[]).find((x) => x?.report_id === reportId) : undefined;
  const ville = find(b.ville_genkoere);
  if (ville) {
    return { kan: true, tekst: String(ville.tekst ?? GENKOERSEL_TEKST.ok), advarsel: typeof ville.advarsel === "string" ? ville.advarsel : null };
  }
  const afvist = find(b.afvist);
  if (afvist) return { kan: false, tekst: String(afvist.tekst ?? "Serveren afviste genkørslen."), advarsel: null };
  const ukendte = Array.isArray(b.ukendte_report_ids) ? (b.ukendte_report_ids as string[]) : [];
  if (ukendte.includes(reportId)) return { kan: false, tekst: "Serveren kender ikke rapporten — er den slettet?", advarsel: null };
  return { kan: false, tekst: "Serverens svar bar ingen dom for rapporten.", advarsel: null };
}

/** Kørslens svar for ÉN rapport → toast. Sandheden er rækken efter kørslen (raekke_efter), ikke svaret. */
export function tolkGenkoerselSvar(body: unknown, reportId: string): GenkoerselBesked {
  const b = (body ?? {}) as Record<string, unknown>;
  const koert = Array.isArray(b.koert) ? (b.koert as Record<string, unknown>[]).find((x) => x?.report_id === reportId) : undefined;
  if (!koert) {
    const afvist = Array.isArray(b.afvist) ? (b.afvist as Record<string, unknown>[]).find((x) => x?.report_id === reportId) : undefined;
    if (afvist) return { tone: "info", tekst: "Filen blev ikke læst igen", beskrivelse: String(afvist.tekst ?? ""), genhent: true };
    return { tone: "error", tekst: "Serverens svar bar intet resultat for rapporten", genhent: true };
  }
  const svar = (koert.svar ?? {}) as Record<string, unknown>;
  const efter = (koert.raekke_efter ?? null) as Record<string, unknown> | null;
  const udfald = String(koert.udfald ?? "");
  // Grunden i prioriteret orden (10/9, «Serveren gav ingen fejlgrund» var vores egen
  // udeladelse): serverens ord (message/error) → rækkens validation_errors → svarets
  // validation.errors. Rækken er sandheden; den bærer præcis det kortet viser som «Fejlede: …».
  const foersteTekst = (liste: unknown): string | null =>
    Array.isArray(liste) ? ((liste as unknown[]).find((v) => typeof v === "string" && v.trim().length > 0) as string | undefined) ?? null : null;
  const serverOrd =
    [svar.message, svar.error].find((v): v is string => typeof v === "string" && v.trim().length > 0)
    ?? foersteTekst(efter?.validation_errors)
    ?? foersteTekst((svar.validation_errors as unknown) ?? null)
    ?? undefined;
  switch (udfald) {
    case "behandlet_pass":
      return { tone: "success", tekst: "Filen blev læst — afventer godkendelse", beskrivelse: efter?.report_period ? `Periode: ${String(efter.report_period)}` : undefined, genhent: true };
    case "behandlet_fail_eller_manuel":
      return {
        tone: "warning",
        tekst: "Filen blev læst, men tallene kunne ikke godkendes automatisk",
        beskrivelse: serverOrd ?? (efter?.routing_branch ? `Rute: ${String(efter.routing_branch)}` : "Rapporten står til manuel indtastning."),
        genhent: true,
      };
    case "fejlet":
      return { tone: "error", tekst: "Filen kunne stadig ikke læses", beskrivelse: serverOrd ?? "Serveren gav ingen fejlgrund.", genhent: true };
    case "raekke_slettet_af_dubletgaten":
      return {
        tone: "error",
        tekst: "Rapporten blev fjernet af dublet-gaten",
        beskrivelse: `En anden behandlet rapport dækker samme periode${svar.existing_report_id ? ` (${String(svar.existing_report_id)})` : ""}. Den strandede række er slettet.`,
        genhent: true,
      };
    case "fil_kunne_ikke_hentes":
      return { tone: "error", tekst: "Filen kunne ikke hentes fra lageret", beskrivelse: typeof koert.fejl === "string" ? koert.fejl : undefined, genhent: false };
    case "kastede":
      return { tone: "error", tekst: "Genkørslen fejlede", beskrivelse: typeof koert.fejl === "string" ? koert.fejl : undefined, genhent: true };
    default:
      return { tone: "error", tekst: "Ukendt udfald fra genkørslen", beskrivelse: udfald || undefined, genhent: true };
  }
}

/** HTTP-fejl fra genkoer-rapport (FunctionsHttpError) → toast. */
export function tolkGenkoerselFejl(status: number | null, body: Record<string, unknown> | null): GenkoerselBesked {
  const kode = typeof body?.error === "string" ? body.error : null;
  if (status === 401) return { tone: "error", tekst: "Du er ikke logget ind længere — log ind og prøv igen.", genhent: false };
  if (status === 403) return { tone: "error", tekst: "Kun rådgivere kan læse en fil igen.", genhent: false };
  if (status === 400) return { tone: "error", tekst: "Serveren afviste kaldet", beskrivelse: kode ?? "ugyldigt kald", genhent: false };
  return { tone: "error", tekst: "Genkørslen kunne ikke gennemføres", beskrivelse: kode ?? `status ${status ?? "?"}`, genhent: false };
}
