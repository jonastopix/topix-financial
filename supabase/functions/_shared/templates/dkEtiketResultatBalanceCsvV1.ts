/**
 * DK_ETIKET_RESULTAT_BALANCE_CSV_V1 — «etiket;beløb»-CSV med resultatopgørelse og balance (BR Rosets format).
 *
 * MÅLT 17/9-2026 i BR Rosets «Juni_2026.csv» (ISO-8859-1, CRLF, semikolon, TO kolonner, ingen kontonumre):
 *   ;Juni · Nettoomsætning;551.000 · Andre driftsindtægter;0 · Vareforbrug;137.000 · Bruttoavance I;414.000 ·
 *   Lønninger;148.000 · Bruttoavance II;266.000 · Produktionsomkostninger;2.000 · Salgsomkostninger;8.000 ·
 *   Bilomkostnigner;2.000 (stavefejl i filen) · Lokaleomkostninger;20.000 · Administrationsomkostninger;13.000 ·
 *   Øvrige kapacitetsomkostninger;18000 · Faste omkostninger i alt;63.000 · Resultat af primær drift;203.000 ·
 *   Afskrivninger EDB;5.000 · Resultat før renter;198.000 · Finansielle omkostninger;6000 · Årets resultat;192.000 ·
 *   Balance 2026 · ;Juni · AKTIVER … Aktiver i alt;2.432.000 · PASSIVER … Egenkapital i alt;1.441.000 ·
 *   Gældsforpligtelser i alt;991.000 · Passiver i alt;2.432.000.
 *   - FORRETNINGSFORMAT: alt positivt, omkostninger trækkes fra. Tallene ER hele kroner («551.000» = 551.000 kr.,
 *     dansk tusindtalspunktum) — de ganges IKKE op. Nogle uden punktum («18000», «6000», «165000»).
 *   - KLIENTEN læser filen med file.text() (UTF-8): ISO-8859-1's Ø/Å bliver U+FFFD → «�vrige kapacitetsomkostninger»,
 *     «�rets resultat». Etiketterne normaliseres derfor (ledende ikke-bogstaver strippes), og matcherne rammer resten.
 *   - Skat («Skat;-89.000») står KUN i egenkapitalen — resultatopgørelsen slutter ved «Årets resultat», som derfor er
 *     både resultat før skat (ebt) og årets resultat.
 *
 * ROUTING FØR: Dinero-CSV kræver «Konto;Kontonavn;Beløb» → 0; fingerprint «unknown» → AI (BR Roset: 20 rapporter).
 *
 * GRUPPERNE: hver P&L-etiket → kilde-id (MATCHERE); produktions- og øvrige kapacitetsomkostninger → oevrige_omkostninger
 * (other_costs), lagt sammen; P&L-etiketter uden matcher (med tal, ikke subtotaler) → også øvrige (ingen linje tabes).
 * «Faste omkostninger i alt» er en FORÆLDER — tjekkes (= Σ faste grupper), tælles ikke. Kontrolsum pnl_coverage:
 * omsætning − vareforbrug + andre driftsindtægter + finansielle indtægter − Σ omkostninger − afskrivninger −
 * finansielle omkostninger = årets resultat (målt 0 på BR Rosets fil: 551 − 137 − 148 − 2 − 8 − 2 − 20 − 13 − 18
 * − 5 − 6 = 192). Balancen er saldi (målt: aktiver = passiver = 2.432.000) → udstedes som combined.
 *
 * To veje: extractSemanticFromCsv (semantisk, SEMANTIC_TO_CANONICAL) og extract (legacy key_figures). Samme kerne.
 */

import type { TemplateEntry, SemanticCsvTemplateEntry, DetectionContext, ExtractionContext, DeterministicExtractedData, ParserValidation } from "../templateRegistry.ts";
import type { CsvParseResult } from "../csvRawParser.ts";
import type { SemanticExtractionResult, SemanticMetricCandidate, SemanticLineItem } from "../semanticTypes.ts";
import type { MetricFamily } from "../normalizationProfiles.ts";

export const ETIKET_TEMPLATE_ID = "DK_ETIKET_RESULTAT_BALANCE_CSV_V1";
export const ETIKET_PROFILE_ID = "etiket_pnl_business_v1";
export const KONTROLSUM_TOLERANCE = 1;
export const OEVRIGE_KEY = "oevrige_omkostninger";

