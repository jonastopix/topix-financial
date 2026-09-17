/**
 * subtotalGrupper.ts — fordelingen af SUBTOTAL-rækker («… i alt») i de to XLSX-skabeloner der læser
 * grupper, ikke konti: DK_ECONOMIC_RESULTATOPGOERELSE_XLSX_V1 og DK_COMBINED_BALANCE_PNL_V1.
 * Søster til kontogrupper.ts (Dinero/generic, konti) — samme dom, 17/9-2026, C's mønster:
 *
 *   1. FINANSIELLE INDTÆGTER: «Renteindtægter i alt» / «Finansielle indtægter i alt» (målt: Floren
 *      Engros' e-conomic-udskrift, A's README §2; e-conomics standardkontoplan) → finansielle_indtaegter
 *      (financial_income, vindue A's nøgle). Flere rækker lægges sammen.
 *   2. ØVRIGE OMKOSTNINGER: «Andre eksterne omkostninger i alt», «Fremmed arbejde i alt»,
 *      «Underleverandører i alt», «Øvrige/Andre omkostninger i alt» → oevrige_omkostninger (other_costs,
 *      vindue C's nøgle). Lægges sammen. Etiketterne er Jonas' tre navne (17/9) + e-conomics standard;
 *      MÅLINGEN (SQL i README'en) bekræfter/udvider listen før indlægning.
 *   3. KREDIT-NETTO i en omkostningsgruppe (fx lokaler med lejeindtægt): gruppen udstedes som 0 og
 *      beløbet lægges i andre_driftsindtaegter (other_operating_income). Før: profilernes ABS gjorde
 *      indtægten til en omkostning af samme størrelse.
 *   4. GRUPPER UDEN NØGLE: en «… i alt»-række FØR resultatlinjen, som ingen matcher kender, kan være en
 *      gruppe (fremmed arbejde) ELLER en forældre-subtotal («Personaleomkostninger i alt» over «Lønninger
 *      i alt»). At summere blindt ville tælle forældre dobbelt. Derfor dømmer FILENS EGEN RESULTATLINJE:
 *      gab = resultat − (omsætning + Σ kendte grupper, forretningsfortegn). Er gabet ≤ 1 kr, mangler
 *      intet. Ellers: lukker de ukendte rækker tilsammen gabet (± 1 kr), er de alle blade → øvrige;
 *      lukker én af dem gabet alene, er den bladet → øvrige. Ellers står de UAFKLAREDE i tjekket
 *      pnl_coverage (SKIP med gabet og rækkerne) — det er målingens krog, ikke en FAIL: en FAIL ville
 *      strande de filer der i dag går igennem med et hul i omkostningsbilledet (D's ebt_reconciles-WARN
 *      viser hullet for medlemmet).
 *   5. KONTROLSUMMEN her er ÆGTE evidens (til forskel fra kontogrupper.ts): filen har sin egen
 *      resultatlinje, og «omsætning − grupper + indtægter = resultat» kan fejle. PASS = alle grupper
 *      fanget, SKIP = hul (med tal).
 *
 * Skat, moms og balancerækker (efter resultatlinjen eller med balance-ord) er aldrig grupper.
 * «unknown»-konvention regnes som forretningsfortegn (som getEffectiveSignRule i XLSX-skabelonen).
 */

import type { MetricFamily } from "./normalizationProfiles.ts";

export type FilKonvention = "credit" | "business" | "unknown";

export const FINANSIELLE_INDTAEGTER_RE = /^(finansielle\s*indtægter|renteindtægter|rente\s*indtægter)\s*(i\s*alt|ialt)?$/i;
export const OEVRIGE_OMKOSTNINGER_RE = /^(andre\s*eksterne\s*omkostninger|fremmed\s*arbejde|underleverandører?|øvrige\s*omkostninger|andre\s*omkostninger)\s*(i\s*alt|ialt)?$/i;
/** Udvidet finansiel omkostning: «Renteudgifter i alt» (Floren, målt), «Finansielle udgifter I alt» (ANLA, målt). */
export const FINANSIERINGSUDGIFTER_RE = /^(finansierings(udgifter|omkostninger)|finansielle\s*(udgifter|omkostninger)|renteudgifter|rente\s*udgifter)\s*(i\s*alt|ialt)?$/i;

const EBT_KEYS = ["resultat_foer_skat", "resultat_foer_ekstraordinaere", "periodens_resultat", "arets_resultat"];
const IKKE_GRUPPE_RE = /moms|skat|aktiver|passiver|egenkapital|gæld|tilgodehavender|likvide|beholdning|anlæg|hensættelse|mellemregning|balance|kapital/i;
const SUBTOTAL_RE = /i\s*alt|ialt/i;
export const GAB_TOLERANCE = 1;

