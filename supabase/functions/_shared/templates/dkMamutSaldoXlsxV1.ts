/**
 * Template: DK_MAMUT_SALDO_XLSX_V1
 * Mamut (Visma) saldoliste XLSX med kontoplan fra Dynamics C5 — resultat OG balance,
 * sumkonti MED kontonummer. Bygget 17/9-2026 efter ANLA GLAS' fil «2025-12.xlsx»
 * (369 rækker, målt; vindue A's udkast-skabeloner-a-c/README.md §7).
 *
 * FILENS FORM (målt):
 *   Række 0: «Saldo: december saldo 2025»           (én celle)
 *   Række 1: «Kontonummer» · «Kontonavn» · «Beløb»  (præcis tre kolonner)
 *   Række 2+: én konto pr. række, kontonumre stigende 999–9000, beløbet som tal.
 *   SUMKONTI HAR KONTONUMMER: 1499 «Omsætning I alt», 2699 «Variable omkostninger I alt»,
 *   2700 «Dækningsbidrag 1», 3998 «Løn I alt», 3999 «Dækningsbidrag 2», 4099 «Salgsfremmende
 *   omk. I alt», 4199 «Bilomk. I alt», 4299 «Lokaleomk. I alt», 4398 «Administrationsomk. I alt»,
 *   4399 «Resultat før afskrivninger», 4499 «Afskrivninger I alt», 4699 «Finansielle indtægter I alt»,
 *   4799 «Finansielle udgifter I alt», 4899 «Ekstraordinære poster I alt», 4940 «Resultat før skat»,
 *   4998 «Skatter i alt», 4999 «Årets resultat»; balancen fra 5000 («Balance»): 6599 «Varelager I alt»,
 *   6799 «Tilgodehavender I alt», 6950 «Likvide midler I alt», 6999 «Aktiver I alt», 7494 «Egenkapital
 *   i alt», 8899 «Gæld I alt», 8999 «Passiver I alt». Hver «I alt»-konto er PRÆCIS summen af
 *   detaljekontiene siden forrige «I alt» (målt på alle 14 i ANLA's fil: 0,00 afvigelse).
 *   Forretningsformat: omsætning positiv, omkostninger negative; balancen: aktiver positive,
 *   egenkapital og gæld negative (kredit), likvide midler negative ved kassekredit.
 *   Systemet: kontonavne «Ka-ching Dummy» og «ovf. C5 til Mamut» → Mamut, kontoplan fra C5.
 *
 * ROUTINGEN FØR (A's måling): filen vandt DK_ECONOMIC_RESULTATOPGOERELSE_XLSX_V1 med 85, fordi
 * «Resultatopgørelse» står som KONTO 999's navn i række 2 — og e-conomic-skabelonen fandt så
 * dækningsbidrag 2 som gross_profit og INGEN omkostningsgrupper (navnene er forkortede: «Løn I alt»,
 * «Bilomk. I alt», …). Denne skabelon scorer 95 på formen (række 0 «Saldo:», række 1 de tre
 * kolonner, sumkonti med kontonummer, stigende kontonumre), og e-conomic-XLSX'ens detect
 * trækker 100 fra når række 1 er «Kontonummer/Kontonavn/Beløb» (0 → aldrig tvetydig).
 *
 * UDTRÆKKET:
 *   - Kun konti < BALANCE_FRA (5000) er resultat. Grupperne er SUMKONTIENES NAVNE (GRUPPE_NAVNE,
 *     forkortelser med): variable omkostninger → direkte_omkostninger (cogs), løn → loenninger
 *     (payroll), salgsfremmende → salgsomkostninger (sales_costs), bilomk → autodrift (vehicle_costs),
 *     lokaleomk → lokaleomkostninger (facility_costs), administrationsomk → administrationsomkostninger
 *     (admin_costs), afskrivninger → afskrivninger (depreciation), finansielle udgifter →
 *     finansieringsudgifter (financial_costs), finansielle indtægter → finansielle_indtaegter
 *     (financial_income — vindue A's nye nøgle; findes nøglen ikke i motoren endnu, springes
 *     kandidaten stille over i SEMANTIC_TO_CANONICAL, og ebt læses stadig af sin egen linje),
 *     ekstraordinære → ekstraordinaere_poster (extraordinary_items). Subtotalerne: «Dækningsbidrag 1»
 *     → daekningsbidrag (gross_profit — IKKE «Dækningsbidrag 2», som er efter løn), «Resultat før
 *     afskrivninger» → resultat_foer_afskrivninger (ebitda), «Resultat før skat» → resultat_foer_skat
 *     (ebt), «Årets resultat» → arets_resultat (net_result; anti-match «Skat af årets resultat»).
 *   - Detaljekonti under en sumkonto uden gruppe (før «Resultat før skat») → oevrige_omkostninger
 *     (other_costs, vindue C's nøgle). Konti EFTER «Resultat før skat» (skatter) er ikke omkostninger
 *     i resultatet og holdes ude af kontrolsummen (line items alene).
 *   - En omkostningsgruppe hvis sum er en KREDIT (positiv i forretningsformatet) er en indtægt: gruppen
 *     udstedes som 0 og kreditten lægges i andre_driftsindtaegter (other_operating_income) — som C's
 *     saldobalance-skabelon. Undtagelsen er finansielle indtægter, der bærer sit eget fortegn.
 *   - KONTROLSUM (parser-tjek pnl_coverage, som C's): Σ ALLE detaljekonti før «Resultat før skat» =
 *     «Resultat før skat» inden for KONTROLSUM_TOLERANCE (1 kr.) — ANLA: 2.012.820,40 − 1.201.994,61
 *     − 537.534,54 − 97.928,69 − 100,04 − 32.863,61 − 180.712,92 − 60.547,50 − 73.414,32 − 43.968,98 =
 *     −216.244,81 på kronen. Og sum_rows_consistent: hver «I alt» = Σ sine detaljekonti.
 *   - BALANCEN (≥ 5000) som combined-skabelonen: sumkontiene ved navn — aktiver_i_alt, varelager,
 *     tilgodehavender_i_alt, likvider (cash, beholder fortegn — kassekredit er negativ), egenkapital
 *     (kredit → NEGATE), gaeld_i_alt og passiver_i_alt (kredit → NEGATE).
 *   - FORTEGN gennem profilen mamut_saldo_business_v1 (normalizationProfiles): revenue KEEP, cost
 *     NEGATE, profit KEEP, asset KEEP, liability NEGATE, equity NEGATE, cash KEEP. Ingen fortegnslogik
 *     her ud over kredit-gruppe → indtægt. KANDIDATERNES sign_convention: det der står som KREDIT
 *     i filen (omkostningsgrupper, øvrige, egenkapital, gæld, passiver — negative tal der NEGATE'res)
 *     mærkes «credit»; det der allerede har forretningens fortegn (omsætning, indtægter, subtotaler,
 *     aktiver, likvide midler — KEEP) mærkes «business». C's tjek 17 (derived_sign_preserved)
 *     kræver at en «business»-kandidat aldrig skifter fortegn — målt på ANLA's fil før rettelsen:
 *     11 kandidater fældet. Samme greb som C's saldobalance-skabelon (kredit-kandidater + business-afledte).
 *
 * PERIODEN — STOP (åbent spørgsmål til Jonas): «december saldo 2025» er tvetydig — måneden eller
 * året til dato? (7445 «Resultat år til dato −108.150,88» ≠ 4999 «Årets resultat −216.244,81» i
 * ANLA's fil, så resultatdelen ser IKKE ud til at være år-til-dato — men det er ikke afgjort.)
 * Skabelonen bærer report_period_label som TEKSTEN STÅR («december saldo 2025»), period_start og
 * period_end er null, og der bygges intet der afhænger af svaret. Konsekvens i drift: PeriodResolve
 * (extract-financial-data/index.ts) kan ikke læse en måned af teksten — perioden sættes ved
 * gennemgangen (manuel periode), til svaret foreligger og skabelonen kan udlede den.
 */

