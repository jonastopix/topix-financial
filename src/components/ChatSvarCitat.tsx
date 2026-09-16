import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CornerUpLeft, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { citatTilstand, svarerPaaTekst, type SvarBesked } from "@/lib/chatSvar";
import { SVAR_SLETTET_TEKST } from "@/lib/chatSvar";

/**
 * ChatSvarCitat — de to fælles stykker flade for «svar på en besked»
 * (Jonas 16/9, form A), delt af CompanyChatPane og MemberChatPane:
 *
 *   <SvarCitat>        citatet OVER boblen: afsender + uddrag på én linje;
 *                      klik ruller til originalen (panens scrollToMessage).
 *                      Originalen læses fra visningen, ellers hentes den ÉN
 *                      gang på id med læserens egne RLS-politikker; nul
 *                      rækker = «Svar på en slettet besked».
 *   <SvarerPaaBanner>  linjen over sendefeltet: «Svarer på {navn}: {uddrag}»
 *                      med × der fortryder svaret.
 *
 * Dommen bor i lib/chatSvar.ts (citatTilstand) — denne fil vælger kun ord
 * og form. Uddraget er REN TEKST; her er INGEN dangerouslySetInnerHTML
 * (kildeværn chatSvar.guard.test.ts). Formen er husets: hairline, sage,
 * rounded-hb; evergreen som handlingsfarve (klik), ink-soft som stille tekst.
 */

const SVAR_BESKED_KOLONNER = "id, sender_id, content, message_type, context_type";

/** Henter originalen på id — kun når den ikke står i visningen. RLS afgør synligheden. */
function useSvarPaaBesked(svarPaaId: string | null | undefined, iVisningen: boolean) {
  return useQuery({
    queryKey: ["chat-svar-paa", svarPaaId],
    enabled: !!svarPaaId && !iVisningen,
    staleTime: 60_000,
    queryFn: async (): Promise<SvarBesked | null> => {
      const { data, error } = await supabase
        .from("messages")
        .select(SVAR_BESKED_KOLONNER)
        .eq("id", svarPaaId as string)
        .maybeSingle();
      if (error) throw error;
      return (data as SvarBesked | null) ?? null;
    },
  });
}

export interface SvarCitatProps {
  svarPaaId: string | null | undefined;
  /** Beskederne i visningen (panens `messages`). */
  beskeder: readonly SvarBesked[];
  /** Afsenderens navn — panens participants/profilesMap. Ukendt → «Besked». */
  navnFor: (senderId: string) => string | null;
  /** Panens scrollToMessage. */
  onKlik: (beskedId: string) => void;
  isMine: boolean;
}

export const SvarCitat: React.FC<SvarCitatProps> = ({ svarPaaId, beskeder, navnFor, onKlik, isMine }) => {
  const iVisningen = !!svarPaaId && beskeder.some((b) => b.id === svarPaaId);
  const opslag = useSvarPaaBesked(svarPaaId, iVisningen);
  // Fejler opslaget (netværk), er det «henter» — aldrig «slettet» på en fejl.
  const hentet = opslag.isSuccess ? opslag.data : undefined;
  const tilstand = citatTilstand({ svarPaaId, beskeder, hentet });

  if (tilstand.art === "ingen") return null;

  const ramme = `mb-1 flex max-w-full items-start gap-1.5 rounded-t-lg border-l-2 px-2.5 py-1 text-[11px] leading-snug ${
    isMine ? "ml-auto border-hb-evergreen/50 bg-hb-sage/60 text-hb-ink" : "border-hb-line bg-hb-sage/30 text-hb-ink-soft"
  }`;

  if (tilstand.art === "henter") {
    return (
      <div aria-hidden className={ramme}>
        <CornerUpLeft className="mt-0.5 h-3 w-3 shrink-0" />
        <span className="h-3 w-32 animate-pulse rounded bg-hb-line/60" />
      </div>
    );
  }

  if (tilstand.art === "slettet") {
    return (
      <div className={`${ramme} italic`}>
        <CornerUpLeft className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{SVAR_SLETTET_TEKST}</span>
      </div>
    );
  }

  const navn = navnFor(tilstand.besked.sender_id) ?? "Besked";
  return (
    <button
      type="button"
      onClick={() => onKlik(tilstand.besked.id)}
      title="Gå til beskeden"
      className={`${ramme} text-left transition-colors hover:bg-hb-sage/80`}
    >
      <CornerUpLeft className="mt-0.5 h-3 w-3 shrink-0" />
      <span className="min-w-0">
        <span className="font-medium">{navn}</span>
        <span className="mx-1">·</span>
        <span className="truncate">{tilstand.uddrag}</span>
      </span>
    </button>
  );
};

export interface SvarerPaaBannerProps {
  navn: string | null;
  uddrag: string;
  onFjern: () => void;
}

/** Linjen over sendefeltet. Én sætning, ét kryds. */
export const SvarerPaaBanner: React.FC<SvarerPaaBannerProps> = ({ navn, uddrag, onFjern }) => (
  <div className="mb-2 flex items-center gap-2 rounded-hb border border-hb-line bg-hb-sage/20 px-3 py-2 text-xs text-hb-ink-soft">
    <CornerUpLeft className="h-3.5 w-3.5 shrink-0" />
    <span className="min-w-0 flex-1 truncate">{svarerPaaTekst(navn, uddrag)}</span>
    <button
      type="button"
      onClick={onFjern}
      aria-label="Fortryd svar"
      className="rounded-full p-1 text-hb-ink-soft transition-colors hover:bg-hb-sage/40 hover:text-hb-ink"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  </div>
);
