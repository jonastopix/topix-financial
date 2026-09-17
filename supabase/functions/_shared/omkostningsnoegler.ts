/**
 * supabase/functions/_shared/omkostningsnoegler.ts — ÉN definition af omkostningsnøglerne
 * og de tre regnestykker der summerer dem (17/9-2026, saldobalance-rettelsen —
 * recon-saldobalance-fortegn.md §2/§3, Jonas: «den bedste løsning for det hele»).
 *
 * Spejlet ordret i src/lib/omkostningsnoegler.ts — enhver ændring her SKAL også
 * laves der. Pariteten håndhæves af src/lib/__tests__/omkostningsnoeglerParitet.test.ts.
 * Nul imports, så Vite/Vitest og Deno loader den ens; filhovedet er den ENESTE forskel.
 *
 * HVORFOR: ti læsere summerede omkostninger hver med sin egen liste (calcTotalExpenses,
 * CombinedBudgetWidget, HbBudgetBva, budgetAktualer, reportOverrideHelpers, weeklyFocusKpi,
 * canonicalEngines ebitda-afledning ×2, auto-create-baseline-budget, rimelighed). Da
 * saldobalancen fik to nye nøgler — `other_costs` (resultatkonti uden for de navngivne
 * intervaller) og `other_operating_income` (en omkostningsgruppe hvis netto er en indtægt:
 * lejeindtægter i 3400–3599) — skulle alle ti kende dem. Nu kender de dette modul.
 *
 * KONVENTIONEN (7/9-2026 står): omkostninger er POSITIVE. Summerne tager |beløb|, så en
 * række skrevet i negativ konvention før 7/9 stadig regnes rigtigt. Indtægten er en egen,
 * positiv nøgle — aldrig en negativ omkostning.
 */

// ── Nøglesæt: samme roller under to navne (canonical i motoren/facts, dansk i kf/formular) ──

export interface Noeglesaet {
  /** Vareforbrug (sidder allerede i dækningsbidraget). */
  vareforbrug: string;
  /** Driftsomkostninger før afskrivninger og finans — det EBITDA trækker fra. */
  drift: readonly string[];
  afskrivninger: string;
  /** Finansielle omkostninger; null hvor konventionen ingen nøgle har (dansk kf). */
  finans: string | null;
  /** Andre driftsindtægter — en omkostningsgruppe hvis netto er en indtægt (positiv). */
  andreDriftsindtaegter: string;
}

export const CANONICAL: Noeglesaet = {
  vareforbrug: "cogs",
  drift: ["payroll", "payroll_related", "other_staff_costs", "sales_costs", "facility_costs", "admin_costs", "vehicle_costs", "other_costs"],
  afskrivninger: "depreciation",
  finans: "financial_costs",
  andreDriftsindtaegter: "other_operating_income",
};

export const DANSK: Noeglesaet = {
  vareforbrug: "direkte_omkostninger",
  drift: ["loenninger", "salgsomkostninger", "lokaleomkostninger", "administrationsomkostninger", "oevrige_omkostninger"],
  afskrivninger: "afskrivninger",
  finans: null,
  andreDriftsindtaegter: "andre_driftsindtaegter",
};

/** Et objekt med tal under nøglerne — CanonicalMetrics, dansk kf, RimelighedInput … (interfaces har ingen
    indeks-signatur, derfor `object` og opslag via laes). */
export type Tal = object;
export type Omfang = "drift" | "vareforbrug_og_drift" | "drift_og_afskrivninger" | "alle";

const tal = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const laes = (m: Tal, k: string): number | null => tal((m as Record<string, unknown>)[k]);

/** Alle omkostningsnøgler i sættet (vareforbrug, drift, afskrivninger, finans) — aldrig indtægten. */
export function omkostningsnoegler(s: Noeglesaet, omfang: Omfang = "alle"): string[] {
  const ud: string[] = [];
  if (omfang === "vareforbrug_og_drift" || omfang === "alle") ud.push(s.vareforbrug);
  ud.push(...s.drift);
  if (omfang === "drift_og_afskrivninger" || omfang === "alle") ud.push(s.afskrivninger);
  if (omfang === "alle" && s.finans) ud.push(s.finans);
  return ud;
}

/** Σ|beløb| over de nøgler der HAR et tal; `fundet` er antallet af dem (0 = intet målt). */
export function sumOmkostninger(m: Tal, s: Noeglesaet, omfang: Omfang = "alle"): { sum: number; fundet: number } {
  let sum = 0;
  let fundet = 0;
  for (const k of omkostningsnoegler(s, omfang)) {
    const v = laes(m, k);
    if (v === null) continue;
    sum += Math.abs(v);
    fundet++;
  }
  return { sum, fundet };
}

/** «Omkostninger i alt» — Σ|alle omkostningsnøgler|, 0 når intet er målt (calcTotalExpenses-semantik). Indtægten trækkes IKKE fra. */
export function omkostningerIAlt(m: Tal, s: Noeglesaet): number {
  return sumOmkostninger(m, s, "alle").sum;
}

/** Andre driftsindtægter som positivt tal; 0 når nøglen mangler. */
export function andreDriftsindtaegter(m: Tal, s: Noeglesaet): number {
  const v = laes(m, s.andreDriftsindtaegter);
  return v === null ? 0 : Math.abs(v);
}

/** EBITDA = dækningsbidrag − Σ|drift| + andre driftsindtægter. null uden dækningsbidrag,
    eller når hverken en driftspost eller indtægten er målt (motorens «opex > 0»-gate, nu med indtægten). */
export function ebitdaRegnet(daekningsbidrag: number | null | undefined, m: Tal, s: Noeglesaet): number | null {
  const db = tal(daekningsbidrag);
  if (db === null) return null;
  const drift = sumOmkostninger(m, s, "drift");
  const indtaegt = laes(m, s.andreDriftsindtaegter);
  if (drift.fundet === 0 && indtaegt === null) return null;
  return db - drift.sum + (indtaegt === null ? 0 : Math.abs(indtaegt));
}

/** Resultat før skat regnet af posterne: EBITDA − |afskrivninger| − |finans|. Samme regnestykke
    som saldobalance-skabelonens kontrolsum og D's ebt_reconciles. null når ebitdaRegnet er null. */
export function ebtRegnet(daekningsbidrag: number | null | undefined, m: Tal, s: Noeglesaet): number | null {
  const ebitda = ebitdaRegnet(daekningsbidrag, m, s);
  if (ebitda === null) return null;
  const afskr = laes(m, s.afskrivninger);
  const finans = s.finans ? laes(m, s.finans) : null;
  return ebitda - (afskr === null ? 0 : Math.abs(afskr)) - (finans === null ? 0 : Math.abs(finans));
}

/** Posterne D's magnitude_plausibility måler som andel af omsætningen: vareforbrug, drift (kun de nøgler
    de danske rapporter kender + øvrige), afskrivninger og finans. Rækkefølgen er visningens. */
export const ANDEL_NOEGLER_TIL_RIMELIGHED = ["cogs", "payroll", "sales_costs", "facility_costs", "admin_costs", "other_costs", "depreciation", "financial_costs"] as const;
