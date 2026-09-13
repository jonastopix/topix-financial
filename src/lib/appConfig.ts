/**
 * Centralized application configuration.
 * Branding, velkomstvideo-dommen og industry benchmarks bor her.
 *
 * SLETTET 13/9 (kort 82): PERFORMANCE_SCORE, GAMIFICATION og MEETINGS.
 * Målt 4/9, bekræftet 10/9 og 11/9, besluttet 11/9: deres eneste læsere
 * var PerformanceScore.tsx og CommunityProgress.tsx (importeret ingen
 * steder) og ConfigViews formularer; «meetings» havde ingen læser
 * overhovedet. Komponenterne og formularerne er slettet samme dag;
 * app_config-rækkerne slettes af 20260913231500_platformconfig_doede_raekker.
 * (KPI_FALLBACK_TARGETS og KPI_DEFAULT_BENCHMARKS gik tidligere 13/9,
 * kort 40 — #832/#833.)
 */

// ─── Branding ────────────────────────────────────────────────────────────────

export const APP_BRANDING = {
  name: "The Boardroom",
  shortName: "BR",
  advisorLabel: "dine rådgivere",
  chatPlaceholder: "Skriv direkte til dine rådgivere",
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
