/**
 * chatSvar — svar på en konkret besked i chatten: citatets tilstand, uddraget
 * og hvem der kan besvares. Rene funktioner, ingen React, ingen Supabase.
 * Testet i __tests__/chatSvar.test.ts; fladen låst af chatSvar.guard.test.ts.
 *
 * JONAS 16/9, FORM A: citatet FØLGER den rigtige besked. Rettes originalen,
 * viser citatet den nye tekst; slettes den, står der «Svar på en slettet
 * besked»; klik på citatet ruller op til beskeden. Ikke et frosset citat i
 * context_meta — det ville bevare tekst afsenderen har slettet inden for de
 * 15 minutter (beskedRegler.ts).
 *
 * KILDEN til citatet er derfor ALTID en rigtig række i messages: enten den
 * der allerede står i visningen (de 500 nyeste, CompanyChatPane.tsx:617-621,
 * MemberChatPane.tsx:272-276), eller én hentet på id med læserens egne RLS-
 * politikker (ChatSvarCitat.tsx). Tre tilstande ud over «ingen»:
 *   henter  — svar_paa_id er sat, originalen er ikke i visningen, og
 *             opslaget er ikke kommet endnu → et stille citat-skelet.
 *   citat   — originalen findes: afsender + uddrag på én linje.
 *   slettet — opslaget gav nul rækker. Originalen er slettet (hard delete,
 *             messages har ingen deleted_at — 20260911020000:19-20). For et
 *             medlem kan nul rækker ikke betyde «skjult»: databasens værn
 *             (protect_message_svar_paa) tillod aldrig et svar på en besked
 *             medlemmet ikke kunne se (session_prep). Migrationen
 *             20260917090000 forklarer hvorfor der ingen fremmednøgle er.
 *
 * UDDRAGET er REN TEKST (renTekst, lib/hjemmebane/richtext.ts — samme som
 * klokken og Slack-uddraget): chatten sender Tiptap-HTML, og et citat må
 * aldrig vise tags som tekst — og aldrig rendere HTML (ingen
 * dangerouslySetInnerHTML i citatet; låst af kildeværnet). Én linje, højst
 * SVAR_UDDRAG_MAKS tegn, «…» når der klippes.
 *
 * HVEM KAN BESVARES: kun 'user'-beskeder der ikke er session_prep. System-
 * og AI-kort (rapportkvitteringer, agent, dagsorden) er ikke samtale.
 * Databasen dømmer det samme i triggeren; fladen skjuler bare knappen.
 */

import { renTekst } from "./hjemmebane/richtext";

/** Højeste længde på citatets uddrag — én linje i boblen. */
export const SVAR_UDDRAG_MAKS = 120;

/** Ordene når originalen er væk. Én kilde; vises i boblen (ChatSvarCitat). */
export const SVAR_SLETTET_TEKST = "Svar på en slettet besked";

/** Det mindste af en besked citatet har brug for. Matcher chatShared.Message. */
export interface SvarBesked {
  id: string;
  sender_id: string;
  content: string;
  message_type?: string;
  context_type?: string | null;
}

export type CitatTilstand =
  | { art: "ingen" }
  | { art: "henter" }
  | { art: "citat"; besked: SvarBesked; uddrag: string }
  | { art: "slettet" };

/** Ren tekst, én linje, højst SVAR_UDDRAG_MAKS tegn. Tom besked → «📎» (vedhæftning uden tekst, som panerne sender). */
export function svarUddrag(content: string | null | undefined): string {
  const tekst = renTekst(content).replace(/\s+/g, " ").trim();
  if (tekst === "" || tekst === "📎") return "📎 Vedhæftning";
  if (tekst.length <= SVAR_UDDRAG_MAKS) return tekst;
  return `${tekst.slice(0, SVAR_UDDRAG_MAKS - 1).trimEnd()}…`;
}

/** Kun rigtige samtalebeskeder kan besvares — samme regel som triggeren protect_message_svar_paa. */
export function kanBesvares(msg: Pick<SvarBesked, "message_type" | "context_type">): boolean {
  const type = msg.message_type ?? "user";
  return type === "user" && msg.context_type !== "session_prep";
}

/**
 * Citatets tilstand.
 *  - svarPaaId null/undefined → ingen.
 *  - Originalen i visningen → citat.
 *  - Ellers: hentet === undefined → henter; hentet === null → slettet; ellers citat.
 */
export function citatTilstand(input: {
  svarPaaId: string | null | undefined;
  beskeder: readonly SvarBesked[];
  /** Resultatet af opslaget på id: undefined = ikke slået op endnu; null = nul rækker. */
  hentet?: SvarBesked | null;
}): CitatTilstand {
  if (!input.svarPaaId) return { art: "ingen" };
  const iVisningen = input.beskeder.find((b) => b.id === input.svarPaaId);
  if (iVisningen) return { art: "citat", besked: iVisningen, uddrag: svarUddrag(iVisningen.content) };
  if (input.hentet === undefined) return { art: "henter" };
  if (input.hentet === null) return { art: "slettet" };
  return { art: "citat", besked: input.hentet, uddrag: svarUddrag(input.hentet.content) };
}

/** Linjen over sendefeltet: «Svarer på Morten: Har du set tallene for juli?» */
export function svarerPaaTekst(navn: string | null | undefined, uddrag: string): string {
  return `Svarer på ${navn && navn.trim() !== "" ? navn : "beskeden"}: ${uddrag}`;
}
