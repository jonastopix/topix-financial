import { CheckCircle2, AlertTriangle, ChevronRight } from "lucide-react";
import { formatK } from "./types";

export function SummaryKPI({ icon: Icon, label, value, valueColor }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; valueColor?: string }) {
  return (
    <div className="p-4 rounded-xl bg-secondary/50 border border-border/30 hover:bg-secondary/70 transition-colors cursor-pointer">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-lg font-display font-bold ${valueColor || "text-foreground"}`}>{value}</p>
    </div>
  );
}

export function ScenarioKPI({ label, value, color, diff, suffix }: { label: string; value: number; color: string; diff?: number; suffix?: string }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/30 border border-border/20">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-display font-bold ${value >= 0 ? (color || "text-foreground") : "text-destructive"}`}>
        {suffix ? `${value}${suffix}` : `${(value / 1000).toFixed(0)}k kr.`}
      </p>
      {diff !== undefined && diff !== 0 && (
        <p className={`text-[10px] font-medium mt-0.5 ${diff >= 0 ? "text-primary" : "text-destructive"}`}>
          {diff > 0 ? "+" : ""}{(diff / 1000).toFixed(0)}k vs. base
        </p>
      )}
    </div>
  );
}

export function CostGroupCard({ label, amount, count }: { label: string; amount: number; count: number }) {
  return (
    <div className="p-4 rounded-xl bg-secondary/30 border border-border/20 hover:bg-secondary/50 transition-colors cursor-pointer group">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className="text-base font-display font-bold text-foreground">{amount > 0 ? `${(amount / 1000).toFixed(0)}k kr.` : "—"}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{count} poster</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

export function BvaSummaryCard({ label, budget, actual, isRevenue }: { label: string; budget: number; actual: number | null; isRevenue: boolean }) {
  const hasActual = actual != null && actual !== 0;
  const diff = hasActual ? (isRevenue ? actual - budget : budget - actual) : 0;
  const pct = hasActual && budget !== 0 ? (diff / Math.abs(budget)) * 100 : 0;
  const favorable = diff >= 0;

  return (
    <div className="p-4 rounded-xl bg-secondary/50 border border-border/30">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] text-muted-foreground">Budget</p>
          <p className="text-sm font-display font-bold text-foreground">{formatK(budget)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Realiseret</p>
          <p className={`text-sm font-display font-bold ${!hasActual ? "text-muted-foreground" : favorable ? "text-primary" : "text-destructive"}`}>
            {hasActual ? formatK(actual) : "—"}
          </p>
        </div>
      </div>
      {hasActual && (
        <div className={`mt-2 text-xs font-medium ${favorable ? "text-primary" : "text-destructive"}`}>
          {pct > 0 ? "+" : ""}{pct.toFixed(1)}% afvigelse
        </div>
      )}
    </div>
  );
}

export function varianceColor(budget: number, actual: number | null, isRevenue: boolean): string {
  if (actual == null) return "text-muted-foreground";
  const diff = isRevenue ? actual - budget : budget - actual;
  const pct = budget !== 0 ? (diff / Math.abs(budget)) * 100 : 0;
  if (diff >= 0) return "text-primary";
  if (Math.abs(pct) > 10) return "text-destructive";
  return "text-chart-warning";
}

export function varianceIcon(budget: number, actual: number | null, isRevenue: boolean) {
  if (actual == null) return null;
  const diff = isRevenue ? actual - budget : budget - actual;
  const pct = budget !== 0 ? (diff / Math.abs(budget)) * 100 : 0;
  if (diff >= 0) return <CheckCircle2 className="h-3 w-3 text-primary inline" />;
  if (Math.abs(pct) > 10) return <AlertTriangle className="h-3 w-3 text-destructive inline" />;
  return <AlertTriangle className="h-3 w-3 text-chart-warning inline" />;
}