const MAANEDER = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

/** Etiketten normaliseret: små bogstaver, ét mellemrum. U+FFFD (klientens tab af æ/ø/å) BEHOLDES — matcherne tolererer det. */
export function normEtiket(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Tolerant mønster: hvert æ/ø/å i kilden matcher også U+FFFD. MÅLT: klienten læser ISO-8859-1 som UTF-8, og
 * HVERT æ/ø/å bliver U+FFFD — «Nettooms�tning», «L�nninger», «�rets resultat», «�vrige kapacitetsomkostninger»,
 * «Anl�gsaktiver». Uden tolerancen fandt skabelonen hverken omsætning eller løn i BR Rosets fil (målt 17/9).
 */
export function tolerant(kilde: string): RegExp {
  return new RegExp(kilde.replace(/[æøå]/g, (c) => `(?:${c}|\uFFFD)`), "i");
}

/** Dansk tal: «551.000» → 551000, «18000» → 18000, «-113.000» → −113000, «1.234,56» → 1234.56. */
export function tilTal(s: string): number | null {
  const t = s.trim();
  if (!/^-?[\d.]+(,\d+)?$/.test(t)) return null;
  const n = parseFloat(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Resultatopgørelsens etiketter → kilde-id. tolerant(): æ/ø/å matcher også U+FFFD (klientens tab). Første match vinder. */
export const MATCHERE: ReadonlyArray<{ key: string; family: MetricFamily; pattern: RegExp; rolle: "gruppe" | "subtotal" | "foraelder" | "skip" }> = [
  { key: "omsaetning", family: "revenue_like", pattern: tolerant("^(netto)?omsætning$"), rolle: "gruppe" },
  { key: "andre_driftsindtaegter", family: "revenue_like", pattern: tolerant("^andre driftsindtægter$"), rolle: "gruppe" },
  { key: "direkte_omkostninger", family: "cost_like", pattern: tolerant("^(vareforbrug|direkte omkostninger)$"), rolle: "gruppe" },
  { key: "daekningsbidrag", family: "profit_like", pattern: tolerant("^(bruttoavance i|bruttoavance 1|dækningsbidrag)$"), rolle: "subtotal" },
  { key: "bruttoavance_ii", family: "profit_like", pattern: tolerant("^(bruttoavance ii|bruttoavance 2)$"), rolle: "skip" }, // efter løn — ingen kanonisk nøgle
  { key: "loenninger", family: "cost_like", pattern: tolerant("^(lønninger|løn|personaleomkostninger)$"), rolle: "gruppe" },
  { key: OEVRIGE_KEY, family: "cost_like", pattern: tolerant("^(produktionsomkostninger|øvrige kapacitetsomkostninger|øvrige omkostninger|andre omkostninger)$"), rolle: "gruppe" },
  { key: "salgsomkostninger", family: "cost_like", pattern: tolerant("^salgsomkostninger$"), rolle: "gruppe" },
  { key: "autodrift", family: "cost_like", pattern: tolerant("^(bilomkost\\w*|autodrift|transportomkostninger)$"), rolle: "gruppe" }, // «Bilomkostnigner» — stavefejl i filen
  { key: "lokaleomkostninger", family: "cost_like", pattern: tolerant("^lokaleomkostninger$"), rolle: "gruppe" },
  { key: "administrationsomkostninger", family: "cost_like", pattern: tolerant("^administrationsomkostninger$"), rolle: "gruppe" },
  { key: "faste_omkostninger_i_alt", family: "cost_like", pattern: tolerant("^faste omkostninger i alt$"), rolle: "foraelder" },
  { key: "resultat_foer_afskrivninger", family: "profit_like", pattern: tolerant("^(resultat af primær drift|resultat før afskrivninger)$"), rolle: "subtotal" },
  { key: "afskrivninger", family: "cost_like", pattern: tolerant("^afskrivninger\\b.*$"), rolle: "gruppe" },
  { key: "resultat_foer_renter", family: "profit_like", pattern: tolerant("^resultat før (renter|finansielle poster)$"), rolle: "subtotal" },
  { key: "finansielle_indtaegter", family: "revenue_like", pattern: tolerant("^(finansielle indtægter|renteindtægter)$"), rolle: "gruppe" },
  { key: "finansielle_omkostninger", family: "cost_like", pattern: tolerant("^(finansielle omkostninger|finansielle udgifter|renteudgifter)$"), rolle: "gruppe" },
  { key: "arets_resultat", family: "profit_like", pattern: tolerant("^(årets resultat|periodens resultat)$"), rolle: "subtotal" },
];

/** Balancens etiketter → kilde-id. */
export const BALANCE_MATCHERE: ReadonlyArray<{ key: string; family: MetricFamily; pattern: RegExp }> = [
  { key: "varelager", family: "asset_like", pattern: tolerant("^varelager$") },
  { key: "tilgodehavender_i_alt", family: "receivable_payable_like", pattern: tolerant("^tilgodehavender i alt$") },
  { key: "likvider", family: "cash_like", pattern: tolerant("^likvide beholdninger$") },
  { key: "aktiver_i_alt", family: "asset_like", pattern: tolerant("^aktiver i alt$") },
  { key: "egenkapital", family: "equity_like", pattern: tolerant("^egenkapital i alt$") },
  { key: "kortfristet_gaeld", family: "liability_like", pattern: tolerant("^kortfristede gældsforpligtelser$") },
  { key: "gaeld_i_alt", family: "liability_like", pattern: tolerant("^gældsforpligtelser i alt$") },
  { key: "passiver_i_alt", family: "liability_like", pattern: tolerant("^passiver i alt$") },
];

const SUBTOTAL_AGTIG = /i alt$|^bruttoavance|resultat/;

export interface EtiketRaekke { etiket: string; raa: string; vaerdi: number | null; raekke: number }

export interface EtiketLaesning {
  raekker: EtiketRaekke[];
  /** P&L-rækker (før «Balance …»). */
  resultat: EtiketRaekke[];
  balance: EtiketRaekke[];
  /** Kilde-id → beløb (forretningsfortegn som de står). Øvrige er lagt sammen. */
  vaerdier: Record<string, number>;
  /** Hvad der ligger i øvrige. */
  oevrigeFra: string[];
  /** «Faste omkostninger i alt» mod Σ faste grupper — null når forælderen mangler. */
  fasteAfvigelse: number | null;
  /** Kontrolsummen: årets resultat − regnet (forretningsfortegn); null uden resultat eller omsætning. */
  afvigelse: number | null;
  regnet: number | null;
  maaned: string | null;
  aar: string | null;
}

/** Kernen — REN over parserens rækker (celler som tekst). */
export function laesEtiketter(rows: ReadonlyArray<{ row_index: number; cells: ReadonlyArray<{ raw_value: string }> }>, fileName = ""): EtiketLaesning {
  const raekker: EtiketRaekke[] = rows.map((r) => ({
    etiket: normEtiket(r.cells[0]?.raw_value ?? ""), raa: (r.cells[0]?.raw_value ?? "").trim(),
    vaerdi: tilTal(r.cells[1]?.raw_value ?? ""), raekke: r.row_index,
  }));
  let maaned: string | null = null;
  let aar: string | null = null;
  const balanceIdx = raekker.findIndex((r) => /^balance\b/.test(r.etiket));
  const bm = balanceIdx >= 0 ? raekker[balanceIdx].etiket.match(/^balance\s+(\d{4})/) : null;
  if (bm) aar = bm[1];
  // Måneden står i kolonne 2 på en række med tom etiket (»;Juni«)
  for (const r of rows) {
    const a = (r.cells[0]?.raw_value ?? "").trim();
    const b = normEtiket(r.cells[1]?.raw_value ?? "");
    if (a === "" && MAANEDER.includes(b)) { maaned = b; break; }
  }
  if (!aar) { const fm = fileName.match(/(20\d{2})/); if (fm) aar = fm[1]; }

  const resultat = (balanceIdx >= 0 ? raekker.slice(0, balanceIdx) : raekker).filter((r) => r.etiket !== "");
  const balance = balanceIdx >= 0 ? raekker.slice(balanceIdx + 1).filter((r) => r.etiket !== "") : [];

  const vaerdier: Record<string, number> = {};
  const oevrigeFra: string[] = [];
  let faste: number | null = null;
  const fasteNoegler = ["salgsomkostninger", "autodrift", "lokaleomkostninger", "administrationsomkostninger", OEVRIGE_KEY];
  for (const r of resultat) {
    if (r.vaerdi === null) continue;
    const m = MATCHERE.find((x) => x.pattern.test(r.etiket));
    if (!m) {
      if (SUBTOTAL_AGTIG.test(r.etiket)) continue; // ukendt subtotal/forælder — tælles ikke
      vaerdier[OEVRIGE_KEY] = (vaerdier[OEVRIGE_KEY] ?? 0) + r.vaerdi;
      oevrigeFra.push(`${r.raa}:${r.vaerdi}`);
      continue;
    }
    if (m.rolle === "skip") continue;
    if (m.rolle === "foraelder") { faste = r.vaerdi; continue; }
    if (m.key === OEVRIGE_KEY) { vaerdier[OEVRIGE_KEY] = (vaerdier[OEVRIGE_KEY] ?? 0) + r.vaerdi; oevrigeFra.push(`${r.raa}:${r.vaerdi}`); continue; }
    vaerdier[m.key] = r.vaerdi; // samme nøgle to gange: sidste vinder
  }
  for (const r of balance) {
    if (r.vaerdi === null) continue;
    const b = BALANCE_MATCHERE.find((x) => x.pattern.test(r.etiket));
    if (b) vaerdier[b.key] = r.vaerdi;
  }
  const fasteAfvigelse = faste === null ? null : faste - fasteNoegler.reduce((s, k) => s + (vaerdier[k] ?? 0), 0);
  const v = (k: string) => vaerdier[k] ?? 0;
  const resultatTal = vaerdier["arets_resultat"];
  let afvigelse: number | null = null;
  let regnet: number | null = null;
  if (resultatTal != null && vaerdier["omsaetning"] != null) {
    regnet = v("omsaetning") - v("direkte_omkostninger") + v("andre_driftsindtaegter") + v("finansielle_indtaegter")
      - ["loenninger", "salgsomkostninger", "autodrift", "lokaleomkostninger", "administrationsomkostninger", OEVRIGE_KEY, "afskrivninger", "finansielle_omkostninger"].reduce((s, k) => s + v(k), 0);
    afvigelse = resultatTal - regnet;
  }
  return { raekker, resultat, balance, vaerdier, oevrigeFra, fasteAfvigelse, afvigelse, regnet, maaned, aar };
}

function periode(l: EtiketLaesning): { label: string | null; start: string | null; slut: string | null } {
  if (!l.maaned || !l.aar) return { label: null, start: null, slut: null };
  const idx = MAANEDER.indexOf(l.maaned);
  const mm = String(idx + 1).padStart(2, "0");
  const sidste = new Date(Date.UTC(parseInt(l.aar, 10), idx + 1, 0)).getUTCDate();
  return { label: `${l.maaned.charAt(0).toUpperCase()}${l.maaned.slice(1)} ${l.aar}`, start: `${l.aar}-${mm}-01`, slut: `${l.aar}-${mm}-${String(sidste).padStart(2, "0")}` };
}

function tjekListe(l: EtiketLaesning): ParserValidation["checks"] {
  const checks: ParserValidation["checks"] = [];
  const harOms = l.vaerdier["omsaetning"] != null;
  checks.push({ name: "revenue_present", result: harOms ? "PASS" : "FAIL", details: harOms ? `Omsætning ${l.vaerdier["omsaetning"]}` : "Ingen omsætningsetiket" });
  const harRes = l.vaerdier["arets_resultat"] != null;
  checks.push({ name: "ebt_present", result: harRes ? "PASS" : "FAIL", details: harRes ? `Årets resultat ${l.vaerdier["arets_resultat"]} (= resultat før skat — skat står kun i egenkapitalen)` : "Ingen «Årets resultat»" });
  if (l.afvigelse === null) checks.push({ name: "pnl_coverage", result: "SKIP", details: "No result or revenue — nothing to reconcile" });
  else {
    const ok = Math.abs(l.afvigelse) <= KONTROLSUM_TOLERANCE;
    checks.push({ name: "pnl_coverage", result: ok ? "PASS" : "FAIL", details: ok
      ? `Revenue − groups + income = result (gap ${l.afvigelse.toFixed(2)}); other_costs from: ${l.oevrigeFra.join(", ") || "none"}`
      : `Groups do not sum to result: regnet ${l.regnet} vs result ${l.vaerdier["arets_resultat"]} (gap ${l.afvigelse.toFixed(2)})` });
  }
  if (l.fasteAfvigelse !== null) {
    const ok = Math.abs(l.fasteAfvigelse) <= KONTROLSUM_TOLERANCE;
    checks.push({ name: "fixed_costs_sum", result: ok ? "PASS" : "FAIL", details: ok ? "«Faste omkostninger i alt» = Σ faste grupper" : `«Faste omkostninger i alt» afviger ${l.fasteAfvigelse.toFixed(2)} fra Σ faste grupper` });
  }
  const harBalance = l.vaerdier["aktiver_i_alt"] != null && l.vaerdier["passiver_i_alt"] != null;
  checks.push({ name: "balance_present", result: harBalance ? "PASS" : "SKIP", details: harBalance ? `Aktiver ${l.vaerdier["aktiver_i_alt"]} / passiver ${l.vaerdier["passiver_i_alt"]}` : "Ingen balance" });
  checks.push({ name: "amounts_are_whole_kr", result: "PASS", details: "Tallene læses som hele kroner med dansk tusindtalspunktum — ganges ikke op" });
  return checks;
}

/** Legacy-vejen (tryDeterministicCsvExtraction) giver headerRows: [] og rawText — rækkerne udledes af teksten. */
export function raekkerAfTekst(text: string | undefined): string[][] {
  if (!text) return [];
  return text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "").map((l) => l.split(";"));
}

const kendteEtiketter = (rows: any[][]): number => rows.filter((r) => {
  const e = normEtiket((r?.[0] ?? "").toString());
  return e !== "" && (MATCHERE.some((m) => m.pattern.test(e)) || BALANCE_MATCHERE.some((m) => m.pattern.test(e)) || /^(aktiver|passiver|balance\b)/.test(e));
}).length;

export const dkEtiketResultatBalanceCsvV1: SemanticCsvTemplateEntry = {
  template_id: ETIKET_TEMPLATE_ID,
  label: "Etiket;beløb-CSV med resultatopgørelse og balance (ingen kontonumre)",
  supported_file_types: ["csv"],
  statement_type: "combined",

  detect(ctx: DetectionContext): number {
    if (ctx.fileType !== "csv") return 0;
    const rows = ctx.headerRows && ctx.headerRows.length > 0 ? ctx.headerRows : raekkerAfTekst(ctx.rawText);
    if (rows.length < 10) return 0;
    if (ctx.csvHeaders && ctx.csvHeaders.length > 0) return 0; // en overskriftsrække (Konto;Kontonavn;Beløb) er Dineros
    if (/Konto;Kontonavn/i.test(ctx.rawText ?? "")) return 0;
    const bredde = Math.max(...rows.map((r) => (r || []).length));
    if (bredde !== 2) return 0;
    // Ingen kontonumre i kolonne 1
    if (rows.some((r) => /^\d{3,5}$/.test((r?.[0] ?? "").toString().trim()))) return 0;
    let score = 40; // to kolonner, etiket + tal, ingen overskrift
    const kendte = kendteEtiketter(rows);
    if (kendte >= 6) score += 30;
    if (rows.some((r) => /^aktiver/i.test((r?.[0] ?? "").toString().trim())) && rows.some((r) => /^passiver/i.test((r?.[0] ?? "").toString().trim()))) score += 20;
    return score; // maks 90
  },

  extract(ctx: ExtractionContext) {
    const kilde = ctx.headerRows && ctx.headerRows.length > 0 ? ctx.headerRows : raekkerAfTekst(ctx.rawText);
    const rows = kilde.map((r, i) => ({ row_index: i, cells: [{ raw_value: (r?.[0] ?? "").toString() }, { raw_value: (r?.[1] ?? "").toString() }] }));
    const l = laesEtiketter(rows, ctx.fileName);
    if (l.resultat.length < 5) return { success: false as const, error: "Fewer than 5 P&L label rows" };
    const p = periode(l);
    const kf: Record<string, number | null> = { ...l.vaerdier };
    if (kf["arets_resultat"] != null) kf["resultat_foer_skat"] = kf["arets_resultat"]; // ingen skat i resultatopgørelsen
    delete kf["autodrift"]; if (l.vaerdier["autodrift"] != null) kf["transportomkostninger"] = l.vaerdier["autodrift"]; // KF_TO_CANONICAL-navnet
    const checks = tjekListe(l);
    const status = checks.some((c) => c.result === "FAIL") ? "FAIL" : "PASS";
    const data: DeterministicExtractedData = {
      report_type: "resultatopgørelse", company_name: null, cvr_number: null,
      period_start: p.start, period_end: p.slut, report_period: p.label,
      key_figures: kf,
      line_items: [...l.resultat, ...l.balance].filter((r) => r.vaerdi !== null).map((r) => ({
        name: r.raa, period_amount: Math.abs(r.vaerdi!), ytd_amount: null, raw_sign: r.vaerdi! < 0 ? "MINUS" : r.vaerdi! > 0 ? "PLUS" : "ZERO", account_no: null, class: "UKLASSIFICERET",
      })),
      validation: { parser_status: status, checks },
      _deterministic_meta: {
        template_id: ETIKET_TEMPLATE_ID, parser_confidence: status === "PASS" ? "HIGH" : "MEDIUM", detection_score: 0,
        parser_validation_status: status, parser_validation_errors: checks.filter((c) => c.result === "FAIL").map((c) => `${c.name}: ${c.details}`),
        raw_line_count: l.raekker.length, normalized_line_count: l.resultat.length + l.balance.length, column_basis_rule: "single",
      },
    };
    return { success: true as const, data };
  },

  extractSemanticFromCsv(csvResult: CsvParseResult): SemanticExtractionResult | null {
    const l = laesEtiketter(csvResult.rows, "");
    if (l.resultat.length < 5) return null;
    const p = periode(l);
    const kandidat = (key: string, family: MetricFamily, value: number, label: string, evidence: string[]): SemanticMetricCandidate => ({
      source_field_id: key, normalization_family: family, raw_value: value,
      raw_sign: value > 0 ? "positive" : value < 0 ? "negative" : "zero",
      sign_convention: "business", source_label: label, source_row_index: null, source_column_slot: 1, source_cell_address: null,
      basis: "period", confidence: "HIGH", evidence, proposed_canonical_target: null,
    });
    const kandidater: SemanticMetricCandidate[] = [];
    for (const [key, value] of Object.entries(l.vaerdier)) {
      const m = MATCHERE.find((x) => x.key === key) ?? BALANCE_MATCHERE.find((x) => x.key === key);
      if (!m) continue;
      kandidater.push(kandidat(key, m.family, value, key === OEVRIGE_KEY ? `aggregated:${OEVRIGE_KEY}` : key, key === OEVRIGE_KEY ? l.oevrigeFra.map((x) => `from:${x}`) : [`label_match:${key}`]));
    }
    if (l.vaerdier["arets_resultat"] != null) {
      kandidater.push(kandidat("resultat_foer_skat", "profit_like", l.vaerdier["arets_resultat"], "årets resultat (ingen skattelinje i resultatopgørelsen)", ["ebt_equals_net_result:no_tax_line_in_pnl"]));
    }
    const lineItems: SemanticLineItem[] = [...l.resultat, ...l.balance].map((r) => ({
      source_field_id: `row_${r.raekke}`, source_label: r.raa, raw_value: r.vaerdi, basis: "period" as const, account_no: null, source_row_index: r.raekke,
    }));
    const checks = tjekListe(l);
    const status = checks.some((c) => c.result === "FAIL") ? "FAIL" as const : "PASS" as const;
    return {
      source_system: "unknown", document_type: "combined", template_id: ETIKET_TEMPLATE_ID,
      sign_convention: "business", normalization_profile_id: ETIKET_PROFILE_ID,
      company_name: null, cvr: null, period_start: p.start, period_end: p.slut, report_period_label: p.label,
      metric_candidates: kandidater, line_items: lineItems,
      basis_profile: { mode: "single", selected_period_basis: "period" },
      parser_validation: { parser_status: status, checks },
      _deterministic_meta: {
        template_id: ETIKET_TEMPLATE_ID, parser_confidence: status === "PASS" ? "HIGH" : "MEDIUM", detection_score: 0,
        raw_line_count: l.raekker.length, normalized_line_count: kandidater.length, column_basis_rule: "single",
      },
    };
  },
};

export const _typecheck: TemplateEntry = dkEtiketResultatBalanceCsvV1;
