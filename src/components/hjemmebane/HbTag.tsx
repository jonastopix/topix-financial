import * as React from "react";
import { cn } from "@/lib/utils";

/** Lille pill-label til kategorier ("Skat", "Likviditet", "Community"). */
const HbTag = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full bg-hb-sage px-3 py-1 text-xs font-medium text-hb-ink",
      className,
    )}
    {...props}
  />
);

export { HbTag };
