import * as React from "react";
import { Link } from "react-router-dom";
import { Check, Lock, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ITEM_TYPES } from "@/lib/hjemmebane/adminContentApi";
import { formatDuration } from "@/components/hjemmebane/admin/editors/shared";
import type { AkademiItem } from "./useAkademiData";

/** Tilstandsprik: ● gennemført · ◐ påbegyndt · ○ urørt · − sprunget over. */
const StateDot = ({ entry }: { entry: AkademiItem }) => {
  if (entry.state === "done")
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-hb-evergreen">
        <Check className="h-3 w-3 text-white" />
      </span>
    );
  if (entry.state === "skipped")
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-hb-line">
        <Minus className="h-3 w-3 text-hb-ink-soft" />
      </span>
    );
  return (
    <span
      className={cn(
        "h-5 w-5 shrink-0 rounded-full border",
        entry.state === "started"
          ? "border-hb-evergreen [background:linear-gradient(90deg,hsl(var(--hb-evergreen))_50%,transparent_50%)]"
          : "border-hb-line",
      )}
    />
  );
};

/** Elementrække i område-visningen. Låst (dryp) = nedtonet med nedtælling —
    forløbets form er synlig, klik åbner ikke (D6). */
export const HbItemRow = ({ entry }: { entry: AkademiItem }) => {
  const { item, drip } = entry;
  const typeLabel = ITEM_TYPES.find((t) => t.key === item.type)?.label ?? item.type;
  const meta = [typeLabel, formatDuration(item.duration_seconds)].filter(Boolean).join(" · ");

  const inner = (
    <>
      <StateDot entry={entry} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] text-hb-ink">{item.title}</p>
        <p className="truncate text-xs text-hb-ink-soft">{meta}</p>
      </div>
      {!drip.unlocked && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-hb-ink-soft">
          <Lock className="h-3.5 w-3.5" />
          Åbner om {drip.daysUntil} dag{drip.daysUntil === 1 ? "" : "e"}
        </span>
      )}
    </>
  );

  if (!drip.unlocked) {
    return (
      <div aria-disabled className="flex items-center gap-3.5 rounded-lg px-3 py-2.5 opacity-55">
        {inner}
      </div>
    );
  }

  return (
    <Link
      to={`/akademiet/${item.area}/${item.slug}`}
      className="flex items-center gap-3.5 rounded-lg px-3 py-2.5 transition-colors hover:bg-hb-sage/30"
    >
      {inner}
    </Link>
  );
};
