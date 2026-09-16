import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * HbAvatar — profilbilledet i Hjemmebanes form (16/9): billedet når det
 * findes, ellers initialet i en sage-cirkel. Løftet ORDRET fra
 * ForfatterAvatar (CommunityView.tsx:84-95), som stadig er defineret fire
 * steder (MemberChatPane, CompanyChatPane, CommunityView, CommunityTraadView
 * — mangellisten «ForfatterAvatar defineres fire steder»); de fire røres
 * ikke her — det er et eget kort. Første bruger: «Online nu» på
 * rådgiverens forside. `title`/`aria-label` bærer navnet (og « · Legat»)
 * ved hover og for skærmlæsere — ingen tooltip-komponent.
 */
export const HbAvatar = ({
  navn,
  avatarUrl,
  stoerrelse = "md",
  title,
  className,
}: {
  navn: string | null;
  avatarUrl: string | null;
  stoerrelse?: "sm" | "md";
  /** Hover-/skærmlæser-tekst; default = navnet. */
  title?: string;
  className?: string;
}) => {
  const dim = stoerrelse === "sm" ? "h-8 w-8" : "h-9 w-9";
  const titel = title ?? navn ?? "Medlem";
  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt={navn ?? "Medlem"}
      title={titel}
      aria-label={titel}
      className={cn(dim, "shrink-0 rounded-full border border-hb-line object-cover", className)}
    />
  ) : (
    <span
      role="img"
      title={titel}
      aria-label={titel}
      className={cn(
        dim,
        "flex shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 font-editorial text-sm text-hb-ink-soft",
        className,
      )}
    >
      {(navn ?? "?").charAt(0)}
    </span>
  );
};
