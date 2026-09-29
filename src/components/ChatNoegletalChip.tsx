import * as React from "react";
import { BarChart3, X } from "lucide-react";
import { chipTekst, laesNoegletalChip, type NoegletalChip } from "@/lib/noegletalChip";

/**
 * ChatNoegletalChip — de to stykker flade for «Spørg din rådgiver» ved et
 * nøgletal (noegletalChip.ts), delt af CompanyChatPane og MemberChatPane:
 *
 *   <NoegletalChipVisning>  chippen I boblen: navn, tal og måned, som de stod,
 *                           da spørgsmålet blev stillet. FROSSET — læses KUN af
 *                           beskedens context_meta.noegletal, aldrig ved et
 *                           opslag i company_facts (kildeværn
 *                           noegletalChip.guard dom 1).
 *   <NoegletalChipBanner>   linjen over sendefeltet: chippen, der følger med
 *                           næste besked, med × der fortryder den.
 *
 * Ren tekst — INGEN dangerouslySetInnerHTML (samme regel som ChatSvarCitat).
 * Formen er husets: hairline, sage, rounded-hb; ink-soft som stille tekst.
 */

export interface NoegletalChipVisningProps {
  contextMeta: unknown;
  isMine: boolean;
}

export const NoegletalChipVisning: React.FC<NoegletalChipVisningProps> = ({ contextMeta, isMine }) => {
  const chip = laesNoegletalChip(contextMeta);
  if (!chip) return null;
  return (
    <div
      className={`mb-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-snug ${
        isMine ? "border-hb-evergreen/40 bg-hb-paper/60 text-hb-ink" : "border-hb-line bg-hb-sage/30 text-hb-ink"
      }`}
      title="Tallet, som det stod, da spørgsmålet blev stillet"
    >
      <BarChart3 className="h-3 w-3 shrink-0 text-hb-evergreen" />
      <span className="min-w-0 break-words">{chipTekst(chip)}</span>
    </div>
  );
};

export interface NoegletalChipBannerProps {
  chip: NoegletalChip;
  onFjern: () => void;
}

/** Linjen over sendefeltet. Én sætning om, hvad der følger med, ét kryds. */
export const NoegletalChipBanner: React.FC<NoegletalChipBannerProps> = ({ chip, onFjern }) => (
  <div className="mb-2 flex items-center gap-2 rounded-hb border border-hb-line bg-hb-sage/20 px-3 py-2 text-xs text-hb-ink-soft">
    <BarChart3 className="h-3.5 w-3.5 shrink-0 text-hb-evergreen" />
    {/* Mobil: højst én linje (Jonas 29/9, målt 74 px ved 375 px = 2-3 linjer, som
        tog 26 px fra beskedlisten). Ved md og op brydes teksten som før. */}
    <span className="min-w-0 flex-1 max-md:truncate">
      <span className="font-medium text-hb-ink">{chipTekst(chip)}</span>
      <span className="mx-1">·</span>
      <span>følger med din besked. Skriv dit spørgsmål.</span>
    </span>
    <button
      type="button"
      onClick={onFjern}
      aria-label="Fjern tallet fra beskeden"
      className="rounded-full p-1 text-hb-ink-soft transition-colors hover:bg-hb-sage/40 hover:text-hb-ink"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  </div>
);
