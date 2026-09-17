/**
 * DK_ECONOMIC_BALANCERAPPORT_PDF_V1 — e-conomics «Balance»-rapport som PDF (Warburgs månedsrapport).
 *
 * MÅLT 17/9-2026 i Warburg VVS & Kloak ekspres ApS' «Månedsrapport oktober 2025» (pdftotext -layout OG
 * klientens pdfjs-tekst — samme linjer: «NNNN   Navn   beløb »):
 *   - Sidehoved: «<firma> Månedsrapport oktober 2025» · «Balance» · «Udskrevet 09-11-2025 …» (pdfjs lægger
 *     dem EFTER tabellen på side 1) · kolonner «Nummer   Navn   01-10-2025 til 31-10-2025».
 *   - KREDITFORMAT: omsætning −1.631.200,61, omkostninger positive, resultatet negativt ved overskud.
 *   - Kontonumre på ALLE linjer, gruppesummer med «ialt» (ét ord): 1995 Omsætning ialt · 2990 Vareforbrug ialt ·
 *     2995 Dækningsbidrag · 3190 Lønninger ialt · 3298 Pensioner & sociale bidrag ialt · 3398 Øvrige
 *     personaleudgifter ialt · 3498 Salgsomkostninger ialt · 3598 Lokaleomkostninger ialt · 3698
 *     Administrationsomkostninger ialt · 3748/3895 Autodrift vareauto/personauto ialt (BØRN) · 3898 Autodrift
 *     ialt · 3998 Resultat før afskrivninger · 4597 Afskrivninger ialt · 4598 Indtjeningsbidrag · 4798 Resultat
 *     før finansielle poster · 5098 Finansieringsindtægter ialt · 5197 Finansieringsudgifter ialt · 5198
 *     Resultat før ekstraordinære poster · 5297 Ekstraordinære poster ialt · 5298 Resultat før skat · 5998
 *     Årets resultat · 6000 Balance …
 *   - Rådgiverens kommentarer står som løse tekstlinjer (uden kontonummer) — de læses ikke som linjer.
 *   - BALANCEN (≥ 6000) ER PERIODENS BEVÆGELSER, IKKE SALDI: «8198 Egenkapital ialt −132.949,39» = månedens
 *     resultat, «7158 Tilgodehavender ialt −123.307,24», «7998 Aktiver ialt 281.725,52» = «9799 Passiver ialt
 *     −281.725,52». Derfor udstedes INGEN balancekandidater (statement_type pnl); kontiene bæres som line items.
 *
 * ROUTING FØR: ingen skabelon (saldobalance-PDF 30, resten 0), fingerprint «unknown» → AI (Warburg: 8 AI-rapporter).
 *
 * GRUPPERNE går gennem subtotalGrupper.fordelSubtotaler (samme dom som XLSX-P&L/combined): sammenlægning,
 * kredit-netto i en omkostningsgruppe → 0 + andre_driftsindtaegter, ukendte «ialt»-rækker bevist af filens egen
 * resultatlinje (børnene 3748/3895 tælles IKKE — «Autodrift ialt» dækker dem, gabet er 0), kontrolsum
 * pnl_coverage (målt 0,00 på Warburgs fil: 1.112.768,19 − 606.417,21 − 81.912,96 − 12.563,30 − 30.157,89 −
 * 56.225,00 − 84.298,48 − 80.248,45 − 7.176,57 + 129,89 − 730,00 − 20.218,83 = 132.949,39).
 *
 * EKSTRAORDINÆRE POSTER → oevrige_omkostninger (other_costs), IKKE extraordinary_items: motorens kontrolsum
 * (omkostningsnoegler.kontrolsum, #973) har ingen plads til extraordinary_items, og «5260 Manglende bilag/info»
 * er en almindelig omkostning i månedens resultat. Med extraordinary_items ville udaekket være −20.219 på
 * Warburgs fil. Se README — det er et valg chatten kan omgøre (ét mønster i MATCHERE).
 *
 * To veje: extractSemantic (strukturvejen — bruger TEKSTEN, payloaden ignoreres; kandidater → SEMANTIC_TO_CANONICAL)
 * og extract (legacy — key_figures i forretningsfortegn → KF_TO_CANONICAL). Samme kerne (laesBalancerapport).
 */

