/**
 * src/lib/hjemmebane/gemEventOgVaerter.ts — rækkefølgen når admin gemmer et
 * event og dets værter (EventEditor's «Gem»).
 *
 * FEJL I DRIFT 17/9-2026 14:05 (Jonas): Admin → Events → «Konkret case med
 * fokus på marketing (Livja.dk)» → Morten som vært → Gem → «Elementet findes
 * ikke længere — genindlæs siden». Målt i prod 14:06: eventet uændret, 0
 * rækker i event_vaerter. Årsag: mutationFn kørte updateEvent(event.id, {})
 * FØRST når kun værterne var ændret (PR 4b lod dirty tælle vaerterDraft), og
 * UPDATE … RETURNING med tom patch rammer 0 rækker → throwIfMissing kaster
 * → saveVaerter nåede aldrig at køre.
 *
 * DOMMEN (ren — ingen React, ingen Supabase; kaldene gives ind):
 *   - eventet gemmes KUN når patchen har mindst ét felt (samme regel som
 *     publicér-vejen og ItemEditor's «Tom patch = intet at gemme»);
 *   - værterne gemmes KUN når de er ændret;
 *   - begge: eventet først, så værterne (fejl i eventet stopper før værterne);
 *   - ingen af delene: intet kald.
 * Testet i __tests__/gemEventOgVaerter.test.ts; kildeværn
 * src/lib/__tests__/eventVaerter.guard.test.ts (dom 6).
 */

export interface GemEventOgVaerterInput<T> {
  /** Event-udkastet som det sendes til UPDATE — tomt objekt = intet at gemme. */
  patch: Record<string, unknown>;
  /** Er værtslisten rørt (vaerterDraft !== null)? */
  vaerterAendret: boolean;
  gemEvent: () => Promise<T>;
  gemVaerter: () => Promise<void>;
}

/** Den gemte eventrække, eller null når eventet ikke blev gemt. */
export async function gemEventOgVaerter<T>(input: GemEventOgVaerterInput<T>): Promise<T | null> {
  const row = Object.keys(input.patch).length > 0 ? await input.gemEvent() : null;
  if (input.vaerterAendret) await input.gemVaerter();
  return row;
}
