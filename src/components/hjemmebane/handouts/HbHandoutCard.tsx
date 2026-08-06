import { Calculator, Compass, Settings, Handshake, Megaphone, CheckCircle2 } from "lucide-react";
import type { HandoutConfig } from "@/lib/handoutConfig";
import { HbCard } from "../HbCard";

/** Hb-modulkort (spejler HandoutCard.tsx 1:1 i adfærd): klikbart kort m.
    ikon, titel, undertitel, statuslinje og stille fremdriftsbar.
    Status-SPROGET er ORDRET Akademi-broens (ElementView.HandoutSection):
    "Ikke startet" / "I gang · N %" / "Udfyldt ✓" — de to visninger skal
    tale ens. */

const iconMap: Record<string, React.ElementType> = {
  Compass,
  Calculator,
  Settings,
  Handshake,
  Megaphone,
};

interface HbHandoutCardProps {
  config: HandoutConfig;
  status: "not_started" | "in_progress" | "completed";
  progress: number;
  completedAt?: string | null;
  onClick: () => void;
}

export const HbHandoutCard = ({ config, status, progress, completedAt, onClick }: HbHandoutCardProps) => {
  const Icon = iconMap[config.icon] || Compass;
  const statusText =
    status === "completed" ? "Udfyldt ✓" : status === "in_progress" ? `I gang · ${progress} %` : "Ikke startet";

  return (
    <HbCard
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="cursor-pointer p-5 text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-hb-sage/60">
          <Icon className="h-5 w-5 text-hb-evergreen" />
        </div>
        <span className="text-xs text-hb-ink-soft">{statusText}</span>
      </div>
      <h3 className="mt-4 font-editorial text-lg font-medium leading-snug text-hb-ink">{config.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft line-clamp-2">{config.subtitle}</p>
      <div className="mt-4 h-[3px] overflow-hidden rounded-full bg-hb-line">
        <div
          className={progress >= 100 ? "h-full rounded-full bg-hb-evergreen" : "h-full rounded-full bg-hb-evergreen/70"}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      {status === "completed" && completedAt && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-hb-evergreen">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Udfyldt {new Date(completedAt).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      )}
    </HbCard>
  );
};
