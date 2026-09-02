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
  /** Points awarded per completed handout module */
  pointsPerHandout: 50,

  /** Member progress levels */
  levels: [
    { threshold: 0, label: "Starter", emoji: "🌱" },
    { threshold: 25, label: "Aktiv", emoji: "⚡" },
    { threshold: 75, label: "Dedikeret", emoji: "🔥" },
    { threshold: 150, label: "Stjerneelev", emoji: "⭐" },
    { threshold: 300, label: "Mester", emoji: "🏆" },
  ] as readonly { threshold: number; label: string; emoji: string }[],
} as const;

// ─── Meetings ────────────────────────────────────────────────────────────────

export const MEETINGS = {
  next_meeting_date: null as string | null,
} as const;

// ─── Velkomstvideo (onboarding-tjeklisten) ───────────────────────────────────

/** app_config.velkomstvideo_guid — Bunny-video-GUID. Tom = ingen video =
    velkomsten er slået fra (overlejring og tjeklistepunkt udgår). */
export const VELKOMSTVIDEO_GUID = "";

/** Bunny-GUID'er har uuid-form — samme mønster som HbBunnyPicker og get-video-embed. */
const VELKOMST_GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Læser velkomstvideo-GUID'et ud af app_config.config_value.
 *
 * config_value er JSON (jsonb), IKKE text. Målt 2/9: rækken er oprettet i
 * produktion med '""'::json — en tom JSON-streng. supabase-js leverer
 * jsonb parset (session_timeout_minutes '30'::jsonb ankommer som tallet 30,
 * rollout-flagene som objekter — ingen JSON.parse nogen steder), så en tom
 * JSON-streng ankommer som JS-strengen "" (nul tegn). Læses værdien
 * derimod RÅ (fx config_value::text i en SQL-funktion, eller en fremtidig
 * læser der ikke parser), er den strengen «""» på TO tegn — og en naiv
 * `trim().length > 0` ville sige «der er en video». Så ville platformen
 * vise overlejringen med en tom indlejring og tælle punktet med.
 *
 * Derfor: (1) kun strenge tæller; (2) en streng der selv er JSON-kodet
 * (indledes og afsluttes af ") pakkes ud én gang; (3) der trimmes; (4) kun
 * GUID-form er en video — alt andet er «ingen video». Fail-closed: vi viser
 * ikke tomt indhold. Samme dom spejles i get-video-embed (Deno).
 */
export function laesVelkomstvideoGuid(configValue: unknown): string {
  if (typeof configValue !== "string") return "";
  let s = configValue.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).trim();
  }
  return VELKOMST_GUID_RE.test(s) ? s.toLowerCase() : "";
}

/** Dommen fladen og motoren bruger: er der sat en velkomstvideo? */
export function harVelkomstvideo(configValue: unknown): boolean {
  return laesVelkomstvideoGuid(configValue) !== "";
}

// ─── KPI Fallback Targets ────────────────────────────────────────────────────

export const KPI_FALLBACK_TARGETS: Record<string, { value: number; label: string }> = {
  omsaetning: { value: 120000, label: "120.000" },
  db_margin: { value: 60, label: "60%" },
  loenninger: { value: 50000, label: "< 50.000" },
  resultat: { value: 10000, label: "10.000" },
  omkostninger: { value: 80000, label: "< 80.000" },
  ebitda_margin: { value: 15, label: "15%" },
};

// ─── KPI Default Benchmarks ──────────────────────────────────────────────────

/** Kildeprincip (2026-08-05): source_label påstår aldrig mere end vi kan
    dokumentere — ægte kilder angives m. navn + årstal; skøn hedder
    Estimat, The Boardroom. Tallene er under faglig kuratering
    (hb-branchetal-review.md). */
export const KPI_DEFAULT_BENCHMARKS: Record<string, { value: number; label: string; source: string }> = {
  omsaetning: { value: 150000, label: "150.000 DKK", source: "Estimat, The Boardroom" },
  db_margin: { value: 55, label: "55%", source: "Estimat, The Boardroom" },
  loenninger: { value: 60000, label: "60.000 DKK", source: "Estimat, The Boardroom" },
  resultat: { value: 12000, label: "12.000 DKK", source: "Estimat, The Boardroom" },
  omkostninger: { value: 90000, label: "90.000 DKK", source: "Estimat, The Boardroom" },
  ebitda_margin: { value: 12, label: "12%", source: "Estimat, The Boardroom" },
};

// ─── Industry Benchmark Templates ────────────────────────────────────────────

export interface BenchmarkTemplate {
  name: string;
  description: string;
  benchmarks: Record<string, { value: number; label: string; source: string }>;
}