import type { TemplateEntry, SemanticTemplateEntry, DetectionContext, ExtractionContext, DeterministicExtractedData, ParserValidation } from "../templateRegistry.ts";
import type { SemanticExtractionResult, SemanticMetricCandidate, SemanticLineItem } from "../semanticTypes.ts";
import type { PdfStructuralPayload } from "../pdfStructuralTypes.ts";
import type { MetricFamily } from "../normalizationProfiles.ts";
import { parseEconomicPdfText, type PdfParsedLine } from "../pdfTextParser.ts";
import { fordelSubtotaler, type GruppeRaekke, type SubtotalFordeling } from "../subtotalGrupper.ts";

export const BALANCERAPPORT_TEMPLATE_ID = "DK_ECONOMIC_BALANCERAPPORT_PDF_V1";
export const BALANCERAPPORT_PROFILE_ID = "economic_balancerapport_credit_v1";
/** Samme rapport i forretningsfortegn (omsætning positiv) — konventionen aflæses af omsætningens fortegn. */
export const BALANCERAPPORT_PROFILE_BUSINESS_ID = "economic_balancerapport_business_v1";
/** Første balancekonto — alt under er resultatet. */
export const BALANCE_FRA = 6000;
/** Resultatopgørelsens første konto (e-conomic: 998 «Resultatopgørelse»). */
export const RESULTAT_FRA = 998;

/** «ialt»-grupper og subtotaler → kilde-id (SEMANTIC_TO_CANONICAL). Første match vinder. */
export const MATCHERE: ReadonlyArray<{ key: string; family: MetricFamily; pattern: RegExp }> = [
  { key: "omsaetning", family: "revenue_like", pattern: /^omsætning\s+i\s*alt$/i },
  { key: "direkte_omkostninger", family: "cost_like", pattern: /^(vareforbrug|direkte\s+omkostninger)\s+i\s*alt$/i },
  { key: "daekningsbidrag", family: "profit_like", pattern: /^dækningsbidrag$/i },
  { key: "loenninger", family: "cost_like", pattern: /^lønninger\s+i\s*alt$/i },
  { key: "pensioner_sociale", family: "cost_like", pattern: /^pensioner\s*&?\s*sociale\s+bidrag\s+i\s*alt$/i },
  { key: "oevrige_personale", family: "cost_like", pattern: /^øvrige\s+personale(udgifter|omkostninger)\s+i\s*alt$/i },
  { key: "salgsomkostninger", family: "cost_like", pattern: /^salgs(omkostninger|-\s*og\s+rejseomkostninger)\s+i\s*alt$/i },
  { key: "lokaleomkostninger", family: "cost_like", pattern: /^lokaleomkostninger\s+i\s*alt$/i },
  { key: "administrationsomkostninger", family: "cost_like", pattern: /^administrationsomkostninger\s+i\s*alt$/i },
  { key: "autodrift", family: "cost_like", pattern: /^autodrift\s+i\s*alt$/i }, // KUN forælderen — «Autodrift vareauto ialt» er et barn
  { key: "resultat_foer_afskrivninger", family: "profit_like", pattern: /^resultat\s+før\s+afskrivninger$/i },
  { key: "afskrivninger", family: "cost_like", pattern: /^afskrivninger\s+i\s*alt$/i },
  { key: "indtjeningsbidrag", family: "profit_like", pattern: /^(indtjeningsbidrag|resultat\s+før\s+finansielle\s+poster)$/i },
  { key: "finansielle_indtaegter", family: "revenue_like", pattern: /^(finansierings|finansielle\s+)indtægter\s+i\s*alt$/i },
  { key: "finansieringsudgifter", family: "cost_like", pattern: /^(finansierings|finansielle\s+)(udgifter|omkostninger)\s+i\s*alt$/i },
  { key: "resultat_foer_ekstraordinaere", family: "profit_like", pattern: /^resultat\s+før\s+ekstraordinære\s+poster$/i },
  { key: "oevrige_omkostninger", family: "cost_like", pattern: /^ekstraordinære\s+poster\s+i\s*alt$/i }, // → other_costs (filhovedet)
  { key: "resultat_foer_skat", family: "profit_like", pattern: /^resultat\s+før\s+skat$/i },
  { key: "arets_resultat", family: "profit_like", pattern: /^årets\s+resultat$/i },
];

