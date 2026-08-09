import * as React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface HbSectionProps extends React.HTMLAttributes<HTMLElement> {
  eyebrow: string;
  title?: string;
  linkLabel?: string;
  linkTo?: string;
  /** Opt-in hårstreg under header-linjen (forside-polish): forsiden
      sætter den på alle sektioner for konsistent aksemarkering; default
      FRA, så øvrige flader (Akademiet m.fl.) er uændrede. */
  hairline?: boolean;
}

/** Sektionswrapper: rust-eyebrow, Fraunces-overskrift, valgfrit "se alle"-link.
    Håndhæver sektions-rytmen ét sted. Headeren har fast min-højde og
    ubrydeligt link, så kort-topkanter flugter på tværs af grid-celler. */
const HbSection = ({ eyebrow, title, linkLabel, linkTo, hairline, className, children, ...props }: HbSectionProps) => (
  <section className={cn("", className)} {...props}>
    <div
      className={cn(
        "mb-5 flex min-h-6 items-baseline justify-between gap-4",
        hairline && "border-b border-hb-line pb-3",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{eyebrow}</p>
        {title && (
          <h2 className="mt-2 font-editorial text-2xl md:text-3xl font-medium leading-tight text-hb-ink">{title}</h2>
        )}
      </div>
      {linkLabel && linkTo && (
        <Link
          to={linkTo}
          className="shrink-0 whitespace-nowrap text-sm text-hb-rust underline-offset-4 hover:underline"
        >
          {linkLabel}
        </Link>
      )}
    </div>
    {children}
  </section>
);

export { HbSection };
