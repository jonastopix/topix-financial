/**
 * src/lib/genkoerselBrowser.ts — «Genkør flere rapporter» i browseren (rådgiver), dommene (17/9-2026).
 *
 * HVORFOR: genkør-planens §0 — PDF kan ikke genkøres på serveren (pdfjs findes kun i browseren:
 * tekst, sidebilleder og den strukturelle payload laves i klienten), så ~50 e-conomic-PDF'er
 * ville kræve manuel download + genupload. Jonas 17/9: «Jeg har brug for den absolut bedste
 * løsning. ALTID.» Denne flade henter filen fra storage, bygger PRÆCIS uploadzonens payload
 * (reportUploadEngine.extractTextFromFile + pdfStructuralExtractor.extractPdfStructural +
 * fileToBase64) og kalder extract-financial-data med det EKSISTERENDE reportId — ingen ny
 * række, aldrig `overwrite`, så dublet-gaten (index.ts:1450) og dens hårdsletning aldrig rammes:
 * gaten sammenligner kun med ANDRE behandlede, ikke-slettede rapporter med samme periodetekst.
 *
 * Filen har nul Supabase-imports, så dommene kan testes i vitest uden jsdom-faldgruben
 * (Supabase-klientens auth-refresh giver «Unhandled Rejection» i tests). Kørslen står i
 * genkoerselBrowserKoersel.ts; fladen i components/hjemmebane/genkoersel/GenkoerRapporterView.tsx.
 *
 * VÆRN (planens §3): manuelt rettede springes over som standard (dommen manuel_anvendt — Jonas'
 * beslutning); perioder ejet af en anden rapport springes over med grunden; filer der aldrig nåede
 * storage (legacy-sti «uploads/…», reportFileAccess.isLegacyPath) kan ikke hentes; ingen hårdsletning.
 */

// ── Rækken som fladen henter den (financial_reports + facts pr. virksomhed) ──

export interface RapportTilMasse {
  id: string;
  company_id: string;
  virksomhed: string;
  file_name: string | null;
  file_path: string | null;
  status: string | null;
  validation_status: string | null;
  report_period: string | null;
  report_type: string | null;
  manual_override_status: string | null;
  manual_report_period_key: string | null;
  extraction_method: string | null;
  deleted_at: string | null;
  /** normalized_data->'template_id' */
  template_id: string | null;
  /** raw_extracted_data->'routing_trace'->'deterministic_template_id' */
  routing_template_id: string | null;
  /** normalized_data->'metrics' */
  metrics: Record<string, number | null> | null;
  quality_signals: unknown;
  /** Facts-rækken der peger på rapporten (source_report_id = id) — null når ikke godkendt. */
  facts_period_key: string | null;
  facts_ebt: number | null;
  /** En ANDEN rapport ejer perioden (facts.source_report_id ≠ id på samme period_key). */
  periode_ejes_af: string | null;
}

// ── Skabelonen og grunden (genkør-planens §1) ──

/**
 * Skabelongrupperne — ALLE registrerede skabeloner (templateRegistry.TEMPLATE_REGISTRY) + AI-vejen + «Andet».
 *
 * RETTET 17/9-2026 22:21 (målt i drift, ANLA GLAS: 15 af 20 rapporter «Skabelonen er ikke valgt i filteret»
 * med alle kryds sat): listen kendte kun fire skabeloner, og alt andet — DK_ECONOMIC_RESULTATOPGOERELSE_XLSX_V1,
 * combined, Dinero, generic og de tre nye fra #980 — faldt i «oevrige» og dermed i «fravalgt_skabelon», fordi
 * filteret er et sæt af skabelon-id'er og fladen kun kunne krydse de fire af. Nu står hver registreret
 * skabelon her med sin gruppe (a … l), og en rapport uden kendt skabelon hører til «andet», som kan vælges
 * som enhver anden (ANDET_SKABELON er dens id i filteret) — den forsvinder ikke.
 *
 * Registeret kan ikke importeres i browseren (templateRegistry trækker npm:xlsx ind), så listen er skrevet af
 * — og kildeværnet genkoerselFilter.guard.test.ts læser TEMPLATE_REGISTRY og hver skabelons template_id og
 * FEJLER, hvis registeret får en skabelon der ikke står her. Hullet kan ikke opstå igen i stilhed.
 */
