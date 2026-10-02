/**
 * src/lib/chatSkrivevej.ts — medlemmets skrivevej til chatten, ÉT sted
 * (2/10-2026 eftermiddag, «forsidens to sidste kort»).
 *
 * Indsættelsen stod før inline to gange i MemberChatPane (handleSend og
 * «Prøv igen»). Forsidens «Din rådgiver»-kort skal sende gennem PRÆCIS samme
 * vej — derfor er indsættelsen trukket ud hertil, uændret: samme tabel, samme
 * `insert(raekke).select().single()`, samme fangst af en kastet fejl som
 * `{ data: null, error }` (så sendeUdfald dømmer den som «fejlet», aldrig
 * tavs). Kalderen bygger rækken (conversation_id, sender_id, content, …) og
 * kalder selv notifyChatMessage(id) ved «sendt» — som før; panelets
 * rækkefølge (ryd svar/chip FØR notify) er låst af noegletalChip.guard.
 *
 * Kildeværn: forsideKort.guard (dom 5 — den ENESTE insert i messages fra
 * medlemmets chat og forsidekortet står her), chatSendefejl.test og
 * chatHenvisningFlade.guard (panelet kalder indsaetChatBesked).
 */
import { supabase } from "@/integrations/supabase/client";

export type ChatBeskedRaekke = { conversation_id: string; sender_id: string; content?: string | null } & Record<string, unknown>;

export interface IndsaetSvar {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  error: unknown;
}

export async function indsaetChatBesked(raekke: ChatBeskedRaekke): Promise<IndsaetSvar> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase.from("messages").insert(raekke as any).select().single()
    .then((r) => r as IndsaetSvar, (e: unknown) => ({ data: null, error: e }));
}
