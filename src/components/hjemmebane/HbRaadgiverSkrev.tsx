import { X } from "lucide-react";
import { HbButton } from "./HbButton";
import { AABN_CHATTEN, CHAT_STI_MEDLEM } from "@/lib/hjemmebane/raadgiverSkrev";
import type { RaadgiverBanner } from "@/hooks/raadgiverSkrev";

/** «{Rådgivernavn} har lige skrevet til dig» (Jonas 1/10). Roligt kort i
    skallens eget DOM-træ (.theme-hjemmebane), ØVERST til højre (bunden
    er onboarding-boksens og chattens sendefelts); aria-live="polite", så skærmlæsere hører det uden at
    blive afbrudt. Ingen lyd, ingen mail. «Åbn chatten» går til /chat (det
    er dér beskeden markeres læst — banneret markerer intet). Dommen og
    teksterne i lib/hjemmebane/raadgiverSkrev. */
export const HbRaadgiverSkrev = ({
  banner,
  onLuk,
  onAabn,
}: {
  banner: RaadgiverBanner | null;
  onLuk: () => void;
  onAabn: (sti: string) => void;
}) => (
  <div aria-live="polite" className="pointer-events-none fixed inset-x-4 top-4 z-50 flex justify-end sm:inset-x-auto sm:right-6 sm:top-6">
    {banner && (
      <div
        role="status"
        data-raadgiver-skrev
        className="pointer-events-auto relative w-full max-w-sm rounded-hb border border-hb-line bg-hb-surface p-5 pr-10 shadow-hb-hover"
      >
        <button
          type="button"
          onClick={onLuk}
          aria-label="Luk"
          className="absolute right-3 top-3 rounded-full p-1.5 text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-sm font-medium text-hb-ink">{banner.titel}</p>
        {banner.uddrag && <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft">{banner.uddrag}</p>}
        <HbButton
          type="button"
          className="mt-4 h-9 px-4"
          onClick={() => {
            onLuk();
            onAabn(CHAT_STI_MEDLEM);
          }}
        >
          {AABN_CHATTEN}
        </HbButton>
      </div>
    )}
  </div>
);