export interface GruppeRaekke {
  label: string;
  rawValue: number | null;
  rowIndex: number;
  cellAddress: string | null;
  /** Skabelonens egen første matcher — null når ingen. */
  key: string | null;
  family: MetricFamily | null;
  /** Skabelonens matcher-bevis (label_match:…, pattern:…). */
  evidence: string[];
}

export interface GruppeKandidat {
  key: string;
  family: MetricFamily;
  rawValue: number | null;
  rowIndex: number | null;
  cellAddress: string | null;
  label: string;
  signConvention: "credit" | "business" | "unknown";
  evidence: string[];
}

export interface SubtotalFordeling {
  kandidater: GruppeKandidat[];
  /** «… i alt»-rækker før resultatlinjen uden nøgle, som resultatlinjen ikke kunne bevise som blade. */
  uafklarede: { label: string; rowIndex: number; rawValue: number | null }[];
  kontrolsum: { name: "pnl_coverage"; result: "PASS" | "SKIP"; details: string };
}

const tilBus = (k: FilKonvention, v: number): number => (k === "credit" ? -v : v);

/**
 * Fordelingen. `duplikat`: hvad skabelonen gør ved to rækker med samme (ikke-aggregerede) nøgle —
 * XLSX-P&L lod den sidste vinde, combined den første; det bevares.
 */
