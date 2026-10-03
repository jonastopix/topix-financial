/**
 * src/lib/chatVedhaeftningSletning.ts — hvilke filer i `chat-attachments`
 * en slettet besked tager med sig (3/10-2026, kort a29-vedhaeftning-slettes-ikke).
 *
 * FØR: useMessageActions.deleteMessage slettede beskedens række (og en
 * chatvideo hos Bunny), men filerne lå tilbage i bucket'en, til medlemmet
 * blev hard-slettet (slet-medlemsdata-cron). Målt i prod 3/10: 63 filer i
 * bucket'en, 59 referencer i 41 beskeder — 4 filer uden besked allerede.
 *
 * REGLEN (ren, fail-closed):
 *   · kun referencer fra den slettede beskeds context_meta.attachments
 *     (begge former, læst af husets vedhaeftningsSti),
 *   · kun stier i AFSENDERENS egen mappe (stiTilhoererAfsender) — samme
 *     ejerskab som storage-politikken «Users can delete own chat
 *     attachments» ((storage.foldername(name))[1] = auth.uid()); kun
 *     afsenderen kan slette sin besked (kanSletteBesked), så kalderen
 *     giver sin egen id,
 *   · hver sti én gang.
 * Målt 3/10: 0 referencer står i mere end én besked, og 0 ligger uden for
 * afsenderens mappe — en sletning kan derfor ikke tage en fil, en anden
 * besked bruger. Ren: ingen Supabase.
 */
import { stiTilhoererAfsender, vedhaeftningsSti } from "./chatVedhaeftningSti";

export function vedhaeftningerAtSlette(contextMeta: unknown, afsenderId: string | null | undefined): string[] {
  if (!afsenderId || !contextMeta || typeof contextMeta !== "object") return [];
  const liste = (contextMeta as { attachments?: unknown }).attachments;
  if (!Array.isArray(liste)) return [];
  const ud = new Set<string>();
  for (const att of liste) {
    if (!att || typeof att !== "object") continue;
    const dom = vedhaeftningsSti(att as { url?: unknown; path?: unknown });
    if (dom.ok && stiTilhoererAfsender(dom.sti, afsenderId)) ud.add(dom.sti);
  }
  return [...ud];
}
