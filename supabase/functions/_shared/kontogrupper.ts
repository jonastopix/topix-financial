/**
 * kontogrupper.ts — fordelingen af KLASSIFICEREDE kontolinjer til omkostningsgrupper, med fortegn.
 * Fælles for de tre skabeloner der summerer kontointervaller: DK_DINERO_RESULTATOPGOERELSE_V1 (CSV,
 * begge veje), DK_DINERO_RESULTATOPGOERELSE_PDF_V1 og DK_GENERIC_RESULTATOPGOERELSE_PDF_V1.
 * Bygget 17/9-2026 efter C's rettelse af saldobalance-XLSX'en (dkEconomicSaldobalanceXlsxV1.
 * fordelResultatkonti): «netto med fortegn, kredit-netto i en omkostningsgruppe → andre
 * driftsindtægter, fuld dækning, kontrolsum».
 *
 * FØR (målt i de tre skabeloner, `Math.abs(sums[cls])` pr. klasse): hver klasses NETTO blev abs'et —
 * en klasse hvis netto var en KREDIT (fx lejeindtægt i lokalegruppen, eller renteindtægter i
 * financial_costs-klassen, som Dinero-etiketterne lægger dér) blev en OMKOSTNING af samme størrelse:
 * dobbelttælling (indtægten forsvandt OG en falsk omkostning kom til). Og linjer uden klasse
 * (uklassificerede og tvetydige) blev SPRUNGET OVER — omkostningsbilleder var hullede.
 *
 * NU:
 *   - Alle beløb regnes om til FORRETNINGSFORTEGN (tilBusiness): i kreditkonvention er
 *     omsætning negativ og omkostninger positive → vendes; i forretningskonvention beholdes.
 *   - Omsætningen er nettoen som den er (en debet-netto bliver negativ og fanges af motorens
 *     suspicious_sign_pattern — ikke abs'et væk).
 *   - Hver omkostningsklasse udstedes som sin POSITIVE del; er nettoen en kredit (indtægt), udstedes
 *     klassen som 0 og kreditten lægges i andre_driftsindtaegter (other_operating_income) — for
 *     financial_costs-klassen i finansielle_indtaegter (financial_income, vindue A's nøgle), fordi
 *     Dinero-etiketten «renteindtægt» ligger i den klasse.
 *   - Uklassificerede OG tvetydige linjer → oevrige_omkostninger (other_costs, vindue C's nøgle), så
 *     ingen linje tabes. Tvetydigheden bliver stående som parser-tjek (skabelonen), men ebt regnes.
 *   - Skat (klassen tax) ligger EFTER resultat før skat og tæller ikke i ebt; net_result = ebt − skat.
 *   - ebt = dækningsbidrag − Σ omkostningsgrupper (positive dele) − afskrivninger − finansielle
 *     omkostninger + andre driftsindtægter + finansielle indtægter.
 *   - KONTROLSUMMEN (kontrolsum.afvigelse): Σ ALLE linjer (forretningsfortegn, ekskl. skat) − ebt.
 *     MÅLT: den er 0 på øren PR. KONSTRUKTION — ebt er samme sum arrangeret i grupper. Den beviser
 *     derfor ikke at tallene er rigtige (Dinero/generic har ingen egen resultatlinje at måle mod);
 *     den beviser at HVER linje tæller PRÆCIS én gang — dvs. at ingen linje springes over (det gamle
 *     hul), og at kredit-nettoer ikke tælles dobbelt. Den står som parser-tjek pnl_coverage af netop
 *     den grund, og fælder hvis nogen genindfører et `continue` for uklassificerede linjer.
 *
 * Dækningsbidrag kræver stadig både omsætning og vareforbrug (som før: null → ebt null → ebt_present
 * FAIL); afskrivninger og finansielle omkostninger er 0 når ingen linje matcher (som før).
 */

export type Konvention = "CREDIT" | "BUSINESS";

