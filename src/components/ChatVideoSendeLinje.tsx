import React from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { videoSendeTekst, type VideoSendeTilstand } from "@/lib/chatVideoFlade";

/**
 * Linjen over skrivefeltet, mens en chatvideo sendes (Jonas 29/9: afsenderen
 * skal SE det, ikke kun en procent på kameraknappen). Samme rolige udtryk som
 * «Svarer på …» (ChatSvarCitat.tsx SvarerPaaBanner): hb-line, sage-tone,
 * ink-soft — ingen toast, intet der blinker.
 *   sender → spinner + «Sender video … 42 %»
 *   sendt  → flueben + «Videoen er sendt.» (CompanyChatPane fjerner linjen, når
 *            beskeden er kommet ind i samtalen)
 *   fejl   → rust-ikon + beskeden + «Prøv igen» (samme fil igen)
 * Ordene bor i chatVideoFlade.ts (videoSendeTekst), så de kan prøves rent.
 */
export function ChatVideoSendeLinje({ tilstand, onProevIgen }: { tilstand: VideoSendeTilstand | null; onProevIgen: () => void }) {
  if (!tilstand) return null;
  const tekst = videoSendeTekst(tilstand);
  const fejl = tilstand.tilstand === "fejl";
  return (
    <div
      role="status"
      aria-live="polite"
      data-tilstand={tilstand.tilstand}
      className={`mb-2 flex items-center gap-2 rounded-hb border border-hb-line px-3 py-2 text-xs ${fejl ? "bg-hb-surface text-hb-ink" : "bg-hb-sage/20 text-hb-ink-soft"}`}
    >
      {tilstand.tilstand === "sender" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />}
      {tilstand.tilstand === "sendt" && <Check className="h-3.5 w-3.5 shrink-0 text-hb-evergreen" aria-hidden />}
      {fejl && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-hb-rust" aria-hidden />}
      <span className="min-w-0 flex-1 truncate tabular-nums">{tekst}</span>
      {fejl && (
        <HbButton type="button" variant="link" className="text-xs" onClick={onProevIgen}>
          Prøv igen
        </HbButton>
      )}
    </div>
  );
}