import type {
  SemanticXlsxTemplateEntry,
  DetectionContext,
  ExtractionContext,
} from "../templateRegistry.ts";
import type { XlsxParseResult } from "../xlsxRawParser.ts";
import type {
  SemanticExtractionResult,
  SemanticMetricCandidate,
  SemanticLineItem,
} from "../semanticTypes.ts";
import type { MetricFamily } from "../normalizationProfiles.ts";

export const MAMUT_TEMPLATE_ID = "DK_MAMUT_SALDO_XLSX_V1";
export const MAMUT_PROFILE_ID = "mamut_saldo_business_v1";
/** Første balancekonto — alt under er resultatet. */
export const BALANCE_FRA = 5000;
/** Kontrolsummens tolerance — 1 kr. */
export const KONTROLSUM_TOLERANCE = 1;
export const OEVRIGE_KEY = "oevrige_omkostninger";
export const ANDRE_DRIFTSINDTAEGTER_KEY = "andre_driftsindtaegter";
export const FINANSIELLE_INDTAEGTER_KEY = "finansielle_indtaegter";

const KOLONNER = ["kontonummer", "kontonavn", "beløb"] as const;

/** Er række 1 præcis de tre kolonner? (Bruges også af e-conomic-XLSX'ens værn.) */
export function erMamutKolonner(row: unknown[] | undefined): boolean {
  if (!row) return false;
  const celler = row.map((c) => (c ?? "").toString().trim().toLowerCase()).filter((c) => c !== "");
  return celler.length === 3 && celler[0] === KOLONNER[0] && celler[1] === KOLONNER[1] && celler[2] === KOLONNER[2];
}

