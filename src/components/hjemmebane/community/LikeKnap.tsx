/**
 * Like-knappen — tekstuel handling i evergreen som fladens øvrige
 * handlinger; fyldt hjerte når jeg_har_reageret. INGEN optimistisk UI:
 * medlems-præcedensen er invalidering (EventRegisterAction), så tallet
 * er altid databasens, aldrig klientens gæt.
 *
 * Flyttet ORDRET fra CommunityTraadView.tsx:63-89 (14/9), da feedet fik
 * den samme knap (Jonas 14/9: «like fra feedet» — mangellistens w18).
 * Én knap, to steder; trådsidens udseende og opførsel er uændret.
 */
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

export const LikeKnap = ({
  antal,
  harReageret,
  disabled,
  onClick,
  className,
}: {
  antal: number;
  harReageret: boolean;
  disabled: boolean;
  onClick: () => void;
  /** Feedet lægger sig over det strakte link (relative z-10); trådsiden sender intet. */
  className?: string;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={cn(
      "inline-flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50",
      harReageret ? "text-hb-evergreen" : "text-hb-ink-soft hover:text-hb-ink",
      className,
    )}
    aria-pressed={harReageret}
    title={harReageret ? "Fjern reaktion" : "Synes godt om"}
  >
    <Heart className={cn("h-4 w-4", harReageret && "fill-hb-evergreen")} />
    {antal}
  </button>
);
