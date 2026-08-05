import * as React from "react";
import { cn } from "@/lib/utils";

/** Små delte byggesten for Hb-budgetfladen (design-blok §c): TalStrip-
    typografien (BoardroomView-mønstret), tabellernes talformat og
    recharts-tooltips i hb-tokens (NoegletalView-mønstret). formatK-"300k"
    udgår på fladen — KPI'er taler formatDKK, tabelceller rene da-DK-tal
    (kolonneenheden "kr." forklares én gang under tabellen). */

export const fmtNumber = (v: number): string =>
  v === 0 ? "—" : Math.round(v).toLocaleString("da-DK");

export const hbBudgetTooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid hsl(var(--hb-line))",
    background: "hsl(var(--hb-surface))",
    color: "hsl(var(--hb-ink))",
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  },
  labelStyle: { color: "hsl(var(--hb-ink))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--hb-ink-soft))" },
};

/** Ét tal i båndet: label i uppercase tracking, værdi i font-editorial.
    attention = hb-rust på tallet (tone-dommene §b) — aldrig alert-farver,
    aldrig ikoner. */
export const TalStat = ({
  label,
  value,
  sub,
  attention = false,
  className,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  attention?: boolean;
  className?: string;
}) => (
  <div className={cn("min-w-0", className)}>
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{label}</p>
    <p
      className={cn(
        "mt-1 font-editorial text-2xl font-medium",
        attention ? "text-hb-rust" : "text-hb-ink",
      )}
    >
      {value}
    </p>
    {sub != null && <p className="mt-1 text-xs text-hb-ink-soft">{sub}</p>}
  </div>
);

/** Stille kvitteringslinje (savedNote/saveError-mønstret, NoegletalView). */
export const QuietNote = ({ note, error }: { note: string | null; error: string | null }) => {
  if (!note && !error) return null;
  return (
    <p className="text-xs text-hb-ink-soft" role="status">
      {error ? <span className="text-hb-rust">{error}</span> : note}
    </p>
  );
};