export interface GruppeLinje {
  /** Klassen: revenue, cogs, payroll, sales_costs, facility_costs, vehicle_costs, admin_costs, depreciation, financial_costs, tax — eller «unclassified». */
  cls: string;
  /** Beløbet som det står i dokumentet (dokumentets fortegn). */
  rawAmount: number;
  /** Tvetydig etiket (to klasser matchede) — tælles i øvrige, men markeres. */
  ambiguous?: boolean;
}

export const OEVRIGE_CLS = "other_costs";
export const OMKOSTNINGSKLASSER = ["cogs", "payroll", "sales_costs", "facility_costs", "vehicle_costs", "admin_costs", OEVRIGE_CLS, "depreciation", "financial_costs"] as const;
/** Driftsomkostningerne i ebitda (uden vareforbrug, afskrivninger og finans). */
export const DRIFTSKLASSER = ["payroll", "sales_costs", "facility_costs", "vehicle_costs", "admin_costs", OEVRIGE_CLS] as const;
export const KONTROLSUM_TOLERANCE = 0.01;

export interface GruppeFordeling {
  konvention: Konvention;
  /** Netto pr. klasse i FORRETNINGSFORTEGN (omsætning positiv, omkostninger negative), inkl. other_costs og tax. */
  netto: Record<string, number>;
  antal: Record<string, number>;
  /** Omsætningen (forretningsfortegn); null uden omsætningslinjer. */
  revenue: number | null;
  /** Omkostningsgruppernes POSITIVE del pr. klasse (0 når nettoen er en kredit). Kun klasser med linjer. */
  omkostninger: Record<string, number>;
  /** Σ kredit-nettoer i drifts-/vareforbrugs-/afskrivningsgrupper (positivt tal). */
  andreDriftsindtaegter: number;
  /** Kredit-netto i financial_costs-klassen (positivt tal) — finansielle indtægter. */
  finansielleIndtaegter: number;
  /** Klasser hvis kredit-netto er flyttet (til andre driftsindtægter / finansielle indtægter). */
  kreditKlasser: string[];
  /** Skat (positivt tal); null uden linjer. */
  skat: number | null;
  grossProfit: number | null;
  ebitda: number | null;
  ebit: number | null;
  ebt: number | null;
  netResult: number | null;
  /** Σ alle linjer (forretningsfortegn, ekskl. skat) og afvigelsen mod ebt — 0 pr. konstruktion (se filhovedet). */
  kontrolsum: { sumAlleLinjer: number; afvigelse: number | null };
  antalLinjer: number;
  antalUklassificerede: number;
  antalTvetydige: number;
}

export const tilBusiness = (konvention: Konvention, v: number): number => (konvention === "CREDIT" ? -v : v);

