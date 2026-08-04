import * as React from "react";
import { cn } from "@/lib/utils";

/** Hvid flade, hairline, stor radius, blød hover-elevation — basen for alt kortindhold. */
const HbCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-hb border border-hb-line bg-hb-surface transition-shadow duration-300 hover:shadow-hb-hover",
        className,
      )}
      {...props}
    />
  ),
);
HbCard.displayName = "HbCard";

export { HbCard };
