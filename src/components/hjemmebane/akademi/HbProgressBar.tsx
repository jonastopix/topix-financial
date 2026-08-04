import * as React from "react";
import { cn } from "@/lib/utils";

interface HbProgressBarProps {
  done: number;
  total: number;
  className?: string;
}

/** Stille fremdrift: "3 af 8" + hairline-bar. Ingen procenter, ingen badges. */
export const HbProgressBar = ({ done, total, className }: HbProgressBarProps) => {
  if (total === 0) return null;
  const complete = done >= total;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-hb-line">
        <div
          className={cn("h-full rounded-full", complete ? "bg-hb-evergreen" : "bg-hb-evergreen/70")}
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </div>
      <span className="shrink-0 text-xs text-hb-ink-soft">
        {complete ? "Gennemført" : `${done} af ${total}`}
      </span>
    </div>
  );
};
