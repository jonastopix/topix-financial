import * as React from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface HbVideoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  image: string;
  imageAlt: string;
  title: string;
  duration: string;
}

/** 16:9 medieflade m. afrundede hjørner og centreret play-cirkel.
    Sage-overlay ved hover. Titel + varighed under fladen. */
const HbVideoCard = ({ image, imageAlt, title, duration, className, ...props }: HbVideoCardProps) => (
  <div className={cn("group cursor-pointer", className)} {...props}>
    <div className="relative aspect-video overflow-hidden rounded-hb border border-hb-line bg-hb-surface">
      <img src={image} alt={imageAlt} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-hb-sage/0 transition-colors duration-300 group-hover:bg-hb-sage/30" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-hb-evergreen text-white shadow-hb-hover transition-transform duration-300 group-hover:scale-105">
          <Play className="h-6 w-6 translate-x-0.5 fill-current" />
        </div>
      </div>
    </div>
    <div className="mt-4 flex items-baseline justify-between gap-4">
      <h3 className="font-editorial text-xl md:text-2xl font-medium leading-snug text-hb-ink">{title}</h3>
      <span className="shrink-0 text-sm text-hb-ink-soft">{duration}</span>
    </div>
  </div>
);

export { HbVideoCard };
