import * as React from "react";
import { HbCard } from "./HbCard";
import { HbButton } from "./HbButton";
import { cn } from "@/lib/utils";

interface HbEventCardProps extends React.HTMLAttributes<HTMLDivElement> {
  day: string;
  month: string;
  title: string;
  meta: string;
  /** null = ingen CTA (forsiden viser events uden tilmelding indtil
      tilmeldings-leverancen — ingen døde knapper). Default bevarer
      previewens udtryk. */
  ctaLabel?: string | null;
}

/** Event-kort: dato-blok (dag i Fraunces, måned i caps), titel, sted/format, pill-CTA. */
const HbEventCard = ({ day, month, title, meta, ctaLabel = "Tilmeld", className, ...props }: HbEventCardProps) => (
  <HbCard className={cn("flex items-start gap-6 p-6", className)} {...props}>
    <div className="shrink-0 text-center">
      <div className="font-editorial text-4xl font-medium leading-none text-hb-ink">{day}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{month}</div>
    </div>
    <div className="min-w-0 flex-1">
      <h3 className="font-editorial text-xl font-medium leading-snug text-hb-ink">{title}</h3>
      <p className="mt-1 text-sm text-hb-ink-soft">{meta}</p>
      {ctaLabel && (
        <HbButton variant="secondary" className="mt-4 h-9 px-5 text-sm">
          {ctaLabel}
        </HbButton>
      )}
    </div>
  </HbCard>
);

export { HbEventCard };
