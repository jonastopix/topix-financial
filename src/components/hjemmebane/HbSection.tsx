import * as React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface HbSectionProps extends React.HTMLAttributes<HTMLElement> {
  eyebrow: string;
  title?: string;
  linkLabel?: string;
  linkTo?: string;
}

/** Sektionswrapper: rust-eyebrow, Fraunces-overskrift, valgfrit "se alle"-link.
    Håndhæver sektions-rytmen ét sted. */
const HbSection = ({ eyebrow, title, linkLabel, linkTo, className, children, ...props }: HbSectionProps) => (
  <section className={cn("", className)} {...props}>
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{eyebrow}</p>
        {title && (
          <h2 className="mt-2 font-editorial text-2xl md:text-3xl font-medium leading-tight text-hb-ink">{title}</h2>
        )}
      </div>
      {linkLabel && linkTo && (
        <Link to={linkTo} className="shrink-0 text-sm text-hb-rust underline-offset-4 hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
    {children}
  </section>
);

export { HbSection };