/** Fordelingen — REN funktion, testes direkte. */
export function fordelKontogrupper(linjer: readonly GruppeLinje[], konvention: Konvention): GruppeFordeling {
  const netto: Record<string, number> = {};
  const antal: Record<string, number> = {};
  let sumAlle = 0;
  let uklassificerede = 0;
  let tvetydige = 0;
  for (const l of linjer) {
    const cls = l.cls === "unclassified" ? OEVRIGE_CLS : l.cls;
    if (l.cls === "unclassified") uklassificerede++;
    if (l.ambiguous) tvetydige++;
    const b = tilBusiness(konvention, l.rawAmount);
    netto[cls] = (netto[cls] || 0) + b;
    antal[cls] = (antal[cls] || 0) + 1;
    if (cls !== "tax") sumAlle += b;
  }
  const revenue = netto["revenue"] != null ? netto["revenue"] : null;
  const omkostninger: Record<string, number> = {};
  let andre = 0;
  let finIndt = 0;
  const kreditKlasser: string[] = [];
  for (const cls of OMKOSTNINGSKLASSER) {
    if (netto[cls] == null) continue;
    const b = netto[cls];
    if (b <= 0) {
      omkostninger[cls] = -b;
    } else {
      omkostninger[cls] = 0;
      kreditKlasser.push(cls);
      if (cls === "financial_costs") finIndt += b;
      else andre += b;
    }
  }
  const cogs = omkostninger["cogs"];
  const grossProfit = revenue != null && cogs != null ? revenue - cogs : null;
  const drift = DRIFTSKLASSER.reduce((s, k) => s + (omkostninger[k] || 0), 0);
  const ebitda = grossProfit != null ? grossProfit - drift + andre : null;
  const depreciation = omkostninger["depreciation"] ?? 0;
  const ebit = ebitda != null ? ebitda - depreciation : null;
  const financialCosts = omkostninger["financial_costs"] ?? 0;
  const ebt = ebit != null ? ebit - financialCosts + finIndt : null;
  const skat = netto["tax"] != null ? -netto["tax"] : null;
  const netResult = ebt != null ? (skat != null ? ebt - skat : ebt) : null;
  // Kontrolsummen: 0 pr. konstruktion — beviser at hver linje tæller én gang (filhovedet).
  const afvigelse = ebt != null ? sumAlle - ebt : null;
  return {
    konvention, netto, antal, revenue, omkostninger, andreDriftsindtaegter: andre, finansielleIndtaegter: finIndt, kreditKlasser, skat,
    grossProfit, ebitda, ebit, ebt, netResult,
    kontrolsum: { sumAlleLinjer: sumAlle, afvigelse },
    antalLinjer: linjer.length, antalUklassificerede: uklassificerede, antalTvetydige: tvetydige,
  };
}

/** key_figures (danske nøgler → KF_TO_CANONICAL) af en fordeling — til de tre legacy-veje. */
export function keyFiguresAf(f: GruppeFordeling): Record<string, number | null> {
  const o = (cls: string): number | null => (f.omkostninger[cls] != null ? f.omkostninger[cls] : null);
  return {
    omsaetning: f.revenue,
    direkte_omkostninger: o("cogs"),
    daekningsbidrag: f.grossProfit,
    loenninger: o("payroll"),
    salgsomkostninger: o("sales_costs"),
    lokaleomkostninger: o("facility_costs"),
    administrationsomkostninger: o("admin_costs"),
    transportomkostninger: o("vehicle_costs"),
    oevrige_omkostninger: o(OEVRIGE_CLS),
    andre_driftsindtaegter: f.andreDriftsindtaegter > 0 ? f.andreDriftsindtaegter : null,
    resultat_foer_afskrivninger: f.ebitda,
    afskrivninger: f.omkostninger["depreciation"] ?? 0,
    finansielle_omkostninger: f.omkostninger["financial_costs"] ?? 0,
    finansielle_indtaegter: f.finansielleIndtaegter > 0 ? f.finansielleIndtaegter : null,
    resultat_foer_skat: f.ebt,
    resultat_efter_skat: f.netResult,
  };
}

/** Parser-tjekket pnl_coverage af en fordeling. */
export function kontrolsumTjek(f: GruppeFordeling): { name: string; result: "PASS" | "FAIL" | "SKIP"; details: string } {
  if (f.kontrolsum.afvigelse == null) return { name: "pnl_coverage", result: "SKIP", details: "No ebt (missing revenue or cogs) — nothing to reconcile" };
  const ok = Math.abs(f.kontrolsum.afvigelse) <= KONTROLSUM_TOLERANCE;
  return {
    name: "pnl_coverage",
    result: ok ? "PASS" : "FAIL",
    details: ok
      ? `All ${f.antalLinjer} lines counted once (${f.antalUklassificerede} → other_costs; credit groups → income: ${f.kreditKlasser.join(", ") || "none"}); Σ lines ${f.kontrolsum.sumAlleLinjer.toFixed(2)} = ebt ${f.ebt!.toFixed(2)}`
      : `Coverage broken: Σ lines ${f.kontrolsum.sumAlleLinjer.toFixed(2)} vs ebt ${f.ebt!.toFixed(2)} (diff ${f.kontrolsum.afvigelse.toFixed(2)})`,
  };
}
