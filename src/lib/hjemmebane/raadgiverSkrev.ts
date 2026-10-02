/**
 * src/lib/hjemmebane/raadgiverSkrev.ts
 *
 * «En rådgiver har lige skrevet til dig» (Jonas 1/10 09:20: «måske man
 * kunne markere tydeligt for det online medlem, at en rådgiver lige har
 * skrevet (ikke mail), når det sker. For det giver real time interaktion.
 * Men det er jo vigtigt de ser vi skriver så.»). Ren dom, ingen React,
 * ingen Supabase — testet i __tests__/raadgiverSkrev.test.ts. Lytningen bor
 * i src/hooks/raadgiverSkrev.ts, banneret i HbRaadgiverSkrev (monteret af
 * HbMemberShell).
 *
 * KANALEN (målt i koden 1/10): medlemmets klient får nye chatbeskeder over
 * Supabase Realtime postgres_changes på `messages` — MemberChatPane lytter
 * med filteret conversation_id=eq.<aktiv samtale>, men KUN mens /chat er
 * åben; Hb-skallen havde ingen lytning på beskeder (klokken lytter på
 * `notifications`, ikke `messages`). Banneret bruger SAMME mekanisme (INSERT
 * på messages, RLS afgør hvad medlemmet modtager) med filteret
 * conversation_id=in.(medlemmets samtaler). Ingen mail, ingen ny
 * notifikationstype, intet skrives — og intet markeres læst (banneret er
 * ikke chatten; tjenestekontoen er rådgiver og monterer det aldrig).
 *
 * DOMMEN — vises banneret? Kun når ALT holder:
 *   - beskeden er en menneskelig besked (message_type "user") — system- og
 *     AI-beskeder aldrig;
 *   - afsenderen er IKKE medlemmet selv;
 *   - afsenderen ER rådgiver (get_conversation_sender_profiles.is_advisor) —
 *     en kollega i samme virksomhed giver intet banner; ukendt (null) =
 *     intet banner (fail-closed: hellere ét for lidt end et forkert navn);
 *   - medlemmet står IKKE i chatten (/chat) — dér ser de beskeden selv.
 */

import { renTekst } from "@/lib/hjemmebane/richtext";

/** Uddragets loft i tegn (ren tekst, «…» medregnet). */
export const UDDRAG_LOFT = 80;
/** Banneret står så længe, medmindre det lukkes eller åbnes. */
export const BANNER_VARIGHED_MS = 20_000;
export const CHAT_STI_MEDLEM = "/chat";
export const AABN_CHATTEN = "Åbn chatten";

export interface NyBesked {
  id: string;
  sender_id: string;
  message_type: string | null;
  content: string | null;
}

export interface VisDomInput {
  besked: NyBesked;
  egenId: string;
  /** Afsenderen er rådgiver (true), ikke (false), ukendt (null). */
  afsenderErRaadgiver: boolean | null;
  /** Medlemmets nuværende sti (location.pathname). */
  sti: string;
}

/** Står medlemmet i chatten? /chat og alt under den. */
export function staarIChatten(sti: string): boolean {
  return sti === CHAT_STI_MEDLEM || sti.startsWith(`${CHAT_STI_MEDLEM}/`);
}

/** Kan beskeden overhovedet komme på tale (før afsenderen slås op)? */
export function erKandidat(besked: NyBesked, egenId: string): boolean {
  return besked.message_type === "user" && !!besked.sender_id && besked.sender_id !== egenId;
}

export function skalViseBanner(i: VisDomInput): boolean {
  if (!erKandidat(i.besked, i.egenId)) return false;
  if (i.afsenderErRaadgiver !== true) return false;
  return !staarIChatten(i.sti);
}

/** Ren tekst af beskeden (husets renTekst: HTML fra Tiptap → tekst), højst UDDRAG_LOFT tegn. */
export function beskedUddrag(content: string | null | undefined, loft: number = UDDRAG_LOFT): string {
  const tekst = renTekst(content);
  if (tekst.length <= loft) return tekst;
  return `${tekst.slice(0, loft - 1).trimEnd()}…`;
}

/** «{Rådgivernavn} har lige skrevet til dig». */
export function bannerTitel(navn: string | null | undefined): string {
  const n = navn?.trim();
  return `${n || "Din rådgiver"} har lige skrevet til dig`;
}

/** Realtime-filteret for medlemmets samtaler; null uden samtaler (ingen lytning). */
export function samtaleFilter(ids: readonly string[]): string | null {
  const rene = [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].sort();
  return rene.length === 0 ? null : `conversation_id=in.(${rene.join(",")})`;
}
