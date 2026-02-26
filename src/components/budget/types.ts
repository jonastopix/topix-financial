import React from "react";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

export interface BudgetRow {
  key: string;
  label: string;
  values: number[];
  isEditable?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  group: string;
  hint?: string;
}

export type ScenarioKey = "base" | "optimistisk" | "pessimistisk";

export interface Scenario {
  key: ScenarioKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
}

import { Shield, Zap, TrendingDown } from "lucide-react";
import type { BudgetCategory } from "@/lib/budgetTemplates";

export const SCENARIOS: Scenario[] = [
  { key: "base", label: "Base", description: "Dit reelle budget – udgangspunktet", icon: Shield, color: "text-primary", bg: "bg-primary/10", border: "border-primary/30" },
  { key: "optimistisk", label: "Optimistisk", description: "Hvad hvis alt går bedre end forventet?", icon: Zap, color: "text-chart-warning", bg: "bg-chart-warning/10", border: "border-chart-warning/30" },
  { key: "pessimistisk", label: "Pessimistisk", description: "Worst case – hvad kan du tåle?", icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30" },
];

export function catToRow(cat: BudgetCategory): BudgetRow {
  return { key: cat.key, label: cat.label, values: Array(12).fill(0), isEditable: true, icon: cat.icon, group: cat.group, hint: cat.hint };
}

export const formatK = (v: number) => {
  if (v === 0) return "—";
  const sign = v < 0 ? "-" : "";
  return `${sign}${Math.abs(Math.round(v / 1000))}k`;
};

// ─── Budget category key → report key_figures key mapping ───
export const BUDGET_TO_REPORT_KEY: Record<string, string> = {
  omsaetning: "omsaetning",
  direkte_omk: "direkte_omkostninger",
  vareforbrug: "direkte_omkostninger",
  loenninger: "loenninger",
  marketing: "marketing",
  digital_marketing: "marketing",
  lokaler: "lokaler",
  admin: "admin",
  admin_regnskab: "admin",
  tech_software: "tech_software",
  platform_tech: "tech_software",
};

// Categories where higher actual is favorable (revenue)
export const REVENUE_GROUPS = new Set(["indtaegter"]);