/** Er række 0 «Saldo: …»? Returnerer teksten efter «Saldo:», ellers null. */
export function saldoTekst(row: unknown[] | undefined): string | null {
  const c = (row?.[0] ?? "").toString().trim();
  const m = c.match(/^saldo\s*:\s*(.+)$/i);
  return m ? m[1].trim() : null;
}

function tilTal(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.replace(/\./g, "").replace(",", ".").trim();
    const n = parseFloat(s);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/** Sumkonto-navne → kilde-id (SEMANTIC_TO_CANONICAL i canonicalEngine). Rækkefølgen betyder noget: første match vinder. */
export const GRUPPE_NAVNE: ReadonlyArray<{ key: string; family: MetricFamily; pattern: RegExp }> = [
  { key: "omsaetning", family: "revenue_like", pattern: /^omsætning\s+i\s*alt$/i },
  { key: "direkte_omkostninger", family: "cost_like", pattern: /^(variable\s+omkostninger|vareforbrug|direkte\s+omkostninger)\s+i\s*alt$/i },
  { key: "loenninger", family: "cost_like", pattern: /^(løn|lønninger|personale(omk\.?|omkostninger)?)\s+i\s*alt$/i },
  { key: "salgsomkostninger", family: "cost_like", pattern: /^(salgsfremmende|salgs)\s*(omk\.?|omkostninger)?\s+i\s*alt$/i },
  { key: "autodrift", family: "cost_like", pattern: /^(bil|auto)\s*(omk\.?|omkostninger|drift)?\s+i\s*alt$/i },
  { key: "lokaleomkostninger", family: "cost_like", pattern: /^lokale\s*(omk\.?|omkostninger)?\s+i\s*alt$/i },
  { key: "administrationsomkostninger", family: "cost_like", pattern: /^administrations?\s*(omk\.?|omkostninger)?\s+i\s*alt$/i },
  { key: "afskrivninger", family: "cost_like", pattern: /^afskrivninger\s+i\s*alt$/i },
  { key: "finansieringsudgifter", family: "cost_like", pattern: /^finansielle\s+(udgifter|omkostninger)\s+i\s*alt$/i },
  { key: FINANSIELLE_INDTAEGTER_KEY, family: "revenue_like", pattern: /^finansielle\s+indtægter\s+i\s*alt$/i },
  { key: "ekstraordinaere_poster", family: "cost_like", pattern: /^ekstraordinære\s+poster\s+i\s*alt$/i },
];

/** Subtotaler (ikke grupper): matches på navnet, bærer tallet direkte. Anti-match: «Skat af årets resultat». */
const SUBTOTALER: ReadonlyArray<{ key: string; pattern: RegExp; anti?: RegExp }> = [
  { key: "daekningsbidrag", pattern: /^dækningsbidrag\s*1$/i },
  { key: "resultat_foer_afskrivninger", pattern: /^resultat\s+før\s+afskrivninger$/i },
  { key: "resultat_foer_skat", pattern: /^resultat\s+før\s+skat$/i },
  { key: "arets_resultat", pattern: /^årets\s+resultat$/i, anti: /skat\s+af/i },
];

/** Balancens sumkonti ved navn → kilde-id og familie. */
const BALANCE_NAVNE: ReadonlyArray<{ key: string; family: MetricFamily; pattern: RegExp }> = [
  { key: "aktiver_i_alt", family: "asset_like", pattern: /^aktiver\s+i\s*alt$/i },
  { key: "varelager", family: "asset_like", pattern: /^varelager\s+i\s*alt$/i },
  { key: "tilgodehavender_i_alt", family: "receivable_payable_like", pattern: /^tilgodehavender\s+i\s*alt$/i },
  { key: "likvider", family: "cash_like", pattern: /^likvide\s+midler\s+i\s*alt$/i },
  { key: "egenkapital", family: "equity_like", pattern: /^egenkapital\s+i\s*alt$/i },
  { key: "gaeld_i_alt", family: "liability_like", pattern: /^gæld\s+i\s*alt$/i },
  { key: "passiver_i_alt", family: "liability_like", pattern: /^passiver\s+i\s*alt$/i },
];

/** «I alt»-sumkonto (lukker en gruppe) — ikke en subtotal. */
export const erIAlt = (navn: string): boolean => /\bi\s*alt$/i.test(navn.trim());
/** Subtotal (dækningsbidrag/resultat) — bærer et tal, lukker ingen gruppe. */
export const erSubtotal = (navn: string): boolean => /^(dækningsbidrag|resultat\b|årets\s+resultat)/i.test(navn.trim());

export interface Konto { nr: number; navn: string; beloeb: number; raekke: number }

export interface Gruppe {
  /** Sumkontoens nummer og navn. */
  nr: number;
  navn: string;
  /** Kilde-id fra GRUPPE_NAVNE, eller null (→ øvrige). */
  key: string | null;
  family: MetricFamily | null;
  /** Sumkontoens tal som det står. */
  sum: number;
  /** Detaljekontiene under den (siden forrige «I alt»). */
  konti: Konto[];
  /** Σ detaljekonti — skal være lig sum. */
  regnet: number;
}

export interface Resultatfordeling {
  grupper: Gruppe[];
  /** Subtotalernes tal ved kilde-id (daekningsbidrag, resultat_foer_afskrivninger, resultat_foer_skat, arets_resultat). */
  subtotaler: Record<string, number>;
  /** Kontonummeret på «Resultat før skat»; null når linjen mangler. */
  ebtNr: number | null;
  /** Σ ALLE detaljekonti før «Resultat før skat» — kontrolsummen mod ebt. */
  sumFoerEbt: number;
  /** Detaljekonti før ebt der ikke landede under nogen «I alt» (hængende — tælles i øvrige). */
  haengende: Konto[];
  /** Grupper hvor sum ≠ Σ konti (over tolerancen). */
  inkonsistente: Gruppe[];
}

/** Fordelingen af resultatkontiene — REN funktion, testes direkte. Forudsætter konti i kontonummer-orden. */
export function fordelResultat(konti: readonly Konto[]): Resultatfordeling {
  const grupper: Gruppe[] = [];
  const subtotaler: Record<string, number> = {};
  let aabne: Konto[] = [];
  let ebtNr: number | null = null;
  let sumFoerEbt = 0;
  let haengende: Konto[] = [];
  for (const k of konti) {
    if (k.nr >= BALANCE_FRA) break;
    const navn = k.navn.trim();
    if (erSubtotal(navn)) {
      const s = SUBTOTALER.find((x) => x.pattern.test(navn) && !(x.anti && x.anti.test(navn)));
      if (s) subtotaler[s.key] = k.beloeb;
      if (s?.key === "resultat_foer_skat") {
        ebtNr = k.nr;
        haengende = [...aabne]; // detaljekonti uden «I alt» før resultat før skat → øvrige
        aabne = [];
      }
      continue;
    }
    if (erIAlt(navn)) {
      const g = GRUPPE_NAVNE.find((x) => x.pattern.test(navn));
      grupper.push({
        nr: k.nr, navn, key: g?.key ?? null, family: g?.family ?? null, sum: k.beloeb, konti: aabne,
        regnet: aabne.reduce((a, b) => a + b.beloeb, 0),
      });
      aabne = [];
      continue;
    }
    // Detaljekonto
    if (ebtNr === null) sumFoerEbt += k.beloeb;
    aabne.push(k);
  }
  if (ebtNr === null) haengende = [...aabne];
  const inkonsistente = grupper.filter((g) => Math.abs(g.sum - g.regnet) > KONTROLSUM_TOLERANCE);
  return { grupper, subtotaler, ebtNr, sumFoerEbt, haengende, inkonsistente };
}

export const dkMamutSaldoXlsxV1: SemanticXlsxTemplateEntry = {
  template_id: MAMUT_TEMPLATE_ID,
  label: "Mamut/C5 saldoliste XLSX (resultat + balance, sumkonti med kontonummer)",
  supported_file_types: ["xlsx", "xls"],
  statement_type: "combined",

  detect(ctx: DetectionContext): number {
    if (!ctx.headerRows || ctx.headerRows.length < 4) return 0;
    if (saldoTekst(ctx.headerRows[0]) === null) return 0;
    if (!erMamutKolonner(ctx.headerRows[1])) return 0;
    let score = 50 + 30; // formen: «Saldo:» + de tre kolonner
    let sumMedNr = 0;
    let stigende = true;
    let forrige = -Infinity;
    let konti = 0;
    for (let i = 2; i < Math.min(ctx.headerRows.length, 200); i++) {
      const row = ctx.headerRows[i];
      if (!row) continue;
      const nr = tilTal(row[0]);
      if (nr === null) continue;
      konti++;
      if (nr < forrige) stigende = false;
      forrige = nr;
      const navn = (row[1] ?? "").toString();
      if (erIAlt(navn)) sumMedNr++;
    }
    if (konti < 5) return 0;
    if (sumMedNr >= 3) score += 10; // sumkonti MED kontonummer (e-conomic har ingen numre på subtotaler)
    if (stigende) score += 5;
    return score; // maks 95 — over e-conomic-XLSX'ens 85/90 og uden for tvetydighedsgabet
  },

  extract(_ctx: ExtractionContext) {
    return { success: false as const, error: "Use semantic extraction path" };
  },

  extractSemanticFromXlsx(xlsxResult: XlsxParseResult): SemanticExtractionResult | null {
    const LOG = `[${MAMUT_TEMPLATE_ID}]`;
    const raekke = (i: number): unknown[] => {
      const r = xlsxResult.rows[i];
      if (!r) return [];
      const ud: unknown[] = [];
      for (const c of r.cells) ud[c.col_index] = c.raw_value;
      return ud;
    };
    const periodeTekst = saldoTekst(raekke(0));
    if (periodeTekst === null || !erMamutKolonner(raekke(1))) {
      console.log(`${LOG} Række 0/1 har ikke formen → reject`);
      return null;
    }

    // ── Kontolinjerne ──
    const konti: Konto[] = [];
    const lineItems: SemanticLineItem[] = [];
    for (const row of xlsxResult.rows) {
      if (row.row_index < 2) continue;
      const celler = raekke(row.row_index);
      const nr = tilTal(celler[0]);
      if (nr === null) continue;
      const navn = (celler[1] ?? "").toString().trim();
      const beloeb = tilTal(celler[2]) ?? 0;
      konti.push({ nr, navn, beloeb, raekke: row.row_index });
      lineItems.push({
        source_field_id: `acct_${nr}`,
        source_label: `${nr} ${navn}`,
        raw_value: beloeb,
        basis: "period",
        account_no: String(nr),
        source_row_index: row.row_index,
      });
    }
    if (konti.length < 5) {
      console.log(`${LOG} Kun ${konti.length} konti → reject`);
      return null;
    }

    const fordeling = fordelResultat(konti);
    const kandidater: SemanticMetricCandidate[] = [];
    // sign_convention pr. kandidat: «credit» for det der NEGATE'res (kredit-side), «business» for det der KEEP'es (filhovedet, tjek 17).
    const kandidat = (over: Pick<SemanticMetricCandidate, "source_field_id" | "normalization_family" | "raw_value" | "source_label" | "confidence" | "evidence"> & Partial<SemanticMetricCandidate>): SemanticMetricCandidate => ({
      sign_convention: "business",
      source_row_index: null,
      source_column_slot: 2,
      source_cell_address: null,
      basis: "period",
      proposed_canonical_target: null,
      ...over,
      raw_sign: over.raw_value == null ? "zero" : over.raw_value > 0 ? "positive" : over.raw_value < 0 ? "negative" : "zero",
    });

    // ── Grupperne ──
    let andreDriftsindtaegter = 0;
    const andreFra: string[] = [];
    let oevrige = 0;
    const oevrigeFra: string[] = [];
    // Finansielle poster lægges sammen: «Finansielle udgifter I alt» + en NEGATIV «Finansielle indtægter I alt».
    // MÅLT 17/9 (aften) på ANLA's fil: «Finansielle indtægter I alt» = −73.414,32 er en UDGIFT med indtægtens navn
    // (forretningsformat: negativ = udgift). Udstedt som finansielle_indtaegter med eget fortegn lagde motorens
    // kontrolsum (omkostningsnoegler.kontrolsum, |financial_income|) den TIL i stedet for at trække den fra →
    // udaekket −146.829 (= 2 × 73.414). Nu: en negativ indtægtsgruppe er finansielle omkostninger; kun en
    // positiv er finansielle indtægter. Kontrolsummen er 0 på ANLA's fil (README).
    let finansOmk = 0;
    const finansFra: string[] = [];
    for (const g of fordeling.grupper) {
      if (fordeling.ebtNr !== null && g.nr > fordeling.ebtNr) continue; // skatter mv. efter resultat før skat — ikke omkostninger i resultatet
      if (g.key === null) {
        oevrige += g.sum;
        oevrigeFra.push(`${g.nr} ${g.navn}`);
        continue;
      }
      if (g.key === "finansieringsudgifter") {
        finansOmk += g.sum;
        finansFra.push(`${g.nr} ${g.navn}:${g.sum}`);
        continue;
      }
      if (g.key === FINANSIELLE_INDTAEGTER_KEY && g.sum < 0) {
        finansOmk += g.sum;
        finansFra.push(`${g.nr} ${g.navn}:${g.sum} (income group net is an expense)`);
        continue;
      }
      if (g.family === "revenue_like") {
        kandidater.push(kandidat({
          source_field_id: g.key, normalization_family: "revenue_like", raw_value: g.sum,
          source_label: `${g.nr} ${g.navn}`, confidence: "HIGH", source_row_index: null,
          evidence: [`sum_account:${g.nr}`, `accounts:${g.konti.length}`, "sign_rule:keep"],
        }));
        continue;
      }
      // Omkostningsgruppe: negativ i forretningsformatet → profilen NEGATE'r. En kredit (positiv) er en indtægt.
      if (g.sum > 0) {
        andreDriftsindtaegter += g.sum;
        andreFra.push(`${g.nr} ${g.navn}:${g.sum}`);
        kandidater.push(kandidat({
          source_field_id: g.key, normalization_family: "cost_like", raw_value: 0, sign_convention: "credit",
          source_label: `${g.nr} ${g.navn}`, confidence: "HIGH",
          evidence: [`sum_account:${g.nr}`, `credit_net_moved_to:${ANDRE_DRIFTSINDTAEGTER_KEY}`, `net:${g.sum}`],
        }));
        continue;
      }
      kandidater.push(kandidat({
        source_field_id: g.key, normalization_family: "cost_like", raw_value: g.sum, sign_convention: "credit",
        source_label: `${g.nr} ${g.navn}`, confidence: "HIGH",
        evidence: [`sum_account:${g.nr}`, `accounts:${g.konti.length}`, "sign_rule:negate"],
      }));
    }
    if (finansFra.length > 0) {
      if (finansOmk > 0) {
        // Netto en indtægt (udgiftsgruppen er en kredit) → 0 omkostning, beløbet som finansiel indtægt
        kandidater.push(kandidat({
          source_field_id: FINANSIELLE_INDTAEGTER_KEY, normalization_family: "revenue_like", raw_value: finansOmk,
          source_label: "aggregated:finansielle_indtaegter (financial groups net is an income)", confidence: "HIGH", evidence: finansFra,
        }));
        finansOmk = 0;
      }
      kandidater.push(kandidat({
        source_field_id: "finansieringsudgifter", normalization_family: "cost_like", raw_value: finansOmk, sign_convention: "credit",
        source_label: "aggregated:finansieringsudgifter (finansielle udgifter + negativ finansiel indtægt)", confidence: "HIGH",
        evidence: [...finansFra, "sign_rule:negate"],
      }));
    }
    // Hængende detaljekonti (uden «I alt» før resultat før skat) → øvrige.
    for (const k of fordeling.haengende) {
      oevrige += k.beloeb;
      oevrigeFra.push(`${k.nr} ${k.navn}`);
    }
    if (oevrigeFra.length > 0) {
      if (oevrige > 0) {
        andreDriftsindtaegter += oevrige;
        andreFra.push(`${OEVRIGE_KEY}:${oevrige}`);
        oevrige = 0;
      }
      kandidater.push(kandidat({
        source_field_id: OEVRIGE_KEY, normalization_family: "cost_like", raw_value: oevrige, sign_convention: "credit",
        source_label: "aggregated:oevrige_omkostninger (sum accounts outside named groups, before Resultat før skat)", confidence: "MEDIUM",
        evidence: oevrigeFra.map((x) => `from:${x}`),
      }));
    }
    if (andreDriftsindtaegter > 0) {
      kandidater.push(kandidat({
        source_field_id: ANDRE_DRIFTSINDTAEGTER_KEY, normalization_family: "revenue_like", raw_value: andreDriftsindtaegter,
        source_label: "aggregated:andre_driftsindtaegter (cost groups whose sum is a credit)", confidence: "HIGH",
        evidence: andreFra, proposed_canonical_target: "other_operating_income",
      }));
    }

    // ── Subtotalerne (profit_like, KEEP) ──
    for (const [key, v] of Object.entries(fordeling.subtotaler)) {
      kandidater.push(kandidat({
        source_field_id: key, normalization_family: "profit_like", raw_value: v,
        source_label: `subtotal:${key}`, confidence: "HIGH", evidence: ["subtotal_row", "sign_rule:keep"],
      }));
    }

    // ── Balancen (≥ BALANCE_FRA) — sumkontiene ved navn ──
    const balanceFundet: string[] = [];
    for (const k of konti) {
      if (k.nr < BALANCE_FRA) continue;
      const b = BALANCE_NAVNE.find((x) => x.pattern.test(k.navn));
      if (!b) continue;
      balanceFundet.push(b.key);
      kandidater.push(kandidat({
        source_field_id: b.key, normalization_family: b.family, raw_value: k.beloeb,
        sign_convention: b.family === "equity_like" || b.family === "liability_like" ? "credit" : "business",
        source_label: `${k.nr} ${k.navn}`, confidence: "HIGH", source_row_index: k.raekke,
        evidence: [`sum_account:${k.nr}`, `family:${b.family}`],
      }));
    }

    // ── Parser-tjek ──
    const checks: SemanticExtractionResult["parser_validation"]["checks"] = [];
    const harOms = fordeling.grupper.some((g) => g.key === "omsaetning");
    checks.push({ name: "revenue_present", result: harOms ? "PASS" : "FAIL", details: harOms ? "Omsætning I alt fundet" : "Ingen «Omsætning I alt»" });
    const ebt = fordeling.subtotaler["resultat_foer_skat"];
    checks.push({ name: "ebt_present", result: ebt != null ? "PASS" : "FAIL", details: ebt != null ? `Resultat før skat ${ebt}` : "Ingen «Resultat før skat»" });
    const konsistent = fordeling.inkonsistente.length === 0;
    checks.push({
      name: "sum_rows_consistent", result: konsistent ? "PASS" : "FAIL",
      details: konsistent
        ? `Alle ${fordeling.grupper.length} «I alt»-konti = Σ deres detaljekonti (tolerance ${KONTROLSUM_TOLERANCE} kr.)`
        : `Sumkonti der ikke stemmer: ${fordeling.inkonsistente.map((g) => `${g.nr} ${g.navn} (${g.sum} ≠ ${g.regnet.toFixed(2)})`).join(", ")}`,
    });
    const afvigelse = ebt != null ? fordeling.sumFoerEbt - ebt : null;
    const daekket = afvigelse != null && Math.abs(afvigelse) <= KONTROLSUM_TOLERANCE;
    const antalDetaljer = fordeling.grupper.filter((g) => fordeling.ebtNr === null || g.nr < fordeling.ebtNr).reduce((s, g) => s + g.konti.length, 0) + fordeling.haengende.length;
    checks.push({
      name: "pnl_coverage", result: daekket ? "PASS" : "FAIL",
      details: daekket
        ? `All ${antalDetaljer} P&L accounts before Resultat før skat sum to ebt ${ebt} (diff ${afvigelse!.toFixed(2)})`
        : afvigelse == null ? "No ebt row to reconcile against" : `P&L coverage broken: Σ accounts ${fordeling.sumFoerEbt.toFixed(2)} vs ebt ${ebt} (diff ${afvigelse.toFixed(2)} kr., tolerance ${KONTROLSUM_TOLERANCE})`,
    });
    const harBalance = balanceFundet.includes("aktiver_i_alt");
    checks.push({ name: "balance_present", result: harBalance ? "PASS" : "FAIL", details: harBalance ? `Balance: ${balanceFundet.join(", ")}` : "Ingen «Aktiver I alt»" });
    checks.push({ name: "period_label_as_text", result: "PASS", details: `Perioden bæres som teksten står: «${periodeTekst}» — måned/år-til-dato er ikke afgjort (filhovedet)` });
    const parserStatus = checks.some((c) => c.result === "FAIL") ? "FAIL" as const : "PASS" as const;

    console.log(`${LOG} ${konti.length} konti, ${fordeling.grupper.length} grupper, ${kandidater.length} kandidater; ebt ${ebt}; coverage ${daekket}`);

    return {
      source_system: "mamut",
      document_type: "combined",
      template_id: MAMUT_TEMPLATE_ID,
      sign_convention: "business",
      normalization_profile_id: MAMUT_PROFILE_ID,
      company_name: null,
      cvr: null,
      period_start: null,
      period_end: null,
      report_period_label: periodeTekst,
      metric_candidates: kandidater,
      line_items: lineItems,
      basis_profile: { mode: "single", selected_period_basis: "period" },
      parser_validation: { parser_status: parserStatus, checks },
      _deterministic_meta: {
        template_id: MAMUT_TEMPLATE_ID,
        parser_confidence: parserStatus === "PASS" ? "HIGH" : "MEDIUM",
        detection_score: 0,
        raw_line_count: xlsxResult.rows.length,
        normalized_line_count: kandidater.length,
        column_basis_rule: "single",
      },
    };
  },
};