/** Kilde-id'er der er subtotaler (bærer et tal, lukker ingen gruppe) — resten er grupper. */
const PROFIT_KEYS = new Set(MATCHERE.filter((m) => m.family === "profit_like").map((m) => m.key));

const MAANEDER = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

export interface Balancerapport {
  linjer: PdfParsedLine[];
  /** Resultatopgørelsens linjer (998 ≤ konto < 6000) med et beløb. */
  resultatLinjer: PdfParsedLine[];
  fordeling: SubtotalFordeling;
  konvention: "credit" | "business";
  company_name: string | null;
  period_start: string | null;
  period_end: string | null;
  report_period_label: string | null;
  /** Kontrolsummen regnet her: revenue − grupper + indtægter − ebt (forretningsfortegn). */
}

const kontoNr = (l: PdfParsedLine): number | null => (l.account_no ? parseInt(l.account_no, 10) : null);

/** Sidehovedet: firma («… Månedsrapport oktober 2025»), perioden («01-10-2025 til 31-10-2025»). */
export function laesHoved(text: string): { company_name: string | null; period_start: string | null; period_end: string | null; report_period_label: string | null } {
  let company_name: string | null = null;
  let report_period_label: string | null = null;
  const m = text.match(/^\s*(.+?)\s+Månedsrapport\s+([a-zæøå]+)\s+(\d{4})\s*$/im);
  if (m) {
    company_name = m[1].trim();
    const idx = MAANEDER.indexOf(m[2].toLowerCase());
    if (idx >= 0) report_period_label = `${m[2].charAt(0).toUpperCase()}${m[2].slice(1).toLowerCase()} ${m[3]}`;
  }
  const p = text.match(/(\d{2}-\d{2}-\d{4})\s+til\s+(\d{2}-\d{2}-\d{4})/);
  return { company_name, period_start: p ? p[1] : null, period_end: p ? p[2] : null, report_period_label };
}

/** Kernen — REN over teksten. null når formen ikke holder. */
export function laesBalancerapport(text: string): Balancerapport | null {
  const { lines } = parseEconomicPdfText(text);
  const resultatLinjer = lines.filter((l) => {
    const nr = kontoNr(l);
    return nr !== null && nr >= RESULTAT_FRA && nr < BALANCE_FRA && l.period_amount != null;
  });
  if (resultatLinjer.length < 5) return null;
  const oms = resultatLinjer.find((l) => /^omsætning\s+i\s*alt$/i.test(l.name.trim()));
  // Kreditformat: omsætningen negativ. Forretningsformat: positiv. (Målt: kredit.)
  const konvention: "credit" | "business" = oms && oms.period_amount != null && oms.period_amount > 0 ? "business" : "credit";

  const rows: GruppeRaekke[] = [];
  resultatLinjer.forEach((l, i) => {
    const navn = l.name.trim();
    const erGruppeEllerSubtotal = /\bi\s*alt$/i.test(navn) || MATCHERE.some((m) => m.family === "profit_like" && m.pattern.test(navn));
    if (!erGruppeEllerSubtotal) return; // detaljekonti — bæres som line items, tæller i grupperne
    const m = MATCHERE.find((x) => x.pattern.test(navn)) ?? null;
    rows.push({
      label: navn.toLowerCase(), rawValue: l.period_amount, rowIndex: i, cellAddress: null,
      key: m?.key ?? null, family: m?.family ?? null,
      evidence: m ? [`label_match:${m.key}`, `account:${l.account_no}`] : [`account:${l.account_no}`],
    });
  });
  const fordeling = fordelSubtotaler(rows, konvention, "last");
  return { linjer: lines, resultatLinjer, fordeling, konvention, ...laesHoved(text) };
}

