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
  /** Finansielle indtægter (renteindtægter m.v., positiv) — A2 (18/9-2026): ebt = ebit − finans + finansielle indtægter; null hvor konventionen ingen nøgle har. */
  finansielleIndtaegter: string | null;
  /** Omsætningen, dækningsbidraget og resultatet før skat — kontrolsummens ankre (17/9-2026). */
  omsaetning: string;
  daekningsbidrag: string;
  resultat: string;
}

export const CANONICAL: Noeglesaet = {
  vareforbrug: "cogs",
  drift: ["payroll", "payroll_related", "other_staff_costs", "sales_costs", "facility_costs", "admin_costs", "vehicle_costs", "other_costs"],
  afskrivninger: "depreciation",
  finans: "financial_costs",
  andreDriftsindtaegter: "other_operating_income",
  finansielleIndtaegter: "financial_income",
  omsaetning: "revenue",
  daekningsbidrag: "gross_profit",
  resultat: "ebt",
};

export const DANSK: Noeglesaet = {
  vareforbrug: "direkte_omkostninger",
  drift: ["loenninger", "salgsomkostninger", "lokaleomkostninger", "administrationsomkostninger", "oevrige_omkostninger"],
  afskrivninger: "afskrivninger",
  finans: null,
  andreDriftsindtaegter: "andre_driftsindtaegter",
  finansielleIndtaegter: "finansielle_indtaegter",
  omsaetning: "omsaetning",
  daekningsbidrag: "daekningsbidrag",
  resultat: "resultat_foer_skat",
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

/** Finansielle indtægter som positivt tal; 0 når nøglen mangler eller sættet ingen har. */
export function finansielleIndtaegter(m: Tal, s: Noeglesaet): number {
  const v = s.finansielleIndtaegter ? laes(m, s.finansielleIndtaegter) : null;
  return v === null ? 0 : Math.abs(v);
}

/** Resultat før skat regnet af posterne: EBITDA − |afskrivninger| − |finans| + finansielle indtægter (A2, 18/9-2026).
    Samme regnestykke som saldobalance-skabelonens kontrolsum og D's ebt_reconciles. null når ebitdaRegnet er null. */
export function ebtRegnet(daekningsbidrag: number | null | undefined, m: Tal, s: Noeglesaet): number | null {
  const ebitda = ebitdaRegnet(daekningsbidrag, m, s);
  if (ebitda === null) return null;
  const afskr = laes(m, s.afskrivninger);
  const finans = s.finans ? laes(m, s.finans) : null;
  return ebitda - (afskr === null ? 0 : Math.abs(afskr)) - (finans === null ? 0 : Math.abs(finans)) + finansielleIndtaegter(m, s);
}

/** Posterne D's magnitude_plausibility måler som andel af omsætningen: vareforbrug, ALLE driftsposter (A2, 18/9-2026:
    også pension, øvrige personale og autodrift, som e-conomics PDF/XLSX og combined fanger), afskrivninger og finans.
    Rækkefølgen er visningens. */
export const ANDEL_NOEGLER_TIL_RIMELIGHED = ["cogs", "payroll", "payroll_related", "other_staff_costs", "sales_costs", "facility_costs", "admin_costs", "vehicle_costs", "other_costs", "depreciation", "financial_costs"] as const;

// ── Kontrolsummen: ÉT tal pr. rapport — hvor meget af resultatet er ikke dækket af de viste grupper ──
//
// (17/9-2026, Jonas: «Jeg har brug for den absolut bedste løsning. ALTID.» — chattens punkt 2: hver
// rapport bærer ét tal, og platformen siger det når tallet er stort, i stedet for at vise et pænt men
// ufuldstændigt omkostningsbillede.)
//
//   udaekket = resultat − (omsætning + andre driftsindtægter + finansielle indtægter − Σ|alle omkostningsgrupper|)
//
// Vareforbruget står i dækningsbidraget: er vareforbruget ikke målt, men dækningsbidraget er (årsrapporter,
// Booking Innovation-klassen), regnes fra dækningsbidraget i stedet for omsætningen — ellers ville hele
// vareforbruget tælle som «ikke fordelt». Med begge målt regnes omsætning − vareforbrug.
//
// Negativt = der mangler omkostninger for |udaekket| kr. (grupper skabelonen ikke fangede); positivt = der
// mangler indtægter. I HELE KRONER (ikke øre): tallene i canonical/facts er kroner med decimaler, og et tal
// til et menneske afrundes alligevel — øre ville kun flytte afrundingen til læseren. Samme funktion for ALLE
// skabeloner og AI-vejen (den regner på canonical-nøglerne); for saldobalance-XLSX er det pr. konstruktion
// det samme tal som skabelonens pnl_coverage (alle resultatkonti lander i en gruppe → 0 inden for 1 kr.).
//
// GRÆNSERNE SAGT HØJT: tallet er STORT når |udaekket| > UDAEKKET_GRAENSE_PCT × omsætning ELLER
// |udaekket| > UDAEKKET_GRAENSE_KR — så siger godkendelsen (D's boks) og virksomhedssiden det.
// Tallet gemmes ALTID i quality_signals.udaekket, også under grænsen.

export const UDAEKKET_GRAENSE_PCT = 0.05;
export const UDAEKKET_GRAENSE_KR = 10_000;
export const KONTROLSUM_KILDE = "grupper_mod_resultat" as const;

export interface Kontrolsum {
  /** Hele kroner: resultat − regnet. Negativt = manglende omkostninger, positivt = manglende indtægter. */
  udaekket: number;
  /** udaekket / omsætning; null når omsætningen er 0 eller mangler. */
  udaekket_pct_af_omsaetning: number | null;
  kilde: typeof KONTROLSUM_KILDE;
  /** Regnestykkets højre side: omsætning + indtægter − Σ|omkostninger| (hele kroner). */
  regnet: number;
  /** Antal omkostningsnøgler med et tal — 0 betyder at intet omkostningsbillede findes. */
  grupper_fundet: number;
}

/** Kontrolsummen for et sæt tal. null når resultatet eller omsætningen mangler (så er der intet at måle mod). */
export function kontrolsum(m: Tal, s: Noeglesaet): Kontrolsum | null {
  const resultat = laes(m, s.resultat);
  const omsaetning = laes(m, s.omsaetning);
  if (resultat === null || omsaetning === null) return null;
  const vareforbrug = laes(m, s.vareforbrug);
  const daekningsbidrag = laes(m, s.daekningsbidrag);
  const drift = sumOmkostninger(m, s, "drift_og_afskrivninger");
  const finans = s.finans ? laes(m, s.finans) : null;
  const basis = vareforbrug !== null
    ? Math.abs(omsaetning) - Math.abs(vareforbrug)
    : daekningsbidrag !== null ? daekningsbidrag : Math.abs(omsaetning);
  const regnet = basis + andreDriftsindtaegter(m, s) + finansielleIndtaegter(m, s) - drift.sum - (finans === null ? 0 : Math.abs(finans));
  const udaekket = Math.round(resultat - regnet);
  return {
    udaekket,
    udaekket_pct_af_omsaetning: Math.abs(omsaetning) > 0 ? udaekket / Math.abs(omsaetning) : null,
    kilde: KONTROLSUM_KILDE,
    regnet: Math.round(regnet),
    grupper_fundet: drift.fundet + (vareforbrug === null ? 0 : 1) + (finans === null ? 0 : 1),
  };
}

/** Er tallet stort — over 5 % af omsætningen ELLER over 10.000 kr.? */
export function udaekketErStort(k: Kontrolsum | null): boolean {
  if (k === null) return false;
  const abs = Math.abs(k.udaekket);
  if (abs > UDAEKKET_GRAENSE_KR) return true;
  return k.udaekket_pct_af_omsaetning !== null && Math.abs(k.udaekket_pct_af_omsaetning) > UDAEKKET_GRAENSE_PCT;
}

/** «15.721» — dansk tusindtal, hele kroner, uden fortegn (fortegnet siges med ord). */
export function udaekketKr(k: Kontrolsum): string {
  return Math.abs(k.udaekket).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Teksten til medlemmet — husets tone: resultatet er rigtigt, det er grupperne der mangler. */
export function udaekketTekst(k: Kontrolsum): string {
  const retning = k.udaekket < 0 ? "der mangler omkostninger for" : "der mangler indtægter for";
  return `${udaekketKr(k)} kr. af resultatet er ikke fordelt på grupperne — ${retning} ${udaekketKr(k)} kr. Omkostningsbilledet er ufuldstændigt; resultatet er rigtigt.`;
}

/** Den lille linje på virksomhedssiden ved månedens tal — kun når tallet er stort, ellers null. */
export function udaekketLinje(k: Kontrolsum | null): string | null {
  if (!udaekketErStort(k) || k === null) return null;
  return `${udaekketKr(k)} kr. af resultatet er ikke fordelt på grupperne — omkostningsbilledet er ufuldstændigt.`;
}

/** Læser kontrolsummen ud af en rapports quality_signals (jsonb → unknown); null når den ikke er der. */
export function kontrolsumAf(qualitySignals: unknown): Kontrolsum | null {
  const u = (qualitySignals as { udaekket?: unknown } | null | undefined)?.udaekket as Record<string, unknown> | null | undefined;
  if (!u || typeof u !== "object" || typeof u.udaekket !== "number" || !Number.isFinite(u.udaekket)) return null;
  const pct = typeof u.udaekket_pct_af_omsaetning === "number" && Number.isFinite(u.udaekket_pct_af_omsaetning) ? u.udaekket_pct_af_omsaetning : null;
  return {
    udaekket: u.udaekket,
    udaekket_pct_af_omsaetning: pct,
    kilde: KONTROLSUM_KILDE,
    regnet: typeof u.regnet === "number" ? u.regnet : 0,
    grupper_fundet: typeof u.grupper_fundet === "number" ? u.grupper_fundet : 0,
  };
}
