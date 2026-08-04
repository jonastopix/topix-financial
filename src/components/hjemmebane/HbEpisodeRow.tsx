import * as React from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface HbEpisodeRowProps extends React.HTMLAttributes<HTMLDivElement> {
  number: number;
  title: string;
  duration: string;
}

/** Kompakt episode-række til lister under hovedafspilleren. */
const HbEpisodeRow = ({ number, title, duration, className, ...props }: HbEpisodeRowProps) => (
  <div
    className={cn(
      "group flex cursor-pointer items-center gap-5 border-t border-hb-line py-4 transition-colors hover:bg-hb-sage/20",
      className,
    )}
    {...props}
  >
    <span className="w-10 shrink-0 font-editorial text-2xl font-medium text-hb-ink-soft">
      {String(number).padStart(2, "0")}
    </span>
    <span className="flex-1 text-base text-hb-ink">{title}</span>
    <span className="shrink-0 text-sm text-hb-ink-soft">{duration}</span>
    <Play className="h-4 w-4 shrink-0 text-hb-ink-soft transition-colors group-hover:text-hb-evergreen" />
  </div>
);

export { HbEpisodeRow };
