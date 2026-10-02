/**
 * Like-knappen — tekstuel handling i evergreen som fladens øvrige
 * handlinger; fyldt hjerte når jeg_har_reageret. INGEN optimistisk UI:
 * medlems-præcedensen er invalidering (EventRegisterAction), så tallet
 * er altid databasens, aldrig klientens gæt.
 *
 * Flyttet ORDRET fra CommunityTraadView.tsx:63-89 (14/9), da feedet fik
 * den samme knap (Jonas 14/9: «like fra feedet» — mangellistens w18).
 * Én knap, to steder; trådsidens udseende og opførsel er uændret.
 *
 * 2/10-2026 (den godkendte mockup til Community-feedet): tallet står som
 * ORD — «N fandt det nyttigt» (nyttigtTekst i lib/hjemmebane/communityNyttigt);
 * ved 0 intet tal, kun hjertet, og knappens navn er da titlen (sr-only).
 * Gælder alle tre steder knappen står: feedet, tråden og svarene.
 */
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { nyttigtTekst } from "@/lib/hjemmebane/communityNyttigt";

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
}) => {
  const titel = harReageret ? "Fjern reaktion" : "Synes godt om";
  const tekst = nyttigtTekst(antal);
  return (
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
      title={titel}
    >
      <Heart className={cn("h-4 w-4", harReageret && "fill-hb-evergreen")} aria-hidden />
      {tekst ?? <span className="sr-only">{titel}</span>}
    </button>
  );
};