export function fordelSubtotaler(rows: readonly GruppeRaekke[], konvention: FilKonvention, duplikat: "first" | "last"): SubtotalFordeling {
  const ebtRow = rows.find((r) => r.key === "resultat_foer_skat") ?? rows.find((r) => r.key != null && EBT_KEYS.includes(r.key));
  const ebtRowIndex = ebtRow ? ebtRow.rowIndex : Number.POSITIVE_INFINITY;

  const kandidater: GruppeKandidat[] = [];
  const seen = new Set<string>();
  const finRows: GruppeRaekke[] = [];
  const oevrigeRows: GruppeRaekke[] = [];
  const ukendte: GruppeRaekke[] = [];
  let andre = 0;
  const kreditGrupper: string[] = [];
  const sigtLeaf: number[] = []; // forretningsfortegn for alle fangede grupper (ikke-profit, før resultatlinjen)

  const push = (r: GruppeRaekke, key: string, family: MetricFamily, rawValue: number | null, extraEvidence: string[] = []) => {
    if (duplikat === "first" && seen.has(key)) return;
    if (duplikat === "last") {
      const idx = kandidater.findIndex((k) => k.key === key);
      if (idx >= 0) kandidater.splice(idx, 1);
    }
    seen.add(key);
    kandidater.push({ key, family, rawValue, rowIndex: r.rowIndex, cellAddress: r.cellAddress, label: r.label, signConvention: konvention, evidence: [...r.evidence, ...extraEvidence] });
  };

  for (const r of rows) {
    if (r.key == null || r.family == null) {
      if (r.rawValue != null && r.rowIndex < ebtRowIndex && SUBTOTAL_RE.test(r.label) && !IKKE_GRUPPE_RE.test(r.label)) ukendte.push(r);
      continue;
    }
    if (r.key === "finansielle_indtaegter") { finRows.push(r); continue; }
    if (r.key === "oevrige_omkostninger") { oevrigeRows.push(r); continue; }
    if (r.family === "cost_like" && r.rawValue != null && r.rowIndex < ebtRowIndex && tilBus(konvention, r.rawValue) > 0) {
      // Kredit-netto i en omkostningsgruppe → 0 her, beløbet i andre driftsindtægter
      const b = tilBus(konvention, r.rawValue);
      push(r, r.key, r.family, 0, [`credit_net:${r.rawValue} → other_operating_income ${b.toFixed(2)}`]);
      andre += b;
      kreditGrupper.push(r.key);
      if (r.key === "resultat_foer_skat") { /* aldrig cost_like */ }
      sigtLeaf.push(b);
      continue;
    }
    push(r, r.key, r.family, r.rawValue);
    if (r.family !== "profit_like" && (r.family === "cost_like" || r.family === "revenue_like") && r.rawValue != null && r.rowIndex < ebtRowIndex) {
      sigtLeaf.push(tilBus(konvention, r.rawValue));
    }
  }

  // Finansielle indtægter — summen i FILENS fortegn (profilen vender/abs'er revenue_like)
  if (finRows.length > 0) {
    const sum = finRows.reduce((s, r) => s + (r.rawValue ?? 0), 0);
    const first = finRows[0];
    kandidater.push({ key: "finansielle_indtaegter", family: "revenue_like", rawValue: sum, rowIndex: first.rowIndex, cellAddress: finRows.length === 1 ? first.cellAddress : null,
      label: finRows.map((r) => r.label).join(" + "), signConvention: konvention, evidence: [...first.evidence, `aggregated:${finRows.length} rows`] });
    sigtLeaf.push(tilBus(konvention, sum));
  }

  // Grupper uden nøgle — filens egen resultatlinje dømmer om de er blade
  const uafklarede: SubtotalFordeling["uafklarede"] = [];
  let bevisteUkendte: GruppeRaekke[] = [];
  let gab: number | null = null;
  const revenueRow = rows.find((r) => r.key === "omsaetning" && r.rawValue != null);
  if (ebtRow && ebtRow.rawValue != null && revenueRow) {
    const ebtB = tilBus(konvention, ebtRow.rawValue);
    const kendtOevrige = oevrigeRows.reduce((s, r) => s + tilBus(konvention, r.rawValue ?? 0), 0);
    const kendt = sigtLeaf.reduce((s, v) => s + v, 0) + kendtOevrige;
    gab = ebtB - kendt;
    if (Math.abs(gab) > GAB_TOLERANCE && ukendte.length > 0) {
      const sumUkendte = ukendte.reduce((s, r) => s + tilBus(konvention, r.rawValue ?? 0), 0);
      if (Math.abs(sumUkendte - gab) <= GAB_TOLERANCE) {
        bevisteUkendte = [...ukendte];
      } else {
        const alene = ukendte.find((r) => Math.abs(tilBus(konvention, r.rawValue ?? 0) - gab!) <= GAB_TOLERANCE);
        if (alene) bevisteUkendte = [alene];
      }
      gab -= bevisteUkendte.reduce((s, r) => s + tilBus(konvention, r.rawValue ?? 0), 0);
    }
  }
  for (const r of ukendte) {
    if (!bevisteUkendte.includes(r)) uafklarede.push({ label: r.label, rowIndex: r.rowIndex, rawValue: r.rawValue });
  }

  // Øvrige omkostninger — de matchede + de beviste; kredit-netto → 0 + andre driftsindtægter
  const alleOevrige = [...oevrigeRows, ...bevisteUkendte];
  if (alleOevrige.length > 0) {
    const sum = alleOevrige.reduce((s, r) => s + (r.rawValue ?? 0), 0);
    const b = tilBus(konvention, sum);
    const first = alleOevrige[0];
    const evidence = [
      ...first.evidence,
      `aggregated:${alleOevrige.length} rows`,
      ...bevisteUkendte.map((r) => `proven_by_result_line:${r.label}`),
    ];
    if (b > 0) {
      andre += b;
      kreditGrupper.push("oevrige_omkostninger");
      evidence.push(`credit_net:${sum} → other_operating_income ${b.toFixed(2)}`);
    }
    kandidater.push({ key: "oevrige_omkostninger", family: "cost_like", rawValue: b > 0 ? 0 : sum, rowIndex: first.rowIndex,
      cellAddress: alleOevrige.length === 1 ? first.cellAddress : null, label: alleOevrige.map((r) => r.label).join(" + "), signConvention: konvention, evidence });
  }

  if (andre > 0) {
    kandidater.push({ key: "andre_driftsindtaegter", family: "revenue_like", rawValue: andre, rowIndex: null, cellAddress: null,
      label: "andre driftsindtægter (kredit-netto i omkostningsgrupper)", signConvention: "business",
      evidence: [`credit_groups:${kreditGrupper.join(",")}`] });
  }

  let kontrolsum: SubtotalFordeling["kontrolsum"];
  if (gab == null) {
    kontrolsum = { name: "pnl_coverage", result: "SKIP", details: "No result line or no revenue — nothing to reconcile" };
  } else if (Math.abs(gab) <= GAB_TOLERANCE) {
    kontrolsum = { name: "pnl_coverage", result: "PASS", details: `Revenue − groups + income = result (gap ${gab.toFixed(2)})${bevisteUkendte.length ? `; unmatched groups proven by result line: ${bevisteUkendte.map((r) => r.label).join(", ")}` : ""}${kreditGrupper.length ? `; credit groups → income: ${kreditGrupper.join(", ")}` : ""}` };
  } else {
    kontrolsum = { name: "pnl_coverage", result: "SKIP", details: `Groups not captured: gap ${gab.toFixed(2)} (business sign) between result line and revenue − groups + income${uafklarede.length ? `; unmatched subtotals: ${uafklarede.map((r) => `${r.label} (${r.rawValue})`).join(", ")}` : "; no unmatched subtotals seen"}` };
  }

  return { kandidater, uafklarede, kontrolsum };
}