export type Skabelonsgruppe = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "andet";

export interface SkabelonValg {
  gruppe: Skabelonsgruppe;
  skabelon: string;
  label: string;
  grund: string;
}

/** Filter-id'et for rapporter hvis skabelon ikke står i listen (ukendt template_id, gamle extraction_methods). */
export const ANDET_SKABELON = "__andet__";

export const SKABELON_GRUPPER: readonly SkabelonValg[] = [
  { gruppe: "a", skabelon: "DK_ECONOMIC_SALDOBALANCE_XLSX_V1", label: "e-conomic saldobalance (XLSX)", grund: "fortegn og grupper (#971), kolonnerne (#978)" },
  { gruppe: "b", skabelon: "DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1", label: "e-conomic resultatopgørelse (PDF)", grund: "admin, renter, periodens resultat (A/A2)" },
  { gruppe: "c", skabelon: "DK_ECONOMIC_SALDOBALANCE_PDF_V1", label: "e-conomic saldobalance (PDF)", grund: "lokaler, autodrift, renter (A)" },
  { gruppe: "d", skabelon: "ai_extraction", label: "AI-læst resultatopgørelse", grund: "fortegnet krydstjekkes (C)" },
  { gruppe: "e", skabelon: "DK_ECONOMIC_RESULTATOPGOERELSE_XLSX_V1", label: "e-conomic resultatopgørelse (XLSX)", grund: "finansielle indtægter, øvrige omkostninger (#976)" },
  { gruppe: "f", skabelon: "DK_COMBINED_BALANCE_PNL_V1", label: "kombineret balance/resultat (XLSX)", grund: "finansielle indtægter, øvrige omkostninger (#976)" },
  { gruppe: "g", skabelon: "DK_DINERO_RESULTATOPGOERELSE_V1", label: "Dinero resultatopgørelse (CSV)", grund: "kontogrupper, kontrolsum (#976)" },
  { gruppe: "h", skabelon: "DK_DINERO_RESULTATOPGOERELSE_PDF_V1", label: "Dinero resultatopgørelse (PDF)", grund: "kontogrupper, kontrolsum (#976)" },
  { gruppe: "i", skabelon: "DK_GENERIC_RESULTATOPGOERELSE_PDF_V1", label: "generisk resultatopgørelse (PDF)", grund: "kontogrupper, kontrolsum (#976)" },
  { gruppe: "j", skabelon: "DK_MAMUT_SALDO_XLSX_V1", label: "Mamut/C5-saldoliste (XLSX)", grund: "ny skabelon (#980) — ANLA GLAS" },
  { gruppe: "k", skabelon: "DK_ECONOMIC_BALANCERAPPORT_PDF_V1", label: "e-conomic balancerapport (PDF)", grund: "ny skabelon (#980) — Warburg" },
  { gruppe: "l", skabelon: "DK_ETIKET_RESULTAT_BALANCE_CSV_V1", label: "etiket;beløb-CSV", grund: "ny skabelon (#980) — BR Roset" },
  { gruppe: "andet", skabelon: ANDET_SKABELON, label: "Andet / ukendt skabelon", grund: "rapporter uden kendt skabelon — kan vælges, forsvinder ikke" },
];

/** Skabelon-id'erne fladen kan krydse af (inkl. «Andet») — startværdien for filteret er dem alle. */
export const ALLE_SKABELONVALG: ReadonlySet<string> = new Set(SKABELON_GRUPPER.map((g) => g.skabelon));