/** Kildeprincip (2026-08-05): source_label påstår aldrig mere end vi kan
    dokumentere — ægte kilder angives m. navn + årstal; skøn hedder
    Estimat, The Boardroom. Tallene er under faglig kuratering
    (hb-branchetal-review.md). */
export const INDUSTRY_TEMPLATES: BenchmarkTemplate[] = [
  {
    name: "Tech & SaaS",
    description: "Software, apps, digitale produkter",
    benchmarks: {
      omsaetning: { value: 200000, label: "200.000 DKK", source: "Estimat, The Boardroom" },
      db_margin: { value: 75, label: "75%", source: "Estimat, The Boardroom" },
      loenninger: { value: 85000, label: "85.000 DKK", source: "Estimat, The Boardroom" },
      resultat: { value: 25000, label: "25.000 DKK", source: "Estimat, The Boardroom" },
      omkostninger: { value: 55000, label: "55.000 DKK", source: "Estimat, The Boardroom" },
      ebitda_margin: { value: 20, label: "20%", source: "Estimat, The Boardroom" },
    },
  },
  {
    name: "Konsulenter & Bureau",
    description: "Rådgivning, marketing, freelance",
    benchmarks: {
      omsaetning: { value: 180000, label: "180.000 DKK", source: "Estimat, The Boardroom" },
      db_margin: { value: 80, label: "80%", source: "Estimat, The Boardroom" },
      loenninger: { value: 90000, label: "90.000 DKK", source: "Estimat, The Boardroom" },
      resultat: { value: 20000, label: "20.000 DKK", source: "Estimat, The Boardroom" },
      omkostninger: { value: 45000, label: "45.000 DKK", source: "Estimat, The Boardroom" },
      ebitda_margin: { value: 18, label: "18%", source: "Estimat, The Boardroom" },
    },
  },
  {
    name: "E-commerce",
    description: "Webshops, dropshipping, online salg",
    benchmarks: {
      omsaetning: { value: 300000, label: "300.000 DKK", source: "Estimat, The Boardroom" },
      db_margin: { value: 35, label: "35%", source: "Estimat, The Boardroom" },
      loenninger: { value: 40000, label: "40.000 DKK", source: "Estimat, The Boardroom" },
      resultat: { value: 10000, label: "10.000 DKK", source: "Estimat, The Boardroom" },
      omkostninger: { value: 100000, label: "100.000 DKK", source: "Estimat, The Boardroom" },
      ebitda_margin: { value: 5, label: "5%", source: "Estimat, The Boardroom" },
    },
  },
  {
    name: "Detailhandel",
    description: "Fysiske butikker, specialbutikker",
    benchmarks: {
      omsaetning: { value: 250000, label: "250.000 DKK", source: "Estimat, The Boardroom" },
      db_margin: { value: 42, label: "42%", source: "Estimat, The Boardroom" },
      loenninger: { value: 55000, label: "55.000 DKK", source: "Estimat, The Boardroom" },
      resultat: { value: 8000, label: "8.000 DKK", source: "Estimat, The Boardroom" },
      omkostninger: { value: 130000, label: "130.000 DKK", source: "Estimat, The Boardroom" },
      ebitda_margin: { value: 6, label: "6%", source: "Estimat, The Boardroom" },
    },
  },
  {
    name: "Håndværk & Byggeri",
    description: "Entreprenører, installatører, malere",
    benchmarks: {
      omsaetning: { value: 350000, label: "350.000 DKK", source: "Estimat, The Boardroom" },
      db_margin: { value: 35, label: "35%", source: "Estimat, The Boardroom" },
      loenninger: { value: 85000, label: "85.000 DKK", source: "Estimat, The Boardroom" },
      resultat: { value: 10000, label: "10.000 DKK", source: "Estimat, The Boardroom" },
      omkostninger: { value: 180000, label: "180.000 DKK", source: "Estimat, The Boardroom" },
      ebitda_margin: { value: 5, label: "5%", source: "Estimat, The Boardroom" },
    },
  },
  {
    name: "Restauration & Café",
    description: "Restauranter, caféer, takeaway",
    benchmarks: {
      omsaetning: { value: 220000, label: "220.000 DKK", source: "Estimat, The Boardroom" },
      db_margin: { value: 30, label: "30%", source: "Estimat, The Boardroom" },
      loenninger: { value: 75000, label: "75.000 DKK", source: "Estimat, The Boardroom" },
      resultat: { value: 5000, label: "5.000 DKK", source: "Estimat, The Boardroom" },
      omkostninger: { value: 140000, label: "140.000 DKK", source: "Estimat, The Boardroom" },
      ebitda_margin: { value: 4, label: "4%", source: "Estimat, The Boardroom" },
    },
  },
];
