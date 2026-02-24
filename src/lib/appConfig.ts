/**
 * Centralized application configuration.
 * All branding, scoring weights, fallback targets, gamification levels,
 * and industry benchmarks live here — no more hardcoded magic numbers.
 */

// ─── Branding ────────────────────────────────────────────────────────────────

export const APP_BRANDING = {
  name: "The Boardroom",
  shortName: "BR",
  advisorLabel: "dine rådgivere",
  chatPlaceholder: "Skriv direkte til dine rådgivere",
} as const;

// ─── Performance Score Weights & Formulas ────────────────────────────────────

export const PERFORMANCE_SCORE = {
  /** Ordered weights for [Vækstrate, Bruttomargin, Nettoresultat, Likviditet] */
  weights: [0.3, 0.25, 0.25, 0.2] as readonly number[],

  /** Scoring formula multipliers */
  growthMultiplier: 2,
  marginMultiplier: 2,
  profitMultiplier: 3,

  /** Liquidity: months of salary reserves to consider "100%" */
  liquidityMonths: 6,

  /** Default salary fallback when unknown */
  defaultSalaryFallback: 50000,

  /** Score thresholds → labels */
  labels: [
    { min: 80, label: "Stærk" },
    { min: 65, label: "Sund" },
    { min: 50, label: "OK" },
    { min: 35, label: "Svag" },
    { min: 0, label: "Kritisk" },
  ] as readonly { min: number; label: string }[],
} as const;

// ─── Gamification / Community Progress ───────────────────────────────────────

export const GAMIFICATION = {
  /** Points awarded per completed financial report */
  pointsPerReport: 10,
  /** Points awarded per completed milestone */
  pointsPerMilestone: 25,

  /** Member progress levels */
  levels: [
    { threshold: 0, label: "Starter", emoji: "🌱" },
    { threshold: 25, label: "Aktiv", emoji: "⚡" },
    { threshold: 75, label: "Dedikeret", emoji: "🔥" },
    { threshold: 150, label: "Stjerneelev", emoji: "⭐" },
    { threshold: 300, label: "Mester", emoji: "🏆" },
  ] as readonly { threshold: number; label: string; emoji: string }[],
} as const;

// ─── KPI Fallback Targets ────────────────────────────────────────────────────

export const KPI_FALLBACK_TARGETS: Record<string, { value: number; label: string }> = {
  omsaetning: { value: 120000, label: "120.000" },
  db_margin: { value: 60, label: "60%" },
  loenninger: { value: 50000, label: "< 50.000" },
  resultat: { value: 10000, label: "10.000" },
  omkostninger: { value: 80000, label: "< 80.000" },
  ebitda_margin: { value: 15, label: "15%" },
};

// ─── KPI Default Benchmarks (Danish SMB averages) ────────────────────────────

export const KPI_DEFAULT_BENCHMARKS: Record<string, { value: number; label: string; source: string }> = {
  omsaetning: { value: 150000, label: "150.000 DKK", source: "Dansk SMB gennemsnit" },
  db_margin: { value: 55, label: "55%", source: "Branchestandard" },
  loenninger: { value: 60000, label: "60.000 DKK", source: "Danmarks Statistik" },
  resultat: { value: 12000, label: "12.000 DKK", source: "Dansk SMB gennemsnit" },
  omkostninger: { value: 90000, label: "90.000 DKK", source: "Branchestandard" },
  ebitda_margin: { value: 12, label: "12%", source: "Branchestandard" },
};

// ─── Industry Benchmark Templates ────────────────────────────────────────────

export interface BenchmarkTemplate {
  name: string;
  description: string;
  benchmarks: Record<string, { value: number; label: string; source: string }>;
}

