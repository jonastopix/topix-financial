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
 *
 * Forside PR 4 (17/9): størrelsen «lg» (72 px — det fremhævede opslags og
 * pushets portrætform) og ALDRIG ET TOMT BILLEDE: kan billedet ikke
 * indlæses (onError), falder det tilbage til initialen i husets form i
 * stedet for en brudt firkant. `data-avatar` siger hvad der står.
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
  stoerrelse?: "sm" | "md" | "lg";
  /** Hover-/skærmlæser-tekst; default = navnet. */
  title?: string;
  className?: string;
}) => {
  const [fejl, setFejl] = React.useState(false);
  React.useEffect(() => setFejl(false), [avatarUrl]);
  const dim = stoerrelse === "sm" ? "h-8 w-8" : stoerrelse === "lg" ? "h-[72px] w-[72px]" : "h-9 w-9";
  const tekst = stoerrelse === "lg" ? "text-2xl" : "text-sm";
  const titel = title ?? navn ?? "Medlem";
  return avatarUrl && !fejl ? (
    <img
      src={avatarUrl}
      alt={navn ?? "Medlem"}
      title={titel}
      aria-label={titel}
      onError={() => setFejl(true)}
      data-avatar="billede"
      className={cn(dim, "shrink-0 rounded-full border border-hb-line object-cover", className)}
    />
  ) : (
    <span
      role="img"
      title={titel}
      aria-label={titel}
      data-avatar="initial"
      className={cn(
        dim,
        "flex shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 font-editorial text-hb-ink-soft",
        tekst,
        className,
      )}
    >
      {(navn ?? "?").charAt(0)}
    </span>
  );
};