/** Skabelonen som reconen læser den: template_id → routing_trace → extraction_method. */
export function skabelonAf(r: Pick<RapportTilMasse, "template_id" | "routing_template_id" | "extraction_method">): string {
  return r.template_id || r.routing_template_id || r.extraction_method || "ukendt";
}

export function gruppeAf(r: Pick<RapportTilMasse, "template_id" | "routing_template_id" | "extraction_method">): Skabelonsgruppe {
  const s = skabelonAf(r);
  return SKABELON_GRUPPER.find((g) => g.skabelon === s && g.skabelon !== ANDET_SKABELON)?.gruppe ?? "andet";
}

/** Er skabelonen valgt i filteret? En ukendt skabelon er valgt når «Andet» er krydset af. null-filter = alle. */
export function erSkabelonValgt(skabelon: string, gruppe: Skabelonsgruppe, valgte: ReadonlySet<string> | null): boolean {
  if (!valgte) return true;
  if (gruppe === "andet") return valgte.has(ANDET_SKABELON);
  return valgte.has(skabelon);
}

// ── Periodenøglen «September 2026» → «2026-09» (spejl af parse_dk_report_period_key i SQL, kun til listen;
//    den autoritative dom er get_report_commit_preview efter kørslen) ──

const MAANEDER: Record<string, string> = {
  januar: "01", jan: "01", februar: "02", feb: "02", marts: "03", mar: "03", april: "04", apr: "04", maj: "05",
  juni: "06", jun: "06", juli: "07", jul: "07", august: "08", aug: "08", september: "09", sep: "09", sept: "09",
  oktober: "10", okt: "10", november: "11", nov: "11", december: "12", dec: "12",
};