export const INDUSTRY_TEMPLATES: BenchmarkTemplate[] = [
  {
    name: "Tech & SaaS",
    description: "Software, apps, digitale produkter",
    benchmarks: {
      omsaetning: { value: 200000, label: "200.000 DKK", source: "Tech-branchen DK" },
      db_margin: { value: 75, label: "75%", source: "Tech-branchen DK" },
      loenninger: { value: 85000, label: "85.000 DKK", source: "Tech-branchen DK" },
      resultat: { value: 25000, label: "25.000 DKK", source: "Tech-branchen DK" },
      omkostninger: { value: 55000, label: "55.000 DKK", source: "Tech-branchen DK" },
      ebitda_margin: { value: 20, label: "20%", source: "Tech-branchen DK" },
    },
  },
  {
    name: "Konsulenter & Bureau",
    description: "Rådgivning, marketing, freelance",
    benchmarks: {
      omsaetning: { value: 180000, label: "180.000 DKK", source: "Rådgiverbranchen" },
      db_margin: { value: 80, label: "80%", source: "Rådgiverbranchen" },
      loenninger: { value: 90000, label: "90.000 DKK", source: "Rådgiverbranchen" },
      resultat: { value: 20000, label: "20.000 DKK", source: "Rådgiverbranchen" },
      omkostninger: { value: 45000, label: "45.000 DKK", source: "Rådgiverbranchen" },
      ebitda_margin: { value: 18, label: "18%", source: "Rådgiverbranchen" },
    },
  },
  {
    name: "E-commerce",
    description: "Webshops, dropshipping, online salg",
    benchmarks: {
      omsaetning: { value: 300000, label: "300.000 DKK", source: "E-handel DK" },
      db_margin: { value: 35, label: "35%", source: "E-handel DK" },
      loenninger: { value: 40000, label: "40.000 DKK", source: "E-handel DK" },
      resultat: { value: 10000, label: "10.000 DKK", source: "E-handel DK" },
      omkostninger: { value: 100000, label: "100.000 DKK", source: "E-handel DK" },
      ebitda_margin: { value: 5, label: "5%", source: "E-handel DK" },
    },
  },
  {
    name: "Detailhandel",
    description: "Fysiske butikker, specialbutikker",
    benchmarks: {
      omsaetning: { value: 250000, label: "250.000 DKK", source: "Detailhandel DK" },
      db_margin: { value: 42, label: "42%", source: "Detailhandel DK" },
      loenninger: { value: 55000, label: "55.000 DKK", source: "Detailhandel DK" },
      resultat: { value: 8000, label: "8.000 DKK", source: "Detailhandel DK" },
      omkostninger: { value: 130000, label: "130.000 DKK", source: "Detailhandel DK" },
      ebitda_margin: { value: 6, label: "6%", source: "Detailhandel DK" },
    },
  },
  {
    name: "Håndværk & Byggeri",
    description: "Entreprenører, installatører, malere",
    benchmarks: {
      omsaetning: { value: 350000, label: "350.000 DKK", source: "Byggeriets tal" },
      db_margin: { value: 35, label: "35%", source: "Byggeriets tal" },
      loenninger: { value: 85000, label: "85.000 DKK", source: "Byggeriets tal" },
      resultat: { value: 10000, label: "10.000 DKK", source: "Byggeriets tal" },
      omkostninger: { value: 180000, label: "180.000 DKK", source: "Byggeriets tal" },
      ebitda_margin: { value: 5, label: "5%", source: "Byggeriets tal" },
    },
  },
  {
    name: "Restauration & Café",
    description: "Restauranter, caféer, takeaway",
    benchmarks: {
      omsaetning: { value: 220000, label: "220.000 DKK", source: "HORESTA" },
      db_margin: { value: 30, label: "30%", source: "HORESTA" },
      loenninger: { value: 75000, label: "75.000 DKK", source: "HORESTA" },
      resultat: { value: 5000, label: "5.000 DKK", source: "HORESTA" },
      omkostninger: { value: 140000, label: "140.000 DKK", source: "HORESTA" },
      ebitda_margin: { value: 4, label: "4%", source: "HORESTA" },
    },
  },
];
