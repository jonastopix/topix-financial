import type { Json } from "@/integrations/supabase/types";

// ── Danish month names ──
export const DANISH_MONTHS = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

export const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

// ── Report period parsing ──
export function parseReportPeriodToKey(period: string | null): string | null {
  if (!period) return null;
  for (let i = 0; i < DANISH_MONTHS.length; i++) {
    if (period.toLowerCase().includes(DANISH_MONTHS[i].toLowerCase())) {
      const yearMatch = period.match(/\d{4}/);
      if (yearMatch) return `${yearMatch[0]}-${String(i + 1).padStart(2, "0")}`;
    }
  }
  return null;
}

// ── Key figures extraction ──
export interface ReportData {
  id: string;
  report_period: string | null;
  extracted_data: Json | null;
  status: string;
}

export function getKeyFigures(report: ReportData): Record<string, number> | null {
  if (!report.extracted_data || typeof report.extracted_data !== "object" || Array.isArray(report.extracted_data)) return null;
  return (report.extracted_data as Record<string, Json | undefined>).key_figures as Record<string, number> | null;
}

// ── DKK formatting ──
export const formatDKK = (n?: number) =>
  n != null ? `${n.toLocaleString("da-DK")} kr.` : "—";

export const formatDKKFull = (n: number) =>
  n.toLocaleString("da-DK", { maximumFractionDigits: 0 }) + " DKK";

export const formatCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
};

// ── Percentage change ──
export function pctChange(curr: number | undefined, prev: number | undefined): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

// ── Status config (shared between Reports, MemberDetail) ──
export const reportStatusConfig = {
  processed: { label: "Behandlet", className: "text-primary", bg: "bg-primary/10" },
  processing: { label: "Behandles", className: "text-chart-warning", bg: "bg-chart-warning/10" },
  error: { label: "Fejl", className: "text-destructive", bg: "bg-destructive/10" },
} as const;