function tjekListe(r: Balancerapport): ParserValidation["checks"] {
  const checks: ParserValidation["checks"] = [];
  const harOms = r.fordeling.kandidater.some((k) => k.key === "omsaetning");
  checks.push({ name: "revenue_present", result: harOms ? "PASS" : "FAIL", details: harOms ? "Omsætning ialt fundet" : "Ingen «Omsætning ialt»" });
  const harEbt = r.fordeling.kandidater.some((k) => k.key === "resultat_foer_skat");
  checks.push({ name: "ebt_present", result: harEbt ? "PASS" : "FAIL", details: harEbt ? "Resultat før skat fundet" : "Ingen «Resultat før skat»" });
  checks.push({ name: "sign_convention", result: "PASS", details: `Convention: ${r.konvention} (omsætning ${r.konvention === "credit" ? "negativ" : "positiv"})` });
  checks.push(r.fordeling.kontrolsum);
  checks.push({ name: "balance_is_movements", result: "PASS", details: "Balancekonti (≥ 6000) er periodens bevægelser — ingen balancekandidater udstedt" });
  return checks;
}

export const dkEconomicBalancerapportPdfV1: SemanticTemplateEntry = {
  template_id: BALANCERAPPORT_TEMPLATE_ID,
  label: "e-conomic balancerapport PDF (månedsrapport, kontonumre og «ialt»)",
  supported_file_types: ["pdf"],
  statement_type: "pnl",

  detect(ctx: DetectionContext): number {
    if (ctx.fileType !== "pdf") return 0;
    const text = ctx.rawText;
    if (!text || text.length < 200) return 0;
    if (/saldobalance/i.test(text)) return 0;
    if (/\bdinero\b/i.test(text)) return 0;
    if (/Konto;Kontonavn/.test(text)) return 0;
    // Formen: kontolinjer med «ialt» (ét ord) — e-conomics balancerapport. «i alt» (to ord) er P&L-udskriften.
    const ialtLinjer = (text.match(/^\s*\d{4}\s+.+\bialt\s+-?[\d.]+,\d{2}/gim) || []).length;
    if (ialtLinjer < 5) return 0;
    let score = 40;
    if (/Nummer\s+Navn\s+\d{2}-\d{2}-\d{4}\s+til\s+\d{2}-\d{2}-\d{4}/i.test(text)) score += 25;
    if (/^\s*998\s+Resultatopgørelse/im.test(text)) score += 15;
    if (/Månedsrapport|^\s*Balance\s*$/im.test(text)) score += 10;
    return score; // maks 90
  },

  extract(ctx: ExtractionContext) {
    if (!ctx.rawText) return { success: false as const, error: "No PDF text content" };
    const r = laesBalancerapport(ctx.rawText);
    if (!r) return { success: false as const, error: "Balancerapport form not found (fewer than 5 P&L account lines)" };
    // Legacy: key_figures i FORRETNINGSFORTEGN (som Dinero-legacy): omsætning positiv, omkostninger positive, resultat med eget fortegn.
    const bus = (v: number) => (r.konvention === "credit" ? -v : v);
    const kf: Record<string, number | null> = {};
    for (const k of r.fordeling.kandidater) {
      if (k.rawValue == null) continue;
      if (k.key === "andre_driftsindtaegter") { kf[k.key] = k.rawValue; continue; } // allerede positiv (business)
      if (k.family === "cost_like") kf[k.key] = Math.abs(k.rawValue);
      else kf[k.key] = bus(k.rawValue);
    }
    const checks = tjekListe(r);
    const status = checks.some((c) => c.result === "FAIL") ? "FAIL" : "PASS";
    const data: DeterministicExtractedData = {
      report_type: "resultatopgørelse",
      company_name: r.company_name, cvr_number: null,
      period_start: r.period_start, period_end: r.period_end, report_period: r.report_period_label,
      key_figures: kf,
      line_items: r.resultatLinjer.map((l) => ({
        name: l.name, period_amount: Math.abs(l.period_amount ?? 0), ytd_amount: null,
        raw_sign: (l.period_amount ?? 0) < 0 ? "MINUS" : (l.period_amount ?? 0) > 0 ? "PLUS" : "ZERO",
        account_no: l.account_no, class: "UKLASSIFICERET",
      })),
      validation: { parser_status: status, checks },
      _deterministic_meta: {
        template_id: BALANCERAPPORT_TEMPLATE_ID, parser_confidence: status === "PASS" ? "HIGH" : "MEDIUM", detection_score: 0,
        parser_validation_status: status, parser_validation_errors: checks.filter((c) => c.result === "FAIL").map((c) => `${c.name}: ${c.details}`),
        raw_line_count: r.linjer.length, normalized_line_count: r.resultatLinjer.length, column_basis_rule: "single",
      },
    };
    return { success: true as const, data };
  },

  extractSemantic(_structural: PdfStructuralPayload | null, textContent: string): SemanticExtractionResult | null {
    const r = laesBalancerapport(textContent);
    if (!r) return null;
    const kandidater: SemanticMetricCandidate[] = r.fordeling.kandidater.map((k) => ({
      source_field_id: k.key, normalization_family: k.family, raw_value: k.rawValue,
      raw_sign: k.rawValue == null ? "zero" : k.rawValue > 0 ? "positive" : k.rawValue < 0 ? "negative" : "zero",
      sign_convention: k.signConvention, source_label: k.label, source_row_index: k.rowIndex, source_column_slot: 0,
      source_cell_address: null, basis: "period", confidence: "HIGH", evidence: k.evidence, proposed_canonical_target: null,
    }));
    const lineItems: SemanticLineItem[] = r.linjer.filter((l) => l.account_no).map((l, i) => ({
      source_field_id: `acct_${l.account_no}`, source_label: `${l.account_no} ${l.name}`, raw_value: l.period_amount,
      basis: "period" as const, account_no: l.account_no, source_row_index: i,
    }));
    const checks = tjekListe(r);
    const status = checks.some((c) => c.result === "FAIL") ? "FAIL" as const : "PASS" as const;
    return {
      source_system: "economic", document_type: "resultatopgoerelse", template_id: BALANCERAPPORT_TEMPLATE_ID,
      sign_convention: r.konvention, normalization_profile_id: r.konvention === "credit" ? BALANCERAPPORT_PROFILE_ID : BALANCERAPPORT_PROFILE_BUSINESS_ID,
      company_name: r.company_name, cvr: null, period_start: r.period_start, period_end: r.period_end, report_period_label: r.report_period_label,
      metric_candidates: kandidater, line_items: lineItems,
      basis_profile: { mode: "single", selected_period_basis: "period" },
      parser_validation: { parser_status: status, checks },
      _deterministic_meta: {
        template_id: BALANCERAPPORT_TEMPLATE_ID, parser_confidence: status === "PASS" ? "HIGH" : "MEDIUM", detection_score: 0,
        raw_line_count: r.linjer.length, normalized_line_count: kandidater.length, column_basis_rule: "single",
      },
    };
  },
};

export const _typecheck: TemplateEntry = dkEconomicBalancerapportPdfV1;