export function periodeNoegleAf(r: Pick<RapportTilMasse, "report_period" | "manual_override_status" | "manual_report_period_key" | "facts_period_key">): string | null {
  if (r.facts_period_key) return r.facts_period_key;
  if (r.manual_override_status === "applied" && r.manual_report_period_key) return r.manual_report_period_key;
  const t = (r.report_period ?? "").trim().toLowerCase();
  const iso = t.match(/^(\d{4})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const m = t.match(/^([a-zæøå]+)\.?\s+(\d{4})$/);
  if (m && MAANEDER[m[1]]) return `${m[2]}-${MAANEDER[m[1]]}`;
  return null;
}

// ── Dommen: er rapporten en kandidat, og hvorfor ikke? ──

export type MasseGrund =
  | "ok"
  | "slettet"
  | "behandles"
  | "manuel_anvendt"
  | "periode_ejes_af_anden"
  | "ingen_fil"
  | "legacy_sti"
  | "ukendt_filtype"
  | "aarsrapport"
  | "fravalgt_skabelon";

export const MASSE_TEKST: Readonly<Record<MasseGrund, string>> = {
  ok: "Læses igen fra storage med samme rapport-id.",
  slettet: "Rapporten er slettet (papirkurven).",
  behandles: "Rapporten behandles stadig — vent til den lander.",
  manuel_anvendt: "Tallene er rettet manuelt og anvendt — springes over. Genkørsel ville ikke ændre de godkendte tal (den manuelle rettelse har forrang); det kræver Jonas' beslutning.",
  periode_ejes_af_anden: "Perioden ejes af en anden rapport — springes over. Ryd ejerskabet op først («Erstat gammel data»), ellers kan tallene ikke godkendes.",
  ingen_fil: "Rækken bærer ingen filsti — filen nåede aldrig storage.",
  legacy_sti: "Filen blev uploadet før fillagring blev aktiveret (sti «uploads/…») — findes ikke i storage. Brug «Genupload original» på rapporten.",
  ukendt_filtype: "Filtypen kendes ikke på filnavnet — kun .pdf, .xlsx, .xls og .csv.",
  aarsrapport: "Årsrapporter genkøres ikke her (extract-annual-report).",
  fravalgt_skabelon: "Skabelonen er ikke valgt i filteret.",
};

export interface MasseDom {
  report_id: string;
  kan: boolean;
  grund: MasseGrund;
  tekst: string;
  gruppe: Skabelonsgruppe;
  skabelon: string;
  filtype: "pdf" | "xlsx" | "csv" | "ukendt";
}

export interface MasseValg {
  /** Skabeloner der er valgt (skabelon-id'er); null = alle. */
  skabeloner: ReadonlySet<string> | null;
  /** Kun når Jonas har besluttet det (planens §3 B) — standard false. */
  medManuelle: boolean;
}

export function filtypeAf(fileName: string | null): MasseDom["filtype"] {
  const fn = (fileName ?? "").toLowerCase();
  if (fn.endsWith(".pdf")) return "pdf";
  if (fn.endsWith(".xlsx") || fn.endsWith(".xls")) return "xlsx";
  if (fn.endsWith(".csv")) return "csv";
  return "ukendt";
}

export function erLegacySti(filePath: string | null): boolean {
  return !filePath || filePath.startsWith("uploads/");
}

/** Rækkefølgen er bevidst: det der gør kørslen FORKERT (slettet, manuel, ejerskab) før det der gør den UMULIG (fil). */
export function afgoerMasseGenkoersel(r: RapportTilMasse, valg: MasseValg): MasseDom {
  const skabelon = skabelonAf(r);
  const gruppe = gruppeAf(r);
  const filtype = filtypeAf(r.file_name);
  const dom = (grund: MasseGrund): MasseDom => ({ report_id: r.id, kan: grund === "ok", grund, tekst: MASSE_TEKST[grund], gruppe, skabelon, filtype });
  if (r.deleted_at) return dom("slettet");
  if ((r.report_type ?? "").toLowerCase().includes("aarsrapport") || (r.report_type ?? "").toLowerCase().includes("annual")) return dom("aarsrapport");
  if (r.status === "processing") return dom("behandles");
  if (r.manual_override_status === "applied" && !valg.medManuelle) return dom("manuel_anvendt");
  if (r.periode_ejes_af) return dom("periode_ejes_af_anden");
  if (!r.file_path) return dom("ingen_fil");
  if (erLegacySti(r.file_path)) return dom("legacy_sti");
  if (filtype === "ukendt") return dom("ukendt_filtype");
  if (!erSkabelonValgt(skabelon, gruppe, valg.skabeloner)) return dom("fravalgt_skabelon");
  return dom("ok");
}

// ── Kørslens takt (edge-grænsen): sekventielt med pause ──

/** Pause mellem to rapporter — udtrækket er det lange led (median 5 s, p90 76 s); pausen holder Lovables edge-grænse fri. */
export const PAUSE_MS = 2_000;
/** Højst så mange pr. kørsel (samme loft som genkoer-rapport) — vælg næste hold bagefter. */
export const HOLD_LOFT = 10;

// ── Resultatet pr. rapport, og hvad der må godkendes automatisk ──

export interface PreviewTilDom {
  can_commit: boolean;
  state: string;
  state_reason: string | null;
  ownership_state: string | null;
  validation_status: string | null;
  quality_signals: unknown;
  metrics_preview: Record<string, number> | null;
}

export interface GodkendDom {
  maa: boolean;
  automatisk: boolean;
  grund: string;
}

/** WARN med tekst i quality_signals.canonical_checks — det D's boks kræver et kryds for. */
export function advarslerAf(qualitySignals: unknown): string[] {
  const checks = (qualitySignals as { canonical_checks?: unknown } | null | undefined)?.canonical_checks;
  if (!Array.isArray(checks)) return [];
  return (checks as Record<string, unknown>[])
    .filter((c) => c?.result === "WARN" && typeof c?.tekst === "string" && (c.tekst as string) !== "")
    .map((c) => c.tekst as string);
}

/**
 * «Godkend alle der er PASS»: automatisk KUN når resolveren kan committe (can_commit), rapporten er
 * PASS, ejerskabet er rapportens eget eller frit, og der ingen WARN med tekst er (D's kryds er
 * medlemmets/rådgiverens aktive «Ja, tallene er rigtige» — det trykker vi ikke for dem). Alt andet
 * må godkendes pr. rapport med et klik (rådgiveren ser advarslen) eller slet ikke.
 */
export function afgoerGodkendelse(p: PreviewTilDom | null): GodkendDom {
  if (!p) return { maa: false, automatisk: false, grund: "Ingen forhåndsvisning — rapporten kunne ikke læses." };
  if (!p.can_commit) return { maa: false, automatisk: false, grund: p.state_reason ?? `Kan ikke godkendes (${p.state}).` };
  if (p.ownership_state === "other_report") return { maa: false, automatisk: false, grund: p.state_reason ?? "Perioden ejes af en anden rapport." };
  const advarsler = advarslerAf(p.quality_signals);
  if (advarsler.length > 0) return { maa: true, automatisk: false, grund: `Advarsel: ${advarsler.join(" ")}` };
  if (p.validation_status !== "PASS") return { maa: true, automatisk: false, grund: `Validering ${p.validation_status ?? "ukendt"} — godkend selv, hvis tallene er rigtige.` };
  return { maa: true, automatisk: true, grund: "PASS uden advarsler — godkendes automatisk med «Godkend alle der er PASS»." };
}

export type Udfald = "genlaest" | "fejlet" | "sprunget_over" | "afbrudt";

export interface Resultat {
  report_id: string;
  udfald: Udfald;
  fejl: string | null;
  ebt_foer: number | null;
  ebt_efter: number | null;
  udaekket_foer: number | null;
  udaekket_efter: number | null;
  validering_foer: string | null;
  validering_efter: string | null;
  skabelon_efter: string | null;
  preview: PreviewTilDom | null;
  godkendelse: GodkendDom;
  godkendt: boolean;
  godkend_fejl: string | null;
}

export function ebtAf(metrics: Record<string, number | null> | null | undefined): number | null {
  const v = metrics?.ebt;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** «+241.813 → +150.933» — hele kroner, tegn på begge; «—» for null. */
export function talTekst(v: number | null): string {
  if (v === null) return "—";
  const r = Math.round(v);
  const s = Math.abs(r).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return r < 0 ? `−${s}` : s;
}

export function opsummer(resultater: readonly Resultat[]): { genlaest: number; fejlet: number; sprunget: number; afbrudt: number; godkendt: number; klarTilAuto: number } {
  return {
    genlaest: resultater.filter((r) => r.udfald === "genlaest").length,
    fejlet: resultater.filter((r) => r.udfald === "fejlet").length,
    sprunget: resultater.filter((r) => r.udfald === "sprunget_over").length,
    afbrudt: resultater.filter((r) => r.udfald === "afbrudt").length,
    godkendt: resultater.filter((r) => r.godkendt).length,
    klarTilAuto: resultater.filter((r) => r.udfald === "genlaest" && !r.godkendt && r.godkendelse.automatisk).length,
  };
}

/** Kørselsrækkefølgen: godkendte først (de viser forkerte tal i dag), dernæst gruppe a → l → andet (listens orden), dernæst periode. */
export function koerselsRaekkefoelge(rapporter: readonly RapportTilMasse[]): RapportTilMasse[] {
  const rang: Record<string, number> = Object.fromEntries(SKABELON_GRUPPER.map((g, i) => [g.gruppe, i]));
  return [...rapporter].sort((x, y) => {
    const gx = x.facts_period_key ? 0 : 1;
    const gy = y.facts_period_key ? 0 : 1;
    if (gx !== gy) return gx - gy;
    const rx = rang[gruppeAf(x)];
    const ry = rang[gruppeAf(y)];
    if (rx !== ry) return rx - ry;
    return (periodeNoegleAf(x) ?? "").localeCompare(periodeNoegleAf(y) ?? "");
  });
}
