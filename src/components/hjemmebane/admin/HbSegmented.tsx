import * as React from "react";
import { cn } from "@/lib/utils";

interface HbSegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  "aria-label": string;
  className?: string;
}

/** Segmented control (medie-provider, indløsningstype): radiogroup-semantik,
    pilenavigation, ét stort roligt element i stedet for en dropdown. */
export function HbSegmented<T extends string>({
  value,
  options,
  onChange,
  className,
  ...aria
}: HbSegmentedProps<T>) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const index = options.findIndex((o) => o.value === value);
    const next = e.key === "ArrowRight" ? index + 1 : index - 1;
    const wrapped = (next + options.length) % options.length;
    onChange(options[wrapped].value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={aria["aria-label"]}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex flex-wrap gap-1 rounded-full border border-hb-line bg-hb-surface p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60",
              active
                ? "bg-hb-evergreen font-medium text-white"
                : "text-hb-ink-soft hover:bg-hb-sage/40 hover:text-hb-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
