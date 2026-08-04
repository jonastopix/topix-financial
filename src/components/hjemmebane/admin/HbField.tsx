import * as React from "react";
import { cn } from "@/lib/utils";

/** Formular-primitiver i hb-udtryk. Native controls — bevidst ingen
    shadcn-inputs (stylet med appens mørke tokens) og ingen portal-overlays
    (portalerer ud af .theme-hjemmebane-scopet, jf. HbSidebar-lektionen).
    Native er samtidig den mest tastaturvenlige løsning. */

export const hbControlClasses =
  "w-full rounded-lg border border-hb-line bg-hb-surface px-3.5 py-2.5 text-[15px] text-hb-ink placeholder:text-hb-ink-soft/50 transition-shadow focus:outline-none focus:ring-2 focus:ring-hb-evergreen/60";

interface HbFieldProps {
  label: string;
  htmlFor?: string;
  help?: string;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + hjælpetekst/fejl ét sted — fejl vises inline ved feltet. */
export const HbField = ({ label, htmlFor, help, error, className, children }: HbFieldProps) => (
  <div className={cn("min-w-0", className)}>
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft"
    >
      {label}
    </label>
    {children}
    {error ? (
      <p className="mt-1.5 text-xs text-hb-rust">{error}</p>
    ) : help ? (
      <p className="mt-1.5 text-xs text-hb-ink-soft">{help}</p>
    ) : null}
  </div>
);

export const HbInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(hbControlClasses, className)} {...props} />
  ),
);
HbInput.displayName = "HbInput";

export const HbTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 3, ...props }, ref) => (
  <textarea ref={ref} rows={rows} className={cn(hbControlClasses, "resize-y", className)} {...props} />
));
HbTextarea.displayName = "HbTextarea";

export const HbSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(hbControlClasses, "cursor-pointer", className)} {...props}>
    {children}
  </select>
));
HbSelect.displayName = "HbSelect";
