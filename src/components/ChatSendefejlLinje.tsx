import React from "react";
import { AlertCircle } from "lucide-react";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { sendefejlTekst, type FejletBesked } from "@/lib/chatSendefejl";

/**
 * Sendefejl-linjen over skrivefeltet (30/9-2026, mønstret fra #1140/#1163):
 * rust-ikon, beskedens uddrag, «Prøv igen» (samme række, ingen ny upload) og
 * «Kassér». ÉN komponent for begge chatpaneler — medlemmets (MemberChatPane)
 * og rådgiverens (CompanyChatPane) — så teksten og udtrykket ikke kan glide
 * fra hinanden. Om linjen skal vises (rigtig samtale) afgør kalderen med
 * visSendefejl(besked, aktivSamtale) fra chatSendefejl.ts.
 */
export function ChatSendefejlLinje({
  besked,
  sender,
  onProevIgen,
  onKasser,
}: {
  besked: FejletBesked;
  sender: boolean;
  onProevIgen: () => void;
  onKasser: () => void;
}) {
  return (
    <div
      role="alert"
      data-sendefejl
      className="mb-2 flex items-center gap-2 rounded-hb border border-hb-line bg-hb-surface px-3 py-2 text-xs text-hb-ink"
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-hb-rust" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{sendefejlTekst(besked)}</span>
      <HbButton type="button" variant="link" className="text-xs" disabled={sender} onClick={onProevIgen}>
        Prøv igen
      </HbButton>
      <button
        type="button"
        onClick={onKasser}
        className="text-xs text-hb-ink-soft underline-offset-4 hover:underline"
      >
        Kassér
      </button>
    </div>
  );
}
